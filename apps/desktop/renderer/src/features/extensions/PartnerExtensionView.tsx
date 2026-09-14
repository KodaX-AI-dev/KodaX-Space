import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, PackageOpen, Settings2 } from 'lucide-react';
import {
  SPACE_EXTENSION_FRAME_MESSAGE_TYPE,
  SPACE_EXTENSION_FRAME_URL,
  type SpaceExtensionT,
  type PartnerExpertSnapshotT,
  type SpaceConnectorDefinitionT,
} from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import {
  invokeExtensionHost,
  readExtensionView,
  useSpaceExtensions,
} from './SpaceExtensionsProvider.js';
import { buildRestrictedExtensionDocument } from './extensionViewPolicy.js';
import { createExtensionFrameBridge, type ExtensionFrameRequest } from './extensionFrameBridge.js';
import { usePartnerExpert } from './PartnerExpertProvider.js';
import { createPartnerExtensionActions } from './partnerExtensionActions.js';
import { expertContextMatches } from './partnerExpertBinding.js';
import { requestConfirm } from '../../store/confirmStore.js';
import { usePartnerConnectors } from './PartnerConnectorProvider.js';

interface PartnerExtensionViewProps {
  readonly extension: SpaceExtensionT;
  readonly extensions: readonly SpaceExtensionT[];
  readonly onSelect: (extension: SpaceExtensionT) => void;
  readonly onClose: () => void;
  readonly onManage: () => void;
  readonly onExpertSelected: () => void;
  readonly onExpertDetails: (expert: PartnerExpertSnapshotT) => void;
  readonly onConnectorDetails: (connector: SpaceConnectorDefinitionT) => void;
  readonly initialTab?: 'experts' | 'connectors';
  readonly navigationRevision?: number;
}

/** Only a bounded, source-checked business bridge is exposed to the opaque package frame. */
export function ExtensionFrame({
  html,
  title,
  onRequest,
  initialTab = 'experts',
  navigationRevision = 0,
  connectorStatusKey = '',
}: {
  readonly html: string;
  readonly title: string;
  readonly onRequest?: (request: ExtensionFrameRequest) => Promise<unknown>;
  readonly initialTab?: 'experts' | 'connectors';
  readonly navigationRevision?: number;
  readonly connectorStatusKey?: string;
}): JSX.Element {
  const documentHtml = useMemo(() => buildRestrictedExtensionDocument(html), [html]);
  const sentDocument = useRef<string | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [token] = useState(() => globalThis.crypto.randomUUID());
  const requestHandler = useRef(onRequest);
  requestHandler.current = onRequest;
  const tabRef = useRef(initialTab);
  tabRef.current = initialTab;
  useEffect(() => {
    const bridge = createExtensionFrameBridge({
      token,
      source: () => frame.current?.contentWindow,
      dispatch: (request) =>
        requestHandler.current?.(request) ??
        Promise.reject(new Error('Extension action unavailable')),
      reply: (message) => frame.current?.contentWindow?.postMessage(message, '*'),
    });
    const onMessage = (event: MessageEvent): void => {
      if (!frame.current?.contentWindow || event.source !== frame.current.contentWindow) return;
      if (event.data?.type === 'space-extension.ready.v1') {
        frame.current.contentWindow.postMessage(
          { type: 'space-extension.init.v1', token, initialTab: tabRef.current },
          '*',
        );
        return;
      }
      void bridge.receive(event);
    };
    window.addEventListener('message', onMessage);
    return () => {
      bridge.dispose();
      window.removeEventListener('message', onMessage);
    };
  }, [token]);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { type: 'space-extension.connectors.changed.v1', token },
      '*',
    );
  }, [token, connectorStatusKey]);
  useEffect(() => {
    if (initialTab === 'connectors')
      frame.current?.contentWindow?.postMessage(
        { type: 'space-extension.navigate.v1', token, tab: 'connectors' },
        '*',
      );
  }, [token, initialTab, navigationRevision]);
  return (
    <iframe
      ref={frame}
      title={title}
      data-testid="space-extension-frame"
      src={SPACE_EXTENSION_FRAME_URL}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'"
      onLoad={(event) => {
        if (sentDocument.current === documentHtml) return;
        sentDocument.current = documentHtml;
        event.currentTarget.contentWindow?.postMessage(
          { type: SPACE_EXTENSION_FRAME_MESSAGE_TYPE, documentHtml },
          '*',
        );
        event.currentTarget.contentWindow?.postMessage(
          { type: 'space-extension.init.v1', token, initialTab },
          '*',
        );
      }}
      className="h-full min-h-0 w-full flex-1 border-0 bg-surface"
    />
  );
}

