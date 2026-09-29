import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type {
  ChannelOutput,
  IpcResult,
  SpaceRuntimeProfileProjectionT,
} from '@kodax-space/space-ipc-schema';

process.env.KODAX_TEST_ONBOARDING = 'session-list-activity';
const require = createRequire(import.meta.url);
require('electron');
const electronModule = require.cache[require.resolve('electron')];
assert.ok(electronModule);
const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
electronModule.exports = {
  ipcMain: {
    handle: (name: string, handler: (event: unknown, input: unknown) => Promise<unknown>) =>
      handlers.set(name, handler),
  },
};
const { registerSessionChannels } = await import('./session.js');
const { setSessionStoreImpl } = await import('../kodax/session-store.js');
const { setSessionTitleStoreForTesting } = await import('../kodax/session-title-store.js');
const { setUserConfigImpl } = await import('../kodax/user-config.js');
const { getSessionRuntimeStore } = await import('../kodax/session-runtime-store.js');
const { runtimeProjectionController } =
  await import('../kodax/runtime/runtime-projection-controller.js');
const { runtimeHostAdapter } = await import('../kodax/runtime-host-adapter.js');
const { projectStore } = await import('../projects/store.js');
const { settingsStore } = await import('../settings/store.js');
const { providerConfigStore } = await import('../providers/config.js');
registerSessionChannels();

test('session.list repairs out-of-page activity and ordering with no additional SDK reads', async (t) => {
  let listCalls = 0;
  let historyCalls = 0;
  const noHistory = async () => {
    historyCalls += 1;
    throw new Error('must not read a transcript');
  };
  setSessionStoreImpl({
    listSessions: async () => {
      listCalls += 1;
      return [
        {
          id: 's_new',
          title: 'New',
          msgCount: 2,
          createdAt: new Date(200).toISOString(),
          runtimeInfo: { workspaceRoot: process.cwd() },
        },
        {
          id: 's_old',
          title: 'Old',
          msgCount: 2,
          createdAt: new Date(100).toISOString(),
          runtimeInfo: { workspaceRoot: process.cwd() },
        },
        {
          id: 's_partner',
          title: 'Partner',
          tag: 'partner',
          msgCount: 2,
          createdAt: new Date(50).toISOString(),
          runtimeInfo: { workspaceRoot: process.cwd() },
        },
      ];
    },
    loadSession: noHistory,
    loadFullTranscript: noHistory,
    readConversationHistory: noHistory,
    forkSession: async () => null,
    rewindSession: async () => null,
    deleteSession: async () => ({ ok: true }),
    watchSessions: () => ({ close: () => undefined }),
  });
  setSessionTitleStoreForTesting({
    read: async () => null,
    set: async () => undefined,
    delete: async () => undefined,
  });
  setUserConfigImpl({ loadConfig: () => ({}), registerCustomProviders: () => undefined });
  t.after(() => {
    setSessionStoreImpl(null);
    setSessionTitleStoreForTesting(null);
    setUserConfigImpl(null);
  });
  t.mock.method(projectStore, 'assertAllowed', async () => process.cwd());
  t.mock.method(settingsStore, 'load', async () => ({}));
  t.mock.method(providerConfigStore, 'load', async () => undefined);
  t.mock.method(providerConfigStore, 'getDefaultProviderId', () => null);
  t.mock.method(getSessionRuntimeStore(), 'read', async () => null);
  const observations = t.mock.method(runtimeHostAdapter, 'findActiveRunId', async () => {
    throw new Error('no Runtime query allowed');
  });
  let profile: SpaceRuntimeProfileProjectionT = {
    connection: { state: 'connecting', changedAt: 1, stale: true, capabilities: [] },
    projectionRevision: 0,
    sessions: [],
    interactions: [],
    notifications: [],
  };
  t.mock.method(runtimeProjectionController, 'profileSnapshot', () => profile);
  const invoke = handlers.get('session.list');
  assert.ok(invoke);
  const list = async () => {
    const result = (await invoke({}, { projectRoot: process.cwd() })) as IpcResult<
      ChannelOutput<'session.list'>
    >;
    if (!result.ok) throw new Error(result.error.message);
    return result.data.sessions;
  };
  assert.deepEqual(
    (await list()).map((s) => s.sessionId),
    ['s_new', 's_old', 's_partner'],
  );
  assert.equal(listCalls, 1);
  profile = {
    ...profile,
    sessionActivity: [
      { sessionId: 's_old', lastActivityAt: 300 },
      { sessionId: 's_partner', lastActivityAt: 900 },
      { sessionId: 's_unknown', lastActivityAt: 999 },
    ],
  };
  const refreshed = await list();
  assert.deepEqual(
    refreshed.map((s) => [s.sessionId, s.lastActivityAt]),
    [
      ['s_old', 300],
      ['s_new', 200],
      ['s_partner', 50],
    ],
  );
  assert.equal(listCalls, 1, 'activity changes must reuse the existing summary cache');
  assert.equal(historyCalls, 0);
  assert.equal(observations.mock.callCount(), 0);
});
