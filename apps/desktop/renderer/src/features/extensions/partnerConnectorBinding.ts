import type {
  PartnerConnectorSelectionT,
  PartnerConnectorSnapshotT,
  PartnerConnectorStateT,
} from '@kodax-space/space-ipc-schema';
import type { ExtensionViewContext } from './extensionViewPolicy.js';
import { expertContextMatches } from './partnerExpertBinding.js';

export interface PartnerConnectorApi {
  resolve(
    projectRoot: string,
    connectors: PartnerConnectorSelectionT[],
  ): Promise<PartnerConnectorStateT>;
  get(sessionId: string): Promise<PartnerConnectorStateT>;
  set(sessionId: string, connectors: PartnerConnectorSelectionT[]): Promise<PartnerConnectorStateT>;
}
export interface PartnerConnectorDraftCapture {
  readonly context: ExtensionViewContext;
  readonly epoch: number;
  readonly revision: number;
  readonly connectors: PartnerConnectorSelectionT[];
}
interface BindingSnapshot {
  readonly context: ExtensionViewContext;
  readonly state: PartnerConnectorStateT;
  readonly loading: boolean;
  readonly changing: boolean;
  readonly error: string | null;
}
export function connectorSelection(binding: PartnerConnectorSnapshotT): PartnerConnectorSelectionT {
  const { name: _name, accountLabel: _accountLabel, ...selection } = binding;
  return structuredClone(selection);
}

