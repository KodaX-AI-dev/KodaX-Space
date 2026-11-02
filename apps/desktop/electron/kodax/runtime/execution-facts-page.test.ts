import assert from 'node:assert/strict';
import test from 'node:test';
import { readExecutionFactsPage } from './execution-facts-page.js';
test('a retired statistics cursor restarts the read and explicitly replaces the old page', async () => {
  const cursors: (string | undefined)[] = [];
  const page = await readExecutionFactsPage(
    async (options) => {
      cursors.push(options.cursor);
      if (options.cursor)
        throw Object.assign(new Error('projection replaced'), { code: 'conflict' });
      return { revision: 2, items: [{ id: 'new', revision: 2 }] };
    },
    { cursor: 'retired', limit: 20 },
  );
  assert.deepEqual(cursors, ['retired', undefined]);
  assert.equal(page.reset, true);
  assert.deepEqual(page.items, [{ id: 'new', revision: 2 }]);
  await assert.rejects(
    readExecutionFactsPage(
      async () => {
        throw new Error('unreadable');
      },
      { cursor: 'retired' },
    ),
    /unreadable/,
  );
});
