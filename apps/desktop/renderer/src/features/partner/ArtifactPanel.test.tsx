import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PartnerDeliveryRefT } from '@kodax-space/space-ipc-schema';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import { PartnerRemoteRecordsProvider } from '../extensions/usePartnerRemoteRecords.js';
import type { PartnerDetailOpenTarget } from './partnerDetailWorkspace.js';

register(new URL('./ArtifactPanelTestLoader.mjs', import.meta.url));
const { ArtifactPanel, openPartnerOutputDelivery, PartnerOutputDeliveryList } =
  await import('./ArtifactPanel.js');

function delivery(index: number): PartnerDeliveryRefT {
  return {
    id: `delivery-${index}`,
    sessionId: 'session-a',
    projectRoot: '/workspace/project-a',
    rootKind: 'run-output',
    rootPath: '/workspace/project-a/.kodax/runs/run-a/output',
    absolutePath: `/workspace/project-a/.kodax/runs/run-a/output/output-${index}.md`,
    relativePath: `output-${index}.md`,
    kind: 'file',
    title: `产物 ${index}.md`,
    sourceRefs: [],
    producer: 'partner',
    createdAt: index,
    updatedAt: index,
  };
}

test('Partner output detail has one output surface without review or nested result destinations', () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <PartnerRemoteRecordsProvider>
        <ArtifactPanel />
      </PartnerRemoteRecordsProvider>
    </I18nProvider>,
  );

  assert.match(html, /data-testid="partner-artifact-panel"/);
  assert.doesNotMatch(html, /partner-result-destinations/);
  assert.doesNotMatch(html, /partner-pending-review/);
  assert.doesNotMatch(html, /partner-results-files-tab/);
});

test('Partner output detail lists every delivered file instead of only the card preview', () => {
  const deliveries = [delivery(1), delivery(2), delivery(3), delivery(4)];
  const html = renderToStaticMarkup(
    <I18nProvider>
      <PartnerOutputDeliveryList deliveries={deliveries} onOpenDetail={() => undefined} />
    </I18nProvider>,
  );

  assert.equal(html.match(/data-testid="partner-output-delivery"/g)?.length, 4);
  for (const item of deliveries) assert.match(html, new RegExp(item.title));
});

test('clicking a delivered file hands a delivery-store preview to the typed detail workspace', () => {
  const opened: PartnerDetailOpenTarget[] = [];

  openPartnerOutputDelivery(delivery(4), (target) => {
    opened.push(target);
  });

  const target = opened[0];
  assert.equal(target?.kind, 'file');
  assert.equal(target?.kind === 'file' ? target.snapshot.deliveryId : null, 'delivery-4');
  assert.equal(target?.kind === 'file' ? target.snapshot.fileSource : null, 'delivery-store');
});
