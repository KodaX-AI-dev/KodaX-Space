import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../../i18n/I18nProvider.js';
import { UserBubble } from './bubbles.js';

test('user queries have a persistent localized sender label distinct from assistant prose', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider>
      <UserBubble content="Find the original task" turnActions={{ savedTurn: true }} />
    </I18nProvider>,
  );
  assert.match(markup, /data-testid="user-query-label"/);
  assert.match(markup, /你的消息/);
  assert.match(markup, /Find the original task/);
  assert.match(markup, /border-l-\[3px\]/);
  assert.match(markup, /bg-info\/10/);
  assert.match(markup, /data-testid="user-query-content"/);
  assert.match(markup, /aria-label="复制消息"/);
  assert.match(markup, /保留到这轮，创建分支/);
});
