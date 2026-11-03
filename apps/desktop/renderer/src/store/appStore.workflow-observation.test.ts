import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { WorkflowRunT } from '@kodax-space/space-ipc-schema';
import { useAppStore } from './appStore.js';

const run = (status: WorkflowRunT['status']): WorkflowRunT => ({
  runId: 'acceptance-workflow',
  workflowName: 'Acceptance workflow',
  status,
  startedAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:01:00.000Z',
  items: [],
  counts: { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0, skipped: 0 },
  progress: {
    spawnedAgents: 0,
    finishedAgents: 0,
    activeAgents: 0,
    failedAgents: 0,
    stoppedAgents: 0,
  },
});

beforeEach(() => {
  useAppStore.setState({
    workflowRuns: {},
    workflowObservationStatus: 'ready',
    workflowListStale: false,
    workflowObservationRevision: 0,
    workflowLastSuccessfulReadRevision: 0,
    workflowDeletedRunIds: [],
    workflowRunRevisions: {},
  });
});

test('a stale workflow list remains visibly stale and cannot roll back a known Host result', () => {
  const store = useAppStore.getState();
  store.seedWorkflowRuns([run('completed')]);
  store.seedWorkflowRuns([run('running')], { stale: true });
  assert.equal(useAppStore.getState().workflowListStale, true);
  assert.equal(useAppStore.getState().workflowRuns['acceptance-workflow']?.status, 'completed');
});

test('a delayed workflow list cannot overwrite an event received after the read began', () => {
  const store = useAppStore.getState();
  store.seedWorkflowRuns([run('running')]);
  const expectedRevision = useAppStore.getState().workflowObservationRevision;
  store.upsertWorkflowRun({ type: 'workflow_finished', snapshot: run('completed') });
  store.seedWorkflowRuns([run('running')], { expectedRevision });
  assert.equal(useAppStore.getState().workflowRuns['acceptance-workflow']?.status, 'completed');
});

test('a concurrent event does not discard unrelated historical workflows from the list', () => {
  const store = useAppStore.getState();
  store.seedWorkflowRuns([run('running')]);
  const expectedRevision = useAppStore.getState().workflowObservationRevision;
  store.upsertWorkflowRun({ type: 'workflow_finished', snapshot: run('completed') });
  store.seedWorkflowRuns([run('running'), { ...run('completed'), runId: 'silent-history' }], {
    expectedRevision,
  });
  assert.equal(useAppStore.getState().workflowRuns['acceptance-workflow']?.status, 'completed');
  assert.equal(useAppStore.getState().workflowRuns['silent-history']?.status, 'completed');
});

test('a fresh list replaces fallback-only history while preserving a concurrent Host event', () => {
  const store = useAppStore.getState();
  store.seedWorkflowRuns([run('running')]);
  const expectedRevision = useAppStore.getState().workflowObservationRevision;
  store.upsertWorkflowRun({ type: 'workflow_finished', snapshot: run('completed') });
  store.seedWorkflowRuns([{ ...run('running'), runId: 'fallback-history' }], { stale: true });
  store.seedWorkflowRuns([run('running'), { ...run('completed'), runId: 'fallback-history' }], {
    expectedRevision,
  });
  assert.equal(useAppStore.getState().workflowRuns['acceptance-workflow']?.status, 'completed');
  assert.equal(useAppStore.getState().workflowRuns['fallback-history']?.status, 'completed');
});

test('a successful list read cannot claim that a failed observation subscription recovered', () => {
  const store = useAppStore.getState();
  store.seedWorkflowRuns([], { observationStatus: 'recovering' });
  store.seedWorkflowRuns([run('completed')]);
  assert.equal(useAppStore.getState().workflowObservationStatus, 'recovering');
});

test('an unrelated Host event cannot hide a subsequent failed list refresh', () => {
  const store = useAppStore.getState();
  store.seedWorkflowRuns([run('running')]);
  const expectedRevision = useAppStore.getState().workflowObservationRevision;
  store.upsertWorkflowRun({ type: 'workflow_finished', snapshot: run('completed') });
  store.seedWorkflowRuns([], { stale: true, expectedRevision });
  assert.equal(useAppStore.getState().workflowListStale, true);
});

test('an observation snapshot clears stale state without producing transcript notices', () => {
  const store = useAppStore.getState();
  store.seedWorkflowRuns([run('running')], { stale: true });
  const notices = useAppStore.getState().eventsBySession;
  store.seedWorkflowRuns([], { observationStatus: 'recovering' });
  assert.equal(useAppStore.getState().workflowListStale, true);
  const beforeSnapshot = useAppStore.getState().workflowObservationRevision;
  store.seedWorkflowRuns([run('completed')], { observationStatus: 'ready' });
  store.seedWorkflowRuns([run('running')], { stale: true, expectedRevision: beforeSnapshot });
  assert.equal(useAppStore.getState().workflowObservationStatus, 'ready');
  assert.equal(useAppStore.getState().workflowListStale, false);
  assert.equal(useAppStore.getState().workflowRuns['acceptance-workflow']?.status, 'completed');
  assert.equal(useAppStore.getState().eventsBySession, notices);
});

test('a delayed list cannot resurrect an explicitly deleted workflow', () => {
  const store = useAppStore.getState();
  store.seedWorkflowRuns([run('completed')]);
  const expectedRevision = useAppStore.getState().workflowObservationRevision;
  store.removeWorkflowRun('acceptance-workflow');
  store.seedWorkflowRuns([run('completed')], { expectedRevision });
  assert.equal(useAppStore.getState().workflowRuns['acceptance-workflow'], undefined);
  store.seedWorkflowRuns([run('completed')], { observationStatus: 'ready' });
  store.upsertWorkflowRun({ type: 'workflow_finished', snapshot: run('completed') });
  assert.equal(useAppStore.getState().workflowRuns['acceptance-workflow'], undefined);
});
