import { useEffect } from 'react';
import { useAppStore } from '../../store/appStore.js';
import { sessionAttentionKind } from '../session/sessionAttention.js';
import {
  SESSION_STATUS_STATE_KEYS,
  selectSessionStatuses,
  type SessionStatusState,
} from '../session/useSessionStatus.js';
import { countAttentionSessions } from './appBadgeModel.js';

type AppSnapshot = ReturnType<typeof useAppStore.getState>;

const BADGE_STATE_KEYS = [
  ...SESSION_STATUS_STATE_KEYS,
  'sessions',
  'currentSessionId',
  'sessionFlags',
] as const satisfies readonly (keyof AppSnapshot)[];

export type AppBadgeStoreState = SessionStatusState &
  Pick<AppSnapshot, 'sessions' | 'currentSessionId' | 'sessionFlags'>;

const MAX_APP_BADGE_COUNT = 9999;

interface AppBadgeStore {
  getState(): AppBadgeStoreState;
  subscribe(
    listener: (state: AppBadgeStoreState, previousState: AppBadgeStoreState) => void,
  ): () => void;
}

/** Same rule as the sidebar project summary, so the badge and the sidebar never disagree. */
function errorSessionIds(state: AppBadgeStoreState): string[] {
  const ids = state.sessions.map((session) => session.sessionId);
  const statuses = selectSessionStatuses(state, ids);
  return ids.filter(
    (sessionId) =>
      sessionAttentionKind({
        status: statuses[sessionId] ?? 'idle',
        unread: state.sessionFlags[sessionId]?.unread === true,
        isCurrent: sessionId === state.currentSessionId,
      }) === 'error',
  );
}

export function subscribeAppBadgeCount(
  store: AppBadgeStore,
  setCount: (count: number) => void,
): () => void {
  let lastCount: number | undefined;
  const sync = (state: AppBadgeStoreState, previousState?: AppBadgeStoreState): void => {
    if (previousState && BADGE_STATE_KEYS.every((key) => state[key] === previousState[key])) {
      return;
    }
    const count = Math.min(
      countAttentionSessions({
        sessionFlags: state.sessionFlags,
        permissionRequests: state.permissionQueue,
        askUserRequests: state.askUserQueue,
        errorSessionIds: errorSessionIds(state),
      }),
      MAX_APP_BADGE_COUNT,
    );
    if (count === lastCount) return;
    lastCount = count;
    setCount(count);
  };

  sync(store.getState());
  return store.subscribe(sync);
}

export function useAppBadgeCount(): void {
  useEffect(() => {
    if (!window.kodaxSpace) return;
    return subscribeAppBadgeCount(useAppStore, (count) => {
      void window.kodaxSpace?.invoke('window.setBadgeCount', { count }).catch(() => {
        // Badge support is best-effort; main logs native failures and Session work must continue.
      });
    });
  }, []);
}
