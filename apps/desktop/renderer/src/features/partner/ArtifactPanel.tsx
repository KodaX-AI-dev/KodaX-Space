import { useEffect, useState } from 'react';
import { ChevronRight, FileOutput } from 'lucide-react';
import type { PartnerDeliveryRefT } from '@kodax-space/space-ipc-schema';
import type { TransientArtifactSnapshot } from '../artifact/transientArtifact.js';
import { ArtifactsView } from '../artifact/ArtifactsView.js';
import { PartnerRemoteRecords } from '../extensions/PartnerRemoteRecords.js';
import { useAppStore } from '../../store/appStore.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import { openPartnerDeliveryInViewer } from '../../lib/openPath.js';
import {
  partnerDetailTargetForDelivery,
  type PartnerDetailOpenTarget,
} from './partnerDetailWorkspace.js';

interface ArtifactPanelProps {
  readonly focusedArtifact?: {
    readonly id: string;
    readonly snapshot?: TransientArtifactSnapshot;
  };
  readonly includeRemoteOutputs?: boolean;
  readonly onOpenDetail?: (target: PartnerDetailOpenTarget) => void;
}

interface PartnerOutputDeliveryState {
  readonly scopeKey: string;
  readonly deliveries: readonly PartnerDeliveryRefT[];
  readonly error: string | null;
}

function outputScopeKey(projectRoot: string | null, sessionId: string | null): string {
  return JSON.stringify([projectRoot, sessionId]);
}

function usePartnerOutputDeliveries(): PartnerOutputDeliveryState {
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const scopeKey = outputScopeKey(projectRoot, sessionId);
  const [state, setState] = useState<PartnerOutputDeliveryState>({
    scopeKey: outputScopeKey(null, null),
    deliveries: [],
    error: null,
  });

  useEffect(() => {
    const bridge = window.kodaxSpace;
    if (!bridge || !projectRoot || !sessionId) {
      setState({ scopeKey, deliveries: [], error: null });
      return;
    }
    let active = true;
    let revision = 0;
    const load = async (): Promise<void> => {
      const currentRevision = ++revision;
      try {
        const result = await bridge.invoke('partner.deliveries.list', { projectRoot, sessionId });
        if (!active || currentRevision !== revision) return;
        setState(
          result.ok
            ? { scopeKey, deliveries: result.data.deliveries, error: null }
            : { scopeKey, deliveries: [], error: result.error.message },
        );
      } catch (reason) {
        if (!active || currentRevision !== revision) return;
        setState({
          scopeKey,
          deliveries: [],
          error: reason instanceof Error ? reason.message : String(reason),
        });
      }
    };
    setState({ scopeKey, deliveries: [], error: null });
    void load();
    const unsubscribe = bridge.on('partner.deliveries.changed', (event) => {
      if (event.sessionId === sessionId) void load();
    });
    return () => {
      active = false;
      revision += 1;
      unsubscribe();
    };
  }, [projectRoot, scopeKey, sessionId]);

  return state.scopeKey === scopeKey ? state : { scopeKey, deliveries: [], error: null };
}

export function openPartnerOutputDelivery(
  delivery: PartnerDeliveryRefT,
  onOpenDetail?: (target: PartnerDetailOpenTarget) => void,
): void {
  const target = partnerDetailTargetForDelivery(delivery);
  if (target && onOpenDetail) {
    onOpenDetail(target);
    return;
  }
  void openPartnerDeliveryInViewer(delivery);
}

export function PartnerOutputDeliveryList({
  deliveries,
  onOpenDetail,
}: {
  readonly deliveries: readonly PartnerDeliveryRefT[];
  readonly onOpenDetail?: (target: PartnerDetailOpenTarget) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  if (deliveries.length === 0) return null;
  return (
    <section
      className="border-b border-border-default p-3 text-xs"
      data-testid="partner-output-deliveries"
    >
      <h3 className="mb-2 font-medium">{t('partner.deliveries.tab.deliveries')}</h3>
      <div className="space-y-1">
        {deliveries.map((delivery) => (
          <button
            key={delivery.id}
            type="button"
            onClick={() => openPartnerOutputDelivery(delivery, onOpenDetail)}
            className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-fg-muted hover:bg-hover-bg hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
            title={delivery.relativePath}
            data-testid="partner-output-delivery"
          >
            <FileOutput className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{delivery.title}</span>
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
          </button>
        ))}
      </div>
    </section>
  );
}

function PartnerOutputIndex({
  onOpenDetail,
}: {
  readonly onOpenDetail?: (target: PartnerDetailOpenTarget) => void;
}): JSX.Element {
  const { deliveries, error } = usePartnerOutputDeliveries();
  return (
    <div className="max-h-[45%] shrink-0 overflow-y-auto">
      <PartnerRemoteRecords kind="results" onOpenDetail={onOpenDetail} />
      <PartnerOutputDeliveryList deliveries={deliveries} onOpenDetail={onOpenDetail} />
      {error && (
        <p className="border-b border-border-default p-3 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The Partner output surface has one job: render created resources.
 *
 * Review proposals and delivery history keep their host contracts, but they are
 * no longer permanent destinations inside the office-facing detail workspace.
 * Individual files and artifacts open as their own typed detail tabs.
 */
export function ArtifactPanel({
  focusedArtifact,
  includeRemoteOutputs = true,
  onOpenDetail,
}: ArtifactPanelProps): JSX.Element {
  return (
    <aside
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface"
      data-testid="partner-artifact-panel"
    >
      {includeRemoteOutputs && <PartnerOutputIndex onOpenDetail={onOpenDetail} />}
      <div className="min-h-0 flex-1">
        <ArtifactsView
          focusedId={focusedArtifact?.id ?? null}
          focusedSnapshot={focusedArtifact?.snapshot ?? null}
        />
      </div>
    </aside>
  );
}
