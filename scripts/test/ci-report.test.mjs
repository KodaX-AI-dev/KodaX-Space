import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeTests } from '../ci-report.mjs';

test('reports first-attempt failures even when retries turn the run green', () => {
  const report = {
    suites: [
      {
        file: 'slow.spec.ts',
        specs: [
          {
            title: 'exit',
            tests: [
              {
                status: 'flaky',
                results: [
                  { status: 'timedOut', duration: 1000 },
                  { status: 'passed', duration: 100 },
                ],
              },
              { status: 'expected', results: [{ status: 'passed', duration: 200 }] },
              { status: 'unexpected', results: [{ status: 'failed', duration: 300 }] },
              { status: 'skipped', results: [{ status: 'skipped', duration: 0 }] },
            ],
          },
        ],
      },
    ],
  };
  const summary = summarizeTests(report);
  assert.deepEqual(
    {
      total: summary.total,
      flaky: summary.flaky,
      failed: summary.failed,
      skipped: summary.skipped,
    },
    { total: 4, flaky: 1, failed: 1, skipped: 1 },
  );
  assert.equal(summary.firstPassRate, 1 / 3);
  assert.equal(summary.slowest[0].durationMs, 1100);
  assert.equal(summary.p95Ms, 1100);
});

test('includes nested suites and reports no executed tests without dividing by zero', () => {
  const report = {
    suites: [
      { suites: [{ specs: [{ title: 'skip', tests: [{ status: 'skipped', results: [] }] }] }] },
    ],
  };
  assert.equal(summarizeTests(report).total, 1);
  assert.equal(summarizeTests(report).firstPassRate, null);
});
