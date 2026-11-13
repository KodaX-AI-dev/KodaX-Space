// data-root tests — 数据根指针文件 + 优先级解析(测试模式 > 设置项 > KODAX_HOME > 默认)
//
// 指针文件放在数据根之外(Electron appData),只存一个绝对路径。这里不依赖 Electron,
// 全部用临时目录;路径一律用 path.join 动态构造,Windows/macOS/Linux 行为一致。

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  probeDataRoot,
  readDataRootPointer,
  resolveDataRoot,
  KODAX_HOME_OVERRIDE_ENV,
  kodaxHomeOverrideMark,
  userKodaxHome,
  validateDataRootCandidate,
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

test('candidate validation rejects relative, identical and nested locations', () => {
  const current = makeRoot('current');
  assert.equal(validateDataRootCandidate(path.join('relative', 'x'), current).ok, false);
  const same = validateDataRootCandidate(current, current);
  assert.deepEqual(same, { ok: false, reason: 'same' });
  const inside = path.join(current, 'sub');
  mkdirSync(inside);
  assert.deepEqual(validateDataRootCandidate(inside, current), { ok: false, reason: 'nested' });
  assert.deepEqual(validateDataRootCandidate(scratch, current), { ok: false, reason: 'nested' });
});

test('candidate validation accepts an empty folder or an existing KodaX data folder, not an arbitrary one', () => {
  const current = makeRoot('current');
  const empty = makeRoot('empty');
  assert.deepEqual(validateDataRootCandidate(empty, current), {
    ok: true,
    root: empty,
    hasData: false,
  });

  const existing = makeRoot('existing');
  mkdirSync(path.join(existing, 'space'));
  assert.deepEqual(validateDataRootCandidate(existing, current), {
    ok: true,
    root: existing,
    hasData: true,
  });

  const documents = makeRoot('documents');
  writeFileSync(path.join(documents, 'report.docx'), 'x');
  assert.deepEqual(validateDataRootCandidate(documents, current), {
    ok: false,
    reason: 'unrecognized',
  });
});

test('candidate validation reports a missing folder without creating it', () => {
  const current = makeRoot('current');
  const missing = path.join(scratch, 'unplugged');
  const result = validateDataRootCandidate(missing, current);
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.reason, 'unusable');
  assert.equal(existsSync(missing), false);
});

test('a KODAX_HOME injected by an earlier Space process is not mistaken for the user value', () => {
  const settingRoot = makeRoot('setting');
  const userRoot = makeRoot('user');
  // Relaunch after "restore default": the old process had replaced an unset KODAX_HOME.
  const inherited = (original: string | undefined) => ({
    KODAX_HOME: settingRoot,
    [KODAX_HOME_OVERRIDE_ENV]: kodaxHomeOverrideMark(original, settingRoot),
  });
  const inheritedUnset = inherited(undefined);
  assert.equal(userKodaxHome(inheritedUnset), undefined);
  // The user had their own KODAX_HOME, which Settings overrode.
  assert.equal(userKodaxHome(inherited(userRoot)), userRoot);
  // A value set after the override (e.g. exported in Space's terminal) is the user's.
  assert.equal(userKodaxHome({ ...inheritedUnset, KODAX_HOME: userRoot }), userRoot);
  assert.equal(userKodaxHome({ KODAX_HOME: userRoot }), userRoot);
});

test('a link to the current location is the same location, not a new one', (t) => {
  const current = makeRoot('current');
  const link = path.join(scratch, 'link');
  try {
    symlinkSync(current, link, 'junction');
  } catch (error) {
    t.skip(`cannot create a directory link here: ${(error as Error).message}`);
    return;
  }
  assert.deepEqual(validateDataRootCandidate(link, current), { ok: false, reason: 'same' });
});

test('network locations are rejected', { skip: process.platform !== 'win32' }, () => {
  const current = makeRoot('current');
  for (const candidate of [
    '\\\\server\\share\\kodax',
    '//server/share/kodax',
    '\\\\?\\UNC\\server\\share',
  ]) {
    const result = validateDataRootCandidate(candidate, current);
    assert.equal(result.ok ? 'ok' : result.reason, 'network', candidate);
  }
});

test('a fresh folder holding only OS housekeeping files counts as empty', () => {
  const current = makeRoot('current');
  const fresh = makeRoot('fresh');
  writeFileSync(path.join(fresh, '.DS_Store'), '');
  writeFileSync(path.join(fresh, 'desktop.ini'), '');
  assert.deepEqual(validateDataRootCandidate(fresh, current), {
    ok: true,
    root: fresh,
    hasData: false,
  });
});

test('a folder holding an interrupted copy is neither empty nor usable', () => {
  const current = makeRoot('current');
  const interrupted = makeRoot('interrupted');
  writeFileSync(path.join(interrupted, '.kodax-copy-incomplete'), '');
  mkdirSync(path.join(interrupted, 'sessions'));
  assert.deepEqual(validateDataRootCandidate(interrupted, current), {
    ok: false,
    reason: 'incomplete_copy',
  });
});
