import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type {
  SessionHistoryItem,
  SpaceSessionLiveProjectionT,
} from '@kodax-space/space-ipc-schema';
import { composeMessages } from '../features/session/composeMessages.js';
import { useAppStore } from './appStore.js';

const sessionId = 'runtime-history-recovery';
const query: SessionHistoryItem = {
  kind: 'user',
  content: 'Continue the task',
  entryId: 'queued-entry',
  turnId: 'queued-turn',
  turnUserOrdinal: 0,
  canonicalIndex: 0,
  sentAt: 200,
};
const snapshot: SpaceSessionLiveProjectionT = {
  sessionId,
  projectionRevision: 1,
  cursor: { runtimeId: 'runtime', sessionId, journalEpoch: 'epoch', seq: 20 },
  transcriptRevision: 'revision',
  queuedRuns: [],
  activeTools: [],
  todos: [],
  interactions: [],
  activeRun: { runId: 'run', sessionId, turnId: 'queued-turn', phase: 'running', startedAt: 100 },
  queuedInputs: [
    {
      inputId: 'input',
      sessionId,
      delivery: 'interrupt',
      state: 'delivered',
      createdAt: 150,
      deliveredAt: 210,
      entryId: 'queued-entry',
      turnId: 'queued-turn',
      runId: 'run',
      contentPreview: 'Continue the task',
    },
  ],
};

beforeEach(() => {
  useAppStore.getState().resetSessionMessages(sessionId);
  useAppStore.setState({
    sessions: [
      {
        sessionId,
        projectRoot: '/repo',
        provider: 'mock',
        reasoningMode: 'auto',
        permissionMode: 'accept-edits',
        agentMode: 'ama',
        surface: 'code',
        createdAt: 100,
        lastActivityAt: 200,
      },
    ],
    liveProjectionBySession: {},
    runtimeSnapshotRequiredBySession: {},
    runtimeSnapshotCursorBySession: {},
  });
  useAppStore.getState().replaceRuntimeProfileProjection({
    connection: {
      state: 'ready',
      changedAt: 1,
      stale: false,
      runtimeId: 'runtime',
      profile: 'coder',
      capabilities: [],
    },
    projectionRevision: 1,
    cursor: { runtimeId: 'runtime', seq: 1 },
    sessions: [],
    interactions: [],
    notifications: [],
  });
});

function restore(items: readonly SessionHistoryItem[]): void {
  useAppStore.getState().prependSessionHistory(sessionId, items, 100, {
    replaceLoadedWindow: true,
    authoritativeNewest: true,
    conversationStatus: 'resolved',
    sourceRevision: 'revision',
  });
}

function messages() {
  const state = useAppStore.getState();
  return composeMessages({
    userMessages: state.userMessagesBySession[sessionId] ?? [],
    events: state.eventsBySession[sessionId] ?? [],
  });
}

test('refresh reuses the canonical delivered query even when the snapshot has no ordinal', () => {
  restore([query]);
  useAppStore.getState().replaceSessionLiveProjection(snapshot);
  assert.equal(messages().filter((message) => message.kind === 'user').length, 1);
  useAppStore.getState().replaceSessionLiveProjection(snapshot, { allowEqualHydration: true });
  assert.equal(messages().filter((message) => message.kind === 'user').length, 1);
});

function runningSnapshot() {
  const segment = (id: string, seq: number, text: string) => ({
    responseId: 'response',
    providerRequestId: id,
    mode: 'append' as const,
    startedAtSeq: seq,
    startedAt: 200 + seq,
    assistantText: text,
    thinkingText: '',
    assistantTextStartOffset: 0,
    thinkingTextStartOffset: 0,
  });
  return {
    ...snapshot,
    outputSegment: {
      retained: [segment('first', 2, 'Checking the file.')],
      active: segment('second', 6, 'The file is valid.'),
    },
    toolEvents: [
      {
        kind: 'tool_start' as const,
        runId: 'run',
        turnId: 'queued-turn',
        toolId: 'tool',
        toolName: 'read',
        input: { path: 'file' },
        seq: 4,
        sentAt: 204,
      },
      {
        kind: 'tool_result' as const,
        runId: 'run',
        turnId: 'queued-turn',
        toolId: 'tool',
        toolName: 'read',
        content: 'contents',
        seq: 5,
        sentAt: 205,
      },
    ],
  };
}

const answeredHistory: SessionHistoryItem[] = [
  query,
  {
    kind: 'assistant',
    text: 'Checking the file.',
    turnId: 'queued-turn',
    entryId: 'answer1',
    canonicalIndex: 1,
    sentAt: 202,
  },
  {
    kind: 'tool_call',
    toolId: 'tool',
    toolName: 'read',
    input: { path: 'file' },
    result: 'contents',
    canonicalIndex: 2,
  },
  {
    kind: 'assistant',
    text: 'The file is valid.',
    turnId: 'queued-turn',
    entryId: 'answer2',
    canonicalIndex: 3,
    sentAt: 206,
  },
];

