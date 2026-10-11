import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClientExitReceipt } from '@kodax-ai/kodax/client';
import { projectClientExitReceipt, settleRuntimeClientExit } from './runtime-client-exit.js';

const receipt: ClientExitReceipt = {
  requestId: 'exit',
  clientId: 'client',
  runtimeId: 'host',
  accepted: true,
  requestedAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  cleanup: {
    state: 'succeeded',
    actorTurns: [],
    operationIds: [],
    runIds: [],
    withdrawnInputs: [],
    issues: [],
  },
  host: { requested: true, state: 'accepted', owner: { runtimeId: 'host', pid: 123 } },
};

test('an accepted Host exit does not prove complete exit', () => {
  assert.equal(projectClientExitReceipt(receipt).status, 'blocked');
});
test('verified cleanup lets Space exit while preserving another client Host', () => {
  assert.equal(
    projectClientExitReceipt({ ...receipt, host: { ...receipt.host, state: 'protected' } }).status,
    'clean',
  );
});
test('unknown client cleanup retains recovery even after Host success', () => {
  assert.equal(
    projectClientExitReceipt({
      ...receipt,
      cleanup: { ...receipt.cleanup, state: 'unknown', issues: ['executor did not settle'] },
      host: { ...receipt.host, state: 'succeeded' },
    }).status,
    'blocked',
  );
});

test('exit waits for verified cleanup using the accepted request identity', async () => {
  const calls: string[] = [];
  const result = await settleRuntimeClientExit({
    configHome: 'unused',
    requestId: 'exit',
    onAccepted: async (value) => {
      calls.push(`persist:${value.requestId}`);
    },
    runtime: {
      lifecycle: {
        requestExit: async (input) => {
          calls.push(`request:${input.requestId}`);
          return { ...receipt, cleanup: { ...receipt.cleanup, state: 'pending' } };
        },
        readExit: async (id) => {
          calls.push(`read:${id}`);
          return { ...receipt, host: { ...receipt.host, state: 'succeeded' } };
        },
        listPendingExits: async () => [],
      },
    },
  });
  assert.equal(result.status, 'clean');
  assert.deepEqual(calls, ['request:exit', 'persist:exit', 'read:exit']);
});

test('a nonresponding confirmation stays unknown and retains the accepted receipt', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let accepted = false;
  const pending = settleRuntimeClientExit({
    configHome: 'unused',
    requestId: 'exit',
    clientInfo: {
      name: 'Space',
      instanceId: 'fixture',
      instanceSecret: 'fixture-secret-01234567890123456789',
    },
    onAccepted: async () => {
      accepted = true;
    },
    runtime: {
      lifecycle: {
        requestExit: async () => ({
          ...receipt,
          cleanup: { ...receipt.cleanup, state: 'pending' },
        }),
        readExit: () => new Promise(() => undefined),
        listPendingExits: async () => [],
      },
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(15_001);
  const result = await pending;
  assert.equal(accepted, true);
  assert.equal(result.status, 'blocked');
  assert.equal(result.receipt?.requestId, 'exit');
  assert.equal(result.receipt?.cleanup.state, 'pending');
});
