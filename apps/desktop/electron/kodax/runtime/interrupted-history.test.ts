import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeEvent } from '@kodax-ai/kodax/runtime';
import type { SessionHistoryItem } from '@kodax-space/space-ipc-schema';
import { recoverInterruptedHistory } from './interrupted-history.js';
import {
  expandInterruptedConversationPage,
  type RuntimeConversationHistoryPage,
} from '../runtime-host-adapter.js';

function event(seq: number, type: RuntimeEvent['type'], payload: unknown): RuntimeEvent {
  return {
    id: `event-${seq}`,
    seq,
    cursor: { sessionId: 's', journalEpoch: 'e', seq },
    sessionId: 's',
    runId: 'r',
    turnId: 't',
    time: new Date(seq).toISOString(),
    type,
    payload,
  };
}
const user: SessionHistoryItem = { kind: 'user', content: 'query', turnId: 't', entryId: 'u' };
const run = { runId: 'r', sessionId: 's', turnId: 't', phase: 'interrupted' as const };
const rows = [
  event(1, 'assistant.delta', { text: 'Saved progress' }),
  event(2, 'tool.started', { tool: { id: 'tool', name: 'read', input: {} } }),
  event(3, 'tool.finished', { result: { id: 'tool', name: 'read', content: 'receipt' } }),
  event(4, 'thinking.delta', { text: 'unfinished reasoning' }),
];

test('reopens interrupted output from journal without rewriting or duplicating canonical history', async () => {
  const service = { replay: async () => rows };
  const items = await recoverInterruptedHistory(service, [run], 's', [user]);
  assert.equal(items.filter((i) => i.kind === 'assistant').length, 2);
  assert.ok(items.some((i) => i.kind === 'assistant' && i.text === 'Saved progress'));
  assert.ok(items.some((i) => i.kind === 'assistant' && i.thinking === 'unfinished reasoning'));
  assert.ok(items.some((i) => i.kind === 'tool_call' && i.result === 'receipt'));
  assert.deepEqual(await recoverInterruptedHistory(service, [run], 's', items), items);
  assert.deepEqual(user, { kind: 'user', content: 'query', turnId: 't', entryId: 'u' });
});

test('recovers only a missing suffix and enriches a durable tool with its real receipt', async () => {
  const canonical: SessionHistoryItem[] = [
    user,
    { kind: 'assistant', text: 'Saved progress', turnId: 't', entryId: 'a' },
    { kind: 'tool_call', toolId: 'tool', toolName: 'read', turnId: 't', entryId: 'tool-entry' },
  ];
  const restored = await recoverInterruptedHistory(
    { replay: async () => rows },
    [run],
    's',
    canonical,
  );
  assert.equal(restored.filter((i) => i.kind === 'tool_call').length, 1);
  assert.ok(restored.some((i) => i.kind === 'tool_call' && i.result === 'receipt'));
  assert.ok(restored.some((i) => i.kind === 'assistant' && i.thinking === 'unfinished reasoning'));
  assert.deepEqual(
    await recoverInterruptedHistory({ replay: async () => rows }, [run], 's', restored),
    restored,
  );
});

test('does not invent output for empty, active, completed, foreign or ambiguous turns', async () => {
  for (const candidate of [
    { ...run, phase: 'running' as const },
    { ...run, phase: 'completed' as const },
    { ...run, sessionId: 'other' },
    { ...run, turnId: 'other' },
  ]) {
    assert.deepEqual(
      await recoverInterruptedHistory({ replay: async () => rows }, [candidate], 's', [user]),
      [user],
    );
  }
  assert.deepEqual(
    await recoverInterruptedHistory({ replay: async () => [] }, [run], 's', [user]),
    [user],
  );
  const ambiguous: SessionHistoryItem[] = [user, { ...user, entryId: 'other-branch' }];
  assert.deepEqual(
    await recoverInterruptedHistory({ replay: async () => rows }, [run], 's', ambiguous),
    ambiguous,
  );
});

