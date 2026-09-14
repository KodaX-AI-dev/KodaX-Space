import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import { PartnerBrowserPanel } from './PartnerBrowserPanel.js';

function renderPanel(element: JSX.Element): string {
  return renderToStaticMarkup(<I18nProvider>{element}</I18nProvider>);
}

test('renders a remote page in an isolated persistent Partner web session', () => {
  const html = renderPanel(<PartnerBrowserPanel initialUrl="https://example.com/docs" />);

  assert.match(html, /data-testid="partner-browser-panel"/);
  assert.match(html, /src="https:\/\/example\.com\/docs"/);
  assert.match(html, /<webview/);
  assert.match(html, /partition="persist:kodax-partner-browser-v1"/);
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /independent from connector authorization/i);
  assert.match(html, /aria-label="Open in system browser"/);
  assert.match(html, /aria-label="Open address"/);
});

test('starts without an iframe or enabled navigation controls when no URL was submitted', () => {
  const html = renderPanel(<PartnerBrowserPanel />);

  assert.doesNotMatch(html, /<webview/);
  assert.match(html, /aria-label="Back"[^>]*disabled/);
  assert.match(html, /aria-label="Forward"[^>]*disabled/);
  assert.match(html, /aria-label="Refresh"[^>]*disabled/);
});
