import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, type ComponentType, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../i18n/I18nProvider.js';
import { useAppStore } from '../store/appStore.js';
import { ActivitySpinner } from './ActivitySpinner.js';

const TestI18nProvider = I18nProvider as ComponentType<PropsWithChildren>;

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
