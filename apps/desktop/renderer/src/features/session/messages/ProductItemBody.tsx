import type { SessionProductItem } from '@kodax-space/space-ipc-schema';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import {
  isProductItemPreview,
  productItemBodyLength,
  readProductItemText,
} from '../../../lib/productItemContent.js';
import { useAppStore } from '../../../store/appStore.js';
import {
  installProductItemContent,
  productItemBodyKey,
  productTranscriptSnapshot,
} from '../../../store/productSessionView.js';
import { useI18n } from '../../../i18n/I18nProvider.js';

type BodyPart = 'text' | 'input';
type Preview = { readonly copyable: boolean; readonly read: () => Promise<string | undefined> };
const PreviewContext = createContext<Preview | undefined>(undefined);
export const useProductBodyPreview = () => useContext(PreviewContext);
interface BodyOwner {
  readonly sessionId: string;
  readonly runtimeId?: string;
  readonly source: 'history' | 'view';
}
export const ProductBodyOwnerContext = createContext<BodyOwner | undefined>(undefined);

/** Only incomplete, displayed SDK content owns a reader. Collapsed receipts need no IPC. */
export function ProductItemBody({
  item,
  part = 'text',
  children,
}: {
  item?: SessionProductItem;
  part?: BodyPart;
  children: ReactNode;
}): JSX.Element {
  const owner = useContext(ProductBodyOwnerContext);
  if (!owner || !item) return <>{children}</>;
  const { sessionId, runtimeId, source } = owner;
  if (productItemBodyLength(item, part) === undefined) return <>{children}</>;
  const version = productItemBodyKey(item, part);
  const key = JSON.stringify([sessionId, runtimeId, source, version]);
  return (
    <BodyReader key={key} item={item} owner={owner} part={part} version={version}>
      {children}
    </BodyReader>
  );
}

function BodyReader({
  item,
  owner,
  part,
  version,
  children,
}: {
  item: SessionProductItem;
  owner: BodyOwner;
  part: BodyPart;
  version: string;
  children: ReactNode;
}): JSX.Element {
  const { sessionId, runtimeId, source } = owner;
  const { t } = useI18n();
  const element = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const pending = useRef<Promise<string | undefined> | undefined>(undefined);
  const attempted = useRef(false);
  const [state, setState] = useState<'preview' | 'reading' | 'failed'>('preview');
  const [diagnostic, setDiagnostic] = useState('');
  const draft = item.outputState === 'draft';
  const preview = isProductItemPreview(item, part);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  function stillSelected(): boolean {
    const transcript = productTranscriptSnapshot(sessionId);
    return (
      active.current &&
      useAppStore.getState().currentSessionId === sessionId &&
      transcript?.view?.runtimeId === runtimeId &&
      transcript !== undefined &&
      (transcript.browsingOlder || !transcript.view ? 'history' : 'view') === source &&
      transcript.items.some(
        (current) => current.id === item.id && productItemBodyKey(current, part) === version,
      )
    );
  }

  function read(): Promise<string | undefined> {
    if (pending.current) return pending.current;
    if (draft || !stillSelected()) return Promise.resolve(undefined);
    attempted.current = true;
    setState('reading');
    pending.current = readProductItemText(
      item,
      async (offset) => {
        if (!stillSelected()) throw new Error('The selected body changed.');
        const bridge = window.kodaxSpace;
        if (!bridge) throw new Error(t('conversation.historyRuntimeUnavailable'));
        const result = await bridge.invoke('session.productItem', {
          sessionId,
          itemId: item.id,
          source,
          part,
          offset,
        });
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      part,
      source,
    )
      .then((text) => {
        if (!stillSelected()) return undefined;
        installProductItemContent(sessionId, item, part, text);
        return text;
      })
      .catch((error: unknown) => {
        if (stillSelected()) {
          setDiagnostic(error instanceof Error ? error.message : String(error));
          setState('failed');
        }
        return undefined;
      })
      .finally(() => {
        pending.current = undefined;
      });
    return pending.current;
  }

  // A new source/version mounts a new reader. Other view frames must not retry a failed body.
  const readOnVisible = useRef(read);
  useEffect(() => {
    const node = element.current;
    if (!node || draft || !preview || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      if (!attempted.current) void readOnVisible.current();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [draft, preview]);

  return (
    <div ref={element}>
      <PreviewContext.Provider
        value={
          preview
            ? { copyable: !draft && (item.type === 'assistant' || item.type === 'user'), read }
            : undefined
        }
      >
        {children}
      </PreviewContext.Provider>
      {preview && (
        <div
          className="flex items-center gap-2 text-xs text-fg-muted"
          aria-busy={state === 'reading'}
        >
          <span>
            {t(
              state === 'failed'
                ? 'conversation.bodyReadFailed'
                : draft
                  ? 'conversation.draftBodyPreview'
                  : 'conversation.bodyPreview',
            )}
          </span>
          {!draft && (
            <button
              type="button"
              className="text-info underline"
              disabled={state === 'reading'}
              onClick={() => void read()}
            >
              {t(
                state === 'failed'
                  ? 'message.action.retry'
                  : state === 'reading'
                    ? 'conversation.bodyLoading'
                    : 'conversation.bodyReadFull',
              )}
            </button>
          )}
        </div>
      )}
      {preview && state === 'failed' && diagnostic && (
        <details className="text-xs text-fg-muted">
          <summary>{t('diagnostics.details')}</summary>
          <p>{diagnostic}</p>
        </details>
      )}
    </div>
  );
}