test('keeps child output separate and honours replacement of an incomplete provider segment', async () => {
  const events = [
    event(1, 'assistant.delta', { text: 'abandoned attempt' }),
    event(2, 'output.segment.started', {
      responseId: 'response',
      providerRequestId: 'retry',
      mode: 'replace',
    }),
    event(3, 'assistant.delta', { text: 'visible retry' }),
    event(4, 'assistant.delta', { text: 'child secret', meta: { contextKind: 'child' } }),
  ];
  const restored = await recoverInterruptedHistory({ replay: async () => events }, [run], 's', [
    user,
  ]);
  assert.deepEqual(
    restored.filter((i) => i.kind === 'assistant').map((i) => i.text),
    ['visible retry'],
  );
});

test('paginates journals and rejects a repeated cursor instead of looping', async () => {
  const events = Array.from({ length: 520 }, (_, index) =>
    event(index + 1, 'thinking.delta', { text: 'x' }),
  );
  const restored = await recoverInterruptedHistory(
    {
      replay: async (filter) =>
        events.filter((e) => e.seq > (filter.after?.seq ?? 0)).slice(0, filter.limit),
    },
    [run],
    's',
    [user],
  );
  assert.equal(restored.find((i) => i.kind === 'assistant')?.thinking?.length, 520);
  await assert.rejects(
    recoverInterruptedHistory({ replay: async () => events.slice(0, 512) }, [run], 's', [user]),
    /cursor/,
  );
});

test('bounds individual recovered text rows without losing large streamed content', async () => {
  const text = 'x'.repeat(300_000);
  const restored = await recoverInterruptedHistory(
    { replay: async () => [event(1, 'assistant.delta', { text })] },
    [run],
    's',
    [user],
  );
  const assistants = restored.filter(
    (i): i is Extract<SessionHistoryItem, { kind: 'assistant' }> => i.kind === 'assistant',
  );
  assert.ok(assistants.every((i) => i.text.length <= 262_144));
  assert.equal(assistants.map((i) => i.text).join(''), text);
});

test('does not graft a receipt onto a conflicting canonical prefix or different tool input', async () => {
  const canonical: SessionHistoryItem[] = [
    user,
    { kind: 'assistant', text: 'different branch', turnId: 't' },
    { kind: 'tool_call', toolId: 'tool', toolName: 'read', input: { path: 'other' }, turnId: 't' },
  ];
  const restored = await recoverInterruptedHistory(
    { replay: async () => rows },
    [run],
    's',
    canonical,
  );
  assert.deepEqual(restored, canonical);
});

test('unfinished recovered calls are interrupted, never running or successful', async () => {
  const restored = await recoverInterruptedHistory(
    { replay: async () => rows.slice(0, 2) },
    [run],
    's',
    [user],
  );
  const tool = restored.find((i) => i.kind === 'tool_call');
  assert.equal(tool?.interrupted, true);
  assert.equal(tool?.result, undefined);
});

