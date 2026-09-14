import type {
  PartnerExpertSnapshotT,
  PartnerExpertStateT,
  SpaceExpertRefT,
} from '@kodax-space/space-ipc-schema';
import type { ExtensionViewContext } from './extensionViewPolicy.js';

export interface PartnerExpertApi {
  resolve(ref: SpaceExpertRefT): Promise<PartnerExpertSnapshotT>;
  get(sessionId: string): Promise<PartnerExpertStateT>;
  set(sessionId: string, expert: SpaceExpertRefT | null): Promise<PartnerExpertStateT>;
}

export interface PartnerExpertBindingSnapshot {
  readonly context: ExtensionViewContext;
  readonly state: PartnerExpertStateT;
  readonly loading: boolean;
  readonly changing: boolean;
  readonly error: string | null;
}

export interface PartnerExpertDraftCapture {
  readonly context: ExtensionViewContext;
  readonly epoch: number;
  readonly selectionRevision: number;
  readonly expert?: SpaceExpertRefT;
}

export function expertRef(snapshot: PartnerExpertSnapshotT): SpaceExpertRefT {
  return {
    extensionId: snapshot.extensionId,
    expertId: snapshot.expert.id,
    revision: snapshot.expert.revision,
    ...(snapshot.useSkill !== undefined ? { useSkill: snapshot.useSkill } : {}),
  };
}

export function expertContextMatches(
  left: ExtensionViewContext,
  right: ExtensionViewContext,
): boolean {
  return (
    left.surface === right.surface &&
    left.projectRoot === right.projectRoot &&
    left.sessionId === right.sessionId
  );
}

/** A single current draft plus authoritative session state, never another Skill registry. */
export function createPartnerExpertBinding(api: PartnerExpertApi) {
  let snapshot: PartnerExpertBindingSnapshot = {
    context: { surface: 'code', projectRoot: null, sessionId: null },
    state: { expert: null, available: true },
    loading: false,
    changing: false,
    error: null,
  };
  let epoch = 0;
  let loadRevision = 0;
  let selectionRevision = 0;
  let refreshAfterChange = false;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<PartnerExpertBindingSnapshot>): void => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };

  async function refresh(): Promise<void> {
    const context = snapshot.context;
    if (context.surface !== 'partner') return;
    if (snapshot.changing) {
      refreshAfterChange = true;
      return;
    }
    const currentExpert = snapshot.state.expert;
    if (!context.sessionId && !currentExpert) return;
    const expectedEpoch = epoch;
    const expectedLoad = ++loadRevision;
    publish({ loading: true, error: null });
    try {
      const state = context.sessionId
        ? await api.get(context.sessionId)
        : {
            expert: await api.resolve(expertRef(currentExpert!)),
            available: true,
          };
      if (epoch === expectedEpoch && loadRevision === expectedLoad)
        publish({ state, loading: false });
    } catch (error) {
      if (epoch !== expectedEpoch || loadRevision !== expectedLoad) return;
      const message = error instanceof Error ? error.message : String(error);
      publish({
        loading: false,
        error: message,
        state: { ...snapshot.state, available: false, unavailableReason: message },
      });
    }
  }

  async function change(expert: SpaceExpertRefT | null): Promise<void> {
    const context = snapshot.context;
    if (context.surface !== 'partner')
      throw new Error('Expert selection is only available in Partner');
    if (snapshot.changing) throw new Error('An expert selection is still being saved');
    const expectedEpoch = epoch;
    const expectedLoad = ++loadRevision;
    const expectedSelection = ++selectionRevision;
    let changeError: string | null = null;
    publish({ changing: true, loading: false, error: null });
    try {
      const state = context.sessionId
        ? await api.set(context.sessionId, expert)
        : {
            expert: expert ? await api.resolve(expert) : null,
            available: true,
          };
      if (epoch !== expectedEpoch) throw new Error('Partner expert selection scope changed');
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
          if (changeError && epoch === expectedEpoch && selectionRevision === expectedSelection)
            publish({ error: changeError });
        }
      }
    }
  }

  return {
    getSnapshot: (): PartnerExpertBindingSnapshot => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setContext: async (context: ExtensionViewContext): Promise<void> => {
      if (expertContextMatches(snapshot.context, context)) return;
      epoch += 1;
      loadRevision += 1;
      selectionRevision += 1;
      refreshAfterChange = false;
      publish({
        context,
        state: { expert: null, available: true },
        loading: false,
        changing: false,
        error: null,
      });
      await refresh();
    },
    refresh,
    clearDraft: (): void => {
      if (snapshot.context.surface !== 'partner' || snapshot.context.sessionId) return;
      epoch += 1;
      loadRevision += 1;
      selectionRevision += 1;
      refreshAfterChange = false;
      publish({
        state: { expert: null, available: true },
        loading: false,
        changing: false,
        error: null,
      });
    },
    receive: (sessionId: string, state: PartnerExpertStateT): void => {
      if (snapshot.context.surface !== 'partner' || snapshot.context.sessionId !== sessionId)
        return;
      loadRevision += 1;
      publish({ state, loading: false, error: null });
    },
    select: (ref: SpaceExpertRefT): Promise<void> => change(ref),
    remove: (): Promise<void> => change(null),
    captureDraft: (context: ExtensionViewContext): PartnerExpertDraftCapture => {
      if (
        context.surface !== 'partner' ||
        context.sessionId ||
        !expertContextMatches(context, snapshot.context)
      )
        throw new Error('Partner draft scope changed');
      if (snapshot.loading || snapshot.changing)
        throw new Error('Wait for the expert configuration to finish loading');
      if (!snapshot.state.available)
        throw new Error(snapshot.state.unavailableReason ?? 'The expert is unavailable');
      return {
        context,
        epoch,
        selectionRevision,
        ...(snapshot.state.expert ? { expert: expertRef(snapshot.state.expert) } : {}),
      };
    },
    isCaptureCurrent: (capture: PartnerExpertDraftCapture): boolean =>
      capture.epoch === epoch &&
      capture.selectionRevision === selectionRevision &&
      expertContextMatches(capture.context, snapshot.context),
    acceptCreatedSession: (
      capture: PartnerExpertDraftCapture,
      sessionId: string,
      expert: PartnerExpertSnapshotT | null | undefined,
    ): boolean => {
      if (
        capture.epoch !== epoch ||
        capture.selectionRevision !== selectionRevision ||
        !expertContextMatches(capture.context, snapshot.context)
      )
        return false;
      epoch += 1;
      loadRevision += 1;
      selectionRevision += 1;
      publish({
        context: { ...capture.context, sessionId },
        state: { expert: expert ?? null, available: true },
        loading: false,
        changing: false,
        error: null,
      });
      return true;
    },
  };
}

export type PartnerExpertBinding = ReturnType<typeof createPartnerExpertBinding>;
