import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, lstat, readlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const afterPack = require('../after-pack.cjs');
const { Arch } = require('builder-util');
const macOnly = { skip: process.platform !== 'darwin' };

async function packageFixture(t, cliContent, binaryContent = cliContent) {
  const appOutDir = await mkdtemp(path.join(os.tmpdir(), 'space-esbuild-package-'));
  t.after(() => rm(appOutDir, { recursive: true, force: true }));
  const modules = path.join(
    appOutDir,
    'Fixture.app/Contents/Resources/app.asar.unpacked/node_modules',
  );
  const cli = path.join(modules, 'esbuild/bin/esbuild');
  const binary = path.join(modules, '@esbuild/darwin-arm64/bin/esbuild');
  for (const [file, content] of [
    [cli, cliContent],
    [binary, binaryContent],
  ]) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, { mode: 0o755 });
  }
  const context = {
    appOutDir,
    electronPlatformName: 'darwin',
    arch: Arch.arm64,
    packager: { appInfo: { productFilename: 'Fixture' } },
  };
  return { cli, binary, context };
}

test(
  'Mac package stores one identical esbuild binary and keeps both executable entry points',
  macOnly,
  async (t) => {
    const content = '#!/bin/sh\nprintf "fixture-esbuild-version\\n"\n';
    const { cli, binary, context } = await packageFixture(t, content);
    await afterPack(context);
    assert.equal((await lstat(cli)).isSymbolicLink(), true);
    assert.equal(path.isAbsolute(await readlink(cli)), false);
    assert.equal(await readFile(binary, 'utf8'), content);
    for (const executable of [cli, binary]) {
      const result = spawnSync(executable, ['--version'], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, 'fixture-esbuild-version\n');
    }
    await afterPack(context);
    assert.equal(await readFile(cli, 'utf8'), content);
  },
);

test('Mac package preserves an esbuild CLI wrapper with different bytes', macOnly, async (t) => {
  const { cli, binary, context } = await packageFixture(t, 'cli wrapper', 'native binary');
  await afterPack(context);
  assert.equal((await lstat(cli)).isFile(), true);
  assert.equal(await readFile(cli, 'utf8'), 'cli wrapper');
  assert.equal(await readFile(binary, 'utf8'), 'native binary');
});

test('Mac package keeps the CLI when the optional native package is absent', macOnly, async (t) => {
  const { cli, binary, context } = await packageFixture(t, 'standalone CLI');
  await rm(binary);
  await afterPack(context);
  assert.equal((await lstat(cli)).isFile(), true);
  assert.equal(await readFile(cli, 'utf8'), 'standalone CLI');
});
