import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RuntimeClientIdentityStore } from './runtime-client-identity.js';
import { createRuntimeClientFileSecretStore } from './runtime-client-secret-file.js';
import { createFileProviderCredentialStore } from '@kodax-ai/kodax/llm';
import { createHash } from 'node:crypto';

test('client storage retries initialization after a transient storage failure without replacing its identity', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-client-init-retry-'));
  try {
    const authFile = path.join(root, 'auth.json');
    await writeFile(authFile, '{broken');
    const secrets = createRuntimeClientFileSecretStore({ authFile });
    await assert.rejects(secrets.read('account'));
    await writeFile(authFile, JSON.stringify({ version: 2, apiKeys: {}, oauth: {} }));
    await secrets.write('account', 'unchanged-secret');
    assert.equal(await secrets.read('account'), 'unchanged-secret');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('migrates active and exit-recovery secrets with all stable identity bytes unchanged', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-runtime-secret-file-'));
  try {
    const identityFile = path.join(root, 'space', 'runtime-client-identity.json'), values = new Map<string, string>();
    const legacy = { read: async (account: string) => values.get(account), write: async (account: string, secret: string) => { values.set(account, secret); } };
    const metadata = { name: 'Space', version: 'fixture' };
    const original = new RuntimeClientIdentityStore(identityFile, path.dirname(identityFile), randomUUID, legacy);
    const first = await original.openInstance(metadata);
    await original.retireInstance(first.instanceId, { requestId: 'exit', runtimeId: 'old-host', profile: 'coder' });
    const active = await original.openInstance(metadata), before = await readFile(identityFile, 'utf8');
    const secrets = createRuntimeClientFileSecretStore({ authFile: path.join(root, 'auth.json'), legacy });
    const restored = new RuntimeClientIdentityStore(identityFile, path.dirname(identityFile), randomUUID, secrets);
    assert.deepEqual(await restored.openInstance(metadata), active);
    assert.equal((await restored.openExitRecovery(metadata))?.instanceSecret, first.instanceSecret);
    assert.equal(await readFile(identityFile, 'utf8'), before);
    const restoredRoot = path.join(root, 'restored');
    await mkdir(path.join(restoredRoot, 'space'), { recursive: true });
    await copyFile(path.join(root, 'auth.json'), path.join(restoredRoot, 'auth.json'));
    await copyFile(identityFile, path.join(restoredRoot, 'space', 'runtime-client-identity.json'));
    const relocated = createRuntimeClientFileSecretStore({ authFile: path.join(restoredRoot, 'auth.json'), legacy: {
      read: async () => { throw new Error('A moved complete profile must not need an old OS vault'); }, write: async () => undefined } });
    const movedIdentity = new RuntimeClientIdentityStore(path.join(restoredRoot, 'space', 'runtime-client-identity.json'), path.join(restoredRoot, 'space'), randomUUID, relocated);
    assert.deepEqual(await movedIdentity.openInstance(metadata), active);
    assert.equal((await movedIdentity.openExitRecovery(metadata))?.instanceSecret, first.instanceSecret);
    values.clear();
    const offline = createRuntimeClientFileSecretStore({ authFile: path.join(root, 'auth.json'), legacy: {
      read: async () => { throw new Error('old vault unavailable'); }, write: async () => { throw new Error('must not write legacy'); } } });
    const reopened = new RuntimeClientIdentityStore(identityFile, path.dirname(identityFile), randomUUID, offline);
    assert.deepEqual(await reopened.openInstance(metadata), active);
    assert.equal((await reopened.openExitRecovery(metadata))?.instanceSecret, first.instanceSecret);
    assert.equal(await readFile(identityFile, 'utf8'), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('new client storage needs no OS vault and a deleted account cannot resurrect from legacy storage', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-client-tombstone-'));
  try {
    const authFile = path.join(root, 'auth.json'), account = `runtime_client_${randomUUID()}`;
    const secrets = createRuntimeClientFileSecretStore({ authFile });
    assert.equal(await secrets.read(account), undefined);
    await secrets.write(account, 'current-fixture');
    assert.equal(await secrets.read(account), 'current-fixture');
    const file = createFileProviderCredentialStore(authFile);
    const binding = { profile: 'space-client-identity', provider: account,
      connectionFingerprint: createHash('sha256').update(JSON.stringify(['space-client-secret-v1', account])).digest('hex') };
    await file.removeApiKey(binding, (await file.describeApiKey(binding)).revision!);
    let reads = 0;
    const migrated = createRuntimeClientFileSecretStore({ authFile, legacy: {
      read: async () => { reads++; return 'old-fixture'; }, write: async () => { throw new Error('read-only legacy'); } } });
    const identity = { schemaVersion: 3 as const, clientId: `space_${randomUUID()}`, instanceId: `space_instance_${randomUUID()}`,
      secretAccount: account, createdAt: 1 };
    assert.equal(await migrated.read(account, identity), undefined);
    assert.equal(reads, 0);
    const unavailable = createRuntimeClientFileSecretStore({ authFile, legacy: {
      read: async () => { throw new Error('unavailable legacy'); }, write: async () => undefined } });
    await assert.rejects(unavailable.read('different-account', identity), /unavailable legacy/);
    assert.equal((await file.describeApiKey({ ...binding, provider: 'different-account' })).configured, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