export function PartnerExtensionView({
  extension,
  extensions,
  onSelect,
  onClose,
  onManage,
  onExpertSelected,
  onExpertDetails,
  onConnectorDetails,
  initialTab,
  navigationRevision,
}: PartnerExtensionViewProps): JSX.Element {
  const { t } = useI18n();
  const [view, setView] = useState<{ key: string; html?: string; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const expertContext = usePartnerExpert();
  const connectorContext = usePartnerConnectors();
  const { catalog } = useSpaceExtensions();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { id, version, installedAt } = extension;
  const key = `${id}:${version}:${installedAt}`;

  useEffect(() => {
    let active = true;
    setView(null);
    void readExtensionView(id)
      .then((result) => {
        if (!active) return;
        if (
          result.extension.id !== id ||
          !result.extension.enabled ||
          result.extension.version !== version ||
          result.extension.installedAt !== installedAt
        ) {
          setView({ key, error: t('extensions.viewChanged') });
          return;
        }
        setView({ key, html: result.html });
      })
      .catch((error: unknown) => {
        if (active) setView({ key, error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      active = false;
    };
  }, [id, version, installedAt, key, retry, t]);

  const currentView = view?.key === key ? view : null;
  const handleRequest = createPartnerExtensionActions({
    extensionId: id,
    connectors: {
      catalog: async () => {
        const result = await invokeExtensionHost('space.extensions.connectors.catalog', {
          extensionId: id,
        });
        const statuses = await Promise.all(
          result.connectors.map(async (connector) => ({
            id: connector.id,
            connected: (
              await invokeExtensionHost('partner.connectors.accounts', {
                extensionId: id,
                connectorId: connector.id,
              })
            ).connections.some((account) => account.connected),
          })),
        );
        // The independent page receives declarations plus booleans, never account fields or auth jobs.
        return {
          connectors: result.connectors,
          connectedIds: statuses.filter((item) => item.connected).map((item) => item.id),
        };
      },
      onConfigure: onConnectorDetails,
    },
    isActive: () =>
      mounted.current &&
      catalog
        .getSnapshot()
        .extensions.some(
          (entry) =>
            entry.id === id &&
            entry.enabled &&
            entry.version === version &&
            entry.installedAt === installedAt,
        ) &&
      (!expertContext ||
        expertContextMatches(
          expertContext.snapshot.context,
          expertContext.binding.getSnapshot().context,
        )),
    api: {
      catalog: (extensionId) => invokeExtensionHost('space.extensions.catalog', { extensionId }),
      resolve: (ref) => invokeExtensionHost('space.extensions.resolveExpert', ref),
      save: (input) => invokeExtensionHost('space.extensions.expert.save', input),
      delete: (ref) => invokeExtensionHost('space.extensions.expert.delete', ref),
    },
    selectExpert: async (ref) => {
      if (!expertContext) throw new Error('Partner context unavailable');
      await expertContext.binding.select(ref);
    },
    onSelected: onExpertSelected,
    onDetails: onExpertDetails,
    confirmDelete: (selected) =>
      requestConfirm({
        title: t('extensions.expertDeleteTitle'),
        message: t('extensions.expertDeleteConfirm', { name: selected.expert.name }),
        confirmLabel: t('common.delete'),
        danger: true,
      }),
  });
  return (
    <section
      data-testid="partner-extension-view"
      className="glass lift flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-default bg-surface"
    >
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border-default px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-fg-muted hover:bg-hover-bg hover:text-fg-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('extensions.backToConversation')}
        </button>
        <PackageOpen className="h-4 w-4 shrink-0 text-accent-ink" aria-hidden />
        {extensions.length > 1 ? (
          <select
            value={id}
            onChange={(event) => {
              const selected = extensions.find((entry) => entry.id === event.target.value);
              if (selected) onSelect(selected);
            }}
            aria-label={t('extensions.chooseLibrary')}
            className="min-w-0 max-w-sm rounded-md border border-border-default bg-surface px-2 py-1 text-xs"
          >
            {extensions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        ) : (
          <h2 className="truncate text-sm font-medium">{extension.name}</h2>
        )}
        <span className="text-[10px] text-fg-muted">v{extension.version}</span>
        <button
          type="button"
          onClick={onManage}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-fg-muted hover:bg-hover-bg hover:text-fg-primary"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          {t('extensions.manage')}
        </button>
      </header>
      {currentView?.html !== undefined ? (
        <ExtensionFrame
          key={`${key}:${retry}`}
          html={currentView.html}
          title={extension.name}
          onRequest={handleRequest}
          initialTab={initialTab}
          navigationRevision={navigationRevision}
          connectorStatusKey={JSON.stringify(
            connectorContext?.connectorCatalog.entries
              .filter((item) => item.extensionId === id)
              .map((item) => [
                item.connector.id,
                item.connections.some((connection) => connection.connected),
              ]),
          )}
        />
      ) : currentView?.error ? (
        <div role="alert" className="m-auto max-w-md p-6 text-center">
          <p className="text-sm text-fg-primary">{t('extensions.viewFailed')}</p>
          <p className="mt-2 break-words text-xs text-fg-muted">{currentView.error}</p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="mt-4 rounded-md border border-border-default px-3 py-1.5 text-xs hover:bg-hover-bg"
          >
            {t('common.refresh')}
          </button>
        </div>
      ) : (
        <p role="status" className="m-auto flex items-center gap-2 text-xs text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('common.loading')}
        </p>
      )}
    </section>
  );
}
