import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduceChildAgentLive } from '../kodax/child-agent-live.js';

const child = { childAgentId: '/root/review', childAgentName: '/root/review', liveOnly: true };
const event = (type: string, payload: Record<string, unknown>) => ({ type, payload });

test('a child appears on its first event and folds thinking, tool start and tool end', () => {
  let children = reduceChildAgentLive(
    [],
    event('thinking.delta', { text: 'Scanning ', meta: child }),
    100,
  );
  children = reduceChildAgentLive(
    children!,
    event('thinking.delta', { text: 'files\nnow', meta: child }),
    150,
  );
  assert.deepEqual(children, [
    { id: '/root/review', label: '/root/review', startedAt: 100, thinking: 'Scanning files\nnow' },
  ]);

  const input = { path: 'README.md', content: 'x'.repeat(1_000), limit: 20 };
  children = reduceChildAgentLive(
    children!,
    event('tool.started', { tool: { id: 'c1', name: 'read', input }, meta: child }),
    200,
  );
  assert.deepEqual(children, [
    {
      id: '/root/review',
      label: '/root/review',
      startedAt: 100,
      // Only short string fields survive; thinking restarts after the tool.
      tool: {
        id: 'c1',
        name: 'read',
        input: { path: 'README.md' },
        status: 'running',
        startedAt: 200,
      },
    },
  ]);

  children = reduceChildAgentLive(
    children!,
    event('tool.finished', {
      result: { id: 'c1', name: 'read', toolResult: { is_error: true } },
      meta: child,
    }),
    300,
  );
  assert.equal(children![0]!.tool?.status, 'failed');

  children = reduceChildAgentLive(
    children!,
    event('assistant.delta', { text: 'Report', meta: child }),
    400,
  );
  assert.equal(children![0]!.thinking, 'Report');
  assert.equal(children![0]!.tool?.status, 'failed');

  assert.deepEqual(
    reduceChildAgentLive(children!, event('child_activity.finished', { meta: child }), 500),
    [],
  );
});

test('thinking keeps only its tail and a finish for an older call keeps the latest tool running', () => {
  let children = reduceChildAgentLive(
    [],
    event('thinking.delta', { text: 'a'.repeat(900), meta: child }),
    1,
  );
  assert.equal(children![0]!.thinking!.length, 400);
  children = reduceChildAgentLive(
    children!,
    event('tool.started', { tool: { id: 'c2', name: 'grep' }, meta: child }),
    2,
  );
  assert.equal(
    reduceChildAgentLive(
      children!,
      event('tool.finished', { result: { id: 'c1' }, meta: child }),
      3,
    ),
    undefined,
  );
  assert.equal(children![0]!.tool?.status, 'running');
});

test('root events leave children alone until the root run ends', () => {
  const children = reduceChildAgentLive(
    [],
    event('thinking.delta', { text: 'x', meta: child }),
    1,
  )!;
  assert.equal(
    reduceChildAgentLive(children, event('thinking.delta', { text: 'root', meta: {} }), 2),
    undefined,
  );
  assert.equal(
    reduceChildAgentLive(children, event('tool.progress', { meta: child }), 2),
    undefined,
  );
  assert.deepEqual(reduceChildAgentLive(children, event('run.completed', { meta: {} }), 3), []);
  assert.equal(reduceChildAgentLive([], event('run.completed', { meta: {} }), 3), undefined);
});