test('cold recovery restores completed tools between output segments and survives equal hydration', () => {
  restore([query]);
  useAppStore.getState().replaceSessionLiveProjection(runningSnapshot());
  useAppStore
    .getState()
    .replaceSessionLiveProjection(runningSnapshot(), { allowEqualHydration: true });
  const rows = messages();
  assert.deepEqual(
    rows.map((row) => row.kind),
    ['user', 'assistant_text', 'tool_call', 'assistant_text'],
  );
  assert.deepEqual(
    rows.filter((row) => row.kind === 'assistant_text').map((row) => row.text),
    ['Checking the file.', 'The file is valid.'],
  );
  assert.deepEqual(
    rows.filter((row) => row.kind === 'assistant_text').map((row) => row.sentAt),
    [202, 206],
  );
});

test('canonical tools and recovered live output merge into a single answered turn', () => {
  restore(answeredHistory);
  useAppStore.getState().replaceSessionLiveProjection(runningSnapshot());
  assert.deepEqual(
    messages().map((row) => row.kind),
    ['user', 'assistant_text', 'tool_call', 'assistant_text'],
  );
});

test('delivered identity also converges when live recovery precedes the history page', () => {
  useAppStore.getState().replaceSessionLiveProjection(runningSnapshot());
  restore(answeredHistory);
  assert.equal(messages().filter((row) => row.kind === 'user').length, 1);
  assert.equal(messages().filter((row) => row.kind === 'tool_call').length, 1);
});

test('identical text in distinct canonical entries remains two user inputs', () => {
  restore([query, { ...query, entryId: 'other-entry', turnId: 'other-turn', canonicalIndex: 1 }]);
  useAppStore.getState().replaceSessionLiveProjection(snapshot);
  assert.equal(messages().filter((row) => row.kind === 'user').length, 2);
});

test('foreign run and turn tool receipts cannot enter the recovered transcript', () => {
  const live = runningSnapshot();
  live.toolEvents = live.toolEvents.map((event) => ({ ...event, turnId: 'other-turn' }));
  restore([query]);
  useAppStore.getState().replaceSessionLiveProjection(live);
  assert.equal(messages().filter((row) => row.kind === 'tool_call').length, 0);
});

test('reapplying an older snapshot preserves a later tool result', () => {
  restore([query]);
  const live = runningSnapshot();
  useAppStore.getState().replaceSessionLiveProjection(live);
  useAppStore.getState().appendEvent({
    kind: 'tool_result',
    sessionId,
    turnId: 'queued-turn',
    toolId: 'tool',
    toolName: 'read',
    content: 'new result',
    runtimeEvent: { runtimeId: 'runtime', runId: 'run', journalEpoch: 'epoch', seq: 21 },
  });
  useAppStore.getState().replaceSessionLiveProjection(live, { allowEqualHydration: true });
  const results = useAppStore
    .getState()
    .eventsBySession[sessionId]!.filter((event) => event.kind === 'tool_result');
  assert.equal(results.at(-1)?.content, 'new result');
  assert.equal(messages().filter((row) => row.kind === 'tool_call').length, 1);
});

test('same owner with conflicting recovered text is not discarded as a duplicate', () => {
  restore(answeredHistory);
  const live = runningSnapshot();
  live.outputSegment.active.assistantText = 'Different answer.';
  useAppStore.getState().replaceSessionLiveProjection(live);
  assert.ok(
    messages().some((row) => row.kind === 'assistant_text' && row.text === 'Different answer.'),
  );
  assert.ok(
    messages().some((row) => row.kind === 'assistant_text' && row.text === 'The file is valid.'),
  );
});

test('a post-snapshot answer suffix survives folding parallel and durable-only tools', () => {
  restore([
    ...answeredHistory,
    {
      kind: 'tool_call',
      toolId: 'todo',
      toolName: 'todo_update',
      input: {},
      result: 'done',
      canonicalIndex: 4,
    },
  ]);
  useAppStore.getState().replaceSessionLiveProjection(runningSnapshot());
  useAppStore.getState().appendEvent({
    kind: 'text_delta',
    sessionId,
    turnId: 'queued-turn',
    providerRequestId: 'second',
    text: ' Ready.',
    runtimeEvent: { runtimeId: 'runtime', runId: 'run', journalEpoch: 'epoch', seq: 21 },
  });
  assert.equal(messages().filter((row) => row.kind === 'user').length, 1);
  assert.equal(
    messages()
      .filter((row) => row.kind === 'assistant_text')
      .map((row) => row.text)
      .join(''),
    'Checking the file.The file is valid. Ready.',
  );
});

