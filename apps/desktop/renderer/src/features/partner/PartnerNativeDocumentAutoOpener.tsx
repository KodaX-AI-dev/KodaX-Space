import { useEffect, useRef, useState } from 'react';
import { usePartnerRemoteRecords } from '../extensions/usePartnerRemoteRecords.js';
import { useAppStore } from '../../store/appStore.js';
import {
  createPartnerNativeDocumentTracker,
  partnerDetailTargetForNativeDocument,
  projectPartnerNativeDocumentUpdate,
  type PartnerNativeDocumentTracker,
} from './partnerNativeDocumentAutoOpen.js';
import type { PartnerDetailOpenTarget } from './partnerDetailWorkspace.js';

export function PartnerNativeDocumentAutoOpener({
  onOpenDetail,
}: {
  readonly onOpenDetail: (target: PartnerDetailOpenTarget) => void;
}): null {
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const scopeKey = JSON.stringify([projectRoot, sessionId]);
  const tracker = useRef<PartnerNativeDocumentTracker>(
    createPartnerNativeDocumentTracker(scopeKey),
  );
  const [drainRevision, setDrainRevision] = useState(0);
  const { records, loaded, documentTaskSignals } = usePartnerRemoteRecords();

  if (tracker.current.scopeKey !== scopeKey) {
    tracker.current = createPartnerNativeDocumentTracker(scopeKey);
  }

  useEffect(() => {
    let nextTracker = tracker.current;
    let shouldContinue = false;
    if (documentTaskSignals.length === 0) {
      nextTracker = projectPartnerNativeDocumentUpdate(
        nextTracker,
        loaded,
        records.documentTasks,
      ).tracker;
    }
    for (const signal of documentTaskSignals) {
      if (signal.revision <= nextTracker.lastSignalRevision) continue;
      const projection = projectPartnerNativeDocumentUpdate(
        nextTracker,
        loaded,
        records.documentTasks,
        signal,
      );
      const signalConsumed = projection.tracker.lastSignalRevision === signal.revision;
      nextTracker = projection.tracker;
      if (!signalConsumed) break;
      if (projection.event) {
        onOpenDetail(partnerDetailTargetForNativeDocument(projection.event));
        shouldContinue = documentTaskSignals.some(
          (candidate) => candidate.revision > nextTracker.lastSignalRevision,
        );
        break;
      }
    }
    tracker.current = nextTracker;
    if (shouldContinue) setDrainRevision((revision) => revision + 1);
  }, [documentTaskSignals, drainRevision, loaded, onOpenDetail, records.documentTasks]);

  return null;
}
