import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionMeta, SessionProductItem } from '@kodax-space/space-ipc-schema';
import { useAppStore } from './appStore.js';
import { projectProductConversation } from '../features/session/productConversation.js';

const session: SessionMeta = {
  sessionId: 's_merged_after_turn',
  projectRoot: '/repo',
  provider: 'mock',
  surface: 'code',
  reasoningMode: 'auto',
  permissionMode: 'accept-edits',
  agentMode: 'ama',
  createdAt: 100,
  lastActivityAt: 100,
};

function visible(items: readonly SessionProductItem[]): string[] {
  const state = useAppStore.getState();
  return projectProductConversation(
    items,
    state.userMessagesBySession[session.sessionId] ?? [],
    state.queuedUserMessagesBySession[session.sessionId] ?? [],
  ).messages.flatMap((message) =>
    message.kind === 'user' || message.kind === 'queued_user'
      ? [`${message.kind}:${message.content}`]
      : [],
  );
}

function queueAfterTurn(operationId: string, content: string): void {
  const store = useAppStore.getState();
  const owner = store.reserveSendOperationMessage(session.sessionId, {
    content,
    matchContent: content,
    queueMode: 'after-turn',
    operationId,
    requestGeneration: 1,
    queued: true,
  });
  assert.equal(owner?.kind, 'queued');
  // session.send while streaming: Main returns queueId = the accepted SDK inputId (= operationId).
  store.markQueuedUserMessageAccepted(session.sessionId, owner.id, operationId, 'after-turn');
  store.settleSendOperationMessage(session.sessionId, operationId);
}

// The Host can drain queued after-turn inputs as one batch: one canonical user message whose
// inputId is the batch head and whose inputIds name every input it consumed.
test('after-turn inputs merged by the Host into one turn leave no stale queued bubble', () => {
  useAppStore.getState().setSessions([session]);
  const running: SessionProductItem[] = [
    { id: 'u1', type: 'user', inputId: 'op-1', text: 'first' },
    { id: 'a1', type: 'assistant', text: 'working', outputState: 'draft' },
  ];
  queueAfterTurn('op-a', 'second');
  queueAfterTurn('op-b', 'third');
  assert.deepEqual(visible(running), ['user:first', 'queued_user:second', 'queued_user:third']);

  const merged: SessionProductItem[] = [
    { ...running[0]! },
    { ...running[1]!, outputState: 'committed' },
    {
      id: 'u2',
      type: 'user',
      inputId: 'op-a',
      inputIds: ['op-a', 'op-b'],
      text: 'second\n\n---\n\nthird',
    },
    { id: 'a2', type: 'assistant', text: 'answer to both', outputState: 'draft' },
  ];
  useAppStore.getState().observeProductInputs(session.sessionId, merged);

  assert.deepEqual(visible(merged), ['user:first', 'user:second\n\n---\n\nthird']);
});
