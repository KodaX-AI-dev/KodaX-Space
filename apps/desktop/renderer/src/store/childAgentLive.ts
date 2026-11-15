// Live-only work of each running child agent, pushed by Main (agent.childLive.changed).
// Never persisted; shown only while the session's run is streaming.

import { useSyncExternalStore } from 'react';
import type { AgentChildLiveT } from '@kodax-space/space-ipc-schema';

const EMPTY: readonly AgentChildLiveT[] = [];
const bySession = new Map<string, readonly AgentChildLiveT[]>();
const listeners = new Set<() => void>();

export function replaceChildAgentLive(update: {
  sessionId: string;
  children: readonly AgentChildLiveT[];
}): void {
  bySession.set(update.sessionId, update.children);
  for (const listener of listeners) listener();
}

export function useChildAgentLive(sessionId: string | null): readonly AgentChildLiveT[] {
  const read = () => (sessionId ? (bySession.get(sessionId) ?? EMPTY) : EMPTY);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    read,
  );
}
