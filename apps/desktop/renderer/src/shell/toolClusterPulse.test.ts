import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clusterEndedAt,
  clusterOutputTokens,
  clusterStartedAt,
  familyTallies,
  formatPulseDuration,
  liveToolRows,
  thinkingTail,
  toolTarget,
  type PulseTool,
} from './toolClusterPulse.js';

const tool = (id: string, patch: Partial<PulseTool> = {}): PulseTool => ({
  id,
  toolName: 'read',
  status: 'done',
  ...patch,
});

test('tallies count each tool family in a fixed order, with failures counted apart', () => {
  const tallies = familyTallies([
    tool('bash', { toolName: 'bash' }),
    tool('grep', { toolName: 'grep' }),
    tool('ask', { toolName: 'ask_user' }),
    tool('edit', { toolName: 'multi_edit' }),
    tool('read'),
    tool('test', { toolName: 'bash', failed: true }),
  ]);
  assert.deepEqual(
    tallies.map((tally) => [tally.family, tally.count]),
    [
      ['read', 2],
      ['edit', 1],
      ['run', 1],
      ['other', 1],
      ['fail', 1],
    ],
  );
});

test('skill loads tally as their own family, also when script mode bridges them', () => {
  const tallies = familyTallies([
    tool('s1', { toolName: 'skill', input: { skill: 'grilling' } }),
    tool('s2', { toolName: 'tool_call', input: { name: 'skill', input: { skill: 'tdd' } } }),
    tool('ask', { toolName: 'ask_user' }),
  ]);
  assert.deepEqual(
    tallies.map((tally) => [tally.family, tally.count]),
    [
      ['skill', 2],
      ['other', 1],
    ],
  );
});

test('a tally totals its busy time and the running tool keeps counting up', () => {
  const tools = [
    tool('a', { startedAt: 0, endedAt: 300 }),
    tool('b', { startedAt: 400, endedAt: 1_000 }),
    tool('test', { toolName: 'bash', status: 'running', startedAt: 1_000 }),
  ];
  const [read, run] = familyTallies(tools, 4_000);
  assert.deepEqual(read, { family: 'read', count: 2, durationMs: 900, running: false });
  assert.deepEqual(run, { family: 'run', count: 1, durationMs: 3_000, running: true });
  assert.equal(familyTallies(tools, 9_000)[1]?.durationMs, 8_000);
});

test('parallel tools of a family count their overlapping time once', () => {
  const [read, fail] = familyTallies(
    [
      tool('read', { startedAt: 0, endedAt: 9_000 }),
      tool('grep', { toolName: 'grep', startedAt: 10, endedAt: 9_000 }),
      tool('late', { startedAt: 12_000, endedAt: 12_500 }),
      tool('missing', { failed: true, startedAt: 20, endedAt: 9_000 }),
    ],
    20_000,
  );
  assert.equal(read?.durationMs, 9_500);
  assert.equal(fail?.durationMs, 8_980);
  const [run] = familyTallies(
    [
      tool('a', { toolName: 'bash', startedAt: 0, endedAt: 3_000 }),
      tool('b', { toolName: 'bash', status: 'running', startedAt: 1_000 }),
    ],
    5_000,
  );
  assert.deepEqual(run, { family: 'run', count: 2, durationMs: 5_000, running: true });
});

test('a family without any timing has no duration rather than a fake zero', () => {
  assert.deepEqual(familyTallies([tool('legacy')]), [{ family: 'read', count: 1, running: false }]);
});

test('durations use at most two units, plus seconds while an hour-long tool is running', () => {
  const cases: [number, boolean, string][] = [
    [2_440, false, '2.4s'],
    [2_440, true, '2s'],
    [42_900, false, '42s'],
    [187_000, true, '3m07s'],
    [3_907_000, false, '1h05m'],
    [3_907_000, true, '1h05m07s'],
  ];
  for (const [ms, running, expected] of cases) {
    assert.equal(formatPulseDuration(ms, running), expected, `${ms} ${running}`);
  }
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
  const [failed] = liveToolRows([tool('x', { failed: true })], 0);
  assert.equal(failed?.status, 'failed');
});

test('tool target prefers the identifying argument and stays on one bounded line', () => {
  assert.equal(toolTarget(undefined), '');
  assert.equal(toolTarget({ limit: 3 }), '');
  assert.equal(toolTarget({ query: 'x', path: 'a.ts' }), 'a.ts');
  assert.equal(toolTarget({ pattern: 'needle', path: ' ' }), 'needle');
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

test('output tokens count whole bodies when the SDK view keeps only a preview of them', () => {
  // A running Run's view trims older bodies to previews; the group total must not shrink.
  const full = [{ thinking: 'a'.repeat(4_000) }];
  const fullTools = [tool('a', { input: { command: 'b'.repeat(3_986) } })];
  const steps = [
    { thinking: 'a'.repeat(400), productItem: { textOffset: 3_600, totalTextLength: 4_000 } },
  ];
  const inputText = JSON.stringify({ command: 'b'.repeat(384) });
  const tools = [
    tool('a', {
      input: { input: inputText.slice(0, 200) },
      productItem: { tool: { inputText: inputText.slice(0, 200), totalInputLength: 4_000 } },
    }),
  ];
  assert.equal(clusterOutputTokens(steps, tools), clusterOutputTokens(full, fullTools));
});

test('script mode: a bridged tool_call shows and counts as the tool it calls', () => {
  const bridged = tool('bridge', {
    toolName: 'tool_call',
    input: { name: 'grep', input: { pattern: 'inputIds', path: 'src' } },
  });
  assert.deepEqual(
    liveToolRows([bridged], 0).map(({ name, target }) => ({ name, target })),
    [{ name: 'grep', target: 'src' }],
  );
  assert.deepEqual(
    familyTallies([bridged]).map((tally) => tally.family),
    ['read'],
  );
});

test('script mode: a script cell shows its first code line and counts as a run', () => {
  const cell = tool('cell', {
    toolName: 'script_exec',
    input: { code: '\n  const r = await tools["read"]({ path: "README.md" });\nreturn r;' },
  });
  assert.deepEqual(
    liveToolRows([cell], 0).map(({ name, target }) => ({ name, target })),
    [{ name: 'script_exec', target: 'const r = await tools["read"]({ path: "README.md" });' }],
  );
  assert.deepEqual(
    familyTallies([cell]).map((tally) => tally.family),
    ['run'],
  );
});

test('a tool held for approval is a waiting row, and the group ends with its last tool', () => {
  const held = {
    id: 'b',
    toolName: 'bash',
    status: 'running',
    awaitingApproval: true,
    startedAt: 5,
  } as const;
  assert.equal(liveToolRows([held], 10)[0]!.status, 'awaiting');
  const done = [
    { id: 'a', toolName: 'read', status: 'done', startedAt: 1, endedAt: 4 },
    { id: 'c', toolName: 'grep', status: 'done', startedAt: 2, endedAt: 9 },
  ] as const;
  assert.equal(clusterEndedAt(done), 9);
  assert.equal(clusterEndedAt([...done, held]), undefined);
});
