import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { RuntimeClientIdentityStore } from '../kodax/runtime/runtime-client-identity.js';

type Keychain = typeof import('../providers/keychain.js');
const entry = fileURLToPath(new URL('../providers/keychain.ts', import.meta.url));
function bundleFor(platform: 'win32' | 'darwin') {
  return build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['electron', '../kodax/data-paths.js'],
    define: {
      'process.platform': JSON.stringify(platform),
      'process.env.KODAX_TEST_ONBOARDING': 'undefined',
    },
    supported: { 'dynamic-import': false },
  });
}
const bundles = { win32: bundleFor('win32'), darwin: bundleFor('darwin') };

async function fixture(
  t: test.TestContext,
  options: {
    legacy?: Record<string, string>;
    nativeUnavailable?: boolean;
    decryptFails?: boolean;
    encryptFails?: boolean;
    asyncUnavailable?: boolean;
    beforeLegacyRead?: () => Promise<void>;
    platform?: 'win32' | 'darwin';
  } = {},
) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'space-windows-vault-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const reads: string[] = [];
  let loads = 0;
  const load = async (): Promise<Keychain> => {
    const module = { exports: {} };
    const realRequire = createRequire(import.meta.url);
    const require = (id: string): unknown => {
      if (id.endsWith('data-paths.js')) return { getSpaceDataDir: () => dir };
      if (id === 'electron')
        return {
          safeStorage: {
            isEncryptionAvailable: () => true,
            isAsyncEncryptionAvailable: async () => !options.asyncUnavailable,
            encryptStringAsync: async (value: string) => {
              if (options.encryptFails) throw new Error('encryption unavailable');
              return Buffer.from(`fixture:${value}`);
            },
            decryptStringAsync: async (value: Buffer) => {
              if (options.decryptFails) throw new Error('DPAPI decryption unavailable');
              return { result: value.toString().slice(8), shouldReEncrypt: false };
            },
          },
        };
      if (id === '@napi-rs/keyring/keytar.js') {
        loads += 1;
        if (options.nativeUnavailable)
          throw new Error('Cannot find native binding', {
            cause: [
              Object.assign(new Error('native loader unavailable'), { code: 'ERR_DLOPEN_FAILED' }),
            ],
          });
        return {
          findCredentials: async () => assert.fail('must not enumerate unrelated credentials'),
          getPassword: async (_service: string, account: string) => {
            reads.push(account);
            await options.beforeLegacyRead?.();
            if (account === 'broken') throw new Error('invalid UTF16');
            return options.legacy?.[account] ?? null;
          },
          setPassword: async () => assert.fail('must write Windows secrets to vault'),
          deletePassword: async () => false,
        };
      }
      return realRequire(id);
    };
    new Function(
      'require',
      'module',
      'exports',
      (await bundles[options.platform ?? 'win32']).outputFiles[0]!.text,
    )(require, module, module.exports);
    return module.exports as Keychain;
  };
  return { dir, load, reads, loads: () => loads };
}

test('Windows vault persists across restart without loading an unavailable native keyring', async (t) => {
  const f = await fixture(t, { nativeUnavailable: true });
  const first = await f.load();
  assert.equal(await first.getBackendStatus(), 'keychain');
  await first.setKey('anthropic', 'fixture-secret');
  assert.equal(await (await f.load()).getKey('anthropic'), 'fixture-secret');
  assert.equal(f.loads(), 0);
});

test('native keyring loader retains nested causes for the structured console bridge', async (t) => {
  const warning = t.mock.method(console, 'warn', () => undefined);
  const f = await fixture(t, { nativeUnavailable: true });
  assert.equal(await (await f.load()).getPersistentKey('missing'), undefined);
  const call = warning.mock.calls.find(
    (entry) => entry.arguments[0] === '[keychain] failed to load @napi-rs/keyring',
  );
  assert.ok(call);
  const error = call.arguments[1] as Error;
  assert.ok(error instanceof Error);
  assert.ok(Array.isArray(error.cause));
  assert.equal((error.cause[0] as NodeJS.ErrnoException).code, 'ERR_DLOPEN_FAILED');
});

test('strict Runtime reads preserve macOS cancellation suppression until an explicit save', async (t) => {
  const f = await fixture(t, { platform: 'darwin' });
  const keys = await f.load();
  await Promise.all([
    assert.rejects(keys.getPersistentKey('broken'), /invalid UTF16/),
    assert.rejects(keys.getPersistentKey('broken'), /invalid UTF16/),
  ]);
  await assert.rejects(keys.getPersistentKey('broken'));
  assert.deepEqual(f.reads, ['broken']);
  await keys.setPersistentKey('broken', 'fixture-recovered');
  assert.equal(await keys.getPersistentKey('broken'), 'fixture-recovered');
});

test('Runtime opens a fresh profile and reconnects with identical authority without native keyring', async (t) => {
  const f = await fixture(t, { nativeUnavailable: true });
  const open = async () => {
    const keys = await f.load();
    const identity = new RuntimeClientIdentityStore(
      path.join(f.dir, 'runtime-client-identity.json'),
      f.dir,
      randomUUID,
      { read: keys.getPersistentKey, write: keys.setPersistentKey },
    );
    return identity.openInstance({ name: 'Space', version: 'fixture' });
  };
  const first = await open();
  assert.deepEqual(await open(), first);
  assert.equal(f.loads(), 1);
  assert.doesNotMatch(
    await fs.readFile(path.join(f.dir, 'runtime-client-identity.json'), 'utf8'),
    /space_secret_/,
  );
});

