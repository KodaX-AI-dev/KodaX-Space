// ChipBar — F011-revised (alpha.1) + F015 (v0.1.2)
//
// 输入框上方 working-context 行：
//   📍 Local · 📁 KodaX-Space · 🌿 main · 🧠 Repointel · ☑ worktree
//
// 每个 chip 可点开 dropdown — 对齐 Claude Code New session 三张截图：
//   - Local chip → Local ✓ + ⚙ (打开 Settings popover 改默认 workspace)
//   - Project chip → Recent + Open folder...
//   - Branch chip → branches list (alpha.1 占位, v0.1.x 接 git)
//   - Repointel chip (F015) → 当前 mode (auto/oss/premium-*) + 最近 traces 列表

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Folder, GitBranch, Check, Settings, Lock } from 'lucide-react';
import type { RepointelStatusOutput } from '@kodax-space/space-ipc-schema';
import { isLicenseActive } from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../store/appStore.js';
import { useSurfaceStore } from '../store/surface.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { SettingsModal } from '../features/settings/SettingsModal.js';
import { projectShellChrome } from './shellChromeProjection.js';

export function ChipBar(): JSX.Element | null {
  const projectPath = useAppStore((s) => s.currentProjectPath);
  const currentSurface = useSurfaceStore((s) => s.currentSurface);

  if (!projectPath) return null;
  const projectName = projectPath.split(/[\\/]/).filter(Boolean).pop() ?? projectPath;
  const shellChrome = projectShellChrome(currentSurface);

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-fg-secondary">
      {shellChrome.showLocalEnvironment && <LocalChip />}
      {shellChrome.showProjectSwitcher ? (
        <ProjectChip projectName={projectName} projectPath={projectPath} />
      ) : (
        <ProjectContext projectName={projectName} projectPath={projectPath} />
      )}
      {shellChrome.showPlaceholderBranch && <BranchChip />}
      {shellChrome.showRepositoryIntelligence && <RepointelChip projectPath={projectPath} />}
    </div>
  );
}

/** Read-only fallback for surfaces without a project switcher. */
function ProjectContext({
  projectName,
  projectPath,
}: {
  readonly projectName: string;
  readonly projectPath: string;
}): JSX.Element {
  return (
    <span
      className="inline-flex max-w-[200px] items-center gap-1 px-1 text-fg-muted"
      title={projectPath}
    >
      <Folder className="h-3 w-3" strokeWidth={2} aria-hidden />
      <span className="truncate">{projectName}</span>
    </span>
  );
}

