import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestFileNameMatches } from './path-match.js';

test('a link that dropped or added a folder finds the file by name', () => {
  assert.deepEqual(
    bestFileNameMatches('标书审查/报告.xlsx', ['docs/标书审查/报告.xlsx', 'other/x.xlsx']),
    ['docs/标书审查/报告.xlsx'],
  );
  assert.deepEqual(bestFileNameMatches('wrong/dir/报告.xlsx', ['a/报告.xlsx']), ['a/报告.xlsx']);
});

test('the candidate sharing the longest path tail wins among same-named files', () => {
  assert.deepEqual(
    bestFileNameMatches('标书审查/报告.xlsx', ['a/报告.xlsx', 'b/标书审查/报告.xlsx']),
    ['b/标书审查/报告.xlsx'],
  );
});

test('a link missing the separator before the file name still matches', () => {
  assert.deepEqual(
    bestFileNameMatches('标书审查报告.xlsx', ['kodax/标书审查/报告.xlsx', '报告.xlsx']),
    ['kodax/标书审查/报告.xlsx'],
  );
});

test('a different file whose name merely ends the same is not a match', () => {
  assert.deepEqual(bestFileNameMatches('年度报告.xlsx', ['报告.xlsx', 'a/度报告.xlsx']), []);
});

test('separators and case are normalized and the original candidate is returned', () => {
  assert.deepEqual(bestFileNameMatches('Reports\\Brief.MD', ['x/reports/brief.md']), [
    'x/reports/brief.md',
  ]);
});

test('an equal tie returns every tied candidate once so callers do not guess', () => {
  assert.deepEqual(
    bestFileNameMatches('报告.xlsx', ['a/报告.xlsx', 'b/报告.xlsx', 'a/报告.xlsx']),
    ['a/报告.xlsx', 'b/报告.xlsx'],
  );
  assert.deepEqual(bestFileNameMatches('报告.xlsx', []), []);
});
