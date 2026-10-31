import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { ChannelOutput, IpcResult } from '@kodax-space/space-ipc-schema';
import { launchSpace, type SpaceInstance } from './fixtures.js';

async function invoke<T>(space: SpaceInstance, name: string, input?: unknown): Promise<IpcResult<T>> {
  return space.page.evaluate(async ({ name, input }) => {
    const bridge = (window as unknown as { kodaxSpace: { invoke(name: string, input?: unknown): Promise<unknown> } }).kodaxSpace;
    return await bridge.invoke(name, input) as IpcResult<T>;
  }, { name, input });
}
async function provider(space: SpaceInstance, id = 'anthropic') {
  const result = await invoke<ChannelOutput<'provider.list'>>(space, 'provider.list');
  assert.ok(result.ok, 'real Provider IPC must accept its own output schema');
  expect(result.data.keychainBackend).toBe('file');
  const item = result.data.providers.find(value => value.id === id);
  assert.ok(item?.credentialState); return item;
}

test('real Electron Provider IPC saves shared keys, rejects stale revisions and never returns a key', async () => {
  const space = await launchSpace(`provider-file-${Date.now()}`, { env: { ANTHROPIC_API_KEY: 'external-fixture' } });
  try {
    const initial = await provider(space);
    expect(initial.configuredSource).toBe('env');
    const saved = await invoke(space, 'provider.setKey', { providerId: 'anthropic', apiKey: 'space-fixture', expected: initial.credentialState });
    expect(saved.ok).toBe(true);
    const independent = await provider(space);
    expect(independent.configuredSource).toBe('both');
    expect(independent.credentialState?.scope).toBe('space');
    const shared = await invoke(space, 'provider.shareKey', { providerId: 'anthropic', expected: independent.credentialState, mode: 'publish' });
    expect(shared.ok).toBe(true);
    const current = await provider(space);
    expect(current.credentialState?.scope).toBe('shared');
    const { createFileProviderCredentialStore } = await import('@kodax-ai/kodax/llm');
    const store = createFileProviderCredentialStore(path.join(space.testDataDir, 'auth.json'));
    const state = current.credentialState!;
    await store.setApiKey(state.binding, 'cli-next-fixture', state.revision);
    const stale = await invoke(space, 'provider.removeKey', { providerId: 'anthropic', expected: state });
    expect(stale.ok).toBe(false);
    expect((await store.readApiKey(state.binding))?.key).toBe('cli-next-fixture');
    const latest = await provider(space);
    expect(JSON.stringify(latest)).not.toMatch(/space-fixture|cli-next-fixture|external-fixture/);
    const removed = await invoke(space, 'provider.removeKey', { providerId: 'anthropic', expected: latest.credentialState });
    expect(removed.ok).toBe(true);
    expect((await provider(space)).configuredSource).toBe('env');
    expect(await store.readApiKey(state.binding)).toBeUndefined();
    await space.page.reload();
    expect((await provider(space)).credentialState?.configured).toBe(false);
    const config = await readFile(path.join(space.testDataDir, 'config.json'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return ''; throw error;
    });
    expect(config).not.toMatch(/space-fixture|cli-next-fixture|external-fixture/);
  } finally { await space.close(); }
});

async function localUpgradeConnection() {
  const observed: string[] = [];
  const server = createServer(async (request, response) => {
    observed.push(String(request.headers.authorization));
    for await (const chunk of request) void chunk;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(request.method === 'GET' ? { data: [{ id: 'fixture-model' }] }
      : { id: 'fixture', choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const connection = { name: 'upgrade-connection', protocol: 'openai' as const, apiKeyEnv: 'SPACE_PROVIDER_UPGRADE_FIXTURE_KEY',
    baseUrl: `http://127.0.0.1:${address.port}/v1`, skipBaseUrlValidation: true, model: 'fixture-model', reasoning: 'none' as const };
  return { connection, observed, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

async function prepareUpgradeProfile(root: string, connection: Awaited<ReturnType<typeof localUpgradeConnection>>['connection']): Promise<void> {
  const { createCustomProvider, createFileProviderCredentialStore } = await import('@kodax-ai/kodax/llm');
  await writeFile(path.join(root, 'config.json'), JSON.stringify({ provider: connection.name, customProviders: [connection] }));
  const store = createFileProviderCredentialStore(path.join(root, 'auth.json'));
  await store.setApiKey({ profile: 'default', provider: connection.name,
    connectionFingerprint: createCustomProvider(connection).getCredentialConnectionFingerprint() }, 'fixture-cli-b', null);
}

test('an actual desktop restart keeps the Space env source and uses the other account only after explicit adoption', async () => {
  const fixture = await localUpgradeConnection(), backup = await mkdtemp(path.join(os.tmpdir(), 'space-provider-upgrade-backup-'));
  const { KODAX_PROVIDER_SNAPSHOTS } = await import('@kodax-ai/kodax/llm');
  const cleanEnv = Object.fromEntries(Object.values(KODAX_PROVIDER_SNAPSHOTS).map(value => [value.apiKeyEnv, '']));
  const testId = `provider-upgrade-${Date.now()}`;
  let first: SpaceInstance | undefined, second: SpaceInstance | undefined;
  try {
    first = await launchSpace(testId, { env: { ...cleanEnv, [fixture.connection.apiKeyEnv]: 'fixture-space-a' },
      prepareProfile: root => prepareUpgradeProfile(root, fixture.connection) });
    const verified = await invoke<{ ok: boolean }>(first, 'provider.test', { providerId: fixture.connection.name });
    assert.ok(verified.ok); expect(verified.data.ok).toBe(true);
    expect(fixture.observed.at(-1)).toBe('Bearer fixture-space-a');
    await copyFile(path.join(first.testDataDir, 'auth.json'), path.join(backup, 'auth.json'));
    await copyFile(path.join(first.testDataDir, 'config.json'), path.join(backup, 'config.json'));
    await first.close(); first = undefined;
    second = await launchSpace(testId, { env: { ...cleanEnv, [fixture.connection.apiKeyEnv]: '' }, prepareProfile: async root => {
      await mkdir(root, { recursive: true });
      for (const file of ['auth.json', 'config.json']) await copyFile(path.join(backup, file), path.join(root, file));
    } });
    const before = fixture.observed.length;
    const missing = await invoke<{ ok: boolean }>(second, 'provider.test', { providerId: fixture.connection.name });
    assert.ok(missing.ok); expect(missing.data.ok).toBe(false); expect(fixture.observed.length).toBe(before);
    const current = await provider(second, fixture.connection.name);
    expect(current.credentialState?.scope).toBe('space');
    const adopted = await invoke(second, 'provider.shareKey', { providerId: fixture.connection.name, expected: current.credentialState, mode: 'adopt' });
    expect(adopted.ok).toBe(true);
    const next = await invoke<{ ok: boolean }>(second, 'provider.test', { providerId: fixture.connection.name });
    assert.ok(next.ok); expect(next.data.ok).toBe(true); expect(fixture.observed.at(-1)).toBe('Bearer fixture-cli-b');
    expect(JSON.stringify(await provider(second, fixture.connection.name))).not.toMatch(/fixture-space-a|fixture-cli-b/);
  } finally {
    if (second) await second.close(); if (first) await first.close();
    await fixture.close();
    assert.equal(path.dirname(backup), os.tmpdir()); assert.ok(path.basename(backup).startsWith('space-provider-upgrade-backup-'));
    await rm(backup, { recursive: true, force: true });
  }
});
