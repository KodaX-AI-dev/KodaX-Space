import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APP_RENDERER_FRAME_SRC } from '../csp-config.js';

test('renderer CSP only embeds local preview and extension endpoints', () => {
  assert.equal(APP_RENDERER_FRAME_SRC, "frame-src 'self' app:");
  assert.doesNotMatch(APP_RENDERER_FRAME_SRC, /https?:|file:|data:|javascript:|\*/);
});
