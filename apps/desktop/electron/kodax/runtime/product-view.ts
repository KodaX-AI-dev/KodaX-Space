import type { ClientViewItem } from '@kodax-ai/kodax/client';
import {
  sessionProductItemSchema,
  type SessionImageAttachment,
  type SessionProductItem,
} from '@kodax-space/space-ipc-schema';
import {
  issueSessionImageAttachment,
  issueHostImageAttachment,
} from '../../window/session-attachment-protocol.js';
import {
  HOST_IMAGE_MEDIA_TYPES,
  readHostImage,
  type HostImageMediaType,
  type HostItemReader,
} from './host-image.js';

/**
 * Only image capabilities are adapted; item IDs, text and order remain SDK-owned. Tool images
 * are read through the Host. A user image first tries Space's own clipboard sandbox (sessions
 * saved before KodaX 0.7.97-beta.5), then the Host, which pins every accepted input image.
 */
export async function projectProductItems(
  sessionId: string,
  items: readonly ClientViewItem[],
  previous: readonly SessionProductItem[] = [],
  readHostItem?: HostItemReader,
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
                projectImage(sessionId, item, attachment, ordinal, readHostItem),
              ),
            );
      return sessionProductItemSchema.parse({ ...item, imageAttachments });
    }),
  );
}

async function projectImage(
  sessionId: string,
  item: ClientViewItem,
  attachment: { readonly path: string; readonly mediaType?: string },
  ordinal: number,
  readHostItem?: HostItemReader,
): Promise<SessionImageAttachment> {
  const local = () =>
    issueSessionImageAttachment({ sessionId, artifactPath: attachment.path, ordinal });
  if (!readHostItem) return local();
  const host = () =>
    issueHostImageAttachment(
      sessionId,
      item.id,
      ordinal,
      attachment.mediaType !== undefined && HOST_IMAGE_MEDIA_TYPES.has(attachment.mediaType)
        ? (attachment.mediaType as HostImageMediaType)
        : 'image/png',
      () => readHostImage(readHostItem, item.id, ordinal),
    );
  if (item.type === 'tool') return host();
  const sandboxed = await local();
  return sandboxed.status === 'available' ? sandboxed : host();
}
