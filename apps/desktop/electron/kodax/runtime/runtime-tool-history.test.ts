import assert from 'node:assert/strict';
import test from 'node:test';
import type { SpaceSessionLiveProjectionT } from '@kodax-space/space-ipc-schema';
import { recoverRuntimeToolHistory } from './runtime-tool-history.js';
import { interruptedViewItems, viewReader } from './runtime-view-test-fixture.js';

const snapshot: SpaceSessionLiveProjectionT = {
  sessionId: 's',
  projectionRevision: 1,
  transcriptRevision: 'revision',
  cursor: { runtimeId: 'runtime', sessionId: 's', seq: 8 },
  activeRun: { runId: 'r', sessionId: 's', turnId: 't', phase: 'running', startedAt: 1 },
  queuedRuns: [],
  activeTools: [],
  todos: [],
  interactions: [],
  queuedInputs: [],
};

test('current view restores completed tools without a journal and excludes foreign work', async () => {
  const tool = interruptedViewItems[1];
  const result = await recoverRuntimeToolHistory(
    viewReader([
      ...interruptedViewItems,
      { ...tool, id: 'foreign-run', sourceRunId: 'other' },
      { ...tool, id: 'foreign-turn', sourceTurnId: 'other' },
    ]),
    snapshot,
  );
  assert.deepEqual(
    result.toolEvents?.map((item) => [item.kind, item.toolId]),
    [
      ['tool_start', 'tool'],
      ['tool_result', 'tool'],
    ],
  );
  assert.deepEqual(result.cursor, snapshot.cursor, 'view order must not invent an event sequence');
});

test('unfinished tools have no invented success receipt', async () => {
  const item = interruptedViewItems[1];
  const result = await recoverRuntimeToolHistory(
    viewReader([
      { ...item, tool: { ...item.tool!, status: 'running', resultRecorded: undefined } },
    ]),
    snapshot,
  );
  assert.deepEqual(
    result.toolEvents?.map((item) => item.kind),
    ['tool_start'],
  );
});

test('view errors propagate and idle snapshots do not recover another Run', async () => {
  const broken = viewReader([]);
  broken.observeView = async () => {
    throw new Error('view unavailable');
  };
  await assert.rejects(recoverRuntimeToolHistory(broken, snapshot), /view unavailable/);
  const idle = { ...snapshot, activeRun: undefined };
  assert.equal(await recoverRuntimeToolHistory(broken, idle), idle);
});

test('tool recovery bounds receipts and retains the complete input', async () => {
  const item = interruptedViewItems[1];
  const input = { path: 'x'.repeat(70_000) };
  const result = await recoverRuntimeToolHistory(
    viewReader([
      {
        ...item,
        text: 'x'.repeat(600_000),
        totalTextLength: 600_000,
        tool: { ...item.tool!, inputText: JSON.stringify(input) },
      },
    ]),
    snapshot,
  );
  assert.deepEqual(result.toolEvents?.find((item) => item.kind === 'tool_start')?.input, input);
  const receipt = result.toolEvents?.find((item) => item.kind === 'tool_result');
  assert.ok(receipt && receipt.content.length <= 524_288);
});
