import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { SandboxStatusT } from '@kodax-space/space-ipc-schema';
import { translateMessage } from '../../i18n/I18nProvider.js';
import { messages, type MessageKey } from '../../i18n/messages.js';
import { useSandboxSetupStore } from '../../store/sandboxSetupStore.js';
import { useToastStore } from '../../store/toastStore.js';
import {
  SANDBOX_OFFER_DISMISSED_KEY,
  checkSandboxSetupOffer,
  dismissSandboxSetupOffer,
  formatElapsed,
  sandboxSetupFailureText,
  shouldOfferSandboxSetup,
} from './SandboxSetupCard.js';

const needsSetup: SandboxStatusT = {
  contractVersion: 1,
  sandboxVersion: 11,
  asrtVersion: '0.0.52',
  platform: 'win32',
  backend: 'windows-restricted-user',
  readiness: 'setup-required',
  setup: { canSetup: true, mayElevate: true, requiresElevation: true },
  diagnosticCount: 0,
  diagnostics: [],
  guidance: [],
  revision: 3,
  checkedAt: '2026-11-27T08:00:00.000Z',
  lastOperation: null,
};

const ready: SandboxStatusT = {
  ...needsSetup,
  readiness: 'ready',
  setup: { canSetup: false, mayElevate: true, requiresElevation: false },
  revision: 4,
  lastOperation: { kind: 'setup', outcome: 'ready', attempted: true },
};

const uacTimeout: SandboxStatusT = {
  ...needsSetup,
  revision: 4,
  lastOperation: {
    kind: 'setup',
    outcome: 'unavailable',
    attempted: true,
    reason: 'uac-timeout',
    message: 'The Windows UAC prompt was not approved in time.',
  },
};

interface Call {
  readonly channel: string;
  readonly input: unknown;
}

function installWindow(
  t: TestContext,
  respond: (channel: string, input: unknown) => Promise<unknown>,
): {
  readonly calls: Call[];
  readonly storage: Map<string, string>;
  readonly listeners: Map<string, (payload: unknown) => void>;
} {
  const calls: Call[] = [];
  const storage = new Map<string, string>();
  const listeners = new Map<string, (payload: unknown) => void>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      dispatchEvent: () => true,
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      kodaxSpace: {
        platform: 'win32',
        on: (channel: string, listener: (payload: unknown) => void) => {
          listeners.set(channel, listener);
          return () => listeners.delete(channel);
        },
        invoke: async (channel: string, input: unknown) => {
          calls.push({ channel, input });
          return { ok: true, data: await respond(channel, input) };
        },
      },
    },
  });
  useSandboxSetupStore.setState({
    status: null,
    busy: null,
    error: null,
    setupStartedAt: null,
    setupPhase: null,
    setupFailed: false,
  });
  useToastStore.getState().clear();
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return { calls, storage, listeners };
}

test('setup is offered while required until the user chooses Later', () => {
  assert.equal(shouldOfferSandboxSetup(needsSetup, false), true);
  assert.equal(shouldOfferSandboxSetup(needsSetup, true), false);
  assert.equal(shouldOfferSandboxSetup(ready, false), false);
  assert.equal(shouldOfferSandboxSetup(null, false), false);
  const interrupted: SandboxStatusT = {
    ...needsSetup,
    setup: { ...needsSetup.setup, interrupted: true },
  };
  assert.equal(shouldOfferSandboxSetup(interrupted, true), true, 'a half-done setup returns');
});

