import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, type ComponentType, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../i18n/I18nProvider.js';
import { useAppStore } from '../store/appStore.js';
import { ActivitySpinner } from './ActivitySpinner.js';

const TestI18nProvider = I18nProvider as ComponentType<PropsWithChildren>;

test('events arriving before the Product view never supply a client token estimate', (t) => {
  const initial = useAppStore.getInitialState();
  const original = { ...initial };
  t.after(() => Object.assign(initial, original));
  Object.assign(initial, {
    currentSessionId: 'before-product-view',
    pendingSendBySession: {},
    runtimeProfile: undefined,
    liveProjectionBySession: {},
    runtimeConnection: { state: 'disconnected', changedAt: 0, stale: true, capabilities: [] },
    eventsBySession: {
      'before-product-view': [
        { kind: 'session_start', sessionId: 'before-product-view', provider: 'mock' },
        {
          kind: 'thinking_delta',
          sessionId: 'before-product-view',
          text: 'reasoning '.repeat(100),
        },
      ],
    },
  });
  const html = renderToStaticMarkup(
    createElement(TestI18nProvider, null, createElement(ActivitySpinner)),
  );
  assert.match(html, /data-testid="run-mark"/);
  assert.doesNotMatch(html, /~[\d.]+(?:k)? tokens/);
});

test('pending send elapsed time survives rerenders and resets for a retry', (t) => {
  const initial = useAppStore.getInitialState();
  const original = { ...initial };
  const current = useAppStore.getState();
  t.after(() => {
    Object.assign(initial, original);
    useAppStore.setState(current, true);
  });
  t.mock.timers.enable({ apis: ['Date'], now: 100_000 });
  useAppStore.setState({ currentSessionId: 'pending-timer', eventsBySession: {} });
  const generation = useAppStore.getState().setPendingSend('pending-timer', true);
  const render = (): string => {
    // SSR reads Zustand's hydration snapshot; feed it the actual state produced by send actions.
    Object.assign(initial, useAppStore.getState());
    return renderToStaticMarkup(
      createElement(TestI18nProvider, null, createElement(ActivitySpinner)),
    );
  };
  t.mock.timers.tick(5_000);
  assert.match(render(), /5s/);
  t.mock.timers.tick(5_000);
  assert.match(render(), /10s/);
  useAppStore.getState().setPendingSend('pending-timer', false, generation);
  useAppStore.getState().setPendingSend('pending-timer', true);
  t.mock.timers.tick(3_000);
  assert.match(render(), /3s/);
  assert.doesNotMatch(render(), /13s/);
});

test('spinner renders runtime iteration and omits an unbounded denominator', (t) => {
  const initial = useAppStore.getInitialState();
  const original = { ...initial };
  t.after(() => Object.assign(initial, original));
  for (const max of [500, 0]) {
    Object.assign(initial, {
      currentSessionId: 'iteration-render',
      pendingSendBySession: {},
      runtimeProfile: undefined,
      eventsBySession: {
        'iteration-render': [
          { kind: 'session_start', sessionId: 'iteration-render', provider: 'mock' },
          { kind: 'iteration_start', sessionId: 'iteration-render', iter: 17, maxIter: max },
        ],
      },
      liveProjectionBySession: {},
      runtimeConnection: { state: 'disconnected', changedAt: 0, stale: true, capabilities: [] },
    });
    const html = renderToStaticMarkup(
      createElement(TestI18nProvider, null, createElement(ActivitySpinner)),
    );
    assert.ok(html.includes(max > 0 ? '17/500' : '17'));
    assert.ok(!html.includes('17/0'));
  }
});

function renderRuntimeSpinner(
  t: { after: (fn: () => void) => void },
  options: { readonly phase: 'running' | 'waiting_permission'; readonly liveWorkVisible: boolean },
): string {
  const initial = useAppStore.getInitialState();
  const original = { ...initial };
  t.after(() => Object.assign(initial, original));
  const end = (outputTokens: number) => ({
    kind: 'iteration_end',
    sessionId: 'live',
    iter: 1,
    maxIter: 0,
    tokenCount: 1,
    usage: { inputTokens: 1_000, cacheReadInputTokens: 4_000, outputTokens },
    runtimeEvent: { runtimeId: 'rt', runId: 'run', seq: 1, journalEpoch: 'e' },
  });
  Object.assign(initial, {
    currentSessionId: 'live',
    pendingSendBySession: {},
    runtimeProfile: undefined,
    runtimeConnection: {
      state: 'ready',
      runtimeId: 'rt',
      changedAt: 0,
      stale: false,
      capabilities: [],
    },
    eventsBySession: {
      live: [{ kind: 'session_start', sessionId: 'live', provider: 'p' }, end(600), end(900)],
    },
    liveProjectionBySession: {
      live: {
        sessionId: 'live',
        projectionRevision: 1,
        cursor: { runtimeId: 'rt', seq: 1 },
        transcriptRevision: 't',
        activeRun: { runId: 'run', sessionId: 'live', phase: options.phase, startedAt: 10 },
        queuedRuns: [],
        activeTools: [],
        todos: [
          { id: 'a', content: '调研', status: 'in_progress', activeForm: '调研三个上游仓库源码' },
        ],
        queuedInputs: [],
        interactions: [],
      },
    },
  });
  return renderToStaticMarkup(
    createElement(
      TestI18nProvider,
      null,
      createElement(ActivitySpinner, { liveWorkVisible: options.liveWorkVisible }),
    ),
  );
}

test('beside a working live group the spinner drops its mark but keeps the task and run totals', (t) => {
  const html = renderRuntimeSpinner(t, { phase: 'running', liveWorkVisible: true });
  assert.doesNotMatch(html, /data-testid="run-mark"/);
  assert.match(html, /调研三个上游仓库源码/);
  // ↑ = input with cache (2 × 5k), ↓ = output (600 + 900).
  assert.match(html, /↑10\.0k/);
  assert.match(html, /↓1\.5k/);
});

test('a phase the live group cannot show brings the mark and the phase text back', (t) => {
  // 固定 zh-CN：断言本地化的等待文案，不随 CI 主机的系统语言变化。
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'zh-CN', setItem: () => undefined },
  });
  try {
    const html = renderRuntimeSpinner(t, { phase: 'waiting_permission', liveWorkVisible: true });
    assert.match(html, /data-testid="run-mark"/);
    assert.match(html, /等待批准/);
  } finally {
    if (previousDescriptor) Object.defineProperty(globalThis, 'localStorage', previousDescriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
