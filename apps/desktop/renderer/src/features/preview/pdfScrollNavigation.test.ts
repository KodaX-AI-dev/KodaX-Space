import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pdfScrollTopForPage } from './pdfScrollNavigation.js';

const base = { clientHeight: 600, scrollHeight: 5000, margin: 16 } as const;

test('scrolls backward to a page above the viewport', () => {
  assert.equal(pdfScrollTopForPage({ ...base, scrollTop: 3000, pageOffsetInViewport: -800 }), 2184);
});

test('scrolls forward to a page below the viewport', () => {
  assert.equal(pdfScrollTopForPage({ ...base, scrollTop: 1000, pageOffsetInViewport: 700 }), 1684);
});

test('clamps to the top of the document', () => {
  assert.equal(pdfScrollTopForPage({ ...base, scrollTop: 10, pageOffsetInViewport: 0 }), 0);
});

test('clamps to the bottom of the document', () => {
  assert.equal(pdfScrollTopForPage({ ...base, scrollTop: 4300, pageOffsetInViewport: 500 }), 4400);
});
