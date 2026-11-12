import assert from 'node:assert/strict';
import test from 'node:test';
import { captureDiagnosticInspection } from './inspection.js';

test('diagnostic inspection does not contact an unavailable Host and bounds a stalled ready Host', async () => {
  let calls = 0;
  const inspect = async () => {
    calls += 1;
    return new Promise<never>(() => undefined);
  };
  assert.deepEqual(await captureDiagnosticInspection(false, inspect, 20), {
    status: 'runtime-unavailable',
  });
  assert.equal(calls, 0);
  const stalled = await captureDiagnosticInspection(true, inspect, 20);
  assert.equal(stalled.status, 'failed');
  if (stalled.status === 'failed') assert.match(stalled.error, /timed out/i);
  assert.equal(calls, 1);
  assert.deepEqual(await captureDiagnosticInspection(true, async () => ({ state: 'ready' })), {
    status: 'available',
    value: { state: 'ready' },
  });
});
