import { randomUUID } from 'node:crypto';
import type {
  ClientExitReceipt,
  ClientExitRecovery,
  RuntimeClientInfo,
} from '@kodax-ai/kodax/client';
import type { KodaXDaemonRuntime, RuntimeOwnerPolicyState } from '@kodax-ai/kodax/runtime';

/** Space dialog decisions; SDK execution evidence remains in the original receipt. */
export type RuntimeExitSettlement = (
  | {
      readonly status: 'clean' | 'recovered';
      readonly repairs: readonly ('windows_process_tree' | 'windows_sandbox_acl')[];
    }
  | {
      readonly status: 'blocked';
      readonly reason:
        | 'active_work'
        | 'cleanup_failed'
        | 'cleanup_unverified'
        | 'containment_active'
        | 'containment_unavailable'
        | 'owner_changed'
        | 'owner_identity_mismatch'
        | 'owner_unverified'
        | 'stop_not_accepted';
      readonly nextAction:
        | 'keep-open'
        | 'relaunch-space'
        | 'retry-automatically'
        | 'restart-system'
        | 'manual-recovery';
      readonly message: string;
    }
) & { readonly receipt?: ClientExitReceipt };

export interface RuntimeExitSettlementInput {
  readonly configHome: string;
  readonly homeDir?: string;
  readonly profile?: string;
  readonly runtime?: Pick<KodaXDaemonRuntime, 'lifecycle'>;
  readonly clientInfo?: RuntimeClientInfo;
  readonly requestId?: string;
  readonly shutdownHost?: boolean;
  readonly recoverOnly?: boolean;
  readonly onAccepted?: (receipt: ClientExitReceipt) => Promise<void>;
}

/** Personal cleanup can finish while a peer keeps the Host alive. Installation needs its exit. */
export function runtimeExitConfirmsHostStopped(settlement: RuntimeExitSettlement): boolean {
  const receipt = settlement.receipt;
  return (
    settlement.status !== 'blocked' &&
    receipt?.accepted === true &&
    receipt.host.state === 'succeeded' &&
    receipt.host.replacementRunning !== true &&
    receipt.host.owner?.runtimeId === receipt.runtimeId &&
    (receipt.recovery === undefined ||
      (receipt.recovery.state === 'ready' && receipt.recovery.reason === 'host_shutdown_verified'))
  );
}

/** Space mode-switch result, produced after SDK verifies exit and Space acquires its fence. */
export interface RuntimeDaemonRollbackResult {
  readonly accepted: true;
  readonly runtimeId: string;
  readonly revision: number;
  readonly ownerPolicy: RuntimeOwnerPolicyState & { readonly mode: 'inline' };
}

const RECOVERY_REASONS: Readonly<
  Record<
    ClientExitRecovery['reason'],
    Extract<RuntimeExitSettlement, { status: 'blocked' }>['reason']
  >
> = {
  host_shutdown_verified: 'cleanup_unverified',
  client_cleanup_verified: 'cleanup_unverified',
  client_cleanup_pending: 'cleanup_unverified',
  client_cleanup_unknown: 'cleanup_unverified',
  cleanup_failed: 'cleanup_failed',
  host_protected: 'active_work',
  daemon_active: 'active_work',
  containment_active: 'containment_active',
  containment_unavailable: 'containment_unavailable',
  outcome_missing: 'cleanup_unverified',
  owner_identity_unverified: 'owner_unverified',
  owner_identity_mismatch: 'owner_identity_mismatch',
};

