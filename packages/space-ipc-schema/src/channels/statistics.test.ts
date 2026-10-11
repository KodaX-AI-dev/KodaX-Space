import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionExecutionFactsChannel, spaceSessionStatisticsSchema } from './statistics.js';

test('statistics retain partial coverage and reject malformed cumulative usage', () => {
  const summary = {
    runtimeId: 'host',
    sessionId: 's',
    revision: 1,
    coverage: 'partial',
    issues: ['usage missing'],
    requestCount: 1,
    requestsWithoutUsage: 1,
    physicalRequestCount: 0,
    operationCount: 1,
    contexts: [],
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thoughtTokens: 0,
    },
  };
  assert.equal(spaceSessionStatisticsSchema.parse(summary).coverage, 'partial');
  assert.equal(
    spaceSessionStatisticsSchema.safeParse({
      ...summary,
      usage: { ...summary.usage, inputTokens: -1 },
    }).success,
    false,
  );
});

test('request facts retain physical retry identity and strip unsupported payload fields', () => {
  const page = sessionExecutionFactsChannel.output.parse({
    kind: 'requests',
    runtimeId: 'host',
    sessionId: 's',
    revision: 2,
    items: [
      {
        requestId: 'physical-2',
        logicalRequestId: 'logical',
        sessionId: 's',
        runtimeId: 'host',
        revision: 2,
        target: {
          kind: 'actor_turn',
          actorPath: '/root/child',
          turnId: 'turn',
          parentRunId: 'root',
        },
        provider: 'p',
        purpose: 'fallback',
        attempt: 2,
        boundary: 'physical_attempt',
        dispatch: 'dispatched',
        state: 'succeeded',
        startedAt: '2026-10-11T00:00:00Z',
        fallback: true,
        previousRequestId: 'physical-1',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        rawRequestBody: 'not an IPC field',
      },
    ],
  });
  assert.ok(page.kind === 'requests');
  assert.equal(page.items[0]?.previousRequestId, 'physical-1');
  assert.equal('rawRequestBody' in page.items[0]!, false);
});
