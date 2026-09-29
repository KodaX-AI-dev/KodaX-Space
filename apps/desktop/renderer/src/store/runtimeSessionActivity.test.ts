import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { SessionMeta, SpaceRuntimeProfileProjectionT } from '@kodax-space/space-ipc-schema';
import { useAppStore } from './appStore.js';
import { createRuntimeProjectionState } from './runtimeProjectionState.js';

const session: SessionMeta = {
  sessionId: 's_activity',
  projectRoot: '/repo',
  provider: 'mock',
  surface: 'code',
  reasoningMode: 'auto',
  permissionMode: 'accept-edits',
  agentMode: 'ama',
  createdAt: 100,
  lastActivityAt: 100,
};
const profile: SpaceRuntimeProfileProjectionT = {
  connection: {
    state: 'ready',
    changedAt: 1,
    stale: false,
    runtimeId: 'rt_activity',
    capabilities: [],
  },
  projectionRevision: 1,
  cursor: { runtimeId: 'rt_activity', seq: 1 },
  sessions: [],
  interactions: [],
  notifications: [],
  sessionActivity: [{ sessionId: session.sessionId, lastActivityAt: 300 }],
};

beforeEach(() => {
  const initial = createRuntimeProjectionState();
  useAppStore.setState({
    sessions: [],
    runtimeProfile: null,
    runtimeConnection: initial.connection,
    liveProjectionBySession: {},
    runtimeSnapshotRequiredBySession: {},
  });
});

test('list refreshes preserve activity after its Run leaves the bounded Runtime window', () => {
  const store = useAppStore.getState();
  store.setSessions([session]);
  store.replaceRuntimeProfileProjection(profile);
  store.appendUserMessage(session.sessionId, 'new interaction', 400);
  store.replaceRuntimeProfileProjection({
    ...profile,
    projectionRevision: 2,
    cursor: { runtimeId: 'rt_activity', seq: 2 },
    sessionActivity: [],
  });
  store.setSessions([{ ...session, title: 'updated title' }]);
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 400);
  store.replaceSessionsForScope([session], { projectRoot: '/repo', surface: 'code' });
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 400);
  store.upsertSession({ ...session, title: 'renamed' });
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 400);
  assert.equal(useAppStore.getState().sessions[0]?.title, 'renamed');
  store.setSessions([]);
  assert.deepEqual(useAppStore.getState().sessions, [], 'removed Sessions must not be resurrected');
});

test('activity arriving before the list only updates known Coder rows', () => {
  const store = useAppStore.getState();
  store.replaceRuntimeProfileProjection({
    ...profile,
    sessionActivity: [
      ...profile.sessionActivity!,
      { sessionId: 's_partner', lastActivityAt: 900 },
      { sessionId: 's_unknown', lastActivityAt: 999 },
    ],
  });
  assert.deepEqual(useAppStore.getState().sessions, []);
  store.setSessions([session, { ...session, sessionId: 's_partner', surface: 'partner' }]);
  assert.deepEqual(
    useAppStore.getState().sessions.map((s) => s.lastActivityAt),
    [300, 100],
  );
});

test('rejected profiles cannot advance sidebar activity and row scope changes do not inherit memory', () => {
  const store = useAppStore.getState();
  store.setSessions([session]);
  store.replaceRuntimeProfileProjection(profile);
  store.replaceRuntimeProfileProjection({
    ...profile,
    projectionRevision: 0,
    sessionActivity: [{ sessionId: session.sessionId, lastActivityAt: 999 }],
  });
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 300);
  useAppStore.setState({ runtimeProfile: null });
  store.setSessions([{ ...session, projectRoot: '/different' }]);
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 100);
  store.setSessions([{ ...session, lastActivityAt: 700 }]);
  store.setSessions([{ ...session, surface: 'partner' }]);
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 100);
});
