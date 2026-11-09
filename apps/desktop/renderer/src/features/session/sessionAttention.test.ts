import assert from 'node:assert/strict';
import test from 'node:test';

import { sessionAttentionKind, summarizeAttention } from './sessionAttention.js';

test('attention kind follows awaiting > error > done precedence', () => {
  assert.equal(
    sessionAttentionKind({ status: 'awaiting', unread: true, isCurrent: false }),
    'awaiting',
  );
  assert.equal(sessionAttentionKind({ status: 'error', unread: true, isCurrent: false }), 'error');
  assert.equal(sessionAttentionKind({ status: 'idle', unread: true, isCurrent: false }), 'done');
  assert.equal(sessionAttentionKind({ status: 'idle', unread: false, isCurrent: false }), null);
});

test('running Sessions are activity, not attention', () => {
  assert.equal(sessionAttentionKind({ status: 'running', unread: true, isCurrent: false }), null);
});

test('an error in the Session being viewed only counts while it is still unread', () => {
  assert.equal(sessionAttentionKind({ status: 'error', unread: false, isCurrent: true }), null);
  assert.equal(sessionAttentionKind({ status: 'error', unread: true, isCurrent: true }), 'error');
});

test('summary totals attention Sessions and reports the most urgent kind', () => {
  assert.deepEqual(summarizeAttention(['done', null, 'error', 'done']), {
    total: 3,
    top: 'error',
    counts: { awaiting: 0, error: 1, done: 2 },
  });
  assert.deepEqual(summarizeAttention([null]), {
    total: 0,
    top: null,
    counts: { awaiting: 0, error: 0, done: 0 },
  });
});
