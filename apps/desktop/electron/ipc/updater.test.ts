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
        downloads: number;
        allowPrerelease: boolean;
        allowDowngrade: boolean;
        channel: string;
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
async function buildIsolatedUpdater(
  platform?: string,
  version = '0.1.46',
): Promise<IsolatedUpdater> {
  const directory = await mkdtemp(path.join(tmpdir(), 'space-updater-'));
  const fixture = path.join(directory, 'updater.cjs');
  await writeFile(
    fixture,
    `
    const cbs = {};
    const instance = {
      checks: 0,
      downloads: 0,
      on(event, cb) { cbs[event] = cb; },
      emit(event, arg) { cbs[event]?.(arg); },
      async checkForUpdates() { this.checks++; },
      async downloadUpdate() { this.downloads++; },
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
          export const app = { isPackaged: true, getVersion: () => ${JSON.stringify(version)} };
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
      (await import(pathToFileURL(fixture).href)) as Awaited<
        ReturnType<IsolatedUpdater['fixture']>
      >,
    channels: () =>
      (globalThis as unknown as Record<string, Record<string, ChannelHandler>>)
        .__updaterTestChannels,
  } as IsolatedUpdater;
}

test('packaged startup never checks or downloads until the user checks in settings', async (t) => {
  // Pin the supported-platform bundle: without a define the isolated host keeps
  // the real process.platform, so a darwin runner would hit the updater gate
  // this suite tests separately below.
  const isolated = await buildIsolatedUpdater('"win32"');
  t.after(() => rm(isolated.directory, { recursive: true, force: true }));
  const handler = await isolated.module();
  await Promise.all([handler.initAutoUpdater(), handler.initAutoUpdater()]);
  assert.deepEqual(handler.getUpdaterStateForDiagnostics(), { state: 'idle' });
  const loaded = await isolated.fixture();
  assert.equal(loaded.default.instance.checks, 0);
  await handler.registerUpdaterChannels();
  await isolated.channels()['updater.check']({});
  assert.equal(loaded.default.instance.checks, 1);
  assert.equal(loaded.default.instance.autoDownload, false);
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
  await handler.registerUpdaterChannels({
    requestInstall: async (install) => {
      install();
      return true;
    },
  });
  await isolated.channels()['updater.check']({});
  const loaded = await isolated.fixture();
  // 未 ready 时 install 必须拒绝
  const early = (await isolated.channels()['updater.install']({ version: '0.1.47' })) as {
    accepted: boolean;
  };
  assert.equal(early.accepted, false);
  // 模拟 electron-updater 报告下载完成 → state=ready
  loaded.default.instance.emit('update-available', { version: '0.1.47' });
  await isolated.channels()['updater.download']({ version: '0.1.47' });
  loaded.default.instance.emit('update-downloaded', { version: '0.1.47' });
  assert.deepEqual(handler.getUpdaterStateForDiagnostics(), {
    state: 'ready',
    version: '0.1.47',
  });
  const accepted = (await isolated.channels()['updater.install']({ version: '0.1.47' })) as {
    accepted: boolean;
  };
  assert.equal(accepted.accepted, true);
  // install 内部 setTimeout 100ms 后才 quitAndInstall
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(loaded.default.instance.quitAndInstallArgs, [true, true]);
  // installing guard：第二次 invoke 必须拒绝
  const repeated = (await isolated.channels()['updater.install']({ version: '0.1.47' })) as {
    accepted: boolean;
  };
  assert.equal(repeated.accepted, false);
});

test('checking and discovering a release never authorize its download or a cached install', async (t) => {
  const isolated = await buildIsolatedUpdater('"win32"');
  t.after(() => rm(isolated.directory, { recursive: true, force: true }));
  const handler = await isolated.module();
  handler.registerUpdaterChannels();
  await isolated.channels()['updater.getState']({});
  const loaded = await isolated.fixture();
  assert.equal(loaded.default.instance.checks, 0);
  await isolated.channels()['updater.check']({});
  loaded.default.instance.emit('update-downloaded', { version: '0.1.47' });
  assert.notEqual(handler.getUpdaterStateForDiagnostics().state, 'ready');
  loaded.default.instance.emit('update-available', { version: '0.1.47' });
  assert.equal(loaded.default.instance.downloads, 0);
  assert.deepEqual(await isolated.channels()['updater.download']({ version: '0.1.48' }), {
    accepted: false,
  });
  assert.deepEqual(await isolated.channels()['updater.download']({ version: '0.1.47' }), {
    accepted: true,
  });
  assert.equal(loaded.default.instance.downloads, 1);
  assert.deepEqual(await isolated.channels()['updater.download']({ version: '0.1.47' }), {
    accepted: false,
  });
  loaded.default.instance.emit('update-downloaded', { version: '0.1.48' });
  assert.equal(handler.getUpdaterStateForDiagnostics().state, 'downloading');
  loaded.default.instance.emit('update-downloaded', { version: '0.1.47' });
  assert.deepEqual(await isolated.channels()['updater.install']({ version: '0.1.48' }), {
    accepted: false,
  });
});

test('a stable installation rejects prereleases even when a contaminated latest feed offers one', async (t) => {
  const isolated = await buildIsolatedUpdater('"win32"');
  t.after(() => rm(isolated.directory, { recursive: true, force: true }));
  const handler = await isolated.module();
  handler.registerUpdaterChannels();
  await isolated.channels()['updater.check']({});
  const { instance } = (await isolated.fixture()).default;
  assert.equal(instance.allowPrerelease, false);
  assert.equal(instance.channel, 'latest');
  assert.equal(instance.allowDowngrade, false);
  instance.emit('update-available', { version: '0.1.47-alpha.3' });
  assert.equal(handler.getUpdaterStateForDiagnostics().state, 'error');
  assert.deepEqual(await isolated.channels()['updater.download']({ version: '0.1.47-alpha.3' }), {
    accepted: false,
  });
  instance.emit('update-downloaded', { version: '0.1.47-alpha.3' });
  assert.deepEqual(await isolated.channels()['updater.install']({ version: '0.1.47-alpha.3' }), {
    accepted: false,
  });
  assert.equal(instance.downloads, 0);
});

test('a prerelease installation accepts its own channel and stable releases only', async (t) => {
  const isolated = await buildIsolatedUpdater('"linux"', '0.1.47-alpha.3');
  t.after(() => rm(isolated.directory, { recursive: true, force: true }));
  const handler = await isolated.module();
  handler.registerUpdaterChannels();
  await isolated.channels()['updater.check']({});
  const { instance } = (await isolated.fixture()).default;
  assert.equal(instance.channel, 'alpha');
  assert.equal(instance.allowPrerelease, true);
  instance.emit('update-available', { version: '0.1.47-beta.1' });
  assert.equal(handler.getUpdaterStateForDiagnostics().state, 'error');
  for (const version of ['0.1.47-alpha.4', '0.1.47']) {
    instance.emit('update-available', { version });
    assert.deepEqual(handler.getUpdaterStateForDiagnostics(), { state: 'available', version });
  }
});

for (const permitted of [false, true]) {
  test(`installation waits for the host safe-exit barrier (${permitted ? 'accepted' : 'blocked'})`, async (t) => {
    const isolated = await buildIsolatedUpdater('"win32"');
    t.after(() => rm(isolated.directory, { recursive: true, force: true }));
    let release!: (allowed: boolean) => void;
    const barrier = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const handler = await isolated.module();
    handler.registerUpdaterChannels({
      requestInstall: async (install: () => void) => {
        const allowed = await barrier;
        if (allowed) install();
        return allowed;
      },
    });
    await isolated.channels()['updater.check']({});
    const { instance } = (await isolated.fixture()).default;
    instance.emit('update-available', { version: '0.1.47' });
    await isolated.channels()['updater.download']({ version: '0.1.47' });
    instance.emit('update-downloaded', { version: '0.1.47' });
    assert.deepEqual(await isolated.channels()['updater.install']({ version: '0.1.47' }), {
      accepted: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(
      instance.quitAndInstallArgs,
      null,
      'the installer must wait for completed safe shutdown',
    );
    release(permitted);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(instance.quitAndInstallArgs, permitted ? [true, true] : null);
  });
}
