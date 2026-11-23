// LeftSidebar — F011-revised + FEATURE_033 tree view
//
// Claude Desktop 风左侧侧栏：
//   ┌─────────────┐
//   │ [Coder][Partner]  ← surface tab (F045: Partner 可点，SurfaceTabs 组件)
//   │
//   │ + New session
//   │ ▾ More features  Coming soon  (未来功能默认折叠)
//   │
//   │ Recents ────────────────
//   │   · 项目分析
//   │     ⑂ 项目分析 (fork)         ← FEATURE_033 fork child 缩进显示
//   │   · 修个 bug
//   └─────────────┘
//
// ADR-004 v2 决策：常驻 Coder/Partner tab。F045 起 Partner 可点（抽到 SurfaceTabs 组件，
// 接 surface store）；LeftSidebar 是两 surface 共用的全局导航（项目 / session / surface tab）。

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  ArchiveRestore,
  Plus,
  ChevronDown,
  Ellipsis,
  FolderTree,
  Monitor,
  Pin,
  PinOff,
  Blocks,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { SurfaceTabs } from './SurfaceTabs.js';
import { moveWithinVisible } from './sortPreview.js';
import { useDragSort, type DragSort } from './useDragSort.js';
import { useAppStore } from '../store/appStore.js';
import { startNewConversation } from '../store/newConversation.js';
import { useSurfaceStore } from '../store/surface.js';
import { Caret } from '../components/Caret.js';
import {
  canonProjectRoot,
  type SessionMeta,
  type RunningSessionInfoT,
  type SupportedLocaleT,
} from '@kodax-space/space-ipc-schema';
import { SessionContextMenu } from './SessionContextMenu.js';
import { ProjectContextMenu } from './ProjectContextMenu.js';
import { ProjectSessionPicker } from './ProjectSessionPicker.js';
import { sortPinnedSessions, sortProjectSessions } from './sessionOrder.js';
import { usePinnedSessionsOutsideWindow } from './usePinnedSessionsOutsideWindow.js';
import { SidebarFooter } from './SidebarFooter.js';
import { useSessionStatusMap, type SessionStatus } from '../features/session/useSessionStatus.js';
import { SessionAwaitingIndicator } from '../features/session/SessionAwaitingIndicator.js';
import { prioritizeAttentionItems } from '../features/session/sessionInteractionRouting.js';
import {
  sessionAttentionKind,
  summarizeSessionAttention,
  type SessionAttentionContext,
} from '../features/session/sessionAttention.js';
import { ProjectAttentionBadge } from './ProjectAttentionBadge.js';
import { pushToast } from '../store/toastStore.js';
import { toggleSessionFlagPersisted } from '../store/sessionFlagSync.js';
import { savePinnedProjects, saveProjectOrder } from '../store/projectOrderSync.js';
import type { Project } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../i18n/I18nProvider.js';
import { invokeWithTimeout } from '../lib/ipcInvokeWithTimeout.js';
import { confirmDeleteSession, ROW_COLLAPSE_CLASS } from '../lib/deleteSession.js';
import { confirmRemoveProject, setProjectArchived } from './projectActions.js';
import { runningPeerAction } from './runningPeerAction.js';
import {
  sessionLoadScopeKey,
  unloadedProjectSessionRoots,
  type SessionLoadPhase,
  type SessionLoadStateByScope,
} from './sidebarSessionLoading.js';
import { projectShellChrome } from './shellChromeProjection.js';

interface LeftSidebarProps {
  /** 2026-06: 动态宽度（px）。Shell 拖 ResizeHandle 实时改这个值。 */
  width?: number;
  readonly filesActive?: boolean;
  readonly onOpenFiles?: () => void;
  readonly pluginsAvailable?: boolean;
  readonly pluginsActive?: boolean;
  readonly onOpenPlugins?: () => void;
  readonly onNavigate?: () => void;
  readonly onOpenSettings: () => void;
}

