import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import { ExtensionSettingsContent } from './ExtensionSettingsPanel.js';
import { ExtensionFrame } from './PartnerExtensionView.js';
import { SPACE_EXTENSION_FRAME_URL } from '@kodax-space/space-ipc-schema';

const actions = {
  onInstall: () => undefined,
  onRefresh: () => undefined,
  onSetEnabled: () => undefined,
  onUninstall: () => undefined,
};

test('core extension settings retain an install action when no package is installed', () => {
  const html = renderToStaticMarkup(
    createElement(
      I18nProvider,
      null,
      createElement(ExtensionSettingsContent, {
        snapshot: { extensions: [], loading: false, error: null },
        busy: null,
        actionError: null,
        ...actions,
      }),
    ),
  );
  assert.match(html, /data-testid="extension-install"/);
  assert.match(html, /data-testid="extensions-empty"/);
  assert.doesNotMatch(html, /data-testid="extension-uninstall"/);
});

test('settings show installed identity and lifecycle controls while surfacing errors', () => {
  const html = renderToStaticMarkup(
    createElement(
      I18nProvider,
      null,
      createElement(ExtensionSettingsContent, {
        snapshot: {
          extensions: [
            {
              id: 'partner-library',
              name: 'Installed package',
              description: 'From an archive',
              version: '1.0.0',
              enabled: false,
              installedAt: 1,
              expertCount: 0,
              connectorCount: 0,
            },
          ],
          loading: false,
          error: null,
        },
        busy: null,
        actionError: 'Failed to uninstall',
        ...actions,
      }),
    ),
  );
  assert.match(html, /Installed package/);
  assert.match(html, /partner-library/);
  assert.match(html, /role="switch" aria-checked="false"/);
  assert.match(html, /data-testid="extension-uninstall"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Failed to uninstall/);
});

test('package UI uses only the dedicated opaque sandbox frame, never srcDoc or same-origin', () => {
  const html = renderToStaticMarkup(
    createElement(ExtensionFrame, { html: '<h1>From package</h1>', title: 'Plugin library' }),
  );
  assert.ok(html.includes(`src="${SPACE_EXTENSION_FRAME_URL}"`));
  assert.match(html, /sandbox="allow-scripts"/);
  assert.match(html, /referrerPolicy="no-referrer"/i);
  assert.doesNotMatch(html, /allow-same-origin|allow-popups|allow-forms|srcdoc=/i);
  assert.doesNotMatch(html, /From package/);
});
