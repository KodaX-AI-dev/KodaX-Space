// data-root tests — 数据根指针文件 + 优先级解析(测试模式 > 设置项 > KODAX_HOME > 默认)
//
// 指针文件放在数据根之外(Electron appData),只存一个绝对路径。这里不依赖 Electron,
// 全部用临时目录;路径一律用 path.join 动态构造,Windows/macOS/Linux 行为一致。

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  probeDataRoot,
  readDataRootPointer,
  resolveDataRoot,
  writeDataRootPointer,
} from './data-root.js';

let scratch = '';

beforeEach(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'space-data-root-'));
});

afterEach(() => {
  assert.equal(path.dirname(scratch), os.tmpdir());
  rmSync(scratch, { recursive: true, force: true });
});

const pointerFile = (): string => path.join(scratch, 'app-data', 'data-root.json');

function makeRoot(name: string): string {
  const root = path.join(scratch, name);
  mkdirSync(root, { recursive: true });
  return root;
}

test('a missing pointer file reads as "no setting" without an error', () => {
  assert.deepEqual(readDataRootPointer(pointerFile()), { pointer: null, error: null });
});

test('a pointer round-trips, creates its directory and leaves no temp file behind', () => {
  const root = makeRoot('chosen');
  writeDataRootPointer(pointerFile(), { version: 1, root });
  assert.deepEqual(readDataRootPointer(pointerFile()), {
    pointer: { version: 1, root },
    error: null,
  });
  assert.deepEqual(readdirSync(path.dirname(pointerFile())), ['data-root.json']);
});

test('writing null removes the pointer (restore default) and tolerates a missing file', () => {
  const root = makeRoot('chosen');
  writeDataRootPointer(pointerFile(), { version: 1, root });
  writeDataRootPointer(pointerFile(), null);
  assert.equal(existsSync(pointerFile()), false);
  writeDataRootPointer(pointerFile(), null);
});

test('a corrupt, relative or wrong-version pointer is reported, not silently trusted', () => {
  mkdirSync(path.dirname(pointerFile()), { recursive: true });
  for (const content of [
    '{not json',
    JSON.stringify({ version: 1, root: path.join('relative', 'kodax') }),
    JSON.stringify({ version: 2, root: scratch }),
    JSON.stringify({ version: 1 }),
  ]) {
    writeFileSync(pointerFile(), content);
    const result = readDataRootPointer(pointerFile());
    assert.equal(result.pointer, null);
    assert.match(result.error ?? '', /\S/);
  }
});

test('probeDataRoot accepts a writable directory and leaves no probe file', () => {
  const root = makeRoot('writable');
  assert.equal(probeDataRoot(root, { create: false }), null);
  assert.deepEqual(readdirSync(root), []);
});

test('probeDataRoot does not create a missing directory at startup, but can when the user picks it', () => {
  const missing = path.join(scratch, 'unplugged', 'kodax');
  assert.match(probeDataRoot(missing, { create: false }) ?? '', /\S/);
  assert.equal(existsSync(missing), false);
  assert.equal(probeDataRoot(missing, { create: true }), null);
  assert.equal(existsSync(missing), true);
});

test('probeDataRoot rejects a path that is a file', () => {
  const file = path.join(scratch, 'not-a-dir');
  writeFileSync(file, 'x');
  assert.match(probeDataRoot(file, { create: false }) ?? '', /\S/);
  assert.match(probeDataRoot(file, { create: true }) ?? '', /\S/);
});

test('test mode ignores both the setting and KODAX_HOME', () => {
  const root = makeRoot('chosen');
  writeDataRootPointer(pointerFile(), { version: 1, root });
  const resolved = resolveDataRoot({
    env: { KODAX_TEST_ONBOARDING: '1', KODAX_HOME: makeRoot('env') },
    pointerFile: pointerFile(),
  });
  assert.equal(resolved.source, 'test');
  assert.equal(resolved.settingRoot, null);
});

test('a usable setting wins over KODAX_HOME and keeps the environment value for the conflict notice', () => {
  const chosen = makeRoot('chosen');
  const envRoot = makeRoot('env');
  writeDataRootPointer(pointerFile(), { version: 1, root: chosen });
  const resolved = resolveDataRoot({ env: { KODAX_HOME: envRoot }, pointerFile: pointerFile() });
  assert.equal(resolved.source, 'setting');
  assert.equal(resolved.settingRoot, chosen);
  assert.equal(resolved.envRoot, envRoot);
  assert.equal(resolved.problem, null);
});

test('without a setting, an absolute KODAX_HOME is used and the deprecated alias counts as the environment value', () => {
  const envRoot = makeRoot('env');
  const aliasRoot = makeRoot('alias');
  const fromHome = resolveDataRoot({ env: { KODAX_HOME: envRoot }, pointerFile: pointerFile() });
  assert.equal(fromHome.source, 'env');
  assert.equal(fromHome.envRoot, envRoot);
  const fromAlias = resolveDataRoot({
    env: { KODAX_PROFILE_DIR: aliasRoot },
    pointerFile: pointerFile(),
  });
  assert.equal(fromAlias.source, 'env');
  assert.equal(fromAlias.envRoot, aliasRoot);
});

test('no setting and no valid environment value falls back to the default', () => {
  const resolved = resolveDataRoot({
    env: { KODAX_HOME: path.join('relative', 'kodax') },
    pointerFile: pointerFile(),
  });
  assert.equal(resolved.source, 'default');
  assert.equal(resolved.envRoot, null);
  assert.equal(resolved.settingRoot, null);
});

test('an unusable setting falls back for this run and reports the problem instead of creating the directory', () => {
  const missing = path.join(scratch, 'unplugged', 'kodax');
  writeDataRootPointer(pointerFile(), { version: 1, root: missing });
  const envRoot = makeRoot('env');
  const resolved = resolveDataRoot({ env: { KODAX_HOME: envRoot }, pointerFile: pointerFile() });
  assert.equal(resolved.source, 'env');
  assert.equal(resolved.settingRoot, null);
  assert.equal(resolved.problem?.root, missing);
  assert.match(resolved.problem?.reason ?? '', /\S/);
  assert.equal(existsSync(missing), false);
});

test('a corrupt pointer falls back and is reported', () => {
  mkdirSync(path.dirname(pointerFile()), { recursive: true });
  writeFileSync(pointerFile(), '{not json');
  const resolved = resolveDataRoot({ env: {}, pointerFile: pointerFile() });
  assert.equal(resolved.source, 'default');
  assert.match(resolved.pointerError ?? '', /\S/);
});
