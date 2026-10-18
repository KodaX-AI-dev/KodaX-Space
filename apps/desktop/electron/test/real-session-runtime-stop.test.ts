import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { RuntimeRunResult } from '@kodax-ai/kodax/runtime';
import { RealKodaXSession } from '../kodax/real-session.js';
import { runtimeHostAdapter } from '../kodax/runtime-host-adapter.js';

function patchRuntime(t: TestContext, overrides: Record<string, unknown>): void {
  const adapter = runtimeHostAdapter as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries(overrides)) {
    const descriptor = Object.getOwnPropertyDescriptor(adapter, name);
    adapter[name] = value;
    t.after(() => {
      if (descriptor) Object.defineProperty(adapter, name, descriptor);
      else delete adapter[name];
    });
  }
}

function pendingResult(): { promise: Promise<RuntimeRunResult>; finish: () => void } {
  let finish!: () => void;
  const promise = new Promise<RuntimeRunResult>((resolve) => {
    finish = () => resolve({ runId: 'old', sessionId: 'stop_session', phase: 'cancelled' });
  });
  return { promise, finish };
}

function stoppedSession(t: TestContext, confirmed = true) {
  const old = pendingResult();
  const next = pendingResult();
  const starts: string[] = [];
  patchRuntime(t, {
    isRuntimeSelected: () => true,
    initialize: async () => undefined,
    ensureSession: async () => false,
    ensureObserved: async () => undefined,
    activeRunId: () => undefined,
    findActiveRunId: async () => undefined,
    updateSessionSettings: async () => undefined,
    startManagedRun: async () => {
      const runId = starts.length === 0 ? 'old' : 'next';
      starts.push(runId);
      return { runId, result: runId === 'old' ? old.promise : next.promise };
    },
    cancelSessionRuns: async () => ({
      runId: 'old',
      sessionId: 'stop_session',
      accepted: true,
      state: confirmed ? 'confirmed' : 'unknown',
      outcome: confirmed ? 'cancelled' : 'unknown',
      phase: confirmed ? 'cancelled' : 'running',
      revision: 1,
    }),
  });
  t.after(() => {
    old.finish();
    next.finish();
  });
  const session = new RealKodaXSession({
    sessionId: 'stop_session',
    projectRoot: process.cwd(),
    provider: 'test-provider',
    reasoningMode: 'balanced',
    permissionMode: 'auto',
    surface: 'code',
    emit: () => undefined,
    requestPermission: async () => 'allow_once',
  });
  return { session, starts, old };
}

test('confirmed Stop admits the next input before the old result stream settles', async (t) => {
  const { session, starts, old } = stoppedSession(t);
  assert.deepEqual(await session.send('first'), { accepted: true, queued: false, runId: 'old' });
  const stop = await session.cancel('old');
  assert.equal(stop && 'state' in stop ? stop.state : undefined, 'confirmed');
  assert.deepEqual(await session.send('next'), { accepted: true, queued: false, runId: 'next' });
  old.finish();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(session.isRunning(), true, 'old stream completion must not clear the successor');
  assert.deepEqual(starts, ['old', 'next']);
});

test('an unknown Stop cannot clear the local admission gate', async (t) => {
  const { session, starts } = stoppedSession(t, false);
  await session.send('first');
  await session.cancel('old');
  await assert.rejects(session.send('next'), /still accepting the current run/);
  assert.equal(session.isRunning(), true);
  assert.deepEqual(starts, ['old']);
});
