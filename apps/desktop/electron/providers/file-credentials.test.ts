import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFileProviderCredentialStore, createCustomProvider } from '@kodax-ai/kodax/llm';
import { createSpaceFileCredentials } from './file-credentials.js';

test('migrates only the approved account, keeps conflicts and rereads next-request changes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-file-credentials-'));
  try {
    const store = createFileProviderCredentialStore(path.join(root, 'auth.json'));
    const legacy = new Map([['alias-a', 'old-a'], ['partner', 'unrelated']]);
    const binding = { profile: 'default', provider: 'a', connectionFingerprint: 'a'.repeat(64) };
    const api = createSpaceFileCredentials({ store, resolve: async () => binding,
      legacy: { has: async id => legacy.has(id), read: async id => legacy.get(id), remove: async id => legacy.delete(id) } });
    assert.equal(await api.read('a', ['alias-a']), 'old-a');
    assert.equal(legacy.has('alias-a'), false); assert.equal(legacy.get('partner'), 'unrelated');
    const status = await api.describe('a', []);
    await store.setApiKey(binding, 'cli-next', status.revision);
    assert.equal(await api.read('a', []), 'cli-next');
    await assert.rejects(api.set('a', 'stale-ui', status), /conflict|changed/i);
    legacy.set('alias-a', 'different');
    assert.equal(await api.read('a', ['alias-a']), 'cli-next');
    assert.equal((await api.describe('a', ['alias-a'])).migration, 'conflict');
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
    await store.setApiKey({ profile: 'default', provider: 'saved', connectionFingerprint: 'a'.repeat(64) }, 'current', null);
    assert.equal(await api.read('saved', ['saved']), 'current');
    assert.equal((await api.describe('saved', ['saved'])).migration, 'unavailable');
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
