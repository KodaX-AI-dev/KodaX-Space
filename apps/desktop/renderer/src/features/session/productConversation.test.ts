import assert from 'node:assert/strict';
import test from 'node:test';
import { projectProductConversation } from './productConversation.js';

test('the accepted SDK input replaces its optimistic bubble despite different attachment text', () => {
  const projected = projectProductConversation(
    [
      { id: 'sdk-user', type: 'user', inputId: 'input', text: 'prompt\nattachment paths' },
      {
        id: 'sdk-answer',
        type: 'assistant',
        outputId: 'output',
        outputState: 'committed',
        text: 'answer',
      },
    ],
    [{ id: 'optimistic', operationId: 'input', content: 'prompt', sentAt: 1 }],
  );
  assert.deepEqual(
    projected.messages.map((message) => message.id),
    ['sdk-user', 'sdk-answer'],
  );
});

test('SDK block and tool execution identities remain distinct without a reconstructed turn', () => {
  const projected = projectProductConversation([
    { id: 'thinking', type: 'thinking', text: 'why', outputId: 'output' },
    { id: 'text', type: 'assistant', text: 'answer', outputId: 'output' },
    {
      id: 'execution-1',
      type: 'tool',
      text: 'first',
      tool: { callId: 'same-call', name: 'read', status: 'success' },
    },
    {
      id: 'execution-2',
      type: 'tool',
      text: 'second',
      tool: { callId: 'same-call', name: 'read', status: 'success' },
    },
  ]);
  assert.deepEqual(
    projected.messages.map((message) => message.id),
    ['thinking', 'text', 'execution-1', 'execution-2'],
  );
});

test('actions retain the SDK history boundary of the selected final output without merging text planes', () => {
  const projected = projectProductConversation(
    [
      { id: 'view-user', type: 'user', inputId: 'input', text: 'prompt' },
      { id: 'view-answer', type: 'assistant', outputId: 'output', text: 'answer' },
    ],
    [],
    [],
    [
      {
        id: 'history-user',
        type: 'user',
        inputId: 'input',
        text: 'prompt',
        historyBoundary: { entryId: 'user-entry', sourceRevision: 'source' },
      },
      {
        id: 'history-answer',
        type: 'assistant',
        outputId: 'output',
        text: 'answer',
        historyBoundary: { entryId: 'answer-entry', sourceRevision: 'source' },
      },
    ],
  );
  assert.deepEqual(projected.userMessages[0]?.historyBoundary, {
    boundaryId: 'answer-entry',
    sourceRevision: 'source',
  });
  assert.deepEqual(
    projected.messages.map((message) => message.id),
    ['view-user', 'view-answer'],
  );
});

test('an accepted input outside the bounded SDK window cannot reappear as an optimistic bubble', () => {
  const projected = projectProductConversation(
    [{ id: 'new', type: 'user', inputId: 'new-input', text: 'new' }],
    [
      {
        id: 'old-local',
        operationId: 'old-input',
        content: 'old',
        sentAt: 1,
        sendAdmissionSettled: true,
      },
    ],
  );
  assert.deepEqual(
    projected.messages.map((message) => message.id),
    ['new'],
  );
});

test('Host tool images remain attached to their exact displayed execution', () => {
  const attachments = [
    {
      id: 'image',
      kind: 'image' as const,
      status: 'available' as const,
      mediaType: 'image/png' as const,
      previewUrl:
        'app://space/session-attachment/abcdefghijklmnopqrstuvwxyz012345?variant=original',
      thumbnailUrl:
        'app://space/session-attachment/abcdefghijklmnopqrstuvwxyz012345?variant=thumbnail',
    },
  ];
  const projected = projectProductConversation([
    {
      id: 'tool',
      type: 'tool',
      text: 'result',
      tool: { callId: 'call', name: 'read', status: 'success' },
      imageAttachments: attachments,
    },
  ]);
  assert.equal(projected.messages[0]?.kind, 'tool_call');
  assert.deepEqual(
    projected.messages[0]?.kind === 'tool_call' && projected.messages[0].attachments,
    attachments,
  );
});

test('Space command and workflow notices remain visible without changing SDK output order', () => {
  const projected = projectProductConversation(
    [
      { id: 'user-1', type: 'user', text: 'first', timestamp: 1 },
      { id: 'answer-1', type: 'assistant', text: 'answer', timestamp: 2 },
      { id: 'user-2', type: 'user', text: 'second', timestamp: 5 },
    ],
    [],
    [],
    [],
    {
      local: [{ id: 'command', content: '/status', sentAt: 3, variant: 'echo' }],
      workflow: [{ id: 'workflow', content: 'Workflow paused', sentAt: 4 }],
    },
  );
  assert.deepEqual(
    projected.messages.map((message) => message.id),
    ['user-1', 'answer-1', 'command', 'workflow', 'user-2'],
  );
});
