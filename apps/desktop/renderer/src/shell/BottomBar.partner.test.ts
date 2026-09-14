import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('Partner composer uses the shared plus menu instead of separate Skill and connector buttons', async () => {
  // Node has no Vite asset loader; image imports keep their public URL in this render test.
  register(
    `data:text/javascript,${encodeURIComponent(`
    import { readFileSync } from 'node:fs';
    export async function resolve(specifier, context, nextResolve) {
      if (specifier.endsWith('/expert-presentation.json')) {
        const contents = readFileSync(new URL(specifier, context.parentURL), 'utf8');
        return { url: 'data:text/javascript,' + encodeURIComponent('export default ' + contents), shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }
    export async function load(url, context, nextLoad) {
      if (/\\.(png|svg|webp)$/.test(new URL(url).pathname)) return {
        format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(url)
      };
      const result = await nextLoad(url, context);
      if (result.format === 'module' && result.source && url.includes('/renderer/')) return {
        ...result,
        source: 'import.meta.glob ??= () => ({}); import.meta.env ??= {};\\n' + result.source.toString()
      };
      return result;
    }
  `)}`,
    import.meta.url,
  );
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map([['kodax-space.currentSurface', 'partner']]);
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage,
    },
  });
  try {
    const { BottomBar } = await import('./BottomBar.js');
    const { I18nProvider } = await import('../i18n/I18nProvider.js');
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(BottomBar)));
    assert.doesNotMatch(html, /data-testid="partner-scene-shortcuts"/);
    assert.match(html, /data-testid="composer-attach-menu-trigger"/);
    assert.doesNotMatch(html, /data-testid="partner-skill-picker"/);
    assert.doesNotMatch(html, /data-testid="partner-connector-chips"/);
    assert.doesNotMatch(html, /value="(?:docx|pdf|pptx)"/);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('Partner connector icons and persistent expert share the project context row without using plus', () => {
  const source = readFileSync(fileURLToPath(new URL('./BottomBar.tsx', import.meta.url)), 'utf8');
  const contextToolbar = source.indexOf('data-testid="composer-context-toolbar"');
  const connectorIcons = source.indexOf('<PartnerConnectorChips />');
  const expertChip = source.indexOf('<PartnerExpertChip');
  const attachTrigger = source.indexOf('data-testid="composer-attach-menu-trigger"');
  assert.notEqual(contextToolbar, -1);
  assert.notEqual(connectorIcons, -1);
  assert.ok(contextToolbar < connectorIcons);
  assert.ok(connectorIcons < expertChip);
  assert.ok(expertChip < attachTrigger);
  assert.equal(source.match(/<PartnerConnectorChips \/>/g)?.length, 1);
});
