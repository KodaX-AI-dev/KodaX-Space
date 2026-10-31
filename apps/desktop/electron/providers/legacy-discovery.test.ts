import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFileProviderCredentialStore } from '@kodax-ai/kodax/llm';
import { legacyDiscovery } from './legacy-discovery.js';
import { RuntimeClientIdentityStore } from '../kodax/runtime/runtime-client-identity.js';
import { randomUUID } from 'node:crypto';

test('a new profile never starts discovering unrelated legacy credentials after its settings are created', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-discovery-new-'));
  try {
    const store = createFileProviderCredentialStore(path.join(root, 'auth.json')), spaceDir = path.join(root, 'space');
    assert.equal((await legacyDiscovery(store, spaceDir)).enabled, false);
    await mkdir(spaceDir); await writeFile(path.join(spaceDir, 'provider-config.json'), '{}');
    assert.equal((await legacyDiscovery(store, spaceDir)).enabled, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('new file-backed client identities do not imply an old OS vault, while old identities retain migration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-discovery-client-'));
  try {
    for (const old of [false, true]) {
      const home = path.join(root, old ? 'old' : 'new'), space = path.join(home, 'space');
      const values = new Map<string, string>();
      const legacy = { read: async (account: string) => values.get(account), write: async (account: string, value: string) => { values.set(account, value); } };
      const identity = new RuntimeClientIdentityStore(path.join(space, 'runtime-client-identity.json'), space, randomUUID, old ? legacy : undefined);
      await identity.openInstance({ name: 'fixture', version: 'fixture' });
      const store = createFileProviderCredentialStore(path.join(home, 'auth.json'));
      assert.equal((await legacyDiscovery(store, space)).enabled, old);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unsafe or malformed legacy metadata is preserved and never classified as an empty new profile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-discovery-invalid-'));
  try {
    const space = path.join(root, 'space'); await mkdir(space);
    const file = path.join(space, 'runtime-client-identity.json'); await writeFile(file, 'sensitive-identity-fragment');
    const store = createFileProviderCredentialStore(path.join(root, 'auth.json'));
    await assert.rejects(legacyDiscovery(store, space), error => error instanceof Error
      && /Invalid legacy migration metadata/.test(error.message) && !error.message.includes('sensitive-identity-fragment'));
    await rm(file); await mkdir(path.join(space, 'provider-config.json'));
    await assert.rejects(legacyDiscovery(store, space), /Invalid legacy/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an old profile keeps migration eligibility and does not suppress another profile sharing its SDK home', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-discovery-old-'));
  try {
    const store = createFileProviderCredentialStore(path.join(root, 'auth.json')), first = path.join(root, 'space'), other = path.join(root, 'other', 'space');
    await mkdir(first); await writeFile(path.join(first, 'provider-config.json'), '{}');
    assert.equal((await legacyDiscovery(store, first)).enabled, true);
    const independent = await legacyDiscovery(store, other);
    assert.equal(independent.enabled, false); assert.ok(independent.scopeId);
    assert.equal((await legacyDiscovery(store, first)).enabled, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
