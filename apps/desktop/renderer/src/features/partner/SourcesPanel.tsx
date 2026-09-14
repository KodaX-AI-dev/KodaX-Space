// SourcesPanel — Partner three-column left rail: sources.
//
// MVP: attach workspace files to the current Partner session. The agent sees
// source ids in the Partner prompt overlay and can read them through the
// readonly partner_source_read tool.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PartnerKnowledgeScopeT, PartnerProjectSourceT } from '@kodax-space/space-ipc-schema';
import {
  Ellipsis,
  FileText,
  FolderOpen,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import { FileNameText } from '../../components/FileNameText.js';
import { previewFileInViewer } from '../../lib/openPath.js';
import { requestConfirm } from '../../store/confirmStore.js';
import { FileTree } from '../code/FileTree.js';
import { KnowledgeBasePanel } from './KnowledgeBasePanel.js';
import { PartnerRemoteRecords } from '../extensions/PartnerRemoteRecords.js';
import { activatePartnerProjectFile } from './partnerProjectFileActivation.js';
import type { PartnerDetailOpenTarget } from './partnerDetailWorkspace.js';
import {
  PARTNER_SOURCES_CHANGED_EVENT,
  readPartnerPendingSources,
  removePartnerPendingSource,
  stagePartnerPendingSource,
  type PartnerWorkbenchPendingSourceRef,
} from './partnerWorkbench.js';

function notifySourcesChanged(): void {
  window.dispatchEvent(new Event(PARTNER_SOURCES_CHANGED_EVENT));
}

export function handleSourcePickerOpenRequest(
  request: number,
  projectPath: string | null,
  openPicker: () => void,
  onConsumed?: () => void,
): boolean {
  if (request === 0 || !projectPath) return false;
  openPicker();
  onConsumed?.();
  return true;
}

interface SourcesPanelProps {
  readonly onOpenDetail?: (target: PartnerDetailOpenTarget) => void;
  readonly openPickerRequest?: number;
  readonly onOpenPickerRequestConsumed?: () => void;
  readonly variant?: 'rail' | 'detail';
}

export function SourcesPanel({
  onOpenDetail,
  openPickerRequest = 0,
  onOpenPickerRequestConsumed,
  variant = 'rail',
}: SourcesPanelProps): JSX.Element {
  const { t } = useI18n();
  const sourceActionsRef = useRef<HTMLDivElement | null>(null);
  const currentProjectPath = useAppStore((s) => s.currentProjectPath);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const lastSessionEventKind = useAppStore((state) => {
    if (!state.currentSessionId) return undefined;
    return state.eventsBySession[state.currentSessionId]?.at(-1)?.kind;
  });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedTargetKind, setSelectedTargetKind] = useState<'file' | 'dir'>('file');
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [sourceActionsId, setSourceActionsId] = useState<string | null>(null);
  const [sources, setSources] = useState<readonly PartnerProjectSourceT[]>([]);
  const [activeSourceIds, setActiveSourceIds] = useState<ReadonlySet<string>>(new Set());
  const [usedSourceIds, setUsedSourceIds] = useState<ReadonlySet<string>>(new Set());
  const [catalogTruncated, setCatalogTruncated] = useState(false);
  const [scope, setScope] = useState<PartnerKnowledgeScopeT>('project-grounded');
  const [pendingSources, setPendingSources] = useState<readonly PartnerWorkbenchPendingSourceRef[]>(
    () => readPartnerPendingSources(useAppStore.getState().currentProjectPath),
  );
  const [loadingSources, setLoadingSources] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourcePickerCloseRef = useRef<HTMLButtonElement | null>(null);
  const sourcePickerReturnFocusRef = useRef<HTMLElement | null>(null);
  const folderName = currentProjectPath
    ? (currentProjectPath.split(/[\\/]/).filter(Boolean).pop() ?? currentProjectPath)
    : null;

  const openSourcePicker = useCallback((): void => {
    sourcePickerReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedPath(null);
    setSelectedTargetKind('file');
    setSourcePickerOpen(true);
  }, []);

  const closeSourcePicker = useCallback((): void => {
    setSourcePickerOpen(false);
    setSelectedPath(null);
    setSelectedTargetKind('file');
    const returnTarget = sourcePickerReturnFocusRef.current;
    requestAnimationFrame(() => returnTarget?.focus({ preventScroll: true }));
  }, []);

  const loadSources = useCallback((): (() => void) | void => {
    const bridge = window.kodaxSpace;
    if (!bridge || !currentSessionId || !currentProjectPath) {
      setSources([]);
      setLoadingSources(false);
      return;
    }
    let alive = true;
    setLoadingSources(true);
    setError(null);
    void Promise.all([
      bridge.invoke('partner.sources.catalog', {
        sessionId: currentSessionId,
        projectRoot: currentProjectPath,
      }),
      bridge.invoke('partner.materials.catalog', {
        sessionId: currentSessionId,
        projectRoot: currentProjectPath,
      }),
    ])
      .then(([result, materials]) => {
        if (!alive) return;
        if (result.ok) {
          setSources(result.data.sources);
          setCatalogTruncated(result.data.truncated);
        } else {
          setSources([]);
          setCatalogTruncated(false);
          setError(result.error.message);
        }
        if (materials.ok) {
          setActiveSourceIds(
            new Set(
              materials.data.relations.flatMap((relation) =>
                relation.lifecycle === 'active' && relation.target.kind === 'project-source'
                  ? [relation.target.sourceId]
                  : [],
              ),
            ),
          );
          if (materials.data.scope) setScope(materials.data.scope);
          setUsedSourceIds(new Set(materials.data.latestTrace?.usedSourceIds ?? []));
        } else {
          setError(materials.error.message);
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setSources([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoadingSources(false);
      });
    return () => {
      alive = false;
    };
  }, [currentProjectPath, currentSessionId]);

  const loadPendingSources = useCallback((): void => {
    setPendingSources(readPartnerPendingSources(currentProjectPath));
  }, [currentProjectPath]);

  useEffect(() => {
    setSelectedPath(null);
    setSelectedTargetKind('file');
    setSourcePickerOpen(false);
    setSourceActionsId(null);
  }, [currentProjectPath, currentSessionId]);

  useEffect(() => {
    handleSourcePickerOpenRequest(
      openPickerRequest,
      currentProjectPath,
      openSourcePicker,
      onOpenPickerRequestConsumed,
    );
  }, [currentProjectPath, onOpenPickerRequestConsumed, openPickerRequest, openSourcePicker]);

  useEffect(() => {
    if (!sourcePickerOpen) return;
    const frame = requestAnimationFrame(() => sourcePickerCloseRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [sourcePickerOpen]);

  useEffect(() => loadSources(), [loadSources]);

  useEffect(() => {
    if (
      lastSessionEventKind === 'iteration_end' ||
      lastSessionEventKind === 'session_complete' ||
      lastSessionEventKind === 'session_error'
    ) {
      return loadSources();
    }
  }, [lastSessionEventKind, loadSources]);

  useEffect(() => loadPendingSources(), [loadPendingSources]);

  useEffect(() => {
    const onSourcesChanged = (): void => {
      loadPendingSources();
    };
    window.addEventListener(PARTNER_SOURCES_CHANGED_EVENT, onSourcesChanged);
    return () => window.removeEventListener(PARTNER_SOURCES_CHANGED_EVENT, onSourcesChanged);
  }, [loadPendingSources]);

  useEffect(() => {
    if (sourceActionsId === null) return;
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!sourceActionsRef.current?.contains(event.target as Node)) setSourceActionsId(null);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSourceActionsId(null);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [sourceActionsId]);

  async function addSelectedSource(): Promise<void> {
    const bridge = window.kodaxSpace;
    if (!currentProjectPath || !selectedPath) return;
    if (!currentSessionId) {
      setPendingSources(
        stagePartnerPendingSource(currentProjectPath, {
          path: selectedPath,
          targetKind: selectedTargetKind,
        }),
      );
      notifySourcesChanged();
      closeSourcePicker();
      return;
    }
    if (!bridge) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.invoke('partner.sources.add', {
        sessionId: currentSessionId,
        kind: 'workspace_path',
        projectRoot: currentProjectPath,
        path: selectedPath,
        targetKind: selectedTargetKind,
      });
      if (result.ok) {
        void loadSources();
        notifySourcesChanged();
        closeSourcePicker();
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function selectSource(sourceId: string, selected: boolean): Promise<void> {
    const bridge = window.kodaxSpace;
    if (!currentProjectPath) return;
    if (!currentSessionId) {
      setPendingSources(removePartnerPendingSource(currentProjectPath, sourceId));
      notifySourcesChanged();
      return;
    }
    if (!bridge) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.invoke('partner.sources.select', {
        sessionId: currentSessionId,
        projectRoot: currentProjectPath,
        sourceId,
        selected,
      });
      if (result.ok) {
        setSources((prev) =>
          prev.map((source) =>
            source.id === sourceId ? { ...source, selected: result.data.source.selected } : source,
          ),
        );
        notifySourcesChanged();
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function refreshSource(sourceId: string): Promise<void> {
    const bridge = window.kodaxSpace;
    if (!bridge || !currentProjectPath) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.invoke('partner.sources.refresh', {
        projectRoot: currentProjectPath,
        sourceId,
      });
      if (result.ok) {
        setSources((prev) =>
          prev.map((source) =>
            source.id === sourceId ? { ...result.data.source, selected: source.selected } : source,
          ),
        );
      } else setError(result.error.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeProjectMaterial(sourceId: string): Promise<void> {
    const bridge = window.kodaxSpace;
    if (!bridge || !currentProjectPath || !currentSessionId) return;
    const confirmed = await requestConfirm({
      title: t('partner.sources.removeProject'),
      message: t('partner.sources.removeProjectConfirm'),
      confirmLabel: t('partner.sources.removeProject'),
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const catalog = await bridge.invoke('partner.materials.catalog', {
        projectRoot: currentProjectPath,
        sessionId: currentSessionId,
      });
      if (!catalog.ok) throw new Error(catalog.error.message);
      const relation = catalog.data.relations.find(
        (item) =>
          item.lifecycle === 'active' &&
          item.target.kind === 'project-source' &&
          item.target.sourceId === sourceId,
      );
      if (!relation) return;
      const result = await bridge.invoke('partner.materials.remove', {
        projectRoot: currentProjectPath,
        sessionId: currentSessionId,
        materialRelationId: relation.id,
        confirmed: true,
        reasonCode: 'user_confirmed',
      });
      if (!result.ok) throw new Error(result.error.message);
      setActiveSourceIds((previous) => {
        const next = new Set(previous);
        next.delete(sourceId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function updateScope(nextScope: PartnerKnowledgeScopeT): Promise<void> {
    const bridge = window.kodaxSpace;
    if (!bridge || !currentProjectPath || !currentSessionId) return;
    const previous = scope;
    setScope(nextScope);
    const result = await bridge.invoke('partner.knowledge.scope.set', {
      projectRoot: currentProjectPath,
      sessionId: currentSessionId,
      scope: nextScope,
    });
    if (!result.ok) {
      setScope(previous);
      setError(result.error.message);
    }
  }

  const visibleSources = currentSessionId
    ? sources.map((source) => ({
        id: source.id,
        path: source.path,
        label: source.label,
        selected: source.selected,
        status: source.ingestionStatus,
        available: activeSourceIds.has(source.id),
        used: usedSourceIds.has(source.id),
        pending: false,
        targetKind: source.targetKind,
      }))
    : pendingSources.map((source) => ({
        id: source.path,
        path: source.path,
        label: source.label,
        selected: true,
        status: 'pending' as const,
        available: false,
        used: false,
        pending: true,
        targetKind: source.targetKind ?? 'file',
      }));
  const selectedAlreadyAdded = Boolean(
    selectedPath &&
    visibleSources.some(
      (source) => source.path === selectedPath && (currentSessionId ? source.available : true),
    ),
  );
  const canAdd = Boolean(currentProjectPath && selectedPath && !busy && !selectedAlreadyAdded);
  const statusLabel = (status: PartnerProjectSourceT['ingestionStatus']): string => {
    switch (status) {
      case 'pending':
        return t('partner.sources.status.pending');
      case 'indexing':
        return t('partner.sources.status.indexing');
      case 'ready':
        return t('partner.sources.status.ready');
      case 'stale':
        return t('partner.sources.status.stale');
      case 'failed':
        return t('partner.sources.status.failed');
      case 'unavailable':
        return t('partner.sources.status.unavailable');
    }
  };

  return (
    <aside
      className={
        variant === 'detail'
          ? 'relative w-full h-full min-w-0 flex flex-col bg-surface'
          : 'relative w-60 flex-shrink-0 border-r border-border-default flex flex-col bg-surface'
      }
      data-testid="partner-sources-panel"
    >
      <div className={sourcePickerOpen ? 'hidden' : 'contents'} aria-hidden={sourcePickerOpen}>
        <div className="max-h-[60%] shrink-0 overflow-y-auto">
          <PartnerRemoteRecords kind="sources" onOpenDetail={onOpenDetail} />
        </div>
        <div className="px-3 h-9 flex items-center gap-2 border-b border-border-default flex-shrink-0">
          <FolderOpen className="w-3.5 h-3.5 text-fg-muted" strokeWidth={1.75} aria-hidden />
          <span className="text-[11px] uppercase tracking-wider text-fg-muted">
            {t('partner.sources.title')}
          </span>
        </div>

        <div className="flex-shrink-0 p-2 border-b border-border-default">
          {folderName ? (
            <div
              className="text-xs text-fg-secondary flex items-center gap-1.5 px-1 py-0.5"
              title={currentProjectPath ?? ''}
            >
              <FolderOpen
                className="w-3.5 h-3.5 flex-shrink-0 text-fg-muted"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="truncate">{folderName}</span>
            </div>
          ) : (
            <div className="text-[11px] text-fg-muted px-1 py-2 leading-relaxed">
              {t('partner.sources.openFolderHint')}
            </div>
          )}
        </div>

        <KnowledgeBasePanel />

        <div className="flex-shrink-0 border-b border-border-default">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-fg-muted">
              {t('partner.sources.projectMaterials')}
            </span>
            {loadingSources && (
              <Loader2
                className="w-3.5 h-3.5 text-fg-muted animate-spin"
                strokeWidth={1.75}
                aria-hidden
              />
            )}
          </div>
          <div className="max-h-36 overflow-y-auto pb-1">
            {visibleSources.length > 0 ? (
              visibleSources.map((source) => (
                <div
                  key={source.id}
                  ref={sourceActionsId === source.id ? sourceActionsRef : undefined}
                  className="px-2 py-1 text-xs text-fg-secondary"
                >
                  <div className="flex items-center gap-1.5" title={source.path}>
                    <FileText
                      className="w-3.5 h-3.5 text-fg-muted flex-shrink-0"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    {source.targetKind === 'file' ? (
                      <FileNameText name={source.label ?? source.path} className="flex-1" />
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{source.label ?? source.path}</span>
                    )}
                    <button
                      type="button"
                      className="w-7 h-7 flex-shrink-0 inline-flex items-center justify-center rounded hover:bg-hover-bg text-fg-muted disabled:opacity-40"
                      onClick={() =>
                        void selectSource(source.id, source.pending ? false : !source.selected)
                      }
                      disabled={busy || (!source.pending && !source.available && !source.selected)}
                      title={
                        source.pending
                          ? t('partner.sources.remove')
                          : source.selected
                            ? t('partner.sources.detach')
                            : t('partner.sources.selectForTask')
                      }
                      aria-label={
                        source.pending
                          ? t('partner.sources.remove')
                          : source.selected
                            ? t('partner.sources.detach')
                            : t('partner.sources.selectForTask')
                      }
                    >
                      {source.pending || source.selected ? (
                        <Unlink className="w-3.5 h-3.5" aria-hidden />
                      ) : (
                        <Link2 className="w-3.5 h-3.5" aria-hidden />
                      )}
                    </button>
                    {!source.pending && (
                      <button
                        type="button"
                        className="w-7 h-7 flex-shrink-0 inline-flex items-center justify-center rounded hover:bg-hover-bg text-fg-muted"
                        title={t('partner.sources.actions', { name: source.label ?? source.path })}
                        aria-label={t('partner.sources.actions', {
                          name: source.label ?? source.path,
                        })}
                        aria-haspopup="menu"
                        aria-expanded={sourceActionsId === source.id}
                        onClick={() =>
                          setSourceActionsId((current) =>
                            current === source.id ? null : source.id,
                          )
                        }
                      >
                        <Ellipsis className="w-4 h-4" strokeWidth={1.75} aria-hidden />
                      </button>
                    )}
                  </div>
                  <div className="ml-5 flex flex-wrap gap-1 text-[10px]">
                    <span
                      className={
                        source.status === 'failed' || source.status === 'unavailable'
                          ? 'text-danger'
                          : 'text-fg-faint'
                      }
                    >
                      {source.pending || source.available
                        ? statusLabel(source.status)
                        : t('partner.sources.removed')}
                    </span>
                    {source.available && (
                      <span className="text-fg-faint">{t('partner.sources.available')}</span>
                    )}
                    {source.selected && (
                      <span className="text-accent-ink">{t('partner.sources.selected')}</span>
                    )}
                    {source.used && <span className="text-ok">{t('partner.sources.used')}</span>}
                  </div>
                  {!source.pending && sourceActionsId === source.id && (
                    <div
                      role="menu"
                      className="mt-1 ml-5 overflow-hidden rounded-md border border-border-default bg-surface-3 py-0.5"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full px-2 py-1 flex items-center gap-2 text-left text-[11px] text-fg-secondary hover:bg-hover-bg hover:text-fg-primary disabled:opacity-40"
                        onClick={() => {
                          setSourceActionsId(null);
                          void refreshSource(source.id);
                        }}
                        disabled={busy || !source.available}
                      >
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                        <span>{t('partner.sources.refresh')}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full px-2 py-1 flex items-center gap-2 text-left text-[11px] text-danger hover:bg-hover-bg disabled:opacity-40"
                        onClick={() => {
                          setSourceActionsId(null);
                          void removeProjectMaterial(source.id);
                        }}
                        disabled={busy || !source.available}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        <span>{t('partner.sources.removeProject')}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="px-3 pb-2 text-[11px] text-fg-faint">
                {currentSessionId ? t('partner.sources.none') : t('partner.sources.noneStaged')}
              </div>
            )}
            {catalogTruncated && (
              <div className="px-3 pb-2 text-[10px] text-warning">
                {t('partner.sources.catalogTruncated')}
              </div>
            )}
          </div>
        </div>

        {currentSessionId && (
          <div className="flex-shrink-0 px-3 py-2 border-b border-border-default">
            <label
              className="block text-[10px] uppercase tracking-wider text-fg-muted mb-1"
              htmlFor="partner-retrieval-scope"
            >
              {t('partner.sources.retrievalScope')}
            </label>
            <select
              id="partner-retrieval-scope"
              value={scope}
              onChange={(event) => void updateScope(event.target.value as PartnerKnowledgeScopeT)}
              className="w-full rounded border border-border-default bg-surface-2 px-2 py-1 text-xs text-fg-secondary"
            >
              <option value="project-grounded">{t('partner.sources.scope.project')}</option>
              <option value="selected-only">{t('partner.sources.scope.selected')}</option>
              <option value="general">{t('partner.sources.scope.general')}</option>
            </select>
            <p className="mt-1 text-[10px] text-fg-faint">{t('partner.sources.scopeHint')}</p>
          </div>
        )}

        <div className="flex-1 min-h-0" />

        {error && (
          <div className="flex-shrink-0 px-3 py-2 border-t border-border-default text-[11px] text-danger leading-snug">
            {error}
          </div>
        )}

        <div className="flex-shrink-0 p-2 border-t border-border-default">
          <button
            type="button"
            data-testid="partner-source-picker-open"
            disabled={!currentProjectPath || busy}
            onClick={openSourcePicker}
            className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 ${
              currentProjectPath && !busy
                ? 'text-fg-secondary hover:bg-hover-bg'
                : 'text-fg-muted cursor-not-allowed'
            }`}
            title={
              currentProjectPath
                ? t('partner.sources.chooseMaterial')
                : t('partner.sources.openFolderHint')
            }
          >
            {busy ? (
              <Loader2
                className="w-3.5 h-3.5 flex-shrink-0 animate-spin"
                strokeWidth={1.75}
                aria-hidden
              />
            ) : (
              <Plus className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.75} aria-hidden />
            )}
            <span className="truncate">{t('partner.sources.add')}</span>
          </button>
        </div>
      </div>

      {sourcePickerOpen && currentProjectPath && (
        <div
          className="absolute inset-0 z-40 flex flex-col bg-surface"
          data-testid="partner-source-picker"
          role="dialog"
          aria-modal="true"
          aria-labelledby="partner-source-picker-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeSourcePicker();
              return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ),
            ).filter((element) => !element.hidden);
            const first = focusable[0];
            const last = focusable.at(-1);
            if (!first || !last) return;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <div className="h-10 flex-shrink-0 px-3 flex items-center gap-2 border-b border-border-default">
            <FolderOpen className="w-3.5 h-3.5 text-fg-muted" strokeWidth={1.75} aria-hidden />
            <span
              id="partner-source-picker-title"
              className="min-w-0 flex-1 truncate text-xs font-medium text-fg-primary"
            >
              {t('partner.sources.chooseMaterial')}
            </span>
            <button
              ref={sourcePickerCloseRef}
              type="button"
              className="w-7 h-7 inline-flex items-center justify-center rounded text-fg-muted hover:bg-hover-bg hover:text-fg-primary"
              title={t('partner.sources.closePicker')}
              aria-label={t('partner.sources.closePicker')}
              onClick={closeSourcePicker}
            >
              <X className="w-4 h-4" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <p className="flex-shrink-0 px-3 py-2 text-[11px] leading-relaxed text-fg-muted border-b border-border-default">
            {t('partner.sources.chooseMaterialHint')}
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto py-1">
            <FileTree
              projectRoot={currentProjectPath}
              selectedPath={selectedPath}
              onSelect={(path) => {
                activatePartnerProjectFile(path, {
                  selectFile: (selectedFile) => {
                    setSelectedPath(selectedFile);
                    setSelectedTargetKind('file');
                  },
                  openFile: (selectedFile) => {
                    void previewFileInViewer(selectedFile, {
                      projectRoot: currentProjectPath,
                      notifyOnError: true,
                    });
                  },
                });
              }}
              onSelectDirectory={(path) => {
                setSelectedPath(path);
                setSelectedTargetKind('dir');
              }}
            />
          </div>
          {selectedPath && (
            <div
              className="flex-shrink-0 px-3 py-2 border-t border-border-default text-[10px] text-fg-muted truncate"
              title={selectedPath}
            >
              {t('partner.sources.selectedMaterial', { path: selectedPath })}
            </div>
          )}
          {error && (
            <div className="flex-shrink-0 px-3 py-2 border-t border-border-default text-[11px] text-danger leading-snug">
              {error}
            </div>
          )}
          <div className="flex-shrink-0 p-2 border-t border-border-default flex items-center gap-2">
            <button
              type="button"
              className="flex-1 px-2 py-1.5 rounded text-xs text-fg-secondary hover:bg-hover-bg"
              onClick={closeSourcePicker}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={!canAdd}
              onClick={() => void addSelectedSource()}
              className={`flex-1 px-2 py-1.5 rounded text-xs ${
                canAdd
                  ? 'border border-ok/50 bg-ok/15 text-ok hover:bg-ok/25'
                  : 'bg-surface-3 text-fg-muted cursor-not-allowed'
              }`}
            >
              {busy
                ? t('partner.sources.adding')
                : selectedAlreadyAdded
                  ? t('partner.sources.alreadyAttached')
                  : currentSessionId
                    ? selectedTargetKind === 'dir'
                      ? t('partner.sources.attachSelectedDirectory')
                      : t('partner.sources.attachSelected')
                    : selectedTargetKind === 'dir'
                      ? t('partner.sources.stageSelectedDirectory')
                      : t('partner.sources.stageSelected')}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
