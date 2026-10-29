import { getDiagnosticsLogger } from '../diagnostics/runtime.js';

/** Opt in with `KODAX_SPACE_RUNTIME_STARTUP_DEBUG=1`; every other value is disabled. */
export const RUNTIME_STARTUP_DEBUG_ENV = 'KODAX_SPACE_RUNTIME_STARTUP_DEBUG';

export type RuntimeStartupTimingPhase = 'start' | 'complete' | 'failed' | 'skipped';

export interface RuntimeStartupTimingEvent {
  readonly attemptId: string;
  readonly scope: string;
  readonly stage: string;
  readonly phase: RuntimeStartupTimingPhase;
  readonly stepMs: number;
  readonly totalMs: number;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface RuntimeStartupTimingRecorder {
  readonly enabled: boolean;
  mark(
    stage: string,
    phase?: RuntimeStartupTimingPhase,
    data?: Readonly<Record<string, unknown>>,
  ): void;
}

export type RuntimeStartupTimingSink = (event: RuntimeStartupTimingEvent) => void;
export type RuntimeStartupTimingFactory = (scope: string) => RuntimeStartupTimingRecorder;

interface RuntimeStartupTimingOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly now?: () => number;
  readonly sink?: RuntimeStartupTimingSink;
  readonly attemptId?: string;
  /** Keep a bounded timeline and log it only on failure or a startup over ten seconds. */
  readonly reportSlowOrFailed?: boolean;
}

let nextAttempt = 0;

export function isRuntimeStartupDebugEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env[RUNTIME_STARTUP_DEBUG_ENV] === '1';
}

function roundedDuration(value: number): number {
  return Math.round(Math.max(0, value) * 1_000) / 1_000;
}

function defaultSink(event: RuntimeStartupTimingEvent): void {
  getDiagnosticsLogger()?.debug('runtime-startup', 'stage_timing', undefined, event);
}

function defaultProblemSink(event: RuntimeStartupTimingEvent): void {
  getDiagnosticsLogger()?.info('runtime-startup', 'stage_timing', undefined, event);
}

function retainStartupTiming(
  pending: RuntimeStartupTimingEvent[],
  event: RuntimeStartupTimingEvent,
  sink: RuntimeStartupTimingSink,
): void {
  if (pending.length === 32) pending.splice(1, 1);
  pending.push(event);
  const finished =
    event.phase === 'failed' ||
    event.phase === 'skipped' ||
    (event.phase === 'complete' && (event.stage === 'initialize' || event.stage === 'reconcile'));
  if (!finished) return;
  if (event.phase === 'failed' || event.totalMs >= 10_000) pending.forEach(sink);
  pending.length = 0;
}

export function createRuntimeStartupTiming(
  scope: string,
  options: RuntimeStartupTimingOptions = {},
): RuntimeStartupTimingRecorder {
  const debug = isRuntimeStartupDebugEnabled(options.env);
  const retained = !debug && options.reportSlowOrFailed === true;
  if (!debug && !retained) {
    return {
      enabled: false,
      mark: () => undefined,
    };
  }

  const now = options.now ?? (() => Number(process.hrtime.bigint()) / 1_000_000);
  const sink = options.sink ?? (retained ? defaultProblemSink : defaultSink);
  const pending: RuntimeStartupTimingEvent[] = [];
  const attemptId =
    options.attemptId ?? `${scope}-${process.pid}-${String(++nextAttempt).padStart(3, '0')}`;
  const startedAt = now();
  let previousAt = startedAt;

  return {
    enabled: true,
    mark(stage, phase = 'complete', data) {
      const currentAt = now();
      try {
        const event: RuntimeStartupTimingEvent = {
          attemptId,
          scope,
          stage,
          phase,
          stepMs: roundedDuration(currentAt - previousAt),
          totalMs: roundedDuration(currentAt - startedAt),
          ...(data === undefined ? {} : { data }),
        };
        if (retained) retainStartupTiming(pending, event, sink);
        else sink(event);
      } catch {
        // Diagnostics must never make Runtime startup fail or slow its recovery path.
      }
      previousAt = currentAt;
    },
  };
}
