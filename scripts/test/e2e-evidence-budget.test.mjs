import assert from 'node:assert/strict';
import test from 'node:test';
import { captureWithEvidenceBudget } from '../e2e-evidence-budget.mjs';

test('fixture evidence preserves a completed snapshot without a new envelope', async () => {
  const snapshot = { viewport: { top: 100 }, markers: [0, 36] };
  assert.equal(await captureWithEvidenceBudget(Promise.resolve(snapshot)), snapshot);
});

test('a rejected fixture probe records unavailability without retaining its error contents', async () => {
  assert.deepEqual(await captureWithEvidenceBudget(Promise.reject(new Error('private detail'))), {
    status: 'query_failed',
  });
});

test(
  'a hung renderer probe cannot consume the remaining test deadline',
  { timeout: 1000 },
  async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const evidence = captureWithEvidenceBudget(new Promise(() => {}));
    t.mock.timers.tick(2000);
    assert.deepEqual(await evidence, { status: 'timed_out' });
  },
);