export function LeftSidebar({
  width,
  filesActive = false,
  onOpenFiles,
  pluginsAvailable = false,
  pluginsActive = false,
  onOpenPlugins,
  onNavigate,
  onOpenSettings,
}: LeftSidebarProps): JSX.Element {
  const { t } = useI18n();
  const sessions = useAppStore((s) => s.sessions);
  const projects = useAppStore((s) => s.projects);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const welcomeDraftSessionId = useAppStore((s) => s.welcomeDraftSessionId);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const currentProjectPath = useAppStore((s) => s.currentProjectPath);
  // F045: 当前工作面（Coder / Partner）。session 列表按 surface 分面——切 surface 重新拉。
  const currentSurface = useSurfaceStore((s) => s.currentSurface);
  const shellChrome = projectShellChrome(currentSurface);
  const visibleSessions = useMemo(
    () =>
      sessions.filter(
        (s) => (s.surface ?? 'code') === currentSurface && s.sessionId !== welcomeDraftSessionId,
      ),
    [sessions, currentSurface, welcomeDraftSessionId],
  );
  // One status subscription for both surfaces: the current list and the other surface's tab.
  const listedSessionIds = useMemo(
    () => sessions.filter((s) => s.sessionId !== welcomeDraftSessionId).map((s) => s.sessionId),
    [sessions, welcomeDraftSessionId],
  );
  const statusMap = useSessionStatusMap(listedSessionIds);
  const sessionFlags = useAppStore((s) => s.sessionFlags);
  const otherSurfaceAttention = useMemo(
    () =>
      summarizeSessionAttention(
        sessions
          .filter(
            (s) =>
              (s.surface ?? 'code') !== currentSurface && s.sessionId !== welcomeDraftSessionId,
          )
          .map((s) => s.sessionId),
        {
          statusFor: (id) => statusMap[id] ?? 'idle',
          isUnread: (id) => sessionFlags[id]?.unread === true,
          currentSessionId,
        },
      ),
    [sessions, currentSurface, welcomeDraftSessionId, statusMap, sessionFlags, currentSessionId],
  );

  const [sessionLoadStateByScope, setSessionLoadStateByScope] = useState<
    Record<string, SessionLoadPhase | undefined>
  >({});
  const sessionListRequestIds = useRef(new Map<string, number>());

  const loadProjectSessions = useCallback(
    async (projectRoot: string): Promise<void> => {
      const bridge = window.kodaxSpace;
      if (!bridge) return;

      const scopeKey = sessionLoadScopeKey(projectRoot, currentSurface);
      const requestId = (sessionListRequestIds.current.get(scopeKey) ?? 0) + 1;
      sessionListRequestIds.current.set(scopeKey, requestId);
      setSessionLoadStateByScope((current) => ({ ...current, [scopeKey]: 'loading' }));

      try {
        const result = await bridge.invoke('session.list', {
          projectRoot,
          surface: currentSurface,
        });
        if (sessionListRequestIds.current.get(scopeKey) !== requestId) return;

        if (!result.ok) {
          setSessionLoadStateByScope((current) => ({ ...current, [scopeKey]: 'error' }));
          return;
        }

        useAppStore.getState().replaceSessionsForScope(result.data.sessions, {
          projectRoot,
          surface: currentSurface,
        });
        setSessionLoadStateByScope((current) => ({ ...current, [scopeKey]: 'loaded' }));
      } catch {
        if (sessionListRequestIds.current.get(scopeKey) !== requestId) return;
        setSessionLoadStateByScope((current) => ({ ...current, [scopeKey]: 'error' }));
      }
    },
    [currentSurface],
  );

  // 多项目 sidebar 的 recent 上限必须按项目计算。一次无 projectRoot 的全局 200 条查询会被
  // 单个活跃项目吃满，随后让其它项目错误显示“暂无会话”。逐项目拉取后，每个项目都拥有
  // 自己的 200 条最近窗口；显式“展示全部”再由 ProjectSessionPicker 按需扩大到 50,000。
  useEffect(() => {
    const bridge = window.kodaxSpace;
    if (!bridge) return;
    const candidates = [currentProjectPath, ...projects.map((project) => project.path)].filter(
      (projectPath): projectPath is string => projectPath !== null,
    );
    const roots = unloadedProjectSessionRoots(candidates, currentSurface, sessionLoadStateByScope);
    if (roots.length === 0) return;

    // Each project lands independently. A slow project must not keep every other
    // project looking empty while an aggregate Promise waits for the tail.
    for (const projectRoot of roots) void loadProjectSessions(projectRoot);
  }, [currentProjectPath, currentSurface, loadProjectSessions, projects, sessionLoadStateByScope]);

  /**
   * + New session：统一首页与新建。不再急建空 session（那会跳进零消息空白对话页，
   * 还往 RECENTS 塞一条 Untitled 空壳）；改为回到"无 session"落地态 —— WelcomeDashboard
   * + composer。真正的 session 由 BottomBar.ensureSession 在首次发送时懒建，用同一个
   * resolveSessionCreateInputs（pending → Space default → KodaX default）解析 provider/mode，
   * 所以 provider / 模式选择一点不丢（见 createSession.ts 头注释：两处调用已统一到该 helper）。
   */
  function handleNewSession(): void {
    onNavigate?.();
    startNewConversation();
  }

  function handleOpenFiles(): void {
    onNavigate?.();
    onOpenFiles?.();
  }

  // open/setOpen 由 Shell 顶层 breadcrumb 行的 SidebarToggleButton 直接管理；
  // open=false 时 Shell 不会渲染本组件（不再保留竖条占位 — 避免无信息密度的 dead zone）

  return (
    <aside
      data-testid="left-sidebar"
      style={width !== undefined ? { width: `${width}px` } : undefined}
      className="workspace-navigation glass ix-zone flex min-h-0 flex-col overflow-hidden bg-surface flex-shrink-0 text-[13px]"
    >
      {/* Surface tab — F045: [Coder][Partner] 切换（Partner 自本版起可点） */}
      <SurfaceTabs otherSurfaceAttention={otherSurfaceAttention} />

      {/* New session + menus */}
      <div className="p-2 space-y-1">
        <button
          type="button"
          onClick={handleNewSession}
          disabled={!currentProjectPath}
          className="sidebar-nav-action w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-hover-bg text-fg-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={!currentProjectPath ? t('sidebar.openFolderFirst') : t('sidebar.newSession')}
        >
          <Plus className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
          {t('sidebar.newSession')}
        </button>
        <button
          type="button"
          onClick={handleOpenFiles}
          disabled={!currentProjectPath}
          className={`sidebar-nav-action w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-hover-bg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
            filesActive ? 'bg-surface-3 text-fg-primary' : 'text-fg-primary'
          }`}
          title={!currentProjectPath ? t('sidebar.openFolderFirst') : t('files.openProjectFiles')}
          aria-pressed={filesActive}
        >
          <FolderTree className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
          {t('files.openProjectFiles')}
        </button>
        {currentSurface === 'partner' && pluginsAvailable && (
          <button
            type="button"
            data-testid="partner-plugins-nav"
            onClick={onOpenPlugins}
            aria-pressed={pluginsActive}
            className={`sidebar-nav-action w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-hover-bg flex items-center gap-2 text-fg-primary ${pluginsActive ? 'bg-surface-3' : ''}`}
          >
            <Blocks className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
            {t('extensions.plugins')}
          </button>
        )}
        {shellChrome.showFutureFeatures && <FutureFeaturesDisclosure />}
      </div>

      {/* F017 Running peers — 其他 KodaX 进程（CLI / 别的 Space 窗口）当前活动的 session。
          peers.length === 0 时整段隐藏不占空间。 */}
      <RunningPeersPanel />

      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {/* F040: 多项目可折叠树。currentProjectPath 默认展开 + 高亮；
            其它项目折叠。状态点驱动来自 useSessionStatusMap。
            F149: 置顶区在最上，其下是 Projects 标题（含显示已归档开关），再下是主列表。 */}
        <ProjectTree
          header={<RecentsHeader />}
          sessions={visibleSessions}
          loadedIds={listedSessionIds}
          statusMap={statusMap}
          currentSessionId={currentSessionId}
          onSelect={(sessionId) => {
            onNavigate?.();
            setCurrentSession(sessionId);
          }}
          sessionLoadStateByScope={sessionLoadStateByScope}
          onRefreshProjectSessions={loadProjectSessions}
        />
        {visibleSessions.length === 0 && projects.length === 0 && (
          <div className="text-xs text-fg-muted px-2 py-3">
            {currentProjectPath ? t('sidebar.noSessionsYet') : t('sidebar.openFolderToStart')}
          </div>
        )}
      </div>

      <SidebarFooter onOpenSettings={onOpenSettings} />
    </aside>
  );
}

/**
 * F040: 多项目可折叠树外层。
 *
 * 顶层 = 已打开过的所有项目（store.projects），新加的（不在拖排顺序里）在最上、新→旧，其后按用户拖排顺序。
 * 当前项目默认展开且高亮；其它项目折叠态。展开状态持久化到 localStorage（store.expandedProjects）。
 *
 * 每项目内复用 SessionTree（传 projectRoot 只渲染本项目 session）。状态点：
 * useSessionStatusMap 一次拍全部 session 状态，按需传给每个 SessionTree。
 *
 * 折叠项目节点显示运行数计数（🟢N），让用户一眼看到哪个项目里有 agent 在跑。
 *
 * 边界：
 *   - store.projects 为空 → 不渲染（fallback 到上方"Open a folder"提示）
 *   - 某项目在 store.projects 但没 sessions → 仍渲染节点但展开后空（提示用户）
 *   - 某 session 的 projectRoot 不在 store.projects → 漏出来不渲染（orphan）；
 *     这不应发生（projectStore 用 SDK listSessions 来源 + project.recent.add），
 *     如果真发生说明 SDK 给了脏数据，安全做法是隐藏不暴露
 */
// 拖动中的项目行抬起显示。按住鼠标期间 button 一直 :active,全局按钮光泽会停在行上,拖动时关掉。
const DRAG_SOURCE_ROW_CLASS =
  'bg-surface-3 shadow-lg ring-1 ring-border-default/60 [&_button]:before:hidden';