/** Session and document scope stay outside the extension frame. No account or network side effects. */
export function createPartnerConnectorBinding(api: PartnerConnectorApi) {
  let snapshot: BindingSnapshot = {
    context: { surface: 'code', projectRoot: null, sessionId: null },
    state: { connectors: [] },
    loading: false,
    changing: false,
    error: null,
  };
  let epoch = 0;
  let revision = 0;
  let loadRevision = 0;
  let refreshAfterChange = false;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<BindingSnapshot>): void => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const selections = (): PartnerConnectorSelectionT[] =>
    snapshot.state.connectors.map((item) => connectorSelection(item.binding));
  const isCaptureCurrent = (capture: PartnerConnectorDraftCapture): boolean =>
    capture.epoch === epoch &&
    capture.revision === revision &&
    expertContextMatches(capture.context, snapshot.context);
  async function refresh(): Promise<void> {
    const { context } = snapshot;
    if (context.surface !== 'partner' || !context.projectRoot) return;
    if (snapshot.changing) {
      refreshAfterChange = true;
      return;
    }
    if (!context.sessionId && !snapshot.state.connectors.length) return;
    const expectedEpoch = epoch;
    const expectedLoad = ++loadRevision;
    publish({ loading: true, error: null });
    try {
      const state = context.sessionId
        ? await api.get(context.sessionId)
        : await api.resolve(context.projectRoot, selections());
      if (epoch === expectedEpoch && loadRevision === expectedLoad)
        publish({ state, loading: false });
    } catch (error) {
      if (epoch !== expectedEpoch || loadRevision !== expectedLoad) return;
      const message = error instanceof Error ? error.message : String(error);
      publish({
        loading: false,
        error: message,
        state: {
          connectors: snapshot.state.connectors.map((item) => ({
            ...item,
            available: false,
            unavailableReason: message,
          })),
        },
      });
    }
  }
  async function change(connectors: PartnerConnectorSelectionT[]): Promise<void> {
    const { context } = snapshot;
    if (context.surface !== 'partner' || !context.projectRoot)
      throw new Error('Open a Partner project first');
    if (snapshot.changing) throw new Error('Connector configuration is still being saved');
    if (snapshot.loading) throw new Error('Wait for connector configuration to finish loading');
    const expectedEpoch = epoch;
    const expectedLoad = ++loadRevision;
    revision += 1;
    const expectedSelection = revision;
    let changeError: string | null = null;
    publish({ changing: true, loading: false, error: null });
    try {
      const state = context.sessionId
        ? await api.set(context.sessionId, connectors)
        : await api.resolve(context.projectRoot, connectors);
      if (epoch !== expectedEpoch) throw new Error('Partner connector scope changed');
      if (loadRevision === expectedLoad) publish({ state });
      else refreshAfterChange = true;
    } catch (error) {
      changeError = error instanceof Error ? error.message : String(error);
      if (epoch === expectedEpoch) publish({ error: changeError });
      throw error;
    } finally {
      if (epoch === expectedEpoch) {
        publish({ changing: false });
        if (refreshAfterChange) {
          refreshAfterChange = false;
          await refresh();
          if (changeError && epoch === expectedEpoch && revision === expectedSelection)
            publish({ error: changeError });
        }
      }
    }
  }
  const clear = (context = snapshot.context): void => {
    epoch += 1;
    revision += 1;
    loadRevision += 1;
    refreshAfterChange = false;
    publish({ context, state: { connectors: [] }, loading: false, changing: false, error: null });
  };
  return {
    getSnapshot: (): BindingSnapshot => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setContext: async (context: ExtensionViewContext): Promise<void> => {
      if (expertContextMatches(context, snapshot.context)) return;
      clear(context);
      await refresh();
    },
    refresh,
    clearDraft: (): void => {
      if (snapshot.context.surface === 'partner' && !snapshot.context.sessionId) clear();
    },
    receive: (sessionId: string, state: PartnerConnectorStateT): void => {
      if (snapshot.context.surface !== 'partner' || snapshot.context.sessionId !== sessionId)
        return;
      loadRevision += 1;
      publish({ state, loading: false, error: null });
    },
    select: async (selection: PartnerConnectorSelectionT): Promise<void> => {
      if (snapshot.error) throw new Error(snapshot.error);
      return change([
        ...selections().filter((item) => item.connectionId !== selection.connectionId),
        structuredClone(selection),
      ]);
    },
    remove: async (connectionId: string): Promise<void> => {
      if (snapshot.context.sessionId)
        return change(selections().filter((item) => item.connectionId !== connectionId));
      if (snapshot.context.surface !== 'partner') throw new Error('Open a Partner project first');
      if (snapshot.changing) throw new Error('Connector configuration is still being saved');
      // Revocation is a pure subtraction, even if every retained account is offline.
      // Never require a remaining unavailable binding to reconnect just to remove another.
      revision += 1;
      loadRevision += 1;
      publish({
        state: {
          connectors: snapshot.state.connectors.filter(
            (item) => item.binding.connectionId !== connectionId,
          ),
        },
        loading: false,
        error: null,
      });
    },
    captureDraft: (context: ExtensionViewContext): PartnerConnectorDraftCapture => {
      if (
        context.surface !== 'partner' ||
        context.sessionId ||
        !expertContextMatches(context, snapshot.context)
      )
        throw new Error('Partner connector draft scope changed');
      if (snapshot.loading || snapshot.changing)
        throw new Error('Wait for connector configuration to finish loading');
      const unavailable = snapshot.state.connectors.find((item) => !item.available);
      if (unavailable || snapshot.error)
        throw new Error(
          unavailable?.unavailableReason ?? snapshot.error ?? 'Connector unavailable',
        );
      return { context, epoch, revision, connectors: selections() };
    },
    isCaptureCurrent,
    acceptCreatedSession: (
      capture: PartnerConnectorDraftCapture,
      sessionId: string,
      connectors: readonly PartnerConnectorSnapshotT[],
    ): boolean => {
      if (!isCaptureCurrent(capture)) return false;
      epoch += 1;
      revision += 1;
      loadRevision += 1;
      publish({
        context: { ...capture.context, sessionId },
        state: { connectors: connectors.map((binding) => ({ binding, available: true })) },
        loading: false,
        changing: false,
        error: null,
      });
      return true;
    },
  };
}
export type PartnerConnectorBinding = ReturnType<typeof createPartnerConnectorBinding>;
