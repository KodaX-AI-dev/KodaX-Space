import assert from 'node:assert/strict';
import test from 'node:test';
import { productStreamingProgress } from './productStreaming.js';

test('Host streaming estimates stay distinct from character counts, usage and other Runs', () => {
  const thinking = {
    runId: 'r',
    streaming: {
      kind: 'thinking' as const,
      providerRequestId: 'p',
      itemId: 'i',
      charCount: 900,
      estimatedTokenCount: 71,
    },
  };
  assert.deepEqual(productStreamingProgress(thinking, 'r'), {
    status: 'Thinking…',
    thinkingTokens: 71,
  });
  assert.equal(productStreamingProgress(thinking, 'another'), undefined);
  assert.deepEqual(
    productStreamingProgress(
      { ...thinking, streaming: { ...thinking.streaming, estimatedTokenCount: undefined } },
      'r',
    ),
    { status: 'Thinking…', thinkingTokens: undefined },
  );
  assert.deepEqual(
    productStreamingProgress(
      {
        runId: 'r',
        streaming: {
          kind: 'tool-input',
          providerRequestId: 'p',
          toolName: 'bash',
          callId: 'c',
          charCount: 500,
          estimatedTokenCount: 42,
        },
      },
      'r',
    ),
    { status: 'Receiving bash…', toolInputTokens: 42 },
  );
  assert.deepEqual(
    productStreamingProgress(
      {
        runId: 'r',
        streaming: {
          kind: 'tool-input',
          providerRequestId: 'p',
          toolName: 'bash',
          estimatedTokenCount: 42,
        },
      },
      'r',
    ),
    { status: 'Receiving bash…', toolInputTokens: undefined },
  );
});
