import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BEAT_LIMIT,
  clusterOutputTokens,
  clusterStartedAt,
  liveToolRows,
  thinkingTail,
  toolBeats,
  toolTarget,
  type PulseTool,
} from './toolClusterPulse.js';

const tool = (id: string, patch: Partial<PulseTool> = {}): PulseTool => ({
  id,
  toolName: 'read',
  status: 'done',
  ...patch,
});

test('beats keep only the latest finished tools and skip running ones', () => {
  const tools = [
    ...Array.from({ length: BEAT_LIMIT + 3 }, (_, index) => tool(`t${index}`)),
    tool('live', { status: 'running' }),
  ];
  const beats = toolBeats(tools);
  assert.equal(beats.length, BEAT_LIMIT);
  assert.equal(beats[0]?.id, 't3');
  assert.equal(beats.at(-1)?.id, `t${BEAT_LIMIT + 2}`);
});

test('beat tone follows the tool family and height follows the measured duration', () => {
  const [read, edit, bash, other, quick, slow, untimed] = toolBeats([
    tool('read', { toolName: 'grep' }),
    tool('edit', { toolName: 'multi_edit' }),
    tool('bash', { toolName: 'bash' }),
    tool('other', { toolName: 'ask_user' }),
    tool('quick', { startedAt: 0, endedAt: 50 }),
    tool('slow', { startedAt: 0, endedAt: 60_000 }),
    tool('untimed'),
  ]);
  assert.deepEqual(
    [read, edit, bash, other].map((beat) => beat?.tone),
    ['info', 'accent', 'run', 'muted'],
  );
  assert.ok(quick && slow && untimed);
  assert.ok(quick.height < untimed.height && untimed.height < slow.height);
  assert.equal(
    slow.height,
    toolBeats([tool('x', { startedAt: 0, endedAt: 3_600_000 })])[0]?.height,
  );
});

test('live rows are the three visible tools plus the one leaving, with target and duration', () => {
  const rows = liveToolRows(
    [
      tool('gone'),
      tool('a'),
      tool('b', {
        toolName: 'grep',
        input: { pattern: 'tool-card-anim' },
        startedAt: 0,
        endedAt: 300,
      }),
      tool('c', { toolName: 'edit', input: { file_path: 'renderer/src/styles.css' } }),
      tool('d', {
        toolName: 'bash',
        status: 'running',
        input: { command: 'npm run\n typecheck' },
        startedAt: 1_000,
      }),
    ],
    2_500,
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.name, row.target, row.status, row.durationMs]),
    [
      ['a', 'read', '', 'done', undefined],
      ['b', 'grep', 'tool-card-anim', 'done', 300],
      ['c', 'edit', 'renderer/src/styles.css', 'done', undefined],
      ['d', 'bash', 'npm run typecheck', 'running', 1_500],
    ],
  );
});

test('tool target prefers the identifying argument and stays on one bounded line', () => {
  assert.equal(toolTarget(undefined), '');
  assert.equal(toolTarget({ limit: 3 }), '');
  assert.equal(toolTarget({ query: 'x', path: 'a.ts' }), 'a.ts');
  assert.equal(toolTarget({ command: 'a'.repeat(200) }).length, 81);
});

test('thinking tail is the last non-empty line, trimmed from the left when long', () => {
  assert.equal(thinkingTail(undefined), '');
  assert.equal(thinkingTail('first\nsecond line\n\n  '), 'second line');
  const long = thinkingTail('x'.repeat(200));
  assert.equal(long.length, 81);
  assert.ok(long.startsWith('…'));
});

test('cluster stats come from the earliest known start and the generated text', () => {
  const steps = [{ thinking: 'abcd', productItem: { timestamp: 900 } }, { thinking: '思考' }];
  const tools = [tool('a', { startedAt: 1_000, input: { path: 'abcdefgh' } }), tool('b')];
  assert.equal(clusterStartedAt(steps, tools), 900);
  assert.equal(clusterStartedAt([{}], [tool('x')]), undefined);
  // 'abcd' = 1, '思考' = 2, '{"path":"abcdefgh"}' (19 ascii) = 5
  assert.equal(clusterOutputTokens(steps, tools), 8);
});
