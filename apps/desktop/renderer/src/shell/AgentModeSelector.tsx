import { useEffect, useState } from 'react';
import type { ChannelInput, ChannelOutput } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../i18n/I18nProvider.js';
import { useAppStore } from '../store/appStore.js';
import { pushToast } from '../store/toastStore.js';
import { useIsStreaming } from './ActivitySpinner.js';

/** Work mode is a shared Host setting, independent of AMA and permissions. */
export function AgentModeSelector(): JSX.Element {
  const sessionId = useAppStore((s) => s.currentSessionId);
  const runtimeId = useAppStore((s) => s.runtimeConnection.runtimeId);
  const provider = useAppStore(
    (s) => s.sessions.find((session) => session.sessionId === sessionId)?.provider,
  );
  if (provider === 'mock') return <span className="text-fg-secondary">AMA</span>;
  return <WorkModeSelector key={sessionId + ':' + runtimeId} sessionId={sessionId} />;
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

function useWorkModeControl(sessionId: string | null) {
  const { state, setState, setRefresh, connection } = useWorkModeState(sessionId);
  const [busy, setBusy] = useState(false);
  async function change(workMode: ChannelInput<'session.setWorkMode'>['workMode']): Promise<void> {
    if (!sessionId || !state || busy) return;
    setBusy(true);
    try {
      const result = await window.kodaxSpace!.invoke('session.setWorkMode', {
        sessionId,
        workMode,
        expectedRevision: state.revision,
      });
      if (!result.ok) {
        pushToast(result.error.message, 'warning');
        setRefresh((value) => value + 1);
      } else setState(result.data);
    } catch (error) {
      pushToast(String(error), 'warning');
      setRefresh((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  return { state, connection, busy, change };
}

function WorkModeSelector({ sessionId }: { sessionId: string | null }): JSX.Element {
  const { t } = useI18n();
  const active = useIsStreaming();
  const { state, connection, busy, change } = useWorkModeControl(sessionId);
  return (
    <select
      data-testid="work-mode-selector"
      aria-label={t('workMode.label')}
      className="composer-control text-sm px-2 py-0.5 rounded bg-surface-2 border border-border-default text-fg-secondary"
      value={state?.workMode ?? ''}
      disabled={!state?.supported || active || busy || connection !== 'ready'}
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
