// activityStatus — how the spinner reads a status token, and the Run's token totals.
//
// Status tokens are the English strings the snapshot selectors produce. They are translated here,
// and split into three kinds so the spinner can step back while the live group shows the work:
//   work  — what the live tool group / thinking chip already shows (Thinking, Running bash…)
//   phase — a Run phase the live group does not show (queued, waiting, stopping, compacting…)
//   task  — the active todo's own wording, always kept

import type { SessionEvent } from '@kodax-space/space-ipc-schema';
import type { MessageKey } from '../i18n/messages.js';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;
export type ActivityStatusKind = 'work' | 'phase' | 'task';

const WORK_KEYS: Readonly<Record<string, MessageKey>> = {
  'Thinking…': 'activity.thinking',
  'Writing…': 'activity.writing',
  'Working…': 'activity.working',
  'Processing result…': 'activity.processingResult',
};

const PHASE_KEYS: Readonly<Record<string, MessageKey>> = {
  'Sending…': 'activity.sending',
  'Queued…': 'activity.queued',
  'Waiting for permission…': 'activity.waitingPermission',
  'Waiting for input…': 'activity.waitingInput',
  'Waiting for agents…': 'activity.waitingAgents',
  'Waiting for context capacity…': 'activity.waitingCapacity',
  'Waiting for Space…': 'activity.waitingSpace',
  'Recovering…': 'activity.recovering',
  'Recovering saved progress…': 'activity.savedRecovery',
  'Compacting context…': 'activity.compactingContext',
  'Verifying…': 'activity.verifying',
  'Finalizing…': 'activity.finalizing',
  'Stopping…': 'activity.stopping',
  'Stopping and repairing run state…': 'activity.stoppingRepair',
  'Stop status unknown…': 'taskDock.runUnconfirmed',
  'Run status unknown…': 'taskDock.runUnconfirmed',
};

const AGENT_COUNT = /^Waiting for (\d+) agents?…$/;
const TOOL_STATUS = /^(Running|Receiving) (.+)…$/;

export function activityStatusKind(status: string): ActivityStatusKind {
  if (WORK_KEYS[status] || TOOL_STATUS.test(status)) return 'work';
  if (PHASE_KEYS[status] || AGENT_COUNT.test(status)) return 'phase';
  return 'task';
}

export function activityStatusText(status: string, sendingTooLong: boolean, t: Translate): string {
  if (sendingTooLong) return t('activity.sendingWaiting');
  const key = WORK_KEYS[status] ?? PHASE_KEYS[status];
  if (key) return t(key);
  const agents = AGENT_COUNT.exec(status);
  if (agents) return t('activity.waitingAgentCount', { count: Number(agents[1]) });
  const tool = TOOL_STATUS.exec(status);
  if (tool)
    return t(tool[1] === 'Running' ? 'activity.runningTool' : 'activity.receivingTool', {
      tool: tool[2]!,
    });
  return status;
}

export interface RunTokenTotals {
  /** Model input, cache reads and writes included. */
  readonly up: number;
  /** Model output. */
  readonly down: number;
}

/** Sum the root steps' reported usage for one Run (child agents keep their own counts). */
export function runTokenTotals(
  events: readonly SessionEvent[],
  runId: string,
): RunTokenTotals | undefined {
  let up = 0;
  let down = 0;
  let seen = false;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (event.kind !== 'iteration_end') continue;
    if (event.contextKind === 'child' || event.runtimeEvent?.runId !== runId || !event.usage)
      continue;
    const usage = event.usage;
    up +=
      (usage.inputTokens ?? 0) +
      (usage.cacheReadInputTokens ?? 0) +
      (usage.cacheWriteInputTokens ?? 0);
    down += usage.outputTokens ?? 0;
    seen = true;
  }
  return seen ? { up, down } : undefined;
}
