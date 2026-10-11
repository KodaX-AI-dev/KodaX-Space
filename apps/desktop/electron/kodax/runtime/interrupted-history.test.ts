import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionHistoryItem } from '@kodax-space/space-ipc-schema';
import { recoverInterruptedHistory } from './interrupted-history.js';
import { interruptedViewItems, viewReader } from './runtime-view-test-fixture.js';
import {
  expandInterruptedConversationPage,
  type RuntimeConversationHistoryPage,
} from '../runtime-host-adapter.js';

const user: SessionHistoryItem = { kind: 'user', content: 'query', turnId: 't', entryId: 'u' };
const run = { runId: 'r', sessionId: 's', turnId: 't', phase: 'interrupted' as const };

test('combined canonical thinking and text consume separate ordered view components', async () => {
  const saved: SessionHistoryItem[] = [
    user,
    { kind: 'assistant', text: 'Saved', thinking: 'Reason', turnId: 't' },
  ];
  const facts = [
    {
      id: 'opaque-thought',
      type: 'thinking' as const,
      text: 'Reason',
      sourceRunId: 'r',
      sourceTurnId: 't',
    },
    {
      id: 'opaque-output',
      type: 'assistant' as const,
      text: 'Saved tail',
      sourceRunId: 'r',
      sourceTurnId: 't',
    },
    {
      id: 'next-request',
      type: 'assistant' as const,
      text: 'Next response',
      sourceRunId: 'r',
      sourceTurnId: 't',
    },
  ];
  const restored = await recoverInterruptedHistory(viewReader(facts), [run], 's', saved);
  assert.deepEqual(
    restored
      .filter((item) => item.kind === 'assistant')
      .map((item) => [item.text, item.thinking || undefined]),
    [
      ['Saved', 'Reason'],
      [' tail', undefined],
      ['Next response', undefined],
    ],
  );
  assert.deepEqual(
    await recoverInterruptedHistory(viewReader(facts), [run], 's', restored),
    restored,
  );
  for (const barrier of [
    interruptedViewItems[1]!,
    { ...facts[0]!, sourceRunId: 'foreign' },
    { ...facts[0]!, sourceTurnId: 'foreign' },
    { ...facts[0]!, text: 'Reason tail' },
  ]) {
    assert.deepEqual(
      await recoverInterruptedHistory(
        viewReader([barrier, facts[1]!, facts[2]!]),
        [run],
        's',
        saved,
      ),
      saved,
    );
  }
});

test('repeated model call IDs acquire only their own ordered receipt', async () => {
  for (const paths of [
    ['A', 'B'],
    ['A', 'A'],
  ]) {
    const facts = paths.map((path, index) => ({
      id: `execution-${index}`,
      type: 'tool' as const,
      text: `receipt-${index}`,
      sourceRunId: 'r',
      sourceTurnId: 't',
      tool: {
        callId: 'reuse',
        name: 'read',
        status: 'success' as const,
        inputText: JSON.stringify({ path }),
        executionBegan: true as const,
        resultRecorded: true as const,
      },
    }));
    const saved: SessionHistoryItem[] = [
      user,
      ...paths.map((path) => ({
        kind: 'tool_call' as const,
        turnId: 't',
        toolId: 'reuse',
        toolName: 'read',
        input: { path },
      })),
    ];
    const restored = await recoverInterruptedHistory(viewReader(facts), [run], 's', saved);
    assert.deepEqual(
      restored.filter((item) => item.kind === 'tool_call').map((item) => item.result),
      ['receipt-0', 'receipt-1'],
    );
  }
});

test('reopens retained interrupted output without rewriting or duplicating canonical history', async () => {
  const service = viewReader(interruptedViewItems);
  const restored = await recoverInterruptedHistory(service, [run], 's', [user]);
  assert.deepEqual(
    restored.filter((i) => i.kind === 'assistant').map((i) => [i.text, i.thinking]),
    [
      ['Saved progress', undefined],
      ['', 'unfinished reasoning'],
    ],
  );
  assert.ok(restored.some((i) => i.kind === 'tool_call' && i.result === 'receipt'));
  assert.deepEqual(await recoverInterruptedHistory(service, [run], 's', restored), restored);
  assert.deepEqual(user, { kind: 'user', content: 'query', turnId: 't', entryId: 'u' });
});

