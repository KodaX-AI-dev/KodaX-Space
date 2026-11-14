import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionMeta, SessionProductItem } from '@kodax-space/space-ipc-schema';
import { useAppStore } from './appStore.js';
import { projectProductConversation } from '../features/session/productConversation.js';

const session: SessionMeta = {
  sessionId: 's_send_echo',
  projectRoot: '/repo',
  provider: 'mock',
  surface: 'code',
  reasoningMode: 'auto',
  permissionMode: 'accept-edits',
  agentMode: 'ama',
  createdAt: 100,
  lastActivityAt: 100,
};
const earlier: SessionProductItem[] = [
  { id: 'old-user', type: 'user', inputId: 'old-op', text: 'earlier question' },
  { id: 'old-answer', type: 'assistant', text: 'earlier answer', timestamp: 2 },
];

function visibleUserTexts(items: readonly SessionProductItem[]): string[] {
  const state = useAppStore.getState();
  return projectProductConversation(
    items,
    state.userMessagesBySession[session.sessionId] ?? [],
    state.queuedUserMessagesBySession[session.sessionId] ?? [],
  ).messages.flatMap((message) => (message.kind === 'user' ? [message.content] : []));
}

test('an accepted send stays visible until the SDK product view carries its input', () => {
  const store = useAppStore.getState();
  store.setSessions([session]);
  const owner = store.reserveSendOperationMessage(session.sessionId, {
    content: 'follow-up',
    matchContent: 'follow-up',
    queueMode: 'after-turn',
    operationId: 'new-op',
    requestGeneration: 1,
    queued: false,
  });
  assert.equal(owner?.kind, 'user');
  assert.deepEqual(visibleUserTexts(earlier), ['earlier question', 'follow-up']);

  // session.send accepted: the composer settles the operation and binds the Run before the SDK
  // product view has recorded the input.
  store.bindUserMessageRuntimeRun(session.sessionId, owner.id, 'run-2');
  store.settleSendOperationMessage(session.sessionId, 'new-op');
  assert.deepEqual(visibleUserTexts(earlier), ['earlier question', 'follow-up']);

  const carried: SessionProductItem[] = [
    ...earlier,
    { id: 'new-user', type: 'user', inputId: 'new-op', text: 'follow-up' },
  ];
  store.observeProductInputs(session.sessionId, carried);
  assert.deepEqual(visibleUserTexts(carried), ['earlier question', 'follow-up']);

  // Once observed, the input never returns as a local bubble after it leaves the bounded window.
  assert.deepEqual(visibleUserTexts(earlier.slice(1)), []);
});
