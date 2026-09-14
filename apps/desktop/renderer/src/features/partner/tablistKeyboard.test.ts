import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTabIndex } from './tablistKeyboard.js';

test('tablist keyboard navigation wraps and supports Home/End', () => {
  assert.equal(nextTabIndex(0, 3, 'ArrowRight'), 1);
  assert.equal(nextTabIndex(2, 3, 'ArrowRight'), 0);
  assert.equal(nextTabIndex(0, 3, 'ArrowLeft'), 2);
  assert.equal(nextTabIndex(1, 3, 'Home'), 0);
  assert.equal(nextTabIndex(1, 3, 'End'), 2);
  assert.equal(nextTabIndex(-1, 3, 'ArrowRight'), null);
});
