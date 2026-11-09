import { useEffect, useRef, useState } from 'react';
import type { ChannelOutput } from '@kodax-space/space-ipc-schema';
import { readProductItemText } from '../../lib/productItemContent.js';
import { useI18n } from '../../i18n/I18nProvider.js';

type SearchHit = ChannelOutput<'session.productSearch'>['hits'][number];

async function readSearchHit(
  sessionId: string,
  hit: SearchHit,
  isCurrent: () => boolean,
): Promise<string> {
  const read = async (offset: number) => {
    if (!isCurrent()) throw new Error('Search selection changed.');
    const result = await window.kodaxSpace!.invoke('session.productItem', {
      sessionId,
      itemId: hit.itemId,
      source: 'history',
      part: 'text',
      offset,
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
  };
  const first = await read(0);
  if (!first) throw new Error('SDK history search reference expired; search again.');
  return readProductItemText(
    { id: hit.itemId, type: hit.role, text: first.text, totalTextLength: first.totalLength },
    (offset) => (offset === 0 ? Promise.resolve(first) : read(offset)),
    'text',
    'history',
  );
}

function useProductHistorySearch(sessionId: string, query: string) {
  const [hits, setHits] = useState<readonly SearchHit[]>([]);
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const expected = ++generation.current;
    setHits([]);
    setBody(null);
    setError(null);
    setSelected(null);
    setPending(!!query.trim());
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      void window
        .kodaxSpace!.invoke('session.productSearch', { sessionId, query })
        .then((result) => {
          if (expected !== generation.current) return;
          if (!result.ok) throw new Error(result.error.message);
          setHits(result.data.hits);
        })
        .catch((cause: unknown) => {
          if (expected === generation.current)
            setError(cause instanceof Error ? cause.message : 'SDK history search failed.');
        })
        .finally(() => {
          if (expected === generation.current) setPending(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      generation.current += 1;
    };
  }, [sessionId, query, retry]);
  const openHit = async (hit: SearchHit): Promise<void> => {
    const expected = ++generation.current;
    setSelected(hit);
    setBody(null);
    setError(null);
    setPending(true);
    try {
      const text = await readSearchHit(sessionId, hit, () => expected === generation.current);
      if (expected === generation.current) setBody(text);
    } catch (cause: unknown) {
      if (expected === generation.current)
        setError(cause instanceof Error ? cause.message : 'SDK history read failed.');
    } finally {
      if (expected === generation.current) setPending(false);
    }
  };
  return {
    hits,
    body,
    error,
    openHit,
    pending,
    selected,
    select: (hit: SearchHit) => {
      generation.current++;
      setSelected(hit);
      setBody(null);
      setError(null);
      setPending(false);
    },
    retrySearch: () => setRetry((value) => value + 1),
    back: () => {
      generation.current++;
      setBody(null);
      setSelected(null);
      setError(null);
      setPending(false);
    },
  };
}

/** SDK search references are read independently of the displayed window. */
export function ProductHistorySearch({
  sessionId,
  query,
  onLocate,
}: {
  sessionId: string;
  query: string;
  onLocate: (itemId: string, signal: AbortSignal) => Promise<'located' | 'missing' | 'stale'>;
}): JSX.Element | null {
  const { t } = useI18n();
  const { hits, body, error, openHit, pending, selected, select, retrySearch, back } =
    useProductHistorySearch(sessionId, query);
  const listRef = useRef<HTMLDivElement>(null);
  const locationRequest = useRef<AbortController | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    'pending' | 'missing' | 'stale' | 'failed' | null
  >(null);
  useEffect(() => {
    setLocationStatus(null);
    return () => locationRequest.current?.abort();
  }, [sessionId, query]);
  useEffect(() => {
    if (selected)
      listRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [selected]);
  function backToResults(): void {
    if (!selected) return;
    const id = selected.itemId;
    locationRequest.current?.abort();
    setLocationStatus(null);
    back();
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-hit-id="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: true }),
    );
  }
  async function locateHit(hit: SearchHit): Promise<void> {
    locationRequest.current?.abort();
    const controller = new AbortController();
    locationRequest.current = controller;
    select(hit);
    setLocationStatus('pending');
    try {
      const located = await onLocate(hit.itemId, controller.signal);
      if (controller.signal.aborted) return;
      if (located === 'located') {
        setLocationStatus(null);
        back();
        return;
      }
      setLocationStatus(located);
      if (located === 'missing') await openHit(hit);
    } catch {
      if (controller.signal.aborted) return;
      setLocationStatus('failed');
      await openHit(hit);
    }
  }
  function readOriginal(hit: SearchHit): void {
    locationRequest.current?.abort();
    setLocationStatus(null);
    void openHit(hit);
  }
  if (!query.trim()) return null;
  return (
    <div
      ref={listRef}
      aria-busy={pending || locationStatus === 'pending'}
      className="absolute right-0 top-full mt-1 max-h-96 w-[min(34rem,75vw)] overflow-auto rounded border border-border-default bg-surface-2 p-2 shadow-xl"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && selected) {
          event.preventDefault();
          event.stopPropagation();
          backToResults();
          return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const index = buttons.findIndex((button) => button === event.target);
        if (index < 0) return;
        event.preventDefault();
        buttons[
          (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        ]?.focus();
      }}
    >
      {selected && (
        <button type="button" onClick={backToResults}>
          {t('conversation.backToResults')}
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
          <button type="button" onClick={retrySearch}>
            {t('message.action.retry')}
          </button>
        </p>
      )}
      {pending && <p role="status">{t('common.loading')}</p>}
      {!pending && !error && !selected && hits.length === 0 && (
        <p>{t('conversation.noSearchResults')}</p>
      )}
      {selected ? (
        <>
          <button
            type="button"
            disabled={locationStatus === 'pending'}
            onClick={() => void locateHit(selected)}
          >
            {t('conversation.openContext')}
          </button>
          {body === null && !pending && (
            <button type="button" onClick={() => readOriginal(selected)}>
              {t('conversation.readOriginal')}
            </button>
          )}
          {locationStatus && (
            <p role="status">
              {t(
                locationStatus === 'pending'
                  ? 'common.loading'
                  : locationStatus === 'failed'
                    ? 'conversation.historyLoadFailed'
                    : locationStatus === 'stale'
                      ? 'conversation.staleSearchHit'
                      : 'conversation.readOnlyHit',
              )}
              {locationStatus === 'stale' && (
                <button type="button" onClick={retrySearch}>
                  {t('message.action.retry')}
                </button>
              )}
            </p>
          )}
          {body !== null && (
            <pre
              data-testid="sdk-history-search-body"
              className="whitespace-pre-wrap break-words text-xs"
            >
              {body}
            </pre>
          )}
        </>
      ) : (
        !selected &&
        hits.map((hit) => (
          <div key={hit.itemId} className="flex items-center gap-1">
            <button
              type="button"
              data-testid="sdk-history-search-result"
              data-hit-id={hit.itemId}
              onClick={() => void locateHit(hit)}
              className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-xs hover:bg-surface-3"
            >
              {hit.snippet}
            </button>
            <button
              type="button"
              onClick={() => readOriginal(hit)}
              className="shrink-0 rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface-3 hover:text-fg-primary"
            >
              {t('conversation.readOriginal')}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
