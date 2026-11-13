// Data path resolution — OC-12 测试隔离 + 单一数据根
//
// 所有 Space 持久化目录默认落在 os.homedir()/.kodax（即 ~/.kodax；Windows 上 =
// C:\Users\<user>\.kodax）。便携版(electron-builder portable)**也**走这里 —— 和 dev /
// 安装版 / SDK 完全一致,不再跟随 exe 目录。理由:曾经"便携版重定向到
// PORTABLE_EXECUTABLE_DIR/.kodax"是半便携:只有 Space 自己的数据(workflow-runs / origins /
// projects / settings)跟着走,SDK 的 sessions 仍写真实 ~/.kodax → 便携版里"session 正常、
// workflow 全空"的怪象。默认统一回 ~/.kodax 后不再分叉。
//
// 数据根只有一个:`KODAX_HOME`(SDK 与 CLI 原生的变量)。它**直接就是** .kodax 那一层本身
// (默认相当于 ~/.kodax;设 c:/tools/kodax 则 sessions=c:/tools/kodax/sessions、
// space=c:/tools/kodax/space)。Space 数据、SDK sessions/config、凭据、Host 目录全部在它之下。
// KODAX_PROFILE_DIR 是已弃用别名,仅在没设 KODAX_HOME 时等价于 KODAX_HOME(见 applySdkHomeEnv)。
//
// 用法:
//   KODAX_TEST_ONBOARDING=1       → tmpdir/kodax-test-<uuid> (每次 process 启动新 uuid)
//   KODAX_TEST_ONBOARDING=<id>    → tmpdir/kodax-test-<id>     (确定性,便于 fixture 复用)
//   KODAX_HOME=<abs>              → <abs>                       (数据根本身;含 SDK sessions)
//                                    未设 = os.homedir()/.kodax
//
// 为啥不让每个 store 自己读 env:
//   1. 共享一份缓存目录 —— 多个 store 在同一 process 里读出来必须是同路径
//   2. 集中变更:未来 OC-04 Crashpad / OC-10 secret-redact 都基于这两个目录定位
//
// 跨平台:path.isAbsolute / path.join / os.homedir 都按当前 OS 语义工作(Windows 上
// path.isAbsolute('c:/tools/kodax') === true,path.join 产出反斜杠路径),故本工具在
// Windows / macOS / Linux 行为一致。HLD §16 Playwright E2E S1-S7 首启用例直接依赖它。

import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

let cachedKodaxDir: string | null = null;

const SAFE_TEST_SUFFIX_RE = /^[A-Za-z0-9_-]{1,128}$/;

function resolveTestKodaxDir(rawEnv: string): string {
  // '1' / 'true' / 'on' 当作"给我生成一个 uuid";其他值原样用,方便 fixture 显式命名
  const wantsAuto =
    rawEnv === '1' || rawEnv.toLowerCase() === 'true' || rawEnv.toLowerCase() === 'on';
  if (!wantsAuto && !SAFE_TEST_SUFFIX_RE.test(rawEnv)) {
    throw new Error('KODAX_TEST_ONBOARDING must be 1/true/on or a safe [A-Za-z0-9_-] suffix');
  }
  const suffix = wantsAuto ? randomUUID() : rawEnv;
  return path.join(os.tmpdir(), `kodax-test-${suffix}`);
}

/**
 * 绝对路径(规整后);空值或非绝对路径返回 null。path.resolve 顺手把
 * Windows 上的 `c:/tools/kodax` 规整成 `C:\tools\kodax`。
 */
export function absoluteDir(value: string | undefined): string | null {
  return value && path.isAbsolute(value) ? path.resolve(value) : null;
}

function absoluteEnvDir(name: 'KODAX_HOME' | 'KODAX_PROFILE_DIR'): string | null {
  return absoluteDir(process.env[name]);
}

/**
 * `.kodax` 数据根 —— 与 KodaX CLI 共享。SDK 自己也在这里写 sessions / config / agents。
 * 默认 os.homedir()/.kodax;测试模式 → tmpdir/kodax-test-<id>;设了绝对 KODAX_HOME
 * 则 → 该目录本身。
 */
