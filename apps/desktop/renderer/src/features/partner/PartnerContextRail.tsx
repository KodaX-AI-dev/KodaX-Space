import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  ArtifactRefT,
  PartnerDeliveryRefT,
  PartnerProjectSourceT,
  PartnerRemoteRecordsT,
} from '@kodax-space/space-ipc-schema';
import { AlertCircle, Bot, FileOutput, FolderOpen, Plus } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import { openPartnerDeliveryInViewer, previewFileInViewer } from '../../lib/openPath.js';
import {
  mergeTransientArtifactSnapshots,
  type TransientArtifactSnapshot,
} from '../artifact/transientArtifact.js';
import {
  EMPTY_PARTNER_CONTEXT_SUMMARY,
  projectPartnerContextSummary,
  type PartnerContextSummary,
} from './partnerContextSummary.js';
import {
  partnerDetailTargetForDelivery,
  type PartnerDetailOpenTarget,
} from './partnerDetailWorkspace.js';
import {
  PARTNER_SOURCES_CHANGED_EVENT,
  readPartnerPendingSources,
  type PartnerWorkbenchPendingSourceRef,
} from './partnerWorkbench.js';
import { usePartnerTaskCollaboration } from './usePartnerTaskCollaboration.js';
import {
  collectPartnerRemoteResultEntries,
  partnerDetailTargetForRemoteResult,
} from '../extensions/partnerRemoteResults.js';

interface PartnerContextRailProps {
  readonly onOpenDetail: (target: PartnerDetailOpenTarget) => void;
  readonly onAddMaterial: () => void;
}

type TaskCardItemAction =
  | { readonly kind: 'detail'; readonly target: PartnerDetailOpenTarget }
  | { readonly kind: 'preview-file'; readonly path: string }
  | { readonly kind: 'delivery'; readonly delivery: PartnerDeliveryRefT };

interface TaskCardItem {
  readonly id: string;
  readonly label: string;
  readonly action: TaskCardItemAction;
}

export interface ContextLoadResult {
  readonly scopeKey: string;
  readonly summary: PartnerContextSummary;
  readonly materials: readonly TaskCardItem[];
  readonly artifacts: readonly TaskCardItem[];
  readonly reviews: readonly TaskCardItem[];
  readonly failed: boolean;
}

interface ContextLoadInput {
  readonly bridge: KodaXSpaceBridge;
  readonly projectRoot: string;
  readonly sessionId: string | null;
  readonly transientArtifacts: readonly TransientArtifactSnapshot[];
  readonly pendingSources: readonly PartnerWorkbenchPendingSourceRef[];
}

function detailItem(id: string, label: string, target: PartnerDetailOpenTarget): TaskCardItem {
  return { id, label, action: { kind: 'detail', target } };
}

function partnerContextScopeKey(projectRoot: string | null, sessionId: string | null): string {
  return JSON.stringify([projectRoot, sessionId]);
}

export async function loadPartnerContext(input: ContextLoadInput): Promise<ContextLoadResult> {
  const sourceRequest = input.bridge.invoke(
    'partner.sources.catalog',
    input.sessionId
      ? { projectRoot: input.projectRoot, sessionId: input.sessionId }
      : { projectRoot: input.projectRoot },
  );
  const artifactRequest = input.sessionId
    ? input.bridge.invoke('artifact.list', { sessionId: input.sessionId })
    : Promise.resolve(null);
  const deliveryRequest = input.sessionId
    ? input.bridge.invoke('partner.deliveries.list', {
        sessionId: input.sessionId,
        projectRoot: input.projectRoot,
      })
    : Promise.resolve(null);
  const remoteRequest = input.sessionId
    ? input.bridge.invoke('partner.connectors.records', {
        sessionId: input.sessionId,
        projectRoot: input.projectRoot,
      })
    : Promise.resolve(null);
  const [sources, artifacts, deliveries, remote] = await Promise.allSettled([
    sourceRequest,
    artifactRequest,
    deliveryRequest,
    remoteRequest,
  ]);
  const sourceRecords =
    sources.status === 'fulfilled' && sources.value.ok
      ? sources.value.data.sources.filter((source) => source.selected)
      : [];
  const artifactRecords =
    artifacts.status === 'fulfilled' && artifacts.value?.ok ? artifacts.value.data.artifacts : [];
  const deliveryRecords =
    deliveries.status === 'fulfilled' && deliveries.value?.ok
      ? deliveries.value.data.deliveries
      : [];
  const remoteRecords =
    remote.status === 'fulfilled' && remote.value?.ok ? remote.value.data : null;
  const materials = materialItems(
    sourceRecords,
    input.pendingSources,
    remoteRecords?.sources ?? [],
  );
  const localArtifacts = localArtifactItems(artifactRecords, input.transientArtifacts);
  const artifactsList = artifactItems(localArtifacts, deliveryRecords, remoteRecords);
  const remoteArtifactLabels = artifactsList
    .filter(
      (item) =>
        item.id.startsWith('remote-') ||
        item.id.startsWith('base-task:') ||
        item.id.startsWith('document-task:'),
    )
    .map((item) => item.label);
  return {
    scopeKey: partnerContextScopeKey(input.projectRoot, input.sessionId),
    summary: projectPartnerContextSummary({
      sourceLabels: sourceRecords.map((source) => source.label),
      pendingSourcePaths: input.pendingSources.map((source) => source.label ?? source.path),
      artifactLabels: localArtifacts.map((artifact) => artifact.label),
      transientArtifactLabels: [],
      deliveryPaths: deliveryRecords.map((delivery) => delivery.title),
      remoteSourceLabels: remoteRecords?.sources.map((item) => item.title) ?? [],
      remoteReceiptLabels: remoteArtifactLabels,
      expertLabels: [],
      skillLabels: [],
    }),
    materials,
    artifacts: artifactsList,
    reviews:
      remoteRecords?.proposals
        .filter((proposal) => proposal.operation === 'append' && proposal.status === 'pending')
        .map((proposal) =>
          detailItem(`remote-proposal:${proposal.id}`, proposal.title, {
            kind: 'remoteProposal',
            proposalId: proposal.id,
            title: proposal.title,
          }),
        ) ?? [],
    failed: contextLoadFailed(input.sessionId, sources, artifacts, deliveries, remote),
  };
}

