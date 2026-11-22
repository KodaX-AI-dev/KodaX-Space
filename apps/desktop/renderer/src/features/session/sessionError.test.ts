import assert from 'node:assert/strict';
import test from 'node:test';

import { isCancelledNotice, isCancelledSessionError } from './sessionError.js';

test('structured and legacy cancellation events share one classification', () => {
  assert.equal(
    isCancelledSessionError({
      kind: 'session_error',
      sessionId: 'structured',
      error: 'Runtime run was cancelled by the user.',
      category: 'cancelled',
    }),
    true,
  );
  assert.equal(
    isCancelledSessionError({ kind: 'session_error', sessionId: 'legacy', error: 'cancelled' }),
    true,
  );
  assert.equal(
    isCancelledSessionError({
      kind: 'session_error',
      sessionId: 'failure',
      error: 'Provider failed.',
      category: 'unknown',
    }),
    false,
  );
  assert.equal(
    isCancelledSessionError({
      kind: 'session_error',
      sessionId: 'provider-abort',
      error: 'Provider request was aborted.',
      failureKind: 'provider_aborted',
      category: 'cancelled',
    }),
    false,
  );
});

test('a notice for a run the user stopped is a cancellation, not a failure', () => {
  const base = { kind: 'system_notice', id: 'n', variant: 'error', text: 'x' } as const;
  assert.equal(isCancelledNotice({ ...base, failureKind: 'cancelled' }), true);
  assert.equal(
    isCancelledNotice({
      ...base,
      terminal: {
        revision: 1,
        kind: 'interrupted',
        code: 'interrupted',
        effectOutcome: 'unknown',
        failureKind: 'cancelled',
      },
    }),
    true,
  );
  assert.equal(isCancelledNotice({ ...base, failureKind: 'provider_aborted' }), false);
  assert.equal(isCancelledNotice({ ...base, failureKind: 'network' }), false);
});
