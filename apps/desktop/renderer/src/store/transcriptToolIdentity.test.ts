import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionEvent, SessionHistoryItem } from '@kodax-space/space-ipc-schema';
import { useAppStore } from './appStore.js';

const sid = 'explicit-tool-identity';
const runId = 'explicit-run';
const runtimeId = 'explicit-runtime';
const toolId = 'exact-sdk-tool-call';

function explicitHistory(): SessionHistoryItem[] {
  return [
    { kind: 'user', content: '!write result', entryId: 'command-entry', canonicalIndex: 0 },
    {
      kind: 'tool_call',
      toolId,
      toolName: 'write',
      input: { path: 'result.txt' },
      result: 'written',
      entryId: 'tool-entry',
      canonicalIndex: 1,
    },
    {
      kind: 'user',
      content: 'successor',
      entryId: 'next-entry',
      canonicalIndex: 3,
      turnId: 'next-turn',
      turnUserOrdinal: 0,
    },
    { kind: 'assistant', text: 'successor completed', entryId: 'next-answer', canonicalIndex: 4 },
  ];
}

function seedExplicitRun(
  extraInput = false,
  resultOrigin: { runtimeId?: string; journalEpoch?: string } = {},
): SessionEvent[] {
  const store = useAppStore.getState();
  store.resetSessionMessages(sid);
  store.upsertSession({
    sessionId: sid,
    projectRoot: '/workspace',
    provider: 'mock',
    reasoningMode: 'auto',
    permissionMode: 'accept-edits',
    agentMode: 'ama',
    surface: 'code',
    createdAt: 100,
    lastActivityAt: 100,
  });
  const userId = store.appendUserMessage(sid, '!write result', 100);
  assert.ok(userId);
  store.bindUserMessageRuntimeRun(sid, userId, runId);
  const origin = (seq: number) => ({ runtimeId, runId, journalEpoch: 'epoch', seq });
  const events: SessionEvent[] = [
    {
      kind: 'tool_start',
      sessionId: sid,
      toolId,
      toolName: 'write',
      input: { path: 'result.txt' },
      runtimeEvent: origin(1),
    },
    {
      kind: 'tool_result',
      sessionId: sid,
      toolId,
      toolName: 'write',
      content: 'written',
      runtimeEvent: { ...origin(2), ...resultOrigin },
    },
    { kind: 'session_complete', sessionId: sid, runtimeEvent: origin(3) },
  ];
  for (const event of events) store.appendEvent(event);
  if (extraInput) {
    const sibling = store.appendUserMessage(sid, 'unmatched same-run input', 150);
    assert.ok(sibling);
    store.bindUserMessageRuntimeRun(sid, sibling, runId);
  }
  return events;
}

function hydrate(items = explicitHistory()): void {
  useAppStore.getState().prependSessionHistory(sid, items, 100, {
    replaceLoadedWindow: true,
    authoritativeNewest: true,
    conversationStatus: 'resolved',
    sourceRevision: 'published-revision',
  });
}

test('explicit tool without a model turn projects once at its exact canonical boundary before a successor', () => {
  const replay = seedExplicitRun();
  hydrate();
  for (const event of replay) useAppStore.getState().appendEvent(event);
  hydrate();
  const state = useAppStore.getState();
  assert.deepEqual(
    state.userMessagesBySession[sid]?.map((user) => user.content),
    ['!write result', 'successor'],
  );
  assert.equal(
    state.eventsBySession[sid]?.filter(
      (event) => event.kind === 'tool_start' && event.toolId === toolId,
    ).length,
    1,
  );
  assert.equal(
    state.eventsBySession[sid]?.filter(
      (event) => event.kind === 'tool_result' && event.toolId === toolId,
    ).length,
    1,
  );
});

test('tool identity never retires an unmatched sibling input in the same Run', () => {
  seedExplicitRun(true);
  hydrate();
  assert.ok(
    useAppStore
      .getState()
      .userMessagesBySession[sid]?.some((user) => user.content === 'unmatched same-run input'),
  );
  assert.equal(
    useAppStore
      .getState()
      .userMessagesBySession[sid]?.filter((user) => user.content === '!write result').length,
    2,
  );
});

test('another canonical tool call cannot claim the explicit live input', () => {
  seedExplicitRun();
  hydrate(
    explicitHistory().map((item) =>
      item.kind === 'tool_call' ? { ...item, toolId: 'foreign-tool-call' } : item,
    ),
  );
  assert.equal(
    useAppStore
      .getState()
      .userMessagesBySession[sid]?.filter((user) => user.content === '!write result').length,
    2,
  );
});

test('a tool identity shared by two canonical boundaries remains ambiguous', () => {
  seedExplicitRun();
  const history = explicitHistory();
  hydrate([
    ...history,
    ...history
      .slice(0, 2)
      .filter((item) => item.kind === 'user' || item.kind === 'tool_call')
      .map((item) => ({
        ...item,
        entryId: `${item.entryId}-other`,
        canonicalIndex: (item.canonicalIndex ?? 0) + 5,
      })),
  ]);
  assert.equal(
    useAppStore
      .getState()
      .userMessagesBySession[sid]?.filter((user) => user.content === '!write result').length,
    3,
  );
});

test('late unknown input and another tool remain visible after exact tool ownership is projected', () => {
  seedExplicitRun();
  hydrate();
  const store = useAppStore.getState();
  store.appendEvent({
    kind: 'mid_turn_user_prompt',
    sessionId: sid,
    content: 'late input',
    queueId: 'unseen-input',
    entryId: 'unseen-entry',
    runtimeEvent: { runtimeId, runId, journalEpoch: 'epoch', seq: 1 },
  });
  store.appendEvent({
    kind: 'tool_start',
    sessionId: sid,
    toolName: 'read',
    input: {},
    toolId: 'unseen-tool',
    runtimeEvent: { runtimeId, runId, journalEpoch: 'epoch', seq: 4 },
  });
  assert.ok(
    useAppStore
      .getState()
      .userMessagesBySession[sid]?.some((user) => user.content === 'late input'),
  );
  assert.ok(
    useAppStore
      .getState()
      .eventsBySession[
        sid
      ]?.some((event) => event.kind === 'tool_start' && event.toolId === 'unseen-tool'),
  );
});

test('a result whose tool start is missing prevents tool-only ownership inference', () => {
  seedExplicitRun();
  const state = useAppStore.getState();
  state.appendEvent({
    kind: 'tool_result',
    sessionId: sid,
    toolId: 'other-tool',
    toolName: 'read',
    content: 'uncovered result',
    runtimeEvent: { runtimeId, runId, journalEpoch: 'epoch', seq: 4 },
  });
  hydrate();
  assert.ok(
    useAppStore
      .getState()
      .eventsBySession[
        sid
      ]?.some((event) => event.kind === 'tool_result' && event.toolId === 'other-tool'),
  );
});

for (const resultOrigin of [{ runtimeId: 'foreign-runtime' }, { journalEpoch: 'foreign-epoch' }]) {
  test(`mixed Runtime provenance cannot claim a canonical input: ${JSON.stringify(resultOrigin)}`, () => {
    seedExplicitRun(false, resultOrigin);
    hydrate();
    assert.equal(
      useAppStore
        .getState()
        .userMessagesBySession[sid]?.filter((user) => user.content === '!write result').length,
      2,
    );
  });
}
