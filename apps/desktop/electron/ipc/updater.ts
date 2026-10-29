// Manual updater: startup is offline; check, download and install require user gestures.

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
 * darwin 直接不启用 updater，设置中引导用户走 Releases 页
 * 手动下载 DMG。
 */
function isUpdaterSupportedPlatform(): boolean {
  return process.platform !== 'darwin';
}
/**
 * v0.1.4 review LOW-5：cache the Promise，不是 resolved value。
 * ensureAutoUpdater 同时被多个用户请求触发时，可能同时看到 null → 各自 import + 注册
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
let downloadVersion: string | undefined;
let checkingPromise: Promise<unknown> | null = null;

function releaseChannel(version: string): string | null {
  return /^\d+\.\d+\.\d+-([0-9A-Za-z-]+)/.exec(version)?.[1] ?? null;
}

function isAllowedUpdate(version: string): boolean {
  if (
    version.length > 64 ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
  )
    return false;
  const channel = releaseChannel(version);
  return channel === null || channel === releaseChannel(app.getVersion());
}

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
      // Both transfer and installation require a separate confirmed request.
      autoUpdaterInstance.autoDownload = false;
      autoUpdaterInstance.autoInstallOnAppQuit = false;
      const channel = releaseChannel(app.getVersion());
      autoUpdaterInstance.allowPrerelease = channel !== null;
      autoUpdaterInstance.channel = channel ?? 'latest';
      autoUpdaterInstance.allowDowngrade = false;
      autoUpdaterInstance.logger = null; // electron-updater 默认接 electron-log，未装时会报警

      autoUpdaterInstance.on('checking-for-update', () => {
        pushState({ state: 'checking' });
      });
      autoUpdaterInstance.on('update-available', (info) => {
        const version = String(info.version ?? '');
        if (!isAllowedUpdate(version)) {
          pushState({
            state: 'error',
            message:
              'The update feed returned a version outside this installation’s release channel.',
          });
          return;
        }
        pushState({ state: 'available', version });
      });
      autoUpdaterInstance.on('update-not-available', () => {
        pushState({ state: 'idle' });
      });
      autoUpdaterInstance.on('download-progress', (progress) => {
        if (!downloadVersion || currentState.state !== 'downloading') return;
        const percent =
          typeof progress.percent === 'number' && Number.isFinite(progress.percent)
            ? Math.max(0, Math.min(100, progress.percent))
            : 0;
        const version = downloadVersion;
        pushState({ state: 'downloading', version, percent });
      });
      autoUpdaterInstance.on('update-downloaded', (info) => {
        const version = String(info.version ?? '');
        if (version !== downloadVersion || !isAllowedUpdate(version)) return;
        pushState({ state: 'ready', version });
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
 * main.ts 在 app.whenReady 之后调一次；只初始化本地状态，不检查或下载。
 */
export async function initAutoUpdater(): Promise<void> {
  if (initStarted) return;
  initStarted = true;
  // Bootstrap only initializes local state. Checking and downloading require IPC gestures.
  pushState({ state: 'idle' });
}

export function registerUpdaterChannels(options?: {
  readonly requestInstall: (install: () => void) => Promise<boolean>;
}): void {
  registerChannel('updater.getState', async () => ({
    enabled: app.isPackaged && isUpdaterSupportedPlatform(),
    state: getUpdaterStateForDiagnostics(),
  }));
  registerChannel('updater.check', async () => {
    if (!app.isPackaged || !isUpdaterSupportedPlatform()) {
      return { enabled: false, state: { state: 'idle' } };
    }
    const inst = await ensureAutoUpdater();
    if (!inst) {
      return { enabled: true, state: currentState };
    }
    if (currentState.state === 'downloading' || installing)
      return { enabled: true, state: currentState };
    if (!checkingPromise) {
      downloadVersion = undefined;
      checkingPromise = Promise.resolve()
        .then(() => inst.checkForUpdates())
        .catch((err: unknown) => {
          pushState({
            state: 'error',
            message: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
          });
        })
        .finally(() => {
          checkingPromise = null;
        });
    }
    await checkingPromise;
    return { enabled: true, state: currentState };
  });

  registerChannel('updater.download', async ({ version }) => {
    if (
      !app.isPackaged ||
      !autoUpdaterInstance ||
      installing ||
      currentState.state !== 'available' ||
      currentState.version !== version ||
      !isAllowedUpdate(version)
    )
      return { accepted: false };
    downloadVersion = version;
    pushState({ state: 'downloading', version, percent: 0 });
    const inst = autoUpdaterInstance;
    void Promise.resolve()
      .then(() => inst.downloadUpdate())
      .catch((error: unknown) => {
        if (downloadVersion !== version) return;
        downloadVersion = undefined;
        pushState({
          state: 'error',
          message: sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
        });
      });
    return { accepted: true };
  });

  registerChannel('updater.install', async ({ version }) => {
    if (!app.isPackaged || !autoUpdaterInstance || !options) {
      return { accepted: false };
    }
    if (
      currentState.state !== 'ready' ||
      currentState.version !== version ||
      downloadVersion !== version ||
      !isAllowedUpdate(version)
    ) {
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
      const install = (): void => {
        if (
          currentState.state !== 'ready' ||
          currentState.version !== version ||
          downloadVersion !== version
        )
          throw new Error('The confirmed update is no longer ready.');
        autoUpdaterInstance?.quitAndInstall(true, true);
        if (getUpdaterStateForDiagnostics().state === 'error')
          throw new Error('The update installer could not be started.');
      };
      void options
        .requestInstall(install)
        .then((accepted) => {
          if (accepted) return;
          installing = false;
          pushState({
            state: 'error',
            message:
              'Installation was canceled or blocked. Finish active work and close other clients, then try again.',
          });
        })
        .catch((error: unknown) => {
          installing = false;
          pushState({
            state: 'error',
            message: sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
          });
        });
    }, 100);
    return { accepted: true };
  });
}