function materialItems(
  sources: readonly PartnerProjectSourceT[],
  pending: readonly PartnerWorkbenchPendingSourceRef[],
  remote: PartnerRemoteRecordsT['sources'],
): readonly TaskCardItem[] {
  return [
    ...sources.map((source) =>
      source.targetKind === 'file'
        ? {
            id: `source:${source.id}`,
            label: source.label,
            action: { kind: 'preview-file' as const, path: source.path },
          }
        : detailItem(`source:${source.id}`, source.label, { kind: 'materials' }),
    ),
    ...pending.map((source, index) =>
      source.targetKind !== 'dir'
        ? {
            id: `pending-source:${index}:${source.path}`,
            label: source.label ?? source.path,
            action: { kind: 'preview-file' as const, path: source.path },
          }
        : detailItem(`pending-source:${index}:${source.path}`, source.label ?? source.path, {
            kind: 'materials',
          }),
    ),
    ...remote.map((source) =>
      detailItem(`remote-source:${source.id}`, source.title, {
        kind: 'remoteSource',
        sourceId: source.id,
        title: source.title,
      }),
    ),
  ];
}

function localArtifactItems(
  artifacts: readonly ArtifactRefT[],
  transient: readonly TransientArtifactSnapshot[],
): readonly TaskCardItem[] {
  const transientById = new Map<string, TransientArtifactSnapshot>();
  for (const snapshot of transient) {
    const existing = transientById.get(snapshot.id);
    transientById.set(
      snapshot.id,
      existing ? mergeTransientArtifactSnapshots(existing, snapshot) : snapshot,
    );
  }
  const persisted = artifacts.map((artifact) => {
    const snapshot = transientById.get(artifact.id);
    transientById.delete(artifact.id);
    return detailItem(`artifact:${artifact.id}`, artifact.title, {
      kind: 'artifact',
      artifactId: artifact.id,
      title: artifact.title,
      ...(snapshot ? { snapshot } : {}),
    });
  });
  return [
    ...persisted,
    ...[...transientById.values()].map((snapshot) =>
      detailItem(`transient-artifact:${snapshot.id}`, snapshot.title, {
        kind: 'artifact',
        artifactId: snapshot.id,
        title: snapshot.title,
        snapshot,
      }),
    ),
  ];
}

function artifactItems(
  localArtifacts: readonly TaskCardItem[],
  deliveries: readonly PartnerDeliveryRefT[],
  remoteRecords: PartnerRemoteRecordsT | null,
): readonly TaskCardItem[] {
  return [
    ...localArtifacts,
    ...deliveries.map((delivery) => {
      const target = partnerDetailTargetForDelivery(delivery);
      return target
        ? detailItem(`delivery:${delivery.id}`, delivery.title, target)
        : {
            id: `delivery:${delivery.id}`,
            label: delivery.title,
            action: { kind: 'delivery' as const, delivery },
          };
    }),
    ...(remoteRecords
      ? collectPartnerRemoteResultEntries(remoteRecords).map((entry) =>
          detailItem(
            `remote-result:${entry.kind}:${entry.id}`,
            entry.title,
            partnerDetailTargetForRemoteResult(entry),
          ),
        )
      : []),
    ...(remoteRecords?.baseTasks.flatMap((task) =>
      task.status === 'succeeded'
        ? [detailItem(`base-task:${task.id}`, task.baseName, { kind: 'baseTask', task })]
        : [],
    ) ?? []),
  ];
}

