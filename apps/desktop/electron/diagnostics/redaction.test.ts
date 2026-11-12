import assert from 'node:assert/strict';
import test from 'node:test';
import { redactDiagnosticText, redactDiagnosticValue } from './redaction.js';

test('startup aggregates retain typed causes without exposing process arguments or secrets', () => {
  const timeout = Object.assign(new Error('startup timeout'), {
    code: 'daemon_startup_failed',
    reason: 'timeout',
    retryable: true,
  });
  const cleanup = Object.assign(new Error('cleanup failed with Bearer sensitive-value'), {
    code: 'ETIMEDOUT',
    spawnargs: ['private-argument'],
  });
  assert.deepEqual(
    redactDiagnosticValue(new AggregateError([timeout, cleanup], 'startup and cleanup failed')),
    {
      name: 'AggregateError',
      message: 'startup and cleanup failed',
      errors: [
        {
          name: 'Error',
          message: 'startup timeout',
          code: 'daemon_startup_failed',
          reason: 'timeout',
          retryable: true,
        },
        { name: 'Error', message: 'cleanup failed with Bearer [REDACTED]', code: 'ETIMEDOUT' },
      ],
    },
  );
  assert.doesNotMatch(
    redactDiagnosticText('API_KEY="not-known-to-Space" password=another-unknown'),
    /not-known-to-Space|another-unknown/,
  );
});
