// toolClusterPulse — pure projections behind the live "运行了 N 个命令" group.
//
// While a run is working, the tail tool group shows a three-row action feed, the latest
// thinking line and per-family tallies (count + total time; the running family keeps counting
// up). The tallies stay on the settled group. Design record:
// docs/design/live-work-motion/direction-approved.md

export interface PulseTool {
  readonly id: string;
  readonly toolName: string;
  readonly status: 'running' | 'done' | 'interrupted';
  /** The tool finished with an error result. */
  readonly failed?: boolean;
  readonly input?: Record<string, unknown>;
  readonly startedAt?: number;
  readonly endedAt?: number;
}

export interface PulseStep {
  readonly thinking?: string;
  readonly productItem?: { readonly timestamp?: number };
}

export type ToolFamily = 'read' | 'edit' | 'run' | 'other' | 'fail';

export interface FamilyTally {
  readonly family: ToolFamily;
  readonly count: number;
  /** Summed measured time; absent when no tool of the family carries timing. */
  readonly durationMs?: number;
  /** A tool of this family is still running, so its time is counting up. */
  readonly running: boolean;
}

export interface LiveToolRow {
  readonly id: string;
  readonly name: string;
  readonly target: string;
  readonly status: PulseTool['status'];
  readonly durationMs?: number;
}

/** Three visible rows plus the one fading out above them while the list pushes up. */
export const LIVE_ROW_LIMIT = 4;
const TEXT_LIMIT = 80;

const FAMILY_ORDER: readonly ToolFamily[] = ['read', 'edit', 'run', 'other', 'fail'];
const TOOL_FAMILIES: Readonly<Record<string, ToolFamily>> = {
  read: 'read',
  grep: 'read',
  glob: 'read',
  ls: 'read',
  write: 'edit',
  edit: 'edit',
  multi_edit: 'edit',
  str_replace: 'edit',
  insert_after_anchor: 'edit',
  bash: 'run',
};

const TARGET_KEYS = ['file_path', 'path', 'file', 'pattern', 'command', 'query', 'url'] as const;

function durationOf(tool: PulseTool, now?: number): number | undefined {
  if (tool.startedAt === undefined) return undefined;
  const end = tool.status === 'running' ? now : tool.endedAt;
  return end === undefined ? undefined : Math.max(0, end - tool.startedAt);
}

function toolFamily(tool: PulseTool): ToolFamily {
  return tool.failed ? 'fail' : (TOOL_FAMILIES[tool.toolName] ?? 'other');
}

export function familyTallies(tools: readonly PulseTool[], now?: number): FamilyTally[] {
  return FAMILY_ORDER.flatMap((family) => {
    const members = tools.filter((tool) => toolFamily(tool) === family);
    if (members.length === 0) return [];
    const durations = members
      .map((tool) => durationOf(tool, now))
      .filter((value): value is number => value !== undefined);
    return [
      {
        family,
        count: members.length,
        ...(durations.length > 0
          ? { durationMs: durations.reduce((sum, value) => sum + value, 0) }
          : {}),
        running: members.some((tool) => tool.status === 'running'),
      },
    ];
  });
}

/**
 * At most two units (2.4s · 42s · 3m07s · 1h05m). Running values tick once per second, so they
 * drop the tenths and keep seconds even past an hour (1h05m07s) to stay visibly alive.
 */
export function formatPulseDuration(ms: number, running: boolean): string {
  const sec = ms / 1_000;
  if (sec < 10 && !running) return `${sec.toFixed(1)}s`;
  const whole = Math.floor(sec);
  if (whole < 60) return `${whole}s`;
  const pad = (value: number): string => String(value).padStart(2, '0');
  if (whole < 3_600) return `${Math.floor(whole / 60)}m${pad(whole % 60)}s`;
  const hours = `${Math.floor(whole / 3_600)}h${pad(Math.floor(whole / 60) % 60)}m`;
  return running ? `${hours}${pad(whole % 60)}s` : hours;
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
