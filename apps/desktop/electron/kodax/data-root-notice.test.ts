// data-root-notice tests — 数据位置不可用时的启动对话框文案(纯函数,中英文)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dataRootStartupNotice } from './data-root-notice.js';
import type { ResolvedDataRoot } from './data-root.js';

const base: ResolvedDataRoot = {
  source: 'default',
  settingRoot: null,
  envRoot: null,
  problem: null,
  pointerError: null,
};

test('a healthy resolution needs no notice', () => {
  assert.equal(dataRootStartupNotice(base, 'D:\\fallback', 'en'), null);
  assert.equal(
    dataRootStartupNotice({ ...base, source: 'setting', settingRoot: 'E:\\kodax' }, 'E:\\kodax', 'zh-CN'),
    null,
  );
});

test('an unusable setting names the folder, the reason and the folder used for this session', () => {
  const resolved: ResolvedDataRoot = {
    ...base,
    problem: { root: 'E:\\kodax', reason: 'ENOENT: no such file or directory' },
  };
  const en = dataRootStartupNotice(resolved, 'C:\\Users\\me\\.kodax', 'en');
  assert.ok(en);
  assert.match(en.message, /E:\\kodax/);
  assert.match(en.detail, /ENOENT/);
  assert.match(en.detail, /C:\\Users\\me\\\.kodax/);
  const zh = dataRootStartupNotice(resolved, 'C:\\Users\\me\\.kodax', 'zh-CN');
  assert.ok(zh);
  assert.match(zh.message, /E:\\kodax/);
  assert.match(zh.detail, /C:\\Users\\me\\\.kodax/);
  assert.notEqual(zh.title, en.title);
});

test('a corrupt pointer is reported with its error and the folder used for this session', () => {
  const notice = dataRootStartupNotice(
    { ...base, pointerError: 'Unexpected token n in JSON' },
    'C:\\Users\\me\\.kodax',
    'en',
  );
  assert.ok(notice);
  assert.match(notice.detail, /Unexpected token/);
  assert.match(notice.detail, /C:\\Users\\me\\\.kodax/);
});
