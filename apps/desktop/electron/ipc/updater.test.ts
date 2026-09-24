import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import type { UpdaterStateT } from '@kodax-space/space-ipc-schema';

type UpdaterModule = typeof import('./updater.js');
type ChannelHandler = (input: unknown) => Promise<unknown>;

interface IsolatedUpdater {
  /** bundle 产物与 electron-updater fixture 所在的临时目录，t.after 里整体删除 */
  directory: string;
  module: () => Promise<UpdaterModule>;
  fixture: () => Promise<{
    default: {
      instance: {
        checks: number;
        autoDownload: boolean;
        autoInstallOnAppQuit: boolean;
        emit: (event: string, arg?: unknown) => void;
        quitAndInstallArgs: [boolean, boolean] | null;
      };
    };
  }>;
  channels: () => Record<string, ChannelHandler>;
}

/**
 * 把 updater.ts 用 esbuild bundle 进隔离宿主：electron / register / push /
 * diagnostics 全部换成测试桩；registerChannel 捕获到 globalThis 上的
 * __updaterTestChannels，electron-updater 换成可控的 autoUpdater 桩。
 * platform 传 '"darwin"' / '"win32"' 时经 define 固定 process.platform。
 */
async function buildIsolatedUpdater(platform?: string): Promise<IsolatedUpdater> {
  const directory = await mkdtemp(path.join(tmpdir(), 'space-updater-'));
  const fixture = path.join(directory, 'updater.cjs');
  await writeFile(
    fixture,
    `
    const cbs = {};
    const instance = {
      checks: 0,
      on(event, cb) { cbs[event] = cb; },
      emit(event, arg) { cbs[event]?.(arg); },
      async checkForUpdates() { this.checks++; },
      quitAndInstallArgs: null,
      quitAndInstall(isSilent, isForceRunAfter) {
        this.quitAndInstallArgs = [isSilent, isForceRunAfter];
      },
    };
    exports.instance = instance;
    Object.defineProperty(exports, 'autoUpdater', { enumerable: true, get: () => instance });
  `,
  );
  const output = path.join(directory, 'handler.mjs');
  await build({
    entryPoints: [fileURLToPath(new URL('./updater.ts', import.meta.url))],
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    ...(platform ? { define: { 'process.platform': platform } } : {}),
    plugins: [
      {
        name: 'isolated-updater-host',
        setup(builder) {
          builder.onResolve({ filter: /^electron-updater$/ }, () => ({
            path: pathToFileURL(fixture).href,
            external: true,
          }));
          builder.onResolve(
            { filter: /^(electron|\.\/register\.js|\.\/push\.js|\.\.\/diagnostics\/runtime\.js)$/ },
            (args) => ({ path: args.path, namespace: 'host' }),
          );
          builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({
            contents: `
          export const app = { isPackaged: true };
          // esbuild 把 host 命名空间的每个虚拟模块当独立实例求值，必须幂等复用
          // 同一个 channels 对象，否则 registerChannel 与测试读到的不是同一个 map。
          globalThis.__updaterTestChannels ??= {};
          const channels = globalThis.__updaterTestChannels;
          export function registerChannel(name, handler) { channels[name] = handler; }
          export function pushToRenderer() {}
          export function getDiagnosticsLogger() { return null; }
        `,
          }));
        },
      },
    ],
  });
  return {
    directory,
    module: async () => {
      const loaded = (await import(pathToFileURL(output).href)) as UpdaterModule;
      return loaded;
    },
    fixture: async () =>
      (await import(pathToFileURL(fixture).href)) as Awaited<ReturnType<IsolatedUpdater['fixture']>>,
    channels: () =>
      (globalThis as unknown as Record<string, Record<string, ChannelHandler>>)
        .__updaterTestChannels,
  } as IsolatedUpdater;
}

test('packaged updater initializes a CommonJS getter export and checks once without downloading', async (t) => {
  const isolated = await buildIsolatedUpdater();
  t.after(() => rm(isolated.directory, { recursive: true, force: true }));
  const handler = await isolated.module();
  await Promise.all([handler.initAutoUpdater(), handler.initAutoUpdater()]);
  assert.deepEqual(handler.getUpdaterStateForDiagnostics(), { state: 'idle' });
  const loaded = await isolated.fixture();
  assert.equal(loaded.default.instance.checks, 1);
  assert.equal(loaded.default.instance.autoDownload, true);
  assert.equal(loaded.default.instance.autoInstallOnAppQuit, false);
});

test('darwin packaged app never initializes the updater and reports the channel disabled', async (t) => {
  const isolated = await buildIsolatedUpdater('"darwin"');
  t.after(() => rm(isolated.directory, { recursive: true, force: true }));
  const handler = await isolated.module();
  // 真实启动顺序：main.ts 先 registerUpdaterChannels 注册 IPC surface，再 initAutoUpdater
  await handler.registerUpdaterChannels();
  await handler.initAutoUpdater();
  assert.deepEqual(handler.getUpdaterStateForDiagnostics(), { state: 'idle' });
  // darwin 不允许 import electron-updater —— 没有任何 check 发生过
  const loaded = await isolated.fixture();
  assert.equal(loaded.default.instance.checks, 0);
  // 手动触发 updater.check 也必须被闸门挡住（enabled:false），不会拉起 updater
  const check = (await isolated.channels()['updater.check']({})) as {
    enabled: boolean;
    state: UpdaterStateT;
  };
  assert.deepEqual(check, { enabled: false, state: { state: 'idle' } });
  assert.equal(loaded.default.instance.checks, 0);
});

test('install triggers a silent NSIS quitAndInstall with force run-after', async (t) => {
  const isolated = await buildIsolatedUpdater('"win32"');
  t.after(() => rm(isolated.directory, { recursive: true, force: true }));
  const handler = await isolated.module();
  await handler.registerUpdaterChannels();
  // 挂上事件监听（ensureAutoUpdater import electron-updater 桩并注册 on(...)）
  await handler.initAutoUpdater();
  const loaded = await isolated.fixture();
  // 未 ready 时 install 必须拒绝
  const early = (await isolated.channels()['updater.install']({})) as { accepted: boolean };
  assert.equal(early.accepted, false);
  // 模拟 electron-updater 报告下载完成 → state=ready
  loaded.default.instance.emit('update-downloaded', { version: '0.1.46-rc.5' });
  assert.deepEqual(handler.getUpdaterStateForDiagnostics(), {
    state: 'ready',
    version: '0.1.46-rc.5',
  });
  const accepted = (await isolated.channels()['updater.install']({})) as { accepted: boolean };
  assert.equal(accepted.accepted, true);
  // install 内部 setTimeout 100ms 后才 quitAndInstall
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(loaded.default.instance.quitAndInstallArgs, [true, true]);
  // installing guard：第二次 invoke 必须拒绝
  const repeated = (await isolated.channels()['updater.install']({})) as { accepted: boolean };
  assert.equal(repeated.accepted, false);
});
