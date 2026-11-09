/**
 * Saved-history load split (F144 ticket 1): IPC round trip → store install → React commit →
 * forced layout → first painted frame. Every phase becomes a `kodax.history.<phase>`
 * performance measure (DevTools/Playwright readable) and the finished split is one debug
 * diagnostics record. Cost per load is a few timestamps, one microtask and one frame wait.
 */
export const HISTORY_LOAD_MEASURE_PREFIX = 'kodax.history.';
const PHASES = ['ipc', 'install', 'commit', 'layout', 'paint'] as const;
const MAX_RETAINED_LOADS = 256;

export type HistoryLoadKind = 'newest' | 'older' | 'newer' | 'around';

export interface HistoryLoadSplit {
  readonly seq: number;
  readonly kind: HistoryLoadKind;
  readonly items: number;
  readonly roundTrips: number;
  readonly ipcMs: number;
  readonly installMs: number;
  readonly commitMs: number;
  readonly layoutMs: number;
  readonly paintMs: number;
}

export interface HistoryLoadEnvironment {
  now(): number;
  /** Runs after the synchronous React commit already scheduled by the store install. */
  afterCommit(callback: () => void): void;
  forceLayout(): void;
  /** Runs once the next frame has been rendered. */
  afterPaint(callback: () => void): void;
  report(split: HistoryLoadSplit): void;
}

const browserEnvironment: HistoryLoadEnvironment = {
  now: () => performance.now(),
  // useSyncExternalStore installs render in SyncLane; React queues that render as a microtask
  // during the store notification, so a microtask queued afterwards observes the commit.
  afterCommit: (callback) => queueMicrotask(callback),
  forceLayout: () => void document.body.offsetHeight,
  afterPaint: (callback) => requestAnimationFrame(() => setTimeout(callback, 0)),
  report: (split) => {
    const bridge = window.kodaxSpace;
    if (!bridge) return;
    const { seq, ...context } = split;
    void bridge
      .invoke('diagnostics.report', {
        level: 'debug',
        component: 'shell',
        event: 'history.load',
        context: { seq, ...context },
      })
      .then((result) => {
        if (!result.ok) console.warn('[history.load] diagnostics report rejected', result.error);
      })
      .catch((error: unknown) => console.warn('[history.load] diagnostics report failed', error));
  },
};

let sequence = 0;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function record(
  env: HistoryLoadEnvironment,
  base: Pick<HistoryLoadSplit, 'kind' | 'items' | 'roundTrips'>,
  times: readonly number[],
): void {
  const seq = ++sequence;
  if (seq % MAX_RETAINED_LOADS === 0)
    for (const phase of PHASES) performance.clearMeasures(HISTORY_LOAD_MEASURE_PREFIX + phase);
  const detail = { seq, ...base };
  const durations = PHASES.map((phase, index) => {
    performance.measure(HISTORY_LOAD_MEASURE_PREFIX + phase, {
      start: times[index]!,
      end: times[index + 1]!,
      detail,
    });
    return round(times[index + 1]! - times[index]!);
  });
  const [ipcMs, installMs, commitMs, layoutMs, paintMs] = durations as [
    number,
    number,
    number,
    number,
    number,
  ];
  env.report({ ...detail, ipcMs, installMs, commitMs, layoutMs, paintMs });
}

export function startHistoryLoadTrace(
  kind: HistoryLoadKind,
  env: HistoryLoadEnvironment = browserEnvironment,
): { received(): void; installed(items: number): void } {
  const requestedAt = env.now();
  let receivedAt: number | undefined;
  let roundTrips = 0;
  let done = false;
  return {
    received() {
      receivedAt = env.now();
      roundTrips += 1;
    },
    installed(items) {
      if (receivedAt === undefined || done) return;
      done = true;
      const times = [requestedAt, receivedAt, env.now()];
      env.afterCommit(() => {
        times.push(env.now());
        env.forceLayout();
        times.push(env.now());
        env.afterPaint(() => {
          times.push(env.now());
          record(env, { kind, items, roundTrips }, times);
        });
      });
    },
  };
}