test('enriches a saved tool with its real receipt and only appends the missing suffix', async () => {
  const saved: SessionHistoryItem[] = [
    user,
    { kind: 'assistant', text: 'Saved progress', turnId: 't' },
    { kind: 'tool_call', toolId: 'tool', toolName: 'read', turnId: 't' },
  ];
  const restored = await recoverInterruptedHistory(
    viewReader(interruptedViewItems),
    [run],
    's',
    saved,
  );
  assert.equal(restored.filter((i) => i.kind === 'tool_call').length, 1);
  assert.equal(restored.find((i) => i.kind === 'tool_call')?.result, 'receipt');
  assert.ok(restored.some((i) => i.kind === 'assistant' && i.thinking === 'unfinished reasoning'));
});

test('empty, active, completed, foreign and ambiguous turns never acquire invented output', async () => {
  for (const candidate of [
    { ...run, phase: 'running' as const },
    { ...run, phase: 'completed' as const },
    { ...run, sessionId: 'foreign' },
    { ...run, turnId: 'foreign' },
  ]) {
    assert.deepEqual(
      await recoverInterruptedHistory(viewReader(interruptedViewItems), [candidate], 's', [user]),
      [user],
    );
  }
  assert.deepEqual(await recoverInterruptedHistory(viewReader([]), [run], 's', [user]), [user]);
  const ambiguous = [user, { ...user, entryId: 'another-input' }];
  assert.deepEqual(
    await recoverInterruptedHistory(viewReader(interruptedViewItems), [run], 's', ambiguous),
    ambiguous,
  );
});

test('current Host view determines replacement order and excludes unproven child output', async () => {
  const restored = await recoverInterruptedHistory(
    viewReader([
      { ...interruptedViewItems[0], text: 'visible retry' },
      { ...interruptedViewItems[0], id: 'child', text: 'child secret', sourceRunId: 'child-run' },
    ]),
    [run],
    's',
    [user],
  );
  assert.deepEqual(
    restored.filter((i) => i.kind === 'assistant').map((i) => i.text),
    ['visible retry'],
  );
});

test('large retained output is split into bounded rows without losing content', async () => {
  const text = 'x'.repeat(300_000);
  const restored = await recoverInterruptedHistory(
    viewReader([{ ...interruptedViewItems[0], text }]),
    [run],
    's',
    [user],
  );
  const rows = restored.filter((i) => i.kind === 'assistant');
  assert.ok(rows.every((i) => i.text.length <= 262_144));
  assert.equal(rows.map((i) => i.text).join(''), text);
});

test('conflicting canonical prefixes never receive a tool receipt from another input', async () => {
  const saved: SessionHistoryItem[] = [
    user,
    { kind: 'assistant', text: 'different branch', turnId: 't' },
    { kind: 'tool_call', toolId: 'tool', toolName: 'read', input: { path: 'other' }, turnId: 't' },
  ];
  assert.deepEqual(
    await recoverInterruptedHistory(viewReader(interruptedViewItems), [run], 's', saved),
    saved,
  );
});

test('unfinished tool evidence stays interrupted and oversized receipts are bounded', async () => {
  const item = interruptedViewItems[1];
  const unfinished = {
    ...item,
    tool: { ...item.tool!, status: 'cancelled' as const, resultRecorded: undefined },
  };
  const restored = await recoverInterruptedHistory(viewReader([unfinished]), [run], 's', [user]);
  const call = restored.find((i) => i.kind === 'tool_call');
  assert.equal(call?.interrupted, true);
  assert.equal(call?.result, undefined);
  const huge = await recoverInterruptedHistory(
    viewReader([{ ...item, text: 'x'.repeat(600_000) }]),
    [run],
    's',
    [user],
  );
  const receipt = huge.find((i) => i.kind === 'tool_call')?.result;
  assert.ok(receipt && receipt.length <= 524_288 && receipt.endsWith('[恢复的工具输出已截断]'));
});

