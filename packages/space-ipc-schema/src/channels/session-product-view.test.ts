import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionProductViewSchema } from './session.js';

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
