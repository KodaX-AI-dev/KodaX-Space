import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createAgentActorController, type AgentExecutionResult } from '@kodax-ai/kodax/agent';
import {
  sessionEventChannel,
  agentIterationProgressSchema,
  agentActorTreeSnapshotSchema,
} from '@kodax-space/space-ipc-schema';
import { projectRuntimeContextSessionEvent } from '../kodax/runtime-host-adapter.js';
import { projectRuntimeActorTreeSnapshot } from '../kodax/runtime/runtime-agent-projection.js';
import { buildAgentStatuses } from '../../renderer/src/shell/agentStatusProjection.js';

test('installed SDK carries live iteration, exhaustion and follow-up through Space IPC to UI', async (t) => {
  let finish: ((result: AgentExecutionResult) => void) | undefined;
  const controller = await createAgentActorController({
    executor: {
      async execute(input) {
        await input.reportProgress({
          kind: 'status',
          summary: 'Iteration 1/2',
          iteration: { current: 1, max: 2 },
        });
        return new Promise<AgentExecutionResult>((resolve) => {
          finish = resolve;
        });
      },
    },
  });
  t.after(() => controller.shutdown());
  const turn = await controller.spawn('/root', {
    taskName: 'worker',
    objective: 'iteration telemetry',
  });
  const project = () =>
    agentActorTreeSnapshotSchema.parse(
      projectRuntimeActorTreeSnapshot('rt', 's1', controller.list('/root'), 1),
    );
  const waitFor = async (predicate: () => boolean) => {
    const deadline = Date.now() + 5_000;
    while (!predicate() && Date.now() < deadline) await delay(1);
    assert.ok(predicate(), 'SDK execution reached the expected state');
  };
  await waitFor(() => finish !== undefined);
  assert.deepEqual(project().actors.find((a) => a.path === turn.actorPath)?.latestTurn?.iteration, {
    current: 1,
    max: 2,
  });
  finish!({
    output: 'partial report',
    artifacts: ['partial.json'],
    terminationReason: 'iteration_limit',
    iteration: { current: 2, max: 2 },
  });
  await waitFor(() => controller.output('/root', turn.actorPath).state === 'failed');
  const view = buildAgentStatuses(undefined, undefined, project(), { current: 17, max: 500 });
  assert.match(view.find((a) => a.id === '/root')?.latest ?? '', /17\/500/);
  const child = view.find((a) => a.id === turn.actorPath);
  assert.equal(child?.state, 'error');
  assert.equal(child?.terminationReason, 'iteration_limit');
  assert.match(child?.latest ?? '', /2\/2/);
  const output = controller.output('/root', turn.actorPath);
  assert.equal(output.output, 'partial report');
  assert.deepEqual(output.artifacts, ['partial.json']);
  finish = undefined;
  await controller.followup('/root', turn.actorPath, 'Continue the partial report');
  await waitFor(() => finish !== undefined);
  const next = project().actors.find((a) => a.path === turn.actorPath)?.latestTurn;
  assert.equal(next?.terminationReason, undefined);
  assert.deepEqual(next?.iteration, { current: 1, max: 2 });
  finish!({ output: 'complete report', iteration: { current: 2, max: 2 } });
  await waitFor(() => controller.output('/root', turn.actorPath).state === 'completed');
  assert.equal(
    project().actors.find((a) => a.path === turn.actorPath)?.latestTurn?.state,
    'completed',
  );
});

test('iteration IPC accepts unbounded runtime values without inventing a denominator', () => {
  assert.deepEqual(agentIterationProgressSchema.parse({ current: 17, max: 0 }), {
    current: 17,
    max: 0,
  });
  assert.equal(agentIterationProgressSchema.safeParse({ current: 1, max: -1 }).success, false);
  const event = {
    id: 'i1',
    seq: 1,
    cursor: { sessionId: 's1', journalEpoch: 'j1', seq: 1 },
    sessionId: 's1',
    runId: 'r1',
    time: '2026-09-28T00:00:00Z',
    type: 'run.progress' as const,
    payload: {
      kind: 'iteration_start' as const,
      iter: 17,
      maxIter: 0,
      meta: { childAgentId: '/root/worker' },
    },
  };
  const projected = projectRuntimeContextSessionEvent(event);
  assert.deepEqual(projected, {
    kind: 'iteration_start',
    sessionId: 's1',
    iter: 17,
    maxIter: 0,
    contextKind: 'child',
  });
  assert.equal(sessionEventChannel.payload.safeParse(projected).success, true);
});

test('Actor IPC retains structured iteration and exhausted status together', () => {
  const snapshot = {
    runtimeId: 'rt',
    sessionId: 's1',
    rootPath: '/root',
    revision: 1,
    eventCursor: 1,
    activeNonRootTurns: 0,
    maxConcurrentThreads: 4,
    actors: [
      {
        path: '/root/worker',
        taskName: 'worker',
        kind: 'native',
        state: 'idle',
        createdAt: 'now',
        updatedAt: 'now',
        revision: 1,
        latestTurn: {
          turnId: 't1',
          state: 'failed',
          summary: 'partial',
          summaryTruncated: false,
          recentActivity: [],
          iteration: { current: 200, max: 200 },
          terminationReason: 'iteration_limit',
        },
      },
    ],
  };
  const parsed = agentActorTreeSnapshotSchema.parse(snapshot);
  assert.equal(parsed.actors[0]?.latestTurn?.terminationReason, 'iteration_limit');
  assert.deepEqual(parsed.actors[0]?.latestTurn?.iteration, { current: 200, max: 200 });
});
