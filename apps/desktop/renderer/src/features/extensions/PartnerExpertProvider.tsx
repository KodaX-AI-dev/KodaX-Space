import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { PartnerExpertSnapshotT } from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { NEW_CONVERSATION_EVENT } from '../../store/newConversation.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import { invokeExtensionHost, useSpaceExtensions } from './SpaceExtensionsProvider.js';
import {
  createPartnerExpertBinding,
  expertContextMatches,
  type PartnerExpertBinding,
  type PartnerExpertBindingSnapshot,
} from './partnerExpertBinding.js';
import type { ExtensionViewContext } from './extensionViewPolicy.js';

const PartnerExpertContext = createContext<{
  readonly binding: PartnerExpertBinding;
  readonly snapshot: PartnerExpertBindingSnapshot;
} | null>(null);
export const PARTNER_EXPERT_DETAIL_EVENT = 'kodax-space.partner-expert-detail';
export const PARTNER_EXPERT_MANAGE_EVENT = 'kodax-space.partner-expert-manage';
export interface PartnerExpertDetailRequest {
  readonly context: ExtensionViewContext;
  readonly expert: PartnerExpertSnapshotT;
}

export function requestPartnerExpertDetail(
  expert: PartnerExpertSnapshotT,
  context: ExtensionViewContext,
): void {
  window.dispatchEvent(
    new CustomEvent<PartnerExpertDetailRequest>(PARTNER_EXPERT_DETAIL_EVENT, {
      detail: { expert, context },
    }),
  );
}

export function requestPartnerExpertManagement(context: ExtensionViewContext): void {
  window.dispatchEvent(new CustomEvent(PARTNER_EXPERT_MANAGE_EVENT, { detail: { context } }));
}

export function PartnerExpertProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const { t } = useI18n();
  const surface = useSurfaceStore((state) => state.currentSurface);
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const { snapshot: extensions } = useSpaceExtensions();
  const [binding] = useState(() =>
    createPartnerExpertBinding({
      resolve: async (ref) =>
        (await invokeExtensionHost('space.extensions.resolveExpert', ref)).expert,
      get: (id) => invokeExtensionHost('session.partnerExpert.get', { sessionId: id }),
      set: (id, expert) =>
        invokeExtensionHost('session.partnerExpert.set', { sessionId: id, expert }),
    }),
  );
  const stored = useSyncExternalStore(binding.subscribe, binding.getSnapshot, binding.getSnapshot);
  useEffect(() => {
    void binding.setContext({ surface, projectRoot, sessionId });
  }, [binding, surface, projectRoot, sessionId]);
  useEffect(() => {
    const clearDraft = (): void => binding.clearDraft();
    window.addEventListener(NEW_CONVERSATION_EVENT, clearDraft);
    return () => window.removeEventListener(NEW_CONVERSATION_EVENT, clearDraft);
  }, [binding]);
  useEffect(
    () =>
      window.kodaxSpace?.on('session.partnerExpert.changed', ({ sessionId: id, state }) =>
        binding.receive(id, state),
      ),
    [binding],
  );
  useEffect(() => {
    void binding.refresh();
  }, [binding, extensions.extensions]);

  const context = { surface, projectRoot, sessionId };
  let snapshot: PartnerExpertBindingSnapshot = expertContextMatches(stored.context, context)
    ? stored
    : {
        context,
        state: { expert: null, available: true },
        loading: surface === 'partner' && sessionId !== null,
        changing: false,
        error: null,
      };
  const expert = snapshot.state.expert;
  if (
    expert &&
    !extensions.loading &&
    !extensions.extensions.some((entry) => entry.id === expert.extensionId && entry.enabled)
  ) {
    snapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        available: false,
        unavailableReason: t('extensions.expertPackageUnavailable'),
      },
    };
  }
  return (
    <PartnerExpertContext.Provider value={{ binding, snapshot }}>
      {children}
    </PartnerExpertContext.Provider>
  );
}

/** Legacy Coder-only shells do not need to mount a Partner configuration provider. */
export function usePartnerExpert() {
  return useContext(PartnerExpertContext);
}
