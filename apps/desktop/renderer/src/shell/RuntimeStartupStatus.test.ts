import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, type ComponentType, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../i18n/I18nProvider.js';
import { useAppStore } from '../store/appStore.js';
import { RuntimeStartupStatus } from './RuntimeStartupStatus.js';

test('startup status explains waiting and clears when Space is ready or initialization fails', (t) => {
  const initial = useAppStore.getInitialState();
  const original = { ...initial };
  t.after(() => Object.assign(initial, original));
  const render = () =>
    renderToStaticMarkup(
      createElement(
        I18nProvider as ComponentType<PropsWithChildren>,
        {},
        createElement(RuntimeStartupStatus),
      ),
    );
  initial.runtimeConnection = {
    state: 'connecting',
    changedAt: 1,
    stale: true,
    capabilities: [],
    startupProgress: { stage: 'waiting', reason: 'connected_clients' },
  };
  assert.match(render(), /Waiting for other connected apps|正在等待其他已连接的应用/);
  initial.runtimeConnection = {
    ...initial.runtimeConnection,
    startupProgress: { stage: 'ready' },
  };
  assert.match(render(), /Preparing conversation|正在准备会话/);
  initial.runtimeConnection = {
    state: 'ready',
    runtimeId: 'runtime-1',
    changedAt: 2,
    stale: false,
    capabilities: [],
  };
  assert.equal(render(), '');
  initial.runtimeConnection = {
    state: 'incompatible',
    changedAt: 3,
    stale: true,
    capabilities: [],
    reason: 'startup failed',
  };
  assert.equal(render(), '');
});
