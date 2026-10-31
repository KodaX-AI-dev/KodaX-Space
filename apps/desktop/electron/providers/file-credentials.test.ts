import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFileProviderCredentialStore, createCustomProvider } from '@kodax-ai/kodax/llm';
import { createSpaceFileCredentials } from './file-credentials.js';

test('first shared use is pinned before a previously absent legacy backend recovers', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-upgrade-shared-pin-'));
  try {
    const store = createFileProviderCredentialStore(path.join(root, 'auth.json'));
    const binding = { profile: 'default', provider: 'a', connectionFingerprint: 'a'.repeat(64) };
    await store.setApiKey(binding, 'selected-shared-account', null);
    let present = false;
    const api = createSpaceFileCredentials({ store, resolve: async () => binding,
      legacy: { has: async () => present, read: async () => 'different-legacy-account', remove: async () => false } });
    assert.equal(await api.read('a', ['a']), 'selected-shared-account');
    present = true;
    assert.equal(await api.read('a', ['a']), 'selected-shared-account');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an unpersisted first env selection is refused and a deleted Space key cannot be published from backup', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-upgrade-selection-fail-'));
  try {
    const file = createFileProviderCredentialStore(path.join(root, 'auth.json'));
    const binding = { profile: 'default', provider: 'a', connectionFingerprint: 'a'.repeat(64) };
    await file.setApiKey(binding, 'cli-account', null);
    const unavailable = createSpaceFileCredentials({ store: { ...file, updateApiKeys: async () => { throw new Error('Fixture read only'); } },
      resolve: async () => binding, hasEnvironment: async () => true,
      legacy: { has: async () => false, read: async () => undefined, remove: async () => false } });
    await assert.rejects(unavailable.read('a', ['a']), /read only/);
    const api = createSpaceFileCredentials({ store: file, resolve: async () => binding,
      legacy: { has: async () => true, read: async () => 'old-account', remove: async () => false } });
    assert.equal(await api.read('a', ['a']), 'old-account');
    await api.remove('a', await api.describe('a', ['a']), ['a']);
    await assert.rejects(api.share('a', await api.describe('a', ['a']), 'publish', ['a']), /not available/);
    assert.equal((await file.readApiKey(binding))?.key, 'cli-account');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('retained legacy backups cannot be imported into a changed connection', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-upgrade-route-'));
  try {
    const store = createFileProviderCredentialStore(path.join(root, 'auth.json'));
    let fingerprint = 'a'.repeat(64);
    const api = createSpaceFileCredentials({ store, resolve: async provider => ({ profile: 'default', provider, connectionFingerprint: fingerprint }),
      legacy: { has: async () => true, read: async () => 'original-account', remove: async () => false } });
    assert.equal(await api.read('a', ['a']), 'original-account');
    fingerprint = 'b'.repeat(64);
    await assert.rejects(api.read('a', ['a']), /connection changed/i);
    const changed = await api.describe('a', ['a']);
    assert.equal(changed.migration, 'connection-changed');
    await api.set('a', 'new-approved-account', changed, ['a']);
    assert.equal(await api.read('a', ['a']), 'new-approved-account');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an existing Space environment selection cannot silently become the CLI account when its env is removed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-upgrade-env-'));
  try {
    const store = createFileProviderCredentialStore(path.join(root, 'auth.json'));
    const binding = { profile: 'default', provider: 'a', connectionFingerprint: 'a'.repeat(64) };
    await store.setApiKey(binding, 'cli-account', null);
    let environment = true;
    const dependencies = { store, resolve: async () => binding, hasEnvironment: async () => environment,
      legacy: { has: async () => false, read: async () => undefined, remove: async () => false } };
    const api = createSpaceFileCredentials(dependencies);
    assert.equal(await api.read('a', ['a']), undefined, 'undefined deliberately leaves the approved Space env in control');
    environment = false;
    const restarted = createSpaceFileCredentials(dependencies);
    assert.equal(await restarted.read('a', ['a']), undefined, 'removing env must not select a different saved account');
    assert.equal((await store.readApiKey(binding))?.key, 'cli-account');
    await restarted.share('a', await restarted.describe('a', []), 'adopt', []);
    assert.equal(await restarted.read('a', ['a']), 'cli-account');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an automatic Space upgrade preserves its old account without changing CLI shared credentials', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-upgrade-account-'));
  try {
    const store = createFileProviderCredentialStore(path.join(root, 'auth.json'));
    const binding = { profile: 'default', provider: 'a', connectionFingerprint: 'a'.repeat(64) };
    await store.setApiKey(binding, 'cli-account-b', null);
    let unavailable = false, removed = 0;
    const legacy = { has: async () => { if (unavailable) throw new Error('old backend unavailable'); return true; },
      read: async () => 'space-account-a', remove: async () => { removed++; throw new Error('cleanup unavailable'); } };
    const api = createSpaceFileCredentials({ store, resolve: async () => binding, legacy });
    assert.equal(await api.read('a', ['a']), 'space-account-a');
    assert.equal((await store.readApiKey(binding))?.key, 'cli-account-b');
    assert.equal((await api.describe('a', ['a'])).scope, 'space');
    unavailable = true;
    const restarted = createSpaceFileCredentials({ store, resolve: async () => binding, legacy });
    assert.equal(await restarted.read('a', ['a']), 'space-account-a');
    assert.equal(removed, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a failed migration write keeps the approved old credential usable and retries without restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-upgrade-retry-'));
  try {
    const file = createFileProviderCredentialStore(path.join(root, 'auth.json'));
    let fail = true;
    const store = { ...file, updateApiKeys: async (...args: Parameters<typeof file.updateApiKeys>) => {
      if (fail && args[0].length > 1) throw new Error('Fixture disk full'); return file.updateApiKeys(...args);
    } };
    const binding = { profile: 'default', provider: 'a', connectionFingerprint: 'a'.repeat(64) };
    const api = createSpaceFileCredentials({ store, resolve: async () => binding,
      legacy: { has: async () => true, read: async () => 'old-account', remove: async () => { throw new Error('must retain backup'); } } });
    assert.equal(await api.read('a', ['a']), 'old-account');
    assert.equal((await api.describe('a', ['a'])).migration, 'pending');
    fail = false;
    assert.equal(await api.read('a', ['a']), 'old-account');
    assert.equal((await api.describe('a', ['a'])).configured, true);
    assert.equal(await file.readApiKey(binding), undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('migrates only the approved Space account, requires explicit sharing and preserves deletion fences', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-file-credentials-'));
  try {
    const store = createFileProviderCredentialStore(path.join(root, 'auth.json'));
    const legacy = new Map([['alias-a', 'old-a'], ['partner', 'unrelated']]);
    const binding = { profile: 'default', provider: 'a', connectionFingerprint: 'a'.repeat(64) };
    const api = createSpaceFileCredentials({ store, resolve: async () => binding,
      legacy: { has: async id => legacy.has(id), read: async id => legacy.get(id), remove: async id => legacy.delete(id) } });
    assert.equal(await api.read('a', ['alias-a']), 'old-a');
    assert.equal(legacy.get('alias-a'), 'old-a'); assert.equal(legacy.get('partner'), 'unrelated');
    const status = await api.describe('a', []);
    await store.setApiKey(binding, 'cli-next', null);
    assert.equal(await api.read('a', []), 'old-a');
    await assert.rejects(api.share('a', status, 'adopt', []), /revision|changed/i);
    await api.share('a', await api.describe('a', []), 'adopt', []);
    assert.equal(await api.read('a', []), 'cli-next');
    await assert.rejects(api.set('a', 'stale-ui', status), /revision|changed/i);
    legacy.set('alias-a', 'different');
    assert.equal(await api.read('a', ['alias-a']), 'cli-next');
    assert.equal((await api.describe('a', ['alias-a'])).migration, 'none');
    assert.equal(legacy.get('alias-a'), 'different');
    const current = await api.describe('a', []); await api.remove('a', current, ['alias-a']);
    legacy.set('alias-a', 'late-old'); assert.equal(await api.read('a', ['alias-a']), undefined);
    assert.equal(legacy.get('alias-a'), 'late-old');
    await writeFile(store.filePath, '{broken');
    await assert.rejects(api.read('a', ['alias-a']));
    assert.equal(legacy.get('alias-a'), 'late-old');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects connection changes and unknown proof without reading legacy secrets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-file-binding-'));
  try {
    let fingerprint = 'a'.repeat(64), reads = 0;
    const api = createSpaceFileCredentials({ store: createFileProviderCredentialStore(path.join(root, 'auth.json')),
      resolve: async provider => ({ profile: 'default', provider, connectionFingerprint: fingerprint }),
      legacy: { has: async () => false, read: async () => { reads++; return 'old'; }, remove: async () => false } });
    const status = await api.describe('a', []); fingerprint = 'b'.repeat(64);
    await assert.rejects(api.set('a', 'secret', status), /changed/i);
    await assert.rejects(api.read('a', ['a'], 'c'.repeat(64)), /connection/i);
    assert.equal(reads, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('moves an approved alias only on the same route and never overwrites its destination', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-file-alias-'));
  try {
    const store = createFileProviderCredentialStore(path.join(root, 'auth.json'));
    const fingerprint = (name: string) => createCustomProvider({ name, protocol: 'openai', model: 'm', baseUrl: 'https://same.invalid/v1', apiKeyEnv: 'FIXTURE' }).getCredentialConnectionFingerprint();
    const api = createSpaceFileCredentials({ store, resolve: async provider => ({ profile: 'default', provider, connectionFingerprint: fingerprint(provider) }),
      legacy: { has: async () => false, read: async () => undefined, remove: async () => false } });
    await api.set('before', 'original', await api.describe('before', []));
    assert.notEqual(fingerprint('before'), fingerprint('after'));
    await api.move('after', await api.describe('before', []), fingerprint('before'));
    assert.equal(await api.read('after', []), 'original'); assert.equal(await api.read('before', []), undefined);
    await api.set('before', 'other', await api.describe('before', []));
    await assert.rejects(api.move('after', await api.describe('before', []), fingerprint('before')), /conflict/i);
    assert.equal(await api.read('after', []), 'original'); assert.equal(await api.read('before', []), 'other');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an unavailable legacy vault cannot replace a valid file or cause env fallback for a missing file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-legacy-failure-'));
  try {
    const store = createFileProviderCredentialStore(path.join(root, 'auth.json'));
    const api = createSpaceFileCredentials({ store, resolve: async provider => ({ profile: 'default', provider, connectionFingerprint: 'a'.repeat(64) }),
      legacy: { has: async () => { throw new Error('raw old secret'); }, read: async () => undefined, remove: async () => false } });
    await api.set('saved', 'current', await api.describe('saved', []));
    assert.equal(await api.read('saved', ['saved']), 'current');
    assert.equal((await api.describe('saved', ['saved'])).migration, 'none');
    await assert.rejects(api.read('missing', ['missing']), error => error instanceof Error && /unavailable/.test(error.message) && !error.message.includes('raw old secret'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('deleting configuration uses a captured binding and restores the old key on configuration failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-file-delete-config-'));
  try {
    let known = true;
    const api = createSpaceFileCredentials({ store: createFileProviderCredentialStore(path.join(root, 'auth.json')),
      resolve: async provider => { if (!known) throw new Error('Unknown provider'); return { profile: 'default', provider, connectionFingerprint: 'a'.repeat(64) }; },
      legacy: { has: async () => false, read: async () => undefined, remove: async () => false } });
    await api.set('p', 'original', await api.describe('p', []));
    await assert.rejects(api.removeWithConfig('p', await api.describe('p', []), async () => { throw new Error('config write failed'); }, []), /config write failed/);
    assert.equal(await api.read('p', []), 'original');
    assert.equal(await api.removeWithConfig('p', await api.describe('p', []), async () => { known = false; return true; }, []), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
