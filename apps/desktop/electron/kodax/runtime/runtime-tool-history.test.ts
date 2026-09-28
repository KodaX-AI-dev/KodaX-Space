import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeEvent, RuntimeEventReplayFilter } from '@kodax-ai/kodax/runtime';
import type { SpaceSessionLiveProjectionT } from '@kodax-space/space-ipc-schema';
import { recoverRuntimeToolHistory } from './runtime-tool-history.js';

const snapshot: SpaceSessionLiveProjectionT = {
  sessionId: 'session',
  projectionRevision: 1,
  transcriptRevision: 'revision',
  cursor: { runtimeId: 'runtime', sessionId: 'session', journalEpoch: 'epoch', seq: 8 },
  activeRun: { runId: 'run', sessionId: 'session', turnId: 'turn', phase: 'running', startedAt: 1 },
  queuedRuns: [],
  activeTools: [],
  todos: [],
  interactions: [],
  queuedInputs: [],
  outputSegment: {
    retained: [],
    active: {
      responseId: 'response',
      providerRequestId: 'request',
      mode: 'append',
      startedAtSeq: 2,
      assistantText: 'Working',
      thinkingText: '',
      assistantTextStartOffset: 0,
      thinkingTextStartOffset: 0,
    },
  },
};

function event(seq: number, type: RuntimeEvent['type'], payload: unknown): RuntimeEvent {
  return {
    id: `event-${seq}`,
    seq,
    cursor: { sessionId: 'session', journalEpoch: 'epoch', seq },
    sessionId: 'session',
    runId: 'run',
    turnId: 'turn',
    time: new Date(1_000 + seq).toISOString(),
    type,
    payload,
  };
}
const started = event(3, 'tool.started', {
  tool: { id: 'tool', name: 'read', input: { path: 'a' } },
});
const finished = event(4, 'tool.finished', {
  result: { id: 'tool', name: 'read', content: 'result' },
});

test('snapshot recovery reads completed tools with their journal order and excludes foreign work', async () => {
  const requests: RuntimeEventReplayFilter[] = [];
  const result = await recoverRuntimeToolHistory(
    {
      replay: async (filter) => {
        requests.push(filter);
        return [
          event(2, 'output.segment.started', {
            responseId: 'response',
            providerRequestId: 'request',
            mode: 'append',
          }),
          started,
          finished,
          { ...started, seq: 5, turnId: 'older-turn' },
          event(6, 'tool.started', {
            tool: { id: 'child-tool', name: 'read', input: {} },
            meta: { contextKind: 'child' },
          }),
          { ...started, seq: 7, runId: 'another-run' },
          { ...finished, seq: 9 },
        ];
      },
    },
    snapshot,
  );
  assert.deepEqual(
    result.toolEvents?.map((item) => [item.kind, item.seq]),
    [
      ['tool_start', 3],
      ['tool_result', 4],
    ],
  );
  assert.equal(result.outputSegment?.active?.startedAt, 1002);
  assert.equal(requests[0]?.after?.seq, 1);
  assert.equal(requests[0]?.runId, 'run');
});

test('recovery paginates a filtered journal and never reads past the snapshot', async () => {
  const rows = Array.from({ length: 520 }, (_, index) =>
    event(index + 2, 'tool.started', {
      tool: { id: `tool-${index}`, name: 'read', input: {} },
    }),
  );
  const requests: number[] = [];
  const result = await recoverRuntimeToolHistory(
    {
      replay: async (filter) => {
        requests.push(filter.after!.seq);
        return rows.filter((row) => row.seq > filter.after!.seq).slice(0, filter.limit);
      },
    },
    { ...snapshot, cursor: { ...snapshot.cursor, seq: 520 } },
  );
  assert.deepEqual(requests, [1, 513]);
  assert.equal(result.toolEvents?.length, 519);
  assert.equal(result.toolEvents?.at(-1)?.seq, 520);
});

test('replay errors propagate instead of returning a deceptively complete snapshot', async () => {
  await assert.rejects(
    recoverRuntimeToolHistory(
      {
        replay: async () => {
          throw new Error('journal unavailable');
        },
      },
      snapshot,
    ),
    /journal unavailable/,
  );
});

test('a snapshot without recoverable output does not replay another run', async () => {
  const empty = { ...snapshot, outputSegment: undefined };
  assert.equal(
    await recoverRuntimeToolHistory(
      {
        replay: async () => {
          assert.fail('no journal replay expected');
        },
      },
      empty,
    ),
    empty,
  );
});
