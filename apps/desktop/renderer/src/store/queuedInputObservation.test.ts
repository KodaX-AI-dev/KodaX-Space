import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionMeta, SessionProductItem } from '@kodax-space/space-ipc-schema';
import { useAppStore } from './appStore.js';
import { projectProductConversation } from '../features/session/productConversation.js';

const base: SessionMeta = {
  sessionId: 's_queued_observation',
  projectRoot: '/repo',
  provider: 'mock',
  surface: 'code',
  reasoningMode: 'auto',
  permissionMode: 'accept-edits',
  agentMode: 'ama',
  createdAt: 100,
  lastActivityAt: 100,
};
const resurrection: SessionMeta = { ...base, sessionId: 's_queued_resurrection' };
const promotion: SessionMeta = { ...base, sessionId: 's_queued_promotion' };

function visible(session: SessionMeta, items: readonly SessionProductItem[]): string[] {
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

function reserveQueued(session: SessionMeta, operationId: string, content: string): string {
  const owner = useAppStore.getState().reserveSendOperationMessage(session.sessionId, {
    content,
    matchContent: content,
    queueMode: 'after-turn',
    operationId,
    requestGeneration: 1,
    queued: true,
  });
  assert.equal(owner?.kind, 'queued');
  return owner.id;
}

const later: SessionProductItem[] = [
  { id: 'later-user', type: 'user', inputId: 'op-later', text: 'much later' },
  { id: 'later-answer', type: 'assistant', text: 'later answer' },
];

test('an observed queued input never resurrects after it leaves the bounded product window', () => {
  const session = resurrection;
  const store = useAppStore.getState();
  store.setSessions([resurrection, promotion]);
  const localId = reserveQueued(session, 'op-q', 'queued follow-up');
  store.markQueuedUserMessageAccepted(session.sessionId, localId, 'op-q', 'after-turn');
  store.settleSendOperationMessage(session.sessionId, 'op-q');

  const carried: SessionProductItem[] = [
    { id: 'q-user', type: 'user', inputId: 'op-q', text: 'queued follow-up' },
    { id: 'q-answer', type: 'assistant', text: 'answer' },
  ];
  store.observeProductInputs(session.sessionId, carried);
  assert.deepEqual(visible(session, carried), ['user:queued follow-up']);

  // ~150 items later the SDK window no longer contains the input.
  store.observeProductInputs(session.sessionId, later);
  assert.deepEqual(visible(session, later), ['user:much later']);
});

test('a queued owner promoted after its input was observed keeps the observed state', () => {
  const session = promotion;
  const store = useAppStore.getState();
  store.setSessions([resurrection, promotion]);
  // Sent while streaming, but the run ended first: the product view carries the input
  // (productChanged) before the session.send result promotes the queued owner.
  const localId = reserveQueued(session, 'op-p', 'promoted');
  const carried: SessionProductItem[] = [
    { id: 'p-user', type: 'user', inputId: 'op-p', text: 'promoted' },
  ];
  store.observeProductInputs(session.sessionId, carried);
  store.promoteQueuedUserMessage(session.sessionId, localId);
  store.settleSendOperationMessage(session.sessionId, 'op-p');
  assert.deepEqual(visible(session, carried), ['user:promoted']);

  // Next product change no longer carries it (window moved / view replaced).
  store.observeProductInputs(session.sessionId, later);
  assert.deepEqual(visible(session, later), ['user:much later']);
});
