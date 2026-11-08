import { productItemBodyLength } from '../lib/productItemContent.js';
import { useSyncExternalStore } from 'react';
import type { SessionProductItem, SessionProductView } from '@kodax-space/space-ipc-schema';

interface ProductTranscript {
  readonly view?: SessionProductView;
  readonly items: readonly SessionProductItem[];
  readonly historyItems: readonly SessionProductItem[];
  readonly browsingOlder: boolean;
}
const transcripts = new Map<string, ProductTranscript>();
const listeners = new Set<() => void>();
let pendingBodyNotification: number | undefined;
function notifyListeners(): void {
  for (const listener of listeners) listener();
}
const EMPTY_ITEMS: readonly SessionProductItem[] = [];
interface ItemBody {
  readonly itemId: string;
  readonly text: string;
  readonly part: 'text' | 'input';
}
const bodies = new Map<string, Map<string, ItemBody>>();

// Saved history IDs are scoped to their revision; a view ID belongs to its Runtime.
export function productItemBodyKey(
  item: SessionProductItem,
  part: 'text' | 'input',
  viewRuntime?: string,
): string {
  return JSON.stringify([
    viewRuntime ?? null,
    item.id,
    part,
    item.outputState,
    item.textRevision,
    productItemBodyLength(item, part),
  ]);
}
function completeItems(
  sessionId: string,
  items: readonly SessionProductItem[],
  viewRuntime?: string,
): SessionProductItem[] {
  return items.map((item) => {
    const text = bodies.get(sessionId)?.get(productItemBodyKey(item, 'text', viewRuntime))?.text;
    const input = bodies.get(sessionId)?.get(productItemBodyKey(item, 'input', viewRuntime))?.text;
    return text === undefined && input === undefined
      ? item
      : {
          ...item,
          ...(text !== undefined ? { text, textOffset: 0, totalTextLength: text.length } : {}),
          ...(input !== undefined && item.tool ? { tool: { ...item.tool, inputText: input } } : {}),
        };
  });
}

function pruneBodyCache(sessionId: string, next: ProductTranscript): void {
  const cache = bodies.get(sessionId);
  if (!cache?.size) return;
  const retained = new Set<string>();
  for (const [items, viewRuntime] of [
    [next.historyItems, undefined],
    [next.view?.items ?? EMPTY_ITEMS, next.view?.runtimeId],
  ] as const) {
    for (const item of items) {
      retained.add(productItemBodyKey(item, 'text', viewRuntime));
      retained.add(productItemBodyKey(item, 'input', viewRuntime));
    }
  }
  for (const key of cache.keys()) if (!retained.has(key)) cache.delete(key);
}

function publish(sessionId: string, next: ProductTranscript, deferBodyNotification = false): void {
  pruneBodyCache(sessionId, next);
  transcripts.set(sessionId, next);
  // Keep completed bodies immediately readable, while coalescing their render
  // notifications. A cold history load can finish dozens of IPC reads together;
  // publishing every reply synchronously can exceed React's nested update limit.
  if (!deferBodyNotification || typeof requestAnimationFrame !== 'function') {
    notifyListeners();
    return;
  }
  if (pendingBodyNotification !== undefined) return;
  pendingBodyNotification = requestAnimationFrame(() => {
    pendingBodyNotification = undefined;
    notifyListeners();
  });
}
export function productTranscriptSnapshot(sessionId: string | null): ProductTranscript | undefined {
  return sessionId ? transcripts.get(sessionId) : undefined;
}
export function replaceProductSessionView(view: SessionProductView): void {
  const previous = transcripts.get(view.sessionId);
  if (previous?.view?.runtimeId === view.runtimeId && previous.view.revision >= view.revision)
    return;
  const browsingOlder = previous?.browsingOlder ?? false;
  const completeView = {
    ...view,
    items: completeItems(view.sessionId, view.items, view.runtimeId),
  };
  publish(view.sessionId, {
    view: completeView,
    browsingOlder,
    historyItems: previous?.historyItems ?? EMPTY_ITEMS,
    items: browsingOlder ? previous!.historyItems : completeView.items,
  });
}
export function installProductHistory(
  sessionId: string,
  items: readonly SessionProductItem[],
  browsingOlder: boolean,
): void {
  const previous = transcripts.get(sessionId);
  const historyItems = completeItems(sessionId, items);
  publish(sessionId, {
    ...(previous?.view ? { view: previous.view } : {}),
    historyItems,
    browsingOlder,
    items: browsingOlder || !previous?.view ? historyItems : previous.view.items,
  });
}
export function installProductItemContent(
  sessionId: string,
  item: SessionProductItem,
  part: 'text' | 'input',
  text: string,
): void {
  const previous = transcripts.get(sessionId);
  const viewRuntime = previous?.browsingOlder ? undefined : previous?.view?.runtimeId;
  const key = productItemBodyKey(item, part, viewRuntime);
  if (
    !previous ||
    !previous.items.some((current) => productItemBodyKey(current, part, viewRuntime) === key)
  )
    return;
  const cache = bodies.get(sessionId) ?? new Map<string, ItemBody>();
  cache.set(key, { itemId: item.id, part, text });
  bodies.set(sessionId, cache);
  const view = previous.view
    ? {
        ...previous.view,
        items: completeItems(sessionId, previous.view.items, previous.view.runtimeId),
      }
    : undefined;
  const historyItems = completeItems(sessionId, previous.historyItems);
  publish(
    sessionId,
    {
      ...previous,
      ...(view ? { view } : {}),
      historyItems,
      items: previous.browsingOlder || !view ? historyItems : view.items,
    },
    true,
  );
}
export function resetProductSessionViews(sessionId?: string): void {
  if (sessionId) {
    transcripts.delete(sessionId);
    bodies.delete(sessionId);
  } else {
    transcripts.clear();
    bodies.clear();
  }
  for (const listener of listeners) listener();
}
export function useProductSessionTranscript(
  sessionId: string | null,
): ProductTranscript | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => productTranscriptSnapshot(sessionId),
    () => productTranscriptSnapshot(sessionId),
  );
}
