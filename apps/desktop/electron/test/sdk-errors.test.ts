// wrapSdkError tests — OC-11

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapSdkError } from '../kodax/sdk-errors.js';

test('native timeout and cancellation survive SDK cause wrappers without message heuristics', () => {
  for (const wrapped of [false, true]) {
    for (const [name, category] of [['TimeoutError', 'network'], ['AbortError', 'cancelled']]) {
      const cause = new DOMException('Operation ended.', name);
      const error = wrapped ? new Error('Provider failed.', { cause }) : cause;
      assert.equal(wrapSdkError(error).category, category);
    }
  }
});

test('numeric error codes and cyclic causes do not break error reporting', () => {
  const error = Object.assign(new Error('Unknown failure'), { code: 23, cause: undefined as unknown });
  error.cause = error;
  assert.equal(wrapSdkError(error).category, 'unknown');
});

test('AbortError → cancelled', () => {
  const err = new Error('user aborted');
  err.name = 'AbortError';
  const w = wrapSdkError(err);
  assert.equal(w.category, 'cancelled');
  assert.equal(w.retriable, true);
});

test('HTTP 429 → rate_limit + retry', () => {
  const w = wrapSdkError(new Error('429 Too Many Requests'));
  assert.equal(w.category, 'rate_limit');
  assert.equal(w.action, 'retry');
  assert.equal(w.retriable, true);
  assert.ok(w.userMessage.toLowerCase().includes('rate limit'));
});

test('status field 429 → rate_limit', () => {
  const err = Object.assign(new Error('throttled'), { status: 429 });
  const w = wrapSdkError(err);
  assert.equal(w.category, 'rate_limit');
});

test('message contains "rate limit" without HTTP → rate_limit', () => {
  const w = wrapSdkError(new Error('Anthropic rate limit reached for sonnet model'));
  assert.equal(w.category, 'rate_limit');
});

test('HTTP 401 → auth + open_provider_settings', () => {
  const w = wrapSdkError(new Error('401 Unauthorized'));
  assert.equal(w.category, 'auth');
  assert.equal(w.action, 'open_provider_settings');
  assert.equal(w.retriable, false);
});

test('"invalid api key" message → auth', () => {
  const w = wrapSdkError(new Error('Authentication failed: invalid_api_key'));
  assert.equal(w.category, 'auth');
});

test('HTTP 402 → quota + open_provider_settings', () => {
  const w = wrapSdkError(new Error('402 Payment Required'));
  assert.equal(w.category, 'quota');
  assert.equal(w.action, 'open_provider_settings');
  assert.equal(w.retriable, false);
});

test('"insufficient credit" → quota', () => {
  const w = wrapSdkError(new Error('Account has insufficient credit'));
  assert.equal(w.category, 'quota');
});

test('ENOTFOUND code → network', () => {
  const err = Object.assign(new Error('getaddrinfo ENOTFOUND api.anthropic.com'), {
    code: 'ENOTFOUND',
  });
  const w = wrapSdkError(err);
  assert.equal(w.category, 'network');
  assert.equal(w.action, 'check_network');
});

test('"fetch failed" message → network', () => {
  const w = wrapSdkError(new Error('fetch failed'));
  assert.equal(w.category, 'network');
});

test('"model not found" → model_unavailable + change_model', () => {
  const w = wrapSdkError(new Error('model_not_found: claude-opus-99 is not available'));
  assert.equal(w.category, 'model_unavailable');
  assert.equal(w.action, 'change_model');
});

test('HTTP 500 → server_error + retry', () => {
  const w = wrapSdkError(new Error('500 Internal Server Error'));
  assert.equal(w.category, 'server_error');
  assert.equal(w.action, 'retry');
  assert.equal(w.retriable, true);
});

test('HTTP 503 → server_error', () => {
  const w = wrapSdkError(new Error('503 Service Unavailable'));
  assert.equal(w.category, 'server_error');
});

test('HTTP 400 → bad_request, not retriable', () => {
  const w = wrapSdkError(new Error('400 Bad Request: prompt too long'));
  assert.equal(w.category, 'bad_request');
  assert.equal(w.retriable, false);
});

test('unknown error short message → userMessage preserves it', () => {
  const w = wrapSdkError(new Error('something weird happened'));
  assert.equal(w.category, 'unknown');
  assert.equal(w.userMessage, 'something weird happened');
});

test('unknown error LONG message → userMessage falls back to generic', () => {
  const longMsg = 'x'.repeat(500);
  const w = wrapSdkError(new Error(longMsg));
  assert.equal(w.category, 'unknown');
  assert.ok(!w.userMessage.includes(longMsg), 'should not show long raw');
  assert.ok(w.debugMessage.length > 100, 'debugMessage keeps full string');
});

test('non-Error thrown (string) → handled', () => {
  const w = wrapSdkError('something failed');
  assert.equal(w.category, 'unknown');
  assert.equal(w.debugMessage, 'something failed');
});

test('userMessage is always <= 160 chars (UX cap)', () => {
  const cases: unknown[] = [
    new Error('429'),
    new Error('401'),
    new Error('fetch failed'),
    new Error('500'),
    'string error',
  ];
  for (const c of cases) {
    const w = wrapSdkError(c);
    assert.ok(w.userMessage.length <= 160, `userMessage too long: ${w.userMessage}`);
  }
});

test('debugMessage always retains original message for main-side logging', () => {
  const original = '500 Internal Server Error from upstream';
  const w = wrapSdkError(new Error(original));
  assert.equal(w.debugMessage, original);
});

// OC-23 retryAfterMs context propagation
test('rate_limit + retryAfterMs ctx → wrapped carries retryAfterMs', () => {
  const w = wrapSdkError(new Error('429 Too Many Requests'), { retryAfterMs: 30000 });
  assert.equal(w.category, 'rate_limit');
  assert.equal(w.retryAfterMs, 30000);
});

test('rate_limit without ctx → retryAfterMs is undefined', () => {
  const w = wrapSdkError(new Error('429 Too Many Requests'));
  assert.equal(w.category, 'rate_limit');
  assert.equal(w.retryAfterMs, undefined);
});

test('non-rate-limit + retryAfterMs ctx → ctx ignored (not relevant to category)', () => {
  // auth 类不该挂 retry-after，即使 ctx 给了也不当真
  const w = wrapSdkError(new Error('401 Unauthorized'), { retryAfterMs: 5000 });
  assert.equal(w.category, 'auth');
  assert.equal(w.retryAfterMs, undefined);
});

test('server_error + retryAfterMs ctx → wrapped propagates (5xx countdown)', () => {
  // 5xx 也可能带 Retry-After，wrap 应该透传到 retryAfterMs 让 UI 显示倒计时
  const w = wrapSdkError(new Error('503 Service Unavailable'), { retryAfterMs: 10000 });
  assert.equal(w.category, 'server_error');
  assert.equal(w.retryAfterMs, 10000);
});
