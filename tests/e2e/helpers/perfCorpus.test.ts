// Pure helper checks for the F144 baseline; no Electron launch, so they stay in the default suite.
import { expect, test } from '@playwright/test';
import type { KodaXMessage } from '@kodax-ai/kodax/agent';
import { buildPerfCorpus, createRandom } from './perfCorpus.js';
import { percentile, summarize } from './perfStats.js';

function blocks(message: KodaXMessage) {
  return typeof message.content === 'string' ? [] : message.content;
}

test('the same seed writes the same corpus and another seed does not', () => {
  const first = buildPerfCorpus({ turns: 120, seed: 7 });
  expect(buildPerfCorpus({ turns: 120, seed: 7 })).toEqual(first);
  expect(buildPerfCorpus({ turns: 120, seed: 8 })).not.toEqual(first);
  expect([createRandom(1)(), createRandom(1)()]).toEqual([0.6270739405881613, 0.6270739405881613]);
});

test('every turn has one marked question and one marked answer', () => {
  const messages = buildPerfCorpus({ turns: 300, seed: 3 });
  const questions = messages.filter(
    (message) => typeof message.content === 'string' && message.content.startsWith('PERF_Q_'),
  );
  const answers = messages.filter((message) =>
    blocks(message).some((block) => block.type === 'text' && block.text.startsWith('PERF_A_')),
  );
  expect(questions).toHaveLength(300);
  expect(answers).toHaveLength(300);
  expect(new Set(answers.map((message) => message.outputId)).size).toBe(300);
});

test('the corpus mixes all turn shapes and pairs every tool call with one result', () => {
  const messages = buildPerfCorpus({ turns: 400, seed: 11 });
  const all = messages.flatMap(blocks);
  const uses = all.filter((block) => block.type === 'tool_use');
  const results = all.filter((block) => block.type === 'tool_result');
  expect(new Set(uses.map((block) => block.name))).toEqual(
    new Set(['bash', 'read', 'edit', 'grep']),
  );
  expect(results.map((block) => block.tool_use_id).sort()).toEqual(
    uses.map((block) => block.id).sort(),
  );
  expect(all.some((block) => block.type === 'thinking')).toBe(true);
  expect(all.some((block) => block.type === 'text' && block.text.includes('```ts'))).toBe(true);
  expect(all.some((block) => block.type === 'text' && block.text.includes('| --- |'))).toBe(true);
});

test('giant body and giant tool turn are placed once at the requested turn', () => {
  const messages = buildPerfCorpus({
    turns: 50,
    seed: 5,
    giantAt: 20,
    giantBodyChars: 200_000,
    giantToolCalls: 120,
  });
  const giantText = messages
    .flatMap(blocks)
    .filter((block) => block.type === 'text' && block.text.includes('PERF_GIANT_BODY_END'));
  expect(giantText).toHaveLength(1);
  expect(giantText[0]!.type === 'text' && giantText[0]!.text.length).toBeGreaterThanOrEqual(
    200_000,
  );
  const giantRound = messages.find((message) => blocks(message).length > 100);
  expect(blocks(giantRound!).filter((block) => block.type === 'tool_use')).toHaveLength(120);
  const order = messages
    .filter((message) => typeof message.content === 'string')
    .map((message) => message.content as string);
  expect(order[20]).toBe('PERF_Q_20 giant-body');
  expect(order[21]).toBe('PERF_Q_21 giant-tool');
});

test('percentiles use nearest rank and summaries round to one decimal', () => {
  const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
  expect(percentile(values, 50)).toBe(5);
  expect(percentile(values, 95)).toBe(10);
  expect(percentile([42], 50)).toBe(42);
  expect(summarize([1, 2, 2.25])).toEqual({ n: 3, p50: 2, p95: 2.3, max: 2.3, mean: 1.8 });
  expect(summarize([])).toBeNull();
  expect(() => percentile([], 50)).toThrow();
});
