import type {
  SessionMeta,
  SpaceRuntimeProfileProjectionT,
  SpaceSessionLiveProjectionT,
} from '@kodax-space/space-ipc-schema';

import { sdkEffortToReasoningMode } from '../shell/effortLadder.js';
import { sessionMatchesScope } from '../lib/sessionScope.js';

/**
 * Apply daemon-owned settings to the renderer's session projection.
 *
 * The daemon may update `effort` without also sending Space's legacy
 * `reasoningMode`. In that case, translate the published KodaX effort rung so
 * another client's change is visible in the existing effort selector.
 */
export function mergeRuntimeSettingsIntoSessions(
  sessions: readonly SessionMeta[],
  projection: SpaceSessionLiveProjectionT,
): readonly SessionMeta[] {
  const settings = projection.settings?.value;
  if (!settings) return sessions;
  return sessions.map((session) => {
    if (session.sessionId !== projection.sessionId || session.surface !== 'code') return session;
    const effortMode = settings.effort ? sdkEffortToReasoningMode(settings.effort) : null;
    const legacyMode = settings.reasoningMode
      ? sdkEffortToReasoningMode(settings.reasoningMode)
      : null;
    const next: SessionMeta = {
      ...session,
      ...(settings.provider ? { provider: settings.provider } : {}),
      ...(effortMode
        ? { reasoningMode: effortMode }
        : legacyMode
          ? { reasoningMode: legacyMode }
          : {}),
      ...(settings.permissionMode ? { permissionMode: settings.permissionMode } : {}),
      ...(settings.agentMode ? { agentMode: settings.agentMode } : {}),
    };
    if (settings.model) {
      next.model = settings.model;
    } else if (settings.provider && settings.provider !== session.provider) {
      // An omitted model is not a request to erase the effective model on an
      // unrelated partial settings update. Only discard the previous model
      // when the provider itself changed, so the new provider default can win.
      delete next.model;
    }
    return next;
  });
}

/**
 * Overlay daemon-owned session timestamps onto the sidebar projection.
 *
 * `session.list` may race Runtime startup and older SDK summaries only expose
 * `createdAt`. Keeping this merge in the renderer means a later profile
 * snapshot still repairs both the displayed timestamp and recency ordering.
 */
export function mergeRuntimeActivityIntoSessions(
  sessions: readonly SessionMeta[],
  profile: SpaceRuntimeProfileProjectionT | null,
  previousSessions: readonly SessionMeta[] = [],
): readonly SessionMeta[] {
  if (sessions.length === 0) return sessions;

  const runtimeBySessionId = new Map(
    profile?.sessions.map((session) => [session.sessionId, session] as const),
  );
  const activityBySessionId = new Map(
    profile?.sessionActivity?.map((activity) => [activity.sessionId, activity.lastActivityAt]),
  );
  const previousBySessionId = new Map(
    previousSessions.map((session) => [session.sessionId, session]),
  );
  let changed = false;
  const merged = sessions.map((session) => {
    if ((session.surface ?? 'code') !== 'code') return session;
    const candidate = previousBySessionId.get(session.sessionId);
    const previous =
      candidate &&
      sessionMatchesScope(candidate, {
        projectRoot: session.projectRoot,
        surface: 'code',
      })
        ? candidate
        : undefined;
    const next = mergeSessionActivity(
      session,
      runtimeBySessionId.get(session.sessionId),
      previous,
      activityBySessionId.get(session.sessionId) ?? 0,
    );
    changed ||= next !== session;
    return next;
  });
  return changed ? merged : sessions;
}

function mergeSessionActivity(
  session: SessionMeta,
  runtimeSession: SpaceRuntimeProfileProjectionT['sessions'][number] | undefined,
  previous: SessionMeta | undefined,
  runtimeActivityAt: number,
): SessionMeta {
  const messageTimes = [
    session.lastMessageAt,
    runtimeSession?.lastMessageAt,
    previous?.lastMessageAt,
  ].filter((time): time is number => time !== undefined);
  const lastMessageAt = messageTimes.length > 0 ? Math.max(...messageTimes) : undefined;
  const localInputTimes = [session.lastLocalInputAt, previous?.lastLocalInputAt].filter(
    (time): time is number => time !== undefined,
  );
  const lastLocalInputAt = localInputTimes.length > 0 ? Math.max(...localInputTimes) : undefined;
  const createdAt = session.createdAt > 0 ? session.createdAt : (runtimeSession?.createdAt ?? 0);
  const lastActivityAt =
    lastMessageAt !== undefined
      ? Math.max(lastMessageAt, lastLocalInputAt ?? 0)
      : Math.max(
          createdAt,
          session.lastActivityAt,
          runtimeSession?.lastActivityAt ?? 0,
          runtimeActivityAt,
          previous?.lastActivityAt ?? 0,
          lastLocalInputAt ?? 0,
        );
  if (
    createdAt === session.createdAt &&
    lastActivityAt === session.lastActivityAt &&
    lastMessageAt === session.lastMessageAt &&
    lastLocalInputAt === session.lastLocalInputAt
  ) {
    return session;
  }
  return {
    ...session,
    createdAt,
    lastActivityAt,
    ...(lastMessageAt !== undefined ? { lastMessageAt } : {}),
    ...(lastLocalInputAt !== undefined ? { lastLocalInputAt } : {}),
  };
}
