// 自动更新 handler — F022 (v0.1.3)
//
// 包装 electron-updater 的 autoUpdater：
//   - 启动时若 app.isPackaged → 立即 checkForUpdates()
//   - darwin 禁用（见 isUpdaterSupportedPlatform：未签名构建 Squirrel.Mac 装不上）
//   - 把 'update-available' / 'download-progress' / 'update-downloaded' / 'error'
//     桥接到 push channel 'updater.status'
//   - 提供 'updater.check'（手动触发）和 'updater.install'（quitAndInstall）
//
// 为什么不直接在 main.ts inline：
//   - electron-updater 在 dev (app.isPackaged=false) 下 require 失败 / 抛 unsigned 错
//     —— 用 dynamic import + try/catch 把整个 updater 模块隔离掉，避免拖垮主流程
//   - autoUpdater 是 stateful，手动 check + ready 后 install 都需要拿到同一个实例
//
// 错误 sanitize：
//   electron-updater 的错误信息常常包含本地 cache 路径（%APPDATA%、~/.../Caches/...）
//   和 GitHub feed URL。我们截到 280 字符 + 替换掉绝对路径段，再 push 到 renderer。

import { app } from 'electron';
import { registerChannel } from './register.js';
import { pushToRenderer } from './push.js';
import type { UpdaterStateT } from '@kodax-space/space-ipc-schema';
import { getDiagnosticsLogger } from '../diagnostics/runtime.js';

let currentState: UpdaterStateT = { state: 'idle' };
let autoUpdaterInstance: typeof import('electron-updater').autoUpdater | null = null;
let initStarted = false;

/**
 * macOS 构建未签名（electron-builder.yml `mac.identity: null`，FEATURE_027 签名计划
 * 已于 2026-06-05 移除）。electron-updater 在 mac 上走 Squirrel.Mac，替换 /Applications
 * 里的应用前强制校验代码签名——下载、checksum 都能过（UI 会弹"已就绪"），但最后替换
 * 必然失败，且失败是异步静默的：按钮永远停在"安装中..."，也不报错。未恢复签名前，
 * darwin 直接不启用 updater（state 恒为 idle，banner 永不出现），用户走 Releases 页
 * 手动下载 DMG。
 */
function isUpdaterSupportedPlatform(): boolean {
  return process.platform !== 'darwin';
}
/**
 * v0.1.4 review LOW-5：cache the Promise，不是 resolved value。
 * 之前 ensureAutoUpdater 同时被两个 caller 触发时（startup initAutoUpdater + 用户点
 * "Check for updates"），都会看到 autoUpdaterInstance === null → 各自 import + 注册
 * listener 一遍，每个 SDK 事件双重触发 pushState。改成 promise cache 后第二个 caller
 * 直接 await 第一个 in-flight 的初始化。
 */
let ensureUpdaterPromise: Promise<typeof import('electron-updater').autoUpdater | null> | null =
  null;
/**
 * v0.1.4 review LOW-4：double-install race guard。
 * 用户在 100ms setTimeout 内连点 "Restart & install" 会触发两次 quitAndInstall →
 * NSIS 装两次。`installing` 标记在第一次 invoke 处立即翻 true，第二次 invoke
 * return {accepted:false}。
 */
let installing = false;

export function getUpdaterStateForDiagnostics(): UpdaterStateT {
  return { ...currentState };
}

function pushState(next: UpdaterStateT): void {
  currentState = next;
  getDiagnosticsLogger()?.info('updater', 'state_changed', undefined, {
    state: next.state,
    ...('version' in next ? { version: next.version } : {}),
    ...('percent' in next ? { percent: next.percent } : {}),
    ...('message' in next ? { message: next.message } : {}),
  });
  pushToRenderer('updater.status', next);
}

/**
 * 把绝对路径段替换为 <path>，截到 280 字符；不暴露 cache 目录给 renderer。
 *
 * v0.1.4 review LOW-3 修复：之前 Windows regex 只匹配大写盘符 `C:\`，漏掉 Node fs API
 * 偶尔产出的小写 `c:\`；也漏掉 UNC 路径 `\\server\share\...`。三个 pattern 并到一个
 * union，case-insensitive 标志覆盖盘符大小写。
 *
 * 漏报危害低（前面 280 char slice 兜底），但 cache 路径里能含用户名 / 项目名时仍想 strip。
 */
function sanitizeErrorMessage(msg: string): string {
  return (
    msg
      // Windows 盘符 (大写 + 小写) + UNC + POSIX 路径，一个 union 顶
      .replace(/([A-Za-z]:[\\/][^\s]+|\\\\[^\s]+|\/[A-Za-z][^\s]+)/g, '<path>')
      .slice(0, 280)
      .trim() || 'Update check failed'
  );
}

