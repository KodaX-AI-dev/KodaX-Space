import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../i18n/I18nProvider.js';
import { SidebarToggleButton } from './SidebarToggleButton.js';

function renderToggle(open: boolean): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <SidebarToggleButton
        side="left"
        open={open}
        onClick={() => {}}
        testId="partner-left-sidebar-toggle"
      />
    </I18nProvider>,
  );
}

test('shared left-sidebar toggle exposes its current state and action', () => {
  const open = renderToggle(true);
  assert.match(open, /data-testid="partner-left-sidebar-toggle"/);
  assert.match(open, /aria-label="Hide left sidebar"/);
  assert.match(open, /aria-pressed="true"/);

  const closed = renderToggle(false);
  assert.match(closed, /aria-label="Show left sidebar"/);
  assert.match(closed, /aria-pressed="false"/);
});
