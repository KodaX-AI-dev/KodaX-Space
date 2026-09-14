import { useEffect, useRef, useState } from 'react';
import { usePartnerRemoteRecords } from '../extensions/usePartnerRemoteRecords.js';
import { useAppStore } from '../../store/appStore.js';
import {
  createPartnerBaseTaskTracker,
  partnerDetailTargetForBaseTaskEvent,
  projectPartnerBaseTaskUpdate,
  type PartnerBaseTaskTracker,
} from './partnerBaseTaskAutoOpen.js';
import type { PartnerDetailOpenTarget } from './partnerDetailWorkspace.js';

export function PartnerBaseTaskAutoOpener({
  onOpenDetail,
}: {
  readonly onOpenDetail: (target: PartnerDetailOpenTarget) => void;
}): null {
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const scopeKey = JSON.stringify([projectRoot, sessionId]);
  const tracker = useRef<PartnerBaseTaskTracker>(createPartnerBaseTaskTracker(scopeKey));
  const [drainRevision, setDrainRevision] = useState(0);
  const { records, loaded, baseTaskSignals } = usePartnerRemoteRecords();

  if (tracker.current.scopeKey !== scopeKey) {
    tracker.current = createPartnerBaseTaskTracker(scopeKey);
  }

  useEffect(() => {
    let nextTracker = tracker.current;
    let shouldContinue = false;
    if (baseTaskSignals.length === 0) {
      nextTracker = projectPartnerBaseTaskUpdate(nextTracker, loaded, records.baseTasks).tracker;
    }
    for (const signal of baseTaskSignals) {
      if (signal.revision <= nextTracker.lastSignalRevision) continue;
      const projection = projectPartnerBaseTaskUpdate(
        nextTracker,
        loaded,
        records.baseTasks,
        signal,
      );
      const signalConsumed = projection.tracker.lastSignalRevision === signal.revision;
      nextTracker = projection.tracker;
      if (!signalConsumed) break;
      if (projection.event) {
        onOpenDetail(partnerDetailTargetForBaseTaskEvent(projection.event));
        shouldContinue = baseTaskSignals.some(
          (candidate) => candidate.revision > nextTracker.lastSignalRevision,
        );
        break;
      }
    }
    tracker.current = nextTracker;
    if (shouldContinue) setDrainRevision((revision) => revision + 1);
  }, [baseTaskSignals, drainRevision, loaded, onOpenDetail, records.baseTasks]);

  return null;
}
