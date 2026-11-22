import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveRuntimeExitRecoveryStartup,
  runtimeExitFailureDialog,
  runtimeExitFailureRequiresRestart,
  runRuntimeStartupBoundary,
} from '../window/runtime-exit-recovery.js';

const unexpectedRelease = async (): Promise<void> => {
  throw new Error('unexpected exit-record release');
};

function recordingStartup(order: string[]) {
  return {
    releaseBlockedExit: async (settlement: { readonly reason: string }) => {
      order.push(`release:${settlement.reason}`);
    },
    reconcileOwnerPolicy: async () => {
      order.push('owner-reconcile');
      return true;
    },
    prepareStartup: async () => {
      order.push('prepare');
    },
    initializeRuntime: () => {
      order.push('initialize');
    },
  };
}

test('failed ACL cleanup names the real recovery action instead of promising to keep Space open', () => {
  const dialog = runtimeExitFailureDialog(
    'Runtime close: Windows sandbox ACL cleanup was not confirmed; stop the retained owner or restart Windows before more sandboxed commands.',
    true,
    'zh-CN',
  );

  assert.match(dialog.message, /ACL/);
  assert.match(dialog.detail, /重启 Windows/);
  assert.match(dialog.detail, /请勿手动删除 ACL marker/);
  assert.deepEqual(dialog.buttons, ['重启 Space 尝试恢复', '强行关闭 Space']);
});

test('ACL text alone selects the Space recovery restart action', () => {
  const message = 'Windows sandbox ACL cleanup was not confirmed.';
  assert.equal(runtimeExitFailureRequiresRestart(message, false), true);
  const presentation = runtimeExitFailureDialog(message, false, 'zh-CN');
  assert.equal(presentation.buttons[0], '重启 Space 尝试恢复');
  assert.match(presentation.detail, /若仍提示同一 Windows 启动周期/);
});

test('the actual startup boundary orders settlement, owner reconciliation, and initialization', async () => {
  const order: string[] = [];
  const decision = await runRuntimeStartupBoundary({
    recoveryRequested: true,
    scanPendingExit: true,
    releaseBlockedExit: unexpectedRelease,
    settle: async () => {
      order.push('settle');
      return {
        status: 'blocked',
        reason: 'stop_not_accepted',
        nextAction: 'keep-open',
        message: 'no exit intent is pending',
      };
    },
    reconcileOwnerPolicy: async () => {
      order.push('owner-reconcile');
      return true;
    },
    prepareStartup: async () => {
      order.push('prepare');
    },
    initializeRuntime: () => {
      order.push('initialize');
    },
  });

  assert.equal(decision.action, 'continue');
  assert.deepEqual(order, ['settle', 'owner-reconcile', 'prepare', 'initialize']);
});

test('successful recovery exits before owner reconciliation or initialization', async () => {
  const order: string[] = [];
  const decision = await runRuntimeStartupBoundary({
    recoveryRequested: true,
    scanPendingExit: true,
    releaseBlockedExit: unexpectedRelease,
    settle: async () => {
      order.push('settle');
      return { status: 'recovered', repairs: ['windows_sandbox_acl'] };
    },
    reconcileOwnerPolicy: async () => {
      order.push('owner-reconcile');
      return true;
    },
    prepareStartup: async () => {
      order.push('prepare');
    },
    initializeRuntime: () => {
      order.push('initialize');
    },
  });

  assert.equal(decision.action, 'exit');
  assert.deepEqual(order, ['settle']);
});

test('a prepared but unaccepted exit can continue normal startup without forced recovery', async () => {
  const decision = await resolveRuntimeExitRecoveryStartup({
    requested: true,
    settle: async () => ({
      status: 'blocked',
      reason: 'stop_not_accepted',
      nextAction: 'keep-open',
      message: 'stop was not accepted',
    }),
  });

  assert.equal(decision.action, 'continue');
});

test('an ambiguous prepared exit blocks startup until management convergence', async () => {
  const settlement = {
    status: 'blocked' as const,
    reason: 'stop_not_accepted' as const,
    nextAction: 'relaunch-space' as const,
    message: 'management reconnect is required',
  };
  const decision = await resolveRuntimeExitRecoveryStartup({
    requested: false,
    scanPending: true,
    settle: async () => settlement,
  });

  assert.deepEqual(decision, { action: 'block', settlement });
});

test('transient Windows settlement uncertainty retries automatically until recovery is proved', async () => {
  const order: string[] = [];
  let attempts = 0;
  const decision = await resolveRuntimeExitRecoveryStartup({
    requested: true,
    scanPending: true,
    settle: async () => {
      attempts += 1;
      order.push(`settle:${attempts}`);
      return attempts < 3
        ? {
            status: 'blocked' as const,
            reason: 'cleanup_unverified' as const,
            nextAction: 'retry-automatically' as const,
            message: 'the exact Windows owner has not settled yet',
          }
        : { status: 'recovered' as const, repairs: ['windows_sandbox_acl'] as const };
    },
    waitBeforeAutomaticRetry: async (attempt) => {
      order.push(`wait:${attempt}`);
    },
  });

  assert.deepEqual(decision, {
    action: 'exit',
    settlement: { status: 'recovered', repairs: ['windows_sandbox_acl'] },
  });
  assert.deepEqual(order, ['settle:1', 'wait:1', 'settle:2', 'wait:2', 'settle:3']);
});

