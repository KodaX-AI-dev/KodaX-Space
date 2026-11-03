import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPartnerAllowedWorkflowKind } from '../slash/builtin.js';
import { WorkflowController } from '../kodax/workflow-controller.js';

test('Partner Workflow commands retain general Agent capabilities', () => {
  for (const kind of [
    'help',
    'list',
    'runs',
    'show',
    'pause',
    'resume',
    'stop',
    'delete',
    'prune',
    'save',
    'rename',
    'revise',
    'rerun',
    'create',
    'start',
  ] as const)
    assert.equal(isPartnerAllowedWorkflowKind(kind), true);
});

test('Partner Workflow launch uses the same Host and preserves its trusted surface', async () => {
  const controller = new WorkflowController(() => undefined);
  const calls: unknown[] = [];
  controller.setHostOwner({
    enabled: () => true,
    ownsRun: async () => false,
    runDirectory: async () => '/isolated',
    start: async (input) => {
      calls.push(input);
      return { runId: 'host-run' };
    },
  });
  const result = await controller.start({
    target: 'research',
    source: 'builtin',
    session: {
      sessionId: 'partner',
      surface: 'partner',
      provider: 'anthropic',
      reasoningMode: 'auto',
      agentMode: 'ama',
      projectRoot: '/isolated',
    },
  });
  assert.deepEqual(result, { runId: 'host-run' });
  assert.equal(calls.length, 1);
  assert.equal(
    (calls[0] as { metadata: { hostMetadata: { surface: string } } }).metadata.hostMetadata.surface,
    'partner',
  );
});
