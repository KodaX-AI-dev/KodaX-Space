// Linux Secret Service failures after a successful backend probe (Issue 248 follow-up).
//
// The probe (findCredentials) can succeed while reading one item still fails or never
// answers: the item sits in a locked collection, or Secret Service waits on an unlock
// prompt nobody can see. Startup must get a coded "unavailable" error in bounded time so
// the Runtime identity layer can decide, instead of a raw native error or a hang.

import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

type Keychain = typeof import('./keychain.js');

const linuxBundle = build({
  entryPoints: [fileURLToPath(new URL('./keychain.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['electron', '../kodax/data-paths.js'],
  define: {
    'process.platform': JSON.stringify('linux'),
    'process.env.KODAX_TEST_ONBOARDING': 'undefined',
  },
  supported: { 'dynamic-import': false },
});

async function loadLinuxKeychain(
  t: test.TestContext,
  getPassword: (service: string, account: string) => Promise<string | null>,
): Promise<Keychain> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'space-linux-keychain-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const realRequire = createRequire(import.meta.url);
  const require = (id: string): unknown => {
    if (id.endsWith('data-paths.js')) return { getSpaceDataDir: () => dir };
    if (id === '@napi-rs/keyring/keytar.js') {
      return {
        findCredentials: async () => [],
        getPassword,
        setPassword: async () => undefined,
        deletePassword: async () => false,
      };
    }
    return realRequire(id);
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', (await linuxBundle).outputFiles[0]!.text)(
    require,
    module,
    module.exports,
  );
  return module.exports as Keychain;
}

test('a Secret Service read error after a successful probe is reported as unavailable', async (t) => {
  const locked = new Error('IsLocked: Cannot get secret of a locked object');
  const keychain = await loadLinuxKeychain(t, async () => {
    throw locked;
  });
  await assert.rejects(keychain.getPersistentKey('runtime_client_fixture'), (error: unknown) => {
    assert.equal((error as { code?: unknown }).code, 'persistent_key_unavailable');
    assert.equal((error as { cause?: unknown }).cause, locked, 'the native error is kept as the cause');
    return true;
  });
});

test('a Secret Service read that never answers is reported as unavailable in bounded time', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const keychain = await loadLinuxKeychain(t, () => new Promise<string | null>(() => undefined));
  const pending = keychain.getPersistentKey('runtime_client_fixture');
  // Let the probe and the read start before advancing the clock past the bound.
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  t.mock.timers.tick(60_000);
  await assert.rejects(pending, { code: 'persistent_key_unavailable' });
});

test('an absent Secret Service item is still reported as absent', async (t) => {
  const keychain = await loadLinuxKeychain(t, async () => null);
  assert.equal(await keychain.getPersistentKey('runtime_client_fixture'), undefined);
});

test('legacy provider-key migration checks are bounded too', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const keychain = await loadLinuxKeychain(t, () => new Promise<string | null>(() => undefined));
  const migration = keychain.hasMigrationKey('anthropic');
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  t.mock.timers.tick(60_000);
  await assert.rejects(migration, /Legacy credential metadata is unavailable/);
});
