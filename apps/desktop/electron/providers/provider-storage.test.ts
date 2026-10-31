import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('real Main storage shares CLI keys, survives restart and fences a revoked OAuth grant', async () => {
  const suffix = `space-provider-${randomUUID()}`;
  process.env.KODAX_TEST_ONBOARDING = suffix;
  const root = path.join(os.tmpdir(), `kodax-test-${suffix}`);
  process.env.KODAX_HOME = root;
  const originalEnv = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'external-fixture';
  try {
    const [storage, credentials, sdk, runtime, events, brokerModule] = await Promise.all([
      import('./provider-storage.js'), import('./credentials.js'), import('@kodax-ai/kodax/llm'),
      import('@kodax-ai/kodax/runtime'), import('./credential-invalidation.js'), import('./runtime-credential-broker.js'),
    ]);
    await mkdir(root, { recursive: true });
    const configPath = path.join(root, 'config.json'); await writeFile(configPath, '{}');
    const state = await storage.describeProviderCredential('anthropic');
    await storage.setKey('anthropic', 'space-fixture', state);
    const proof = (await storage.providerStorageBinding('anthropic')).connectionFingerprint;
    assert.equal(await credentials.readProviderCredential('anthropic', proof), 'space-fixture');
    const manager = runtime.createProviderCredentialManager({ configPath });
    await manager.setApiKey('anthropic', 'cli-next-fixture', await manager.describe('anthropic'));
    assert.equal(await credentials.readProviderCredential('anthropic', proof), 'space-fixture');
    await storage.shareProviderCredential('anthropic', await storage.describeProviderCredential('anthropic'), 'adopt');
    assert.equal(await credentials.readProviderCredential('anthropic', proof), 'cli-next-fixture');
    await assert.rejects(storage.setKey('anthropic', 'stale', state), /conflict/i);
    await assert.rejects(storage.setKey('anthropic', 'stale-without-state'), /displayed revision/i);
    await assert.rejects(storage.deleteKey('anthropic'), /displayed revision/i);
    assert.equal(await credentials.readProviderCredential('anthropic', proof), 'cli-next-fixture');
    await assert.rejects(credentials.readProviderCredential('anthropic', 'f'.repeat(64)), /connection/i);
    await assertPendingApiKeyFence(storage, proof);
    assert.equal(process.env.ANTHROPIC_API_KEY, 'external-fixture');
    assert.doesNotMatch(JSON.stringify(await storage.describeProviderCredential('anthropic')), /cli-next-fixture|space-fixture/);
    const script = `import {getKey} from ${JSON.stringify(new URL('./provider-storage.ts', import.meta.url).href)};if(await getKey('anthropic')!=='cli-next-fixture')throw new Error('Restart lost credential');process.stdout.write('ok');`;
    const child = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { windowsHide: true, timeout: 15000 });
    assert.equal(child.stdout, 'ok');
    const connection = { ...sdk.createOAuthProviderConfig({ service: 'openrouter', name: 'subscription', model: 'fixture' }), oauthRegistration: 'registration' };
    const oldApi = { name: connection.name, protocol: 'openai' as const, baseUrl: 'https://old-api.invalid/v1', model: 'fixture', apiKeyEnv: 'OLD_API_FIXTURE_KEY' };
    await writeFile(configPath, JSON.stringify({ customProviders: [oldApi] }));
    await storage.setKey(connection.name, 'old-api-backup', await storage.describeProviderCredential(connection.name));
    const oldBinding = (await storage.describeProviderCredential(connection.name)).binding;
    await writeFile(configPath, JSON.stringify({ customProviders: [connection] }));
    const file = sdk.createFileProviderCredentialStore(path.join(root, 'auth.json'));
    await file.oauth.transact('registration', async () => ({ record: { id: 'registration', profile: 'default', service: 'openrouter', clientId: 'own-client', accountId: 'grant', credentials: { accessToken: 'grant-fixture' } }, result: undefined }));
    const broker = brokerModule.createScopedRuntimeCredentialBroker({ leaseBinding: { leaseId: 'l' }, providers: ['subscription'], sessionId: 's',
      authorize: () => true, requireConnectionProof: true, credentialEpoch: events.providerCredentialEpoch, readCredential: credentials.readProviderCredential });
    const request = { requestId: 'r', leaseId: 'l', provider: 'subscription', sessionId: 's', purpose: 'primary' as const,
      target: { kind: 'run' as const, runId: 'run' }, connectionFingerprint: sdk.createCustomProvider(connection).getCredentialConnectionFingerprint() };
    assert.equal(await broker(request), 'grant-fixture');
    assert.equal((await file.readApiKey(oldBinding))?.key, 'old-api-backup');
    assert.equal((await storage.describeProviderCredential(connection.name)).migration, 'none');
    assert.equal((await storage.describeProviderCredential(connection.name)).authenticationConfigured, true);
    await assert.rejects(credentials.readProviderCredential(connection.name, 'f'.repeat(64)), /connection/);
    const revoker = await sdk.openOAuthSession({ id: 'registration', store: sdk.createFileProviderCredentialStore(file.filePath).oauth, driver: sdk.createOAuthRefreshDriver('openrouter') });
    await revoker.revoke(); assert.equal(await broker(request), undefined);
    await assert.rejects(credentials.readProviderCredential('subscription', request.connectionFingerprint), /revoked/);
    assert.doesNotMatch(await readFile(configPath, 'utf8'), /grant-fixture|cli-next-fixture/);
    const userConfig = await import('../kodax/user-config.js');
    const oldConnection = { name: 'before', protocol: 'openai' as const, baseUrl: 'https://same.invalid/v1', apiKeyEnv: 'NO_FIXTURE_ENV', model: 'm' };
    await writeFile(configPath, JSON.stringify({ provider: 'before', customProviders: [oldConnection] }));
    await storage.setKey('before', 'original-alias-key', await storage.describeProviderCredential('before'));
    const previous = await storage.describeProviderCredential('before');
    const target = { profile: 'default', provider: 'after', connectionFingerprint: sdk.createCustomProvider({ ...oldConnection, name: 'after' }).getCredentialConnectionFingerprint() };
    await file.setApiKey(target, 'other-cli-key', null);
    const update = { displayName: 'after', protocol: 'openai' as const, baseUrl: oldConnection.baseUrl, apiKeyEnv: oldConnection.apiKeyEnv, defaultModel: 'm' };
    await assert.rejects(userConfig.updateKodaxConfigCustomProvider('before', update, async name => { await storage.moveProviderCredential(name, previous); }), /conflict/);
    assert.equal(JSON.parse(await readFile(configPath, 'utf8')).provider, 'before');
    assert.equal(await storage.getKey('before'), 'original-alias-key');
    assert.equal((await file.readApiKey(target))?.key, 'other-cli-key');
    assert.equal(await storage.getBackendStatus(), 'file');
    assert.equal(await storage.hasKey('before'), true);
    assert.deepEqual(await storage.listConfiguredAccounts(['before']), ['before']);
    await storage.deleteKey('before', await storage.describeProviderCredential('before'));
    assert.equal(await storage.getKey('before'), undefined);
    assert.equal(await storage.hasKey('before'), false);
    assert.equal((await storage.describeProviderCredential('codex-cli')).authentication, 'external');
    const cloud = { name: 'native-cloud', protocol: 'google', baseUrl: 'https://us-central1-aiplatform.googleapis.com',
      model: 'fixture', apiKeyEnv: 'NO_FIXTURE_ENV', cloud: { service: 'vertex', project: 'fixture', location: 'us-central1' } };
    await writeFile(configPath, JSON.stringify({ customProviders: [cloud] }));
    assert.equal((await storage.describeProviderCredential('native-cloud')).authentication, 'cloud');
    await writeFile(configPath, JSON.stringify({ customProviders: [cloud, cloud] }));
    await assert.rejects(storage.configuredConnection('native-cloud'), /Duplicate/);
  } finally {
    if (originalEnv === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalEnv;
    await rm(root, { recursive: true, force: true });
  }
});