export function getKodaxDir(): string {
  if (cachedKodaxDir !== null) return cachedKodaxDir;
  const testEnv = process.env.KODAX_TEST_ONBOARDING;
  if (testEnv && testEnv.length > 0) {
    cachedKodaxDir = resolveTestKodaxDir(testEnv);
    return cachedKodaxDir;
  }
  cachedKodaxDir = absoluteEnvDir('KODAX_HOME') ?? path.join(os.homedir(), '.kodax');
  return cachedKodaxDir;
}

/**
 * `<.kodax>/space/` —— Space 独占（projects.json / settings.json / log / etc.）。
 */
export function getSpaceDataDir(): string {
  return path.join(getKodaxDir(), 'space');
}

/**
 * Electron userData 只在测试模式下跟随数据根,否则 Chromium 自己的缓存、单实例锁和
 * localStorage 仍会落到系统默认目录,测试会互相污染。数据根被用户改动(环境变量/便携版)
 * 时**不**动 userData:用户只是换了数据位置,不该丢窗口状态和 localStorage。
 * 默认返回 null → 用 Electron 默认 userData(%APPDATA%/... 等),和安装版一致。
 */
export function getScopedUserDataDir(): string | null {
  if (process.env.KODAX_TEST_ONBOARDING) return path.join(getSpaceDataDir(), 'electron-user-data');
  return null;
}

/**
 * 把 Space 解析出的数据根对齐到 SDK 实际会读的那个 env —— **KODAX_HOME**。
 *
 * ⚠️ 必须设 KODAX_HOME,不是 KODAX_SESSIONS_DIR:SDK 的 session/config 目录由
 * getAgentConfigHome() 决定,它读 `process.env.KODAX_HOME`(= `.kodax` 根本身,默认
 * os.homedir()/.kodax),并在模块加载时把 `<KODAX_HOME>/sessions` 冻结成 FileSessionStorage
 * 的默认 sessionsDir。SDK **完全不读** KODAX_SESSIONS_DIR(它只是个导出常量,不是输入 env)。
 *
 * ⚠️ 必须在任何 loadSdkModule() 动态 import **之前**(即 main bootstrap 早期)调用:那个
 * `<KODAX_HOME>/sessions` 常量在 SDK 模块首次加载时就冻结,晚设无效。
 *
 * - 测试模式:强制把 KODAX_HOME 指到隔离的 tmpdir/kodax-test-<id>，即使调用者 shell
 *   已经设置 KODAX_HOME 也不能让测试碰真实数据;KODAX_PROFILE_DIR 被忽略。
 * - 默认 / 便携版:KODAX_HOME 没设则不动,SDK 走它自己的 os.homedir()/.kodax 默认。
 * - KODAX_HOME 已设:规整回 getKodaxDir()。SDK beta.9 起与 Space 一样忽略相对路径;
 *   规整后子进程(内置终端里的旧版 CLI 等)也拿到同一个绝对根。
 * - KODAX_PROFILE_DIR(已弃用):没设 KODAX_HOME 时当作 KODAX_HOME;两者都设以 KODAX_HOME 为准。
 *   只要它是有效绝对路径就返回 deprecatedProfileDir,由调用方记录告警。
 */
export function applySdkHomeEnv(): { readonly deprecatedProfileDir: string | null } {
  const testMode = Boolean(process.env.KODAX_TEST_ONBOARDING);
  const deprecatedProfileDir = testMode ? null : absoluteEnvDir('KODAX_PROFILE_DIR');
  if (deprecatedProfileDir !== null && absoluteEnvDir('KODAX_HOME') === null) {
    process.env.KODAX_HOME = deprecatedProfileDir;
  }
  if (testMode || process.env.KODAX_HOME !== undefined) {
    process.env.KODAX_HOME = getKodaxDir();
  }
  return { deprecatedProfileDir };
}

/**
 * 测试 hook：清掉 cache 让下次读重新解析（unit test 模拟 env 切换时用）。
 * 生产路径不该用。
 */
export function _resetDataPathsCacheForTesting(): void {
  cachedKodaxDir = null;
}
