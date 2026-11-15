import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentChildLiveT } from '@kodax-space/space-ipc-schema';
import { childAgentRows } from './childAgentRows.js';

const child = (id: string, extra: Partial<AgentChildLiveT> = {}): AgentChildLiveT => ({
  id: `/root/${id}`,
  label: `/root/${id}`,
  startedAt: 1_000,
  ...extra,
});

test('a thinking child shows its latest thinking line; a tool child shows the tool and target', () => {
  const { rows, overflow } = childAgentRows(
    [
      child('scan', { thinking: 'Child is scanning files.\nchecking the README first\n' }),
      child('review', {
        tool: {
          id: 'c1',
          name: 'read',
          input: { path: 'README.md' },
          status: 'running',
          startedAt: 4_000,
        },
      }),
    ],
    7_000,
  );
  assert.equal(overflow, 0);
  assert.deepEqual(rows, [
    {
      id: '/root/scan',
      name: 'scan',
      mode: 'thinking',
      text: 'checking the README first',
      elapsedMs: 6_000,
    },
    {
      id: '/root/review',
      name: 'review',
      mode: 'tool',
      tool: 'read',
      text: 'README.md',
      status: 'running',
      elapsedMs: 6_000,
    },
  ]);
});

test('thinking after a finished tool wins; rows beyond three become an overflow count', () => {
  const tool = { id: 'c1', name: 'grep', status: 'failed', startedAt: 2_000 } as const;
  const { rows, overflow } = childAgentRows(
    [
      child('a', { tool, thinking: 'retrying with a wider pattern' }),
      child('b', { tool }),
      child('c'),
      child('d'),
      child('e'),
    ],
    3_000,
  );
  assert.equal(overflow, 2);
  assert.deepEqual(
    rows.map(({ name, mode, text, status }) => ({ name, mode, text, status })),
    [
      { name: 'a', mode: 'thinking', text: 'retrying with a wider pattern', status: undefined },
      { name: 'b', mode: 'tool', text: '', status: 'failed' },
      { name: 'c', mode: 'thinking', text: '', status: undefined },
    ],
  );
});
