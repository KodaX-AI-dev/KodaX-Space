import assert from 'node:assert/strict';
import test from 'node:test';
import { spaceCoderConnectionProjectionSchema } from './runtime.js';

test('Runtime startup progress carries only local launcher stages and waiting reasons', () => {
  const connecting = { state: 'connecting', changedAt: 1, stale: true, capabilities: [] };
  for (const startupProgress of [
    ...['checking', 'starting', 'upgrading', 'connecting', 'ready'].map((stage) => ({ stage })),
    ...['connected_clients', 'host_starting', 'host_stopping'].map((reason) => ({
      stage: 'waiting',
      reason,
    })),
  ]) {
    assert.deepEqual(
      spaceCoderConnectionProjectionSchema.parse({ ...connecting, startupProgress })
        .startupProgress,
      startupProgress,
    );
  }
  for (const startupProgress of [
    { stage: 'waiting' },
    { stage: 'waiting', reason: 'unknown' },
    { stage: 'starting', reason: 'host_starting' },
    { stage: 'starting', secret: 'must-not-cross-ipc' },
  ]) {
    assert.equal(
      spaceCoderConnectionProjectionSchema.safeParse({ ...connecting, startupProgress }).success,
      false,
    );
  }
  assert.equal(
    spaceCoderConnectionProjectionSchema.safeParse({
      ...connecting,
      state: 'ready',
      stale: false,
      runtimeId: 'runtime-1',
      startupProgress: { stage: 'ready' },
    }).success,
    false,
  );
});
