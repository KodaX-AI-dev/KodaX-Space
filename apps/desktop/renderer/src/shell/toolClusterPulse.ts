// toolClusterPulse — pure projections behind the live "运行了 N 个命令" group.
//
// While a run is working, the tail tool group shows a three-row action feed, the latest
// thinking line and a beat strip (one bar per finished tool: colour = tool family, height =
// duration). The strip stays frozen on the settled group. Design record:
// docs/design/live-work-motion/direction-approved.md

export interface PulseTool {
  readonly id: string;
  readonly toolName: string;
  readonly status: 'running' | 'done' | 'interrupted';
  readonly input?: Record<string, unknown>;
  readonly startedAt?: number;
  readonly endedAt?: number;
}

export interface PulseStep {
  readonly thinking?: string;
  readonly productItem?: { readonly timestamp?: number };
}

export type BeatTone = 'info' | 'accent' | 'run' | 'muted';

export interface Beat {
  readonly id: string;
  readonly tone: BeatTone;
  /** Bar height in px. */
  readonly height: number;
}

export interface LiveToolRow {
  readonly id: string;
  readonly name: string;
  readonly target: string;
  readonly status: PulseTool['status'];
  readonly durationMs?: number;
}

export const BEAT_LIMIT = 12;
/** Three visible rows plus the one fading out above them while the list pushes up. */
export const LIVE_ROW_LIMIT = 4;
const BEAT_MIN_PX = 5;
const BEAT_MAX_PX = 16;
const BEAT_UNTIMED_PX = 10;
const TEXT_LIMIT = 80;

const BEAT_TONES: Readonly<Record<string, BeatTone>> = {
  read: 'info',
  grep: 'info',
  glob: 'info',
  ls: 'info',
  write: 'accent',
  edit: 'accent',
  multi_edit: 'accent',
  str_replace: 'accent',
  insert_after_anchor: 'accent',
  bash: 'run',
};

const TARGET_KEYS = ['file_path', 'path', 'file', 'pattern', 'command', 'query', 'url'] as const;

function durationOf(tool: PulseTool, now?: number): number | undefined {
  if (tool.startedAt === undefined) return undefined;
  const end = tool.status === 'running' ? now : tool.endedAt;
  return end === undefined ? undefined : Math.max(0, end - tool.startedAt);
}

/** 100ms → shortest bar, ≥3.2s → tallest, on a log scale so quick tools stay distinguishable. */
function beatHeight(durationMs: number | undefined): number {
  if (durationMs === undefined) return BEAT_UNTIMED_PX;
  const ratio = Math.min(1, Math.max(0, Math.log2(Math.max(1, durationMs) / 100) / 5));
  return Math.round(BEAT_MIN_PX + (BEAT_MAX_PX - BEAT_MIN_PX) * ratio);
}

export function toolBeats(tools: readonly PulseTool[]): Beat[] {
  return tools
    .filter((tool) => tool.status !== 'running')
    .slice(-BEAT_LIMIT)
    .map((tool) => ({
      id: tool.id,
      tone: BEAT_TONES[tool.toolName] ?? 'muted',
      height: beatHeight(durationOf(tool)),
    }));
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function toolTarget(input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  const key = TARGET_KEYS.find((candidate) => typeof input[candidate] === 'string');
  if (!key) return '';
  const value = oneLine(input[key] as string);
  return value.length > TEXT_LIMIT ? `${value.slice(0, TEXT_LIMIT)}…` : value;
}

export function liveToolRows(tools: readonly PulseTool[], now: number): LiveToolRow[] {
  return tools.slice(-LIVE_ROW_LIMIT).map((tool) => ({
    id: tool.id,
    name: tool.toolName,
    target: toolTarget(tool.input),
    status: tool.status,
    durationMs: durationOf(tool, now),
  }));
}

export function thinkingTail(thinking: string | undefined): string {
  const line = (thinking ?? '')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) return '';
  return line.length > TEXT_LIMIT ? `…${line.slice(-TEXT_LIMIT)}` : line;
}

export function clusterStartedAt(
  steps: readonly PulseStep[],
  tools: readonly PulseTool[],
): number | undefined {
  const starts = [
    ...steps.map((step) => step.productItem?.timestamp),
    ...tools.map((tool) => tool.startedAt),
  ].filter((value): value is number => value !== undefined);
  return starts.length > 0 ? Math.min(...starts) : undefined;
}

/** Same estimate as the activity spinner: ASCII 4 chars ≈ 1 token, other chars ≈ 1 token. */
export function clusterOutputTokens(
  steps: readonly PulseStep[],
  tools: readonly PulseTool[],
): number {
  let ascii = 0;
  let other = 0;
  const tally = (text: string): void => {
    for (let index = 0; index < text.length; index++) {
      if (text.charCodeAt(index) < 128) ascii++;
      else other++;
    }
  };
  for (const step of steps) tally(step.thinking ?? '');
  for (const tool of tools) if (tool.input) tally(JSON.stringify(tool.input));
  return Math.round(ascii / 4 + other);
}