/** Local chip — 当前 Local execution + ⚙ 改默认 workspace。 */
function LocalChip(): JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 border border-border-default hover:bg-hover-bg"
        title={t('chip.executionLocation')}
      >
        <MapPin className="w-3 h-3 text-fg-muted" strokeWidth={2} aria-hidden />
        <span>{t('chip.local')}</span>
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1 w-48 bg-surface-4 border border-border-default rounded-lg shadow-xl py-1 z-50">
          <div className="px-3 py-1.5 hover:bg-hover-bg flex items-center gap-2 text-xs text-fg-primary">
            <span>{t('chip.local')}</span>
            <Check className="w-3.5 h-3.5 text-ok ml-auto" strokeWidth={2.5} aria-hidden />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSettingsOpen(true);
                setOpen(false);
              }}
              className="text-fg-muted hover:text-fg-primary ml-1 inline-flex items-center"
              title={t('chip.changeWorkspace')}
              aria-label={t('chip.openSettings')}
            >
              <Settings className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}
      {settingsOpen && (
        <SettingsModal initialTab="preferences" onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

/** Project chip — Recent + Open folder. 截图 2 同款。 */
function ProjectChip({
  projectName,
  projectPath,
}: {
  projectName: string;
  projectPath: string;
}): JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const projects = useAppStore((s) => s.projects);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function pickPath(path: string): Promise<void> {
    if (!window.kodaxSpace) return;
    setCurrentProject(path);
    await window.kodaxSpace.invoke('project.recent.add', { path });
    const listR = await window.kodaxSpace.invoke('project.list', undefined);
    if (listR.ok) useAppStore.getState().setProjects(listR.data.projects);
    setOpen(false);
  }

  async function openDialog(): Promise<void> {
    if (!window.kodaxSpace) return;
    const r = await window.kodaxSpace.invoke('project.openDialog', undefined);
    if (r.ok && r.data.path !== null) {
      await pickPath(r.data.path);
    } else {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 border border-border-default hover:bg-hover-bg max-w-[200px]"
        title={projectPath}
      >
        <Folder className="w-3 h-3 text-fg-muted" strokeWidth={2} aria-hidden />
        <span className="truncate">{projectName}</span>
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1 w-56 bg-surface-4 border border-border-default rounded-lg shadow-xl py-1 z-50">
          <div className="px-3 py-1 text-fg-muted text-[11px] uppercase tracking-wider">
            {t('chip.recent')}
          </div>
          {projects.length === 0 ? (
            <div className="px-3 py-1 text-[11px] text-fg-muted">{t('chip.noRecentProjects')}</div>
          ) : (
            projects.slice(0, 8).map((p) => {
              const isCurrent = p.path === projectPath;
              return (
                <button
                  key={p.path}
                  type="button"
                  onClick={() => void pickPath(p.path)}
                  className={`w-full text-left px-3 py-1 hover:bg-hover-bg flex items-center gap-2 text-xs ${
                    isCurrent ? 'text-fg-primary' : 'text-fg-secondary'
                  }`}
                  title={p.path}
                >
                  <span className="truncate flex-1">{p.name}</span>
                  {isCurrent && (
                    <Check className="w-3.5 h-3.5 text-ok" strokeWidth={2.5} aria-hidden />
                  )}
                </button>
              );
            })
          )}
          <div className="border-t border-border-default my-1" />
          <button
            type="button"
            onClick={() => void openDialog()}
            className="w-full text-left px-3 py-1 hover:bg-hover-bg text-xs text-fg-primary"
          >
            {t('chip.openFolder')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Branch chip — alpha.1 占位；v0.1.x 接 git。 */
function BranchChip(): JSX.Element {
  const { t } = useI18n();
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 border border-border-default"
      title={t('chip.branchDetection')}
    >
      <GitBranch className="w-3 h-3 text-fg-muted" strokeWidth={2} aria-hidden />
      <span className="truncate max-w-[120px]">main</span>
    </span>
  );
}

// ---- F015 Repointel chip ----

interface RepointelTraceSlim {
  readonly kind: string;
  readonly mode?: string;
  readonly engine?: string;
  readonly bridge?: string;
  readonly status?: string;
  readonly latencyMs?: number;
  readonly cacheHit?: boolean;
}

const REPOINTEL_MODE_LABEL: Record<string, string> = {
  // KodaX 0.7.57+ effective repo-intel modes.
  off: 'off',
  light: 'Light',
  full: 'Full',
  auto: 'auto',
  // Legacy values (pre-0.7.57) kept for back-compat with older SDK traces.
  oss: 'OSS',
  'premium-shared': 'Premium (shared)',
  'premium-native': 'Premium',
};

/**
 * Repointel chip —— pill 反映 repo-intelligence 的**就绪态 + 本 session 活动**。
 *
 * 两个数据源:
 *  1. live `repointel_trace` 事件(SDK onRepoIntelligenceTrace → push → events buffer):
 *     本 session 真跑过 repo-intel 时的"活动"状态,pill 显示该 trace 的 mode。
 *  2. `repointel.status`(probe:false)的 `effectiveEngine`:引擎的"就绪"状态。
 *
 * 关键设计:没有 live trace 时,pill **不再**显示误导性的 "idle",而是回落到引擎就绪态
 * (entitled + effective=full/light → "Full"/"Light")。否则一个满血就绪、已授权的
 * repo-intel,只要当前 session 没恰好调用过它(如纯 bash/git 的 workflow 会话),就会被
 * 错画成 idle/坏了。未授权 → RepointelLockedChip。auto-warm 由 composer 首次输入触发(见
 * BottomBar),此处只负责展示。
 */
function RepointelChip({ projectPath }: { readonly projectPath: string }): JSX.Element | null {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RepointelStatusOutput | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const licenseStatus = useAppStore((s) => s.licenseStatus);
  // 订阅原始 events array，避免 selector 返回新数组引用造成 zustand re-render 风暴
  const events = useAppStore((s) =>
    currentSessionId ? s.eventsBySession[currentSessionId] : undefined,
  );
  // useMemo 派生最近 3 条 trace —— 空时复用 EMPTY_TRACES 常引用
  const latestTraces = useMemo<readonly RepointelTraceSlim[]>(() => {
    if (!events || events.length === 0) return EMPTY_TRACES;
    const collected: RepointelTraceSlim[] = [];
    for (let i = events.length - 1; i >= 0 && collected.length < 3; i--) {
      const ev = events[i] as unknown as { kind: string; event?: RepointelTraceSlim };
      if (ev.kind === 'repointel_trace' && ev.event) collected.push(ev.event);
    }
    return collected.length === 0 ? EMPTY_TRACES : collected;
  }, [events]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  // Fetch repo-intel status for THIS project with probe:false (cheap, config-only — no
  // semantic-worker spawn) so the pill can reflect ENGINE READINESS even before any live
  // trace arrives. Refetch on project change; status is kept across the fetch (not reset
  // to null) to avoid an idle→ready flicker. Also used by the popover.
  useEffect(() => {
    if (!window.kodaxSpace) return;
    let cancelled = false;
    setStatusErr(null);
    void window.kodaxSpace
      .invoke('repointel.status', { projectRoot: projectPath, probe: false })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setStatus(result.data);
        else setStatusErr(result.error?.message ?? t('chip.repointel.statusFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, t]);

  if (!currentSessionId) return null;

  // Repo-intelligence is a licensed capability. License known & not active → locked
  // pill + upsell (the capability itself is forced off in real-session's context).
  // While license state is still loading (null), fall through to the normal pill so
  // licensed users don't see a lock flash on boot.
  if (licenseStatus !== null && !isLicenseActive(licenseStatus)) {
    return <RepointelLockedChip />;
  }

  // Pill state: a live trace (repo-intel actually ran THIS session) wins and shows its
  // mode as "active"; otherwise fall back to engine READINESS from status (Full/Light when
  // enabled + healthy) so a licensed, ready repo-intel isn't shown as a misleading "idle"
  // just because this session hasn't invoked it yet. Only genuinely off/unknown → 'idle'.
  const latest = latestTraces[0];
  const liveMode = latest?.mode;
  const readyMode =
    status && (status.effectiveEngine === 'full' || status.effectiveEngine === 'light')
      ? status.effectiveEngine
      : undefined;
  const mode = liveMode ?? readyMode;
  const active = liveMode !== undefined;
  const modeLabel = mode ? (REPOINTEL_MODE_LABEL[mode] ?? mode) : 'idle';
  const dotColor =
    mode === undefined || mode === 'off'
      ? 'bg-fg-muted'
      : mode === 'full' || mode === 'premium-shared' || mode === 'premium-native'
        ? 'bg-info'
        : mode === 'light' || mode === 'oss'
          ? 'bg-ok'
          : 'bg-warn';
  const titleStatus = active
    ? latest?.status
      ? t('chip.repointel.status', { status: latest.status })
      : t('chip.repointel.active')
    : readyMode
      ? t('chip.repointel.ready')
      : '';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 border border-border-default hover:bg-hover-bg"
        title={t('chip.repointel.title', { mode: modeLabel, status: titleStatus })}
      >
        <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className="font-mono">Repointel</span>
        <span className="text-fg-muted">·</span>
        <span className="font-mono">{modeLabel}</span>
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-72 bg-surface-4 border border-border-default rounded-lg shadow-xl py-1 z-50">
          <div className="px-3 py-1 text-fg-muted text-[11px] uppercase tracking-wider flex justify-between">
            <span>Repointel · {modeLabel}</span>
            <span className="text-fg-faint normal-case tracking-normal">
              {t('chip.repointel.latestTraces')}
            </span>
          </div>
          <div className="border-t border-border-default/60 px-3 py-1.5 text-[11px] text-fg-muted">
            {status ? (
              <div className="space-y-0.5">
                <div className="font-mono">
                  {t('chip.repointel.gitStatus', {
                    git: status.gitRoot
                      ? t('chip.repointel.gitDetected')
                      : t('chip.repointel.gitNotDetected'),
                    warm: status.warmSupported
                      ? t('chip.repointel.warmSupported')
                      : t('chip.repointel.warmUnsupported'),
                  })}
                </div>
                <div className="truncate" title={status.warmReason}>
                  {status.warmReason}
                </div>
              </div>
            ) : statusErr ? (
              <span className="text-danger">{statusErr}</span>
            ) : (
              <span>{t('chip.repointel.loadingStatus')}</span>
            )}
          </div>
          {latestTraces.length === 0 ? (
            <div className="px-3 py-1.5 text-[11px] text-fg-muted italic">
              {t('chip.repointel.noTraces')}
            </div>
          ) : (
            latestTraces.map((t, i) => (
              <div
                key={i}
                className="px-3 py-1 border-t border-border-default/60 text-[11px] font-mono"
              >
                <div className="flex justify-between gap-2">
                  <span className="text-fg-secondary truncate">{t.kind}</span>
                  {t.latencyMs !== undefined && (
                    <span className="text-fg-muted flex-shrink-0">{t.latencyMs}ms</span>
                  )}
                </div>
                {(t.status || t.engine || t.bridge !== undefined) && (
                  <div className="text-fg-muted truncate">
                    {[
                      t.status,
                      t.engine,
                      t.bridge ? `bridge:${t.bridge}` : null,
                      t.cacheHit ? 'cache-hit' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Locked variant — repo-intelligence is a licensed capability and no active license is
 * present. Visible + openable (product intent: "UI opens and prompts"): clicking shows
 * an upsell popover that deep-links into Settings → License. The capability itself is
 * separately forced off in real-session (repoIntelligenceMode:'off'); this is just the
 * visible signal + activation path.
 */
function RepointelLockedChip(): JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 border border-border-default hover:bg-hover-bg text-fg-muted"
        title={t('repointel.locked.tooltip')}
      >
        <Lock className="w-3 h-3" strokeWidth={2} aria-hidden />
        <span className="font-mono">Repointel</span>
        <span className="text-fg-muted">·</span>
        <span className="font-mono">{t('repointel.locked.pill')}</span>
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-72 bg-surface-4 border border-border-default rounded-lg shadow-xl p-3 z-50 space-y-1.5">
          <div className="text-[11px] text-fg-primary font-medium">
            {t('repointel.locked.title')}
          </div>
          <div className="text-[11px] text-fg-muted leading-relaxed">
            {t('repointel.locked.body')}
          </div>
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(true);
              setOpen(false);
            }}
            className="mt-1 w-full px-2 py-1 rounded bg-surface-2 border border-border-default hover:bg-hover-bg text-info text-[11px] font-medium"
          >
            {t('repointel.locked.activate')}
          </button>
        </div>
      )}
      {settingsOpen && (
        <SettingsModal initialTab="license" onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

// 稳定空数组：让 selector 没 trace 时返同一引用，避免 zustand 误判 re-render
const EMPTY_TRACES: readonly RepointelTraceSlim[] = [];
