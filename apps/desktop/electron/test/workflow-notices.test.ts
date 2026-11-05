import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowEventPayload, WorkflowRunT } from '@kodax-space/space-ipc-schema';
import { formatWorkflowEventNotices } from '../../renderer/src/features/workflow/workflowNotices.js';

function run(over: Partial<WorkflowRunT>): WorkflowRunT {
  return {
    runId: 'wf-notice',
    workflowName: 'review',
    status: 'running',
    startedAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:01.000Z',
    items: [],
    counts: { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0, skipped: 0 },
    progress: {
      spawnedAgents: 0,
      finishedAgents: 0,
      activeAgents: 0,
      failedAgents: 0,
      stoppedAgents: 0,
    },
    ...over,
  };
}

function event(over: Partial<WorkflowEventPayload>): WorkflowEventPayload {
  return {
    type: 'workflow_updated',
    snapshot: run({}),
    sessionId: 's1',
    surface: 'code',
    ...over,
  };
}

test('a Host Workflow final response stays in the SDK Session without a duplicate local completion notice', () => {
  assert.deepEqual(
    formatWorkflowEventNotices(
      event({
        type: 'workflow_finished',
        snapshot: run({
          status: 'completed',
          resultSource: 'session',
          resultSummary: 'SDK final response',
        }),
      }),
    ),
    [],
  );
});

test('workflow event notices include completed child agent summaries', () => {
  const notices = formatWorkflowEventNotices(
    event({
      snapshot: run({
        items: [
          {
            id: 'a1',
            title: 'Security review',
            kind: 'agent',
            status: 'completed',
            summaryStatus: 'result',
            summary: 'Checked IPC handlers.\nNo high risk issue found.',
          },
        ],
      }),
    }),
  );

  assert.equal(notices.length, 1);
  assert.match(notices[0]?.key ?? '', /^item:wf-notice:a1$/);
  assert.equal(
    notices[0]?.text,
    '[workflow] agent summary: Security review\nChecked IPC handlers.\nNo high risk issue found.',
  );
});

test('workflow finished notice preserves readable markdown instead of one-line collapse', () => {
  const notices = formatWorkflowEventNotices(
    event({
      type: 'workflow_finished',
      snapshot: run({
        status: 'completed',
        resultSummary: '# Final report\n\n- OK\n- Follow up later',
      }),
    }),
  );

  assert.equal(notices.length, 1);
  assert.match(notices[0]?.key ?? '', /^finished:wf-notice:completed$/);
  assert.equal(
    notices[0]?.text,
    '[workflow] completed: review · wf-notice\n# Final report\n\n- OK\n- Follow up later',
  );
});

test('workflow finished notice names the run id so same-named runs are distinguishable', () => {
  // User report: a failed run fixed + rerun leaves two same-named entries; a
  // "[workflow] failed: <name>" notice was ambiguous about which run failed. The
  // notice now carries the run id.
  const failed = formatWorkflowEventNotices(
    event({
      type: 'workflow_finished',
      snapshot: run({
        runId: 'run-old',
        workflowName: 'deep-review',
        status: 'failed',
        error: 'boom',
      }),
    }),
  );
  const rerun = formatWorkflowEventNotices(
    event({
      type: 'workflow_finished',
      snapshot: run({
        runId: 'run-new',
        workflowName: 'deep-review',
        status: 'completed',
        resultSummary: 'ok',
      }),
    }),
  );
  assert.equal(failed[0]?.text, '[workflow] failed: deep-review · run-old\nboom');
  assert.equal(rerun[0]?.text, '[workflow] completed: deep-review · run-new\nok');
});

test('workflow finished notice keeps full final report text', () => {
  const repeated = 'All checks passed with detailed evidence.\n'.repeat(80);
  const tail = 'TAIL_MARKER_VISIBLE_AFTER_LONG_REPORT';
  const notices = formatWorkflowEventNotices(
    event({
      type: 'workflow_finished',
      snapshot: run({
        status: 'completed',
        resultSummary: `# Final report\n\n${repeated}${tail}`,
      }),
    }),
  );

  assert.equal(notices.length, 1);
  assert.ok(notices[0]?.text.includes(tail));
  assert.ok(!notices[0]?.text.endsWith('\n...'));
});

test('workflow live progress messages are NOT pushed to the transcript (they belong to the right-sidebar ticker)', () => {
  const notices = formatWorkflowEventNotices(
    event({
      message: 'agent spawned: Collect changes',
    }),
  );

  // Live progress (agent spawned / phase started / …) no longer floods the
  // conversation; only per-agent summaries + the final result reach history.
  assert.equal(notices.length, 0);
});

test('workflow event notices ignore generic live refresh messages', () => {
  const notices = formatWorkflowEventNotices(
    event({
      message: 'running',
    }),
  );

  assert.equal(notices.length, 0);
});

// The per-agent digest (workflow.activity kind:'digest') no longer produces a transcript
// notice — it feeds the right-sidebar live activity strip only. The durable per-agent
// transcript summary comes from the snapshot item-summary path (asserted above), which is
// keyed + deduped and is also what restore replays. This removed the duplicate-summary bug
// (digest + item-summary both emitted a byte-identical notice for the same SDK event).
