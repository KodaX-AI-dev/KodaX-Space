import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RUNTIME_STARTUP_DEBUG_ENV,
  createRuntimeStartupTiming,
  isRuntimeStartupDebugEnabled,
  type RuntimeStartupTimingEvent,
} from '../kodax/runtime-startup-timing.js';

test('Runtime startup timing is disabled unless its explicit debug switch is exactly 1', () => {
  assert.equal(isRuntimeStartupDebugEnabled({}), false);
  assert.equal(isRuntimeStartupDebugEnabled({ [RUNTIME_STARTUP_DEBUG_ENV]: '0' }), false);
  assert.equal(isRuntimeStartupDebugEnabled({ [RUNTIME_STARTUP_DEBUG_ENV]: 'true' }), false);
  assert.equal(isRuntimeStartupDebugEnabled({ [RUNTIME_STARTUP_DEBUG_ENV]: '1 ' }), false);
  assert.equal(isRuntimeStartupDebugEnabled({ [RUNTIME_STARTUP_DEBUG_ENV]: '1' }), true);

  let clockReads = 0;
  let sinkCalls = 0;
  const timing = createRuntimeStartupTiming('disabled-test', {
    env: {},
    now: () => {
      clockReads += 1;
      return 0;
    },
    sink: () => {
      sinkCalls += 1;
    },
  });

  timing.mark('must-not-log');
  assert.equal(timing.enabled, false);
  assert.equal(clockReads, 0);
  assert.equal(sinkCalls, 0);
});

test('Runtime startup timing records monotonic per-stage and total durations when enabled', () => {
  const ticks = [100, 112.345, 150];
  const events: RuntimeStartupTimingEvent[] = [];
  const timing = createRuntimeStartupTiming('runtime-host-initialize', {
    env: { [RUNTIME_STARTUP_DEBUG_ENV]: '1' },
    attemptId: 'attempt-test',
    now: () => ticks.shift()!,
    sink: (event) => events.push(event),
  });

  timing.mark('identity_open', 'complete', { ownerStatus: 'owned' });
  timing.mark('runtime_factory_connect', 'failed', { errorCode: 'timeout' });

  assert.equal(timing.enabled, true);
  assert.deepEqual(events, [
    {
      attemptId: 'attempt-test',
      scope: 'runtime-host-initialize',
      stage: 'identity_open',
      phase: 'complete',
      stepMs: 12.345,
      totalMs: 12.345,
      data: { ownerStatus: 'owned' },
    },
    {
      attemptId: 'attempt-test',
      scope: 'runtime-host-initialize',
      stage: 'runtime_factory_connect',
      phase: 'failed',
      stepMs: 37.655,
      totalMs: 50,
      data: { errorCode: 'timeout' },
    },
  ]);
});

test('Runtime startup timing never lets a diagnostic sink failure escape', () => {
  const timing = createRuntimeStartupTiming('sink-failure-test', {
    env: { [RUNTIME_STARTUP_DEBUG_ENV]: '1' },
    now: () => 1,
    sink: () => {
      throw new Error('diagnostic sink unavailable');
    },
  });

  assert.doesNotThrow(() => timing.mark('runtime_factory_connect'));
});

test('automatic timing stays quiet on fast startup and retains stages when startup fails', () => {
  let now = 0;
  const events: RuntimeStartupTimingEvent[] = [];
  const options = {
    env: {},
    reportSlowOrFailed: true,
    now: () => now,
    sink: (event: RuntimeStartupTimingEvent) => events.push(event),
  };
  const fast = createRuntimeStartupTiming('runtime-host-initialize', options);
  now = 500;
  fast.mark('initialize', 'complete');
  assert.equal(events.length, 0);
  const failing = createRuntimeStartupTiming('runtime-host-initialize', options);
  now = 1_000;
  failing.mark('identity_open');
  assert.equal(events.length, 0);
  now = 61_000;
  failing.mark('runtime_factory_connect', 'failed', { errorCode: 'daemon_startup_failed' });
  assert.deepEqual(
    events.map(({ stage, totalMs }) => ({ stage, totalMs })),
    [
      { stage: 'identity_open', totalMs: 500 },
      { stage: 'runtime_factory_connect', totalMs: 60_500 },
    ],
  );
});

test('automatic timing records a successful startup exceeding ten seconds', () => {
  let now = 0;
  const events: RuntimeStartupTimingEvent[] = [];
  const timing = createRuntimeStartupTiming('runtime-host-initialize', {
    env: {},
    reportSlowOrFailed: true,
    now: () => now,
    sink: (event) => events.push(event),
  });
  timing.mark('initialize', 'start');
  now = 12_000;
  timing.mark('initialize', 'complete');
  assert.deepEqual(
    events.map((event) => event.totalMs),
    [0, 12_000],
  );
});

test('automatic timing keeps the first marker and bounds a long startup timeline', () => {
  const events: RuntimeStartupTimingEvent[] = [];
  const timing = createRuntimeStartupTiming('runtime-host-initialize', {
    env: {},
    reportSlowOrFailed: true,
    now: () => 1,
    sink: (event) => events.push(event),
  });
  timing.mark('initialize', 'start');
  for (let index = 0; index < 100; index += 1) timing.mark(`stage-${index}`);
  timing.mark('connect', 'failed');
  assert.equal(events.length, 32);
  assert.equal(events[0]?.stage, 'initialize');
  assert.equal(events.at(-1)?.phase, 'failed');
});
