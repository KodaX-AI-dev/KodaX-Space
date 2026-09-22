import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { normalizeWebPreviewUrl } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import {
  WebPreviewDiagnosticBanner,
  useWebPreviewDiagnostics,
} from './WebPreviewDiagnosticBanner.js';

interface LocalProjectWebPreviewProps {
  readonly projectRoot: string;
  readonly path: string;
  readonly revision: number;
  readonly networkAccess: boolean;
}

type ProjectWebPreviewProps =
  | LocalProjectWebPreviewProps
  | {
      readonly url: string;
      readonly title?: string;
    };

/** One preview surface for workspace HTML and authorized remote web pages. */
export function ProjectWebPreview(props: ProjectWebPreviewProps): JSX.Element {
  return 'url' in props ? (
    <RemoteProjectWebPreview key={props.url} {...props} />
  ) : (
    <LocalProjectWebPreview {...props} />
  );
}

function RemoteProjectWebPreview({
  url: requestedUrl,
  title,
}: {
  readonly url: string;
  readonly title?: string;
}): JSX.Element {
  const { t } = useI18n();
  const url = normalizeWebPreviewUrl(requestedUrl);
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<{
    id: string;
    url: string;
    status: 'loading' | 'loaded' | 'failed';
  } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    let id: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bridge = window.kodaxSpace;
    setPreview(null);
    setError(false);
    if (!bridge || !url) {
      setError(true);
      return;
    }
    const release = (grantId: string): void => {
      void bridge
        .invoke('webPreview.release', { id: grantId })
        .then((result) => {
          if (!result.ok) console.warn('[web-preview] Could not release preview grant');
        })
        .catch(() => console.warn('[web-preview] Could not release preview grant'));
    };
    const unsubscribe = bridge.on('webPreview.failed', (failure) => {
      if (!disposed && failure.id === id) {
        setPreview((current) => (current?.id === id ? { ...current, status: 'failed' } : current));
      }
    });
    void bridge
      .invoke('webPreview.prepare', { url })
      .then((result) => {
        if (!result.ok) {
          if (!disposed) setError(true);
          return;
        }
        id = result.data.id;
        if (disposed) {
          release(id);
          return;
        }
        setPreview({ ...result.data, status: 'loading' });
        timer = setTimeout(() => {
          setPreview((current) =>
            current?.id === id && current.status === 'loading'
              ? { ...current, status: 'failed' }
              : current,
          );
        }, 30000);
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      clearTimeout(timer);
      unsubscribe();
      if (id) release(id);
    };
  }, [url, revision]);
  const failed = error || preview?.status === 'failed';
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="project-web-preview">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-default px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted" title={url ?? undefined}>
          {url ?? title}
        </span>
        <button
          type="button"
          className="rounded p-1 hover:bg-hover-bg"
          aria-label={t('webPreview.reload')}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      {failed ? (
        <div role="alert" className="p-4 text-sm text-fg-secondary">
          {t('webPreview.remoteFailed')}
        </div>
      ) : (
        <>
          {preview?.status !== 'loaded' && (
            <p role="status" className="shrink-0 p-2 text-xs text-fg-muted">
              {t('webPreview.loading')}
            </p>
          )}
          {preview && (
            <iframe
              key={preview.id}
              name={`space-web-preview-${preview.id}`}
              title={title ?? t('webPreview.remoteTitle')}
              src={preview.url}
              sandbox="allow-scripts allow-same-origin allow-forms"
              referrerPolicy="no-referrer"
              onLoad={() =>
                setPreview((current) =>
                  current?.id === preview.id && current.status === 'loading'
                    ? { ...current, status: 'loaded' }
                    : current,
                )
              }
              className="h-full min-h-0 w-full flex-1 border-0 bg-white"
            />
          )}
        </>
      )}
    </div>
  );
}

function withRevision(url: string, revision: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set('v', String(revision));
  return parsed.toString();
}

function LocalProjectWebPreview({
  projectRoot,
  path,
  revision,
  networkAccess,
}: LocalProjectWebPreviewProps): JSX.Element {
  const { t } = useI18n();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestKey = `${projectRoot}\u0000${path}\u0000${revision}\u0000${networkAccess}`;
  const [diagnostics, dismissDiagnostics, documentReady] = useWebPreviewDiagnostics(
    frameRef,
    url ?? requestKey,
  );

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(null);
    const bridge = window.kodaxSpace;
    if (!bridge) {
      setError(t('artifact.runtimeUnavailable'));
      return () => {
        cancelled = true;
      };
    }
    void bridge
      .invoke('files.webPreview', { projectRoot, path, networkAccess })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error?.message ?? t('common.unknownError'));
          return;
        }
        setUrl(withRevision(result.data.url, revision));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(
          reason instanceof Error && reason.message ? reason.message : t('common.unknownError'),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [networkAccess, path, projectRoot, revision, t]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-[11px] text-danger">
        {t('webPreview.loadFailed', { message: error })}
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-[11px] text-fg-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
        {t('webPreview.loading')}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="project-web-preview">
      <WebPreviewDiagnosticBanner
        diagnostics={diagnostics}
        networkAccess={networkAccess}
        canEnableNetwork
        onDismiss={dismissDiagnostics}
      />
      <iframe
        key={url}
        ref={frameRef}
        title={t('webPreview.projectTitle')}
        src={url}
        sandbox="allow-scripts allow-same-origin allow-forms"
        referrerPolicy="no-referrer"
        aria-busy={!documentReady}
        data-ready={documentReady ? 'true' : 'false'}
        tabIndex={documentReady ? 0 : -1}
        className="h-full min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
