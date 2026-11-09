import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Code2, LockKeyhole, Sparkles, SquareTerminal } from 'lucide-react';
import type { ChannelInput, ChannelOutput } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../i18n/I18nProvider.js';
import { useAppStore } from '../store/appStore.js';
import { useSurfaceStore } from '../store/surface.js';
import { pushToast } from '../store/toastStore.js';
import { useIsStreaming } from './ActivitySpinner.js';

/** Work mode is a shared Host setting, independent of AMA and permissions. */
interface WorkModeControlProps {
  readonly ensureSession: () => Promise<string | null>;
  readonly disabled: boolean;
  readonly onBusyChange: (busy: boolean) => void;
}

export function AgentModeSelector(props: WorkModeControlProps): JSX.Element {
  const { t } = useI18n();
  const sessionId = useAppStore((s) => s.currentSessionId);
  const runtimeId = useAppStore((s) => s.runtimeConnection.runtimeId);
  const project = useAppStore((s) => s.currentProjectPath);
  const provider = useAppStore(
    (s) => s.sessions.find((session) => session.sessionId === sessionId)?.provider,
  );
  if (provider === 'mock')
    return (
      <span className="text-xs text-fg-muted" title={t('workMode.mock')}>
        Mock
      </span>
    );
  return (
    <WorkModeSelector
      key={project + ':' + sessionId + ':' + runtimeId}
      sessionId={sessionId}
      {...props}
    />
  );
}

/** Partner's intended Agent mode must never masquerade as current Host state. */
export function PartnerWorkModeIndicator(): JSX.Element {
  const sessionId = useAppStore((state) => state.currentSessionId);
  const runtimeId = useAppStore((state) => state.runtimeConnection.runtimeId);
  const revision = useAppStore((state) =>
    sessionId ? state.liveProjectionBySession[sessionId]?.settings?.revision : undefined,
  );
  return (
    <PartnerWorkModeFact
      key={JSON.stringify([sessionId, runtimeId, revision])}
      sessionId={sessionId}
    />
  );
}

function PartnerWorkModeFact({ sessionId }: { sessionId: string | null }): JSX.Element {
  const { t } = useI18n();
  const { state, connection } = useWorkModeState(sessionId);
  const actual = connection === 'ready' ? state?.workMode : undefined;
  const label = !sessionId
    ? t('workMode.partnerDefault')
    : actual === 'agent'
      ? 'Agent'
      : actual
        ? t('workMode.partnerPending', { mode: actual })
        : t('workMode.unknown');
  return (
    <span data-testid="partner-work-mode" className="text-xs text-fg-secondary">
      {label}
    </span>
  );
}

function useWorkModeState(sessionId: string | null) {
  const active = useIsStreaming();
  const admittedRunId = useAppStore((s) =>
    sessionId
      ? (s.liveProjectionBySession[sessionId]?.activeRun?.runId ??
        s.runtimeProfile?.sessions.find((session) => session.sessionId === sessionId)?.activeRun
          ?.runId)
      : undefined,
  );
  const revision = useAppStore((s) =>
    sessionId ? s.liveProjectionBySession[sessionId]?.settings?.revision : undefined,
  );
  const connection = useAppStore((s) => s.runtimeConnection.state);
  const [state, setState] = useState<ChannelOutput<'session.workMode'>>();
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!sessionId || !window.kodaxSpace || connection !== 'ready') return;
    let disposed = false;
    void window.kodaxSpace
      .invoke('session.workMode', { sessionId })
      .then((result) => {
        if (disposed) return;
        // A reconcile read can resolve after a newer saved mode; never move backwards.
        if (result.ok)
          setState((current) =>
            current && current.revision > result.data.revision ? current : result.data,
          );
        else {
          setState(undefined);
          pushToast(result.error.message, 'warning');
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setState(undefined);
          pushToast(String(error), 'warning');
        }
      });
    return () => {
      disposed = true;
    };
  }, [sessionId, revision, connection, refresh, active, admittedRunId]);

  return { state, setState, setRefresh, connection };
}

