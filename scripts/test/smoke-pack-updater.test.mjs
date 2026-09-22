import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyPackagedUpdater } from '../smoke-pack.mjs';

test('the application production manifest and lock include the updater runtime', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  const lock = JSON.parse(
    await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.dependencies['electron-updater'], '^6.8.3');
  assert.equal(
    lock.packages[''].dependencies['electron-updater'],
    manifest.dependencies['electron-updater'],
  );
});

test('packaged updater smoke rejects a missing dependency and validates the lazy namespace without starting it', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-updater-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const asarPath = path.join(root, 'app.asar');
  await mkdir(asarPath);
  await writeFile(path.join(asarPath, 'package.json'), '{}');
  assert.throws(
    () => verifyPackagedUpdater({ asarPath, executable: process.execPath }),
    /packaged updater probe failed/,
  );
  const modulePath = path.join(asarPath, 'node_modules', 'electron-updater');
  await mkdir(modulePath, { recursive: true });
  await writeFile(path.join(modulePath, 'package.json'), '{"main":"index.cjs"}');
  await writeFile(
    path.join(modulePath, 'index.cjs'),
    `Object.defineProperty(exports, 'autoUpdater', { get() { throw new Error('must stay lazy'); } });`,
  );
  assert.doesNotThrow(() => verifyPackagedUpdater({ asarPath, executable: process.execPath }));
  await writeFile(path.join(modulePath, 'index.cjs'), 'exports.unrelated = true;');
  assert.throws(
    () => verifyPackagedUpdater({ asarPath, executable: process.execPath }),
    /autoUpdater getter is missing/,
  );
});
