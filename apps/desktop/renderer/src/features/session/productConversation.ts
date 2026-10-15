import type { SessionProductItem } from '@kodax-space/space-ipc-schema';
import type { UserMessage, QueuedUserMessage } from '../../store/transcriptTypes.js';
import type { ConversationMessage } from './composeMessages.js';
import type { LocalNoticeMessage, WorkflowNoticeMessage } from '../../store/appStore.js';

interface ProductNotices {
  readonly local?: readonly LocalNoticeMessage[];
  readonly workflow?: readonly WorkflowNoticeMessage[];
}

function insertProductNotices(
  messages: ConversationMessage[],
  notices: ProductNotices,
): ConversationMessage[] {
  const pending = (
    [
      ...(notices.local ?? []).map((notice) => ({
        kind: 'local_notice' as const,
        ...notice,
        variant:
          notice.variant ??
          (notice.content.trimStart().startsWith('/') ? ('echo' as const) : ('output' as const)),
      })),
      ...(notices.workflow ?? []).map((notice) => ({
        kind: 'system_notice' as const,
        id: notice.id,
        text: notice.content,
        sentAt: notice.sentAt,
        variant: 'workflow' as const,
      })),
    ] satisfies ConversationMessage[]
  ).sort((left, right) => left.sentAt - right.sentAt);
  const result: ConversationMessage[] = [];
  for (const message of messages) {
    if (message.kind === 'user') {
      while (pending.length && pending[0]!.sentAt < message.sentAt) {
        result.push(pending.shift()!);
      }
    }
    result.push(message);
  }
  return [...result, ...pending];
}

function toolInput(text?: string): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { input: text };
  } catch {
    // Bounded SDK previews can end inside JSON; retain the supplied text for display.
    return { input: text };
  }
}
function displayItem(item: SessionProductItem, turnIndex?: number): ConversationMessage {
  if (item.type === 'user')
    return {
      kind: 'user',
      id: item.id,
      content: item.text,
      sentAt: item.timestamp ?? 0,
      ...(item.imageAttachments ? { attachments: item.imageAttachments } : {}),
    };
  if (item.type === 'assistant' || item.type === 'thinking')
    return {
      kind: 'assistant_text',
      id: item.id,
      text: item.type === 'assistant' ? item.text : '',
      ...(item.type === 'thinking' ? { thinking: item.text } : {}),
      completed: item.outputState !== 'draft',
      sentAt: item.timestamp,
      turnIndex,
    };
  if (item.type === 'tool' && item.tool)
    return {
      kind: 'tool_call',
      id: item.id,
      toolId: item.id,
      toolName: item.tool.name,
      input: toolInput(item.tool.inputText),
      result:
        item.tool.resultRecorded || ['success', 'error', 'cancelled'].includes(item.tool.status)
          ? item.text
          : undefined,
      progress: item.tool.progress,
      status:
        item.tool.status === 'cancelled'
          ? 'interrupted'
          : item.tool.status === 'running' || item.tool.status === 'awaiting_approval'
            ? 'running'
            : 'done',
    };
  return {
    kind: 'system_notice',
    id: item.id,
    variant: item.type === 'error' ? 'error' : item.type === 'sidecar' ? 'sidecar' : 'workflow',
    text: item.text,
    sentAt: item.timestamp,
    ...(item.type === 'error' ? { runtimeRunId: item.sourceRunId } : {}),
  };
}

function productHistoryBoundary(
  item: SessionProductItem,
  historyItems: readonly SessionProductItem[],
) {
  if (item.historyBoundary) return item.historyBoundary;
  const identity = item.inputId ?? item.outputId ?? item.tool?.assistantOutputId;
  const boundaries = new Map(
    historyItems
      .filter(
        (history) =>
          identity &&
          (item.type === 'user' ? history.inputId : history.outputId) === identity &&
          history.historyBoundary,
      )
      .map((history) => [JSON.stringify(history.historyBoundary), history.historyBoundary!]),
  );
  return boundaries.size === 1 ? [...boundaries.values()][0] : undefined;
}

function provisionalProductMessages(
  items: readonly SessionProductItem[],
  users: readonly UserMessage[],
  queued: readonly QueuedUserMessage[],
): ConversationMessage[] {
  const accepted = new Set(items.flatMap((item) => (item.inputId ? [item.inputId] : [])));
  return [
    ...users
      .filter(
        (user) =>
          user.operationId &&
          !user.restoredFromHistory &&
          !user.sendAdmissionSettled &&
          !accepted.has(user.operationId),
      )
      .map((user) => ({
        kind: 'user' as const,
        id: user.id,
        content: user.content,
        sentAt: user.sentAt,
        attachments: user.attachments,
      })),
    ...queued
      .filter((user) => !user.operationId || !accepted.has(user.operationId))
      .map((user) => ({ kind: 'queued_user' as const, ...user })),
  ];
}

/** Layout projection only: SDK item order and IDs are never reconstructed from events or text. */
export function projectProductConversation(
  items: readonly SessionProductItem[],
  provisionalUsers: readonly UserMessage[] = [],
  queuedUsers: readonly QueuedUserMessage[] = [],
  historyItems: readonly SessionProductItem[] = [],
  notices: ProductNotices = {},
): { messages: ConversationMessage[]; userMessages: UserMessage[] } {
  const messages: ConversationMessage[] = [];
  const userMessages: UserMessage[] = [];
  for (const item of items) {
    const boundary = productHistoryBoundary(item, historyItems);
    if (item.type === 'user')
      userMessages.push({
        id: item.id,
        content: item.text,
        sentAt: item.timestamp ?? 0,
        restoredFromHistory: true,
        historyTurnIndex: userMessages.length,
        attachments: item.imageAttachments,
      });
    const owner = userMessages[userMessages.length - 1];
    if (owner && boundary)
      userMessages[userMessages.length - 1] = {
        ...owner,
        historyBoundary: { boundaryId: boundary.entryId, sourceRevision: boundary.sourceRevision },
      };
    messages.push(displayItem(item, userMessages.length > 0 ? userMessages.length - 1 : undefined));
  }
  messages.push(...provisionalProductMessages(items, provisionalUsers, queuedUsers));
  return { messages: insertProductNotices(messages, notices), userMessages };
}