test('older partial pages cannot replay tails already present in newer pages', async () => {
  const recovered = await recoverInterruptedHistory(
    {
      replay: async () => {
        throw new Error('must not read incomplete turn');
      },
    },
    [run],
    's',
    [user],
    [],
  );
  assert.deepEqual(
    recovered.filter((item) => item.kind !== 'workflow_notice'),
    [user],
  );
  assert.ok(
    recovered.some((item) => item.kind === 'workflow_notice' && item.text.includes('暂未恢复')),
  );
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

test('bounds recovered receipts for both durable and missing tool calls', async () => {
  const huge = 'x'.repeat(600_000);
  const journal = rows.map((row) =>
    row.type === 'tool.finished'
      ? event(row.seq, 'tool.finished', { result: { id: 'tool', name: 'read', content: huge } })
      : row,
  );
  for (const canonical of [
    [user],
    [
      user,
      { kind: 'assistant' as const, text: 'Saved progress', turnId: 't' },
      { kind: 'tool_call' as const, toolId: 'tool', toolName: 'read', turnId: 't' },
    ],
  ]) {
    const result = await recoverInterruptedHistory(
      { replay: async () => journal },
      [run],
      's',
      canonical,
    );
    const receipt = result.find((item) => item.kind === 'tool_call')?.result;
    assert.ok(receipt && receipt.length <= 524_288);
    assert.ok(receipt.endsWith('[恢复的工具输出已截断]'));
  }
});

test('multiple journal pages share one deadline and stop issuing reads after expiry', async () => {
  const deadline = Date.now() + 80;
  let calls = 0;
  await assert.rejects(
    recoverInterruptedHistory(
      {
        replay: async (filter) => {
          calls++;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return Array.from({ length: 512 }, (_, i) =>
            event((filter.after?.seq ?? 0) + i + 1, 'thinking.delta', { text: 'x' }),
          );
        },
      },
      [run],
      's',
      [user],
      undefined,
      deadline,
    ),
    /timed out/,
  );
  assert.equal(calls, 2);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(calls, 2);
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

test('recovers once after identical persisted prompt duplicates without joining different inputs', async () => {
  const repeated: SessionHistoryItem[] = [
    { ...user, sentAt: 100, turnUserOrdinal: 0 },
    { ...user, entryId: 'duplicate-entry', sentAt: 100, turnUserOrdinal: 1 },
  ];
  const recovered = await recoverInterruptedHistory(
    { replay: async () => rows },
    [run],
    's',
    repeated,
    ['t'],
  );
  assert.deepEqual(recovered.slice(0, 2), repeated);
  assert.equal(
    recovered.filter((item) => item.kind === 'assistant' && item.text === 'Saved progress').length,
    1,
  );
  assert.deepEqual(
    await recoverInterruptedHistory({ replay: async () => rows }, [run], 's', recovered, ['t']),
    recovered,
  );
  for (const changed of [
    { ...repeated[1], sentAt: 101 },
    { ...repeated[1], content: 'different query' },
  ]) {
    const conflict = [repeated[0], changed] as SessionHistoryItem[];
    assert.deepEqual(
      await recoverInterruptedHistory({ replay: async () => rows }, [run], 's', conflict),
      conflict,
    );
  }
});

test('shows prior unfinished thinking when the replacement attempt dies before producing output', async () => {
  const events = [
    event(1, 'thinking.delta', { text: 'prior unfinished thinking' }),
    event(2, 'output.segment.started', {
      responseId: 'retry',
      providerRequestId: 'retry',
      mode: 'replace',
    }),
  ];
  const restored = await recoverInterruptedHistory({ replay: async () => events }, [run], 's', [
    user,
  ]);
  assert.ok(
    restored.some(
      (item) =>
        item.kind === 'assistant' && item.thinking === 'prior unfinished thinking' && !item.text,
    ),
  );
  assert.ok(
    restored.some((item) => item.kind === 'workflow_notice' && item.text.includes('重试前')),
  );
});

test('repeated empty retries preserve prior thinking but a nonempty replacement supersedes it', async () => {
  const retry = (seq: number) =>
    event(seq, 'output.segment.started', {
      responseId: 'retry',
      providerRequestId: `retry-${seq}`,
      mode: 'replace',
    });
  for (const middle of [[], [event(3, 'assistant.delta', { text: 'new attempt' })]]) {
    const journal = [
      event(1, 'thinking.delta', { text: 'old thought' }),
      retry(2),
      ...middle,
      retry(4),
    ];
    const restored = await recoverInterruptedHistory({ replay: async () => journal }, [run], 's', [
      user,
    ]);
    assert.equal(
      restored.some((item) => item.kind === 'assistant' && item.thinking === 'old thought'),
      middle.length === 0,
    );
  }
});

test('identical queued admissions cannot be treated as legacy duplicate persistence', async () => {
  const repeated: SessionHistoryItem[] = [
    { ...user, sentAt: 100 },
    { ...user, entryId: 'other', sentAt: 100 },
  ];
  const queuedRun = {
    ...run,
    interruptInputs: [
      {
        inputId: 'input',
        afterRunId: 'r',
        delivery: 'interrupt' as const,
        state: 'delivered' as const,
        contentPreview: 'query',
        queuedAt: new Date(100).toISOString(),
        entryId: 'other',
      },
    ],
  };
  assert.deepEqual(
    await recoverInterruptedHistory({ replay: async () => rows }, [queuedRun], 's', repeated),
    repeated,
  );
});
