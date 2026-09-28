import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionEvent } from '@kodax-space/space-ipc-schema';
import {
  applyLiveBudgetFallback,
  summarizeTodoProgress,
} from '../../renderer/src/lib/liveTaskProgress.js';

test('todo progress counts an active item before it completes', () => {
  const progress = summarizeTodoProgress([
    { status: 'completed' },
    { status: 'in_progress' },
    { status: 'pending' },
  ]);

  assert.equal(progress.completed, 1);
  assert.equal(progress.progressed, 2);
  assert.equal(progress.total, 3);
});

test('Runner fuse is independent of the overall work budget', () => {
  const event: SessionEvent = {
    kind: 'iteration_start',
    sessionId: 's1',
    iter: 4,
    maxIter: 500,
  };

  assert.deepEqual(applyLiveBudgetFallback({ used: 0, cap: 200 }, event), {
    used: 0,
    cap: 200,
  });
});

test('live budget fallback advances from tool progress', () => {
  const event: SessionEvent = {
    kind: 'tool_start',
    sessionId: 's1',
    toolId: 'tool-1',
    toolName: 'read',
  };

  assert.deepEqual(applyLiveBudgetFallback({ used: 0, cap: 200 }, event), {
    used: 1,
    cap: 200,
  });
});

test('live budget fallback advances from todo progress', () => {
  const event: SessionEvent = {
    kind: 'todo_update',
    sessionId: 's1',
    items: [
      { id: 'a', content: 'A', status: 'in_progress' },
      { id: 'b', content: 'B', status: 'pending' },
    ],
  };

  assert.deepEqual(applyLiveBudgetFallback({ used: 0, cap: 200 }, event), {
    used: 1,
    cap: 200,
  });
});

test('unbounded Runner iterations do not consume the work budget', () => {
  const budget = { used: 3, cap: 200 };
  assert.strictEqual(
    applyLiveBudgetFallback(budget, {
      kind: 'iteration_start',
      sessionId: 's1',
      iter: 99,
      maxIter: 0,
    }),
    budget,
  );
});
