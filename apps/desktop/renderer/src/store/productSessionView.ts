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
const EMPTY_ITEMS: readonly SessionProductItem[] = [];
interface ItemBody {
  readonly itemId: string;
  readonly text: string;
  readonly part: 'text' | 'input';
}
const bodies = new Map<string, Map<string, ItemBody>>();

function bodyKey(item: SessionProductItem, part: 'text' | 'input'): string {
  return JSON.stringify([
    item.id,
    part,
    item.outputState,
    item.textRevision,
    part === 'input' ? item.tool?.totalInputLength : item.totalTextLength,
  ]);
}
function completeItems(
  sessionId: string,
  items: readonly SessionProductItem[],
): SessionProductItem[] {
  return items.map((item) => {
    const text = bodies.get(sessionId)?.get(bodyKey(item, 'text'))?.text;
    const input = bodies.get(sessionId)?.get(bodyKey(item, 'input'))?.text;
    return text === undefined && input === undefined
      ? item
      : {
          ...item,
          ...(text !== undefined ? { text, textOffset: 0 } : {}),
          ...(input !== undefined && item.tool ? { tool: { ...item.tool, inputText: input } } : {}),
        };
  });
}

function publish(sessionId: string, next: ProductTranscript): void {
  const retained = new Set(
    [...next.items, ...next.historyItems, ...(next.view?.items ?? [])].flatMap((item) => [
      bodyKey(item, 'text'),
      bodyKey(item, 'input'),
    ]),
  );
  for (const key of bodies.get(sessionId)?.keys() ?? [])
    if (!retained.has(key)) bodies.get(sessionId)!.delete(key);
  transcripts.set(sessionId, next);
  for (const listener of listeners) listener();
}
export function productTranscriptSnapshot(sessionId: string | null): ProductTranscript | undefined {
  return sessionId ? transcripts.get(sessionId) : undefined;
}
export function replaceProductSessionView(view: SessionProductView): void {
  const previous = transcripts.get(view.sessionId);
  if (previous?.view?.runtimeId === view.runtimeId && previous.view.revision >= view.revision)
    return;
  const browsingOlder = previous?.browsingOlder ?? false;
  const completeView = { ...view, items: completeItems(view.sessionId, view.items) };
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
  publish(sessionId, {
    ...(previous?.view ? { view: previous.view } : {}),
    historyItems: completeItems(sessionId, items),
    browsingOlder,
    items: browsingOlder || !previous?.view ? completeItems(sessionId, items) : previous.view.items,
  });
}
export function installProductItemContent(
  sessionId: string,
  item: SessionProductItem,
  part: 'text' | 'input',
  text: string,
): void {
  const previous = transcripts.get(sessionId);
  if (
    !previous ||
    !previous.items.some((current) => bodyKey(current, part) === bodyKey(item, part))
  )
    return;
  const cache = bodies.get(sessionId) ?? new Map<string, ItemBody>();
  cache.set(bodyKey(item, part), { itemId: item.id, part, text });
  bodies.set(sessionId, cache);
  const view = previous.view
    ? { ...previous.view, items: completeItems(sessionId, previous.view.items) }
    : undefined;
  const historyItems = completeItems(sessionId, previous.historyItems);
  publish(sessionId, {
    ...previous,
    ...(view ? { view } : {}),
    historyItems,
    items: previous.browsingOlder || !view ? historyItems : view.items,
  });
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
  );
}
