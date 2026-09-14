import { useEffect, useRef } from 'react';
import { projectPartnerConnectorResource } from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { pushToast } from '../../store/toastStore.js';
import { translateMessage } from '../../i18n/I18nProvider.js';
import { usePartnerRemoteRecords } from '../extensions/usePartnerRemoteRecords.js';
import { normalizePartnerBrowserUrl } from './partnerBrowserNavigation.js';
import type { PartnerDetailOpenTarget } from './partnerDetailWorkspace.js';
import { PARTNER_LINK_DETAIL_EVENT, type PartnerLinkDetailRequest } from './partnerLinkEvents.js';

/** Shared by Shell and the production-route fixture, including context validation. */
export function usePartnerLinkDetails(onOpen: (target: PartnerDetailOpenTarget) => void): void {
  const pending = useRef<PartnerLinkDetailRequest | null>(null);
  const { records, loaded, error } = usePartnerRemoteRecords();
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const surface = useSurfaceStore((state) => state.currentSurface);
  useEffect(() => {
    const open = (detail: PartnerLinkDetailRequest): void => {
      pending.current = null;
      const current = useAppStore.getState();
      if (
        !detail ||
        typeof detail.href !== 'string' ||
        !detail.context ||
        surface !== 'partner' ||
        useSurfaceStore.getState().currentSurface !== 'partner' ||
        current.currentProjectPath !== projectRoot ||
        current.currentSessionId !== sessionId ||
        detail.context.projectRoot !== projectRoot ||
        detail.context.sessionId !== sessionId
      )
        return;
      const resource = projectPartnerConnectorResource(detail.href);
      // Wait only for local source metadata. A newer click or context change supersedes this intent.
      if (resource && !loaded && !error) {
        pending.current = detail;
        return;
      }
      const matches = records.sources.filter((candidate) => {
        if (candidate.projectRoot !== projectRoot || candidate.sessionId !== sessionId)
          return false;
        if (candidate.url === detail.href) return true;
        const saved = projectPartnerConnectorResource(candidate.url);
        return (
          resource &&
          saved &&
          resource.adapter === saved.adapter &&
          resource.resourceKey === saved.resourceKey
        );
      });
      if (
        !/^https?:\/\//i.test(detail.href) &&
        new Set(matches.map((source) => source.connectionId)).size > 1
      ) {
        pushToast(translateMessage('connectors.ambiguousSource'), 'info');
        return;
      }
      const source = matches[0];
      if (source) {
        onOpen({ kind: 'remoteSource', sourceId: source.id, title: source.title });
        return;
      }
      // Internal provider references can only open a recorded source in this conversation.
      if (!/^https?:\/\//i.test(detail.href)) {
        if (resource)
          pushToast(
            translateMessage(
              error
                ? 'connectors.unavailable'
                : loaded
                  ? 'connectors.sourceNotInSession'
                  : 'common.loading',
            ),
            'info',
          );
        return;
      }
      const normalized = normalizePartnerBrowserUrl(detail.href);
      if (normalized.ok)
        onOpen({
          kind: 'browser',
          initialUrl: normalized.url,
          resourceKey: `web-${normalized.url}`,
        });
    };
    const listener = (event: Event): void =>
      open((event as CustomEvent<PartnerLinkDetailRequest>).detail);
    window.addEventListener(PARTNER_LINK_DETAIL_EVENT, listener);
    if (pending.current) open(pending.current);
    return () => window.removeEventListener(PARTNER_LINK_DETAIL_EVENT, listener);
  }, [error, loaded, onOpen, projectRoot, records.sources, sessionId, surface]);
}