function contextLoadFailed(
  sessionId: string | null,
  sources: PromiseSettledResult<{ readonly ok: boolean }>,
  ...sessionRequests: readonly PromiseSettledResult<unknown>[]
): boolean {
  const sourceFailed =
    sources.status === 'rejected' || (sources.status === 'fulfilled' && !sources.value.ok);
  if (sourceFailed || sessionId === null) return sourceFailed;
  return sessionRequests.some(
    (request) =>
      request.status === 'rejected' ||
      (request.status === 'fulfilled' &&
        (!request.value ||
          typeof request.value !== 'object' ||
          !('ok' in request.value) ||
          request.value.ok !== true)),
  );
}

function TaskCard({
  testId,
  title,
  emptyLabel,
  count,
  items,
  icon,
  onOpenItem,
  footer,
}: {
  readonly testId: string;
  readonly title: string;
  readonly emptyLabel: string;
  readonly count: number;
  readonly items: readonly TaskCardItem[];
  readonly icon: ReactNode;
  readonly onOpenItem: (item: TaskCardItem) => void;
  readonly footer?: ReactNode;
}): JSX.Element {
  return (
    <section
      className="overflow-hidden rounded-xl border border-border-default bg-surface-2 shadow-sm"
      data-testid={`${testId}-card`}
    >
      <div
        className="flex w-full items-center gap-2 px-3 py-3 text-left"
        aria-label={`${title}: ${count}`}
        data-testid={testId}
      >
        <span className="text-fg-muted" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg-primary">{title}</span>
        <span className="min-w-5 rounded-full bg-surface-3 px-1.5 py-0.5 text-center text-[10px] tabular-nums text-fg-muted">
          {count}
        </span>
      </div>
      <div className="border-t border-border-default/70 px-2 py-2">
        {items.length > 0 ? (
          <div className="space-y-0.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenItem(item)}
                className="flex min-h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-fg-muted hover:bg-hover-bg hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
                title={item.label}
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-2 py-1 text-[11px] leading-4 text-fg-muted">{emptyLabel}</p>
        )}
        {footer}
      </div>
    </section>
  );
}

const EMPTY_TRANSIENT_ARTIFACTS: readonly TransientArtifactSnapshot[] = [];
const EMPTY_LOAD_RESULT: ContextLoadResult = {
  scopeKey: partnerContextScopeKey(null, null),
  summary: EMPTY_PARTNER_CONTEXT_SUMMARY,
  materials: [],
  artifacts: [],
  reviews: [],
  failed: false,
};

export function partnerContextResultForScope(
  result: ContextLoadResult,
  projectRoot: string | null,
  sessionId: string | null,
): ContextLoadResult {
  return result.scopeKey === partnerContextScopeKey(projectRoot, sessionId)
    ? result
    : EMPTY_LOAD_RESULT;
}

