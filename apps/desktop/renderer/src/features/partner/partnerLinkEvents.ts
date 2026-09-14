import { projectPartnerConnectorResource } from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { openExternalUrl } from '../../lib/openPath.js';
import { normalizePartnerBrowserUrl } from './partnerBrowserNavigation.js';
import type { PartnerDetailWorkspaceContext } from './partnerDetailWorkspace.js';

export const PARTNER_LINK_DETAIL_EVENT = 'kodax-space.partner-link-detail';
export interface PartnerLinkDetailRequest {
  readonly context: PartnerDetailWorkspaceContext;
  readonly href: string;
}

/** A conversation link opens a view; it never changes scope or reads the provider. */
export async function openConversationLink(href: string): Promise<void> {
  const isHttp = /^https?:\/\//i.test(href);
  const resource = projectPartnerConnectorResource(href);
  if (!isHttp && !resource) return;
  if (isHttp && !normalizePartnerBrowserUrl(href).ok) return;
  if (useSurfaceStore.getState().currentSurface !== 'partner') {
    if (isHttp) await openExternalUrl(href);
    return;
  }
  const state = useAppStore.getState();
  window.dispatchEvent(
    new CustomEvent<PartnerLinkDetailRequest>(PARTNER_LINK_DETAIL_EVENT, {
      detail: {
        context: { projectRoot: state.currentProjectPath, sessionId: state.currentSessionId },
        href,
      },
    }),
  );
}