test('setup failures are explained in the user language, not the raw English message', () => {
  const t = (key: MessageKey) => messages['zh-CN'][key];
  assert.equal(
    sandboxSetupFailureText(t, uacTimeout, null),
    messages['zh-CN']['settings.sandbox.reason.uac-timeout'],
  );
  assert.equal(
    sandboxSetupFailureText(
      t,
      { ...needsSetup, lastOperation: { ...uacTimeout.lastOperation!, reason: undefined } },
      null,
    ),
    'The Windows UAC prompt was not approved in time.',
  );
  assert.equal(
    sandboxSetupFailureText(t, uacTimeout, 'setup'),
    messages['zh-CN']['settings.sandbox.setupFailed'],
  );
  for (const locale of ['en-US', 'zh-CN'] as const) {
    assert.match(messages[locale]['settings.sandbox.running.body'], /UAC/);
    assert.match(messages[locale]['settings.sandbox.running.phase.awaiting-elevation'], /UAC/);
    assert.ok(messages[locale]['settings.sandbox.running.phase.waiting-for-other-setup']);
    assert.ok(messages[locale]['settings.sandbox.running.phase.elevated']);
    assert.ok(messages[locale]['settings.sandbox.reason.step-failed']);
  }
  assert.equal(
    sandboxSetupFailureText(
      t,
      {
        ...needsSetup,
        lastOperation: { kind: 'setup', outcome: 'cancelled', attempted: true, message: 'x' },
      },
      null,
    ),
    messages['zh-CN']['settings.sandbox.cancelled'],
  );
  assert.equal(formatElapsed(83_400), '1:23');
});

test('setup keeps status off IPC while it runs and announces success', async (t) => {
  let finish: (status: SandboxStatusT) => void = () => {};
  const { calls, listeners } = installWindow(t, (channel) =>
    channel === 'sandbox.setup'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(needsSetup),
  );
  await useSandboxSetupStore.getState().load();
  const running = useSandboxSetupStore.getState().setup();

  assert.equal(useSandboxSetupStore.getState().busy, 'setup');
  assert.equal(typeof useSandboxSetupStore.getState().setupStartedAt, 'number');
  assert.equal(await useSandboxSetupStore.getState().load(), needsSetup);
  assert.deepEqual(
    calls.map((call) => call.channel),
    ['sandbox.status', 'sandbox.setup'],
  );
  assert.deepEqual(calls[1]?.input, {
    expectedRevision: 3,
    confirmation: 'allow-sandbox-setup',
  });
  assert.equal(useSandboxSetupStore.getState().setupPhase, null);
  listeners.get('sandbox.setupProgress')?.({ phase: 'awaiting-elevation' });
  assert.equal(useSandboxSetupStore.getState().setupPhase, 'awaiting-elevation');

  finish(ready);
  await running;
  const state = useSandboxSetupStore.getState();
  assert.equal(state.busy, null);
  assert.equal(state.setupStartedAt, null);
  assert.equal(state.setupPhase, null);
  assert.equal(listeners.has('sandbox.setupProgress'), false, 'progress listener removed');
  assert.equal(state.setupFailed, false);
  assert.equal(state.status, ready);
  assert.deepEqual(
    useToastStore.getState().toasts.map((toast) => [toast.tone, toast.message]),
    [['success', translateMessage('settings.sandbox.setupSucceeded')]],
  );
});

test('an unfinished setup leaves a failure for the card to explain and retry', async (t) => {
  installWindow(t, async (channel) => (channel === 'sandbox.setup' ? uacTimeout : needsSetup));
  await useSandboxSetupStore.getState().load();
  await useSandboxSetupStore.getState().setup();

  assert.equal(useSandboxSetupStore.getState().setupFailed, true);
  assert.equal(useSandboxSetupStore.getState().status, uacTimeout);
  assert.equal(useToastStore.getState().toasts.length, 0);
  useSandboxSetupStore.getState().dismissFailure();
  assert.equal(useSandboxSetupStore.getState().setupFailed, false);
});

test('the launch check reads status, never starts setup, and honours Later', async (t) => {
  let status = needsSetup;
  const { calls, storage } = installWindow(t, async () => status);

  assert.equal(await checkSandboxSetupOffer(), true);
  dismissSandboxSetupOffer();
  assert.equal(storage.get(SANDBOX_OFFER_DISMISSED_KEY), '1');
  assert.equal(await checkSandboxSetupOffer(), false);

  status = { ...needsSetup, setup: { ...needsSetup.setup, interrupted: true } };
  assert.equal(await checkSandboxSetupOffer(), true, 'Later does not hide a half-done setup');
  assert.deepEqual(
    calls.map((call) => call.channel),
    ['sandbox.status', 'sandbox.status', 'sandbox.status'],
  );
});
