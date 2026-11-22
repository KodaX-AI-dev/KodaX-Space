import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const { useAppStore } = await import('./appStore.js');
const { loadSessionFlags } = await import('./sessionFlagSync.js');

function fakeBridge(result: unknown) {
  return {
    invoke: async (channel: string) => {
      assert.equal(channel, 'session.flags.list');
      return result;
    },
  } as unknown as NonNullable<Window['kodaxSpace']>;
}

beforeEach(() => {
  useAppStore.setState({ sessionFlags: {} });
});

test('saved pin / archive flags load at startup and keep unread marks', async () => {
  useAppStore.setState({ sessionFlags: { a: { unread: true }, gone: { pinnedAt: 5 } } });
  await loadSessionFlags(
    fakeBridge({ ok: true, data: { flags: { a: { pinnedAt: 7 }, b: { archivedAt: 9 } } } }),
  );
  assert.deepEqual(useAppStore.getState().sessionFlags, {
    a: { pinnedAt: 7, unread: true },
    b: { archivedAt: 9 },
  });
});

test('a failed load keeps the current flags', async () => {
  useAppStore.setState({ sessionFlags: { a: { unread: true } } });
  const ok = await loadSessionFlags(fakeBridge({ ok: false, error: { message: 'x' } }));
  assert.equal(ok, false);
  assert.deepEqual(useAppStore.getState().sessionFlags, { a: { unread: true } });
});