function useWorkModeControl(sessionId: string | null, props: WorkModeControlProps) {
  const { state, setState, setRefresh, connection } = useWorkModeState(sessionId);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function change(workMode: ChannelInput<'session.setWorkMode'>['workMode']): Promise<void> {
    if (pending.current || props.disabled || !window.kodaxSpace) return;
    const origin = useAppStore.getState();
    pending.current = true;
    setBusy(true);
    props.onBusyChange(true);
    try {
      const target = sessionId ?? (await props.ensureSession());
      if (!target) return;
      const stillSelected = () => {
        const latest = useAppStore.getState();
        return (
          latest.currentSessionId === target &&
          latest.currentProjectPath === origin.currentProjectPath &&
          latest.runtimeConnection.runtimeId === origin.runtimeConnection.runtimeId &&
          useSurfaceStore.getState().currentSurface === 'code'
        );
      };
      if (!stillSelected()) return;
      const current =
        state ??
        (await window.kodaxSpace.invoke('session.workMode', { sessionId: target }).then((reply) => {
          if (!reply.ok) throw new Error(reply.error.message);
          return reply.data;
        }));
      if (!stillSelected() || !current) return;
      if (!current.supported) throw new Error('Upgrade the Host to choose a work mode.');
      if (current.locked)
        throw new Error('Work mode is fixed. Start a new session to choose another mode.');
      const result = await window.kodaxSpace!.invoke('session.setWorkMode', {
        sessionId: target,
        workMode,
        expectedRevision: current.revision,
      });
      if (!result.ok) {
        pushToast(result.error.message, 'warning');
        setRefresh((value) => value + 1);
      } else if (stillSelected()) {
        setState(result.data);
        const saved = await window.kodaxSpace.invoke('settings.setRuntimeDefaults', {
          runtimeDefaults: { workMode: result.data.workMode },
        });
        if (!saved.ok) throw new Error(saved.error.message);
        useAppStore.getState().setRuntimeDefaults(saved.data.runtimeDefaults);
      }
    } catch (error) {
      pushToast(String(error), 'warning');
      setRefresh((value) => value + 1);
    } finally {
      pending.current = false;
      setBusy(false);
      props.onBusyChange(false);
    }
  }
  return { state, connection, busy, change };
}

function WorkModeSelector({
  sessionId,
  ...props
}: WorkModeControlProps & { sessionId: string | null }): JSX.Element {
  const { t } = useI18n();
  const active = useIsStreaming();
  const project = useAppStore((s) => s.currentProjectPath);
  const defaultWorkMode = useAppStore((s) => s.runtimeDefaults.workMode ?? 'coding');
  const { state, connection, busy, change } = useWorkModeControl(sessionId, props);
  const unavailable = !project || (!!sessionId && !state?.supported) || connection !== 'ready';
  if (state?.supported && state.locked) {
    const mode = WORK_MODES.find((mode) => mode.value === state.workMode)!;
    const Icon = mode.icon;
    return (
      <span
        data-testid="work-mode-current"
        className="work-mode-current"
        title={t('workMode.locked')}
      >
        <Icon size={14} aria-hidden />
        <span>{mode.label}</span>
        {mode.value === 'script' && (
          <span className="work-mode-experimental">{t('workMode.experimental')}</span>
        )}
        <LockKeyhole size={11} aria-hidden />
      </span>
    );
  }
  return (
    <div className="work-mode-control">
      <WorkModeSegments
        value={state?.workMode ?? (sessionId === null ? defaultWorkMode : undefined)}
        disabled={unavailable || active || busy || props.disabled}
        title={
          !state?.supported && state
            ? t('workMode.upgrade')
            : busy
              ? t('workMode.saving')
              : active
                ? t('workMode.wait')
                : t('workMode.beforeFirstRun')
        }
        onChange={(value) => void change(value)}
      />
      <span className="sr-only" role="status">
        {busy || props.disabled ? t('workMode.saving') : ''}
      </span>
    </div>
  );
}

const WORK_MODES = [
  { value: 'agent', label: 'Agent', icon: Sparkles },
  { value: 'coding', label: 'Coding', icon: Code2 },
  { value: 'script', label: 'Script', icon: SquareTerminal },
] as const;
type WorkMode = (typeof WORK_MODES)[number]['value'];

function WorkModeSegments({
  value,
  disabled,
  title,
  onChange,
}: {
  readonly value: WorkMode | undefined;
  readonly disabled: boolean;
  readonly title: string;
  readonly onChange: (mode: WorkMode) => void;
}): JSX.Element {
  const { t } = useI18n();
  const selected = WORK_MODES.findIndex((mode) => mode.value === value);
  return (
    <div
      data-testid="work-mode-selector"
      role="radiogroup"
      aria-label={t('workMode.label')}
      className="work-mode-segments"
      title={title}
      style={{ '--work-mode-index': Math.max(0, selected) } as CSSProperties}
    >
      {selected >= 0 && <span className="work-mode-highlight" aria-hidden />}
      {WORK_MODES.map(({ value: mode, label, icon: Icon }, index) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          disabled={disabled}
          aria-label={mode === 'script' ? t('workMode.script') : label}
          tabIndex={selected === index || (selected < 0 && index === 0) ? 0 : -1}
          onClick={() => {
            if (value !== mode) onChange(mode);
          }}
          onKeyDown={(event) => {
            const offset =
              event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? 1
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? -1
                  : 0;
            if (!offset && event.key !== 'Home' && event.key !== 'End') return;
            event.preventDefault();
            const next =
              event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + offset + 3) % 3;
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
            buttons?.[next]?.focus();
            if (WORK_MODES[next].value !== value) onChange(WORK_MODES[next].value);
          }}
        >
          <Icon size={14} aria-hidden />
          <span>{label}</span>
          {mode === 'script' && (
            <span className="work-mode-experimental" aria-hidden>
              {t('workMode.experimental')}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
