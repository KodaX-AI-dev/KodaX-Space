import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, type ComponentType, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../i18n/I18nProvider.js';
import { useAppStore } from '../store/appStore.js';
import { RuntimeStartupStatus } from './RuntimeStartupStatus.js';

test('startup status explains long waits and failures, and clears when Space is ready', (t) => {
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
    changedAt: Date.now() - 35_000,
    stale: true,
    capabilities: [],
    startupProgress: { stage: 'waiting', reason: 'connected_clients' },
  };
  assert.match(render(), /Waiting for other connected apps|正在等待其他已连接的应用/);
  assert.match(render(), /35/);
  assert.match(render(), /longer than usual|耗时超出平常/);
  assert.match(render(), /exit Space|退出 Space/);
  initial.runtimeConnection = {
    ...initial.runtimeConnection,
    startupProgress: { stage: 'ready' },
  };
  assert.match(render(), /Preparing conversation|正在准备会话/);
  initial.runtimeConnection = {
    ...initial.runtimeConnection,
    startupProgress: { stage: 'initializing', phase: 'mcp' },
  };
  assert.match(render(), /Preparing connected tools|正在准备已连接的工具/);
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
  assert.match(render(), /startup failed|助手启动失败/);
});