export function PartnerContextRail({
  onOpenDetail,
  onAddMaterial,
}: PartnerContextRailProps): JSX.Element {
  const { t } = useI18n();
  const currentProjectPath = useAppStore((state) => state.currentProjectPath);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const transientArtifacts = useAppStore((state) =>
    currentSessionId
      ? (state.transientArtifactsBySession[currentSessionId] ?? EMPTY_TRANSIENT_ARTIFACTS)
      : EMPTY_TRANSIENT_ARTIFACTS,
  );
  const collaboration = usePartnerTaskCollaboration();
  const [loaded, setLoaded] = useState<ContextLoadResult>(EMPTY_LOAD_RESULT);
  const scopedLoaded = partnerContextResultForScope(loaded, currentProjectPath, currentSessionId);
  const [loading, setLoading] = useState(false);
  const requestRevisionRef = useRef(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    const bridge = window.kodaxSpace;
    const revision = ++requestRevisionRef.current;
    if (!bridge || !currentProjectPath) {
      setLoaded(EMPTY_LOAD_RESULT);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await loadPartnerContext({
        bridge,
        projectRoot: currentProjectPath,
        sessionId: currentSessionId,
        transientArtifacts,
        pendingSources: readPartnerPendingSources(currentProjectPath),
      });
      if (mountedRef.current && revision === requestRevisionRef.current) setLoaded(result);
    } catch {
      if (mountedRef.current && revision === requestRevisionRef.current)
        setLoaded((current) => ({ ...current, failed: true }));
    } finally {
      if (mountedRef.current && revision === requestRevisionRef.current) setLoading(false);
    }
  }, [currentProjectPath, currentSessionId, transientArtifacts]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const onSourcesChanged = (): void => void refresh();
    window.addEventListener(PARTNER_SOURCES_CHANGED_EVENT, onSourcesChanged);
    return () => window.removeEventListener(PARTNER_SOURCES_CHANGED_EVENT, onSourcesChanged);
  }, [refresh]);
  useEffect(
    () => subscribeToContextChanges(currentProjectPath, currentSessionId, refresh),
    [currentProjectPath, currentSessionId, refresh],
  );

  const collaborationItems = useMemo<readonly TaskCardItem[]>(
    () => [
      ...scopedLoaded.reviews,
      ...(collaboration.expert
        ? [
            detailItem(
              `expert:${collaboration.expert.extensionId}:${collaboration.expert.expert.id}`,
              collaboration.expert.expert.name,
              { kind: 'expert', expert: collaboration.expert },
            ),
          ]
        : []),
      ...collaboration.skills.map((skill) =>
        detailItem(`skill:${skill.name}`, skill.name, { kind: 'skill', skill }),
      ),
    ],
    [collaboration.expert, collaboration.skills, scopedLoaded.reviews],
  );
  const summary: PartnerContextSummary = {
    ...scopedLoaded.summary,
    collaboration: {
      count: collaborationItems.length,
      labels: collaborationItems.slice(0, 2).map((item) => item.label),
    },
  };
  const openItem = (item: TaskCardItem): void => {
    if (item.action.kind === 'detail') return onOpenDetail(item.action.target);
    if (item.action.kind === 'delivery') {
      void openPartnerDeliveryInViewer(item.action.delivery);
      return;
    }
    if (currentProjectPath)
      void previewFileInViewer(item.action.path, {
        projectRoot: currentProjectPath,
        notifyOnError: true,
      });
  };

  return (
    <aside
      className="flex h-full min-h-0 w-[300px] flex-shrink-0 flex-col bg-surface px-4 py-3"
      aria-label={t('partner.taskCards.label')}
      aria-busy={loading || collaboration.loading}
      data-testid="partner-context-rail"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <TaskCard
          testId="partner-task-materials"
          title={t('partner.taskCards.materials')}
          emptyLabel={t('partner.taskCards.materialsEmpty')}
          count={summary.materials.count}
          items={scopedLoaded.materials}
          icon={<FolderOpen className="h-4 w-4" strokeWidth={1.75} />}
          onOpenItem={openItem}
          footer={
            <button
              type="button"
              onClick={onAddMaterial}
              className="mt-2 inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border-default bg-surface px-2 text-xs text-fg-secondary hover:bg-hover-bg hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
              data-testid="partner-context-add-material"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              {t('partner.sources.add')}
            </button>
          }
        />
        <TaskCard
          testId="partner-task-collaboration"
          title={t('partner.taskCards.collaboration')}
          emptyLabel={t('partner.taskCards.collaborationEmpty')}
          count={summary.collaboration.count}
          items={collaborationItems}
          icon={<Bot className="h-4 w-4" strokeWidth={1.75} />}
          onOpenItem={openItem}
        />
        <TaskCard
          testId="partner-task-artifacts"
          title={t('partner.taskCards.artifacts')}
          emptyLabel={t('partner.taskCards.artifactsEmpty')}
          count={summary.artifacts.count}
          items={scopedLoaded.artifacts}
          icon={<FileOutput className="h-4 w-4" strokeWidth={1.75} />}
          onOpenItem={openItem}
        />
      </div>
      {scopedLoaded.failed && (
        <div className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-danger" role="status">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {t('common.unknownError')}
        </div>
      )}
    </aside>
  );
}

function subscribeToContextChanges(
  projectRoot: string | null,
  sessionId: string | null,
  refresh: () => Promise<void>,
): (() => void) | void {
  const bridge = window.kodaxSpace;
  if (!bridge || !sessionId || !projectRoot) return;
  const sameSession = (candidate?: string): void => {
    if (!candidate || candidate === sessionId) void refresh();
  };
  const offArtifacts = bridge.on('artifact.changed', (payload) => sameSession(payload.sessionId));
  const offDeliveries = bridge.on('partner.deliveries.changed', (payload) =>
    sameSession(payload.sessionId),
  );
  const offRemote = bridge.on('partner.connectors.changed', (payload) => {
    if (
      (!payload.sessionId || payload.sessionId === sessionId) &&
      (!payload.projectRoot || payload.projectRoot === projectRoot)
    )
      void refresh();
  });
  return () => {
    offArtifacts();
    offDeliveries();
    offRemote();
  };
}
