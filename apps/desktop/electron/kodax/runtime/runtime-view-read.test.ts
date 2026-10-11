import assert from 'node:assert/strict';
import test from 'node:test';
import { readRuntimeSessionView, readRuntimeViewText } from './runtime-view-read.js';
import { viewReader } from './runtime-view-test-fixture.js';

test('view reads close their subscription and reject a foreign Session', async () => {
  const service = viewReader([], 'other');
  let closed = false;
  const observe = service.observeView;
  service.observeView = async (...args) => ({
    ...(await observe(...args)),
    close() {
      closed = true;
    },
  });
  await assert.rejects(readRuntimeSessionView(service, 's'), /complete current Session/);
  assert.equal(closed, true);
});

test('full item reads replace previews and reject revisions, short bodies and nonadvancing offsets', async () => {
  const item = {
    id: 'item',
    type: 'assistant' as const,
    text: 'abcdef',
    totalTextLength: 6,
    textRevision: 2,
  };
  const service = viewReader([item]);
  const preview = { ...item, text: 'ef', textOffset: 4 };
  assert.equal(await readRuntimeViewText(service, 's', preview), 'abcdef');
  const read = service.readViewItem;
  for (const mutation of [
    { textRevision: 3 },
    { text: 'abc' },
    { nextOffset: 0 },
    { totalLength: 7 },
  ]) {
    service.readViewItem = async (...args) => {
      const content = await read(...args);
      assert.ok(content);
      return { ...content, ...mutation };
    };
    await assert.rejects(
      readRuntimeViewText(service, 's', preview),
      /changed|declared length|advance/,
    );
  }
});

test('inline and chunked reads enforce the recovery limit', async () => {
  const item = {
    id: 'item',
    type: 'assistant' as const,
    text: '',
    totalTextLength: 17 * 1024 * 1024,
  };
  await assert.rejects(readRuntimeViewText(viewReader([item]), 's', item), /read limit/);
});

test('a timed-out view attachment closes a late subscription', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const service = viewReader([]);
  let release!: (value: { close(): void }) => void;
  let closed = false;
  service.observeView = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = readRuntimeSessionView(service, 's');
  t.mock.timers.tick(5_001);
  await assert.rejects(pending, /timed out/);
  release({
    close() {
      closed = true;
    },
  });
  await Promise.resolve();
  assert.equal(closed, true);
});
