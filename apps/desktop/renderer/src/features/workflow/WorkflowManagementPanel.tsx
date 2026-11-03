import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleSlash,
  Clock3,
  FileCode2,
  Loader2,
  Pause,
  PauseCircle,
  Pencil,
  Play,
  PlayCircle,
  RefreshCw,
  Save,
  Square,
  Trash2,
  Workflow,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type {
  IpcResult,
  WorkflowProcessStatusT,
  WorkflowRunT,
} from '@kodax-space/space-ipc-schema';
import { useSurfaceStore } from '../../store/surface.js';
import { useAppStore } from '../../store/appStore.js';
import { pushToast } from '../../store/toastStore.js';
import { requestConfirm } from '../../store/confirmStore.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import type { MessageKey } from '../../i18n/messages.js';
import { WorkflowLauncher } from './WorkflowLauncher.js';
import { WorkflowPanel } from './WorkflowPanel.js';
import { workflowPhaseLabel } from './workflowPhaseDisplay.js';
import {
  chooseWorkflowManagementSelection,
  relatedRunsForSavedWorkflow,
  savedWorkflowKey,
  selectableWorkflowRunSessionId,
  sortWorkflowRunsForManagement,
  workflowRerunSessionId,
  workflowRunBelongsToProject,
  workflowRunTitle,
  type SavedWorkflowRef,
  type WorkflowLibrary,
  type WorkflowManagementSelection,
} from './workflowManagementModel.js';

const STATUS_ICON: Record<WorkflowProcessStatusT, LucideIcon> = {
  running: Loader2,
  paused: PauseCircle,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: CircleSlash,
};

