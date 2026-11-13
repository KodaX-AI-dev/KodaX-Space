// data-paths tests — OC-12 + 单一数据根(KODAX_HOME)
//
// 跨平台(win/mac/linux):路径断言全部用 os.homedir()/os.tmpdir() + path.join 动态构造,
// 不硬编码 `c:\...` 或 `/home/...`,故同一份用例在三个平台都成立。KODAX_HOME 的
// 绝对路径判定走 path.isAbsolute(当前 OS 语义)。
//
// 验收：
//   1. 默认 (无 env) → os.homedir()/.kodax
//   2. KODAX_TEST_ONBOARDING=<id> → tmpdir/kodax-test-<id>
//   3. KODAX_TEST_ONBOARDING=1 → tmpdir/kodax-test-<uuid> (auto)
//   4. 便携版(PORTABLE_EXECUTABLE_DIR) **不再**重定向 → 仍走 ~/.kodax（回归:便携版看不到 workflow）
//   5. KODAX_HOME=<abs> → <abs> 本身(Space 数据、SDK sessions/config 同根,不再分裂)
//   6. 非绝对路径的 KODAX_HOME 被忽略 → 回落 ~/.kodax,且 applySdkHomeEnv 把 env 规整到同一路径
//   7. KODAX_PROFILE_DIR 是已弃用别名:仅在没设 KODAX_HOME 时等价于 KODAX_HOME
//   8. 同 process 多次调返同路径（缓存）

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
// Lighter subpath than the main entry (which pulls the REPL/ink stack and breaks the tsx
// loader). /agent re-exports getAgentConfigHome — the real SDK resolver for its session/config
// home — so the test below round-trips through actual SDK code, not just Space's own env write.
import { getAgentConfigHome } from '@kodax-ai/kodax/agent';
import {
  getKodaxDir,
  getScopedUserDataDir,
  getSpaceDataDir,
  applySdkHomeEnv,
  _resetDataPathsCacheForTesting,
} from '../kodax/data-paths.js';

const ENV_KEYS = [
  'KODAX_TEST_ONBOARDING',
  'PORTABLE_EXECUTABLE_DIR',
  'KODAX_PROFILE_DIR',
  'KODAX_HOME',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  _resetDataPathsCacheForTesting();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetDataPathsCacheForTesting();
});

function clearAllDataEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k];
}

const homeKodax = (): string => path.join(os.homedir(), '.kodax');

test('no env → ~/.kodax', () => {
  clearAllDataEnv();
  assert.equal(getKodaxDir(), homeKodax());
  assert.equal(getSpaceDataDir(), path.join(homeKodax(), 'space'));
  assert.equal(getScopedUserDataDir(), null);
});

test('an absolute KODAX_HOME is the single data root for Space and the SDK', () => {
  clearAllDataEnv();
  const home = path.join(os.tmpdir(), 'kodax-home-fixture');
  process.env.KODAX_HOME = home;
  assert.equal(getKodaxDir(), home);
  assert.equal(getSpaceDataDir(), path.join(home, 'space'));
  assert.equal(getScopedUserDataDir(), null, 'a data-root override must not reset Chromium userData');
});

test('onboarding isolation takes precedence over inherited KODAX_HOME', () => {
  clearAllDataEnv();
  process.env.KODAX_TEST_ONBOARDING = 'runtime-home-isolation';
  process.env.KODAX_HOME = path.join(os.tmpdir(), 'must-not-be-used-by-runtime');
  assert.equal(getKodaxDir(), path.join(os.tmpdir(), 'kodax-test-runtime-home-isolation'));
});

test('KODAX_TEST_ONBOARDING=fixture-1 → tmpdir/kodax-test-fixture-1', () => {
  clearAllDataEnv();
  process.env.KODAX_TEST_ONBOARDING = 'fixture-1';
  const expected = path.join(os.tmpdir(), 'kodax-test-fixture-1');
  assert.equal(getKodaxDir(), expected);
  assert.equal(getSpaceDataDir(), path.join(expected, 'space'));
  assert.equal(getScopedUserDataDir(), path.join(expected, 'space', 'electron-user-data'));
});

test('KODAX_TEST_ONBOARDING=1 → auto uuid suffix (stable across calls)', () => {
  clearAllDataEnv();
  process.env.KODAX_TEST_ONBOARDING = '1';
  const first = getKodaxDir();
  assert.ok(first.startsWith(path.join(os.tmpdir(), 'kodax-test-')));
  const second = getKodaxDir();
  assert.equal(first, second);
});

test('cache survives between getKodaxDir and getSpaceDataDir calls', () => {
  clearAllDataEnv();
  process.env.KODAX_TEST_ONBOARDING = '1';
  const dir1 = getKodaxDir();
  const dir2 = getSpaceDataDir();
  assert.equal(path.dirname(dir2), dir1, 'space dir should sit under same kodax dir');
});

test('便携版 PORTABLE_EXECUTABLE_DIR 不再重定向 → 仍走 ~/.kodax (regression: 便携版看不到 workflow)', () => {
  // 根因回归:便携版曾把 Space 数据(含 workflow-runs)重定向到 <exe>/.kodax(空目录),
  // 而 SDK sessions 仍在真实 ~/.kodax → "session 正常、workflow 全空"。现在便携版一律走
  // ~/.kodax,和 dev / SDK 一致。(portable target 仅 Windows 有;mac/linux 从来就走 ~/.kodax。)
  clearAllDataEnv();
  process.env.PORTABLE_EXECUTABLE_DIR = path.join(os.tmpdir(), 'kodax-portable-fixture');
  assert.equal(getKodaxDir(), homeKodax());
  assert.equal(getSpaceDataDir(), path.join(homeKodax(), 'space'));
  assert.equal(
    getScopedUserDataDir(),
    null,
    '便携版用 Electron 默认 userData,不再 scope 到 exe 目录',
  );
});