test('Windows candidate discovery migrates legacy keys per account and isolates bad records', async (t) => {
  const f = await fixture(t, { legacy: { openai: 'fixture-openai', custom_a: 'fixture-custom' } });
  const keys = await f.load();
  assert.deepEqual(await keys.listConfiguredAccounts(['broken', 'openai', 'custom_a', 'absent']), [
    'openai',
    'custom_a',
  ]);
  assert.equal(await keys.getBackendStatus(), 'keychain');
  assert.equal(await keys.getKey('openai'), 'fixture-openai');
  const restarted = await f.load();
  assert.equal(await restarted.getKey('custom_a'), 'fixture-custom');
  assert.equal(f.reads.filter((account) => account === 'custom_a').length, 1);
});

test('Windows deletion tombstone prevents legacy credential resurrection after restart', async (t) => {
  const f = await fixture(t, { legacy: { openai: 'fixture-old' } });
  const keys = await f.load();
  assert.equal(await keys.hasKey('openai'), true);
  assert.equal(await keys.deleteKey('openai'), true);
  const restarted = await f.load();
  assert.equal(await restarted.hasKey('openai'), false);
  assert.equal(await restarted.getKey('openai'), undefined);
  await restarted.setKey('openai', 'fixture-new');
  assert.equal(await (await f.load()).getKey('openai'), 'fixture-new');
});

test('an onsite v1 vault restores the exact Runtime secret without loading keyring', async (t) => {
  const f = await fixture(t, { nativeUnavailable: true });
  const account = 'runtime_client_00000000-0000-4000-8000-000000000001';
  await fs.writeFile(
    path.join(f.dir, 'provider-credentials.v1.json'),
    JSON.stringify({
      version: 1,
      records: {
        [account]: Buffer.from('fixture:space_secret_unchanged_from_onsite_build').toString(
          'base64',
        ),
      },
      revokedLegacyAccounts: [],
    }),
  );
  assert.equal(
    await (await f.load()).getPersistentKey(account),
    'space_secret_unchanged_from_onsite_build',
  );
  assert.equal(f.loads(), 0);
});

test('Runtime persistent reads surface decryption failure and leave ciphertext untouched', async (t) => {
  const f = await fixture(t, { decryptFails: true, legacy: { runtime: 'must-not-use-old-key' } });
  const keys = await f.load();
  await keys.setPersistentKey('runtime', 'fixture-secret');
  const file = path.join(f.dir, 'provider-credentials.v1.json');
  const before = await fs.readFile(file, 'utf8');
  await assert.rejects(keys.getPersistentKey('runtime'), /DPAPI decryption unavailable/);
  assert.equal(await fs.readFile(file, 'utf8'), before);
  assert.equal(f.loads(), 0);
});

test('failed Windows encryption cannot report an ephemeral write as persistent success', async (t) => {
  const f = await fixture(t, { encryptFails: true });
  const keys = await f.load();
  await assert.rejects(
    keys.setPersistentKey('runtime', 'fixture-secret'),
    /encryption unavailable/,
  );
  await assert.rejects(keys.setKey('anthropic', 'fixture-secret'), /encryption unavailable/);
  assert.equal(await keys.getBackendStatus(), 'keychain');
  assert.equal(await keys.getKey('anthropic'), undefined);
});

test('asynchronous DPAPI unavailable rejects Runtime storage without touching legacy keyring', async (t) => {
  const f = await fixture(t, { asyncUnavailable: true });
  const keys = await f.load();
  await assert.rejects(keys.setPersistentKey('runtime', 'fixture-secret'), /OS-protected storage/);
  await assert.rejects(keys.getPersistentKey('runtime'), /OS-protected storage/);
  assert.equal(f.loads(), 0);
});

test('corrupt Windows vault is never replaced or silently bypassed by a legacy key', async (t) => {
  const f = await fixture(t, { legacy: { runtime: 'old-credential' } });
  const file = path.join(f.dir, 'provider-credentials.v1.json');
  await fs.writeFile(file, '{broken');
  const keys = await f.load();
  await assert.rejects(keys.getPersistentKey('runtime'), /vault could not be read/);
  await assert.rejects(
    keys.setPersistentKey('runtime', 'fixture-secret'),
    /vault could not be read/,
  );
  assert.equal(await fs.readFile(file, 'utf8'), '{broken');
  assert.equal(f.loads(), 0);
});

test('deleting while a legacy read is in flight cannot resurrect the old credential', async (t) => {
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const f = await fixture(t, {
    legacy: { openai: 'old-key' },
    beforeLegacyRead: async () => {
      started();
      await waiting;
    },
  });
  const keys = await f.load();
  const pending = keys.getKey('openai');
  await entered;
  await keys.deleteKey('openai');
  release();
  assert.equal(await pending, undefined);
  assert.equal(await (await f.load()).getKey('openai'), undefined);
});
