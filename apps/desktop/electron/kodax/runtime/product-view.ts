import type { ClientViewItem } from '@kodax-ai/kodax/client';
import { sessionProductItemSchema, type SessionProductItem } from '@kodax-space/space-ipc-schema';
import {
  issueSessionImageAttachment,
  issueHostImageAttachment,
} from '../../window/session-attachment-protocol.js';
import { readHostImage, type HostItemReader } from './host-image.js';

// KodaX 0.7.97-beta.5+ stores one model-facing label line per pinned input image.
const INPUT_OBSERVATION_LABEL =
  /\nobs_[0-9a-f-]+; source=user; observedAt=[^;\n]+; historical; [^;\n]+; sha256=[a-f0-9]{64}$/;

function withoutInputObservationLabels(text: string, images: number): string {
  let shown = text;
  for (let count = 0; count < images && INPUT_OBSERVATION_LABEL.test(shown); count++) {
    shown = shown.replace(INPUT_OBSERVATION_LABEL, '');
  }
  return shown;
}

/**
 * Only image capabilities and pinned-input labels are adapted; item IDs and order remain
 * SDK-owned. `hostMediaDir` is this Session's Host directory for pinned input images.
 */
export async function projectProductItems(
  sessionId: string,
  items: readonly ClientViewItem[],
  previous: readonly SessionProductItem[] = [],
  readHostItem?: HostItemReader,
  hostMediaDir?: string,
): Promise<SessionProductItem[]> {
  return Promise.all(
    items.map(async (input) => {
      const attachments = input.attachments;
      if (!attachments?.length) return sessionProductItemSchema.parse(input);
      const item =
        input.type === 'user'
          ? { ...input, text: withoutInputObservationLabels(input.text, attachments.length) }
          : input;
      const retained = previous.find((candidate) => candidate.id === item.id);
      const sameImages = JSON.stringify(retained?.attachments) === JSON.stringify(attachments);
      const imageAttachments =
        sameImages && retained?.imageAttachments
          ? retained.imageAttachments
          : await Promise.all(
              attachments.map((attachment, ordinal) =>
                item.type === 'tool' && readHostItem
                  ? issueHostImageAttachment(sessionId, item.id, ordinal, () =>
                      readHostImage(readHostItem, item.id, ordinal),
                    )
                  : issueSessionImageAttachment({
                      sessionId,
                      artifactPath: attachment.path,
                      ordinal,
                      ...(hostMediaDir !== undefined ? { hostMediaDir } : {}),
                    }),
              ),
            );
      return sessionProductItemSchema.parse({ ...item, imageAttachments });
    }),
  );
}
