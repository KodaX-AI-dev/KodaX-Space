import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

// The legacy order lives in localStorage; the fake must exist before the store module loads.
type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};
const storage = new Map<string, string>();
const fakeStorage: StorageLike = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => void storage.set(key, value),
  removeItem: (key) => void storage.delete(key),
};
(globalThis as { window?: { localStorage?: StorageLike } }).window = {
  localStorage: fakeStorage,
};
(globalThis as { localStorage?: StorageLike }).localStorage = fakeStorage;

const { useAppStore } = await import('./appStore.js');
const { migrateLegacyProjectOrder } = await import('./projectOrderSync.js');

const LEGACY_KEY = 'kodax-space.projectOrder';
const listed = [{ path: '/c', name: 'c', addedAt: 1, lastUsedAt: 1 }];

function fakeBridge(ok: boolean) {
  const calls: { channel: string; input: unknown }[] = [];
  const bridge = {
    invoke: async (channel: string, input: unknown) => {
      calls.push({ channel, input });
      if (!ok) return { ok: false, error: { code: 'INTERNAL', message: 'x' } };
      if (channel === 'project.list')
        return { ok: true, data: { projects: listed, order: ['/c'] } };
      return { ok: true, data: {} };
    },
  } as unknown as NonNullable<Window['kodaxSpace']>;
  return { bridge, calls };
}

beforeEach(() => {
  storage.clear();
  useAppStore.setState({ projects: [] });
});

test('without a legacy localStorage order nothing is sent', async () => {
  const { bridge, calls } = fakeBridge(true);
  await migrateLegacyProjectOrder(bridge, []);
  assert.deepEqual(calls, []);
});

test('a legacy localStorage order moves into projects.json once and the list refreshes', async () => {
  storage.set(LEGACY_KEY, JSON.stringify(['/c', '/a']));
  const { bridge, calls } = fakeBridge(true);
  await migrateLegacyProjectOrder(bridge, []);
  assert.deepEqual(calls[0], { channel: 'project.order.set', input: { order: ['/c', '/a'] } });
  assert.deepEqual(useAppStore.getState().projects, listed);
  assert.equal(storage.has(LEGACY_KEY), false);
});

test('a failed migration keeps the legacy copy for the next start', async () => {
  storage.set(LEGACY_KEY, JSON.stringify(['/c', '/a']));
  const { bridge } = fakeBridge(false);
  await migrateLegacyProjectOrder(bridge, []);
  assert.deepEqual(useAppStore.getState().projects, []);
  assert.equal(storage.get(LEGACY_KEY), JSON.stringify(['/c', '/a']));
});

test('a saved projects.json order wins: the legacy copy is dropped, not sent', async () => {
  storage.set(LEGACY_KEY, JSON.stringify(['/c', '/a']));
  const { bridge, calls } = fakeBridge(true);
  await migrateLegacyProjectOrder(bridge, ['/a', '/c']);
  assert.deepEqual(calls, []);
  assert.equal(storage.has(LEGACY_KEY), false);
});