async function assertPendingApiKeyFence(storage: typeof import('./provider-storage.js'), proof: string): Promise<void> {
  const [{ createScopedRuntimeCredentialBroker }, events] = await Promise.all([
    import('./runtime-credential-broker.js'), import('./credential-invalidation.js'),
  ]);
  const old = await storage.getKey('anthropic', proof); assert.ok(old);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const broker = createScopedRuntimeCredentialBroker({ leaseBinding: { leaseId: 'key-lease' }, providers: ['anthropic'], sessionId: 'key-session',
    authorize: () => true, credentialEpoch: events.providerCredentialEpoch, requireConnectionProof: true,
    readCredential: async () => { entered(); await gate; return old; } });
  const pending = broker({ requestId: 'key-request', leaseId: 'key-lease', provider: 'anthropic', sessionId: 'key-session', purpose: 'primary',
    target: { kind: 'run', runId: 'owned-key-run' }, connectionFingerprint: proof });
  await started;
  try { await storage.setKey('anthropic', 'explicit-next-account', await storage.describeProviderCredential('anthropic')); }
  finally { release(); }
  assert.equal(await pending, undefined, 'a previous account must not arrive after a confirmed credential switch');
  assert.equal(await storage.getKey('anthropic', proof), 'explicit-next-account');
  await storage.setKey('anthropic', old, await storage.describeProviderCredential('anthropic'));
}
