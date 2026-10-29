import { useEffect, useRef, useState } from 'react';
import type { SessionProductItem } from '@kodax-space/space-ipc-schema';
import { readProductItemText } from '../../../lib/productItemContent.js';
import { useProductSessionTranscript } from '../../../store/productSessionView.js';
import { useAppStore } from '../../../store/appStore.js';
import { useI18n } from '../../../i18n/I18nProvider.js';

/** Saved results are read only through the exact Host tool item, never its path or a search hit. */
function useOriginalToolBody(item: SessionProductItem) {
  const sessionId = useAppStore((state) => state.currentSessionId);
  const transcript = useProductSessionTranscript(sessionId);
  const source = transcript?.browsingOlder || !transcript?.view ? 'history' : 'view';
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setText(undefined);
    setError(undefined);
    setBusy(false);
    return () => {
      generation.current += 1;
    };
  }, [sessionId, item.id, item.tool?.outputPath, source]);

  async function read(): Promise<void> {
    if (!sessionId || busy) return;
    const owner = generation.current;
    setBusy(true);
    setError(undefined);
    try {
      const body = await readOriginal(item, sessionId, source);
      if (generation.current === owner) setText(body);
    } catch (failure) {
      if (generation.current === owner)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (generation.current === owner) setBusy(false);
    }
  }
  return { text, error, busy, read };
}

async function readOriginal(
  item: SessionProductItem,
  sessionId: string,
  source: 'view' | 'history',
) {
  return readProductItemText(
    item,
    async (offset) => {
      const reply = await window.kodaxSpace!.invoke('session.productItem', {
        sessionId,
        itemId: item.id,
        source,
        part: 'original',
        offset,
      });
      if (!reply.ok) throw new Error(reply.error.message);
      return reply.data;
    },
    'original',
    source,
  );
}

export function ProductToolOriginal({ item }: { item: SessionProductItem }): JSX.Element {
  const { t } = useI18n();
  const { text, error, busy, read } = useOriginalToolBody(item);
  return (
    <section data-testid="tool-original">
      <button
        type="button"
        disabled={busy}
        className="text-info underline"
        onClick={() => {
          void read();
        }}
      >
        {t(busy ? 'message.originalLoading' : 'message.originalRead')}
      </button>
      {error && (
        <p role="alert" className="text-danger">
          {t('message.originalFailed')} {error}
        </p>
      )}
      {text !== undefined && (
        <pre
          className="max-h-96 overflow-auto whitespace-pre-wrap break-words mt-2"
          data-testid="tool-original-body"
        >
          {text}
        </pre>
      )}
    </section>
  );
}
