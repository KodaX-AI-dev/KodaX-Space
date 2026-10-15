import type { ClientViewItem } from '@kodax-ai/kodax/client';
import { sessionProductItemSchema, type SessionProductItem } from '@kodax-space/space-ipc-schema';
import { issueSessionImageAttachment } from '../../window/session-attachment-protocol.js';

/** Only image capabilities are adapted; item IDs, order and text remain SDK-owned. */
export async function projectProductItems(
  sessionId: string,
  items: readonly ClientViewItem[],
  previous: readonly SessionProductItem[] = [],
): Promise<SessionProductItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (!item.attachments?.length) return sessionProductItemSchema.parse(item);
      const retained = previous.find((candidate) => candidate.id === item.id);
      const sameImages = JSON.stringify(retained?.attachments) === JSON.stringify(item.attachments);
      const imageAttachments =
        sameImages && retained?.imageAttachments
          ? retained.imageAttachments
          : await Promise.all(
              item.attachments.map((attachment, ordinal) =>
                issueSessionImageAttachment({ sessionId, artifactPath: attachment.path, ordinal }),
              ),
            );
      return sessionProductItemSchema.parse({ ...item, imageAttachments });
    }),
  );
}
