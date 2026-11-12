import { useEffect, useState } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { useAppStore } from '../store/appStore.js';
import { useI18n } from '../i18n/I18nProvider.js';

const labels = {
  checking: 'runtime.startup.checking',
  starting: 'runtime.startup.starting',
  upgrading: 'runtime.startup.upgrading',
  connecting: 'runtime.startup.connecting',
  ready: 'runtime.startup.preparing',
  connected_clients: 'runtime.startup.connectedClients',
  host_starting: 'runtime.startup.hostStarting',
  host_stopping: 'runtime.startup.hostStopping',
} as const;

const initializationLabels = {
  modules: 'runtime.startup.modules',
  extensions: 'runtime.startup.extensions',
  runtime: 'runtime.startup.runtime',
  recovery: 'runtime.startup.recovery',
  mcp: 'runtime.startup.mcp',
  sessions: 'runtime.startup.sessions',
  a2a: 'runtime.startup.a2a',
  listener: 'runtime.startup.listener',
} as const;

export function RuntimeStartupStatus() {
  const connection = useAppStore((state) => state.runtimeConnection);
  const { t } = useI18n();
  const progress = connection.startupProgress;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string>();
  async function retry() {
    setRetrying(true);
    setRetryError(undefined);
    try {
      if (!window.kodaxSpace) throw new Error(t('runtime.startup.unavailable'));
      const result = await window.kodaxSpace.invoke('runtime.retryStartup', undefined);
      if (!result.ok) setRetryError(result.error.message);
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : String(error));
    } finally {
      setRetrying(false);
    }
  }
  if (connection.state === 'incompatible' || connection.state === 'disconnected') {
    return (
      <div
        role="alert"
        data-testid="runtime-startup-failed"
        className="flex items-start gap-2 px-3 py-2 text-xs text-danger"
      >
        <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p>{t('runtime.startup.failed')}</p>
          <p className="mt-1 text-fg-muted">{t('runtime.startup.serviceDescription')}</p>
          {connection.reason && (
            <details className="mt-1 break-words text-fg-muted">
              <summary>{t('runtime.startup.failureDetails')}</summary>
              {connection.reason}
            </details>
          )}
          {retryError && <p className="mt-1">{retryError}</p>}
        </div>
        <button
          type="button"
          disabled={retrying}
          onClick={() => {
            void retry();
          }}
          className="shrink-0 rounded border border-border-default px-2 py-1 disabled:opacity-50"
        >
          {t('runtime.startup.retry')}
        </button>
      </div>
    );
  }
  if (connection.state !== 'connecting' && connection.state !== 'reconnecting') return null;
  const label = progress
    ? progress.stage === 'initializing'
      ? initializationLabels[progress.phase]
      : labels[progress.stage === 'waiting' ? progress.reason : progress.stage]
    : connection.state === 'reconnecting'
      ? 'runtime.startup.reconnecting'
      : 'runtime.startup.starting';
  return <StartupWait label={t(label)} changedAt={connection.changedAt} />;
}

function StartupWait({ label, changedAt }: { readonly label: string; readonly changedAt: number }) {
  const { t } = useI18n();
  const [startedAt] = useState(changedAt);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1_000));
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="runtime-startup-status"
      className="flex flex-shrink-0 items-start gap-2 border-b border-border-default bg-surface-2 px-3 py-2 text-xs text-fg-secondary"
    >
      <LoaderCircle
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span>{label}</span>
          <span
            aria-live="off"
            className="tabular-nums text-fg-muted"
            data-testid="runtime-startup-elapsed"
          >
            {t('runtime.startup.elapsed', { seconds })}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-fg-muted">
          {t(seconds >= 30 ? 'runtime.startup.slow' : 'runtime.startup.hint')}
        </p>
      </div>
    </div>
  );
}
