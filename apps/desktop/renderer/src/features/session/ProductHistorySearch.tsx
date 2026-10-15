import { useEffect, useRef, useState } from 'react';
import type { ChannelOutput } from '@kodax-space/space-ipc-schema';
import { readProductItemText } from '../../lib/productItemContent.js';

type SearchHit = ChannelOutput<'session.productSearch'>['hits'][number];

async function readSearchHit(sessionId: string, hit: SearchHit): Promise<string> {
  const read = async (offset: number) => {
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
  const generation = useRef(0);
  useEffect(() => {
    const expected = ++generation.current;
    setHits([]);
    setBody(null);
    setError(null);
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
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      generation.current += 1;
    };
  }, [sessionId, query]);
  const openHit = async (hit: SearchHit): Promise<void> => {
    const expected = ++generation.current;
    try {
      const text = await readSearchHit(sessionId, hit);
      if (expected === generation.current) setBody(text);
    } catch (cause: unknown) {
      if (expected === generation.current)
        setError(cause instanceof Error ? cause.message : 'SDK history read failed.');
    }
  };
  return { hits, body, error, openHit };
}

/** SDK search references are read independently of the displayed window. */
export function ProductHistorySearch({
  sessionId,
  query,
}: {
  sessionId: string;
  query: string;
}): JSX.Element | null {
  const { hits, body, error, openHit } = useProductHistorySearch(sessionId, query);
  if (!query.trim()) return null;
  return (
    <div className="absolute right-0 top-full mt-1 max-h-96 w-[min(34rem,75vw)] overflow-auto rounded border border-border-default bg-surface-2 p-2 shadow-xl">
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {body !== null ? (
        <pre
          data-testid="sdk-history-search-body"
          className="whitespace-pre-wrap break-words text-xs"
        >
          {body}
        </pre>
      ) : (
        hits.map((hit) => (
          <button
            key={hit.itemId}
            type="button"
            data-testid="sdk-history-search-result"
            onClick={() => void openHit(hit)}
            className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-surface-3"
          >
            {hit.snippet}
          </button>
        ))
      )}
    </div>
  );
}