function ProjectTree({
  header,
  sessions,
  loadedIds,
  statusMap,
  currentSessionId,
  onSelect,
  sessionLoadStateByScope,
  onRefreshProjectSessions,
}: {
  /** 置顶区与主列表之间的标题行（Projects）。 */
  readonly header: ReactNode;
  readonly sessions: readonly SessionMeta[];
  readonly loadedIds: readonly string[];
  readonly statusMap: Readonly<Record<string, SessionStatus>>;
  readonly currentSessionId: string | null;
  readonly onSelect: (sessionId: string) => void;
  readonly sessionLoadStateByScope: SessionLoadStateByScope;
  readonly onRefreshProjectSessions: (projectRoot: string) => Promise<void>;
}): JSX.Element | null {
  const { t } = useI18n();
  const currentSurface = useSurfaceStore((s) => s.currentSurface);
  const projects = useAppStore((s) => s.projects);
  const setProjects = useAppStore((s) => s.setProjects);
  const currentProjectPath = useAppStore((s) => s.currentProjectPath);
  const expandedProjects = useAppStore((s) => s.expandedProjects);
  const toggleProjectExpanded = useAppStore((s) => s.toggleProjectExpanded);
  // archived 折叠状态 (持久化)
  const archivedExpanded = useAppStore((s) => s.archivedProjectsExpanded);
  const setArchivedExpanded = useAppStore((s) => s.setArchivedProjectsExpanded);

  // F043: 项目级 contextmenu 状态 + inline rename
  const [projCtxMenu, setProjCtxMenu] = useState<{ project: Project; x: number; y: number } | null>(
    null,
  );
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  // v0.1.9: "+N more sessions" picker overlay — 哪个项目正在浏览全量
  const [pickerProject, setPickerProject] = useState<Project | null>(null);
  const [projectSessionLimits, setProjectSessionLimits] = useState<Record<string, number>>({});

  const expandProjectSessionList = useCallback((projectPath: string): void => {
    setProjectSessionLimits((prev) => {
      const current = prev[projectPath] ?? SESSIONS_PER_PROJECT_INITIAL_VISIBLE;
      const next = Math.min(SESSIONS_PER_PROJECT_INLINE_MAX, current + SESSIONS_PER_PROJECT_STEP);
      if (next === current) return prev;
      return { ...prev, [projectPath]: next };
    });
  }, []);

  const collapseProjectSessionList = useCallback((projectPath: string): void => {
    setProjectSessionLimits((prev) => {
      const current = prev[projectPath] ?? SESSIONS_PER_PROJECT_INITIAL_VISIBLE;
      if (current === SESSIONS_PER_PROJECT_INITIAL_VISIBLE) return prev;
      const next = { ...prev };
      delete next[projectPath];
      return next;
    });
  }, []);

  const toggleProjectAndRefresh = useCallback(
    (projectPath: string, defaultExpanded: boolean, isExpanded: boolean): void => {
      toggleProjectExpanded(projectPath, defaultExpanded);
      if (isExpanded) return;
      void onRefreshProjectSessions(projectPath);
    },
    [onRefreshProjectSessions, toggleProjectExpanded],
  );

  // refresh local projects from main after IPC mutation
  const refreshProjects = useCallback(async (): Promise<void> => {
    if (!window.kodaxSpace) return;
    const r = await window.kodaxSpace.invoke('project.list', undefined);
    if (r.ok) {
      setProjects(r.data.projects);
    } else {
      // MED-4 fix：原静默 drop → sidebar 跟 main 端不一致；surface error 让用户重试
      pushToast(t('sidebar.refreshFailed'), 'error');
    }
  }, [setProjects, t]);

  // F149: project.list 已按 projects.json 的手动顺序返回（新项目在最上），这里不再重排。
  // 置顶项目进置顶区（按 pinnedIndex），不改主列表 order——取消置顶即回原位。
  // F043: archived 项目从主列表剔出,单独"Archived (N)"分组展示。
  const ordered = useMemo(() => projects.filter(isMainListProject), [projects]);
  const pinnedProjects = useMemo(() => pinnedProjectList(projects), [projects]);
  const archived = useMemo(() => projects.filter((p) => p.archived === true), [projects]);

  // 拖排只移动可见行，隐藏项目留在原槽位；完整顺序写进 projects.json (dev 与打包版共享)。
  const moveProject = useCallback(
    (from: number, to: number): void => {
      const next = moveWithinVisible(projects, isMainListProject, from, to);
      setProjects(next);
      if (!window.kodaxSpace) return;
      const order = next.map((p) => canonProjectRootBrowser(p.path));
      void saveProjectOrder(window.kodaxSpace, order).then((saved) => {
        if (saved) return;
        pushToast(t('sidebar.projectOrderSaveFailed'), 'error');
        void refreshProjects();
      });
    },
    [projects, setProjects, refreshProjects, t],
  );
  const dragSort = useDragSort(ordered.length, moveProject);

  // F149: 置顶 / 取消置顶 / 置顶区拖排都写完整置顶列表 (projects.json 的 pinned)。
  const setPinned = useCallback(
    (pinned: readonly string[]): void => {
      setProjects(withPinnedIndex(projects, pinned));
      if (!window.kodaxSpace) return;
      void savePinnedProjects(window.kodaxSpace, pinned).then((saved) => {
        if (saved) return;
        pushToast(t('sidebar.projectPinSaveFailed'), 'error');
        void refreshProjects();
      });
    },
    [projects, setProjects, refreshProjects, t],
  );
  const pinnedPaths = useMemo(
    () => pinnedProjects.map((p) => canonProjectRootBrowser(p.path)),
    [pinnedProjects],
  );
  const movePinnedProject = useCallback(
    (from: number, to: number): void => {
      const next = [...pinnedPaths];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return;
      next.splice(to, 0, moved);
      setPinned(next);
    },
    [pinnedPaths, setPinned],
  );
  const pinnedDragSort = useDragSort(pinnedProjects.length, movePinnedProject);

  // 按 projectRoot 把 sessions 分组（用 canonProjectRoot 比较，避免 windows 大小写 / trailing
  // slash / 分隔符差异）。reviewer MED-2: 用不可变 spread 而非 push 原地改，遵循项目 immutability 规则。
  const sessionsByProject = useMemo(() => {
    const map = new Map<string, readonly SessionMeta[]>();
    for (const s of sessions) {
      const k = canonProjectRootBrowser(s.projectRoot);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [sessions]);

  // F149: 已归档的任务离开所属项目的列表，集中到底部"已归档"分组（按项目分组）；
  // 已归档项目的列表照常列出它的全部任务。置顶任务只在置顶区（归档会取消置顶）。
  const sessionFlags = useAppStore((s) => s.sessionFlags);
  const projectSessions = useCallback(
    (proj: Project): readonly SessionMeta[] => {
      const all = sessionsByProject.get(canonProjectRootBrowser(proj.path)) ?? [];
      return proj.archived === true
        ? all
        : all.filter((s) => sessionFlags[s.sessionId]?.archivedAt === undefined);
    },
    [sessionsByProject, sessionFlags],
  );
  const archivedTaskGroups = useMemo(
    () =>
      [...pinnedProjects, ...ordered]
        .map((project) => ({
          project,
          sessions: (sessionsByProject.get(canonProjectRootBrowser(project.path)) ?? []).filter(
            (s) =>
              sessionFlags[s.sessionId]?.archivedAt !== undefined &&
              sessionFlags[s.sessionId]?.pinnedAt === undefined,
          ),
        }))
        .filter((group) => group.sessions.length > 0),
    [pinnedProjects, ordered, sessionsByProject, sessionFlags],
  );
  const archivedSessionIds = useMemo(
    () => [
      ...archivedTaskGroups.flatMap((group) => group.sessions.map((s) => s.sessionId)),
      ...archived.flatMap((p) => projectSessions(p).map((s) => s.sessionId)),
    ],
    [archivedTaskGroups, archived, projectSessions],
  );
  const archivedCount =
    archived.length + archivedTaskGroups.reduce((n, group) => n + group.sessions.length, 0);

  // statusFor 闭包：从 statusMap 取，O(1)。给每个 SessionTree 共享同一个 closure。
  // reviewer MED-1: useCallback 让 reference 稳定跟 statusMap 走，避免 statusMap 没变时
  // 每次 ProjectTree 渲染都新建函数让下游 SessionTree 误重渲染。
  const statusFor = useCallback(
    (sid: string): SessionStatus => statusMap[sid] ?? 'idle',
    [statusMap],
  );
  const attentionContext = useMemo<SessionAttentionContext>(
    () => ({
      statusFor,
      isUnread: (sid) => sessionFlags[sid]?.unread === true,
      currentSessionId,
    }),
    [statusFor, sessionFlags, currentSessionId],
  );

  // RenameInput fences Enter + blur so a rename sends exactly one mutation.
  const onRenameCommit = useCallback(
    async (proj: Project, newName: string): Promise<void> => {
      setRenamingPath(null);
      const trimmed = newName.trim();
      if (trimmed.length === 0 || trimmed === proj.name) return; // no-op / unchanged
      if (!window.kodaxSpace) return;
      const r = await invokeWithTimeout(window.kodaxSpace, 'project.recent.rename', {
        path: proj.path,
        name: trimmed,
      });
      if (!r.ok || !r.data.renamed) {
        pushToast(t('sidebar.renameFailed'), 'error');
        return;
      }
      await refreshProjects();
    },
    [refreshProjects, t],
  );

  const renderProject = (
    proj: Project,
    treatAsCurrent: boolean,
    sort?: { readonly index: number; readonly drag: DragSort },
  ): JSX.Element => {
    const defaultExpanded = treatAsCurrent;
    const explicit = proj.path in expandedProjects ? expandedProjects[proj.path] : undefined;
    const isExpanded = explicit !== undefined ? explicit : defaultExpanded;
    const projSessions = projectSessions(proj);
    const isArchivedProject = proj.archived === true;
    const sessionLoadState =
      sessionLoadStateByScope[sessionLoadScopeKey(proj.path, currentSurface)] ??
      (window.kodaxSpace ? 'loading' : 'loaded');
    const isInitialSessionLoad = sessionLoadState === 'loading' && projSessions.length === 0;
    const visibleLimit = projectSessionLimits[proj.path] ?? SESSIONS_PER_PROJECT_INITIAL_VISIBLE;
    const runningCount = projSessions.reduce(
      (acc, s) => (statusMap[s.sessionId] === 'running' ? acc + 1 : acc),
      0,
    );
    // 折叠时项目行汇总"需要你"的 session（待确认 > 出错 > 完成未读），打开后随状态自然消减。
    const attention = isExpanded
      ? null
      : summarizeSessionAttention(
          projSessions.map((s) => s.sessionId),
          attentionContext,
        );
    const isRenaming = renamingPath === proj.path;

    // 项目 row 整行可拖排 (指针拖动,见 useDragSort)。archived 项目不参与排序;重命名中 /
    // 上下文菜单开着时禁拖,避免和输入框选字、菜单交互打架。
    const isCtxMenuOnRow = projCtxMenu?.project.path === proj.path;
    const canDrag = sort !== undefined && !isRenaming && !isCtxMenuOnRow;
    const isDragSource = sort !== undefined && sort.drag.draggingIndex === sort.index;
    return (
      <div
        key={proj.path}
        ref={sort?.drag.itemRef(sort.index)}
        style={sort?.drag.itemStyle(sort.index)}
        className="mb-1"
      >
        <div
          onPointerDown={(e) => {
            if (sort === undefined || !canDrag) return;
            if ((e.target as HTMLElement).closest('[data-drag-ignore]')) return;
            sort.drag.onHandlePointerDown(sort.index, e);
          }}
          className={`group/projectrow w-full text-xs px-2 py-1 rounded flex items-center gap-1.5 ${
            treatAsCurrent
              ? 'text-fg-primary font-semibold'
              : 'text-fg-secondary hover:bg-hover-bg hover:text-fg-primary'
          } ${isDragSource ? DRAG_SOURCE_ROW_CLASS : ''}`}
          onContextMenu={(e) => {
            e.preventDefault();
            (e.target as HTMLElement).closest('button')?.focus();
            setProjCtxMenu({ project: proj, x: e.clientX, y: e.clientY });
          }}
          title={proj.path}
        >
          <button
            type="button"
            onClick={() => toggleProjectAndRefresh(proj.path, defaultExpanded, isExpanded)}
            className={`text-fg-muted flex-shrink-0 ${isArchivedProject ? 'opacity-60' : ''}`}
            aria-label={isExpanded ? t('sidebar.collapseProject') : t('sidebar.expandProject')}
            aria-expanded={isExpanded}
          >
            <Caret open={isExpanded} />
          </button>
          {isRenaming ? (
            <RenameInput
              initial={proj.name}
              ariaLabel={t('menu.project.rename')}
              onCommit={(value) => void onRenameCommit(proj, value)}
              onCancel={() => setRenamingPath(null)}
            />
          ) : (
            <button
              type="button"
              onClick={() => toggleProjectAndRefresh(proj.path, defaultExpanded, isExpanded)}
              className={`flex-1 text-left truncate ${isArchivedProject ? 'opacity-60' : ''}`}
              aria-expanded={isExpanded}
            >
              {proj.name}
            </button>
          )}
          {attention && !isRenaming && <ProjectAttentionBadge summary={attention} />}
          {runningCount > 0 && !isRenaming && (
            <span
              className="text-run text-[11px] flex-shrink-0 font-mono inline-flex items-center gap-1"
              aria-label={t('sidebar.runningCountAria', { count: runningCount })}
              title={t('sidebar.runningCountTitle', { count: runningCount })}
            >
              <span className="sidebar-status-spinner sidebar-status-spinner--mini" aria-hidden />
              {runningCount}
            </span>
          )}
          {isInitialSessionLoad && runningCount === 0 && !attention?.top && !isRenaming && (
            <span
              className="sidebar-session-load-spinner"
              aria-hidden
              title={t('sidebar.loadingSessions')}
            />
          )}
          {/* F149: 已归档项目只有取消归档与移除（移除先确认，红色以防误点）。 */}
          {!isRenaming && isArchivedProject && (
            <ArchivedItemActions
              name={proj.name}
              unarchiveLabel={t('menu.project.unarchive')}
              deleteLabel={t('menu.project.remove')}
              onUnarchive={() =>
                void setProjectArchived(proj, false, t).then((ok) =>
                  ok ? refreshProjects() : undefined,
                )
              }
              onDelete={() =>
                void confirmRemoveProject(proj, t).then((ok) =>
                  ok ? refreshProjects() : undefined,
                )
              }
              className="opacity-0 group-hover/projectrow:opacity-100 group-focus-within/projectrow:opacity-100"
            />
          )}
          {/* F132: Codex-aligned project actions — menu first, then new task. */}
          {!isRenaming && !isArchivedProject && (
            <span
              data-drag-ignore
              className={`flex shrink-0 items-center gap-0.5 transition-opacity ${
                treatAsCurrent
                  ? 'opacity-100'
                  : 'opacity-0 group-hover/projectrow:opacity-100 group-focus-within/projectrow:opacity-100'
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  setProjCtxMenu({ project: proj, x: rect.left - 16, y: rect.bottom + 4 });
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover-bg hover:text-fg-primary"
                aria-label={t('sidebar.projectActions', { name: proj.name })}
                title={t('sidebar.moreActions')}
              >
                <Ellipsis className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // 切到此项目 + 清 current session → BottomBar.ensureSession 在首发时
                  // 懒建一个新 session（跟顶部 New session 按钮同一路径）。
                  startNewConversation(proj.path);
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover-bg hover:text-fg-primary"
                aria-label={`${t('sidebar.newSessionInProject')}: ${proj.name}`}
                title={t('sidebar.newSessionInProject')}
              >
                <SquarePen className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              </button>
            </span>
          )}
        </div>
        {isExpanded && (
          <div className="ml-1">
            {isInitialSessionLoad ? (
              <SessionListSkeleton label={t('sidebar.loadingSessions')} />
            ) : sessionLoadState === 'error' && projSessions.length === 0 ? (
              <div
                className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-fg-muted"
                role="alert"
              >
                <span>{t('sidebar.sessionsLoadFailed')}</span>
                <button
                  type="button"
                  className="rounded px-1 py-0.5 text-fg-secondary hover:bg-hover-bg hover:text-fg-primary"
                  onClick={() => void onRefreshProjectSessions(proj.path)}
                >
                  {t('sidebar.retrySessions')}
                </button>
              </div>
            ) : projSessions.length === 0 ? (
              <div className="text-[11px] text-fg-muted italic px-3 py-1">
                {t('sidebar.noProjectSessions')}
              </div>
            ) : (
              <SessionTree
                sessions={projSessions}
                currentSessionId={currentSessionId}
                onSelect={onSelect}
                scope={{ projectRoot: proj.path }}
                statusFor={statusFor}
                maxVisible={visibleLimit}
                initialVisible={SESSIONS_PER_PROJECT_INITIAL_VISIBLE}
                maxInlineVisible={SESSIONS_PER_PROJECT_INLINE_MAX}
                onExpandMore={() => expandProjectSessionList(proj.path)}
                onShowAll={() => setPickerProject(proj)}
                onCollapseVisible={() => collapseProjectSessionList(proj.path)}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  const isCurrentProject = (proj: Project): boolean =>
    currentProjectPath !== null &&
    canonProjectRootBrowser(proj.path) === canonProjectRootBrowser(currentProjectPath);

  return (
    <div>
      <PinnedArea
        key={currentSurface}
        sessions={sessions}
        loadedIds={loadedIds}
        statusMap={statusMap}
        currentSessionId={currentSessionId}
        onSelect={onSelect}
        projects={
          pinnedProjects.length === 0 ? null : (
            <div
              data-testid="sidebar-pinned-projects"
              onClickCapture={pinnedDragSort.onClickCapture}
            >
              {pinnedProjects.map((proj, index) =>
                renderProject(proj, isCurrentProject(proj), { index, drag: pinnedDragSort }),
              )}
            </div>
          )
        }
      />
      {header}
      <div onClickCapture={dragSort.onClickCapture}>
        {ordered.map((proj, index) =>
          renderProject(proj, isCurrentProject(proj), { index, drag: dragSort }),
        )}
      </div>

      {archivedCount > 0 && (
        <section
          data-testid="sidebar-archived-section"
          aria-label={t('sidebar.archived')}
          className="mt-3 pt-2 border-t border-border-default/40"
        >
          <button
            type="button"
            onClick={() => setArchivedExpanded(!archivedExpanded)}
            className="w-full text-left text-[11px] uppercase tracking-wider text-fg-muted hover:text-fg-secondary px-2 py-1 flex items-center gap-1.5"
            aria-expanded={archivedExpanded}
          >
            <Caret open={archivedExpanded} />
            <span className="flex-1">
              {t('sidebar.archived')} ({archivedCount})
            </span>
            {!archivedExpanded && (
              <ProjectAttentionBadge
                summary={summarizeSessionAttention(archivedSessionIds, attentionContext)}
              />
            )}
          </button>
          {archivedExpanded && (
            <>
              {archivedTaskGroups.map((group) => (
                <div key={group.project.path} className="mb-1">
                  <div
                    className="truncate px-2 py-1 text-[11px] text-fg-muted"
                    title={group.project.path}
                  >
                    {group.project.name}
                  </div>
                  <SessionTree
                    sessions={group.sessions}
                    currentSessionId={currentSessionId}
                    onSelect={onSelect}
                    scope={{ projectRoot: group.project.path }}
                    statusFor={statusFor}
                  />
                </div>
              ))}
              {archived.map((proj) => renderProject(proj, false))}
            </>
          )}
        </section>
      )}

      {projCtxMenu && (
        <ProjectContextMenu
          project={projCtxMenu.project}
          x={projCtxMenu.x}
          y={projCtxMenu.y}
          onClose={() => setProjCtxMenu(null)}
          onTogglePin={() => {
            const target = canonProjectRootBrowser(projCtxMenu.project.path);
            // 新置顶的放在置顶区最上；取消置顶回到主列表原位（order 未动）。
            setPinned(
              pinnedPaths.includes(target)
                ? pinnedPaths.filter((p) => p !== target)
                : [target, ...pinnedPaths],
            );
          }}
          onStartRename={() => {
            setRenamingPath(projCtxMenu.project.path);
            setProjCtxMenu(null);
          }}
          onProjectsChanged={refreshProjects}
        />
      )}

      {pickerProject && (
        <ProjectSessionPicker
          key={`${pickerProject.path}:${currentSurface}`}
          projectName={pickerProject.name}
          projectPath={pickerProject.path}
          surface={currentSurface}
          sessions={projectSessions(pickerProject)}
          includeArchived={pickerProject.archived === true}
          statusFor={statusFor}
          currentSessionId={currentSessionId}
          onSelect={(sid) => {
            useAppStore.getState().setCurrentProject(pickerProject.path);
            onSelect(sid);
          }}
          onClose={() => setPickerProject(null)}
        />
      )}
    </div>
  );
}

function SessionListSkeleton({ label }: { readonly label: string }): JSX.Element {
  const widths = ['72%', '54%', '64%'] as const;
  return (
    <div className="space-y-0.5 px-2 py-1" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {widths.map((width, index) => (
        <div key={width} className="flex h-6 items-center gap-2 rounded px-1.5" aria-hidden="true">
          <span
            className="sidebar-session-skeleton sidebar-session-skeleton--dot"
            style={{ animationDelay: `${index * 90}ms` }}
          />
          <span
            className="sidebar-session-skeleton h-2 rounded-full"
            style={{ width, animationDelay: `${index * 90}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * FEATURE_033: 按 parentSessionId 把 sessions 排成 root → children 树。
 * 渲染顺序：每个 root 紧跟其 descendants（DFS pre-order）；fork child 缩进 + 用 ⑂ 图标。
 *
 * 边界处理：
 *   - parent 已被 delete 了 → orphan：当 root 渲染（仍能选中、不丢）
 *   - cycle 防御：DFS 走过的 id 不再重复进入
 */
interface SessionTreeProps {
  readonly sessions: readonly SessionMeta[];
  readonly currentSessionId: string | null;
  readonly onSelect: (sessionId: string) => void;
  /**
   * F040: 项目树只渲染该项目未置顶的 session；F149 'pinned' = 置顶区，只渲染置顶的。
   * 归档与否由调用方先筛好（项目列表 / 底部"已归档"分组）。
   */
  readonly scope: { readonly projectRoot: string } | 'pinned';
  /** F040: 每行末尾的状态点。idle 不渲染（避免噪音）；缺省整个 sidebar 都不显示状态。 */
  readonly statusFor?: (sessionId: string) => SessionStatus;
  /** 默认显示上限。超过 cap 时下方渲染展开/全部/折叠动作；undefined = 不 cap (legacy). */
  readonly maxVisible?: number;
  readonly initialVisible?: number;
  readonly maxInlineVisible?: number;
  readonly onExpandMore?: () => void;
  readonly onShowAll?: () => void;
  readonly onCollapseVisible?: () => void;
}

// v0.1.5: canonProjectRootBrowser 替换为 schema 包共享 util（F040/F041 review MED-3）。
// 旧实现跟 main 侧 normalize 算法略有差异 (Windows UNC / 多重分隔符) → 现在两边走同一函数。
const IS_WIN = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
function canonProjectRootBrowser(p: string): string {
  return canonProjectRoot(p, IS_WIN);
}

/** 项目主列表显示的项目（已归档的进底部 Archived 分组，置顶的进置顶区）。 */
function isMainListProject(p: Project): boolean {
  return p.archived !== true && p.pinnedIndex === undefined;
}

/** F149: 置顶区的项目，按置顶区顺序。 */
function pinnedProjectList(projects: readonly Project[]): Project[] {
  return projects
    .filter((p) => p.archived !== true && p.pinnedIndex !== undefined)
    .sort((a, b) => (a.pinnedIndex ?? 0) - (b.pinnedIndex ?? 0));
}

/** F149: 按新的置顶列表 (canon 路径) 重写每个项目的 pinnedIndex（乐观更新用）。 */
function withPinnedIndex(projects: readonly Project[], pinned: readonly string[]): Project[] {
  return projects.map(({ pinnedIndex: _old, ...p }) => {
    const index = pinned.indexOf(canonProjectRootBrowser(p.path));
    return index < 0 ? p : { ...p, pinnedIndex: index };
  });
}

// 项目下默认显示 5 个最近 session；每次轻量展开 5 个，最多内联 20 个。
// 再多时走中央 picker 模糊搜 + 选，避免长列表把其它项目挤出视野。
const SESSIONS_PER_PROJECT_INITIAL_VISIBLE = 5;
const SESSIONS_PER_PROJECT_STEP = 5;
const SESSIONS_PER_PROJECT_INLINE_MAX = 20;

/**
 * F149: 置顶区——"置顶"标题下，先是当前工作面的置顶任务（最近置顶的在最上，不受项目加载窗口
 * 与项目展开状态影响），再是置顶项目。两者都没有时整段不渲染。
 * 窗口外的置顶任务按 id 补齐；点开时先切到它的项目（同 "+N more"）。
 */
function PinnedArea({
  sessions,
  loadedIds,
  statusMap,
  currentSessionId,
  onSelect,
  projects,
}: {
  readonly sessions: readonly SessionMeta[];
  readonly loadedIds: readonly string[];
  readonly statusMap: Readonly<Record<string, SessionStatus>>;
  readonly currentSessionId: string | null;
  readonly onSelect: (sessionId: string) => void;
  /** 置顶项目行；null = 没有置顶项目。 */
  readonly projects: ReactNode;
}): JSX.Element | null {
  const { t } = useI18n();
  const currentSurface = useSurfaceStore((s) => s.currentSurface);
  const sessionFlags = useAppStore((s) => s.sessionFlags);
  const pinnedIds = useMemo(
    () => Object.keys(sessionFlags).filter((id) => sessionFlags[id]?.pinnedAt !== undefined),
    [sessionFlags],
  );
  const loaded = useMemo(() => new Set(loadedIds), [loadedIds]);
  const fetched = usePinnedSessionsOutsideWindow(pinnedIds, loaded, currentSurface);
  const outside = useMemo(() => fetched.filter((s) => !loaded.has(s.sessionId)), [fetched, loaded]);
  const candidates = useMemo(() => [...sessions, ...outside], [sessions, outside]);
  const outsideIds = useMemo(() => outside.map((s) => s.sessionId), [outside]);
  const outsideStatus = useSessionStatusMap(outsideIds);
  const statusFor = useCallback(
    (sid: string): SessionStatus => statusMap[sid] ?? outsideStatus[sid] ?? 'idle',
    [statusMap, outsideStatus],
  );
  const hasTasks = candidates.some((s) => sessionFlags[s.sessionId]?.pinnedAt !== undefined);
  if (!hasTasks && projects === null) return null;
  return (
    <section data-testid="sidebar-pinned-area" aria-label={t('sidebar.pinned')}>
      <div className={SIDEBAR_SECTION_HEADING_CLASS}>
        <span>{t('sidebar.pinned')}</span>
      </div>
      {hasTasks && (
        <div data-testid="sidebar-pinned-tasks">
          <SessionTree
            sessions={candidates}
            currentSessionId={currentSessionId}
            onSelect={(sessionId) => {
              const target = outside.find((s) => s.sessionId === sessionId);
              if (target) useAppStore.getState().setCurrentProject(target.projectRoot);
              onSelect(sessionId);
            }}
            scope="pinned"
            statusFor={statusFor}
          />
        </div>
      )}
      {projects}
    </section>
  );
}

function SessionTree({
  sessions,
  currentSessionId,
  onSelect,
  scope,
  statusFor,
  maxVisible,
  initialVisible,
  maxInlineVisible,
  onExpandMore,
  onShowAll,
  onCollapseVisible,
}: SessionTreeProps): JSX.Element {
  const { t } = useI18n();
  const sessionFlags = useAppStore((s) => s.sessionFlags);

  // 每个 SessionTree 只渲染自己项目的 session。
  // F149: 置顶任务只在置顶区出现。scope 对象每次渲染新建，memo 只依赖它的项目路径。
  const scopeRoot = scope === 'pinned' ? null : scope.projectRoot;
  const visible = useMemo(() => {
    const projectCanon = scopeRoot === null ? null : canonProjectRootBrowser(scopeRoot);
    const inScope = (s: SessionMeta): boolean =>
      (sessionFlags[s.sessionId]?.pinnedAt !== undefined) === (projectCanon === null) &&
      (projectCanon === null || canonProjectRootBrowser(s.projectRoot) === projectCanon);
    return sessions.filter(inScope);
  }, [sessions, sessionFlags, scopeRoot]);

  const rendered = useMemo(
    () =>
      scopeRoot === null
        ? sortPinnedSessions(visible, (id) => sessionFlags[id]?.pinnedAt)
        : sortProjectSessions(visible, statusFor),
    [visible, statusFor, scopeRoot, sessionFlags],
  );
  // 右键菜单状态：哪个 session + 屏幕坐标
  const [ctxMenu, setCtxMenu] = useState<{ session: SessionMeta; x: number; y: number } | null>(
    null,
  );
  // 内联 rename：哪个 session 正在编辑（点 Rename / 双击触发）
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);

  // cap visible 行数。当前 Session 优先，其次是正在等待用户处理的 Session，避免关键交互
  // 被默认展示上限藏住；其余行仍保持原有顺序。
  const cappedRendered = useMemo(() => {
    if (maxVisible === undefined || rendered.length <= maxVisible) return rendered;
    return prioritizeAttentionItems(rendered, {
      maxVisible,
      currentId: currentSessionId,
      getId: (session) => session.sessionId,
      needsAttention: (session) =>
        statusFor !== undefined &&
        sessionAttentionKind({
          status: statusFor(session.sessionId),
          unread: sessionFlags[session.sessionId]?.unread === true,
          isCurrent: session.sessionId === currentSessionId,
        }) !== null,
    });
  }, [rendered, maxVisible, currentSessionId, statusFor, sessionFlags]);
  const overflowCount = maxVisible !== undefined ? rendered.length - cappedRendered.length : 0;
  const effectiveInitialVisible = initialVisible ?? maxVisible ?? rendered.length;
  const effectiveMaxInlineVisible = maxInlineVisible ?? maxVisible ?? rendered.length;
  const canExpandInline =
    maxVisible !== undefined &&
    overflowCount > 0 &&
    maxVisible < effectiveMaxInlineVisible &&
    onExpandMore !== undefined;
  const canShowAll =
    maxVisible !== undefined &&
    overflowCount > 0 &&
    maxVisible >= effectiveMaxInlineVisible &&
    onShowAll !== undefined;
  const canCollapse =
    maxVisible !== undefined &&
    maxVisible > effectiveInitialVisible &&
    rendered.length > effectiveInitialVisible &&
    onCollapseVisible !== undefined;
  const showOverflowControls = canExpandInline || canShowAll || canCollapse;

  return (
    <>
      {cappedRendered.map((session) => (
        <SessionRow
          key={session.sessionId}
          session={session}
          isSelected={session.sessionId === currentSessionId}
          flags={sessionFlags[session.sessionId]}
          isRenaming={renamingSessionId === session.sessionId}
          status={statusFor?.(session.sessionId)}
          onSelect={onSelect}
          onContextMenu={(x, y) => setCtxMenu({ session, x, y })}
          onStartRename={() => setRenamingSessionId(session.sessionId)}
          onCancelRename={() => setRenamingSessionId(null)}
        />
      ))}
      {showOverflowControls && (
        <div className="flex items-center gap-3 px-3 py-1 text-xs text-fg-muted">
          {canExpandInline && (
            <button
              type="button"
              onClick={onExpandMore}
              className="hover:text-fg-primary"
              title={t('sidebar.showMore')}
            >
              {t('sidebar.showMore')}
            </button>
          )}
          {canShowAll && (
            <button
              type="button"
              onClick={onShowAll}
              className="hover:text-fg-primary"
              aria-label={t('sidebar.moreSessions.aria', { count: rendered.length })}
              title={t('sidebar.moreSessions.aria', { count: rendered.length })}
            >
              {t('sidebar.showAll')}
            </button>
          )}
          {canCollapse && (
            <button
              type="button"
              onClick={onCollapseVisible}
              className="hover:text-fg-primary"
              title={t('sidebar.showLess')}
            >
              {t('sidebar.showLess')}
            </button>
          )}
        </div>
      )}
      {ctxMenu && (
        <SessionContextMenu
          session={ctxMenu.session}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onStartRename={() => {
            setRenamingSessionId(ctxMenu.session.sessionId);
            setCtxMenu(null);
          }}
        />
      )}
    </>
  );
}

function SessionRow({
  session,
  isSelected,
  flags,
  isRenaming,
  status,
  onSelect,
  onContextMenu,
  onStartRename,
  onCancelRename,
}: {
  session: SessionMeta;
  isSelected: boolean;
  flags: { pinnedAt?: number; archivedAt?: number; unread?: boolean } | undefined;
  isRenaming: boolean;
  /** F040: per-session 状态点。'idle' 不渲染。 */
  status?: SessionStatus;
  onSelect: (id: string) => void;
  onContextMenu: (x: number, y: number) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
}): JSX.Element {
  const { effectiveLocale, t } = useI18n();
  const upsertSession = useAppStore((s) => s.upsertSession);
  // 删除反馈：deleting（IPC 在途）→ dim + spinner + 禁交互；removing（已成功）→ 收起动画。
  // 两者由 lib/deleteSession.ts 流程驱动。
  const deleting = useAppStore((s) => s.deletingSessionIds.has(session.sessionId));
  const removing = useAppStore((s) => s.removingSessionIds.has(session.sessionId));
  const padLeft = '1.6rem';
  const timeLabel = formatSidebarTime(session.lastActivityAt, effectiveLocale);
  const runtimeFallbackLabel =
    session.runtimeMetadataSource === 'current-default-fallback'
      ? t('session.runtimeFallback')
      : null;
  const statusLabel =
    status === 'awaiting'
      ? t('sidebar.status.awaiting')
      : status === 'error'
        ? t('sidebar.status.error')
        : status === 'running'
          ? t('sidebar.status.running')
          : null;

  async function commitRename(value: string): Promise<void> {
    const trimmed = value.trim().slice(0, 256);
    onCancelRename();
    if (trimmed === '' || trimmed === (session.title ?? '')) return;
    if (!window.kodaxSpace) return;
    const r = await invokeWithTimeout(window.kodaxSpace, 'session.setTitle', {
      sessionId: session.sessionId,
      title: trimmed,
    });
    if (r.ok && r.data.ok) upsertSession({ ...session, title: trimmed });
    else pushToast(t('sidebar.renameFailed'), 'error');
  }

  if (isRenaming) {
    return (
      <div
        className="group/sessionrow grid min-h-[1.625rem] grid-cols-[minmax(0,1fr)] items-center rounded px-2 py-1 text-xs bg-surface-3 text-fg-primary"
        style={{ paddingLeft: padLeft }}
      >
        <RenameInput
          initial={session.title ?? ''}
          onCommit={(v) => void commitRename(v)}
          onCancel={onCancelRename}
        />
      </div>
    );
  }

  return (
    // 外层：收起动画容器（removingSessionIds 驱动 grid-rows 1fr→0fr）；
    // 内层 overflow-hidden 配合 0fr 裁切。见 lib/deleteSession.ts。
    <div
      className={`grid ${ROW_COLLAPSE_CLASS} ${
        removing ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]'
      }`}
    >
      <div className="group/sessionitem relative min-h-0 overflow-hidden">
        <button
          type="button"
          data-testid="sidebar-session-row"
          data-session-id={session.sessionId}
          onClick={() => {
            if (!deleting) onSelect(session.sessionId);
          }}
          onDoubleClick={onStartRename}
          onContextMenu={(e) => {
            e.preventDefault();
            e.currentTarget.focus();
            onContextMenu(e.clientX, e.clientY);
          }}
          aria-busy={deleting}
          aria-current={isSelected ? 'page' : undefined}
          className={`group/sessionrow w-full min-w-0 text-left text-xs px-2 py-1 rounded grid grid-cols-[minmax(0,1fr)_4.25rem] items-center gap-2 min-h-[1.625rem] transition-opacity duration-150 ${
            deleting
              ? 'opacity-40 pointer-events-none'
              : flags?.archivedAt !== undefined
                ? 'opacity-60'
                : ''
          } ${
            isSelected
              ? 'bg-surface-3 text-fg-primary'
              : 'text-fg-secondary hover:bg-hover-bg hover:text-fg-primary'
          }`}
          style={{ paddingLeft: padLeft }}
          title={`${session.title?.trim() || t('sidebar.session.untitled')} - ${timeLabel}${statusLabel ? ` - ${statusLabel}` : ''}${runtimeFallbackLabel ? ` - ${runtimeFallbackLabel}` : ''} (${t('sidebar.session.renameHint')})`}
        >
          <span className="min-w-0 truncate">
            {session.title?.trim() || t('sidebar.session.untitled')}
          </span>
          <span
            className={`sidebar-session-meta flex min-w-0 items-center justify-end gap-1.5 text-xs text-fg-muted ${
              deleting
                ? ''
                : 'group-hover/sessionitem:invisible group-focus-within/sessionitem:invisible'
            }`}
          >
            {deleting ? (
              <span
                className="sidebar-status-spinner sidebar-status-spinner--mini"
                aria-hidden
                title={t('session.deleting')}
              />
            ) : status === 'running' ? (
              <span
                className="sidebar-status-spinner"
                aria-hidden
                title={statusLabel ?? undefined}
              />
            ) : (
              <>
                {flags?.unread && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_0_2px_rgb(var(--ok)/0.12)]"
                    aria-label={t('sidebar.status.unread')}
                    title={t('sidebar.status.unread')}
                  />
                )}
                {status === 'awaiting' && statusLabel && (
                  <SessionAwaitingIndicator label={statusLabel} />
                )}
                {status === 'error' && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-danger"
                    aria-label={statusLabel ?? undefined}
                    title={statusLabel ?? undefined}
                  />
                )}
                {flags?.pinnedAt !== undefined && (
                  <span aria-label={t('sidebar.status.pinned')} title={t('sidebar.status.pinned')}>
                    <Pin className="h-3 w-3 text-fg-muted" strokeWidth={1.9} aria-hidden />
                  </span>
                )}
                <span className="tnum min-w-[2.15rem] text-right leading-none">{timeLabel}</span>
              </>
            )}
          </span>
        </button>
        {!deleting && <SessionRowActions session={session} flags={flags} />}
      </div>
    </div>
  );
}

/** F149: 任务行悬停按钮——置顶 / 归档；已归档的是取消归档 / 删除（先确认）。不切换当前任务。 */
function SessionRowActions({
  session,
  flags,
}: {
  session: SessionMeta;
  flags: { pinnedAt?: number; archivedAt?: number } | undefined;
}): JSX.Element {
  const { t } = useI18n();
  const title = session.title?.trim() || t('sidebar.session.untitled');
  const archived = flags?.archivedAt !== undefined;
  const pinned = flags?.pinnedAt !== undefined;
  const toggle = (flag: 'pinned' | 'archived'): void => {
    void toggleSessionFlagPersisted(session.sessionId, flag, t('sidebar.sessionFlagSaveFailed'));
  };
  const hoverClass =
    'absolute inset-y-0 right-1 opacity-0 group-hover/sessionitem:opacity-100 group-focus-within/sessionitem:opacity-100';
  if (archived) {
    return (
      <ArchivedItemActions
        name={title}
        unarchiveLabel={t('menu.session.unarchive')}
        deleteLabel={t('menu.session.delete')}
        onUnarchive={() => toggle('archived')}
        onDelete={() => void confirmDeleteSession(session.sessionId, title, t)}
        className={hoverClass}
      />
    );
  }
  const archiveLabel = t('menu.session.archive');
  const pinLabel = pinned ? t('menu.session.unpin') : t('menu.session.pin');
  return (
    <div className={`${hoverClass} flex items-center gap-0.5`}>
      <button
        type="button"
        className={ROW_ACTION_BUTTON_CLASS}
        aria-label={`${pinLabel}: ${title}`}
        title={pinLabel}
        onClick={() => toggle('pinned')}
      >
        {pinned ? (
          <PinOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        ) : (
          <Pin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        )}
      </button>
      <button
        type="button"
        className={ROW_ACTION_BUTTON_CLASS}
        aria-label={`${archiveLabel}: ${title}`}
        title={archiveLabel}
        onClick={() => toggle('archived')}
      >
        <Archive className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

const ROW_ACTION_BUTTON_CLASS =
  'inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover-bg hover:text-fg-primary';

/**
 * F149: 已归档任务 / 项目的悬停按钮——取消归档 + 删除（项目为"移除"）。
 * 删除常驻红色垃圾桶，点击后先弹确认，避免误删。
 */
function ArchivedItemActions({
  name,
  unarchiveLabel,
  deleteLabel,
  onUnarchive,
  onDelete,
  className,
}: {
  readonly name: string;
  readonly unarchiveLabel: string;
  readonly deleteLabel: string;
  readonly onUnarchive: () => void;
  readonly onDelete: () => void;
  readonly className: string;
}): JSX.Element {
  return (
    <span data-drag-ignore className={`flex shrink-0 items-center gap-0.5 ${className}`}>
      <button
        type="button"
        className={ROW_ACTION_BUTTON_CLASS}
        aria-label={`${unarchiveLabel}: ${name}`}
        title={unarchiveLabel}
        onClick={(e) => {
          e.stopPropagation();
          onUnarchive();
        }}
      >
        <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-danger hover:bg-danger/10"
        aria-label={`${deleteLabel}: ${name}`}
        title={deleteLabel}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      </button>
    </span>
  );
}

function formatSidebarTime(timestamp: number, locale: SupportedLocaleT): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const isZh = locale === 'zh-CN';
  const min = Math.max(1, Math.floor(diff / 60_000));
  if (diff < 60_000) return isZh ? '刚刚' : 'now';
  if (min < 60) return isZh ? `${min} 分` : `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return isZh ? `${hr} 小时` : `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return isZh ? `${day} 天` : `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return isZh ? `${wk} 周` : `${wk}w`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return isZh ? `${mo} 个月` : `${mo}mo`;
  const yr = Math.floor(day / 365);
  return isZh ? `${yr} 年` : `${yr}y`;
}

/** Inline rename input — Enter / blur save; Escape cancels. */
function RenameInput({
  initial,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  initial: string;
  ariaLabel?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const commit = (): void => {
    if (finished.current) return;
    finished.current = true;
    onCommit(value);
  };
  return (
    <input
      type="text"
      value={value}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finished.current = true;
          onCancel();
        }
      }}
      onBlur={commit}
      onFocus={(e) => e.currentTarget.select()}
      className="flex-1 bg-transparent text-fg-primary text-xs outline-none border-b border-border-strong focus:border-warn px-0.5 -mx-0.5"
      placeholder={t('sidebar.session.renamePlaceholder')}
      maxLength={256}
      aria-label={ariaLabel ?? t('sidebar.session.renameAria')}
    />
  );
}

// F017 Running peers panel — 列其他 KodaX 进程当前活动的 session。
//   - 数据源：SDK listRunningSessions() 通过 session.listRunning IPC
//   - 轮询：10s 一次（cheap — 走 instance-state 文件读，不开 socket）
//   - 只允许打开 renderer 权威 session 列表中已经存在的 session；未知 peer 只给解释提示，
//     避免把孤立 id 写入 currentSessionId 后进入空白会话
//   - peers 为空时 panel 不渲染（不占侧栏空间）
function RunningPeersPanel(): JSX.Element | null {
  const { t } = useI18n();
  const [peers, setPeers] = useState<readonly RunningSessionInfoT[]>(EMPTY_PEERS);
  const sessions = useAppStore((s) => s.sessions);
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const knownSessionIds = useMemo(
    () => new Set(sessions.map((session) => session.sessionId)),
    [sessions],
  );

  useEffect(() => {
    let cancelled = false;
    async function refresh(force = false): Promise<void> {
      if (!force && (document.hidden || !document.hasFocus())) return;
      if (!window.kodaxSpace) return;
      const r = await window.kodaxSpace.invoke('session.listRunning', undefined);
      if (cancelled) return;
      if (r.ok) setPeers(r.data.peers);
    }
    void refresh(true);
    const interval = window.setInterval(() => void refresh(), 10_000);
    // window focus 也触发一次刷新——切回 Space 立刻看到新 peer 状态
    function onFocus(): void {
      void refresh(true);
    }
    function onVisibility(): void {
      if (document.visibilityState === 'visible') void refresh(true);
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (peers.length === 0) return null;

  return (
    <div className="border-b border-border-default px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-wider text-fg-muted mb-1 px-1 flex items-center gap-1.5">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-ok" />
        <span>{t('sidebar.runningPeers.count', { count: peers.length })}</span>
      </div>
      <div className="mb-1 px-1 text-[10px] leading-4 text-fg-faint">
        {t('sidebar.runningPeers.hint')}
      </div>
      {peers.map((p) => {
        const cwdName = (p.cwd.split(/[\\/]/).filter(Boolean).pop() ?? p.cwd).slice(0, 32);
        const ageSec = Math.max(0, Math.floor((Date.now() - p.startedAt) / 1000));
        const ageLabel =
          ageSec < 60
            ? `${ageSec}s`
            : ageSec < 3600
              ? `${Math.floor(ageSec / 60)}m`
              : `${Math.floor(ageSec / 3600)}h`;
        const action = runningPeerAction(p.sessionId, currentSessionId, knownSessionIds);
        return (
          <button
            key={`${p.pid}-${p.sessionId ?? 'bootstrapping'}`}
            type="button"
            onClick={() => {
              if (action === 'open' && p.sessionId) {
                setCurrentSession(p.sessionId);
                return;
              }
              if (action === 'explain') {
                pushToast(t('sidebar.runningPeers.continueInPeer'), 'info', 5000);
              }
            }}
            disabled={action === 'none'}
            className={[
              'w-full text-left text-xs px-1.5 py-1 rounded flex items-center gap-1.5',
              action !== 'none'
                ? 'hover:bg-hover-bg text-fg-secondary cursor-pointer'
                : 'text-fg-muted cursor-default',
            ].join(' ')}
            title={
              action === 'open' && p.sessionId
                ? t('sidebar.runningPeers.openTitle', {
                    pid: p.pid,
                    sessionId: p.sessionId,
                    cwd: p.cwd,
                  })
                : t('sidebar.runningPeers.instanceTitle', {
                    pid: p.pid,
                    cwd: p.cwd,
                  })
            }
          >
            <Monitor size={12} aria-hidden className="flex-shrink-0 text-fg-faint" />
            <span className="truncate flex-1">{cwdName}</span>
            <span className="text-[11px] text-fg-muted font-mono flex-shrink-0">{ageLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

const EMPTY_PEERS: readonly RunningSessionInfoT[] = [];

// 置顶区与 Projects 的标题行。在滚动区内（px-1.5），px-2.5 与原来区外的 px-4 对齐。
const SIDEBAR_SECTION_HEADING_CLASS =
  'px-2.5 pt-4 pb-2 text-xs text-fg-muted flex justify-between items-center';

function RecentsHeader(): JSX.Element {
  const { t } = useI18n();
  return (
    <div className={SIDEBAR_SECTION_HEADING_CLASS}>
      {/* F043 v0.1.9: "Projects" — 项目折叠树。已归档的任务与项目在底部"已归档"分组。 */}
      <span>{t('sidebar.projects')}</span>
    </div>
  );
}

function FutureFeaturesDisclosure(): JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const futureLabels = [t('sidebar.scheduled'), t('sidebar.customize'), t('sidebar.more')].join(
    ' · ',
  );

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full min-w-0 rounded px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-hover-bg hover:text-fg-primary flex items-center gap-2"
        title={`${t('sidebar.moreFeatures')} — ${t('sidebar.comingSoon')}`}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="min-w-0 truncate">{t('sidebar.moreFeatures')}</span>
        <span className="ml-auto shrink-0 rounded border border-border-default px-1.5 py-0.5 text-[11px] leading-none text-fg-muted">
          {t('sidebar.comingSoon')}
        </span>
      </button>
      {open && (
        <div className="px-7 pb-1.5 pt-0.5 text-[11px] leading-5 text-fg-muted">{futureLabels}</div>
      )}
    </div>
  );
}
