import assert from 'node:assert/strict';
import test from 'node:test';
import {
  insertIndexFor,
  moveItem,
  settleOffset,
  siblingShift,
  type SortSlot,
} from './sortPreview.js';

// 三个块: A(0..30) B(30..130, 展开态更高) C(130..160)
const slots: readonly SortSlot[] = [
  { top: 0, pitch: 30 },
  { top: 30, pitch: 100 },
  { top: 130, pitch: 30 },
];

test('insertIndexFor keeps the source slot until the pointer passes a neighbor midpoint', () => {
  assert.equal(insertIndexFor(slots, 0, 10), 0);
  assert.equal(insertIndexFor(slots, 0, 79), 0);
  assert.equal(insertIndexFor(slots, 0, 81), 1);
  assert.equal(insertIndexFor(slots, 0, 150), 2);
  assert.equal(insertIndexFor(slots, 2, 140), 2);
  assert.equal(insertIndexFor(slots, 2, 70), 1);
  assert.equal(insertIndexFor(slots, 2, -20), 0);
});

test('siblingShift moves only the items between source and target, by the source pitch', () => {
  // 0 拖到 2: 1、2 上移
  assert.deepEqual(
    [0, 1, 2].map((i) => siblingShift(i, 0, 2, 30)),
    [0, -30, -30],
  );
  // 2 拖到 0: 0、1 下移
  assert.deepEqual(
    [0, 1, 2].map((i) => siblingShift(i, 2, 0, 30)),
    [30, 30, 0],
  );
  assert.deepEqual(
    [0, 1, 2].map((i) => siblingShift(i, 1, 1, 100)),
    [0, 0, 0],
  );
});

test('settleOffset is the distance from the source slot to its preview slot', () => {
  assert.equal(settleOffset(slots, 0, 2), 130);
  assert.equal(settleOffset(slots, 2, 0), -130);
  assert.equal(settleOffset(slots, 1, 0), -30);
  assert.equal(settleOffset(slots, 1, 1), 0);
});

test('moveItem places the item at the final index, including the tail', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c']);
});
