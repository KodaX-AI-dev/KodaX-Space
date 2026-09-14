import { useCallback, useEffect, useRef, useState } from 'react';
import {
  projectPartnerConnectorResource,
  type PartnerRemoteSourceT,
} from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { invokeExtensionHost } from '../extensions/SpaceExtensionsProvider.js';
import {
  requestPartnerConnectorDetail,
  usePartnerConnectors,
} from '../extensions/PartnerConnectorProvider.js';
import type { PartnerDetailOpenTarget } from './partnerDetailWorkspace.js';

/** Loads the authorized local snapshot, independently of the provider's web URL format. */
export function PartnerRemoteSourcePanel({
  sourceId,
  onOpenDetail,
}: {
  readonly sourceId: string;
  readonly onOpenDetail: (target: PartnerDetailOpenTarget) => void;
}): JSX.Element {
  const { t } = useI18n();
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const surface = useSurfaceStore((state) => state.currentSurface);
  const connectors = usePartnerConnectors();
  const scopeKey = JSON.stringify([projectRoot, sessionId, surface, sourceId]);
  const [result, setResult] = useState<{
    scopeKey: string;
    source: PartnerRemoteSourceT | null;
    error: string | null;
    loading: boolean;
  } | null>(null);
  const control = useRef({ revision: 0 });
  const load = useCallback(async (): Promise<void> => {
    const request = ++control.current.revision;
    if (!projectRoot || !sessionId || surface !== 'partner') return;
    const active = (): boolean =>
      request === control.current.revision &&
      useAppStore.getState().currentProjectPath === projectRoot &&
      useAppStore.getState().currentSessionId === sessionId &&
      useSurfaceStore.getState().currentSurface === surface;
    setResult({ scopeKey, source: null, error: null, loading: true });
    try {
      const { source } = await invokeExtensionHost('partner.connectors.sources.get', {
        projectRoot,
        sessionId,
        id: sourceId,
      });
      if (!active()) return;
      if (
        !source ||
        source.id !== sourceId ||
        source.projectRoot !== projectRoot ||
        source.sessionId !== sessionId
      )
        throw new Error(t('connectors.unavailable'));
      setResult({ scopeKey, source, error: null, loading: false });
    } catch (reason) {
      if (active())
        setResult({
          scopeKey,
          source: null,
          error: reason instanceof Error ? reason.message : String(reason),
          loading: false,
        });
    }
  }, [projectRoot, scopeKey, sessionId, sourceId, surface, t]);
  useEffect(() => {
    const current = control.current;
    void load();
    return () => {
      current.revision++;
    };
  }, [load]);
  const visible = result?.scopeKey === scopeKey ? result : null;
  const source = visible?.source;
  const resource = source ? projectPartnerConnectorResource(source.url) : null;
  const catalogEntry =
    source &&
    connectors?.connectorCatalog.entries.find(
      (entry) =>
        entry.extensionId === source.extensionId &&
        entry.connector.id === source.connectorId &&
        entry.connector.adapter === resource?.adapter,
    );
  return (
    <section
      className="h-full space-y-3 overflow-auto p-4 text-xs"
      data-testid="partner-remote-source-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{source?.title ?? t('connectors.remoteSources')}</h3>
        <button
          type="button"
          className="rounded-md border border-border-default px-2 py-1 disabled:opacity-40"
          disabled={visible?.loading || !projectRoot || !sessionId || surface !== 'partner'}
          onClick={() => void load()}
        >
          {t('connectors.refresh')}
        </button>
      </div>
      {visible?.loading && <p role="status">{t('common.loading')}</p>}
      {visible?.error && (
        <p role="alert" className="text-danger">
          {visible.error}
        </p>
      )}
      {source && (
        <>
          <p className="break-all text-fg-muted">{source.url}</p>
          <p className="text-fg-muted">{t('connectors.historical')}</p>
          <p className="text-fg-muted">
            <time dateTime={source.readAt}>{source.readAt}</time>
            {source.revision > 0 ? ` · r${source.revision}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {resource?.webUrl && (
              <button
                type="button"
                className="rounded-md border border-border-default px-2 py-1"
                onClick={() =>
                  onOpenDetail({
                    kind: 'browser',
                    initialUrl: resource.webUrl,
                    resourceKey: `web-${resource.webUrl}`,
                    title: source.title,
                  })
                }
              >
                {t('connectors.openWebpage')}
              </button>
            )}
            {catalogEntry && (
              <button
                type="button"
                className="rounded-md border border-border-default px-2 py-1"
                onClick={() =>
                  requestPartnerConnectorDetail({
                    context: { surface: 'partner', projectRoot, sessionId },
                    extensionId: source.extensionId,
                    connector: catalogEntry.connector,
                    connectionId: source.connectionId,
                  })
                }
              >
                {t('connectors.setup')}
              </button>
            )}
          </div>
          <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-5">
            {source.content}
          </pre>
        </>
      )}
    </section>
  );
}
