import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { ProviderCliProcessOptions } from './provider-cli-process.js';
import {
  createTencentMeetingPrivateProcess,
  createTencentMeetingInstaller,
  verifyTencentMeetingBinary,
} from './tencent-meeting-runtime.js';
import { createTencentMeetingConnector } from './tencent-meeting-connector.js';

const profile = 'space-2dc58f91-02b9-4439-aef1-4381273c9dd8';

test('Tencent Meeting isolates both config and encrypted data, verifies each dispatch, and claims login once', async (context) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-tmeet-runtime-')));
  context.after(() => rm(root, { recursive: true, force: true }));
  let processOptions: ProviderCliProcessOptions | undefined;
  let verifications = 0;
  let dispatches = 0;
  const signal = new AbortController().signal;
  const executable = path.join(root, 'tmeet');
  await writeFile(executable, 'fixture');
  const run = createTencentMeetingPrivateProcess(root, executable, profile, {
    verifyBinary: async (_file, actualSignal) => {
      assert.equal(actualSignal, signal);
      verifications++;
      return true;
    },
    createProcess: (options) => {
      processOptions = options;
      return async (input) => {
        await input.beforeSpawn?.();
        input.assertSpawn?.();
        dispatches++;
        return { stdout: '', stderr: '', exitCode: 0 };
      };
    },
  });
  await run({ args: ['--version'], signal });
  await run({ args: ['auth', 'login', '--no-browser'], signal });
  const base = path.join(root, 'tencent-meeting-cli', 'profiles', profile);
  assert.equal(processOptions?.cwd, path.join(base, 'work'));
  assert.deepEqual(processOptions?.overrides, {
    TMEET_CLI_CONFIG_DIR: path.join(base, 'config'),
    TMEET_CLI_DATA_DIR: path.join(base, 'data'),
  });
  assert.equal(processOptions?.env, undefined);
  assert.equal(verifications, 4);
  await assert.rejects(run({ args: ['auth', 'login', '--no-browser'], signal }), {
    code: 'invalid_response',
  });
  assert.equal(dispatches, 2);
});

test('Tencent Meeting default inspection does not install, spawn or create a credential profile for a missing binary', async (context) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-tmeet-missing-')));
  context.after(() => rm(root, { recursive: true, force: true }));
  const connector = createTencentMeetingConnector({ root, platform: 'darwin', arch: 'arm64' });
  assert.deepEqual(await connector.inspect(profile), { installed: false });
  assert.deepEqual(await readdir(root), []);
  await assert.rejects(
    connector.run({
      profile,
      installCli: false,
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
    { code: 'needs_install' },
  );
  assert.deepEqual(await readdir(root), []);
});

test('Tencent Meeting native verification rejects missing, truncated, modified, linked and cancelled artifacts', async (context) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-tmeet-hash-')));
  context.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'untrusted-tmeet');
  assert.equal(await verifyTencentMeetingBinary(file), false);
  await writeFile(file, '#!/bin/sh\nexit 0');
  assert.equal(await verifyTencentMeetingBinary(file), false);
  await writeFile(file, Buffer.alloc(6978882));
  assert.equal(await verifyTencentMeetingBinary(file), false);
  const link = path.join(root, 'linked-tmeet');
  await symlink(file, link);
  assert.equal(await verifyTencentMeetingBinary(link), false);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(verifyTencentMeetingBinary(file, controller.signal), { code: 'cancelled' });
});

test('Tencent Meeting never dispatches an unverified native binary', async (context) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-tmeet-noexec-')));
  context.after(() => rm(root, { recursive: true, force: true }));
  const run = createTencentMeetingPrivateProcess(root, path.join(root, 'tmeet'), profile, {
    verifyBinary: async () => false,
    createProcess: () => async () => {
      assert.fail('unverified binary executed');
    },
  });
  await assert.rejects(run({ args: ['--version'] }), { code: 'needs_install' });
  assert.deepEqual(await readdir(root), []);
});