const STATUS_COLOR: Record<WorkflowProcessStatusT, string> = {
  running: 'text-warn',
  paused: 'text-fg-muted',
  completed: 'text-ok',
  failed: 'text-danger',
  cancelled: 'text-fg-faint',
};

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function WorkflowManagementPanel(): JSX.Element {
  const { t } = useI18n();
  const currentProjectPath = useAppStore((s) => s.currentProjectPath);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const workflowRuns = useAppStore((s) => s.workflowRuns);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const seedWorkflowRuns = useAppStore((s) => s.seedWorkflowRuns);
  const currentSurface = useSurfaceStore((s) => s.currentSurface);

  const [library, setLibrary] = useState<WorkflowLibrary | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selection, setSelection] = useState<WorkflowManagementSelection | null>(null);
  // #2 fix: window.prompt 在 Electron sandbox=true 下是静默 no-op（不会真弹窗，rename 悄悄失败）。
  // 改用 inline 输入替换 DetailHeader 的标题文字，镜像 SessionList.tsx 的 renaming + draft 模式：
  // Enter 提交，Esc/blur 取消。renaming 用 { kind, id } 而不是单纯 sessionId——run 和 saved
  // workflow 各自的 key 空间不同（runId vs savedWorkflowKey）。
  const [renaming, setRenaming] = useState<{ kind: 'run' | 'saved'; id: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const projectSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const session of sessions) {
      if ((session.surface ?? 'code') !== currentSurface) continue;
      if (currentProjectPath && session.projectRoot !== currentProjectPath) continue;
      ids.add(session.sessionId);
    }
    return ids;
  }, [currentProjectPath, currentSurface, sessions]);

  const runs = useMemo(
    () =>
      sortWorkflowRunsForManagement(
        Object.values(workflowRuns).filter((run) =>
          workflowRunBelongsToProject({
            run,
            currentProjectPath,
            currentSessionId,
            currentSurface,
            projectSessionIds,
          }),
        ),
      ),
    [currentProjectPath, currentSessionId, currentSurface, projectSessionIds, workflowRuns],
  );
  const saved = useMemo(() => library?.saved ?? [], [library]);
  const activeRuns = runs.filter((run) => run.status === 'running' || run.status === 'paused');
  const selectedRun =
    selection?.kind === 'run' ? runs.find((run) => run.runId === selection.id) : undefined;
  const selectedSaved =
    selection?.kind === 'saved'
      ? saved.find((item) => savedWorkflowKey(item) === selection.key)
      : undefined;
  const selectedSavedRuns = selectedSaved ? relatedRunsForSavedWorkflow(selectedSaved, runs) : [];

  useEffect(() => {
    if (!currentProjectPath) {
      setLibrary(null);
      return;
    }
    let cancelled = false;
    setLoadingLibrary(true);
    void window.kodaxSpace
      ?.invoke('workflow.library', { projectRoot: currentProjectPath })
      .then((result) => {
        if (!cancelled) setLibrary(result.ok ? result.data : null);
      })
      .catch(() => {
        if (!cancelled) setLibrary(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingLibrary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentProjectPath, refreshNonce]);

  useEffect(() => {
    if (!currentProjectPath) return;
    let cancelled = false;
    setLoadingRuns(true);
    void window.kodaxSpace
      ?.invoke('workflow.list', undefined)
      .then((result) => {
        if (!cancelled && result.ok) seedWorkflowRuns(result.data.runs);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingRuns(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentProjectPath, refreshNonce, seedWorkflowRuns]);

  useEffect(() => {
    setSelection((current) =>
      chooseWorkflowManagementSelection({
        current,
        runs,
        saved,
        currentSessionId,
      }),
    );
  }, [runs, saved, currentSessionId]);

  const selectRun = useCallback(
    (run: WorkflowRunT) => {
      const sessionId = selectableWorkflowRunSessionId(run, projectSessionIds);
      if (sessionId) setCurrentSession(sessionId);
      setSelection({ kind: 'run', id: run.runId });
    },
    [projectSessionIds, setCurrentSession],
  );

  const refreshLibrary = useCallback(() => setRefreshNonce((value) => value + 1), []);

  const startRenameRun = useCallback((run: WorkflowRunT) => {
    setRenaming({ kind: 'run', id: run.runId });
    setRenameDraft(workflowRunTitle(run));
  }, []);

  const commitRenameRun = useCallback(
    async (run: WorkflowRunT): Promise<void> => {
      const current = workflowRunTitle(run);
      const next = renameDraft.trim();
      setRenaming(null);
      if (!next || next === current) return;
      await invokeWorkflowControl(
        window.kodaxSpace?.invoke('workflow.rename', { runId: run.runId, displayName: next }),
        t('workflow.manager.renameFailedName', { name: current }),
      );
    },
    [renameDraft, t],
  );

  const startRenameSaved = useCallback((saved: SavedWorkflowRef) => {
    setRenaming({ kind: 'saved', id: savedWorkflowKey(saved) });
    setRenameDraft(saved.name);
  }, []);

  const commitRenameSaved = useCallback(
    async (saved: SavedWorkflowRef, sessionId: string | null): Promise<void> => {
      const next = renameDraft.trim();
      setRenaming(null);
      if (!next || next === saved.name) return;
      if (!sessionId) {
        pushToast(t('workflow.manager.openSessionBeforeEdit'), 'warning');
        return;
      }
      const result = await invokeWorkflowControl(
        window.kodaxSpace?.invoke('workflow.saved.rename', {
          name: saved.name,
          newName: next,
          sessionId,
          source: saved.source,
        }),
        t('workflow.manager.renameFailedName', { name: saved.name }),
      );
      if (result) {
        pushToast(t('workflow.manager.savedRenamed', { name: next }), 'success');
        refreshLibrary();
      }
    },
    [renameDraft, refreshLibrary, t],
  );

  const cancelRename = useCallback(() => {
    setRenaming(null);
    setRenameDraft('');
  }, []);

  const observationStatus = useAppStore((state) => state.workflowObservationStatus);
  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="workflow-management-panel">
      {observationStatus === 'recovering' && (
        <p role="status" className="px-3 py-2 text-xs text-warn">
          {t('workflow.observationRecovering')}
        </p>
      )}
      <div className="flex items-center gap-3 border-b border-border-default/60 px-3 py-2 flex-shrink-0">
        <Workflow className="h-4 w-4 text-fg-muted" strokeWidth={1.8} aria-hidden />
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-fg-primary">
            {t('workflow.manager.title')}
          </div>
          <div className="text-[10px] font-mono text-fg-faint truncate">
            {t('workflow.manager.summary', {
              live: activeRuns.length,
              runs: runs.length,
              saved: saved.length,
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={refreshLibrary}
          className="ml-auto h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:bg-surface-3 hover:text-fg-primary"
          title={t('workflow.manager.refreshLibrary')}
          aria-label={t('workflow.manager.refreshLibrary')}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loadingLibrary || loadingRuns ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-border-default/60 bg-surface/30 p-2">
          <WorkflowLauncher />
          <ManagementSection title={t('workflow.manager.runs')} count={runs.length}>
            {runs.length === 0 ? (
              <EmptyLine>
                {loadingRuns ? t('workflow.manager.loadingRuns') : t('workflow.manager.noRuns')}
              </EmptyLine>
            ) : (
              <ul className="space-y-1">
                {runs.map((run) => (
                  <RunListItem
                    key={run.runId}
                    run={run}
                    active={selection?.kind === 'run' && selection.id === run.runId}
                    onSelect={() => selectRun(run)}
                  />
                ))}
              </ul>
            )}
          </ManagementSection>

          <ManagementSection title={t('workflow.manager.savedSection')} count={saved.length}>
            {saved.length === 0 ? (
              <EmptyLine>
                {loadingLibrary
                  ? t('workflow.manager.loadingWorkflows')
                  : t('workflow.manager.noSaved')}
              </EmptyLine>
            ) : (
              <ul className="space-y-1">
                {saved.map((item) => {
                  const key = savedWorkflowKey(item);
                  return (
                    <SavedListItem
                      key={key}
                      saved={item}
                      active={selection?.kind === 'saved' && selection.key === key}
                      onSelect={() => setSelection({ kind: 'saved', key })}
                    />
                  );
                })}
              </ul>
            )}
          </ManagementSection>
        </aside>

        <main className="min-h-0 overflow-y-auto p-3" data-testid="workflow-management-detail">
          {selectedRun ? (
            <RunDetail
              run={selectedRun}
              relatedRuns={runs}
              currentSessionId={currentSessionId}
              projectSessionIds={projectSessionIds}
              onSelectRun={selectRun}
              onChanged={refreshLibrary}
              isRenaming={renaming?.kind === 'run' && renaming.id === selectedRun.runId}
              renameDraft={renameDraft}
              onRenameDraftChange={setRenameDraft}
              onStartRename={() => startRenameRun(selectedRun)}
              onCommitRename={() => void commitRenameRun(selectedRun)}
              onCancelRename={cancelRename}
            />
          ) : selectedSaved ? (
            <SavedDetail
              saved={selectedSaved}
              relatedRuns={selectedSavedRuns}
              currentSessionId={currentSessionId}
              onSelectRun={selectRun}
              onChanged={refreshLibrary}
              isRenaming={
                renaming?.kind === 'saved' && renaming.id === savedWorkflowKey(selectedSaved)
              }
              renameDraft={renameDraft}
              onRenameDraftChange={setRenameDraft}
              onStartRename={() => startRenameSaved(selectedSaved)}
              onCommitRename={() => void commitRenameSaved(selectedSaved, currentSessionId)}
              onCancelRename={cancelRename}
            />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}

function ManagementSection({
  title,
  count,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="mt-3 first:mt-0">
      <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-mono uppercase tracking-wider text-fg-faint">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      {children}
    </section>
  );
}

function RunListItem({
  run,
  active,
  onSelect,
}: {
  readonly run: WorkflowRunT;
  readonly active: boolean;
  readonly onSelect: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const Icon = STATUS_ICON[run.status];
  const title = workflowRunTitle(run);
  const phase = workflowPhaseLabel(run, t);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        data-testid="workflow-run-list-item"
        className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
          active
            ? 'border-run/60 bg-run/15'
            : 'border-border-default/40 bg-surface-2/50 hover:bg-hover-bg'
        }`}
        title={title}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon
            className={`h-3.5 w-3.5 flex-shrink-0 ${STATUS_COLOR[run.status]} ${
              run.status === 'running' ? 'animate-spin' : ''
            }`}
            strokeWidth={2}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-fg-primary">
            {title}
          </span>
          <span className="flex-shrink-0 text-[9px] font-mono text-fg-faint">{run.status}</span>
        </div>
        <div className="mt-0.5 truncate text-[10px] font-mono text-fg-faint">
          {phase ?? run.latestMessage ?? shortRunId(run.runId)}
        </div>
      </button>
    </li>
  );
}

function SavedListItem({
  saved,
  active,
  onSelect,
}: {
  readonly saved: SavedWorkflowRef;
  readonly active: boolean;
  readonly onSelect: () => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
          active
            ? 'border-accent/55 bg-accent/10'
            : 'border-border-default/40 bg-surface-2/50 hover:bg-hover-bg'
        }`}
        title={saved.path}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <FileCode2
            className="h-3.5 w-3.5 flex-shrink-0 text-fg-muted"
            strokeWidth={1.8}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-fg-primary">
            {saved.name}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[10px] font-mono text-fg-faint">
          {saved.source ?? saved.execution ?? t('workflow.manager.savedSourceFallback')}
        </div>
      </button>
    </li>
  );
}

function RunDetail({
  run,
  relatedRuns,
  currentSessionId,
  projectSessionIds,
  onSelectRun,
  onChanged,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
}: {
  readonly run: WorkflowRunT;
  readonly relatedRuns: readonly WorkflowRunT[];
  readonly currentSessionId: string | null;
  readonly projectSessionIds: ReadonlySet<string>;
  readonly onSelectRun: (run: WorkflowRunT) => void;
  readonly onChanged: () => void;
  readonly isRenaming: boolean;
  readonly renameDraft: string;
  readonly onRenameDraftChange: (value: string) => void;
  readonly onStartRename: () => void;
  readonly onCommitRename: () => void;
  readonly onCancelRename: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const title = workflowRunTitle(run);
  const [saving, setSaving] = useState(false);
  const [saveDraft, setSaveDraft] = useState('');
  const [savePending, setSavePending] = useState(false);

  useEffect(() => {
    setSaving(false);
    setSaveDraft('');
    setSavePending(false);
  }, [run.runId]);

  const startSave = useCallback(() => {
    setSaveDraft(suggestSavedWorkflowName(run));
    setSaving(true);
  }, [run]);

  const cancelSave = useCallback(() => {
    setSaving(false);
    setSaveDraft('');
  }, []);

  const commitSave = useCallback(
    async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (savePending) return;
      const name = saveDraft.trim();
      if (!name) return;
      setSavePending(true);
      try {
        const result = await saveWorkflowRun(run, name, currentSessionId, projectSessionIds, t);
        if (result) {
          setSaving(false);
          setSaveDraft('');
          onChanged();
        }
      } finally {
        setSavePending(false);
      }
    },
    [currentSessionId, onChanged, projectSessionIds, run, saveDraft, savePending, t],
  );

  return (
    <div className="space-y-3">
      <DetailHeader
        icon={<Workflow className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
        title={title}
        subtitle={`${run.status} / ${shortRunId(run.runId)}`}
        renameSlot={
          isRenaming ? (
            <input
              type="text"
              autoFocus
              value={renameDraft}
              onChange={(e) => onRenameDraftChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitRename();
                else if (e.key === 'Escape') onCancelRename();
              }}
              maxLength={256}
              className="w-full min-w-0 rounded border border-border-strong bg-surface px-1.5 py-0.5 text-[14px] font-semibold text-fg-primary"
              aria-label={t('workflow.manager.renameRunAria')}
            />
          ) : undefined
        }
      >
        <RunActions
          run={run}
          currentSessionId={currentSessionId}
          projectSessionIds={projectSessionIds}
          onStartRename={onStartRename}
          onStartSave={startSave}
        />
      </DetailHeader>
      {saving && (
        <form
          onSubmit={(event) => void commitSave(event)}
          className="rounded-md border border-border-default/60 bg-surface-2/60 p-2"
        >
          <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-fg-faint">
            {t('workflow.manager.saveWorkflow')}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <input
              type="text"
              autoFocus
              value={saveDraft}
              disabled={savePending}
              onChange={(event) => setSaveDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') cancelSave();
              }}
              maxLength={256}
              className="min-w-0 flex-1 rounded border border-border-strong bg-surface px-2 py-1 text-[12px] text-fg-primary"
              aria-label={t('workflow.manager.savedWorkflowNameAria')}
            />
            <button
              type="submit"
              disabled={saveDraft.trim().length === 0 || savePending}
              className="h-7 rounded-md border border-run/45 bg-run/10 px-2 text-[11px] font-medium text-fg-primary disabled:cursor-not-allowed disabled:opacity-45"
            >
              {savePending ? t('workflow.manager.saving') : t('common.save')}
            </button>
            <button
              type="button"
              onClick={cancelSave}
              disabled={savePending}
              className="h-7 rounded-md border border-border-default/60 px-2 text-[11px] text-fg-muted hover:bg-surface-3 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-45"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
      <WorkflowPanel
        runs={[run]}
        variant="full"
        hideRunHeader
        defaultDetailsOpen={false}
        defaultResultOpen
      />
      <HistoryBlock runs={relatedRuns} selectedRunId={run.runId} onSelectRun={onSelectRun} />
    </div>
  );
}

function SavedDetail({
  saved,
  relatedRuns,
  currentSessionId,
  onSelectRun,
  onChanged,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
}: {
  readonly saved: SavedWorkflowRef;
  readonly relatedRuns: readonly WorkflowRunT[];
  readonly currentSessionId: string | null;
  readonly onSelectRun: (run: WorkflowRunT) => void;
  readonly onChanged: () => void;
  readonly isRenaming: boolean;
  readonly renameDraft: string;
  readonly onRenameDraftChange: (value: string) => void;
  readonly onStartRename: () => void;
  readonly onCommitRename: () => void;
  readonly onCancelRename: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const latestRun = relatedRuns[0];
  return (
    <div className="space-y-3">
      <DetailHeader
        icon={<FileCode2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />}
        title={saved.name}
        subtitle={saved.source ?? saved.execution ?? t('workflow.manager.savedWorkflowFallback')}
        renameSlot={
          isRenaming ? (
            <input
              type="text"
              autoFocus
              value={renameDraft}
              onChange={(e) => onRenameDraftChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitRename();
                else if (e.key === 'Escape') onCancelRename();
              }}
              maxLength={256}
              className="w-full min-w-0 rounded border border-border-strong bg-surface px-1.5 py-0.5 text-[14px] font-semibold text-fg-primary"
              aria-label={t('workflow.renameAria')}
            />
          ) : undefined
        }
      >
        <SavedActions
          saved={saved}
          currentSessionId={currentSessionId}
          onChanged={onChanged}
          onStartRename={onStartRename}
        />
      </DetailHeader>

      <div className="rounded-md border border-border-default/60 bg-surface-2/60 p-2">
        <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-fg-faint">
          {t('workflow.manager.capsule')}
        </div>
        <div className="break-all text-[11px] font-mono text-fg-secondary">{saved.path}</div>
      </div>

      {latestRun ? (
        <>
          <div>
            <div className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-fg-faint">
              {t('workflow.manager.latestRuntimeGraph')}
            </div>
            <WorkflowPanel runs={[latestRun]} variant="full" defaultResultOpen />
          </div>
          <HistoryBlock
            runs={relatedRuns}
            selectedRunId={latestRun.runId}
            onSelectRun={onSelectRun}
          />
        </>
      ) : (
        <div className="rounded-md border border-dashed border-border-default/70 bg-surface-2/35 p-3 text-xs text-fg-muted">
          {t('workflow.manager.noRuntimeHistory')}
        </div>
      )}
    </div>
  );
}

function DetailHeader({
  icon,
  title,
  subtitle,
  renameSlot,
  children,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly subtitle: string;
  /** #2 fix: 传入时替换标题的纯文本展示——用于 inline rename input。 */
  readonly renameSlot?: React.ReactNode;
  readonly children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-start gap-2 border-b border-border-default/50 pb-2">
      <span className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border-default/60 bg-surface-2 text-fg-muted">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        {renameSlot ?? (
          <div className="truncate text-[14px] font-semibold text-fg-primary" title={title}>
            {title}
          </div>
        )}
        <div className="mt-0.5 truncate text-[10px] font-mono text-fg-faint" title={subtitle}>
          {subtitle}
        </div>
      </div>
      {children && <div className="flex flex-shrink-0 items-center gap-1">{children}</div>}
    </div>
  );
}

function RunActions({
  run,
  currentSessionId,
  projectSessionIds,
  onStartRename,
  onStartSave,
}: {
  readonly run: WorkflowRunT;
  readonly currentSessionId: string | null;
  readonly projectSessionIds: ReadonlySet<string>;
  readonly onStartRename: () => void;
  readonly onStartSave: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const active = run.status === 'running' || run.status === 'paused';
  const terminal =
    run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
  const name = workflowRunTitle(run);
  return (
    <>
      <ActionButton
        label={t('workflow.manager.runAgain')}
        onClick={() => void rerunWorkflow(run, currentSessionId, projectSessionIds, t)}
      >
        <PlayCircle size={13} />
      </ActionButton>
      {run.status === 'running' && (
        <ActionButton
          label={t('workflow.pause')}
          onClick={() => void pauseWorkflow(run.runId, name, t)}
        >
          <Pause size={13} />
        </ActionButton>
      )}
      {run.status === 'paused' && (
        <ActionButton
          label={t('workflow.resume')}
          onClick={() => void resumeWorkflow(run.runId, name, t)}
        >
          <Play size={13} />
        </ActionButton>
      )}
      {active && (
        <ActionButton
          label={t('workflow.stop')}
          danger
          onClick={() => void stopWorkflow(run.runId, name, t)}
        >
          <Square size={13} />
        </ActionButton>
      )}
      <ActionButton label={t('workflow.rename')} onClick={onStartRename}>
        <Pencil size={13} />
      </ActionButton>
      {run.status === 'completed' && (
        <ActionButton label={t('workflow.manager.saveWorkflowAction')} onClick={onStartSave}>
          <Save size={13} />
        </ActionButton>
      )}
      {terminal && (
        <ActionButton
          label={t('workflow.delete')}
          danger
          onClick={() => void deleteWorkflowRun(run, t)}
        >
          <Trash2 size={13} />
        </ActionButton>
      )}
    </>
  );
}

function SavedActions({
  saved,
  currentSessionId,
  onChanged,
  onStartRename,
}: {
  readonly saved: SavedWorkflowRef;
  readonly currentSessionId: string | null;
  readonly onChanged: () => void;
  readonly onStartRename: () => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <>
      <ActionButton
        label={t('workflow.manager.run')}
        onClick={() => void startSavedWorkflow(saved, currentSessionId, t)}
      >
        <Play size={13} />
      </ActionButton>
      <ActionButton label={t('workflow.rename')} onClick={onStartRename}>
        <Pencil size={13} />
      </ActionButton>
      <ActionButton
        label={t('workflow.delete')}
        danger
        onClick={() => void deleteSavedWorkflow(saved, currentSessionId, onChanged, t)}
      >
        <Trash2 size={13} />
      </ActionButton>
    </>
  );
}

function ActionButton({
  label,
  danger,
  onClick,
  children,
}: {
  readonly label: string;
  readonly danger?: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`h-7 w-7 inline-flex items-center justify-center rounded-md border border-border-default/50 text-fg-muted hover:bg-surface-3 ${
        danger ? 'hover:text-danger' : 'hover:text-fg-primary'
      }`}
    >
      {children}
    </button>
  );
}

function HistoryBlock({
  runs,
  selectedRunId,
  onSelectRun,
}: {
  readonly runs: readonly WorkflowRunT[];
  readonly selectedRunId?: string;
  readonly onSelectRun: (run: WorkflowRunT) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  if (runs.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-fg-faint">
        <Clock3 className="h-3 w-3" strokeWidth={1.8} aria-hidden />
        <span>{t('workflow.manager.executionHistory')}</span>
      </div>
      <ul className="space-y-1">
        {runs.slice(0, 12).map((run) => (
          <HistoryRow
            key={run.runId}
            run={run}
            active={run.runId === selectedRunId}
            onSelect={() => onSelectRun(run)}
          />
        ))}
      </ul>
    </div>
  );
}

function HistoryRow({
  run,
  active,
  onSelect,
}: {
  readonly run: WorkflowRunT;
  readonly active: boolean;
  readonly onSelect: () => void;
}): JSX.Element {
  const Icon = STATUS_ICON[run.status];
  const title = workflowRunTitle(run);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-1.5 text-left ${
          active
            ? 'border-run/55 bg-run/10'
            : 'border-border-default/40 bg-surface-2/45 hover:bg-hover-bg'
        }`}
      >
        <Icon
          className={`h-3.5 w-3.5 ${STATUS_COLOR[run.status]} ${
            run.status === 'running' ? 'animate-spin' : ''
          }`}
          strokeWidth={2}
          aria-hidden
        />
        <span className="truncate text-[11px] text-fg-secondary" title={title}>
          {title}
        </span>
        <span className="text-[10px] font-mono text-fg-faint">{run.status}</span>
      </button>
    </li>
  );
}

function EmptyLine({ children }: { readonly children: React.ReactNode }): JSX.Element {
  return <div className="px-1 py-1 text-[11px] text-fg-faint">{children}</div>;
}

function EmptyState(): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center rounded-md border border-dashed border-border-default/60 text-xs text-fg-muted">
      {t('workflow.manager.noWorkflowSelected')}
    </div>
  );
}

// #13 fix: control actions are fire-and-forget IPC — the async result can land after the
// user has switched to a different run/session. Every toast below names the run/workflow so
// a "failed"/"succeeded" toast is never ambiguous about which one it refers to.
async function pauseWorkflow(runId: string, name: string, t: Translate): Promise<void> {
  await invokeWorkflowControl(
    window.kodaxSpace?.invoke('workflow.pause', { runId }),
    t('workflow.manager.pauseFailedName', { name }),
  );
}

async function resumeWorkflow(runId: string, name: string, t: Translate): Promise<void> {
  await invokeWorkflowControl(
    window.kodaxSpace?.invoke('workflow.resume', { runId }),
    t('workflow.manager.resumeFailedName', { name }),
  );
}

async function stopWorkflow(runId: string, name: string, t: Translate): Promise<void> {
  await invokeWorkflowControl(
    window.kodaxSpace?.invoke('workflow.stop', { runId, reason: 'stopped from workflow manager' }),
    t('workflow.manager.stopFailedName', { name }),
  );
}

async function saveWorkflowRun(
  run: WorkflowRunT,
  name: string,
  currentSessionId: string | null,
  projectSessionIds: ReadonlySet<string>,
  t: Translate,
): Promise<{ readonly name?: string; readonly path?: string } | null> {
  const title = workflowRunTitle(run);
  const sessionId = workflowRerunSessionId({ run, currentSessionId, projectSessionIds });
  if (!sessionId) {
    pushToast(t('workflow.manager.openSessionBeforeSave'), 'warning');
    return null;
  }
  const result = await invokeWorkflowControl(
    window.kodaxSpace?.invoke('workflow.save', { runId: run.runId, name, sessionId }),
    t('workflow.manager.saveFailedName', { name: title }),
  );
  if (result)
    pushToast(t('workflow.manager.workflowSaved', { name: result.name ?? name }), 'success');
  return result;
}

async function rerunWorkflow(
  run: WorkflowRunT,
  currentSessionId: string | null,
  projectSessionIds: ReadonlySet<string>,
  t: Translate,
): Promise<void> {
  const name = workflowRunTitle(run);
  const sessionId = workflowRerunSessionId({ run, currentSessionId, projectSessionIds });
  if (!sessionId) {
    pushToast(t('workflow.manager.openSessionBeforeRerun'), 'warning');
    return;
  }
  const result = await invokeWorkflowControl(
    window.kodaxSpace?.invoke('workflow.rerun', { runId: run.runId, sessionId }),
    t('workflow.manager.rerunFailedName', { name }),
  );
  if (result) pushToast(t('workflow.manager.workflowRerunStarted', { name }), 'success');
}

async function deleteWorkflowRun(run: WorkflowRunT, t: Translate): Promise<void> {
  const name = workflowRunTitle(run);
  // #1 fix: window.confirm 在 Electron sandbox=true 下会夺走 webContents 键盘焦点且拿不回来
  // ——改用应用内 requestConfirm。
  const confirmed = await requestConfirm({
    message: t('workflow.manager.deleteRunConfirm', { name }),
    danger: true,
    confirmLabel: t('common.delete'),
  });
  if (!confirmed) return;
  const result = await invokeWorkflowControl(
    window.kodaxSpace?.invoke('workflow.delete', { runId: run.runId }),
    t('workflow.manager.deleteFailedName', { name }),
  );
  if (result) {
    // 删除无 push 事件、seed 只增不删——必须显式从 store 移除，否则面板里删不掉。
    useAppStore.getState().removeWorkflowRun(run.runId);
    pushToast(t('workflow.manager.runDeleted', { name }), 'success');
  }
}

async function startSavedWorkflow(
  saved: SavedWorkflowRef,
  currentSessionId: string | null,
  t: Translate,
): Promise<void> {
  if (!currentSessionId) {
    pushToast(t('workflow.manager.openSessionBeforeRun'), 'warning');
    return;
  }
  const result = await invokeWorkflowControl(
    window.kodaxSpace?.invoke('workflow.start', {
      target: saved.path,
      source: 'saved',
      sessionId: currentSessionId,
    }),
    t('workflow.manager.startFailedName', { name: saved.name }),
  );
  if (result) pushToast(t('workflow.manager.workflowStarted', { name: saved.name }), 'success');
}

async function deleteSavedWorkflow(
  saved: SavedWorkflowRef,
  currentSessionId: string | null,
  onChanged: () => void,
  t: Translate,
): Promise<void> {
  if (!currentSessionId) {
    pushToast(t('workflow.manager.openSessionBeforeEdit'), 'warning');
    return;
  }
  // #1 fix: window.confirm 在 Electron sandbox=true 下会夺走 webContents 键盘焦点且拿不回来
  // ——改用应用内 requestConfirm。
  const confirmed = await requestConfirm({
    message: t('workflow.manager.deleteSavedConfirm', { name: saved.name }),
    danger: true,
    confirmLabel: t('common.delete'),
  });
  if (!confirmed) return;
  const result = await invokeWorkflowControl(
    window.kodaxSpace?.invoke('workflow.saved.delete', {
      name: saved.name,
      sessionId: currentSessionId,
      source: saved.source,
    }),
    t('workflow.manager.deleteFailedName', { name: saved.name }),
  );
  if (result) {
    pushToast(t('workflow.manager.savedDeleted', { name: saved.name }), 'success');
    onChanged();
  }
}

async function invokeWorkflowControl<T>(
  action: Promise<IpcResult<T>> | undefined,
  fallback: string,
): Promise<T | null> {
  if (!action) {
    pushToast(fallback, 'error');
    return null;
  }
  try {
    const result = await action;
    if (!result.ok) {
      pushToast(result.error.message || fallback, 'error');
      return null;
    }
    const data = result.data as T & { error?: string; ok?: boolean };
    if (data.error) {
      pushToast(data.error, 'error');
      return null;
    }
    if (data.ok === false) {
      pushToast(fallback, 'warning');
      return null;
    }
    return result.data;
  } catch (err) {
    pushToast(err instanceof Error ? err.message : fallback, 'error');
    return null;
  }
}

function suggestSavedWorkflowName(run: WorkflowRunT): string {
  const raw = (run.workflowName ?? run.displayName ?? workflowRunTitle(run)).trim();
  const stripped = raw
    .replace(/\.workflow\.(mjs|cjs|js|ts|tsx)$/i, '')
    .replace(/\.(mjs|cjs|js|ts|tsx)$/i, '')
    .trim();
  return (stripped || 'workflow').slice(0, 128);
}

function shortRunId(runId: string): string {
  return runId.length > 12 ? `${runId.slice(0, 10)}...` : runId;
}
