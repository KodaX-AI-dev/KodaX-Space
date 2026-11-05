import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../../i18n/I18nProvider.js';
import { UserBubble } from './bubbles.js';

test('user queries have a persistent sender label distinct from assistant prose', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider>
      <UserBubble content="Find the original task" />
    </I18nProvider>,
  );
  assert.match(markup, /data-testid="user-query-label"/);
  assert.match(markup, /Find the original task/);
});
