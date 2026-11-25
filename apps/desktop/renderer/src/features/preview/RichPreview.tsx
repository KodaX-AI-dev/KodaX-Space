import { Suspense, lazy, useEffect, useState } from 'react';
import { PREVIEW_SIZE_CAPS, formatBytes, type RichPreviewKind } from './binaryUtils.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import { textFilePresentation } from './previewPresentation.js';
import {
  OpenWithSystemButton,
  PreviewUnavailable,
  type SystemOpenTarget,
} from './PreviewUnavailable.js';

const PdfViewer = lazy(() => import('./PdfViewer.js').then((m) => ({ default: m.PdfViewer })));
const DocxViewer = lazy(() => import('./DocxViewer.js').then((m) => ({ default: m.DocxViewer })));
const XlsxViewer = lazy(() => import('./XlsxViewer.js').then((m) => ({ default: m.XlsxViewer })));
const PptxViewer = lazy(() => import('./PptxViewer.js').then((m) => ({ default: m.PptxViewer })));
const MediaFileViewer = lazy(() =>
  import('./MediaFileViewer.js').then((m) => ({ default: m.MediaFileViewer })),
);
const TextFileViewer = lazy(() =>
  import('./TextFileViewer.js').then((m) => ({ default: m.TextFileViewer })),
);

interface Props {
  readonly projectRoot?: string;
  readonly path: string;
  readonly kind: RichPreviewKind;
  readonly fileSource?: 'workspace' | 'artifact-store' | 'delivery-store';
  readonly artifactId?: string;
  readonly deliveryId?: string;
  readonly version?: number;
}

export function RichPreview({
  projectRoot,
  path,
  kind,
  fileSource = 'workspace',
  artifactId,
  deliveryId,
  version,
}: Props): JSX.Element {
  const { t } = useI18n();
  const [base64, setBase64] = useState<string | null>(null);
  const [truncated, setTruncated] = useState<{ size: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Absolute on-disk path reported by store-backed reads (artifact/delivery).
  const [storedPath, setStoredPath] = useState<string | null>(null);

  useEffect(() => {
    if (!window.kodaxSpace) return;
    if (fileSource === 'workspace' && !projectRoot) {
      setBase64(null);
      setTruncated(null);
      setBusy(false);
      setErr(t('preview.failedLoadFile'));
      return;
    }
    if (fileSource === 'artifact-store' && !artifactId) {
      setBase64(null);
      setTruncated(null);
      setBusy(false);
      setErr(t('preview.failedLoadFile'));
      return;
    }
    if (fileSource === 'delivery-store' && !deliveryId) {
      setBase64(null);
      setTruncated(null);
      setBusy(false);
      setErr(t('preview.failedLoadFile'));
      return;
    }
    let cancelled = false;
    setBusy(true);
    setErr(null);
    setBase64(null);
    setTruncated(null);
    setStoredPath(null);

    const request = (() => {
      if (fileSource === 'artifact-store') {
        return window.kodaxSpace.invoke('artifact.readBinary', {
          id: artifactId!,
          ...(version !== undefined ? { version } : {}),
          maxBytes: PREVIEW_SIZE_CAPS[kind],
        });
      }
      if (fileSource === 'delivery-store') {
        return window.kodaxSpace.invoke('partner.deliveries.readBinary', {
          id: deliveryId!,
          maxBytes: PREVIEW_SIZE_CAPS[kind],
        });
      }
      return window.kodaxSpace.invoke('files.readBinary', {
        projectRoot: projectRoot!,
        path,
        maxBytes: PREVIEW_SIZE_CAPS[kind],
      });
    })();

    void request
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setErr(t('preview.failedLoadFile'));
          return;
        }
        const storePath = 'path' in r.data ? r.data.path : undefined;
        if (typeof storePath === 'string' && storePath.length > 0) setStoredPath(storePath);
        if (r.data.truncated) {
          setTruncated({ size: r.data.size });
          return;
        }
        setBase64(r.data.base64);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectRoot, path, kind, t, fileSource, artifactId, deliveryId, version]);

  const systemOpenTarget: SystemOpenTarget | null =
    fileSource === 'workspace'
      ? projectRoot
        ? { path, projectRoot }
        : null
      : storedPath !== null
        ? { path: storedPath }
        : null;
  const fallbackAction =
    systemOpenTarget !== null ? <OpenWithSystemButton target={systemOpenTarget} /> : null;

  if (busy && base64 === null) {
    return <div className="p-3 text-xs text-fg-muted">{t('preview.loading')}</div>;
  }
  if (err !== null) {
    return <PreviewUnavailable tone="danger" message={err} action={fallbackAction} />;
  }
  if (truncated !== null) {
    return (
      <PreviewUnavailable
        message={t('preview.fileTooLarge', {
          size: formatBytes(truncated.size),
          kind: kind.toUpperCase(),
          cap: formatBytes(PREVIEW_SIZE_CAPS[kind]),
        })}
        action={fallbackAction}
      />
    );
  }
  if (base64 === null)
    return <div className="p-3 text-xs text-fg-muted">{t('preview.noContent')}</div>;

  return (
    <div className="h-full min-h-0" data-testid="rich-preview" data-preview-kind={kind}>
      <Suspense
        fallback={<div className="p-3 text-xs text-fg-muted">{t('preview.loadingViewer')}</div>}
      >
        {kind === 'pdf' && <PdfViewer base64={base64} fallbackAction={fallbackAction} />}
        {kind === 'docx' && <DocxViewer base64={base64} fallbackAction={fallbackAction} />}
        {kind === 'xlsx' && <XlsxViewer base64={base64} fallbackAction={fallbackAction} />}
        {kind === 'pptx' && <PptxViewer base64={base64} fallbackAction={fallbackAction} />}
        {kind === 'text' && (
          <TextFileViewer
            base64={base64}
            path={path}
            presentation={textFilePresentation(path)}
            projectRoot={projectRoot}
            fileSource={fileSource}
          />
        )}
        {(kind === 'image' || kind === 'video' || kind === 'audio') && (
          <MediaFileViewer
            base64={base64}
            path={path}
            kind={kind}
            fallbackAction={fallbackAction}
          />
        )}
      </Suspense>
    </div>
  );
}
