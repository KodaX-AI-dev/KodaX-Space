import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionMeta, SessionProductItem } from '@kodax-space/space-ipc-schema';
import { useAppStore } from './appStore.js';
import { projectProductConversation } from '../features/session/productConversation.js';

// BottomBar.handleSend treats every non-timeout `ok:false` from session.send as an 'ambiguous'
// failure: it calls rollbackSendOperationMessage(..., 'ambiguous') and, because the result is
// 'retained' (not 'settled'/'stale'), ALSO restores the draft into the composer and shows the
// error. These tests drive that same store sequence and read the transcript the user sees.

function sessionFor(sessionId: string): SessionMeta {
  return {
    sessionId,
    projectRoot: '/repo',
    provider: 'mock',
    surface: 'code',
    reasoningMode: 'auto',
    permissionMode: 'accept-edits',
    agentMode: 'ama',
    createdAt: 100,
    lastActivityAt: 100,
  };
}

const earlier: SessionProductItem[] = [
  { id: 'old-user', type: 'user', inputId: 'old-op', text: 'earlier question' },
  { id: 'old-answer', type: 'assistant', text: 'earlier answer', timestamp: 2 },
];

function visibleUserTexts(sessionId: string, items: readonly SessionProductItem[]): string[] {
  const state = useAppStore.getState();
  return projectProductConversation(
    items,
    state.userMessagesBySession[sessionId] ?? [],
    state.queuedUserMessagesBySession[sessionId] ?? [],
  ).messages.flatMap((message) => (message.kind === 'user' ? [message.content] : []));
}

function reserve(sessionId: string, text: string, operationId: string, generation: number) {
  return useAppStore.getState().reserveSendOperationMessage(sessionId, {
    content: text,
    matchContent: text,
    queueMode: 'after-turn',
    operationId,
    requestGeneration: generation,
    queued: false,
  });
}

/** session.send returned ok:false (HANDLER_ERROR etc.); BottomBar restores the draft. */
function failAmbiguously(sessionId: string, operationId: string, generation: number): string {
  return useAppStore
    .getState()
    .rollbackSendOperationMessage(sessionId, operationId, generation, 'ambiguous');
}

function acceptAndObserve(
  sessionId: string,
  ownerId: string,
  operationId: string,
  items: readonly SessionProductItem[],
): void {
  const store = useAppStore.getState();
  store.bindUserMessageRuntimeRun(sessionId, ownerId, `run-${operationId}`);
  store.settleSendOperationMessage(sessionId, operationId);
  store.observeProductInputs(sessionId, items);
}

test('a failed send whose draft returns to the composer is not also shown as a sent turn', () => {
  const sid = 's_ambiguous_dup';
  useAppStore.getState().setSessions([sessionFor(sid)]);
  reserve(sid, 'follow-up', 'op-a', 1);

  assert.equal(failAmbiguously(sid, 'op-a', 1), 'retained');
  // The composer now holds 'follow-up' again with an error; the transcript must not claim it was
  // sent as well (or must at least be distinguishable). Today it renders as a normal user turn.
  assert.deepEqual(visibleUserTexts(sid, earlier), ['earlier question']);
});

test('a never-admitted ambiguous send does not linger after later snapshots and history reloads', () => {
  const sid = 's_ambiguous_forever';
  useAppStore.getState().setSessions([sessionFor(sid)]);
  reserve(sid, 'follow-up', 'op-b', 1);
  failAmbiguously(sid, 'op-b', 1);

  // The Runtime never admitted op-b: every later authoritative product view lacks it.
  const later: SessionProductItem[] = [
    ...earlier,
    { id: 'late-answer', type: 'assistant', text: 'unrelated output', timestamp: 3 },
  ];
  useAppStore.getState().observeProductInputs(sid, later);
  useAppStore.getState().evictRestoredSessionHistory(sid);

  assert.deepEqual(visibleUserTexts(sid, later), ['earlier question']);
});

test('sending a different draft after an ambiguous failure leaves no ghost below the new turn', () => {
  const sid = 's_ambiguous_other_draft';
  useAppStore.getState().setSessions([sessionFor(sid)]);
  reserve(sid, 'first try', 'op-c1', 1);
  failAmbiguously(sid, 'op-c1', 1);

  // The user edits the restored draft and sends something else, which is accepted and observed.
  const second = reserve(sid, 'second', 'op-c2', 2);
  assert.equal(second?.kind, 'user');
  const carried: SessionProductItem[] = [
    ...earlier,
    { id: 'second-user', type: 'user', inputId: 'op-c2', text: 'second' },
    { id: 'second-answer', type: 'assistant', text: 'answer two', timestamp: 4 },
  ];
  acceptAndObserve(sid, second.id, 'op-c2', carried);

  // Today 'first try' is appended after every product item, i.e. below the newer answered turn.
  assert.deepEqual(visibleUserTexts(sid, carried), ['earlier question', 'second']);
});

test('guard: an exact retry reuses one operation and never duplicates the bubble', () => {
  const sid = 's_ambiguous_exact_retry';
  useAppStore.getState().setSessions([sessionFor(sid)]);
  reserve(sid, 'follow-up', 'op-d', 1);
  failAmbiguously(sid, 'op-d', 1);

  // BottomBar retained op-d for this exact payload, so the retry reserves the same operationId.
  const retry = reserve(sid, 'follow-up', 'op-d', 2);
  assert.equal(retry?.kind, 'user');
  assert.deepEqual(visibleUserTexts(sid, earlier), ['earlier question', 'follow-up']);

  const carried: SessionProductItem[] = [
    ...earlier,
    { id: 'retry-user', type: 'user', inputId: 'op-d', text: 'follow-up' },
  ];
  acceptAndObserve(sid, retry.id, 'op-d', carried);
  assert.deepEqual(visibleUserTexts(sid, carried), ['earlier question', 'follow-up']);
});

test('guard: an ambiguous failure that the Runtime did admit shows exactly one turn', () => {
  const sid = 's_ambiguous_admitted';
  useAppStore.getState().setSessions([sessionFor(sid)]);
  reserve(sid, 'follow-up', 'op-e', 1);
  failAmbiguously(sid, 'op-e', 1);

  const carried: SessionProductItem[] = [
    ...earlier,
    { id: 'admitted-user', type: 'user', inputId: 'op-e', text: 'follow-up' },
  ];
  useAppStore.getState().observeProductInputs(sid, carried);
  assert.deepEqual(visibleUserTexts(sid, carried), ['earlier question', 'follow-up']);
});

test('guard: an ambiguous failure shows again once the Runtime starts its run', () => {
  const sid = 's_ambiguous_run_started';
  useAppStore.getState().setSessions([sessionFor(sid)]);
  const owner = reserve(sid, 'follow-up', 'op-f', 1);
  failAmbiguously(sid, 'op-f', 1);
  assert.equal(owner?.kind, 'user');
  useAppStore.getState().bindUserMessageRuntimeRun(sid, owner.id, 'run-op-f');
  assert.deepEqual(visibleUserTexts(sid, earlier), ['earlier question', 'follow-up']);
});
