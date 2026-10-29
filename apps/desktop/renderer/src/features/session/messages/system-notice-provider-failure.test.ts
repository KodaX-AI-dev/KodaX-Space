import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, type ComponentType, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nProvider } from '../../../i18n/I18nProvider.js';
import { AssistantBubble, SystemNotice } from './bubbles.js';

const TestI18nProvider = I18nProvider as ComponentType<PropsWithChildren<Record<string, never>>>;

test('thinking text without a Host estimate does not invent a token count', () => {
  withEnglishLocale(() => {
    const markup = renderToStaticMarkup(
      createElement(
        TestI18nProvider,
        null,
        createElement(AssistantBubble, { text: '', thinking: 'reasoning '.repeat(100) }),
      ),
    );
    assert.match(markup, /Thinking/);
    assert.doesNotMatch(markup, /tokens/);
  });
});

function withEnglishLocale(render: () => void): void {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'en-US', setItem: () => undefined },
  });
  try {
    render();
  } finally {
    if (previousDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', previousDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  }
}

test('SDK structured child reports are neutral, collapsed and readable without exposing the transport envelope', () => {
  withEnglishLocale(() => {
    const markup = renderToStaticMarkup(
      createElement(
        TestI18nProvider,
        null,
        createElement(SystemNotice, {
          kind: 'system_notice',
          id: 'report',
          variant: 'info',
          text: '**Review**: "checkpoint"\n\n`&quot;`',
          taskResult: {
            type: 'task_result',
            source: 'child_task',
            status: 'unknown',
            reportFormat: 'markdown',
          },
        }),
      ),
    );
    assert.match(markup, /data-notice-variant="info"/);
    assert.doesNotMatch(markup, /text-warn|border-warn|agent-completed|msg_2_117/);
    assert.match(markup, /<details/);
    assert.doesNotMatch(markup, /<details[^>]* open/);
    assert.match(markup, /Task report/);
    assert.match(markup, /<strong[^>]*>Review<\/strong>/);
    assert.match(markup, /checkpoint/);
    assert.match(
      markup,
      /<code[^>]*>&amp;quot;<\/code>/,
      'decode only the transport layer, preserving literal code',
    );
  });
});

test('provider failure notice renders the SDK safe message and structured diagnostics', () => {
  withEnglishLocale(() => {
    const markup = renderToStaticMarkup(
      createElement(
        TestI18nProvider,
        null,
        createElement(SystemNotice, {
          kind: 'system_notice',
          id: 'failure_notice',
          variant: 'error',
          text: 'Provider authentication failed.',
          failureKind: 'auth',
          runtimeRunId: 'run_failure_details',
          failureDetail: {
            failureKind: 'auth',
            stage: 'credential',
            providerErrorCode: 'authentication_failed',
            safeMessage: 'Provider authentication failed.',
            httpStatus: 401,
            upstreamErrorCode: 'invalid_api_key',
            requestId: 'req_failure_details',
          },
        }),
      ),
    );

    assert.match(markup, /Provider authentication failed\./);
    assert.match(markup, /Runtime failure details/);
    assert.match(markup, /authentication_failed/);
    assert.match(markup, /credential/);
    assert.match(markup, /401/);
    assert.match(markup, /req_failure_details/);
    assert.match(markup, /run_failure_details/);
  });
});

test('malformed report envelopes and ordinary entities stay literal, and report HTML cannot execute', () => {
  withEnglishLocale(() => {
    const render = (text: string) =>
      renderToStaticMarkup(
        createElement(
          TestI18nProvider,
          null,
          createElement(SystemNotice, { kind: 'system_notice', id: 'info', variant: 'info', text }),
        ),
      );
    assert.match(render('Ordinary &quot;literal&quot;'), /Ordinary &amp;quot;literal&amp;quot;/);
    assert.match(render('<agent-completed>\nmissing close'), /&lt;agent-completed&gt;/);
    const hostile = render(
      '<agent-completed state="completed">\n&lt;script&gt;alert(1)&lt;/script&gt;\n\n**Report preserved**\n</agent-completed>',
    );
    assert.doesNotMatch(hostile, /<script>|onclick=/);
    assert.match(hostile, /Report preserved/);
  });
});

test('unknown tags and multiple report envelopes are preserved verbatim', () => {
  withEnglishLocale(() => {
    for (const text of [
      '<agent-completed-extra>\n&quot;unknown&quot;\n</agent-completed>',
      '<agent-completed>\nfirst\n</agent-completed>\n<agent-completed>\nsecond\n</agent-completed>',
    ]) {
      const markup = renderToStaticMarkup(
        createElement(
          TestI18nProvider,
          null,
          createElement(SystemNotice, { kind: 'system_notice', id: 'info', variant: 'info', text }),
        ),
      );
      assert.match(markup, /&lt;agent-completed/);
      assert.doesNotMatch(markup, /Task report/);
    }
  });
});

test('context-capacity notice shows the required and available token counts', () => {
  withEnglishLocale(() => {
    const markup = renderToStaticMarkup(
      createElement(
        TestI18nProvider,
        null,
        createElement(SystemNotice, {
          kind: 'system_notice',
          id: 'capacity_notice',
          variant: 'error',
          text: 'The request still exceeds the model context capacity after recovery.',
          failureKind: 'context_capacity',
          failureDetail: {
            failureKind: 'context_capacity',
            stage: 'runtime_control',
            providerErrorCode: 'context_capacity_exceeded',
            safeMessage: 'The request still exceeds the model context capacity after recovery.',
            contextTokens: { required: 143_400, available: 131_072 },
          },
        }),
      ),
    );

    assert.match(markup, /context_capacity_exceeded/);
    assert.match(markup, /143400 \/ 131072/);
  });
});
