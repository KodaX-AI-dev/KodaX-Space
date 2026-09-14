import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import { PartnerRemoteRecordsProvider } from '../extensions/usePartnerRemoteRecords.js';
import { KnowledgeBasePanel } from './KnowledgeBasePanel.js';
import { handleSourcePickerOpenRequest, SourcesPanel } from './SourcesPanel.js';
import { readPartnerPendingSources, stagePartnerPendingSource } from './partnerWorkbench.js';

function renderWithI18n(element: JSX.Element): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <PartnerRemoteRecordsProvider>{element}</PartnerRemoteRecordsProvider>
    </I18nProvider>,
  );
}

test('Partner sources keeps low-frequency surfaces out of the default task rail', () => {
  const initialState = useAppStore.getInitialState();
  const previousProjectPath = useAppStore.getState().currentProjectPath;
  const previousSessionId = useAppStore.getState().currentSessionId;
  const previousInitialProjectPath = initialState.currentProjectPath;
  const previousInitialSessionId = initialState.currentSessionId;
  initialState.currentProjectPath = '/workspace/project';
  initialState.currentSessionId = null;
  useAppStore.setState({ currentProjectPath: '/workspace/project', currentSessionId: null });

  try {
    const html = renderWithI18n(<SourcesPanel />);

    assert.match(html, /data-testid="partner-source-picker-open"/);
    assert.doesNotMatch(html, /data-testid="partner-source-picker"/);
    assert.doesNotMatch(html, /data-testid="partner-admin-audit-panel"/);
    assert.doesNotMatch(html, />Loading files…</);
  } finally {
    useAppStore.setState({
      currentProjectPath: previousProjectPath,
      currentSessionId: previousSessionId,
    });
    initialState.currentProjectPath = previousInitialProjectPath;
    initialState.currentSessionId = previousInitialSessionId;
  }
});

test('a source picker request is consumed only after it opens', () => {
  let openCount = 0;
  let consumeCount = 0;
  const openPicker = (): void => {
    openCount += 1;
  };
  const consumeRequest = (): void => {
    consumeCount += 1;
  };

  assert.equal(
    handleSourcePickerOpenRequest(1, '/workspace/project', openPicker, consumeRequest),
    true,
  );
  assert.equal(openCount, 1);
  assert.equal(consumeCount, 1);
  assert.equal(
    handleSourcePickerOpenRequest(0, '/workspace/project', openPicker, consumeRequest),
    false,
  );
  assert.equal(openCount, 1);
  assert.equal(consumeCount, 1);
});

test('Partner sources uses a full-width borderless container in detail presentation', () => {
  const html = renderWithI18n(<SourcesPanel variant="detail" />);
  const panelClass = html.match(/<aside class="([^"]+)" data-testid="partner-sources-panel"/)?.[1];

  assert.ok(panelClass);
  assert.match(panelClass, /(?:^| )w-full(?: |$)/);
  assert.match(panelClass, /(?:^| )h-full(?: |$)/);
  assert.doesNotMatch(panelClass, /(?:^| )w-60(?: |$)/);
  assert.doesNotMatch(panelClass, /(?:^| )border-r(?: |$)/);
});

test('Partner sources keeps the fixed rail presentation by default', () => {
  const html = renderWithI18n(<SourcesPanel />);
  const panelClass = html.match(/<aside class="([^"]+)" data-testid="partner-sources-panel"/)?.[1];

  assert.ok(panelClass);
  assert.match(panelClass, /(?:^| )w-60(?: |$)/);
  assert.match(panelClass, /(?:^| )border-r(?: |$)/);
  assert.doesNotMatch(panelClass, /(?:^| )w-full(?: |$)/);
});

test('Partner knowledge base is progressive and collapsed by default', () => {
  const html = renderWithI18n(<KnowledgeBasePanel />);

  assert.match(html, /data-testid="partner-kb-toggle"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Search wiki pages/);
  assert.doesNotMatch(html, /aria-label="Refresh Partner KB"/);
  assert.doesNotMatch(html, /aria-label="Run KB maintenance"/);
});

test('staged Partner materials preserve a selected folder target', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });

  try {
    stagePartnerPendingSource('/workspace/project', {
      path: 'research',
      targetKind: 'dir',
    });

    assert.deepEqual(readPartnerPendingSources('/workspace/project'), [
      { path: 'research', targetKind: 'dir' },
    ]);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
