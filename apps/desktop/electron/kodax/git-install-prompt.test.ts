import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

type GitStatusHandler = (input: { projectRoot: string }) => Promise<{
  isGitRepo: boolean;
  dirty: boolean;
  branch: string | null;
}>;
type SettingsModule = typeof import('../settings/store.js');
type ProjectModule = typeof import('../ipc/project.js');
type ProbeOptions = { cwd?: string; env?: NodeJS.ProcessEnv; executable?: string };

// Exercise the production callers and adapter; replace only the host/OS boundaries.
async function fixture(
  platform: 'darwin' | 'win32' | 'linux',
  check: ((options?: ProbeOptions) => Promise<void>) | undefined,
) {
  const handlers = new Map<string, GitStatusHandler>();
  const calls: Array<{ command: string; args: readonly string[]; cwd?: string }> = [];
  let sdkLoads = 0;
  const realRequire = createRequire(import.meta.url);
  const load = async (entry: string): Promise<unknown> => {
    const result = await build({
      entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'node',
      external: ['electron', '@kodax-ai/kodax/agent', './register.js', '../projects/store.js'],
      define: { 'process.platform': JSON.stringify(platform) },
      supported: { 'dynamic-import': false },
    });
    const module = { exports: {} };
    const require = (id: string): unknown => {
      if (id === 'electron') return { BrowserWindow: {}, dialog: {} };
      if (id === './register.js') {
        return {
          registerChannel: (name: string, handler: GitStatusHandler) => handlers.set(name, handler),
        };
      }
      if (id === '../projects/store.js') {
        return { projectStore: { assertAllowed: async (cwd: string) => cwd } };
      }
      if (id === '@kodax-ai/kodax/agent') {
        sdkLoads += 1;
        return check ? { assertNoGitInstallPrompt: check } : {};
      }
      if (id === 'node:child_process') {
        return {
          spawn(command: string, args: readonly string[], options: { cwd?: string }) {
            calls.push({ command, args, cwd: options.cwd });
            const child = Object.assign(new EventEmitter(), {
              stdout: new PassThrough(),
              kill: () => true,
            });
            queueMicrotask(() => {
              child.stdout.end(args[0] === 'status' ? '## main\n M file.ts\n' : '.git\n');
              child.emit('close', 0);
            });
            return child;
          },
          execFile(
            command: string,
            args: readonly string[],
            options: { cwd?: string },
            callback: (error: null, stdout: string, stderr: string) => void,
          ) {
            calls.push({ command, args, cwd: options.cwd });
            callback(null, '', '');
          },
        };
      }
      return realRequire(id);
    };
    new Function('require', 'module', 'exports', result.outputFiles[0]!.text)(
      require,
      module,
      module.exports,
    );
    return module.exports;
  };
  return {
    calls,
    sdkLoads: () => sdkLoads,
    async project() {
      ((await load('../ipc/project.ts')) as ProjectModule).registerProjectChannels();
      return handlers.get('project.gitStatus')!;
    },
    async settings() {
      return ((await load('../settings/store.ts')) as SettingsModule).SettingsStore;
    },
  };
}

test('project status does not start Git when macOS reports missing developer tools', async () => {
  const checked: ProbeOptions[] = [];
  const f = await fixture('darwin', async (options) => {
    checked.push(options ?? {});
    throw new Error('macOS developer tools unavailable');
  });
  const status = await f.project();
  const result = await status({ projectRoot: '/workspace' });
  assert.equal(result.isGitRepo, false);
  assert.deepEqual(f.calls, []);
  assert.equal(checked[0]?.cwd, '/workspace');
});

test('workspace creation survives a blocked macOS Git init without starting Git', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'space-git-prompt-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const warning = t.mock.method(console, 'warn', () => undefined);
  t.mock.method(console, 'info', () => undefined);
  const checked: ProbeOptions[] = [];
  let available = false;
  const f = await fixture('darwin', async (options) => {
    checked.push(options ?? {});
    if (!available) throw new Error('macOS developer tools unavailable');
  });
  const Store = await f.settings();
  const settingsFile = path.join(directory, 'settings.json');
  await fs.writeFile(
    settingsFile,
    JSON.stringify({
      version: 1,
      defaultWorkspace: path.join(directory, 'workspace'),
    }),
  );
  const store = new Store(settingsFile, directory);
  await store.ensureWorkspaceExists();
  const { defaultWorkspace } = await store.load();
  assert.equal((await fs.stat(defaultWorkspace)).isDirectory(), true);
  assert.deepEqual(f.calls, []);
  assert.equal(checked[0]?.cwd, defaultWorkspace);
  assert.match(String(warning.mock.calls[0]?.arguments[0]), /developer tools unavailable/);
  available = true;
  await store.ensureWorkspaceExists();
  assert.deepEqual(f.calls, [{ command: 'git', args: ['init', '-q'], cwd: defaultWorkspace }]);
  assert.equal(f.sdkLoads(), 1);
});

for (const platform of ['win32', 'linux'] as const) {
  test(`${platform} project Git calls preserve behavior without loading the SDK guard`, async () => {
    const f = await fixture(platform, undefined);
    const status = await f.project();
    const result = await status({ projectRoot: '/workspace' });
    assert.equal(result.isGitRepo, true);
    assert.equal(result.dirty, true);
    assert.equal(result.branch, 'main');
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0]?.command, 'git');
    assert.deepEqual(f.calls[0]?.args, ['rev-parse', '--git-dir']);
    assert.equal(f.sdkLoads(), 0);
  });
}

test('macOS preflight failure expires with the existing status cache and can recover', async (t) => {
  let clock = 10_000;
  t.mock.method(Date, 'now', () => clock);
  let available = false;
  let checks = 0;
  const f = await fixture('darwin', async () => {
    checks += 1;
    if (!available) throw new Error('macOS developer tools unavailable');
  });
  const status = await f.project();
  assert.equal(f.sdkLoads(), 0, 'registering channels must not load the SDK');
  assert.equal((await status({ projectRoot: '/workspace' })).isGitRepo, false);
  available = true;
  clock += 6_000;
  assert.equal((await status({ projectRoot: '/workspace' })).isGitRepo, true);
  assert.equal(f.calls.length, 2);
  assert.equal(checks, 3, 'each actual Git invocation rechecks availability');
  assert.equal(f.sdkLoads(), 1, 'cache the SDK import, not a failed preflight');
});
