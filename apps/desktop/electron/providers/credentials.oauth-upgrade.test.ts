import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function fixture(t: TestContext) {
  const suffix = `oauth-upgrade-${randomUUID()}`, root = path.join(os.tmpdir(), `kodax-test-${suffix}`);
  const oldProfile = process.env.KODAX_TEST_ONBOARDING, oldHome = process.env.KODAX_HOME, originalFetch = globalThis.fetch;
  process.env.KODAX_TEST_ONBOARDING = suffix; process.env.KODAX_HOME = root;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    if (oldProfile === undefined) delete process.env.KODAX_TEST_ONBOARDING; else process.env.KODAX_TEST_ONBOARDING = oldProfile;
    if (oldHome === undefined) delete process.env.KODAX_HOME; else process.env.KODAX_HOME = oldHome;
    assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('kodax-test-oauth-upgrade-'));
    await rm(root, { recursive: true, force: true });
  });
  const [llm, credentials, events, broker] = await Promise.all([import('@kodax-ai/kodax/llm'), import('./credentials.js'),
    import('./credential-invalidation.js'), import('./runtime-credential-broker.js')]);
  await mkdir(root, { recursive: true });
  const name = 'switch-fixture';
  const a = { ...llm.createOAuthProviderConfig({ service: 'xai', name, model: 'fixture' }), oauthRegistration: 'account-a' };
  const b = { ...a, oauthRegistration: 'account-b' };
  const api = { name, protocol: 'openai' as const, baseUrl: 'https://fixture.invalid/v1', apiKeyEnv: 'NO_UPGRADE_FIXTURE_ENV', model: 'fixture' };
  const file = llm.createFileProviderCredentialStore(path.join(root, 'auth.json'));
  for (const id of ['account-a', 'account-b']) await file.oauth.transact(id, async () => ({ record: { id, service: 'xai',
    clientId: 'own-fixture-client', accountId: id, credentials: { accessToken: id, refreshToken: `refresh-${id}`,
      expiresAt: id === 'account-a' ? 1 : Date.now() + 3600_000 } }, result: undefined }));
  await file.setApiKey({ profile: 'default', provider: name, connectionFingerprint: llm.createCustomProvider(api).getCredentialConnectionFingerprint() }, 'account-b', null);
  const select = (connection: typeof a | typeof api) => writeFile(path.join(root, 'config.json'), JSON.stringify({ customProviders: [connection] }));
  await select(a);
  const request = { requestId: 'r', leaseId: 'lease', provider: name, sessionId: 'session', purpose: 'primary' as const,
    target: { kind: 'run' as const, runId: 'run' }, connectionFingerprint: llm.createCustomProvider(a).getCredentialConnectionFingerprint() };
  const makeBroker = () => broker.createScopedRuntimeCredentialBroker({ leaseBinding: { leaseId: 'lease' }, providers: [name],
    sessionId: 'session', authorize: () => true, credentialEpoch: events.providerCredentialEpoch,
    requireConnectionProof: true, readCredential: credentials.readProviderCredential });
  return { a, b, api, file, name, select, request, makeBroker, llm, credentials, events };
}

async function assertSwitch(f: Awaited<ReturnType<typeof fixture>>, target: 'oauth' | 'api', t: TestContext) {
  await f.file.oauth.transact('account-a', async record => ({ record: { ...record!, credentials: { ...record!.credentials!, expiresAt: Date.now() + 3600_000 } }, result: undefined }));
  await f.select(f.a);
  await f.credentials.readProviderCredential(f.name, f.request.connectionFingerprint);
  await f.file.oauth.transact('account-a', async record => ({ record: { ...record!, credentials: { ...record!.credentials!, expiresAt: 1 } }, result: undefined }));
  const destination = target === 'oauth' ? f.b : f.api, started = deferred(), release = deferred(), fenced = deferred();
  const unsubscribe = f.events.onProviderCredentialInvalidation(provider => { if (provider === f.name) fenced.resolve(); });
  t.after(unsubscribe);
  globalThis.fetch = async url => {
    assert.match(String(url), /auth\.x\.ai/); started.resolve(); await release.promise;
    return new Response(JSON.stringify({ access_token: 'refreshed-account-a', refresh_token: 'next-a', expires_in: 3600 }));
  };
  const old = f.makeBroker()(f.request).catch(() => undefined);
  let current: Promise<PromiseSettledResult<string | undefined>[]> | undefined, timely = false;
  try {
    await started.promise; await f.select(destination);
    const proof = f.llm.createCustomProvider(destination).getCredentialConnectionFingerprint();
    current = Promise.allSettled([f.credentials.readProviderCredential(f.name, proof)]);
    const timer = setTimeout(() => fenced.resolve(), 1000);
    const epoch = f.events.providerCredentialEpoch(f.name);
    await fenced.promise; clearTimeout(timer);
    timely = f.events.providerCredentialEpoch(f.name) > epoch;
  } finally { release.resolve(); }
  const [previous, latest] = await Promise.all([old, current]);
  assert.equal(previous, undefined, 'old account must not reach a broker after source change');
  assert.deepEqual(latest, [{ status: 'fulfilled', value: 'account-b' }]); assert.equal(timely, true, 'local fencing must precede lock release');
  const proof = f.llm.createCustomProvider(destination).getCredentialConnectionFingerprint();
  assert.equal(await f.makeBroker()({ ...f.request, connectionFingerprint: proof }), 'account-b');
}

test('OAuth source changes fence old refreshes before waiting on the credential document', { timeout: 20000 }, async t => {
  const f = await fixture(t);
  for (const target of ['oauth', 'api'] as const) await t.test(target, sub => assertSwitch(f, target, sub));
  await t.test('failed initialization retries the same selected registration after repair', async () => {
    await f.select(f.b);
    const before = await readFile(f.file.filePath, 'utf8');
    await writeFile(f.file.filePath, '{broken');
    const proof = f.llm.createCustomProvider(f.b).getCredentialConnectionFingerprint();
    await assert.rejects(f.credentials.readProviderCredential(f.name, proof), /storage/);
    await writeFile(f.file.filePath, before);
    assert.equal(await f.credentials.readProviderCredential(f.name, proof), 'account-b');
  });
});
