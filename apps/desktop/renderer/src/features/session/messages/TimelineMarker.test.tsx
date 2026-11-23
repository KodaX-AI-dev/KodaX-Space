import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../../i18n/I18nProvider.js';
import { LocalNoticeBubble } from './bubbles.js';
import {
  CompactingMarker,
  compactTokenCount,
  isSdkMarkerNotice,
  LocalNoticeMarkerView,
  SdkNoticeMarker,
} from './TimelineMarker.js';

function render(node: ReactNode): string {
  const original = Object.getOwnPropertyDescriptor(navigator, 'languages');
  Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true });
  try {
    return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
  } finally {
    if (original) Object.defineProperty(navigator, 'languages', original);
    else delete (navigator as { languages?: readonly string[] }).languages;
  }
}

test('token counts read at a glance', () => {
  assert.equal(compactTokenCount(950), '950');
  assert.equal(compactTokenCount(31_402), '31.4k');
  assert.equal(compactTokenCount(142_318), '142k');
  assert.equal(compactTokenCount(1_200_000), '1.2M');
});

test('a compaction in progress is a live status pill whose label carries the sweep', () => {
  const markup = render(<CompactingMarker label="Compacting context…" elapsed="12s" />);
  assert.match(markup, /role="status"/);
  assert.match(markup, /data-testid="timeline-marker-live"/);
  assert.doesNotMatch(markup, /data-testid="system-notice"/);
  assert.match(markup, /class="[^"]*text-sweep text-sweep--run[^"]*">Compacting context…</);
  assert.match(markup, /12s/);
});

test('a settled marker never sweeps', () => {
  const markup = render(
    <LocalNoticeMarkerView marker={{ kind: 'compaction', tokensBefore: 100, tokensAfter: 40 }} />,
  );
  assert.doesNotMatch(markup, /text-sweep/);
});

test('a measured compaction shows before → after and how much was saved', () => {
  const markup = render(
    <LocalNoticeMarkerView marker={{ kind: 'compaction', tokensBefore: 142_000, tokensAfter: 31_000 }} />,
  );
  assert.match(markup, /role="separator"/);
  assert.match(markup, /data-notice-variant="compaction"/);
  assert.match(markup, /Context compacted/);
  assert.match(markup, /142k/);
  assert.match(markup, /31k/);
  assert.match(markup, /−78%/);
});

test('an unmeasured compaction shows only its label', () => {
  const markup = render(
    <LocalNoticeMarkerView marker={{ kind: 'compaction', tokensBefore: 0, tokensAfter: 0 }} />,
  );
  assert.match(markup, /Context compacted/);
  assert.doesNotMatch(markup, /%/);
});

test('a model switch names both models, with providers only when they differ', () => {
  const sameProvider = render(
    <LocalNoticeMarkerView
      marker={{
        kind: 'model_change',
        from: { provider: 'zhipu', model: 'glm-4.6' },
        to: { provider: 'zhipu', model: 'glm-5' },
      }}
    />,
  );
  assert.match(sameProvider, /Model switched/);
  assert.match(sameProvider, /glm-4\.6/);
  assert.match(sameProvider, /glm-5/);
  assert.doesNotMatch(sameProvider, /zhipu ·/);

  const crossProvider = render(
    <LocalNoticeMarkerView
      marker={{
        kind: 'model_change',
        from: { provider: 'zhipu', model: 'glm-5' },
        to: { provider: 'anthropic' },
      }}
    />,
  );
  assert.match(crossProvider, /zhipu · glm-5/);
  assert.match(crossProvider, /anthropic · provider default/);
});

test('the SDK auto-compaction line becomes a localized compaction marker', () => {
  const markup = render(<SdkNoticeMarker icon="✨" text="Context auto-compacted (was ~180k tokens)" />);
  assert.match(markup, /data-notice-variant="compaction"/);
  assert.match(markup, /Context auto-compacted/);
  assert.match(markup, /was ~180k tokens/);
});

test('only short single-line SDK status notices with a known icon become markers', () => {
  assert.equal(isSdkMarkerNotice('⏳', 'Waiting for rate limit'), true);
  assert.equal(isSdkMarkerNotice(undefined, 'Waiting'), false);
  assert.equal(isSdkMarkerNotice('🔧', 'Tool'), false);
  assert.equal(isSdkMarkerNotice('⚠', 'line one\nline two'), false);
  assert.equal(isSdkMarkerNotice('⚠', 'x'.repeat(201)), false);
});

test('a local notice carrying a marker renders as a marker, not an output card', () => {
  const markup = render(
    <LocalNoticeBubble
      kind="local_notice"
      id="m"
      content="Compacted context"
      sentAt={1}
      variant="output"
      marker={{ kind: 'compaction', tokensBefore: 100, tokensAfter: 40 }}
    />,
  );
  assert.match(markup, /data-testid="system-notice"/);
  assert.doesNotMatch(markup, /local-notice-bubble/);
});
