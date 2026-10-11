import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import type {
  SpaceSessionStatisticsT,
  SpaceSessionLiveProjectionT,
} from '@kodax-space/space-ipc-schema';
import { useAppStore } from './appStore.js';
import { hydrateSessionEventsFromLiveSnapshot } from './runtimeSnapshotHydration.js';
import { composeMessages } from '../features/session/composeMessages.js';

const summary: SpaceSessionStatisticsT = {
  runtimeId: 'host',
  sessionId: 's',
  revision: 1,
  coverage: 'partial',
  issues: ['usage unavailable'],
  contexts: [],
  requestCount: 2,
  requestsWithoutUsage: 1,
  physicalRequestCount: 3,
  operationCount: 1,
  usage: {
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    cacheReadTokens: 30,
    cacheWriteTokens: 10,
    thoughtTokens: 0,
  },
};
beforeEach(() =>
  useAppStore.setState({
    sessionTokenUsageBySession: {},
    runtimeConnection: {
      state: 'ready',
      runtimeId: 'host',
      stale: false,
      changedAt: 1,
      capabilities: [],
    },
  }),
);

test('Host totals replace prior totals without double counting and reject stale or foreign pushes', () => {
  const store = useAppStore.getState();
  store.replaceSessionStatistics(summary);
  store.replaceSessionStatistics(summary);
  store.replaceSessionStatistics({
    ...summary,
    revision: 0,
    usage: { ...summary.usage, inputTokens: 999 },
  });
  store.replaceSessionStatistics({ ...summary, runtimeId: 'foreign', revision: 9 });
  assert.equal(useAppStore.getState().sessionTokenUsageBySession.s?.inputTokens, 100);
  assert.equal(
    useAppStore.getState().sessionTokenUsageBySession.s?.statistics?.coverage,
    'partial',
  );
  useAppStore.setState({
    runtimeConnection: { state: 'reconnecting', stale: true, changedAt: 2, capabilities: [] },
  });
  store.replaceSessionStatistics({ ...summary, revision: 9 });
  assert.equal(useAppStore.getState().sessionTokenUsageBySession.s?.statistics?.revision, 1);
});

test('recovered tools with repeated call IDs retain separate inputs and receipts', () => {
  const toolEvents: NonNullable<SpaceSessionLiveProjectionT['toolEvents']> = [
    'execution-a',
    'execution-b',
  ].flatMap((sourceItemId, index) => [
    {
      kind: 'tool_start' as const,
      sourceItemId,
      toolId: 'reused',
      toolName: 'read',
      runId: 'r',
      turnId: 't',
      seq: 5,
      sentAt: index + 1,
      input: { path: sourceItemId },
    },
    {
      kind: 'tool_result' as const,
      sourceItemId,
      toolId: 'reused',
      toolName: 'read',
      runId: 'r',
      turnId: 't',
      seq: 5,
      sentAt: index + 1,
      content: sourceItemId,
    },
  ]);
  const projection: SpaceSessionLiveProjectionT = {
    sessionId: 's',
    projectionRevision: 1,
    transcriptRevision: 'revision',
    cursor: { runtimeId: 'host', sessionId: 's', seq: 5 },
    activeRun: { runId: 'r', sessionId: 's', turnId: 't', phase: 'running' },
    queuedRuns: [],
    queuedInputs: [],
    todos: [],
    activeTools: [],
    interactions: [],
    toolEvents,
  };
  const events = hydrateSessionEventsFromLiveSnapshot([], projection);
  const repeated = hydrateSessionEventsFromLiveSnapshot(events, projection);
  const cards = composeMessages({ events: repeated, userMessages: [] }).filter(
    (card) => card.kind === 'tool_call',
  );
  assert.equal(cards.length, 2);
  assert.deepEqual(
    cards.map((card) => (card.kind === 'tool_call' ? [card.input, card.result] : undefined)),
    [
      [{ path: 'execution-a' }, 'execution-a'],
      [{ path: 'execution-b' }, 'execution-b'],
    ],
  );
});

test('a live receipt joins the unique unfinished recovered execution in its Run', () => {
  const origin = { runtimeId: 'host', runId: 'r', seq: 5 };
  const cards = composeMessages({
    userMessages: [],
    events: [
      {
        kind: 'tool_start',
        sessionId: 's',
        sourceItemId: 'opaque',
        toolId: 'call',
        toolName: 'read',
        input: { path: 'A' },
        turnId: 't',
        runtimeEvent: origin,
      },
      {
        kind: 'tool_result',
        sessionId: 's',
        toolId: 'call',
        toolName: 'read',
        content: 'receipt',
        turnId: 't',
        runtimeEvent: { ...origin, seq: 6 },
      },
    ],
  }).filter((card) => card.kind === 'tool_call');
  assert.equal(cards[0]?.status, 'done');
  assert.equal(cards[0]?.result, 'receipt');
});

test('an unscoped live receipt cannot choose between recovered and live repeated calls', () => {
  const origin = { runtimeId: 'host', runId: 'r', seq: 5 };
  for (const resultRunId of ['r', 'foreign']) {
    const cards = composeMessages({
      userMessages: [],
      events: [
        {
          kind: 'tool_start',
          sessionId: 's',
          sourceItemId: 'opaque',
          toolId: 'call',
          toolName: 'read',
          input: { path: 'A' },
          turnId: 't',
          runtimeEvent: origin,
        },
        {
          kind: 'tool_start',
          sessionId: 's',
          toolId: 'call',
          toolName: 'read',
          input: { path: 'B' },
          turnId: 't',
          runtimeEvent: { ...origin, seq: 6 },
        },
        {
          kind: 'tool_result',
          sessionId: 's',
          toolId: 'call',
          toolName: 'read',
          content: 'ambiguous',
          turnId: 't',
          runtimeEvent: { ...origin, runId: resultRunId, seq: 7 },
        },
      ],
    }).filter((card) => card.kind === 'tool_call');
    assert.deepEqual(
      cards.map((card) => [card.input, card.status, card.result]),
      [
        [{ path: 'A' }, 'running', undefined],
        [{ path: 'B' }, 'running', undefined],
      ],
    );
  }
});