export function projectClientExitReceipt(receipt: ClientExitReceipt): RuntimeExitSettlement {
  const recovery = receipt.recovery;
  // A protected, identity-verified shared Host may keep running for peers after
  // our own cleanup finishes. This completes only Space's client exit, never
  // certifies Host shutdown or changes the SDK's blocked shutdown assessment.
  if (
    recovery?.reason === 'host_protected' &&
    receipt.cleanup.state === 'succeeded' &&
    receipt.host.state === 'protected'
  ) {
    return { status: 'clean', repairs: [], receipt };
  }
  if (recovery) {
    if (recovery.state === 'ready') {
      return {
        status: receipt.cleanup.state === 'succeeded' ? 'clean' : 'recovered',
        repairs: [],
        receipt,
      };
    }
    return {
      status: 'blocked',
      reason: RECOVERY_REASONS[recovery.reason],
      nextAction:
        recovery.nextAction === 'retry_verification'
          ? 'retry-automatically'
          : recovery.nextAction === 'retry_exit'
            ? 'relaunch-space'
            : 'manual-recovery',
      message: `Runtime recovery is ${recovery.state}: ${recovery.reason}.`,
      receipt,
    };
  }
  if (
    receipt.cleanup.state === 'succeeded' &&
    ['succeeded', 'protected', 'not_requested'].includes(receipt.host.state)
  ) {
    return { status: 'clean', repairs: [], receipt };
  }
  return {
    status: 'blocked',
    reason:
      receipt.cleanup.state === 'failed' || receipt.host.state === 'failed'
        ? 'cleanup_failed'
        : 'cleanup_unverified',
    nextAction: 'relaunch-space',
    message:
      receipt.cleanup.issues.join('; ') ||
      receipt.host.message ||
      `Runtime exit is not verified (${receipt.cleanup.state}/${receipt.host.state}); request ${receipt.requestId}.`,
    receipt,
  };
}

export async function settleRuntimeClientExit(
  input: RuntimeExitSettlementInput,
): Promise<RuntimeExitSettlement> {
  if (input.runtime) {
    const lifecycle = input.runtime.lifecycle;
    if (!lifecycle) throw new Error('Runtime does not expose productExitControl v1.');
    const deadline = Date.now() + 15_000;
    let receipt = await withinExitDeadline(
      () =>
        lifecycle.requestExit({
          requestId: input.requestId ?? `space-exit-${randomUUID()}`,
          shutdownHost: input.shutdownHost ?? true,
        }),
      deadline,
    );
    await input.onAccepted?.(receipt);
    while (
      receipt.recovery?.state === 'pending' ||
      receipt.cleanup.state === 'pending' ||
      ['pending', 'accepted'].includes(receipt.host.state) ||
      (receipt.cleanup.state === 'succeeded' && receipt.host.state === 'unknown')
    ) {
      if (Date.now() >= deadline) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      try {
        const next = await withinExitDeadline(
          () => lifecycle.readExit(receipt.requestId),
          deadline,
        );
        if (
          !next ||
          next.runtimeId !== receipt.runtimeId ||
          next.clientId !== receipt.clientId ||
          next.requestId !== receipt.requestId
        )
          throw new Error('Exit receipt identity changed.');
        receipt = next;
      } catch (error: unknown) {
        const clientInfo = input.clientInfo;
        if (!clientInfo) throw error;
        const { readKodaXClientExits } = await import('@kodax-ai/kodax/client');
        if (Date.now() >= deadline) break;
        const receipts = await withinExitDeadline(
          () =>
            readKodaXClientExits({
              homeDir: input.homeDir,
              profile: input.profile,
              clientInfo,
            }),
          deadline,
        );
        const next = receipts.find(
          (item) => item.requestId === receipt.requestId && item.runtimeId === receipt.runtimeId,
        );
        if (!next) throw error;
        receipt = next;
      }
    }
    return projectClientExitReceipt(receipt);
  }
  if (!input.clientInfo)
    throw new Error('Stable Main client identity is required for exit recovery.');
  const { readKodaXClientExits } = await import('@kodax-ai/kodax/client');
  const receipts = await readKodaXClientExits({
    homeDir: input.homeDir,
    profile: input.profile,
    clientInfo: input.clientInfo,
  });
  const latest = [...receipts].sort((left, right) =>
    right.requestedAt.localeCompare(left.requestedAt),
  )[0];
  if (latest) await input.onAccepted?.(latest);
  for (const receipt of receipts) {
    const result = projectClientExitReceipt(receipt);
    if (result.status === 'blocked') return result;
  }
  return {
    status: receipts.length ? 'recovered' : 'clean',
    repairs: [],
    ...(latest ? { receipt: latest } : {}),
  };
}

async function withinExitDeadline<T>(read: () => Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Runtime exit confirmation timed out.')),
          Math.max(0, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
