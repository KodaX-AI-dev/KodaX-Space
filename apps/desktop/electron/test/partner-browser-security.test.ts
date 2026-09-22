import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APP_RENDERER_FRAME_SRC, applyAppResponseCsp } from '../csp-config.js';

test('renderer permits HTTPS previews while excluding insecure and executable frame schemes', () => {
  assert.equal(APP_RENDERER_FRAME_SRC, "frame-src 'self' app: https:");
  assert.doesNotMatch(APP_RENDERER_FRAME_SRC, /http:|file:|data:|javascript:|\*/);
});

test('remote pages keep their own CSP and frame restrictions instead of receiving the app policy', () => {
  const headers = {
    'content-security-policy': ["script-src https://cdn.example.org; frame-ancestors 'none'"],
    'X-Frame-Options': ['DENY'],
  };
  assert.strictEqual(
    applyAppResponseCsp('https://accounts.feishu.cn/login', headers, "default-src 'self'"),
    headers,
  );
  assert.equal(
    applyAppResponseCsp('https://accounts.feishu.cn/login', undefined, "default-src 'self'"),
    undefined,
  );
  for (const url of ['app://space/index.html', 'http://127.0.0.1:5173/']) {
    assert.deepEqual(applyAppResponseCsp(url, {}, "default-src 'self'"), {
      'Content-Security-Policy': ["default-src 'self'"],
    });
  }
});