test('shutdown aborts an automatic recovery wait without showing a stale blocker', async () => {
  const shutdown = new AbortController();
  let waiting = false;
  const decisionPromise = resolveRuntimeExitRecoveryStartup({
    requested: true,
    scanPending: true,
    settle: async () => ({
      status: 'blocked' as const,
      reason: 'cleanup_unverified' as const,
      nextAction: 'retry-automatically' as const,
      message: 'the exact Windows owner has not settled yet',
    }),
    waitBeforeAutomaticRetry: async () => {
      waiting = true;
      await new Promise<void>(() => undefined);
    },
    shutdownSignal: shutdown.signal,
  });

  while (!waiting) await Promise.resolve();
  shutdown.abort();

  assert.deepEqual(await decisionPromise, { action: 'cancelled' });
});

test('a stalled SDK verification is released after the startup budget and Space still starts', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const order: string[] = [];
  let decision: Awaited<ReturnType<typeof runRuntimeStartupBoundary>> | undefined;
  const pending = runRuntimeStartupBoundary({
    recoveryRequested: false,
    scanPendingExit: true,
    settle: () => new Promise(() => undefined),
    ...recordingStartup(order),
  }).then((result) => {
    decision = result;
  });

  context.mock.timers.tick(30_000);
  await pending;

  assert.equal(decision?.action, 'continue');
  assert.deepEqual(order, [
    'release:verification_timeout',
    'owner-reconcile',
    'prepare',
    'initialize',
  ]);
});

test('repeated pending results are bounded by the budget and then released', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const order: string[] = [];
  const pending = runRuntimeStartupBoundary({
    recoveryRequested: false,
    scanPendingExit: true,
    settle: async () => ({
      status: 'blocked',
      reason: 'cleanup_unverified',
      nextAction: 'retry-automatically',
      message: 'outcome missing',
    }),
    waitBeforeAutomaticRetry: () => new Promise(() => undefined),
    ...recordingStartup(order),
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  context.mock.timers.tick(30_000);

  assert.equal((await pending).action, 'continue');
  assert.deepEqual(order, [
    'release:verification_timeout',
    'owner-reconcile',
    'prepare',
    'initialize',
  ]);
});

test('shutdown cancels a hung recovery read without releasing the exit record', async () => {
  const shutdown = new AbortController();
  const pending = runRuntimeStartupBoundary({
    recoveryRequested: false,
    scanPendingExit: true,
    shutdownSignal: shutdown.signal,
    settle: () => new Promise(() => undefined),
    releaseBlockedExit: unexpectedRelease,
    reconcileOwnerPolicy: async () => {
      throw new Error('unexpected owner transition');
    },
    prepareStartup: async () => {
      throw new Error('unexpected preparation');
    },
    initializeRuntime: () => {
      throw new Error('unexpected Host startup');
    },
  });
  shutdown.abort();
  assert.deepEqual(await pending, { action: 'cancelled' });
});

test('shutdown cancellation prevents owner reconciliation and Runtime initialization', async () => {
  const shutdown = new AbortController();
  const order: string[] = [];
  const decisionPromise = runRuntimeStartupBoundary({
    recoveryRequested: true,
    scanPendingExit: true,
    settle: async () => ({
      status: 'blocked' as const,
      reason: 'cleanup_unverified' as const,
      nextAction: 'retry-automatically' as const,
      message: 'the exact Windows owner has not settled yet',
    }),
    waitBeforeAutomaticRetry: async () => {
      order.push('wait');
      await new Promise<void>(() => undefined);
    },
    shutdownSignal: shutdown.signal,
    ...recordingStartup(order),
  });

  while (order.length === 0) await Promise.resolve();
  shutdown.abort();

  assert.deepEqual(await decisionPromise, { action: 'cancelled' });
  assert.deepEqual(order, ['wait']);
});

// Customer report (0.1.47-beta.2): a persisted `cleanup_failed` receipt never changes, so
// every relaunch and every "Continue verification" re-read the same verdict forever.
for (const settlement of [
  {
    status: 'blocked' as const,
    reason: 'cleanup_failed' as const,
    nextAction: 'manual-recovery' as const,
    message: 'Runtime recovery is blocked: cleanup_failed.',
  },
  {
    status: 'blocked' as const,
    reason: 'containment_active' as const,
    nextAction: 'restart-system' as const,
    message: 'Job is still active',
  },
  {
    status: 'blocked' as const,
    reason: 'owner_unverified' as const,
    nextAction: 'relaunch-space' as const,
    message: 'owner unverified',
  },
]) {
  test(`a terminal ${settlement.reason} exit verdict is released and never blocks startup`, async () => {
    const order: string[] = [];
    const decision = await runRuntimeStartupBoundary({
      recoveryRequested: true,
      scanPendingExit: true,
      settle: async () => {
        order.push('settle');
        return settlement;
      },
      ...recordingStartup(order),
    });

    assert.deepEqual(decision, { action: 'continue', settlement });
    assert.deepEqual(order, [
      'settle',
      `release:${settlement.reason}`,
      'owner-reconcile',
      'prepare',
      'initialize',
    ]);
  });
}

test('ordinary startup performs no exit settlement work', async () => {
  let calls = 0;
  const decision = await resolveRuntimeExitRecoveryStartup({
    requested: false,
    settle: async () => {
      calls += 1;
      return { status: 'clean', repairs: [] };
    },
  });

  assert.deepEqual(decision, { action: 'continue' });
  assert.equal(calls, 0);
});

test('ordinary daemon startup resumes a crash ticket but continues after recovery', async () => {
  let calls = 0;
  const decision = await resolveRuntimeExitRecoveryStartup({
    requested: false,
    scanPending: true,
    settle: async () => {
      calls += 1;
      return { status: 'recovered', repairs: ['windows_process_tree'] };
    },
  });

  assert.deepEqual(decision, {
    action: 'continue',
    settlement: { status: 'recovered', repairs: ['windows_process_tree'] },
  });
  assert.equal(calls, 1);
});
