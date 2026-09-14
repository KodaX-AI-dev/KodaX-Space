import assert from 'node:assert/strict';
import test from 'node:test';
import type { SpaceExtensionT } from '@kodax-space/space-ipc-schema';
import { createExtensionCatalog, type ExtensionCatalogApi } from './extensionCatalog.js';

const extension: SpaceExtensionT = {
  id: 'partner-library',
  name: 'Partner library',
  description: 'Experts and connectors',
  version: '1.0.0',
  enabled: true,
  installedAt: 1788134400000,
  expertCount: 0,
  connectorCount: 0,
};

function fixture() {
  let entries: SpaceExtensionT[] = [];
  let listener: ((extensions: SpaceExtensionT[]) => void) | undefined;
  const calls: string[] = [];
  const api: ExtensionCatalogApi = {
    list: async () => entries,
    install: async () => {
      calls.push('install');
      entries = [extension];
      return { extension };
    },
    setEnabled: async (extensionId, enabled) => {
      calls.push(`enabled:${extensionId}:${enabled}`);
      const updated = { ...extension, enabled };
      entries = [updated];
      return updated;
    },
    uninstall: async (extensionId) => {
      calls.push(`uninstall:${extensionId}`);
      entries = [];
    },
    subscribe: (next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
  };
  return { api, calls, publish: (next: SpaceExtensionT[]) => listener?.(next) };
}

test('catalog lifecycle exposes the installed package and removes its navigation on disable/uninstall', async () => {
  const { api, calls } = fixture();
  const catalog = createExtensionCatalog(api);
  await catalog.refresh();
  assert.deepEqual(catalog.getSnapshot().extensions, []);
  assert.equal(catalog.getSnapshot().loading, false);

  await catalog.install();
  assert.equal(catalog.getSnapshot().extensions[0]?.id, extension.id);
  await catalog.setEnabled(extension.id, false);
  assert.equal(catalog.getSnapshot().extensions[0]?.enabled, false);
  await catalog.uninstall(extension.id);
  assert.deepEqual(catalog.getSnapshot().extensions, []);
  assert.deepEqual(calls, [
    'install',
    'enabled:partner-library:false',
    'uninstall:partner-library',
  ]);
});

test('a cancelled file picker leaves the installed library unchanged', async () => {
  const { api } = fixture();
  api.list = async () => [extension];
  api.install = async () => ({ cancelled: true });
  const catalog = createExtensionCatalog(api);
  await catalog.refresh();
  assert.deepEqual(await catalog.install(), { cancelled: true });
  assert.deepEqual(catalog.getSnapshot().extensions, [extension]);
});

test('a failed lifecycle request does not pretend the extension was changed', async () => {
  const { api } = fixture();
  api.list = async () => [extension];
  api.uninstall = async () => {
    throw new Error('package is in use');
  };
  const catalog = createExtensionCatalog(api);
  await catalog.refresh();
  await assert.rejects(catalog.uninstall(extension.id), /package is in use/);
  assert.deepEqual(catalog.getSnapshot().extensions, [extension]);
});

test('an extension change event wins over an older list response', async () => {
  const { api, publish } = fixture();
  let resolveList!: (entries: SpaceExtensionT[]) => void;
  api.list = () =>
    new Promise((resolve) => {
      resolveList = resolve;
    });
  const catalog = createExtensionCatalog(api);
  const stop = catalog.connect();
  publish([{ ...extension, enabled: false }]);
  resolveList([extension]);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(catalog.getSnapshot().extensions[0]?.enabled, false);
  assert.equal(catalog.getSnapshot().loading, false);
  stop();
});

test('catalog reports load failures and can retry without a page reload', async () => {
  const { api } = fixture();
  api.list = async () => {
    throw new Error('offline');
  };
  const catalog = createExtensionCatalog(api);
  await catalog.refresh();
  assert.equal(catalog.getSnapshot().error, 'offline');
  assert.equal(catalog.getSnapshot().loading, false);
  api.list = async () => [extension];
  await catalog.refresh();
  assert.equal(catalog.getSnapshot().error, null);
  assert.deepEqual(catalog.getSnapshot().extensions, [extension]);
});

test('disconnect ignores a late response and unregisters the change listener', async () => {
  const { api, publish } = fixture();
  let resolveList!: (entries: SpaceExtensionT[]) => void;
  api.list = () =>
    new Promise((resolve) => {
      resolveList = resolve;
    });
  const catalog = createExtensionCatalog(api);
  const stop = catalog.connect();
  stop();
  const snapshot = catalog.getSnapshot();
  publish([extension]);
  resolveList([extension]);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(catalog.getSnapshot(), snapshot);
});

test('an unavailable extension subscription is reported without crashing the core shell', () => {
  const { api } = fixture();
  api.subscribe = () => {
    throw new Error('extension channel unavailable');
  };
  const catalog = createExtensionCatalog(api);
  assert.doesNotThrow(() => catalog.connect());
  assert.equal(catalog.getSnapshot().error, 'extension channel unavailable');
  assert.equal(catalog.getSnapshot().loading, false);
  assert.deepEqual(catalog.getSnapshot().extensions, []);
});
