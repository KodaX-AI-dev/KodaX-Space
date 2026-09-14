import type { PartnerDetailOpenTarget } from '../partner/partnerDetailWorkspace.js';
import type { PartnerRemoteRecordsT } from '@kodax-space/space-ipc-schema';
import { partnerNativeDocumentResourceKey } from '../partner/partnerNativeDocumentAutoOpen.js';

export interface PartnerRemoteResultEntry {
  readonly kind: 'documentTask' | 'receipt';
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly resourceKey: string;
  readonly revision: number;
  readonly completedAt: string;
}

/**
 * Project successful connector writes into the task-output UI. New document
 * creation comes from the generic native-document task contract; receipts are
 * retained only for already-supported, reviewed append operations.
 */
export function collectPartnerRemoteResultEntries(
  records: PartnerRemoteRecordsT,
): readonly PartnerRemoteResultEntry[] {
  const entries: PartnerRemoteResultEntry[] = [
    ...records.documentTasks.flatMap((task) =>
      task.status === 'succeeded' &&
      task.resourceId &&
      task.canonicalUrl &&
      task.revision !== undefined
        ? [
            {
              kind: 'documentTask' as const,
              id: task.id,
              title: task.title ?? task.requestedTitle,
              url: task.canonicalUrl,
              resourceKey: partnerNativeDocumentResourceKey(task.provider, task.resourceId),
              revision: task.revision,
              completedAt: task.updatedAt,
            },
          ]
        : [],
    ),
    ...records.receipts.map((receipt) => ({
      kind: 'receipt' as const,
      id: receipt.id,
      title: receipt.title,
      url: receipt.url,
      // Receipts are the legacy Feishu-only append contract. All new providers
      // publish through documentTasks, where provider identity is explicit.
      resourceKey: partnerNativeDocumentResourceKey('feishu', receipt.documentId),
      revision: receipt.revision,
      completedAt: receipt.completedAt,
    })),
  ];
  return entries.sort(
    (left, right) =>
      right.completedAt.localeCompare(left.completedAt) || right.id.localeCompare(left.id),
  );
}

export function partnerDetailTargetForRemoteResult(
  entry: PartnerRemoteResultEntry,
): PartnerDetailOpenTarget {
  return {
    kind: 'browser',
    initialUrl: entry.url,
    resourceKey: entry.resourceKey,
    title: entry.title,
  };
}
