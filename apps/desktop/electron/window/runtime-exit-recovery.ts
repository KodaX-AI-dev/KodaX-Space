import type { RuntimeExitSettlement } from '../kodax/runtime-host-adapter.js';
import { isWindowsAclRecoveryText } from '../kodax/sandbox-controller.js';

type BlockedRuntimeExitSettlement = Extract<RuntimeExitSettlement, { readonly status: 'blocked' }>;

export interface RuntimeExitFailureDialogPresentation {
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly buttons: readonly [string, string];
}

export function runtimeExitFailureRequiresRestart(
  errorMessage: string,
  structuredRestartRequired: boolean,
): boolean {
  return structuredRestartRequired || isWindowsAclRecoveryText(errorMessage);
}

export function runtimeExitFailureDialog(
  errorMessage: string,
  restartRequired: boolean,
  locale: 'zh-CN' | 'en',
): RuntimeExitFailureDialogPresentation {
  const zh = locale === 'zh-CN';
  const aclRecovery = isWindowsAclRecoveryText(errorMessage);
  const recoveryRestartRequired = runtimeExitFailureRequiresRestart(errorMessage, restartRequired);
  const firstAction = recoveryRestartRequired
    ? zh
      ? '重启 Space 尝试恢复'
      : 'Restart Space to try recovery'
    : zh
      ? '保持 Space 开启'
      : 'Keep Space open';
  if (aclRecovery) {
    return {
      title: zh ? 'Windows 沙箱恢复待完成' : 'Windows sandbox recovery is pending',
      message: zh
        ? 'Space 无法确认命令沙箱 ACL 已恢复'
        : 'Space could not confirm that command-sandbox ACLs were restored',
      detail: zh
        ? '本次退出没有通过安全确认。Space 会先重启并尝试恢复；若仍提示同一 Windows 启动周期，请退出 Space、重启 Windows 后再打开。请勿手动删除 ACL marker。“强行关闭 Space”只会关闭当前应用，不能确认 ACL 已恢复。'
        : 'This exit did not pass safety verification. Space will restart and try recovery first. If the same-Windows-boot warning remains, quit Space, restart Windows, and reopen it. Do not delete ACL markers manually. “Force close Space” only closes this app; it does not confirm ACL recovery.',
      buttons: [firstAction, zh ? '强行关闭 Space' : 'Force close Space'],
    };
  }
  return {
    title: zh ? '暂时无法安全退出' : 'Space cannot quit safely yet',
    message: zh
      ? 'Runtime 退出准备没有安全完成'
      : 'Runtime complete-exit preparation did not finish safely',
    detail: restartRequired
      ? zh
        ? 'Space 需要重启并进入 Runtime 恢复流程；恢复完成前不会启动新的 Coder Runtime。强行关闭只停止当前 Space 所属任务。'
        : 'Space must restart into Runtime recovery and will not start a new Coder Runtime before recovery completes. Force close only stops work owned by this Space.'
      : zh
        ? '保持 Space 开启可保留当前状态；强行关闭会停止当前 Space 所属任务并完全退出。'
        : 'Keep Space open to preserve the current state. Force close stops work owned by this Space and exits completely.',
    buttons: [firstAction, zh ? '强行关闭 Space' : 'Force close Space'],
  };
}

export type RuntimeExitRecoveryStartupDecision =
  | { readonly action: 'continue'; readonly settlement?: RuntimeExitSettlement }
  | { readonly action: 'cancelled'; readonly settlement?: RuntimeExitSettlement }
  | {
      readonly action: 'exit';
      readonly settlement: Exclude<RuntimeExitSettlement, { readonly status: 'blocked' }>;
    }
  | {
      readonly action: 'block';
      readonly settlement: Extract<RuntimeExitSettlement, { readonly status: 'blocked' }>;
    };

interface RuntimeExitRecoveryStartupInput {
  readonly requested: boolean;
  readonly scanPending?: boolean;
  readonly settle: () => Promise<RuntimeExitSettlement>;
  readonly waitBeforeAutomaticRetry?: (
    attempt: number,
    shutdownSignal?: AbortSignal,
  ) => Promise<void>;
  readonly continueAutomaticRetry?: () => boolean;
  readonly shutdownSignal?: AbortSignal;
}

function recoveryStartupCancelled(input: RuntimeExitRecoveryStartupInput): boolean {
  return (
    input.shutdownSignal?.aborted === true || (input.continueAutomaticRetry?.() ?? true) === false
  );
}

function shutdownSignalAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function waitForRetryDelay(delayMs: number, shutdownSignal?: AbortSignal): Promise<boolean> {
  if (shutdownSignal?.aborted === true) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => finish(true), delayMs);
    const finish = (completed: boolean): void => {
      clearTimeout(timer);
      shutdownSignal?.removeEventListener('abort', onAbort);
      resolve(completed);
    };
    const onAbort = (): void => finish(false);
    shutdownSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function waitBeforeRecoveryRetry(
  input: RuntimeExitRecoveryStartupInput,
  attempt: number,
): Promise<boolean> {
  if (input.waitBeforeAutomaticRetry === undefined) {
    const delayMs = Math.min(5_000, 250 * 2 ** Math.min(attempt - 1, 5));
    return waitForRetryDelay(delayMs, input.shutdownSignal);
  }
  if (input.shutdownSignal === undefined) {
    await input.waitBeforeAutomaticRetry(attempt);
    return true;
  }
  if (input.shutdownSignal.aborted) return false;
  return new Promise<boolean>((resolve, reject) => {
    const onAbort = (): void => finish(false);
    const finish = (completed: boolean): void => {
      input.shutdownSignal?.removeEventListener('abort', onAbort);
      resolve(completed);
    };
    input.shutdownSignal?.addEventListener('abort', onAbort, { once: true });
    void input.waitBeforeAutomaticRetry?.(attempt, input.shutdownSignal).then(
      () => finish(true),
      (error: unknown) => {
        input.shutdownSignal?.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export async function resolveRuntimeExitRecoveryStartup(
  input: RuntimeExitRecoveryStartupInput,
): Promise<RuntimeExitRecoveryStartupDecision> {
  if (recoveryStartupCancelled(input)) return { action: 'cancelled' };
  if (!(input.scanPending ?? input.requested)) return { action: 'continue' };
  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), 30_000);
  const shutdownSignal = input.shutdownSignal
    ? AbortSignal.any([input.shutdownSignal, budget.signal])
    : budget.signal;
  let lastSettlement: RuntimeExitSettlement | undefined;
  try {
    const decision = await resolveBoundedRuntimeExitRecovery({
      ...input,
      shutdownSignal,
      settle: async () => {
        lastSettlement = await input.settle();
        return lastSettlement;
      },
    });
    if (budget.signal.aborted && !recoveryStartupCancelled(input)) {
      return {
        action: 'block',
        settlement: {
          status: 'blocked',
          reason: 'verification_timeout',
          nextAction: 'retry-automatically',
          message: 'Runtime exit verification is still pending after 30 seconds.',
          ...(lastSettlement?.receipt ? { receipt: lastSettlement.receipt } : {}),
        },
      };
    }
    return decision;
  } finally {
    clearTimeout(timer);
  }
}

function waitForRecoveryOperation<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T | undefined> {
  if (signal?.aborted) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const onAbort = (): void => resolve(undefined);
    signal?.addEventListener('abort', onAbort, { once: true });
    void Promise.resolve()
      .then(operation)
      .then(resolve, reject)
      .finally(() => {
        signal?.removeEventListener('abort', onAbort);
      });
  });
}

async function resolveBoundedRuntimeExitRecovery(
  input: RuntimeExitRecoveryStartupInput,
): Promise<RuntimeExitRecoveryStartupDecision> {
  let automaticRetryAttempt = 0;
  let settlement = await waitForRecoveryOperation(input.settle, input.shutdownSignal);
  if (!settlement || recoveryStartupCancelled(input)) return { action: 'cancelled' };
  while (
    settlement.status === 'blocked' &&
    settlement.nextAction === 'retry-automatically' &&
    !recoveryStartupCancelled(input)
  ) {
    automaticRetryAttempt += 1;
    const completedWait = await waitBeforeRecoveryRetry(input, automaticRetryAttempt);
    if (!completedWait || recoveryStartupCancelled(input)) return { action: 'cancelled' };
    settlement = await waitForRecoveryOperation(input.settle, input.shutdownSignal);
    if (!settlement || recoveryStartupCancelled(input)) return { action: 'cancelled' };
  }
  if (settlement.status !== 'blocked') {
    return input.requested ? { action: 'exit', settlement } : { action: 'continue', settlement };
  }
  if (settlement.nextAction === 'keep-open') {
    return { action: 'continue', settlement };
  }
  return { action: 'block', settlement };
}

/**
 * Startup always converges. The exit check is bounded and advisory: a verdict that cannot
 * prove a clean exit (a persisted `cleanup_failed`, an expired 30-second wait, ...) never
 * changes on its own, so blocking on it would trap every later launch. The SDK owner lock
 * and sandbox admission remain the guards against a live competing Host.
 */
export async function runRuntimeStartupBoundary(input: {
  readonly recoveryRequested: boolean;
  readonly scanPendingExit: boolean;
  readonly settle: () => Promise<RuntimeExitSettlement>;
  readonly waitBeforeAutomaticRetry?: (
    attempt: number,
    shutdownSignal?: AbortSignal,
  ) => Promise<void>;
  readonly continueAutomaticRetry?: () => boolean;
  readonly shutdownSignal?: AbortSignal;
  /** Records the verdict and stops re-reading it; must not throw. */
  readonly releaseBlockedExit: (settlement: BlockedRuntimeExitSettlement) => Promise<void>;
  readonly reconcileOwnerPolicy: () => Promise<boolean>;
  readonly prepareStartup: () => Promise<void>;
  readonly initializeRuntime: (ownerPolicyReady: boolean) => void;
}): Promise<Exclude<RuntimeExitRecoveryStartupDecision, { readonly action: 'block' }>> {
  const decision = await resolveRuntimeExitRecoveryStartup({
    requested: input.recoveryRequested,
    scanPending: input.scanPendingExit,
    settle: input.settle,
    ...(input.waitBeforeAutomaticRetry !== undefined
      ? { waitBeforeAutomaticRetry: input.waitBeforeAutomaticRetry }
      : {}),
    ...(input.continueAutomaticRetry !== undefined
      ? { continueAutomaticRetry: input.continueAutomaticRetry }
      : {}),
    ...(input.shutdownSignal !== undefined ? { shutdownSignal: input.shutdownSignal } : {}),
  });
  if (decision.action === 'cancelled' || decision.action === 'exit') return decision;
  if (decision.action === 'block') {
    await input.releaseBlockedExit(decision.settlement);
    if (shutdownSignalAborted(input.shutdownSignal)) return { action: 'cancelled' };
  }
  const ownerPolicyReady = await input.reconcileOwnerPolicy();
  if (shutdownSignalAborted(input.shutdownSignal)) return { action: 'cancelled' };
  await input.prepareStartup();
  if (shutdownSignalAborted(input.shutdownSignal)) return { action: 'cancelled' };
  input.initializeRuntime(ownerPolicyReady);
  return decision.settlement === undefined
    ? { action: 'continue' }
    : { action: 'continue', settlement: decision.settlement };
}
