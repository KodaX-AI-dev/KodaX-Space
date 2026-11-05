import assert from 'node:assert/strict';
import test from 'node:test';
import { readHostWorkflowResult } from './workflow-result.js';

test('Workflow results use the exact Host task report and paginate the saved Session item', async () => {
  const reads: unknown[] = [];
  const service = {
    readHistory: async (_sessionId: string, options: { cursor?: string }) => {
      reads.push(options.cursor);
      return {
        items: options.cursor
          ? [
              {
                id: 'original-item',
                kind: 'assistant',
                text: 'preview',
                totalTextLength: 12,
                textRevision: 1,
                outputState: 'completed',
                taskResult: { source: 'workflow', taskId: 'workflow-run', runId: 'workflow-run' },
              },
            ]
          : [
              {
                id: 'other-task',
                text: 'Other result',
                taskResult: { source: 'workflow', taskId: 'other', runId: 'workflow-run' },
              },
            ],
        ...(options.cursor ? {} : { nextCursor: 'older' }),
      };
    },
    readHistoryEntry: async (_sessionId: string, id: string, options: { offset?: number }) => ({
      id,
      offset: options.offset ?? 0,
      text: options.offset ? 'answer' : 'Whole ',
      totalLength: 12,
      textRevision: 1,
      outputState: 'completed',
      ...(options.offset ? {} : { nextOffset: 6 }),
    }),
  };
  assert.equal(
    await readHostWorkflowResult(
      service as unknown as Parameters<typeof readHostWorkflowResult>[0],
      'session',
      'workflow-run',
    ),
    'Whole answer',
  );
  assert.deepEqual(reads, [undefined, 'older']);
});

test('a stalled Host read has a bounded wait without rerunning the Workflow', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const result = readHostWorkflowResult(
    { readHistory: () => new Promise(() => {}), readHistoryEntry: async () => null },
    'session',
    'run',
  );
  t.mock.timers.tick(10_001);
  await assert.rejects(result, /timed out/);
});

test('a missing or changed saved Workflow result never falls back to a preview or another task', async () => {
  const service = {
    readHistory: async () => ({
      items: [
        {
          id: 'item',
          text: 'Short preview',
          totalTextLength: 100,
          textRevision: 1,
          taskResult: { source: 'workflow', taskId: 'run' },
        },
      ],
    }),
    readHistoryEntry: async () => null,
  };
  assert.equal(
    await readHostWorkflowResult(
      service as unknown as Parameters<typeof readHostWorkflowResult>[0],
      'session',
      'unrelated',
    ),
    undefined,
  );
  await assert.rejects(
    readHostWorkflowResult(
      service as unknown as Parameters<typeof readHostWorkflowResult>[0],
      'session',
      'run',
    ),
    /changed|unavailable/,
  );
});
