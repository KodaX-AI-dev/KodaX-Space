import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
async function provider(space: SpaceInstance) {
  const result = await invoke<ChannelOutput<'provider.list'>>(space, 'provider.list');
  assert.ok(result.ok, 'real Provider IPC must accept its own output schema');
  expect(result.data.keychainBackend).toBe('file');
  const item = result.data.providers.find(value => value.id === 'anthropic');
  assert.ok(item?.credentialState); return item;
}

test('real Electron Provider IPC saves shared keys, rejects stale revisions and never returns a key', async () => {
  const space = await launchSpace(`provider-file-${Date.now()}`, { env: { ANTHROPIC_API_KEY: 'external-fixture' } });
  try {
    const initial = await provider(space);
    expect(initial.configuredSource).toBe('env');
    const saved = await invoke(space, 'provider.setKey', { providerId: 'anthropic', apiKey: 'space-fixture', expected: initial.credentialState });
    expect(saved.ok).toBe(true);
    const current = await provider(space);
    expect(current.configuredSource).toBe('both');
    expect(current.credentialState?.configured).toBe(true);
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
