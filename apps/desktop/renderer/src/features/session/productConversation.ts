import { productItemBodyLength } from '../../lib/productItemContent.js';
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
    // Bounded SDK previews keep the start of the input and can end inside JSON. Keep the raw text,
    // plus the complete leading string fields so headers still show the file path / bridged tool.
    return { ...previewStringFields(text), input: text };
  }
}

/** First-occurrence top-level `"key": "string"` pairs that are fully present in a JSON prefix. */
function previewStringFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!text.startsWith('{')) return fields;
  let depth = 0;
  let key: string | undefined;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      const end = closingQuote(text, index);
      if (end < 0) break;
      const value = jsonString(text.slice(index, end + 1));
      // Not JSON after all: the raw `input` text is still shown.
      if (value === undefined) break;
      if (depth === 1 && key === undefined && /^\s*:/.test(text.slice(end + 1, end + 8))) {
        key = value;
      } else {
        if (depth === 1 && key !== undefined && !(key in fields)) fields[key] = value;
        if (depth === 1) key = undefined;
      }
      index = end;
    } else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') depth--;
    else if (char === ',' && depth === 1) key = undefined;
  }
  return fields;
}

function jsonString(literal: string): string | undefined {
  try {
    const value: unknown = JSON.parse(literal);
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

function closingQuote(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === '\\') index++;
    else if (text[index] === '"') return index;
  }
  return -1;
}
function displayItem(
  item: SessionProductItem,
  turnIndex?: number,
  localUserId?: string,
): ConversationMessage {
  const body = productItemBodyLength(item, 'text') !== undefined ? { productItem: item } : {};
  if (item.type === 'user')
    return {
      kind: 'user',
      ...body,
      // A sent query keeps its local bubble id when the SDK item takes it over, so the row is not remounted.
      ...(localUserId ? { id: localUserId, sourceItemId: item.id } : { id: item.id }),
      content: item.text,
      sentAt: item.timestamp ?? 0,
      ...(item.imageAttachments ? { attachments: item.imageAttachments } : {}),
    };
  if (item.type === 'assistant' || item.type === 'thinking')
    return {
      kind: 'assistant_text',
      ...body,
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
      ...(item.tool.outputPath || item.tool.totalInputLength !== undefined
        ? { productItem: item }
        : body),
      ...(item.imageAttachments ? { attachments: item.imageAttachments } : {}),
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
      ...(item.tool.status === 'error' ? { failed: true as const } : {}),
      ...(item.tool.status === 'awaiting_approval' ? { awaitingApproval: true as const } : {}),
      ...(item.tool.startedAt !== undefined ? { startedAt: item.tool.startedAt } : {}),
      ...(item.tool.endedAt !== undefined ? { endedAt: item.tool.endedAt } : {}),
    };
  return {
    kind: 'system_notice',
    id: item.id,
    ...body,
    variant: item.type === 'error' ? 'error' : item.type === 'sidecar' ? 'sidecar' : 'info',
    ...(item.icon !== undefined ? { icon: item.icon } : {}),
    text: item.text,
    taskResult: item.taskResult,
    sentAt: item.timestamp,
    ...(item.type === 'error' ? { runtimeRunId: item.sourceRunId } : {}),
  };
}

function productHistoryBoundary(
  item: SessionProductItem,
  historyItems: readonly SessionProductItem[],
) {
  if (item.historyBoundary) return item.historyBoundary;
  if (historyItems.length === 0) return undefined;
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
  // A merged batch is one user item that consumed every input in inputIds.
  const accepted = new Set(
    items.flatMap((item) => (item.inputId ? [item.inputId, ...(item.inputIds ?? [])] : [])),
  );
  // A send that failed ambiguously stays hidden until something proves the Runtime took it.
  const failed = (message: UserMessage | QueuedUserMessage): boolean =>
    message.sendFailedAmbiguously === true &&
    !message.sendAdmissionSettled &&
    ('queueMode' in message
      ? message.queueId === undefined
      : (message.runtimeRunId ?? message.deliveryQueueId ?? message.turnId) === undefined);
  return [
    ...users
      .filter(
        (user) =>
          user.operationId &&
          !user.restoredFromHistory &&
          !user.productInputObserved &&
          !failed(user) &&
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
      .filter((user) => !failed(user) && (!user.operationId || !accepted.has(user.operationId)))
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
  const localUserIds = new Map(
    provisionalUsers.flatMap((user) =>
      user.operationId && !user.restoredFromHistory ? [[user.operationId, user.id] as const] : [],
    ),
  );
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
    messages.push(
      displayItem(
        item,
        userMessages.length > 0 ? userMessages.length - 1 : undefined,
        item.type === 'user' && item.inputId
          ? [item.inputId, ...(item.inputIds ?? [])]
              .map((inputId) => localUserIds.get(inputId))
              .find(Boolean)
          : undefined,
      ),
    );
  }
  messages.push(...provisionalProductMessages(items, provisionalUsers, queuedUsers));
  return { messages: insertProductNotices(messages, notices), userMessages };
}