async function ensureAutoUpdater(): Promise<typeof import('electron-updater').autoUpdater | null> {
  if (autoUpdaterInstance) return autoUpdaterInstance;
  if (ensureUpdaterPromise) return ensureUpdaterPromise;
  ensureUpdaterPromise = (async () => {
    try {
      const mod = await import('electron-updater');
      // Native import() exposes this CommonJS getter on default, not as a
      // synthetic named export. Preserve lazy loading for packaged apps only.
      autoUpdaterInstance = (mod.default ?? mod).autoUpdater;
      // 默认行为：下载 ready 后不立即重启，等用户点 install
      autoUpdaterInstance.autoDownload = true;
      autoUpdaterInstance.autoInstallOnAppQuit = false;
      autoUpdaterInstance.logger = null; // electron-updater 默认接 electron-log，未装时会报警

      autoUpdaterInstance.on('checking-for-update', () => {
        pushState({ state: 'checking' });
      });
      autoUpdaterInstance.on('update-available', (info) => {
        pushState({ state: 'available', version: String(info.version ?? '') || 'unknown' });
      });
      autoUpdaterInstance.on('update-not-available', () => {
        pushState({ state: 'idle' });
      });
      autoUpdaterInstance.on('download-progress', (progress) => {
        const percent =
          typeof progress.percent === 'number' ? Math.max(0, Math.min(100, progress.percent)) : 0;
        const version =
          currentState.state === 'available' ||
          currentState.state === 'downloading' ||
          currentState.state === 'ready'
            ? currentState.version
            : 'unknown';
        pushState({ state: 'downloading', version, percent });
      });
      autoUpdaterInstance.on('update-downloaded', (info) => {
        pushState({ state: 'ready', version: String(info.version ?? '') || 'unknown' });
      });
      autoUpdaterInstance.on('error', (err) => {
        const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
        pushState({ state: 'error', message });
      });
      return autoUpdaterInstance;
    } catch (err) {
      const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
      pushState({ state: 'error', message: `updater unavailable: ${message}`.slice(0, 280) });
      // 失败的 promise 留在 cache 里返 null，避免反复重试一个本来就拿不到的包
      return null;
    }
  })();
  return ensureUpdaterPromise;
}

/**
 * main.ts 在 app.whenReady 之后调一次。dev 模式（!app.isPackaged）
 * 直接跳过 —— electron-updater 在未签名 dev 包里会立刻 error 出来。
 */
export async function initAutoUpdater(): Promise<void> {
  if (initStarted) return;
  initStarted = true;
  if (!app.isPackaged || !isUpdaterSupportedPlatform()) {
    // dev / darwin：保持 idle，UI 呈现 "no updates" 状态，banner 永不弹出
    pushState({ state: 'idle' });
    return;
  }
  const inst = await ensureAutoUpdater();
  if (!inst) return;
  try {
    await inst.checkForUpdates();
  } catch (err) {
    const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
    pushState({ state: 'error', message });
  }
}

export function registerUpdaterChannels(): void {
  registerChannel('updater.check', async () => {
    if (!app.isPackaged || !isUpdaterSupportedPlatform()) {
      return { enabled: false, state: { state: 'idle' } };
    }
    const inst = await ensureAutoUpdater();
    if (!inst) {
      return { enabled: true, state: currentState };
    }
    try {
      await inst.checkForUpdates();
    } catch (err) {
      const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
      pushState({ state: 'error', message });
    }
    return { enabled: true, state: currentState };
  });

  registerChannel('updater.install', async () => {
    if (!app.isPackaged || !autoUpdaterInstance) {
      return { accepted: false };
    }
    if (currentState.state !== 'ready') {
      return { accepted: false };
    }
    // v0.1.4 review LOW-4: 在 setTimeout 排 quitAndInstall 之前**立刻**翻 installing=true。
    // 这样第二次 invoke 在 100ms 窗口内进来时能在上面 currentState !== 'ready' 之外
    // 多一道短路。我们用 installing flag 而不是只改 currentState 是因为 currentState
    // 是 schema discriminated union（没有 'installing' state，扩 schema 会拉大改动面），
    // 而 installing 是纯 main 端 guard 没有 wire 出去的必要。
    if (installing) return { accepted: false };
    installing = true;
    // isSilent=true, isForceRunAfter=true —— NSIS 走 /S 静默安装（复用注册表里记录的
    // 安装目录，不弹 Setup 向导）+ 装完自动起新版。之前 isSilent=false 会让 oneClick:false
    // 的 assisted 安装包在**每次自动更新时都弹完整安装向导**，用户要点一遍 Next。
    setTimeout(() => {
      try {
        autoUpdaterInstance?.quitAndInstall(true, true);
      } catch (err) {
        const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
        // 失败重置 installing 让用户可以再试（quitAndInstall 偶尔抛是 known electron-updater 行为）
        installing = false;
        pushState({ state: 'error', message });
      }
    }, 100);
    return { accepted: true };
  });
}
