import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionMeta } from '@kodax-space/space-ipc-schema';

import { useAppStore } from '../../store/appStore.js';
import { subscribeAppBadgeCount, type AppBadgeStoreState } from './useAppBadgeCount.js';

function sessionMeta(sessionId: string): SessionMeta {
  return {
    sessionId,
    projectRoot: '/proj/x',
    provider: 'mock',
    reasoningMode: 'auto',
    permissionMode: 'accept-edits',
    agentMode: 'ama',
    surface: 'code',
    createdAt: 1700000000000,
    lastActivityAt: 1700000000000,
  };
}

function badgeState(patch: Partial<AppBadgeStoreState>): AppBadgeStoreState {
  return {
    ...useAppStore.getState(),
    sessions: [],
    currentSessionId: null,
    sessionFlags: {},
    permissionQueue: [],
    askUserQueue: [],
    eventsBySession: {},
    liveProjectionBySession: {},
    pendingSendBySession: {},
    errorSeenAtBySession: {},
    errorSeenRunIdBySession: {},
    errorSeenRunIdsBySession: {},
    runtimeProfile: null,
    ...patch,
  };
}

function fakeStore(initial: AppBadgeStoreState): {
  store: Parameters<typeof subscribeAppBadgeCount>[0];
  publish: (patch: Partial<AppBadgeStoreState>) => void;
} {
  const listeners = new Set<(state: AppBadgeStoreState, previous: AppBadgeStoreState) => void>();
  let state = initial;
  return {
    store: {
      getState: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    publish: (patch) => {
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, previous);
    },
  };
}

test('badge subscription sends the initial count and only observable count changes', () => {
  const { store, publish } = fakeStore(badgeState({ sessionFlags: { unread: { unread: true } } }));
  const counts: number[] = [];
  const unsubscribe = subscribeAppBadgeCount(store, (count) => counts.push(count));
  assert.deepEqual(counts, [1]);

  publish({});
  publish({
    permissionQueue: [{ sessionId: 'unread' }] as unknown as AppBadgeStoreState['permissionQueue'],
  });
  publish({
    askUserQueue: [{ sessionId: 'question' }] as unknown as AppBadgeStoreState['askUserQueue'],
  });
  assert.deepEqual(counts, [1, 2]);

  publish({ askUserQueue: [] });
  publish({ sessionFlags: {}, permissionQueue: [] });
  assert.deepEqual(counts, [1, 2, 1, 0]);

  unsubscribe();
  publish({ sessionFlags: { ignored: { unread: true } } });
  assert.deepEqual(counts, [1, 2, 1, 0]);
});

test('badge counts failed Sessions until the user opens them', () => {
  const failedEvents = {
    failed: [{ kind: 'session_error', sessionId: 'failed', error: 'boom' }],
  } as AppBadgeStoreState['eventsBySession'];
  const { store, publish } = fakeStore(
    badgeState({ sessions: [sessionMeta('failed')], eventsBySession: failedEvents }),
  );
  const counts: number[] = [];
  subscribeAppBadgeCount(store, (count) => counts.push(count));
  assert.deepEqual(counts, [1]);

  // Opening the Session records the error as seen.
  publish({ currentSessionId: 'failed', errorSeenAtBySession: { failed: 1 } });
  assert.deepEqual(counts, [1, 0]);
});

test('an error in the Session being viewed does not stick on the badge', () => {
  const failedEvents = {
    failed: [{ kind: 'session_error', sessionId: 'failed', error: 'boom' }],
  } as AppBadgeStoreState['eventsBySession'];
  const counts: number[] = [];
  subscribeAppBadgeCount(
    fakeStore(
      badgeState({
        sessions: [sessionMeta('failed')],
        currentSessionId: 'failed',
        eventsBySession: failedEvents,
      }),
    ).store,
    (count) => counts.push(count),
  );
  assert.deepEqual(counts, [0]);
});

test('badge subscription clamps the count to the IPC contract maximum', () => {
  const sessionFlags = Object.fromEntries(
    Array.from({ length: 10_001 }, (_, index) => [`session-${index}`, { unread: true }]),
  );
  const counts: number[] = [];

  subscribeAppBadgeCount(fakeStore(badgeState({ sessionFlags })).store, (count) =>
    counts.push(count),
  );

  assert.deepEqual(counts, [9999]);
});
