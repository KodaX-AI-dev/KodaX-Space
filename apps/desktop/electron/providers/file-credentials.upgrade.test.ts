import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFileProviderCredentialStore } from '@kodax-ai/kodax/llm';
import { createSpaceFileCredentials } from './file-credentials.js';

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-upgrade-cases-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('space-upgrade-cases-'));
    await rm(root, { recursive: true, force: true });
  });
  const store = createFileProviderCredentialStore(path.join(root, 'auth.json'));
  const route = { fingerprint: 'a'.repeat(64), available: true }, values = new Map([['a', 'space-original']]);
  const context = { store, resolve: async (provider: string) => ({ provider, profile: 'default', connectionFingerprint: route.fingerprint }),
    legacy: { has: async (account: string) => { if (!route.available) throw new Error('temporarily locked'); return values.has(account); },
      read: async (account: string) => values.get(account), remove: async (account: string) => values.delete(account) } };
  return { context, store, route, values, api: createSpaceFileCredentials(context) };
}

test('explicit publication alone replaces the shared value and private deletion never removes the CLI value', async t => {
  const f = await fixture(t), binding = await f.context.resolve('a');
  await f.store.setApiKey(binding, 'cli-original', null);
  assert.equal(await f.api.read('a', ['a']), 'space-original');
  await f.api.set('a', 'space-edited', await f.api.describe('a', ['a']), ['a']);
  assert.equal((await f.store.readApiKey(binding))?.key, 'cli-original');
  await f.api.share('a', await f.api.describe('a', ['a']), 'publish', ['a']);
  assert.equal((await f.store.readApiKey(binding))?.key, 'space-edited');
  assert.equal(f.values.get('a'), 'space-original');
  assert.equal((await f.api.describe('a', ['a'])).scope, 'shared');
});

test('temporary metadata failure is unavailable, then automatically recovers without selecting the other account', async t => {
  const f = await fixture(t), binding = await f.context.resolve('a');
  await f.store.setApiKey(binding, 'cli-other-account', null);
  f.route.available = false;
  assert.equal((await f.api.describe('a', ['a'])).migration, 'unavailable');
  await assert.rejects(f.api.read('a', ['a']), /unavailable/);
  f.route.available = true;
  assert.equal(await f.api.read('a', ['a']), 'space-original');
  f.route.available = false;
  assert.equal(await f.api.read('a', ['a']), 'space-original');
  assert.equal((await f.store.readApiKey(binding))?.key, 'cli-other-account');
});

test('an interrupted response after durable copy reopens the exact original without touching its backup', async t => {
  const f = await fixture(t);
  const api = createSpaceFileCredentials({ ...f.context, store: { ...f.store, updateApiKeys: async changes => {
    const result = await f.store.updateApiKeys(changes);
    if (changes.length > 1) throw new Error('Fixture process disconnected after commit'); return result;
  } } });
  assert.equal(await api.read('a', ['a']), 'space-original');
  f.route.available = false;
  assert.equal(await createSpaceFileCredentials(f.context).read('a', ['a']), 'space-original');
  assert.equal(f.values.get('a'), 'space-original');
});

test('configuration edits pin pending legacy origins before changing the route', async t => {
  const f = await fixture(t);
  await f.api.pin('a', await f.api.describe('a', ['a']), ['a']);
  f.route.fingerprint = 'b'.repeat(64);
  await assert.rejects(f.api.read('a', ['a']), /connection changed/i);
  await assert.rejects(f.api.share('a', await f.api.describe('a', ['a']), 'publish', ['a']), /not available/);
  assert.equal(f.values.get('a'), 'space-original');
});

test('two Space profiles sharing an SDK root retain different original accounts', async t => {
  const f = await fixture(t);
  const a = createSpaceFileCredentials({ ...f.context, scopeId: 'profile-a' });
  const b = createSpaceFileCredentials({ ...f.context, scopeId: 'profile-b', legacy: {
    ...f.context.legacy, read: async () => 'profile-b-original' } });
  assert.equal(await a.read('a', ['a']), 'space-original');
  assert.equal(await b.read('a', ['a']), 'profile-b-original');
  assert.equal(await a.read('a', ['a']), 'space-original');
  assert.equal(await f.store.readApiKey(await f.context.resolve('a')), undefined);
});

