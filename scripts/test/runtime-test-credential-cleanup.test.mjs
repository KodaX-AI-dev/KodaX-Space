import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import childProcess from 'node:child_process';

import { cleanupRuntimeClientCredentialForTestProfile } from '../runtime-test-credential-cleanup.mjs';

const TEST_ACCOUNT = 'runtime_client_00000000-0000-4000-8000-000000000132';

function useMacPlatform(t) {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  t.after(() => Object.defineProperty(process, 'platform', original));
}

function useSecurityCommand(t, run) {
  const original = childProcess.execFile;
  childProcess.execFile = (file, args, options, callback) => {
    Promise.resolve()
      .then(() => run(file, args, options))
      .then(() => callback(null, '', ''), callback);
  };
  t.after(() => (childProcess.execFile = original));
}

async function writeIdentity(profileDir, account = TEST_ACCOUNT) {
  const spaceDir = path.join(profileDir, 'space');
  await fs.mkdir(spaceDir, { recursive: true });
  await fs.writeFile(
    path.join(spaceDir, 'runtime-client-identity.json'),
    JSON.stringify({ secretAccount: account }),
    'utf8',
  );
}

test('runtime test credential cleanup deletes only the account owned by an isolated test profile', async (t) => {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kodax-test-credential-cleanup-'));
  t.after(() => fs.rm(profileDir, { recursive: true, force: true }));
  await writeIdentity(profileDir);
  const calls = [];

  const result = await cleanupRuntimeClientCredentialForTestProfile(profileDir, {
    deletePassword: async (service, account) => {
      calls.push({ service, account });
      return true;
    },
  });

  assert.deepEqual(result, { cleaned: true, account: TEST_ACCOUNT });
  assert.deepEqual(calls, [{ service: 'kodax-space-test-runtime', account: TEST_ACCOUNT }]);
});

test('runtime test credential cleanup rejects production paths and non-runtime accounts', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'space-credential-cleanup-'));
  const testProfile = await fs.mkdtemp(path.join(os.tmpdir(), 'kodax-test-credential-cleanup-'));
  t.after(async () => {
    await Promise.all([
      fs.rm(root, { recursive: true, force: true }),
      fs.rm(testProfile, { recursive: true, force: true }),
    ]);
  });
  await writeIdentity(root);
  await writeIdentity(testProfile, 'anthropic');
  let deletes = 0;
  const options = {
    deletePassword: async () => {
      deletes += 1;
      return true;
    },
  };

  assert.deepEqual(await cleanupRuntimeClientCredentialForTestProfile(root, options), {
    cleaned: false,
    reason: 'not_found_or_not_test_profile',
  });
  assert.deepEqual(await cleanupRuntimeClientCredentialForTestProfile(testProfile, options), {
    cleaned: false,
    reason: 'not_found_or_not_test_profile',
  });
  assert.deepEqual(
    await cleanupRuntimeClientCredentialForTestProfile(
      path.join(testProfile, 'kodax-test-missing'),
      options,
    ),
    { cleaned: false, reason: 'not_found_or_not_test_profile' },
  );
  assert.equal(deletes, 0);
});

test('runtime test credential cleanup removes both accounts after accepted exit rotates identity', async (t) => {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kodax-test-credential-cleanup-'));
  t.after(() => fs.rm(profileDir, { recursive: true, force: true }));
  await writeIdentity(profileDir);
  const previousAccount = 'runtime_client_00000000-0000-4000-8000-000000000133';
  await fs.writeFile(
    path.join(profileDir, 'space/runtime-client-identity.json'),
    JSON.stringify({
      secretAccount: TEST_ACCOUNT,
      exitRecovery: { secretAccount: previousAccount },
    }),
  );
  const accounts = [];
  await cleanupRuntimeClientCredentialForTestProfile(profileDir, {
    deletePassword: async (service, account) => {
      assert.equal(service, 'kodax-space-test-runtime');
      accounts.push(account);
      return true;
    },
  });
  assert.deepEqual(accounts, [TEST_ACCOUNT, previousAccount]);
});

test('runtime test credential cleanup accepts the physical profile behind a temp directory alias', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'space-credential-alias-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const physical = path.join(root, 'physical');
  const alias = path.join(root, 'alias');
  await fs.mkdir(physical);
  await fs.symlink(physical, alias, 'junction');
  const profile = await fs.mkdtemp(path.join(physical, 'kodax-test-credential-'));
  await writeIdentity(profile);
  t.mock.method(os, 'tmpdir', () => alias);
  const accounts = [];
  const result = await cleanupRuntimeClientCredentialForTestProfile(profile, {
    deletePassword: async (service, account) => {
      assert.equal(service, 'kodax-space-test-runtime');
      accounts.push(account);
      return true;
    },
  });
  assert.equal(result.cleaned, true);
  assert.deepEqual(accounts, [TEST_ACCOUNT]);
});

test('macOS cleanup deletes the owned test credential without reading its protected password', async (t) => {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kodax-test-credential-cleanup-'));
  t.after(() => fs.rm(profileDir, { recursive: true, force: true }));
  await writeIdentity(profileDir);
  useMacPlatform(t);
  const calls = [];
  useSecurityCommand(t, async (file, args, options) => {
    calls.push({ file, args, options });
  });

  const result = await cleanupRuntimeClientCredentialForTestProfile(profileDir);
  assert.equal(result.cleaned, true);
  assert.deepEqual(calls, [
    {
      file: '/usr/bin/security',
      args: ['delete-generic-password', '-s', 'kodax-space-test-runtime', '-a', TEST_ACCOUNT],
      options: { timeout: 5000 },
    },
  ]);
});

test('macOS cleanup tolerates an absent item and surfaces permission or timeout failures', async (t) => {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kodax-test-credential-cleanup-'));
  t.after(() => fs.rm(profileDir, { recursive: true, force: true }));
  await writeIdentity(profileDir);
  useMacPlatform(t);
  let failure = Object.assign(new Error('Item not found'), { code: 44 });
  useSecurityCommand(t, async () => {
    throw failure;
  });

  assert.equal((await cleanupRuntimeClientCredentialForTestProfile(profileDir)).cleaned, false);
  failure = Object.assign(new Error('Keychain access denied'), { code: 36 });
  await assert.rejects(cleanupRuntimeClientCredentialForTestProfile(profileDir), failure);
  failure = Object.assign(new Error('Command timed out'), { code: 'ETIMEDOUT' });
  await assert.rejects(cleanupRuntimeClientCredentialForTestProfile(profileDir), failure);
});