test('Tencent Meeting reauthenticates native bytes after the asynchronous host gate before dispatch', async (context) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-tmeet-dispatch-')));
  context.after(() => rm(root, { recursive: true, force: true }));
  const executable = path.join(root, 'tmeet');
  await writeFile(executable, 'verified fixture');
  let dispatches = 0;
  const run = createTencentMeetingPrivateProcess(root, executable, profile, {
    verifyBinary: async (file) => (await readFile(file, 'utf8')) === 'verified fixture',
    createProcess: () => async (input) => {
      await input.beforeSpawn?.();
      input.assertSpawn?.();
      dispatches++;
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  });
  await assert.rejects(
    run({
      args: ['meeting', 'get', '--meeting-id', '123', '--format', 'json'],
      beforeSpawn: async () => {
        await writeFile(executable, 'replaced fixture');
      },
    }),
    { code: 'installation_failed' },
  );
  assert.equal(
    dispatches,
    0,
    'no command may dispatch after the host gate replaces the native file',
  );
});

test('Tencent Meeting rejects native replacement by the final synchronous guard without dispatching', async (context) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-tmeet-final-guard-')));
  context.after(() => rm(root, { recursive: true, force: true }));
  const executable = path.join(root, 'tmeet');
  await writeFile(executable, 'verified fixture');
  let dispatches = 0;
  let guards = 0;
  const run = createTencentMeetingPrivateProcess(root, executable, profile, {
    verifyBinary: async (file) => (await readFile(file, 'utf8')) === 'verified fixture',
    createProcess: () => async (input) => {
      await input.beforeSpawn?.();
      input.assertSpawn?.();
      dispatches++;
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  });
  await assert.rejects(
    run({
      args: ['meeting', 'get', '--meeting-id', '123', '--format', 'json'],
      assertSpawn: () => {
        guards++;
        writeFileSync(executable, 'replaced fixture');
      },
    }),
    { code: 'installation_failed' },
  );
  assert.equal(guards, 1);
  assert.equal(dispatches, 0, 'no command may dispatch after the authenticated file changes');
});

test('Tencent Meeting never authorizes into existing metadata, encrypted data or linked profile paths', async (context) => {
  for (const occupied of ['metadata', 'encrypted-data', 'linked-directory'] as const) {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-tmeet-occupied-')));
    context.after(() => rm(root, { recursive: true, force: true }));
    let dispatches = 0;
    const run = createTencentMeetingPrivateProcess(root, path.join(root, 'tmeet'), profile, {
      verifyBinary: async () => true,
      createProcess: () => async () => {
        dispatches++;
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });
    const base = path.join(root, 'tencent-meeting-cli', 'profiles', profile);
    const config = path.join(base, 'config');
    const data = path.join(base, 'data');
    await mkdir(base, { recursive: true, mode: 0o700 });
    if (occupied === 'linked-directory') await symlink(root, config);
    else {
      await mkdir(config, { mode: 0o700 });
      await mkdir(data, { mode: 0o700 });
      await writeFile(
        occupied === 'metadata' ? path.join(config, 'config.json') : path.join(data, 'other.enc'),
        'fixture',
      );
    }
    await assert.rejects(run({ args: ['auth', 'login', '--no-browser'] }), {
      code: 'invalid_response',
    });
    assert.equal(dispatches, 0);
  }
});

test('Tencent Meeting installer selects only the pinned native private path and refuses all unverified platforms', async () => {
  const installer = createTencentMeetingInstaller({
    root: '/private/space-connectors',
    platform: 'darwin',
    arch: 'arm64',
  });
  assert.equal(
    installer.executable,
    '/private/space-connectors/tencent-meeting-cli/cli/1.0.15/darwin-arm64/tmeet',
  );
  const unsupported = createTencentMeetingInstaller({
    root: '/private/space-connectors',
    platform: 'win32',
    arch: 'x64',
  });
  await assert.rejects(unsupported.install(new AbortController().signal), {
    code: 'unsupported_platform',
  });
  assert.throws(
    () => createTencentMeetingPrivateProcess('/private', '/private/tmeet', '../shared'),
    { code: 'invalid_response' },
  );
});