test('applySdkHomeEnv: SDK getAgentConfigHome 与 Space 数据根指向同一个 KODAX_HOME', () => {
  // 真 SDK round-trip:getAgentConfigHome() 动态读 process.env.KODAX_HOME,是 SDK session/config
  // 目录的根;node --test 按文件隔离进程,故此处 SDK 的 setAgentConfigHome 未被别处污染。
  // **不拼 /sessions**:getAgentConfigHome 返回 .kodax 根本身。
  clearAllDataEnv();
  const home = path.join(os.tmpdir(), 'kodax-home-fixture');
  process.env.KODAX_HOME = home;

  assert.deepEqual(applySdkHomeEnv(), { deprecatedProfileDir: null });
  assert.equal(process.env.KODAX_HOME, home);
  assert.equal(getAgentConfigHome(), home);
  assert.equal(getKodaxDir(), home);
});

test('applySdkHomeEnv: 默认 / 便携版是 no-op (不碰 KODAX_HOME)', () => {
  clearAllDataEnv();
  process.env.PORTABLE_EXECUTABLE_DIR = path.join(os.tmpdir(), 'kodax-portable-fixture');
  assert.deepEqual(applySdkHomeEnv(), { deprecatedProfileDir: null });
  assert.equal(process.env.KODAX_HOME, undefined, '便携版/默认不覆盖 SDK 自己的 home 默认');
});

test('applySdkHomeEnv: 测试模式强制隔离 SDK home，不继承用户 KODAX_HOME', () => {
  clearAllDataEnv();
  process.env.KODAX_TEST_ONBOARDING = 'sdk-home-isolation';
  process.env.KODAX_HOME = path.join(os.tmpdir(), 'must-not-be-used');

  applySdkHomeEnv();

  const expected = path.join(os.tmpdir(), 'kodax-test-sdk-home-isolation');
  assert.equal(process.env.KODAX_HOME, expected);
  assert.equal(getAgentConfigHome(), expected);
});

test('applySdkHomeEnv: 非绝对 KODAX_HOME 被忽略,SDK 与 Space 回落到同一个默认根', () => {
  // SDK 的 getAgentConfigHome 会原样接受相对路径;若 Space 只忽略而不规整 env,两边就分叉。
  clearAllDataEnv();
  process.env.KODAX_HOME = path.join('relative', 'kodax');

  applySdkHomeEnv();

  assert.equal(getKodaxDir(), homeKodax());
  assert.equal(process.env.KODAX_HOME, homeKodax());
  assert.equal(getAgentConfigHome(), homeKodax());
});

test('KODAX_PROFILE_DIR (已弃用) 只设它时等价于 KODAX_HOME,并报告弃用', () => {
  clearAllDataEnv();
  const profileDir = path.join(os.tmpdir(), 'kodax-profile-fixture');
  process.env.KODAX_PROFILE_DIR = profileDir;

  assert.deepEqual(applySdkHomeEnv(), { deprecatedProfileDir: profileDir });
  assert.equal(process.env.KODAX_HOME, profileDir);
  assert.equal(getAgentConfigHome(), profileDir);
  assert.equal(getKodaxDir(), profileDir);
  assert.equal(getSpaceDataDir(), path.join(profileDir, 'space'));
  assert.equal(getScopedUserDataDir(), null);
});

test('KODAX_PROFILE_DIR 与 KODAX_HOME 同时设置 → KODAX_HOME 优先,仍报告弃用', () => {
  clearAllDataEnv();
  const profileDir = path.join(os.tmpdir(), 'kodax-profile-fixture');
  const home = path.join(os.tmpdir(), 'kodax-home-fixture');
  process.env.KODAX_PROFILE_DIR = profileDir;
  process.env.KODAX_HOME = home;

  assert.deepEqual(applySdkHomeEnv(), { deprecatedProfileDir: profileDir });
  assert.equal(getKodaxDir(), home);
  assert.equal(getAgentConfigHome(), home);
});

test('非绝对路径的 KODAX_PROFILE_DIR 被忽略 → 回落 ~/.kodax,不报告弃用', () => {
  clearAllDataEnv();
  process.env.KODAX_PROFILE_DIR = path.join('relative', 'kodax');
  assert.deepEqual(applySdkHomeEnv(), { deprecatedProfileDir: null });
  assert.equal(getKodaxDir(), homeKodax());
});

test('测试模式下 KODAX_PROFILE_DIR 被忽略且不报告弃用', () => {
  clearAllDataEnv();
  process.env.KODAX_TEST_ONBOARDING = 'profile-ignored';
  process.env.KODAX_PROFILE_DIR = path.join(os.tmpdir(), 'kodax-profile-fixture');
  assert.deepEqual(applySdkHomeEnv(), { deprecatedProfileDir: null });
  assert.equal(getKodaxDir(), path.join(os.tmpdir(), 'kodax-test-profile-ignored'));
});

test('KODAX_TEST_ONBOARDING rejects path traversal suffixes', () => {
  clearAllDataEnv();
  process.env.KODAX_TEST_ONBOARDING = '../../escape';
  assert.throws(() => getKodaxDir(), /safe \[A-Za-z0-9_-\] suffix/);
});
