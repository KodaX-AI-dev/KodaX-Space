// childAgentRows — one live row per running child agent under the bottom spinner.
// A child shows what it is doing now: its latest thinking line, or its current tool and target.

import type { AgentChildLiveT } from '@kodax-space/space-ipc-schema';
import { liveToolRows } from './toolClusterPulse.js';

export const CHILD_ROW_LIMIT = 3;

export interface ChildAgentRow {
  readonly id: string;
  readonly name: string;
  readonly mode: 'thinking' | 'tool';
  readonly tool?: string;
  readonly text: string;
  readonly status?: 'running' | 'done' | 'failed';
  readonly elapsedMs: number;
}

function lastLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? ''
  );
}

function childRow(child: AgentChildLiveT, now: number): ChildAgentRow {
  const base = {
    id: child.id,
    name: child.label.split('/').filter(Boolean).at(-1) ?? child.label,
    elapsedMs: Math.max(0, now - child.startedAt),
  };
  // Main clears thinking when a tool starts, so thinking present means it is newer than the tool.
  if (child.thinking || !child.tool) {
    return { ...base, mode: 'thinking', text: lastLine(child.thinking ?? '') };
  }
  const { tool } = child;
  const [row] = liveToolRows(
    [
      {
        id: tool.id,
        toolName: tool.name,
        status: tool.status === 'running' ? 'running' : 'done',
        failed: tool.status === 'failed',
        ...(tool.input ? { input: tool.input } : {}),
      },
    ],
    now,
  );
  return { ...base, mode: 'tool', tool: row!.name, text: row!.target, status: tool.status };
}

export function childAgentRows(
  children: readonly AgentChildLiveT[],
  now: number,
): { rows: ChildAgentRow[]; overflow: number } {
  return {
    rows: children.slice(0, CHILD_ROW_LIMIT).map((child) => childRow(child, now)),
    overflow: Math.max(0, children.length - CHILD_ROW_LIMIT),
  };
}
