import assert from 'node:assert/strict';
import test from 'node:test';
import type { RepointelStatusOutput } from '@kodax-space/space-ipc-schema';
import { repointelReadyMode } from './repointelPillMode.js';

const base = {
  initialized: true,
  engineStatus: 'ok',
  effectiveEngine: 'off',
} as const satisfies Partial<RepointelStatusOutput>;

test('a healthy semantic engine reads as its mode', () => {
  assert.equal(repointelReadyMode({ ...base, effectiveEngine: 'full' }), 'full');
  assert.equal(
    repointelReadyMode({ ...base, effectiveEngine: 'light', engineStatus: 'limited' }),
    'light',
  );
});

test('the default auto mode reads as git-based tools, not idle', () => {
  assert.equal(repointelReadyMode({ ...base, configuredMode: 'auto' }), 'git');
});

test('an explicit off, an unhealthy engine or an uninitialized Host stays idle', () => {
  assert.equal(repointelReadyMode({ ...base, configuredMode: 'off' }), undefined);
  assert.equal(repointelReadyMode({ ...base, configuredMode: 'auto', engineStatus: null }), undefined);
  assert.equal(
    repointelReadyMode({ ...base, effectiveEngine: 'full', initialized: false }),
    undefined,
  );
  assert.equal(repointelReadyMode(null), undefined);
});
