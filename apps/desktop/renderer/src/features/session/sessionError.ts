import type { SessionEvent } from '@kodax-space/space-ipc-schema';
import type { ConversationMessage } from './composeMessages.js';

export function isCancelledSessionError(event: SessionEvent): boolean {
  const failureKind =
    event.kind === 'session_error'
      ? (event.failureDetail?.failureKind ?? event.failureKind)
      : undefined;
  if (failureKind === 'provider_aborted') return false;
  return (
    event.kind === 'session_error' &&
    (event.category === 'cancelled' || event.error === 'cancelled')
  );
}

type SystemNoticeMessage = Extract<ConversationMessage, { kind: 'system_notice' }>;

/** A run the user stopped surfaces through the error channel but is not a failure. */
export function isCancelledNotice(
  message: Pick<SystemNoticeMessage, 'failureKind' | 'failureDetail' | 'terminal'>,
): boolean {
  const failureKind =
    message.failureDetail?.failureKind ?? message.failureKind ?? message.terminal?.failureKind;
  return failureKind === 'cancelled' || message.terminal?.kind === 'cancelled';
}
