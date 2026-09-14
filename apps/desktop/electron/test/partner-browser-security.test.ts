import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PARTNER_BROWSER_MAX_URL_LENGTH } from '@kodax-space/space-ipc-schema';
import {
  APP_RENDERER_FRAME_SRC,
  isSafeRemoteFrameUrl,
  shouldPreserveRemoteFrameHeaders,
} from '../csp-config.js';

test('renderer CSP allows only app previews and HTTP(S) remote browser frames', () => {
  assert.equal(APP_RENDERER_FRAME_SRC, "frame-src 'self' app: https: http:");
  assert.doesNotMatch(APP_RENDERER_FRAME_SRC, /\*/);
  assert.doesNotMatch(APP_RENDERER_FRAME_SRC, /file:|data:|javascript:/);
});

test('remote frame responses keep the site security headers while other requests use app CSP', () => {
  assert.equal(isSafeRemoteFrameUrl('https://example.com/docs'), true);
  assert.equal(isSafeRemoteFrameUrl('http://127.0.0.1:5173'), true);
  assert.equal(isSafeRemoteFrameUrl('https://user:secret@example.com'), false);
  assert.equal(isSafeRemoteFrameUrl('file:///etc/passwd'), false);
  assert.equal(
    isSafeRemoteFrameUrl(`https://example.com/${'a'.repeat(PARTNER_BROWSER_MAX_URL_LENGTH)}`),
    false,
  );

  assert.equal(shouldPreserveRemoteFrameHeaders('subFrame', 'https://example.com'), false);
  assert.equal(shouldPreserveRemoteFrameHeaders('subFrame', 'https://example.com', true), true);
  assert.equal(shouldPreserveRemoteFrameHeaders('mainFrame', 'https://example.com', true), false);
  assert.equal(shouldPreserveRemoteFrameHeaders('subFrame', 'file:///etc/passwd', true), false);
});
