import { useEffect, useRef, useState } from 'react';
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
  const sessionId = useAppStore((s) => s.currentSessionId);
  const runtimeId = useAppStore((s) => s.runtimeConnection.runtimeId);
  const project = useAppStore((s) => s.currentProjectPath);
  const provider = useAppStore(
    (s) => s.sessions.find((session) => session.sessionId === sessionId)?.provider,
  );
  if (provider === 'mock') return <span className="text-fg-secondary">AMA</span>;
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
        if (result.ok) setState(result.data);
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
  }, [sessionId, revision, connection, refresh]);

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
      const result = await window.kodaxSpace!.invoke('session.setWorkMode', {
        sessionId: target,
        workMode,
        expectedRevision: current.revision,
      });
      if (!result.ok) {
        pushToast(result.error.message, 'warning');
        setRefresh((value) => value + 1);
      } else if (stillSelected()) setState(result.data);
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
  const { state, connection, busy, change } = useWorkModeControl(sessionId, props);
  return (
    <select
      data-testid="work-mode-selector"
      aria-label={t('workMode.label')}
      className="composer-control text-sm px-2 py-0.5 rounded bg-surface-2 border border-border-default text-fg-secondary"
      value={state?.workMode ?? ''}
      disabled={
        !project ||
        (!!sessionId && !state?.supported) ||
        active ||
        busy ||
        props.disabled ||
        connection !== 'ready'
      }
      title={
        !state?.supported && state
          ? t('workMode.upgrade')
          : active
            ? t('workMode.wait')
            : t('workMode.label')
      }
      onChange={(event) => {
        void change(event.target.value as ChannelInput<'session.setWorkMode'>['workMode']);
      }}
    >
      {!state && <option value="">{t('workMode.label')}</option>}
      <option value="agent">Agent</option>
      <option value="coding">Coding</option>
      <option value="script">{t('workMode.script')}</option>
    </select>
  );
}
