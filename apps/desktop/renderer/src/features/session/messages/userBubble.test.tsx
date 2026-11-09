import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../../i18n/I18nProvider.js';
import { LocalNoticeBubble, UserBubble } from './bubbles.js';

/** The provider follows the system languages; pin them so assertions never depend on the host OS. */
function withSystemLanguages<T>(languages: readonly string[], render: () => T): T {
  const original = Object.getOwnPropertyDescriptor(navigator, 'languages');
  Object.defineProperty(navigator, 'languages', { value: languages, configurable: true });
  try {
    return render();
  } finally {
    if (original) Object.defineProperty(navigator, 'languages', original);
    else delete (navigator as { languages?: readonly string[] }).languages;
  }
}

test('saved slash references retain the composer appearance without turning arguments into commands', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider>
      <UserBubble content="/compact preserve /some/path" />
    </I18nProvider>,
  );
  assert.match(markup, /data-composer-token="command"/);
  assert.equal((markup.match(/data-composer-token=/g) ?? []).length, 1);
  assert.match(markup, /preserve \/some\/path/);
});

test('local command receipts are distinct from user queries and show the same reference', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider>
      <LocalNoticeBubble
        kind="local_notice"
        id="compact"
        content="/compact"
        sentAt={1}
        variant="echo"
      />
    </I18nProvider>,
  );
  assert.doesNotMatch(markup, /user-query-label/);
  assert.match(markup, /data-composer-token="command"/);
});

test('history colors explicit skill and file references while email and ordinary paths stay prose', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider>
      <UserBubble
        content={
          'Inspect @src/入口.ts /skill:code-review user@example.com /tmp/example [My file](<file:///C:/work/My%20file.ts>)'
        }
      />
    </I18nProvider>,
  );
  assert.equal((markup.match(/data-composer-token="file"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-composer-token="skill"/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /data-composer-token="command"/);
  assert.match(markup, /user@example.com \/tmp\/example/);
  assert.match(markup, /title="C:\\work\\My file.ts"/);
});

test('user queries have a persistent localized sender label distinct from assistant prose', () => {
  const markup = withSystemLanguages(['zh-CN'], () =>
    renderToStaticMarkup(
      <I18nProvider>
        <UserBubble content="Find the original task" turnActions={{ savedTurn: true }} />
      </I18nProvider>,
    ),
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
