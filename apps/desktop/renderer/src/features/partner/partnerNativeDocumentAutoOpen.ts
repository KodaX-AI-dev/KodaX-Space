import type {
  PartnerNativeDocumentProviderT,
  PartnerNativeDocumentTaskSummaryT,
} from '@kodax-space/space-ipc-schema';
import type { PartnerDetailOpenTarget } from './partnerDetailWorkspace.js';

export interface PartnerNativeDocumentTracker {
  readonly scopeKey: string;
  readonly initialized: boolean;
  readonly lastSignalRevision: number;
  readonly openedResourceKeys: readonly string[];
}

export interface PartnerNativeDocumentSignal {
  readonly id: string;
  readonly revision: number;
}

export interface PartnerNativeDocumentOpenEvent {
  readonly kind: 'native-document';
  readonly task: PartnerNativeDocumentTaskSummaryT;
}

export interface PartnerNativeDocumentProjection {
  readonly tracker: PartnerNativeDocumentTracker;
  readonly event: PartnerNativeDocumentOpenEvent | null;
}

export function partnerNativeDocumentResourceKey(
  provider: PartnerNativeDocumentProviderT,
  resourceId: string,
): string {
  return `native-document-${provider.length}:${provider}:${resourceId}`;
}

function resourceKey(task: PartnerNativeDocumentTaskSummaryT): string | null {
  return task.status === 'succeeded' && task.resourceId
    ? partnerNativeDocumentResourceKey(task.provider, task.resourceId)
    : null;
}

export function createPartnerNativeDocumentTracker(scopeKey: string): PartnerNativeDocumentTracker {
  return { scopeKey, initialized: false, lastSignalRevision: 0, openedResourceKeys: [] };
}

export function partnerDetailTargetForNativeDocument(
  event: PartnerNativeDocumentOpenEvent,
): PartnerDetailOpenTarget {
  const { task } = event;
  const key = resourceKey(task);
  if (!key || !task.canonicalUrl || !task.title)
    throw new Error('Native document task is not a verified success');
  return {
    kind: 'browser',
    initialUrl: task.canonicalUrl,
    resourceKey: key,
    title: task.title,
  };
}

export function projectPartnerNativeDocumentUpdate(
  tracker: PartnerNativeDocumentTracker,
  loaded: boolean,
  tasks: readonly PartnerNativeDocumentTaskSummaryT[],
  signal: PartnerNativeDocumentSignal | null = null,
): PartnerNativeDocumentProjection {
  if (!loaded) return { tracker, event: null };
  const freshSignal = signal && signal.revision > tracker.lastSignalRevision ? signal : null;
  if (!freshSignal) {
    const historicalKeys = tracker.initialized
      ? tracker.openedResourceKeys
      : tasks.map(resourceKey).filter((key): key is string => key !== null);
    return {
      tracker: { ...tracker, initialized: true, openedResourceKeys: historicalKeys },
      event: null,
    };
  }
  const task = tasks.find((candidate) => candidate.id === freshSignal.id);
  if (!task) return { tracker: { ...tracker, initialized: true }, event: null };
  const key = resourceKey(task);
  const alreadyOpened = key === null || tracker.openedResourceKeys.includes(key);
  return {
    tracker: {
      ...tracker,
      initialized: true,
      lastSignalRevision: freshSignal.revision,
      openedResourceKeys:
        key && !alreadyOpened ? [...tracker.openedResourceKeys, key] : tracker.openedResourceKeys,
    },
    event: alreadyOpened ? null : { kind: 'native-document', task },
  };
}
