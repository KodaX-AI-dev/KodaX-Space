import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONTEXT_CAP,
  getModelContextCap,
} from '../../renderer/src/shell/modelContextCaps.js';

test('GLM fallback caps track KodaX 0.7.96 provider capabilities', () => {
  assert.equal(getModelContextCap('glm-5.3'), 1_000_000);
  assert.equal(getModelContextCap('glm-5.3-flash'), 1_000_000);
  assert.equal(getModelContextCap('glm-5.2'), 1_000_000);
  assert.equal(getModelContextCap('glm-5'), 200_000);
  assert.equal(getModelContextCap('glm-5.1'), 200_000);
  assert.equal(getModelContextCap('glm-5-turbo'), 200_000);
  assert.equal(getModelContextCap('glm-4.7'), 200_000);
});

test('Kimi K2 fallback caps track KodaX 0.7.58 provider capabilities (256k)', () => {
  assert.equal(getModelContextCap('kimi-k2.7-code'), 256_000);
  assert.equal(getModelContextCap('kimi-k2.6'), 256_000);
});

test('Kimi K3 fallback caps track KodaX 0.7.77 public and Coding routes', () => {
  // Ark Coding serves kimi-k3 with 1,024,000; a model-only fallback takes the smaller route.
  assert.equal(getModelContextCap('kimi-k3'), 1_024_000);
  assert.equal(getModelContextCap('k3'), 1_048_576);
  assert.equal(getModelContextCap('k3-256k'), 262_144);
});

test('unknown and empty models use conservative default cap', () => {
  assert.equal(getModelContextCap('unknown-model'), DEFAULT_CONTEXT_CAP);
  assert.equal(getModelContextCap(undefined), DEFAULT_CONTEXT_CAP);
});

// Regression: the fallback table must NEVER over-claim vs the SDK 0.7.58 truth
// (over-claiming tells the user they have room they don't have -> surprise compaction).
test('fallback caps do not over-claim vs SDK 0.7.58 per-model context windows', () => {
  // over-claim cases the old table got wrong:
  assert.equal(getModelContextCap('gpt-5.3-codex-spark'), 400_000); // was 1M (over)
  assert.equal(getModelContextCap('deepseek-v3.2'), 128_000); // was 1M (over)
  assert.equal(getModelContextCap('MiniMax-M2.7'), 204_800); // was 1M (over)
  assert.equal(getModelContextCap('MiniMax-M2.7-highspeed'), 204_800); // was 1M (over)
  // neighbors that ARE 1M must stay 1M (rule ordering sanity):
  assert.equal(getModelContextCap('deepseek-v4-pro'), 1_000_000);
  assert.equal(getModelContextCap('MiniMax-M3'), 1_000_000);
});

test('fallback caps track SDK 0.7.58 for flagship / previously-stale models', () => {
  assert.equal(getModelContextCap('claude-opus-4-8'), 1_000_000);
  assert.equal(getModelContextCap('claude-opus-4-7'), 1_000_000);
  assert.equal(getModelContextCap('claude-haiku-4-5'), 200_000);
  assert.equal(getModelContextCap('mimo-v2.5-pro'), 1_000_000); // was 128k (under)
});

test('fallback caps never over-claim any SDK beta.9 builtin model route', async () => {
  const llm = await import('@kodax-ai/kodax/llm');
  const smallest = new Map<string, number>();
  for (const [provider, snapshot] of Object.entries(llm.KODAX_PROVIDER_SNAPSHOTS)) {
    if (snapshot?.capabilityProfile.transport === 'cli-bridge') continue;
    for (const model of llm.getProviderModels(provider)) {
      const limit = llm.resolveModelCapabilities(provider, model)?.contextWindow;
      if (limit) smallest.set(model, Math.min(limit, smallest.get(model) ?? limit));
    }
  }
  assert.ok(smallest.size > 50);
  const overClaims = [...smallest].filter(([model, limit]) => getModelContextCap(model) > limit);
  assert.deepEqual(overClaims, []);
});

test('fallback caps track SDK beta.9 flagship windows', () => {
  for (const model of [
    'claude-opus-5-5',
    'claude-sonnet-5-5',
    'claude-haiku-5-5',
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'qwen3.8-max',
    'qwen3.6-flash',
  ]) {
    assert.equal(getModelContextCap(model), 1_000_000, model);
  }
  assert.equal(getModelContextCap('gpt-5.4'), 1_050_000);
  assert.equal(getModelContextCap('kimi-k3.1-pro'), 1_024_000);
  assert.equal(getModelContextCap('k3.1-pro-highspeed'), 1_048_576);
  assert.equal(getModelContextCap('qwen3.5-plus'), 256_000);
});
