import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type {
  PartnerConnectorConnectionT,
  SpaceConnectorDefinitionT,
} from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { NEW_CONVERSATION_EVENT } from '../../store/newConversation.js';
import { invokeExtensionHost, useSpaceExtensions } from './SpaceExtensionsProvider.js';
import {
  createPartnerConnectorBinding,
  type PartnerConnectorBinding,
} from './partnerConnectorBinding.js';
import { expertContextMatches } from './partnerExpertBinding.js';
import type { ExtensionViewContext } from './extensionViewPolicy.js';

const Context = createContext<{
  binding: PartnerConnectorBinding;
  snapshot: ReturnType<PartnerConnectorBinding['getSnapshot']>;
  connectorCatalog: {
    entries: readonly PartnerConnectorCatalogEntry[];
    loading: boolean;
    error: string | null;
  };
  refreshCatalog: () => Promise<void>;
} | null>(null);
export interface PartnerConnectorCatalogEntry {
  readonly extensionId: string;
  readonly connector: SpaceConnectorDefinitionT;
  readonly connections: readonly PartnerConnectorConnectionT[];
}
export const PARTNER_CONNECTOR_DETAIL_EVENT = 'kodax-space.partner-connector-detail';
export const PARTNER_CONNECTOR_DIALOG_EVENT = 'kodax-space.partner-connector-dialog';
export const PARTNER_CONNECTOR_MANAGE_EVENT = 'kodax-space.partner-connector-manage';
export interface PartnerConnectorDetailRequest {
  readonly context: ExtensionViewContext;
  readonly extensionId: string;
  readonly connector: SpaceConnectorDefinitionT;
  readonly connectionId?: string;
}
export function requestPartnerConnectorDialog(detail: PartnerConnectorDetailRequest): void {
  window.dispatchEvent(new CustomEvent(PARTNER_CONNECTOR_DIALOG_EVENT, { detail }));
}
export function requestPartnerConnectorManagement(
  context: ExtensionViewContext,
  extensionId?: string,
): void {
  window.dispatchEvent(
    new CustomEvent(PARTNER_CONNECTOR_MANAGE_EVENT, { detail: { context, extensionId } }),
  );
}
export function requestPartnerConnectorDetail(detail: PartnerConnectorDetailRequest): void {
  window.dispatchEvent(new CustomEvent(PARTNER_CONNECTOR_DETAIL_EVENT, { detail }));
}
export function PartnerConnectorProvider({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  const surface = useSurfaceStore((state) => state.currentSurface);
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const { catalog: extensionCatalog, snapshot: extensions } = useSpaceExtensions();
  const [connectorCatalog, setConnectorCatalog] = useState<{
    entries: readonly PartnerConnectorCatalogEntry[];
    loading: boolean;
    error: string | null;
  }>({ entries: [], loading: true, error: null });
  const catalogRevision = useRef(0);
  const refreshCatalog = useCallback(async (): Promise<void> => {
    const revision = ++catalogRevision.current;
    if (useSurfaceStore.getState().currentSurface !== 'partner') {
      setConnectorCatalog({ entries: [], loading: false, error: null });
      return;
    }
    const enabled = extensionCatalog
      .getSnapshot()
      .extensions.filter((item) => item.enabled && item.connectorCount > 0);
    const identity = JSON.stringify(
      enabled.map((item) => [item.id, item.version, item.installedAt]),
    );
    setConnectorCatalog((current) => ({ ...current, loading: true, error: null }));
    try {
      const groups = await Promise.all(
        enabled.map(async (extension) => {
          const { connectors } = await invokeExtensionHost('space.extensions.connectors.catalog', {
            extensionId: extension.id,
          });
          return Promise.all(
            connectors.map(async (connector) => ({
              extensionId: extension.id,
              connector,
              connections: (
                await invokeExtensionHost('partner.connectors.accounts', {
                  extensionId: extension.id,
                  connectorId: connector.id,
                })
              ).connections,
            })),
          );
        }),
      );
      if (
        revision !== catalogRevision.current ||
        useSurfaceStore.getState().currentSurface !== 'partner'
      )
        return;
      const currentIdentity = JSON.stringify(
        extensionCatalog
          .getSnapshot()
          .extensions.filter((item) => item.enabled && item.connectorCount > 0)
          .map((item) => [item.id, item.version, item.installedAt]),
      );
      if (currentIdentity !== identity) return;
      setConnectorCatalog({ entries: groups.flat(), loading: false, error: null });
    } catch (reason) {
      if (revision === catalogRevision.current)
        setConnectorCatalog({
          entries: [],
          loading: false,
          error: reason instanceof Error ? reason.message : String(reason),
        });
    }
  }, [extensionCatalog]);
  useEffect(() => {
    void refreshCatalog();
    return () => {
      catalogRevision.current += 1;
    };
  }, [surface, extensions.extensions, refreshCatalog]);
  const [binding] = useState(() =>
    createPartnerConnectorBinding({
      resolve: (root, connectors) =>
        invokeExtensionHost('partner.connectors.resolve', { projectRoot: root, connectors }),
      get: (id) => invokeExtensionHost('session.partnerConnectors.get', { sessionId: id }),
      set: (id, connectors) =>
        invokeExtensionHost('session.partnerConnectors.set', { sessionId: id, connectors }),
    }),
  );
  const stored = useSyncExternalStore(binding.subscribe, binding.getSnapshot, binding.getSnapshot);
  useEffect(() => {
    void binding.setContext({ surface, projectRoot, sessionId });
  }, [binding, surface, projectRoot, sessionId]);
  useEffect(() => {
    const clear = (): void => binding.clearDraft();
    window.addEventListener(NEW_CONVERSATION_EVENT, clear);
    return () => window.removeEventListener(NEW_CONVERSATION_EVENT, clear);
  }, [binding]);
  useEffect(() => {
    const changed = window.kodaxSpace?.on(
      'session.partnerConnectors.changed',
      ({ sessionId: id, state }) => binding.receive(id, state),
    );
    const refreshed = window.kodaxSpace?.on('partner.connectors.changed', () => {
      void binding.refresh();
      void refreshCatalog();
    });
    return () => {
      changed?.();
      refreshed?.();
    };
  }, [binding, refreshCatalog]);
  useEffect(() => {
    void binding.refresh();
  }, [binding, extensions.extensions]);
  const context = { surface, projectRoot, sessionId };
  const snapshot = expertContextMatches(stored.context, context)
    ? stored
    : {
        ...stored,
        context,
        state: { connectors: [] },
        loading: surface === 'partner',
        changing: false,
        error: null,
      };
  const state = {
    connectors: snapshot.state.connectors.map((item) =>
      !extensions.loading &&
      !extensions.extensions.some(
        (extension) => extension.id === item.binding.extensionId && extension.enabled,
      )
        ? { ...item, available: false, unavailableReason: 'Extension disabled or uninstalled' }
        : item,
    ),
  };
  return (
    <Context.Provider
      value={{ binding, snapshot: { ...snapshot, state }, connectorCatalog, refreshCatalog }}
    >
      {children}
    </Context.Provider>
  );
}
export const usePartnerConnectors = () => useContext(Context);
