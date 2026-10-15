import { LoaderCircle } from 'lucide-react';
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

export function RuntimeStartupStatus() {
  const connection = useAppStore((state) => state.runtimeConnection);
  const { t } = useI18n();
  const progress = connection.startupProgress;
  if (!progress || (connection.state !== 'connecting' && connection.state !== 'reconnecting'))
    return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="runtime-startup-status"
      className="flex flex-shrink-0 items-center gap-2 px-3 py-2 text-[11px] text-fg-secondary"
    >
      <LoaderCircle
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
      />
      <span>{t(labels[progress.stage === 'waiting' ? progress.reason : progress.stage])}</span>
    </div>
  );
}
