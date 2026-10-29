import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requiresTests, assertGate } from '../ci-changes.mjs';

test('only research notes may skip heavy checks; product Markdown still runs', () => {
  assert.equal(requiresTests(['docs/research/note.md', 'docs/research/timings.json']), false);
  for (const files of [
    [],
    ['README.md'],
    ['docs/USER_MANUAL.zh-CN.md'],
    ['resources/builtin-skills/example/SKILL.md'],
    ['docs/research/script.mjs'],
    ['docs/research/note.md', 'package-lock.json'],
  ])
    assert.equal(requiresTests(files), true);
});

test('summary gates allow only the explicit documentation skip, never failed or cancelled jobs', () => {
  const changes = { result: 'success', outputs: { run_tests: 'false' } };
  assert.doesNotThrow(() => assertGate({ changes, test: { result: 'skipped' } }));
  for (const result of ['failure', 'cancelled']) {
    assert.throws(() => assertGate({ changes, test: { result } }), /gate/);
  }
  assert.throws(
    () =>
      assertGate({
        changes: { ...changes, outputs: { run_tests: 'true' } },
        test: { result: 'skipped' },
      }),
    /gate/,
  );
  assert.throws(
    () => assertGate({ changes: { result: 'failure' }, test: { result: 'skipped' } }),
    /gate/,
  );
});
