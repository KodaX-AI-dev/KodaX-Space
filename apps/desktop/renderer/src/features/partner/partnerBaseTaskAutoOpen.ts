import type { PartnerFeishuBaseCreateTaskT } from '@kodax-space/space-ipc-schema';
import type { PartnerDetailOpenTarget } from './partnerDetailWorkspace.js';

export interface PartnerBaseTaskTracker {
  readonly scopeKey: string;
  readonly initialized: boolean;
  readonly lastSignalRevision: number;
  readonly openedTaskIds: readonly string[];
}

export interface PartnerBaseTaskSignal {
  readonly id: string;
  readonly revision: number;
}

export type PartnerBaseTaskOpenEvent = {
  readonly kind: 'task';
  readonly task: PartnerFeishuBaseCreateTaskT;
};

export interface PartnerBaseTaskProjection {
  readonly tracker: PartnerBaseTaskTracker;
  readonly event: PartnerBaseTaskOpenEvent | null;
}

export function partnerDetailTargetForBaseTaskEvent(
  event: PartnerBaseTaskOpenEvent,
): PartnerDetailOpenTarget {
  return { kind: 'baseTask', task: event.task };
}

export function createPartnerBaseTaskTracker(scopeKey: string): PartnerBaseTaskTracker {
  return { scopeKey, initialized: false, lastSignalRevision: 0, openedTaskIds: [] };
}

function openEvent(task: PartnerFeishuBaseCreateTaskT | null): PartnerBaseTaskOpenEvent | null {
  return task ? { kind: 'task', task } : null;
}

export function projectPartnerBaseTaskUpdate(
  tracker: PartnerBaseTaskTracker,
  loaded: boolean,
  tasks: readonly PartnerFeishuBaseCreateTaskT[],
  signal: PartnerBaseTaskSignal | null = null,
): PartnerBaseTaskProjection {
  if (!loaded) return { tracker, event: null };
  const freshSignal = signal && signal.revision > tracker.lastSignalRevision ? signal : null;
  if (!freshSignal) {
    return {
      tracker: { ...tracker, initialized: true },
      event: null,
    };
  }
  const task = tasks.find((candidate) => candidate.id === freshSignal.id) ?? null;
  if (!task) return { tracker: { ...tracker, initialized: true }, event: null };
  const alreadyOpened = tracker.openedTaskIds.includes(task.id);
  return {
    tracker: {
      ...tracker,
      initialized: true,
      lastSignalRevision: freshSignal.revision,
      openedTaskIds: alreadyOpened ? tracker.openedTaskIds : [...tracker.openedTaskIds, task.id],
    },
    event: alreadyOpened ? null : openEvent(task),
  };
}
