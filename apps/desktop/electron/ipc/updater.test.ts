import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('packaged updater initializes a CommonJS getter export and checks once without downloading', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'space-updater-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = path.join(directory, 'updater.cjs');
  await writeFile(
    fixture,
    `
    const instance = { checks: 0, on() {}, async checkForUpdates() { this.checks++; } };
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
          export function registerChannel() {}
          export function pushToRenderer() {}
          export function getDiagnosticsLogger() { return null; }
        `,
          }));
        },
      },
    ],
  });
  const handler = (await import(pathToFileURL(output).href)) as typeof import('./updater.js');
  await Promise.all([handler.initAutoUpdater(), handler.initAutoUpdater()]);
  assert.deepEqual(handler.getUpdaterStateForDiagnostics(), { state: 'idle' });
  const { default: loaded } = (await import(pathToFileURL(fixture).href)) as {
    default: { instance: { checks: number; autoDownload: boolean; autoInstallOnAppQuit: boolean } };
  };
  assert.equal(loaded.instance.checks, 1);
  assert.equal(loaded.instance.autoDownload, true);
  assert.equal(loaded.instance.autoInstallOnAppQuit, false);
});
