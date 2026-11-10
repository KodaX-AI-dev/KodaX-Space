import assert from 'node:assert/strict';
import test from 'node:test';
import { computeTranscriptWindow, type WindowPart, type WindowRow } from './transcriptWindow.js';

const GAP = 12;
const rows = (count: number, estimate = 88, kind = 'message'): WindowRow[] =>
  Array.from({ length: count }, (_, index) => ({ id: `r${index}`, kind, estimate }));

function windowFor(
  list: readonly WindowRow[],
  overrides: Partial<Parameters<typeof computeTranscriptWindow>[0]> = {},
): WindowPart[] {
  return computeTranscriptWindow({
    rows: list,
    measured: new Map(),
    gap: GAP,
    scrollTop: 0,
    viewportHeight: 1000,
    overscanBefore: 1000,
    overscanAfter: 1000,
    pinned: new Set(),
    ...overrides,
  });
}

// A spacer stands for the rows it replaces, including the gaps between them.
function layoutHeight(parts: readonly WindowPart[], list: readonly WindowRow[]): number {
  return parts.reduce(
    (total, part) =>
      total +
      (part.kind === 'spacer'
        ? part.height + GAP
        : list.slice(part.start, part.end).reduce((sum, row) => sum + row.estimate + GAP, 0)),
    0,
  );
}

test('a short transcript mounts every row without spacers', () => {
  assert.deepEqual(windowFor(rows(5)), [{ kind: 'rows', start: 0, end: 5 }]);
  assert.deepEqual(windowFor([]), []);
});

test('a long transcript mounts the viewport plus pixel overscan and keeps the total height', () => {
  const list = rows(1000); // 100 px per row with its gap
  const parts = windowFor(list, { scrollTop: 50_000, overscanAfter: 2000 });
  assert.deepEqual(parts, [
    { kind: 'spacer', start: 0, end: 490, height: 490 * 100 - GAP },
    { kind: 'rows', start: 490, end: 530 },
    { kind: 'spacer', start: 530, end: 1000, height: 470 * 100 - GAP },
  ]);
  assert.equal(layoutHeight(parts, list), 1000 * 100);
});

test('the window is edge-true: no spacer at an end the window reaches', () => {
  const list = rows(1000);
  assert.deepEqual(windowFor(list)[0], { kind: 'rows', start: 0, end: 20 });
  const bottom = windowFor(list, { scrollTop: 1000 * 100 - 1000 });
  assert.deepEqual(bottom.at(-1), { kind: 'rows', start: 980, end: 1000 });
});

test('measured heights win, and a kind calibrates the estimates of its unmeasured rows', () => {
  const list = [...rows(4, 88, 'message'), ...rows(4, 34, 'receipts')].map((row, index) => ({
    ...row,
    id: `r${index}`,
  }));
  // r0 measures twice its estimate, so other unmeasured messages are scaled ×2; receipts are not.
  const parts = windowFor(list, {
    measured: new Map([['r0', 176]]),
    scrollTop: 188 + 176 * 3 + GAP * 4,
    viewportHeight: 10,
    overscanBefore: 0,
    overscanAfter: 0,
  });
  assert.deepEqual(parts, [
    { kind: 'spacer', start: 0, end: 4, height: (176 + GAP) * 4 - GAP },
    { kind: 'rows', start: 4, end: 5 },
    { kind: 'spacer', start: 5, end: 8, height: (34 + GAP) * 3 - GAP },
  ]);
});

test('pinned rows stay mounted outside the window, merging with neighbouring runs', () => {
  const list = rows(1000);
  const parts = windowFor(list, {
    scrollTop: 50_000,
    overscanBefore: 0,
    overscanAfter: 0,
    pinned: new Set(['r2', 'r510', 'r999']),
  });
  assert.deepEqual(
    parts.map((part) => [part.kind, part.start, part.end]),
    [
      ['spacer', 0, 2],
      ['rows', 2, 3],
      ['spacer', 3, 500],
      ['rows', 500, 511],
      ['spacer', 511, 999],
      ['rows', 999, 1000],
    ],
  );
  assert.equal(layoutHeight(parts, list), 1000 * 100);
});
