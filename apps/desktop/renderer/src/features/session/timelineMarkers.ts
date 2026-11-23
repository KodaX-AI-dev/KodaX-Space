import type { LocalNoticeMarker } from '@kodax-space/space-ipc-schema';
import type { ConversationMessage } from './composeMessages.js';

type ModelChange = Extract<LocalNoticeMarker, { kind: 'model_change' }>;
type ModelChangeNotice = Extract<ConversationMessage, { kind: 'local_notice' }> & {
  readonly marker: ModelChange;
};

function isModelChange(message: ConversationMessage | undefined): message is ModelChangeNotice {
  return message?.kind === 'local_notice' && message.marker?.kind === 'model_change';
}

function sameModel(a: ModelChange['from'], b: ModelChange['to']): boolean {
  return a.provider === b.provider && a.model === b.model;
}

/**
 * A model switch only matters as a boundary between turns. A switch before the first turn has
 * nothing to contrast with and is dropped; switches with nothing between them fold into one
 * `first.from → last.to` marker, and a switch back to where it started disappears.
 */
export function coalesceModelChangeMarkers(
  messages: readonly ConversationMessage[],
): readonly ConversationMessage[] {
  if (!messages.some(isModelChange)) return messages;
  const result: ConversationMessage[] = [];
  let turnSeen = false;
  for (const message of messages) {
    turnSeen ||= message.kind === 'user';
    if (!turnSeen && isModelChange(message)) continue;
    const previous = result[result.length - 1];
    if (!isModelChange(message) || !isModelChange(previous)) {
      result.push(message);
      continue;
    }
    result.pop();
    const from = previous.marker.from;
    if (!sameModel(from, message.marker.to)) {
      result.push({ ...message, marker: { ...message.marker, from } });
    }
  }
  return result;
}
