import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionEvent } from '@kodax-space/space-ipc-schema';
import { messages, type MessageKey } from '../i18n/messages.js';
import { activityStatusKind, activityStatusText, runTokenTotals } from './activityStatus.js';

const zh = (key: MessageKey, vars?: Record<string, string | number>): string =>
  Object.entries(vars ?? {}).reduce<string>(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    messages['zh-CN'][key],
  );

test('every Runtime phase status reads in the UI language', () => {
  for (const status of [
    'Queued…',
    'Waiting for permission…',
    'Waiting for input…',
    'Waiting for agents…',
    'Recovering…',
    'Stopping and repairing run state…',
    'Finalizing…',
    'Waiting for Space…',
    'Working…',
    'Stopping…',
    'Waiting for context capacity…',
  ]) {
    const text = activityStatusText(status, false, zh);
    assert.notEqual(text, status, status);
    // Product names stay as they are.
    assert.doesNotMatch(text.replace(/Agent|Space/g, ''), /[A-Za-z]{3,}/, status);
  }
  assert.equal(
    activityStatusText('Waiting for 3 agents…', false, zh),
    zh('activity.waitingAgentCount', { count: 3 }),
  );
  assert.equal(
    activityStatusText('Waiting for 1 agent…', false, zh),
    zh('activity.waitingAgentCount', { count: 1 }),
  );
  assert.equal(
    activityStatusText('Running bash…', false, zh),
    zh('activity.runningTool', { tool: 'bash' }),
  );
  // A todo's own wording is shown as written.
  assert.equal(activityStatusText('调研三个上游仓库源码…', false, zh), '调研三个上游仓库源码…');
});

test('statuses split into work the live group already shows, run phases and task labels', () => {
  for (const status of [
    'Thinking…',
    'Writing…',
    'Working…',
    'Processing result…',
    'Running bash…',
    'Receiving edit…',
  ])
    assert.equal(activityStatusKind(status), 'work', status);
  for (const status of [
    'Sending…',
    'Queued…',
    'Waiting for permission…',
    'Waiting for 2 agents…',
    'Compacting context…',
    'Stopping…',
    'Verifying…',
  ])
    assert.equal(activityStatusKind(status), 'phase', status);
  assert.equal(activityStatusKind('调研三个上游仓库源码…'), 'task');
});

test('run tokens add up every root step of the active Run, input with cache, output alone', () => {
  const end = (
    runId: string,
    usage: Record<string, number> | undefined,
    extra: Record<string, unknown> = {},
  ): SessionEvent =>
    ({
      kind: 'iteration_end',
      sessionId: 's',
      iter: 1,
      maxIter: 0,
      tokenCount: 999,
      ...(usage ? { usage } : {}),
      runtimeEvent: { runtimeId: 'rt', runId, seq: 1, journalEpoch: 'e' },
      ...extra,
    }) as SessionEvent;
  const events: SessionEvent[] = [
    { kind: 'session_start', sessionId: 's', provider: 'p' } as SessionEvent,
    end('old', { inputTokens: 50_000, outputTokens: 9_000 }),
    { kind: 'session_start', sessionId: 's', provider: 'p' } as SessionEvent,
    end('run', {
      inputTokens: 1_000,
      cacheReadInputTokens: 9_000,
      cacheWriteInputTokens: 500,
      outputTokens: 300,
    }),
    end('run', { inputTokens: 200, outputTokens: 100 }, { contextKind: 'child' }),
    end('run', undefined),
    end('run', { inputTokens: 2_000, outputTokens: 700 }),
  ];
  assert.deepEqual(runTokenTotals(events, 'run'), { up: 12_500, down: 1_000 });
  assert.equal(runTokenTotals(events, 'missing'), undefined);
});
