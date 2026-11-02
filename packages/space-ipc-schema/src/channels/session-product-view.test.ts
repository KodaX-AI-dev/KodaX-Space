import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionProductViewSchema } from './session.js';

test('task reports cross IPC without inventing missing identities or changing unknown status', () => {
  const view = {
    sessionId: 's',
    runtimeId: 'r',
    revision: 1,
    items: [
      {
        id: 'report',
        type: 'event',
        text: '**literal** &quot;',
        taskResult: {
          type: 'task_result',
          source: 'child_task',
          status: 'unknown',
          reportFormat: 'markdown',
        },
      },
    ],
  };
  assert.deepEqual(sessionProductViewSchema.parse(view), view);
});

test('the product display boundary preserves SDK item identity and Host order', () => {
  const view = {
    sessionId: 'session',
    runtimeId: 'runtime',
    revision: 1,
    items: [
      { id: 'accepted-input', type: 'user', text: 'same text', inputId: 'input-1' },
      {
        id: 'output-thinking',
        type: 'thinking',
        text: 'reasoning',
        outputId: 'output-1',
        outputState: 'committed',
        textRevision: 0,
      },
      {
        id: 'output-text',
        type: 'assistant',
        text: 'answer',
        outputId: 'output-1',
        outputState: 'committed',
        textRevision: 0,
      },
      { id: 'another-input', type: 'user', text: 'same text', inputId: 'input-2' },
    ],
  };
  assert.deepEqual(sessionProductViewSchema.parse(view), view);
});

test('one current view cannot contain the same SDK display item twice', () => {
  const item = { id: 'same-id', type: 'assistant', text: 'answer' };
  assert.equal(
    sessionProductViewSchema.safeParse({
      sessionId: 'session',
      runtimeId: 'runtime',
      revision: 1,
      items: [item, item],
    }).success,
    false,
  );
});

test('current view preserves actual reasoning even when there is no streaming progress', () => {
  const activity = {
    runId: 'run',
    reasoning: {
      provider: 'test',
      model: 'model',
      requestedEffort: 'high',
      verified: false,
      fallbacks: [{ reason: 'unsupported-parameter' }],
    },
  };
  assert.deepEqual(
    sessionProductViewSchema.parse({
      sessionId: 'session',
      runtimeId: 'host',
      revision: 1,
      activity,
      items: [],
    }).activity,
    activity,
  );
});