test('a deleted alias destination cannot be resurrected by moving another credential into it', async t => {
  const f = await fixture(t); f.values.clear();
  await f.api.set('a', 'source-key', await f.api.describe('a', []));
  const destination = await f.context.resolve('b');
  await f.store.removeApiKey(destination, null);
  await assert.rejects(f.api.move('b', await f.api.describe('a', []), f.route.fingerprint), /conflict/);
  assert.equal(await f.api.read('a', []), 'source-key');
  assert.equal(await f.store.readApiKey(destination), undefined);
});

test('a late origin pin cannot reauthorize migration after explicit adoption or deletion', async t => {
  for (const operation of ['adopt', 'remove'] as const) await t.test(operation, async sub => {
    const f = await fixture(sub), binding = await f.context.resolve('a');
    await f.store.setApiKey(binding, 'cli-other-account', null);
    let interrupted = false;
    const api = createSpaceFileCredentials({ ...f.context, store: { ...f.store, updateApiKeys: async changes => {
      const committed = await f.store.updateApiKeys(changes);
      if (!interrupted && changes.length === 1) {
        interrupted = true;
        const displayed = await f.api.describe('a', ['a']);
        if (operation === 'adopt') await f.api.share('a', displayed, 'adopt', ['a']);
        else await f.api.remove('a', displayed, ['a']);
      }
      return committed;
    } } });
    assert.equal(await api.read('a', ['a']), operation === 'adopt' ? 'cli-other-account' : undefined);
    const latest = await f.api.describe('a', ['a']);
    assert.equal(latest.scope, operation === 'adopt' ? 'shared' : 'space');
    assert.equal(latest.configured, operation === 'adopt');
    assert.equal(f.values.get('a'), 'space-original');
    assert.equal((await f.store.readApiKey(binding))?.key, 'cli-other-account');
  });
});

test('returning to a previously adopted route cannot silently select its retained private backup', async t => {
  const f = await fixture(t);
  await f.api.read('a', ['a']);
  f.route.fingerprint = 'b'.repeat(64);
  await f.api.set('a', 'space-route-b', await f.api.describe('a', ['a']), ['a']);
  const backup = await f.api.describe('a', ['a']), shared = await f.context.resolve('a');
  await f.store.setApiKey(shared, 'shared-route-b', null);
  await f.api.share('a', await f.api.describe('a', ['a']), 'adopt', ['a']);
  assert.equal(await f.api.read('a', ['a']), 'shared-route-b');
  f.route.fingerprint = 'a'.repeat(64);
  await f.api.set('a', 'confirmed-route-a', await f.api.describe('a', ['a']), ['a']);
  f.route.fingerprint = 'b'.repeat(64);
  await assert.rejects(f.api.read('a', ['a']), /connection changed/i);
  assert.equal((await f.store.readApiKey(backup.binding))?.key, 'space-route-b');
  assert.equal((await f.store.readApiKey(shared))?.key, 'shared-route-b');
  await f.api.share('a', await f.api.describe('a', ['a']), 'adopt', ['a']);
  assert.equal(await f.api.read('a', ['a']), 'shared-route-b');
});

test('a pinned legacy origin that disappears must not fall through to an environment or shared account', async t => {
  const f = await fixture(t), api = createSpaceFileCredentials({ ...f.context, hasEnvironment: async () => true });
  const shared = await f.context.resolve('a'); await f.store.setApiKey(shared, 'cli-other-account', null);
  await api.pin('a', await api.describe('a', ['a']), ['a']);
  f.values.clear();
  await assert.rejects(api.read('a', ['a']), /original credential.*unavailable/i);
  f.values.set('a', 'space-original');
  assert.equal(await api.read('a', ['a']), 'space-original');
  assert.equal((await f.store.readApiKey(shared))?.key, 'cli-other-account');
});

test('configuration editing pins an environment origin without classifying it as a pending legacy copy', async t => {
  const f = await fixture(t); f.values.clear();
  const api = createSpaceFileCredentials({ ...f.context, hasEnvironment: async () => true });
  const pinned = await api.pin('a', await api.describe('a', ['a']), ['a']);
  assert.equal(typeof pinned.revision, 'string');
  assert.equal(await api.read('a', ['a']), undefined);
  assert.equal((await api.describe('a', ['a'])).scope, 'space');
});
