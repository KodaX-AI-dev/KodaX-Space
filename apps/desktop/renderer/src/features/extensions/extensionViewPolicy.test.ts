import assert from 'node:assert/strict';
import test from 'node:test';
import type { SpaceExtensionT } from '@kodax-space/space-ipc-schema';
import {
  buildRestrictedExtensionDocument,
  createExtensionViewSelection,
  enabledPartnerExtensions,
  resolveExtensionView,
} from './extensionViewPolicy.js';

const extension: SpaceExtensionT = {
  id: 'partner-library',
  name: 'Partner library',
  description: 'Experts and connectors',
  version: '1.0.0',
  enabled: true,
  installedAt: 1788134400000,
  expertCount: 0,
  connectorCount: 0,
};
const context = { surface: 'partner' as const, projectRoot: '/project', sessionId: 'session-1' };

test('plugin navigation lists only enabled packages in Partner', () => {
  const entries = [extension, { ...extension, id: 'disabled', enabled: false }];
  assert.deepEqual(enabledPartnerExtensions('partner', entries), [extension]);
  assert.deepEqual(enabledPartnerExtensions('code', entries), []);
  assert.deepEqual(enabledPartnerExtensions('partner', []), []);
});

test('view is retained only while its package and session scope are unchanged', () => {
  const selection = createExtensionViewSelection(extension, context);
  assert.equal(resolveExtensionView(selection, context, [extension]), extension);
  for (const nextContext of [
    { ...context, surface: 'code' as const },
    { ...context, projectRoot: '/another-project' },
    { ...context, sessionId: 'session-2' },
  ]) {
    assert.equal(resolveExtensionView(selection, nextContext, [extension]), null);
  }
  assert.equal(resolveExtensionView(selection, context, []), null);
  assert.equal(resolveExtensionView(selection, context, [{ ...extension, enabled: false }]), null);
  assert.equal(
    resolveExtensionView(selection, context, [{ ...extension, version: '2.0.0' }]),
    null,
  );
  assert.equal(
    resolveExtensionView(selection, context, [
      { ...extension, installedAt: extension.installedAt + 1 },
    ]),
    null,
  );
  assert.equal(resolveExtensionView(null, context, [extension]), null);
});

test('installed UI is wrapped by an earlier restrictive CSP, not a trusted renderer import', () => {
  const installedHtml =
    '<!doctype html><html><head><style>body{color:red}</style></head><body><h1>Installed library</h1><script>window.ready=true</script></body></html>';
  const document = buildRestrictedExtensionDocument(installedHtml);
  assert.ok(document.indexOf('Content-Security-Policy') < document.indexOf('window.ready=true'));
  for (const directive of [
    "default-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
  ])
    assert.ok(document.includes(directive), directive);
  assert.ok(document.includes(installedHtml));
  assert.ok(!document.includes("script-src 'self'"));
});
