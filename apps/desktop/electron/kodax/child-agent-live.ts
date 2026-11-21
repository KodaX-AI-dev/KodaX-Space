// Folds the SDK's live-only child stream events into one "what is each child doing now" entry
// per running child agent. The SDK view's own child summary keeps only the latest text chunk and
// stops showing thinking after the first tool, so Main keeps this fuller state itself.

import type { AgentChildLiveT } from '@kodax-space/space-ipc-schema';
import { isTransientChildEvent, type ChildMeta } from './workflow-activity.js';

const THINKING_TAIL = 400;
const INPUT_VALUE_LIMIT = 240;
const ROOT_TERMINAL = new Set(['run.completed', 'run.failed', 'run.cancelled']);

interface ChildEvent {
  readonly type: string;
  readonly payload: unknown;
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Short string fields only: enough to name a target, never file bodies. */
function displayInput(input: unknown): Record<string, string> | undefined {
  const fields = Object.entries(record(input) ?? {}).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].length <= INPUT_VALUE_LIMIT,
  );
  return fields.length > 0 ? Object.fromEntries(fields) : undefined;
}

function nextChild(
  base: AgentChildLiveT,
  event: ChildEvent,
  now: number,
): AgentChildLiveT | null | undefined {
  const payload = record(event.payload);
  if (event.type === 'child_activity.finished') return null;
  if (event.type === 'thinking.delta' || event.type === 'assistant.delta') {
    if (typeof payload?.text !== 'string' || !payload.text) return undefined;
    const thinking = `${base.thinking ?? ''}${payload.text}`.slice(-THINKING_TAIL);
    return { ...base, thinking };
  }
  if (event.type === 'tool.started') {
    const tool = record(payload?.tool);
    if (typeof tool?.id !== 'string' || typeof tool.name !== 'string') return undefined;
    const input = displayInput(tool.input);
    const { thinking: _restart, ...rest } = base;
    return {
      ...rest,
      tool: {
        id: tool.id,
        name: tool.name,
        ...(input ? { input } : {}),
        status: 'running',
        startedAt: now,
      },
    };
  }
  if (event.type === 'tool.finished') {
    const result = record(payload?.result);
    if (!base.tool || result?.id !== base.tool.id) return undefined;
    const failed = record(result.toolResult)?.is_error === true;
    return { ...base, tool: { ...base.tool, status: failed ? 'failed' : 'done' } };
  }
  return undefined;
}

const count = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** A child's finished step adds its usage to the child it reports under. */
function addStepTokens(
  children: readonly AgentChildLiveT[],
  info: Readonly<Record<string, unknown>> | undefined,
): AgentChildLiveT[] | undefined {
  const usage = record(info?.usage);
  if (info?.contextKind !== 'child' || !usage) return undefined;
  const index = children.findIndex((child) => (child.agentId ?? child.id) === info.agentId);
  if (index < 0) return undefined;
  const child = children[index]!;
  const up =
    count(usage.inputTokens) + count(usage.cachedReadTokens) + count(usage.cachedWriteTokens);
  const tokens = {
    up: (child.tokens?.up ?? 0) + up,
    down: (child.tokens?.down ?? 0) + count(usage.outputTokens),
  };
  return children.map((entry, at) => (at === index ? { ...child, tokens } : entry));
}

/** Returns the new child list, or undefined when the event changes nothing. */
export function reduceChildAgentLive(
  children: readonly AgentChildLiveT[],
  event: ChildEvent,
  now: number,
): AgentChildLiveT[] | undefined {
  const payload = record(event.payload);
  if (event.type === 'run.progress' && payload?.kind === 'iteration_end') {
    return addStepTokens(children, record(payload.info));
  }
  const meta = record(payload?.meta) as ChildMeta;
  if (!isTransientChildEvent(meta)) {
    return ROOT_TERMINAL.has(event.type) && children.length > 0 ? [] : undefined;
  }
  const id = meta?.childAgentId ?? meta?.workflowCorrelation?.childAgentId;
  if (!id) return undefined;
  const index = children.findIndex((child) => child.id === id);
  const base = children[index] ?? {
    id,
    label: meta?.childAgentName ?? id,
    startedAt: now,
    ...(meta?.agentId ? { agentId: meta.agentId } : {}),
  };
  const next = nextChild(base, event, now);
  if (next === undefined) return undefined;
  if (next === null) return index < 0 ? undefined : children.filter((_, at) => at !== index);
  return index < 0
    ? [...children, next]
    : children.map((child, at) => (at === index ? next : child));
}