test('an incomplete turn does not read the retained tail from another page', async () => {
  const service = viewReader([]);
  service.observeView = async () => {
    throw new Error('must not read incomplete turn');
  };
  const restored = await recoverInterruptedHistory(service, [run], 's', [user], []);
  assert.deepEqual(
    restored.filter((i) => i.kind !== 'workflow_notice'),
    [user],
  );
  assert.ok(restored.some((i) => i.kind === 'workflow_notice' && i.text.includes('暂未恢复')));
});

test('view recovery obeys one deadline and preserves read failures', async () => {
  const service = viewReader([]);
  service.observeView = () => new Promise(() => {});
  await assert.rejects(
    recoverInterruptedHistory(service, [run], 's', [user], undefined, Date.now() + 20),
    /timed out/,
  );
  service.observeView = async () => {
    throw new Error('view unavailable');
  };
  await assert.rejects(recoverInterruptedHistory(service, [run], 's', [user]), /view unavailable/);
});

test('a leading interrupted turn looks back only until its complete prefix is available', async () => {
  const entry = (index: number, turnId: string, role: 'user' | 'assistant') => ({
    index,
    entry: {
      boundaryId: `entry-${index}`,
      auditEntryIds: [`entry-${index}`],
      message: { role, content: `content-${index}`, turnId },
    },
  });
  const newest: RuntimeConversationHistoryPage = {
    revision: 'rev',
    sourceRevision: 'src',
    status: 'resolved',
    issues: [],
    entries: [entry(5, 't', 'assistant')],
    hasMore: true,
    nextCursor: 'older',
  };
  let reads = 0;
  const expanded = await expandInterruptedConversationPage(newest, [run], async (cursor) => {
    reads++;
    assert.equal(cursor, 'older');
    return {
      ...newest,
      entries: [
        entry(2, 'previous', 'assistant'),
        entry(3, 't', 'user'),
        entry(4, 't', 'assistant'),
      ],
      nextCursor: 'even-older',
    };
  });
  assert.equal(reads, 1);
  assert.deepEqual(
    expanded.entries.map((e) => e.index),
    [2, 3, 4, 5],
  );
  assert.equal(expanded.nextCursor, 'even-older');
  assert.deepEqual(
    await expandInterruptedConversationPage(newest, [{ ...run, phase: 'completed' }], async () => {
      throw new Error('completed sessions must not look back');
    }),
    newest,
  );
  await assert.rejects(
    expandInterruptedConversationPage(newest, [run], async () => ({
      ...newest,
      sourceRevision: 'changed',
    })),
    /changed/,
  );
});

test('lookback retains a bounded page and respects the remaining deadline', async () => {
  const entry = (index: number) => ({
    index,
    entry: {
      boundaryId: `entry-${index}`,
      auditEntryIds: [`entry-${index}`],
      message: { role: 'assistant' as const, content: 'x', turnId: 't' },
    },
  });
  const page: RuntimeConversationHistoryPage = {
    revision: 'r',
    sourceRevision: 's',
    status: 'resolved',
    issues: [],
    entries: [entry(2001)],
    hasMore: true,
    nextCursor: 'older',
  };
  const bounded = await expandInterruptedConversationPage(page, [run], async () => ({
    ...page,
    entries: Array.from({ length: 2000 }, (_, i) => entry(i)),
    nextCursor: 'oldest',
  }));
  assert.deepEqual(bounded, page);
  await assert.rejects(
    expandInterruptedConversationPage(
      page,
      [run],
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { ...page, hasMore: false };
      },
      Date.now() + 20,
    ),
    /timed out/,
  );
});
