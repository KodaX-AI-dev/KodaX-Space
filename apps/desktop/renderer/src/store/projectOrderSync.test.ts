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
const { adoptSavedProjectOrder } = await import('./projectOrderSync.js');

const LEGACY_KEY = 'kodax-space.projectOrder';

function fakeBridge(ok: boolean) {
  const saved: unknown[] = [];
  const bridge = {
    invoke: async (channel: string, input: unknown) => {
      assert.equal(channel, 'project.order.set');
      saved.push(input);
      return ok ? { ok: true, data: {} } : { ok: false, error: { code: 'INTERNAL', message: 'x' } };
    },
  } as unknown as NonNullable<Window['kodaxSpace']>;
  return { bridge, saved };
}

beforeEach(() => {
  storage.clear();
  useAppStore.setState({ projectOrder: [] });
});

test('the order saved in projects.json wins and the legacy copy is dropped', async () => {
  storage.set(LEGACY_KEY, JSON.stringify(['/stale']));
  const { bridge, saved } = fakeBridge(true);
  await adoptSavedProjectOrder(bridge, ['/b', '/a']);
  assert.deepEqual(useAppStore.getState().projectOrder, ['/b', '/a']);
  assert.deepEqual(saved, []);
  assert.equal(storage.has(LEGACY_KEY), false);
});

test('a legacy localStorage order moves into projects.json once', async () => {
  storage.set(LEGACY_KEY, JSON.stringify(['/c', '/a']));
  const { bridge, saved } = fakeBridge(true);
  await adoptSavedProjectOrder(bridge, []);
  assert.deepEqual(useAppStore.getState().projectOrder, ['/c', '/a']);
  assert.deepEqual(saved, [{ order: ['/c', '/a'] }]);
  assert.equal(storage.has(LEGACY_KEY), false);
});

test('a failed migration keeps the legacy copy for the next start', async () => {
  storage.set(LEGACY_KEY, JSON.stringify(['/c', '/a']));
  const { bridge } = fakeBridge(false);
  await adoptSavedProjectOrder(bridge, []);
  assert.deepEqual(useAppStore.getState().projectOrder, ['/c', '/a']);
  assert.equal(storage.get(LEGACY_KEY), JSON.stringify(['/c', '/a']));
});

test('dragging no longer writes the order to localStorage', () => {
  useAppStore.getState().setProjectOrder(['/x']);
  assert.equal(storage.has(LEGACY_KEY), false);
});
