import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPackagedShellProbeToolInput,
  getPackagedShellProbeBackend,
} from '../packaged-shell-probe.mjs';

test('packaged shell probe reserves a Windows sandbox lifecycle budget', () => {
  assert.deepEqual(createPackagedShellProbeToolInput('Write-Output ok', 'win32'), {
    command: 'Write-Output ok',
    timeout: 180,
  });
});

test('packaged shell probe keeps the SDK timeout on other platforms', () => {
  assert.deepEqual(createPackagedShellProbeToolInput('printf ok', 'linux'), {
    command: 'printf ok',
  });
});

test('packaged shell proof preserves the native policy identity', () => {
  assert.equal(
    getPackagedShellProbeBackend([
      {
        observation: {
          version: 1,
          state: 'applied',
          policyId: 'kodax-workspace-shell-v1',
          backend: 'windows-restricted-user',
        },
      },
    ]),
    'windows-restricted-user',
  );
});

for (const reason of [
  'not_ready',
  'prepare_failed',
  'backend_failed',
  'session_reset_pending',
  'acl_transition_pending',
]) {
  test(`packaged shell proof accepts SDK permission-policy fallback (${reason})`, () => {
    assert.equal(
      getPackagedShellProbeBackend([
        {
          observation: {
            version: 1,
            state: 'fallback',
            reason,
            execution: 'normal_permission_policy',
          },
        },
      ]),
      'normal-permission-policy',
    );
  });
}

for (const observation of [
  { version: 1, state: 'applied', policyId: 'foreign-policy', backend: 'windows-restricted-user' },
  { version: 1, state: 'fallback', reason: 'unknown', execution: 'normal_permission_policy' },
  { version: 1, state: 'fallback', reason: 'backend_failed', execution: 'unchecked' },
  {
    version: 2,
    state: 'fallback',
    reason: 'backend_failed',
    execution: 'normal_permission_policy',
  },
  { version: 1, state: 'not_selected' },
]) {
  test(`packaged shell proof rejects unsupported execution evidence ${JSON.stringify(observation)}`, () => {
    assert.equal(getPackagedShellProbeBackend([{ observation }]), undefined);
  });
}

test('packaged shell proof reports the final fallback instead of an earlier native attempt', () => {
  assert.equal(
    getPackagedShellProbeBackend([
      {
        observation: {
          version: 1,
          state: 'applied',
          policyId: 'kodax-workspace-shell-v1',
          backend: 'windows-restricted-user',
        },
      },
      {
        observation: {
          version: 1,
          state: 'fallback',
          reason: 'backend_failed',
          execution: 'normal_permission_policy',
        },
      },
    ]),
    'normal-permission-policy',
  );
});
