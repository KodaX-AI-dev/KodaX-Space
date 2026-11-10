// Loaded-content Ctrl+F over the transcript row model instead of the mounted DOM, so it keeps
// counting rows that are off screen or (with F144 windowing) not mounted at all.
//
// Scope: what a reader of the conversation reads. Visible message text, plus text collapsed
// inside a row (long questions, thinking, folded assistant step text, notice/error details).
// Tool input and output are tool data, searched only while the verbose view shows tool details.
// Collapsed text names the disclosure that reveals it; the caller opens it before jumping.
// Unfilled SDK bodies are searched as loaded; search never fetches them.

import { useMemo, useRef } from 'react';
import type { ConversationMessage } from '../features/session/composeMessages.js';
import { runtimeFailureRows } from '../features/session/messages/bubbles.js';
import { DisclosurePart } from '../features/session/messages/rowDisclosure.js';

type ToolCall = Extract<ConversationMessage, { kind: 'tool_call' }>;
type FindableTool = Pick<ToolCall, 'id' | 'toolName' | 'input' | 'result' | 'progress'>;
type SystemNotice = Extract<ConversationMessage, { kind: 'system_notice' }>;

export type FindableMessage =
  | Exclude<ConversationMessage, { kind: 'tool_call' }>
  | {
      readonly kind: 'artifact';
      readonly id: string;
      readonly title: string;
      readonly summary?: string;
    };

export type FindableReceipt =
  | { readonly kind: 'thinking'; readonly id: string; readonly thinking: string }
  | {
      readonly kind: 'tool_cluster';
      readonly id: string;
      readonly subClusters: readonly {
        readonly title: string;
        readonly syntheticTitle: boolean;
        readonly thinking?: string;
        readonly tools: readonly FindableTool[];
      }[];
    };

export type FindableItem =
  | { readonly kind: 'message'; readonly message: FindableMessage }
  | { readonly kind: 'receipts'; readonly receipts: readonly FindableReceipt[] };

/** A receipt opens through the transcript's expanded set; anything else through its row disclosure. */
export type FindReveal =
  | { readonly kind: 'receipt'; readonly id: string }
  | { readonly kind: 'disclosure'; readonly ownerId: string; readonly part: string };

/** `id` is the highlighted `data-msg-id`; `reveal` is set only when the hit is collapsed. */
export interface FindMatch {
  readonly id: string;
  readonly reveal?: FindReveal;
}

interface Segment {
  readonly text: string;
  readonly reveal?: FindReveal;
  readonly toolDetail?: true;
}

interface Target {
  readonly id: string;
  readonly segments: readonly Segment[];
}

const EMPTY: readonly FindMatch[] = [];
const targetsByItem = new WeakMap<FindableItem, readonly Target[]>();

function segment(text: string | undefined, reveal?: FindReveal, toolDetail?: true): Segment[] {
  if (!text) return [];
  return [
    {
      text: text.toLowerCase(),
      ...(reveal ? { reveal } : {}),
      ...(toolDetail ? { toolDetail } : {}),
    },
  ];
}

/** Mirrors UserBubble/QueuedUserBubble: an image-only placeholder is not shown. */
function renderedUserText(message: { content: string; attachments?: readonly unknown[] }): string {
  return message.attachments?.length && message.content.trim() === '(image)' ? '' : message.content;
}

function noticeSegments(message: SystemNotice, own: (part: string) => FindReveal): Segment[] {
  switch (message.variant) {
    case 'info':
      return [
        ...segment(message.taskResult?.title),
        ...segment(message.text, own(DisclosurePart.noticeDetails)),
      ];
    case 'error':
      return [
        ...segment(message.text),
        ...runtimeFailureRows(message).flatMap((row) =>
          segment(row.value, own(DisclosurePart.errorDetails)),
        ),
      ];
    case 'lineage':
      if (message.lineageKind === undefined) return segment(message.text);
      // Only a branch summary shows its text, behind the divider label.
      return message.lineageKind === 'branch_summary'
        ? segment(message.text, own(DisclosurePart.lineageDetail))
        : [];
    default:
      return segment(message.text);
  }
}

