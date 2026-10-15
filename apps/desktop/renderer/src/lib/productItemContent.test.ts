import assert from 'node:assert/strict';
import test from 'node:test';
import { readProductItemText } from './productItemContent.js';

test('SDK body chunks restore the complete text and reject a changed output version', async () => {
  const item = {
    id: 'output',
    type: 'assistant' as const,
    text: 'tail',
    textOffset: 4,
    totalTextLength: 8,
    outputState: 'committed' as const,
    textRevision: 0,
  };
  const read = async (offset: number) => ({
    id: item.id,
    text: offset === 0 ? 'head' : 'tail',
    offset,
    totalLength: 8,
    outputState: item.outputState,
    textRevision: 0,
    ...(offset === 0 ? { nextOffset: 4 } : {}),
  });
  assert.equal(await readProductItemText(item, read), 'headtail');
  await assert.rejects(
    readProductItemText(item, async (offset) => ({ ...(await read(offset)), textRevision: 1 })),
    /changed/,
  );
});

test('body reads cannot join a foreign item or a discontinuous chunk', async () => {
  const item = { id: 'output', type: 'assistant' as const, text: '', totalTextLength: 8 };
  await assert.rejects(
    readProductItemText(item, async () => ({
      id: 'foreign',
      text: 'abcdefgh',
      offset: 0,
      totalLength: 8,
    })),
    /changed/,
  );
  await assert.rejects(
    readProductItemText(item, async () => ({
      id: item.id,
      text: 'abcdefgh',
      offset: 1,
      totalLength: 8,
    })),
    /changed/,
  );
});

test('a stalled SDK body read expires within the read deadline', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const pending = readProductItemText(
    { id: 'body', type: 'assistant', text: '', totalTextLength: 8 },
    () => new Promise(() => {}),
  );
  const rejection = assert.rejects(pending, /timed out/);
  context.mock.timers.tick(15_001);
  await rejection;
});

test('history body references restore text and tool input without requiring view revision fields', async () => {
  const item = {
    id: 'history-ref',
    type: 'tool' as const,
    text: '',
    totalTextLength: 8,
    outputState: 'committed' as const,
    textRevision: 0,
    tool: {
      callId: 'call',
      name: 'write',
      status: 'success' as const,
      inputText: '{}',
      totalInputLength: 8,
    },
  };
  const read = async () => ({ id: item.id, text: 'abcdefgh', offset: 0, totalLength: 8 });
  assert.equal(await readProductItemText(item, read, 'text', 'history'), 'abcdefgh');
  assert.equal(await readProductItemText(item, read, 'input', 'history'), 'abcdefgh');
  await assert.rejects(
    readProductItemText(item, async () => ({ ...(await read()), text: 'abcd' }), 'text', 'history'),
    /ended before/,
  );
  await assert.rejects(
    readProductItemText(
      item,
      async () => ({ ...(await read()), text: 'abcd', nextOffset: 5 }),
      'text',
      'history',
    ),
    /changed/,
  );
});
