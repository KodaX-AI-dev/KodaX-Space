import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PARTNER_BROWSER_PARTITION,
  preparePartnerWebviewAttachment,
} from './partner-webview-policy.js';

test('Partner web pages attach only in a persistent isolated session without Node privileges', () => {
  const preferences: Record<string, unknown> = {
    preload: '/tmp/attacker.js',
    nodeIntegration: true,
    contextIsolation: false,
    sandbox: false,
    webSecurity: false,
    allowRunningInsecureContent: true,
  };
  const params = {
    src: 'https://accounts.feishu.cn/accounts/page/login',
    partition: PARTNER_BROWSER_PARTITION,
    preload: '/tmp/attacker.js',
    allowpopups: 'true',
  };
  assert.equal(preparePartnerWebviewAttachment(preferences, params), true);
  assert.deepEqual(preferences, {
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
    partition: PARTNER_BROWSER_PARTITION,
  });
  assert.equal(params.preload, undefined);
  assert.equal(params.allowpopups, undefined);
});

test('Partner web pages reject non-web targets and an untrusted storage partition', () => {
  assert.equal(
    preparePartnerWebviewAttachment(
      {},
      { src: 'file:///etc/passwd', partition: PARTNER_BROWSER_PARTITION },
    ),
    false,
  );
  assert.equal(
    preparePartnerWebviewAttachment(
      {},
      { src: 'https://docs.qq.com/doc/Example', partition: 'persist:untrusted' },
    ),
    false,
  );
});