function messageSegments(message: FindableMessage): Segment[] {
  const own = (part: string): FindReveal => ({ kind: 'disclosure', ownerId: message.id, part });
  switch (message.kind) {
    case 'user':
      return segment(renderedUserText(message), own(DisclosurePart.userQuery));
    case 'queued_user':
      return segment(renderedUserText(message));
    case 'local_notice':
      return segment(message.content);
    case 'assistant_text':
      return [
        ...segment(message.text),
        ...segment(message.thinking, own(DisclosurePart.assistantThinking)),
      ];
    case 'artifact':
      return [...segment(message.title), ...segment(message.summary)];
    case 'system_notice':
      return noticeSegments(message, own);
  }
}

function inputText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') return Object.values(value).map(inputText).join('\n');
  return '';
}

function receiptSegments(receipt: FindableReceipt): Segment[] {
  const reveal: FindReveal = { kind: 'receipt', id: receipt.id };
  if (receipt.kind === 'thinking') return segment(receipt.thinking, reveal);
  const tools = receipt.subClusters.flatMap((step) => step.tools);
  return [
    // Tool names are on the collapsed summary.
    ...segment([...new Set(tools.map((tool) => tool.toolName))].join(' ')),
    ...receipt.subClusters.flatMap((step) => [
      ...segment(step.thinking, reveal),
      // A synthetic title ("2 reads") is generated chrome; a real one is the assistant's words.
      ...segment(step.syntheticTitle ? undefined : step.title, reveal),
    ]),
    ...tools.flatMap((tool) => {
      const card: FindReveal = {
        kind: 'disclosure',
        ownerId: tool.id,
        part: DisclosurePart.toolDetails,
      };
      return [inputText(tool.input), tool.progress, tool.result].flatMap((text) =>
        segment(text, card, true),
      );
    }),
  ];
}

function targetsOf(item: FindableItem): readonly Target[] {
  const cached = targetsByItem.get(item);
  if (cached) return cached;
  const targets =
    item.kind === 'message'
      ? [{ id: item.message.id, segments: messageSegments(item.message) }]
      : item.receipts.map((receipt) => ({ id: receipt.id, segments: receiptSegments(receipt) }));
  targetsByItem.set(item, targets);
  return targets;
}

function matchTarget(target: Target, needle: string, toolDetails: boolean): FindMatch | null {
  let hidden: Segment | undefined;
  for (const candidate of target.segments) {
    if ((candidate.toolDetail && !toolDetails) || !candidate.text.includes(needle)) continue;
    if (!candidate.reveal) return { id: target.id };
    hidden ??= candidate;
  }
  return hidden ? { id: target.id, reveal: hidden.reveal } : null;
}

export function findTranscriptMatches(
  items: readonly FindableItem[],
  query: string,
  toolDetails: boolean,
): FindMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: FindMatch[] = [];
  for (const item of items) {
    for (const target of targetsOf(item)) {
      const match = matchTarget(target, needle, toolDetails);
      if (match) matches.push(match);
    }
  }
  return matches;
}

function revealKey(reveal: FindReveal | undefined): string {
  if (!reveal) return '';
  return reveal.kind === 'receipt' ? `r:${reveal.id}` : `d:${reveal.ownerId}:${reveal.part}`;
}

function sameMatches(left: readonly FindMatch[], right: readonly FindMatch[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (match, index) =>
        match.id === right[index].id && revealKey(match.reveal) === revealKey(right[index].reveal),
    )
  );
}

/** Keeps the previous array when the hits are unchanged, so streaming does not re-jump. */
export function useTranscriptFind(
  items: readonly FindableItem[],
  query: string,
  toolDetails: boolean,
): readonly FindMatch[] {
  const previous = useRef<readonly FindMatch[]>(EMPTY);
  return useMemo(() => {
    const next = findTranscriptMatches(items, query, toolDetails);
    if (sameMatches(previous.current, next)) return previous.current;
    previous.current = next;
    return next;
  }, [items, query, toolDetails]);
}
