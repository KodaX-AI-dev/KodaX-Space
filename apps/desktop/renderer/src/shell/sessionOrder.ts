import type { SessionMeta } from '@kodax-space/space-ipc-schema';
import type { SessionStatus } from '../features/session/useSessionStatus.js';

/**
 * F149: 项目内任务平铺（fork 也是独立任务）。运行中（running / awaiting）在前，层内按 createdAt
 * 新→旧、sessionId 打破平局，流式输出时行不换位；其余按 lastActivityAt 新→旧。
 */
export function sortProjectSessions(
  sessions: readonly SessionMeta[],
  statusFor: (sessionId: string) => SessionStatus = () => 'idle',
): SessionMeta[] {
  const isRunning = (s: SessionMeta): boolean => {
    const status = statusFor(s.sessionId);
    return status === 'running' || status === 'awaiting';
  };
  return [...sessions].sort((a, b) => {
    const ra = isRunning(a);
    if (ra !== isRunning(b)) return ra ? -1 : 1;
    if (!ra) return b.lastActivityAt - a.lastActivityAt;
    return b.createdAt - a.createdAt || a.sessionId.localeCompare(b.sessionId);
  });
}

/** F149: 置顶区的任务——最近置顶的在最上。 */
export function sortPinnedSessions(
  sessions: readonly SessionMeta[],
  pinnedAt: (sessionId: string) => number | undefined,
): SessionMeta[] {
  return [...sessions].sort((a, b) => (pinnedAt(b.sessionId) ?? 0) - (pinnedAt(a.sessionId) ?? 0));
}
