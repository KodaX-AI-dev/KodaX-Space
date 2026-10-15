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

test('profile-only message time repairs a legacy list and survives a later stale list', () => {
  const store = useAppStore.getState();
  const row = {
    ...session,
    sessionId: 's_profile_message_time',
    createdAt: 9000,
    lastActivityAt: 9000,
  };
  store.setSessions([row]);
  store.replaceRuntimeProfileProjection({
    ...profile,
    sessions: [
      {
        sessionId: row.sessionId,
        surface: 'code',
        createdAt: 9000,
        lastActivityAt: 9000,
        lastMessageAt: 100,
        queuedRuns: [],
      },
    ],
  });
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 100);
  assert.equal(useAppStore.getState().sessions[0]?.lastMessageAt, 100);
  useAppStore.setState({ runtimeProfile: null });
  store.setSessions([row]);
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 100);
});

test('first SDK message time preserves a new local input without preserving recovery time', () => {
  const store = useAppStore.getState();
  const row = { ...session, sessionId: 's_first_canonical_input', lastActivityAt: 9000 };
  store.setSessions([row]);
  store.appendUserMessage(row.sessionId, 'local input', 4000);
  store.setSessions([{ ...row, lastMessageAt: 100, lastActivityAt: 100 }]);
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 4000);
  store.setSessions([
    { ...row, projectRoot: '/different', lastMessageAt: 100, lastActivityAt: 100 },
  ]);
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 100);
});

test('a reserved immediate send keeps its own time through the first SDK list refresh', () => {
  const store = useAppStore.getState();
  const row = { ...session, sessionId: 's_reserved_canonical_input', lastActivityAt: 9000 };
  store.setSessions([row]);
  assert.ok(
    store.reserveSendOperationMessage(row.sessionId, {
      content: 'actual send',
      operationId: 'op_activity',
      requestGeneration: 1,
      queueMode: 'after-turn',
      queued: false,
      sentAt: 4000,
    }),
  );
  store.replaceSessionsForScope([{ ...row, lastMessageAt: 100, lastActivityAt: 100 }], {
    projectRoot: row.projectRoot,
    surface: 'code',
  });
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 4000);
});

test('SDK message time survives late Runtime metadata while actual sends retain activity', () => {
  const store = useAppStore.getState();
  const canonical = {
    ...session,
    sessionId: 's_canonical_activity',
    createdAt: 2000,
    lastMessageAt: 100,
    lastActivityAt: 100,
  };
  store.setSessions([canonical]);
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 100);
  store.replaceRuntimeProfileProjection({
    ...profile,
    sessionActivity: [{ sessionId: canonical.sessionId, lastActivityAt: 3000 }],
  });
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 100);
  store.appendUserMessage(canonical.sessionId, 'actual new input', 4000);
  store.replaceSessionsForScope([canonical], { projectRoot: '/repo', surface: 'code' });
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 4000);
  store.setSessions([{ ...canonical, lastMessageAt: 5000, lastActivityAt: 5000 }]);
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 5000);
  store.replaceRuntimeProfileProjection({
    ...profile,
    projectionRevision: 2,
    cursor: { runtimeId: 'rt_activity', seq: 2 },
    sessions: [
      {
        sessionId: canonical.sessionId,
        surface: 'code',
        createdAt: 9000,
        lastActivityAt: 9000,
        lastMessageAt: 6000,
        queuedRuns: [],
      },
    ],
  });
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, 6000);
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
