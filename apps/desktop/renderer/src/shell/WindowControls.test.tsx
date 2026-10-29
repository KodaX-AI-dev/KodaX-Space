import assert from 'node:assert/strict';
import test, { afterEach, beforeEach, mock } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../i18n/I18nProvider.js';
import { WindowControls } from './WindowControls.js';

beforeEach(() => mock.getter(globalThis, 'navigator', () => ({ languages: ['en-US'] })));
afterEach(() => mock.restoreAll());

for (const platformClass of ['platform-linux', 'platform-win32']) {
  test(`${platformClass} exposes all three window operations`, () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <WindowControls platformClass={platformClass} />
      </I18nProvider>,
    );
    for (const label of ['Minimize', 'Maximize', 'Close window'])
      assert.ok(html.includes(`aria-label="${label}"`));
  });
}
test('macOS retains native window buttons without duplicate custom controls', () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <WindowControls platformClass="platform-darwin" />
    </I18nProvider>,
  );
  assert.equal(html, '');
});