test('same entry merges parallel tool order and preserves tools found only in durable history', () => {
  const history: SessionHistoryItem[] = [
    query,
    { ...answeredHistory[1]!, thinking: 'First thought.' } as SessionHistoryItem,
    {
      kind: 'tool_call',
      toolId: 'parallel',
      toolName: 'read',
      input: { path: 'other' },
      result: 'other',
    },
    answeredHistory[2]!,
    { kind: 'tool_call', toolId: 'todo', toolName: 'todo_update', input: {}, result: 'done' },
    { ...answeredHistory[3]!, thinking: 'Second thought.' } as SessionHistoryItem,
  ];
  const live = runningSnapshot();
  live.outputSegment.retained[0]!.thinkingText = 'First thought.';
  live.outputSegment.active.thinkingText = 'Second thought.';
  live.toolEvents.push({
    kind: 'tool_start',
    runId: 'run',
    turnId: 'queued-turn',
    toolId: 'parallel',
    toolName: 'read',
    input: { path: 'other' },
    seq: 5,
    sentAt: 205,
  });
  restore(history.map((item, canonicalIndex) => ({ ...item, canonicalIndex })));
  useAppStore.getState().replaceSessionLiveProjection(live);
  useAppStore.getState().appendEvent({
    kind: 'session_complete',
    sessionId,
    turnId: 'queued-turn',
    runtimeEvent: { runtimeId: 'runtime', runId: 'run', journalEpoch: 'epoch', seq: 21 },
  });
  restore(history.map((item, canonicalIndex) => ({ ...item, canonicalIndex })));
  assert.equal(messages().filter((row) => row.kind === 'user').length, 1);
  assert.equal(messages().filter((row) => row.kind === 'assistant_text').length, 2);
  assert.equal(messages().filter((row) => row.kind === 'tool_call').length, 3);
});

test('a retained tail followed by new output merges without repeating the saved answer', () => {
  restore([
    ...answeredHistory,
    {
      kind: 'tool_call',
      toolId: 'todo',
      toolName: 'todo_update',
      input: {},
      result: 'done',
      canonicalIndex: 4,
    },
  ]);
  const live = runningSnapshot();
  live.outputSegment.retained = [];
  useAppStore.getState().replaceSessionLiveProjection(live);
  useAppStore.getState().appendEvent({
    kind: 'text_delta',
    sessionId,
    turnId: 'queued-turn',
    providerRequestId: 'second',
    text: ' Ready.',
    runtimeEvent: { runtimeId: 'runtime', runId: 'run', journalEpoch: 'epoch', seq: 21 },
  });
  assert.equal(messages().filter((row) => row.kind === 'user').length, 1);
  assert.equal(
    messages()
      .filter((row) => row.kind === 'assistant_text')
      .map((row) => row.text)
      .join(''),
    'Checking the file.The file is valid. Ready.',
  );
  live.outputSegment.active.assistantText += ' Ready.';
  useAppStore.getState().replaceSessionLiveProjection({
    ...live,
    projectionRevision: 2,
    cursor: { ...live.cursor, seq: 22 },
  });
  assert.equal(messages().filter((row) => row.kind === 'user').length, 1);
  assert.equal(
    messages()
      .filter((row) => row.kind === 'assistant_text')
      .map((row) => row.text)
      .join(''),
    'Checking the file.The file is valid. Ready.',
  );
  useAppStore.getState().appendEvent({
    kind: 'tool_start',
    sessionId,
    turnId: 'queued-turn',
    toolId: 'later-tool',
    toolName: 'read',
    input: { path: 'later' },
    runtimeEvent: { runtimeId: 'runtime', runId: 'run', journalEpoch: 'epoch', seq: 23 },
  });
  assert.equal(messages().filter((row) => row.kind === 'user').length, 1);
  assert.equal(messages().filter((row) => row.kind === 'tool_call').length, 3);
});

test('interrupted history tools stay interrupted after refresh without disabling a new turn', () => {
  const items: SessionHistoryItem[] = [
    query,
    {
      kind: 'tool_call',
      toolId: 'unfinished',
      toolName: 'read',
      turnId: 'queued-turn',
      interrupted: true,
    },
  ];
  restore(items);
  restore(items);
  const tools = messages().filter((message) => message.kind === 'tool_call');
  assert.equal(tools.length, 1);
  assert.equal(tools[0]?.status, 'interrupted');
  assert.equal(tools[0]?.result, undefined);
  const state = useAppStore.getState();
  assert.equal(state.liveProjectionBySession[sessionId]?.activeRun, undefined);
});
