import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeStatusSnapshot } from '@kodax-ai/kodax/runtime';
import type { SessionMeta } from '@kodax-space/space-ipc-schema';
import { projectRuntimeProfile } from './coder-daemon-projection.js';
import { useAppStore } from '../../../renderer/src/store/appStore.js';
import { runtimeSessionNeedsObservation } from '../../../renderer/src/store/runtimeProjectionState.js';

const createdAt = Date.parse('2026-07-28T07:44:04.795Z');
const endedAt = Date.parse('2026-09-28T10:31:08.200Z');
const historical: SessionMeta = {
  sessionId: 's_old',
  projectRoot: '/repo',
  provider: 'mock',
  surface: 'code',
  reasoningMode: 'auto',
  permissionMode: 'accept-edits',
  agentMode: 'ama',
  createdAt,
  lastActivityAt: createdAt,
};

test('completed out-of-page activity repairs sidebar recency without activating or loading the Session', () => {
  const status: RuntimeStatusSnapshot = {
    runtimeId: 'rt_activity',
    mode: 'daemon',
    profile: 'coder',
    startedAt: '2026-09-28T00:00:00.000Z',
    sessions: Array.from({ length: 50 }, (_, i) => ({
      id: `s_recent_${i}`,
      title: 'Recent',
      msgCount: 0,
      createdAt: '2026-09-27T00:00:00.000Z',
    })),
    runs: [
      {
        runId: 'run_old',
        sessionId: historical.sessionId,
        phase: 'completed',
        provider: 'mock',
        startedAt: '2026-09-28T08:47:22.716Z',
        endedAt: '2026-09-28T10:31:08.200Z',
      },
    ],
    pendingPermissions: [],
    workflows: [],
  };
  const profile = projectRuntimeProfile({
    status,
    userInputs: [],
    cursor: 1,
    projectionRevision: 1,
    changedAt: 1,
    capabilities: [],
  });
  assert.equal(profile.sessions.length, 50);
  assert.equal(
    profile.sessions.some((s) => s.sessionId === historical.sessionId),
    false,
  );
  useAppStore.setState({ sessions: [historical], runtimeProfile: null });
  useAppStore.getState().replaceRuntimeProfileProjection(profile);
  assert.equal(useAppStore.getState().sessions[0]?.lastActivityAt, endedAt);
  assert.equal(
    runtimeSessionNeedsObservation(
      {
        profile,
        liveBySession: {},
        snapshotRequiredBySession: {},
      },
      historical.sessionId,
    ),
    false,
  );
});

test('activity uses the latest valid Run boundary including failure and cancellation, excluding known Partner', () => {
  const runs: RuntimeStatusSnapshot['runs'] = [
    {
      runId: 'run_1',
      sessionId: 's_old',
      phase: 'completed',
      provider: 'mock',
      startedAt: new Date(100).toISOString(),
      endedAt: new Date(300).toISOString(),
    },
    {
      runId: 'run_2',
      sessionId: 's_old',
      phase: 'failed',
      provider: 'mock',
      startedAt: new Date(400).toISOString(),
      endedAt: new Date(500).toISOString(),
    },
    {
      runId: 'run_3',
      sessionId: 's_old',
      phase: 'cancelled',
      provider: 'mock',
      startedAt: new Date(600).toISOString(),
      endedAt: new Date(700).toISOString(),
    },
    {
      runId: 'run_invalid',
      sessionId: 's_old',
      phase: 'completed',
      provider: 'mock',
      startedAt: 'invalid',
      endedAt: 'invalid',
    },
    {
      runId: 'run_partner',
      sessionId: 's_partner',
      phase: 'completed',
      provider: 'mock',
      startedAt: new Date(900).toISOString(),
    },
  ];
  const projection = projectRuntimeProfile({
    status: {
      runtimeId: 'rt_activity',
      mode: 'daemon',
      profile: 'coder',
      startedAt: new Date(0).toISOString(),
      sessions: [{ id: 's_partner', title: 'Partner', tag: 'partner', msgCount: 0 }],
      runs,
      pendingPermissions: [],
      workflows: [],
    },
    userInputs: [],
    cursor: 1,
    projectionRevision: 1,
    changedAt: 1,
    capabilities: [],
  });
  assert.deepEqual(projection.sessionActivity, [{ sessionId: 's_old', lastActivityAt: 700 }]);
  assert.deepEqual(projection.sessions, []);
});

test('activity transport stays bounded and keeps the most recent timestamps', () => {
  const projection = projectRuntimeProfile({
    status: {
      runtimeId: 'rt_activity',
      mode: 'daemon',
      profile: 'coder',
      startedAt: new Date(0).toISOString(),
      sessions: [],
      pendingPermissions: [],
      workflows: [],
      runs: Array.from({ length: 1_001 }, (_, i) => ({
        runId: `run_${i}`,
        sessionId: `s_${i}`,
        phase: 'completed' as const,
        provider: 'mock',
        startedAt: new Date(i + 1).toISOString(),
      })),
    },
    userInputs: [],
    cursor: 1,
    projectionRevision: 1,
    changedAt: 1,
    capabilities: [],
  });
  assert.equal(projection.sessionActivity?.length, 1_000);
  assert.deepEqual(projection.sessionActivity?.[0], { sessionId: 's_1000', lastActivityAt: 1001 });
  assert.equal(
    projection.sessionActivity?.some((activity) => activity.sessionId === 's_0'),
    false,
  );
  assert.deepEqual(projection.sessions, []);
});
