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
  assert.match(render(), /could not start|启动失败/);
  assert.match(render(), /Retry startup|重试启动/);
  initial.runtimeConnection = { ...initial.runtimeConnection, state: 'disconnected' };
  assert.match(render(), /Retry startup|重试启动/);
  assert.doesNotMatch(render(), /KodaXNativeArtifactsV3/);
});

test('startup failure names security software when a Windows native artifact is unavailable', (t) => {
  const initial = useAppStore.getInitialState();
  const original = { ...initial };
  t.after(() => Object.assign(initial, original));
  initial.runtimeConnection = {
    state: 'disconnected',
    changedAt: 3,
    stale: true,
    capabilities: [],
    // Real customer reason (Issue 257), as sanitized and truncated by main.
    reason:
      'Runtime daemon launch failed: A compatible KodaX shellSandbox native artifact is unavailable. ' +
      "<path> Space\\resources\\app.asar.unpacked\\node_modules\\@kodax-ai\\kodax\\dist\\native\\win32-x64\\manifest.json: ENOENT: no such file or directory, lstat '<path>'",
  };
  const html = renderToStaticMarkup(
    createElement(
      I18nProvider as ComponentType<PropsWithChildren>,
      {},
      createElement(RuntimeStartupStatus),
    ),
  );
  assert.match(html, /%LOCALAPPDATA%\\KodaXNativeArtifactsV3/);
  assert.match(html, /security software|安全软件/i);
  assert.match(html, /native artifact is unavailable/);

  // SDK 0.7.97-rc.3 names the quarantine case with its own non-retryable reason.
  initial.runtimeConnection = {
    ...initial.runtimeConnection,
    reason:
      'Runtime daemon launch failed: [native_artifact_removed_after_provision] KodaX native artifact <path> ' +
      'disappeared right after it was written; security software (for example Windows Defender) likely quarantined it.',
  };
  assert.match(
    renderToStaticMarkup(
      createElement(
        I18nProvider as ComponentType<PropsWithChildren>,
        {},
        createElement(RuntimeStartupStatus),
      ),
    ),
    /%LOCALAPPDATA%\\KodaXNativeArtifactsV3/,
  );
});
