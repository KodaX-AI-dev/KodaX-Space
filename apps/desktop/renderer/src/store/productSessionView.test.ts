import assert from 'node:assert/strict';
import test from 'node:test';
import { useAppStore } from './appStore.js';
import {
  productTranscriptSnapshot,
  replaceProductSessionView,
  resetProductSessionViews,
  installProductHistory,
  installProductItemContent,
} from './productSessionView.js';

test('removing a session releases its SDK transcript and full bodies', () => {
  resetProductSessionViews();
  replaceProductSessionView({
    sessionId: 'removed',
    runtimeId: 'rt',
    revision: 1,
    items: [{ id: 'output', type: 'assistant', text: 'answer' }],
  });
  useAppStore.getState().removeSession('removed');
  assert.equal(productTranscriptSnapshot('removed'), undefined);
});

test('SDK current views replace the display even when persisted text differs and turnId is absent', () => {
  resetProductSessionViews();
  replaceProductSessionView({
    sessionId: 'session',
    runtimeId: 'runtime',
    revision: 1,
    items: [
      { id: 'input', type: 'user', inputId: 'accepted', text: 'prompt' },
      {
        id: 'output',
        type: 'assistant',
        outputId: 'response',
        outputState: 'draft',
        text: 'partial',
      },
    ],
  });
  replaceProductSessionView({
    sessionId: 'session',
    runtimeId: 'runtime',
    revision: 2,
    items: [
      { id: 'input', type: 'user', inputId: 'accepted', text: 'prompt\nattached paths' },
      {
        id: 'output',
        type: 'assistant',
        outputId: 'response',
        outputState: 'committed',
        text: 'complete',
      },
    ],
  });
  assert.deepEqual(
    productTranscriptSnapshot('session')?.items.map((item) => item.id),
    ['input', 'output'],
  );
  assert.equal(productTranscriptSnapshot('session')?.items[1]?.text, 'complete');
});

test('an older SDK history window stays frozen while the current view advances', () => {
  resetProductSessionViews();
  installProductHistory('session', [{ id: 'old', type: 'user', text: 'old' }], true);
  replaceProductSessionView({
    sessionId: 'session',
    runtimeId: 'runtime',
    revision: 1,
    items: [{ id: 'new', type: 'user', text: 'new' }],
  });
  assert.deepEqual(
    productTranscriptSnapshot('session')?.items.map((item) => item.id),
    ['old'],
  );
  installProductHistory('session', [], false);
  assert.deepEqual(
    productTranscriptSnapshot('session')?.items.map((item) => item.id),
    ['new'],
  );
});

test('distinct SDK items with identical text remain distinct and a late snapshot cannot roll back the view', () => {
  resetProductSessionViews();
  replaceProductSessionView({
    sessionId: 'session',
    runtimeId: 'runtime',
    revision: 2,
    items: [
      { id: 'input-1', type: 'user', inputId: 'intent-1', text: 'again' },
      { id: 'input-2', type: 'user', inputId: 'intent-2', text: 'again' },
    ],
  });
  replaceProductSessionView({ sessionId: 'session', runtimeId: 'runtime', revision: 1, items: [] });
  assert.equal(productTranscriptSnapshot('session')?.items.length, 2);
});

test('a completed body read survives later bounded views of the same immutable output', () => {
  resetProductSessionViews();
  const item = {
    id: 'output',
    type: 'assistant' as const,
    text: 'tail',
    textOffset: 4,
    totalTextLength: 8,
    outputState: 'committed' as const,
    textRevision: 0,
  };
  replaceProductSessionView({
    sessionId: 'session',
    runtimeId: 'runtime',
    revision: 1,
    items: [item],
  });
  installProductItemContent('session', item, 'text', 'headtail');
  replaceProductSessionView({
    sessionId: 'session',
    runtimeId: 'runtime',
    revision: 2,
    items: [item],
  });
  assert.equal(productTranscriptSnapshot('session')?.items[0]?.text, 'headtail');
  replaceProductSessionView({
    sessionId: 'session',
    runtimeId: 'runtime',
    revision: 3,
    items: [{ ...item, outputState: 'draft', textRevision: 1 }],
  });
  assert.equal(productTranscriptSnapshot('session')?.items[0]?.text, 'tail');
});

test('tool input completion stays in its frozen history window and late removed body replies are ignored', () => {
  resetProductSessionViews();
  const item = {
    id: 'tool-ref',
    type: 'tool' as const,
    text: 'receipt',
    tool: {
      callId: 'call',
      name: 'write',
      status: 'success' as const,
      inputText: '{',
      totalInputLength: 4,
    },
  };
  installProductHistory('session', [item], true);
  installProductItemContent('session', item, 'input', '{}{}');
  assert.equal(productTranscriptSnapshot('session')?.items[0]?.tool?.inputText, '{}{}');
  installProductHistory('session', [], true);
  installProductItemContent('session', item, 'input', 'late');
  assert.deepEqual(productTranscriptSnapshot('session')?.items, []);
  resetProductSessionViews('session');
  assert.equal(productTranscriptSnapshot('session'), undefined);
});
