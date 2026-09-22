import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import { PartnerRemoteRecordsProvider } from '../extensions/usePartnerRemoteRecords.js';

import { resolve } from './PartnerComponentTestLoader.js';

registerHooks({ resolve });
const { PartnerWorkspace } = await import('./PartnerWorkspace.js');

test('Partner mounts only direct native document delivery, never the legacy create-proposal opener', async () => {
  const source = await readFile(new URL('./PartnerWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /PartnerNativeDocumentAutoOpener/u);
  assert.doesNotMatch(source, /PartnerDocumentAutoOpener/u);
  assert.match(source, /kind: 'materials'/u);
  assert.doesNotMatch(source, /kind: 'sources'/u);
});

test('compact Partner keeps context and detail entries reachable', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
      matchMedia: (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
      }),
    },
  });

  try {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <PartnerRemoteRecordsProvider>
          <PartnerWorkspace
            rightSidebarOpen={false}
            onToggleRightSidebar={() => undefined}
            onOpenDetail={() => undefined}
          />
        </PartnerRemoteRecordsProvider>
      </I18nProvider>,
    );

    assert.match(html, /data-testid="partner-context-toggle"/);
    assert.match(html, /lucide-list/);
    assert.doesNotMatch(html, /lucide-ellipsis-vertical/);
    assert.match(html, /data-testid="partner-detail-toggle"/);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
