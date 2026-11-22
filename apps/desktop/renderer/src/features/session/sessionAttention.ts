import type { SessionStatus } from './useSessionStatus.js';

/** Why a Session needs the user, most urgent first. Running is activity, not attention. */
export type AttentionKind = 'awaiting' | 'error' | 'done';

export const ATTENTION_PRIORITY: readonly AttentionKind[] = ['awaiting', 'error', 'done'];

export interface AttentionSummary {
  readonly total: number;
  readonly top: AttentionKind | null;
  readonly counts: Readonly<Record<AttentionKind, number>>;
}

/**
 * Error "seen" is only recorded when a Session is opened, so an error raised in the Session being
 * viewed would never clear. It counts only while still unread (it happened while the window was
 * hidden); the focus handler clears unread once the user actually looks.
 */
export function sessionAttentionKind(input: {
  readonly status: SessionStatus;
  readonly unread: boolean;
  readonly isCurrent: boolean;
}): AttentionKind | null {
  if (input.status === 'awaiting') return 'awaiting';
  if (input.status === 'running') return null;
  if (input.status === 'error' && (!input.isCurrent || input.unread)) return 'error';
  return input.unread ? 'done' : null;
}

export function summarizeAttention(kinds: Iterable<AttentionKind | null>): AttentionSummary {
  const counts: Record<AttentionKind, number> = { awaiting: 0, error: 0, done: 0 };
  let total = 0;
  for (const kind of kinds) {
    if (kind === null) continue;
    counts[kind] += 1;
    total += 1;
  }
  const top = ATTENTION_PRIORITY.find((kind) => counts[kind] > 0) ?? null;
  return { total, top, counts };
}

export interface SessionAttentionContext {
  readonly statusFor: (sessionId: string) => SessionStatus;
  readonly isUnread: (sessionId: string) => boolean;
  readonly currentSessionId: string | null;
}

export function attentionKindOf(
  sessionId: string,
  context: SessionAttentionContext,
): AttentionKind | null {
  return sessionAttentionKind({
    status: context.statusFor(sessionId),
    unread: context.isUnread(sessionId),
    isCurrent: sessionId === context.currentSessionId,
  });
}

/** One rule for every place that summarizes hidden Sessions (project, archived group, surface). */
export function summarizeSessionAttention(
  sessionIds: Iterable<string>,
  context: SessionAttentionContext,
): AttentionSummary {
  const kinds: (AttentionKind | null)[] = [];
  for (const sessionId of sessionIds) kinds.push(attentionKindOf(sessionId, context));
  return summarizeAttention(kinds);
}
