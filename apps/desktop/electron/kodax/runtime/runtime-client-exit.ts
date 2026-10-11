import { randomUUID } from 'node:crypto';
import type { ClientExitReceipt, RuntimeClientInfo } from '@kodax-ai/kodax/client';
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

/** Space mode-switch result, produced after SDK verifies exit and Space acquires its fence. */
export interface RuntimeDaemonRollbackResult {
  readonly accepted: true;
  readonly runtimeId: string;
  readonly revision: number;
  readonly ownerPolicy: RuntimeOwnerPolicyState & { readonly mode: 'inline' };
}

export function projectClientExitReceipt(receipt: ClientExitReceipt): RuntimeExitSettlement {
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
