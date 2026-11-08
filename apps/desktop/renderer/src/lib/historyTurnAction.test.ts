import assert from 'node:assert/strict';
import test from 'node:test';
import { useConfirmStore } from '../store/confirmStore.js';
import { commandHistoryTurnSelector, performHistoryTurnAction } from './historyTurnAction.js';
import { useAppStore } from '../store/appStore.js';
import type { SessionMeta } from '@kodax-space/space-ipc-schema';

test('an old-window rewind confirms its SDK excerpt and submits the frozen head and global turn', async () => {
  const calls: Array<{ channel: string; input: unknown }> = [];
  const selector = {
    kind: 'item' as const,
    source: 'history' as const,
    itemId: 'opaque-row',
    revision: 'page',
  };
  const session = { sessionId: 's', surface: 'code', provider: 'live' } as SessionMeta;
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      kodaxSpace: {
        invoke: async (channel: string, input: unknown) => {
          calls.push({ channel, input });
          return channel === 'session.resolveHistoryTurn'
            ? {
                ok: true,
                data: {
                  status: 'ready',
                  excerpt: 'Question forty-one',
                  turnIndex: 40,
                  hasLaterTurn: true,
                  historyBoundary: { entryId: 'tail', sourceRevision: 'snapshot' },
                  expectedHead: 'seen-head',
                  activeRunId: null,
                },
              }
            : { ok: true, data: { ok: false, reason: 'target_changed' } };
        },
      },
    },
  });
  try {
    const pending = performHistoryTurnAction(session, 'rewind', selector, (key, vars) =>
      String(vars?.excerpt ?? key),
    );
    await new Promise((resolve) => setImmediate(resolve));
    const confirm = useConfirmStore.getState().current;
    assert.ok(confirm);
    assert.equal(confirm.message, 'Question forty-one');
    assert.equal(calls.length, 1);
    useConfirmStore.getState().settle(confirm.id, true);
    await pending;
    assert.deepEqual(calls[1], {
      channel: 'session.rewind',
      input: {
        sessionId: 's',
        rewindPastTurnIdx: 40,
        historyBoundary: { boundaryId: 'tail', sourceRevision: 'snapshot' },
        confirmedTurn: { selector, expectedHead: 'seen-head', activeRunId: null },
      },
    });
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('fork installs the SDK child without inheriting unrelated source counts or a page-local buffer', async () => {
  const session: SessionMeta = {
    sessionId: 'parent',
    projectRoot: '/proj',
    surface: 'code',
    provider: 'test',
    agentMode: 'sa',
    reasoningMode: 'auto',
    permissionMode: 'full-access',
    createdAt: 1,
    lastActivityAt: 2,
    title: 'Questions',
    msgCount: 200,
  };
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const before = useAppStore.getState();
  useAppStore.setState({
    userMessagesBySession: { parent: [{ id: 'wrong', content: 'Wrong branch', sentAt: 7 }] },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      kodaxSpace: {
        invoke: async (channel: string) =>
          channel === 'session.resolveHistoryTurn'
            ? {
                ok: true,
                data: {
                  status: 'ready',
                  turnIndex: 40,
                  expectedHead: 'head',
                  activeRunId: null,
                  hasLaterTurn: true,
                  excerpt: 'Question 41',
                  historyBoundary: { entryId: 'tail', sourceRevision: 's' },
                },
              }
            : { ok: true, data: { newSessionId: 'verified-child', createdAt: 18 } },
      },
    },
  });
  try {
    await performHistoryTurnAction(session, 'fork', { kind: 'index', index: 40 }, (key) => key);
    const after = useAppStore.getState();
    const child = after.sessions.find((meta) => meta.sessionId === 'verified-child');
    assert.equal(child?.forkPointTurnIdx, 40);
    assert.equal(child?.msgCount, undefined);
    assert.equal(after.userMessagesBySession['verified-child'], undefined);
  } finally {
    useAppStore.setState(before);
    if (saved) Object.defineProperty(globalThis, 'window', saved);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('command turn selectors keep zero-based indices and reject ambiguous input', () => {
  assert.deepEqual(commandHistoryTurnSelector([], 'fork'), { kind: 'latest' });
  assert.deepEqual(commandHistoryTurnSelector([], 'rewind'), { kind: 'previous' });
  assert.deepEqual(commandHistoryTurnSelector(['0'], 'rewind'), { kind: 'index', index: 0 });
  for (const args of [['name'], ['1', '2'], ['-1'], ['10000001']])
    assert.equal(commandHistoryTurnSelector(args, 'fork'), undefined);
});

test('a delayed target cannot open a rewind dialog after switching away and back', async () => {
  const before = useAppStore.getState();
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const requests: string[] = [];
  let deliver!: () => void;
  const gate = new Promise<void>((resolve) => {
    deliver = resolve;
  });
  useAppStore.setState({ currentSessionId: 's' });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      kodaxSpace: {
        invoke: async (channel: string) => {
          requests.push(channel);
          await gate;
          return {
            ok: true,
            data: {
              status: 'ready',
              hasLaterTurn: true,
              excerpt: 'Obsolete question',
              turnIndex: 1,
              historyBoundary: { entryId: 'old', sourceRevision: 'r' },
              activeRunId: null,
              expectedHead: 'head',
            },
          };
        },
      },
    },
  });
  try {
    const pending = performHistoryTurnAction(
      { sessionId: 's', surface: 'code' } as SessionMeta,
      'rewind',
      { kind: 'previous' },
      (key) => key,
    );
    useAppStore.setState({ currentSessionId: 'other' });
    useAppStore.setState({ currentSessionId: 's' });
    deliver();
    await pending;
    assert.equal(useConfirmStore.getState().current, null);
    assert.deepEqual(requests, ['session.resolveHistoryTurn']);
  } finally {
    useAppStore.setState(before);
    if (saved) Object.defineProperty(globalThis, 'window', saved);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
