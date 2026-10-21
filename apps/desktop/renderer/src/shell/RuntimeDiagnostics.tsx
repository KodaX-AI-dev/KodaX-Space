import { useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type {
  SpaceCapability,
  SpaceCapabilityStatus,
  SpaceVersionOutput,
} from '@kodax-space/space-ipc-schema';
import { useI18n } from '../i18n/I18nProvider.js';
import type { MessageKey } from '../i18n/messages.js';
import { requestSpaceVersionRefresh } from '../lib/versionEvents.js';
import { useSurfaceStore } from '../store/surface.js';
import { AdminAuditPanel } from '../features/partner/AdminAuditPanel.js';

interface RuntimeDiagnosticsProps {
  readonly version: SpaceVersionOutput | null;
  readonly licenseText: string;
  readonly onClose: () => void;
}

const CAPABILITY_COPY: Readonly<Record<string, readonly [MessageKey, MessageKey]>> = {
  'runtime.hostAdapter': ['diagnostics.runtime', 'diagnostics.runtime.waiting'],
  'memory.agent.experimental': ['diagnostics.memory', 'diagnostics.memory.waiting'],
  'sandbox.command': ['diagnostics.sandbox', 'diagnostics.sandbox.waiting'],
  'repointel.trace': ['diagnostics.trace', 'diagnostics.trace.detail'],
  'repointel.status': ['diagnostics.repo', 'diagnostics.repo.detail'],
  'quickAsk.tempSession': ['diagnostics.quickAsk', 'diagnostics.quickAsk.detail'],
  'quickAsk.sideQuery': ['diagnostics.sideQuery', 'diagnostics.sideQuery.detail'],
  'reasoning.effortV2': ['diagnostics.reasoning', 'diagnostics.reasoning.detail'],
  'handoff.receive': ['diagnostics.handoff', 'diagnostics.handoff.detail'],
  'composer.imageArtifacts': ['diagnostics.images', 'diagnostics.images.detail'],
  'composer.mediaHelpers': ['diagnostics.media', 'diagnostics.media.detail'],
  'externalAgents.reference': ['diagnostics.external', 'diagnostics.external.detail'],
};

const STATE_COPY: Readonly<Record<string, MessageKey>> = {
  'runtime.hostAdapter:ready': 'diagnostics.runtime.ready',
  'runtime.hostAdapter:initializing': 'diagnostics.runtime.starting',
  'runtime.hostAdapter:legacy': 'diagnostics.runtime.legacy',
  'runtime.hostAdapter:failed': 'diagnostics.runtime.failed',
  'runtime.hostAdapter:closed': 'diagnostics.runtime.closed',
  'memory.agent.experimental:available': 'diagnostics.memory.available',
  'sandbox.command:ready': 'diagnostics.sandbox.ready',
  'sandbox.command:setup-required': 'diagnostics.sandbox.setup',
  'sandbox.command:unavailable': 'diagnostics.sandbox.unavailable',
  'repointel.trace:blocked': 'diagnostics.licensed',
  'repointel.status:blocked': 'diagnostics.licensed',
};

const STATUS_COPY: Readonly<Record<string, MessageKey>> = {
  supported: 'diagnostics.available',
  partial: 'diagnostics.partial',
  blocked: 'diagnostics.blocked',
  planned: 'diagnostics.planned',
  initializing: 'diagnostics.starting',
  uninitialized: 'diagnostics.waiting',
  unprobed: 'diagnostics.waiting',
  checking: 'diagnostics.waiting',
  legacy: 'diagnostics.legacy',
};

const STATUS_CLASS: Record<SpaceCapabilityStatus, string> = {
  supported: 'bg-ok/10 text-ok',
  partial: 'bg-warn/10 text-warn',
  blocked: 'bg-danger/10 text-danger',
  planned: 'bg-surface-3 text-fg-muted',
};

function CapabilityRow({ capability }: { readonly capability: SpaceCapability }): JSX.Element {
  const { t } = useI18n();
  const copy = CAPABILITY_COPY[capability.id];
  const summary =
    STATE_COPY[`${capability.id}:${capability.state ?? capability.status}`] ?? copy?.[1];
  const status = STATUS_COPY[capability.state ?? ''] ?? STATUS_COPY[capability.status];
  return (
    <div
      data-capability-id={capability.id}
      className="border-b border-border-default py-3 last:border-0"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-sm font-medium text-fg-primary">
          {copy ? t(copy[0]) : capability.label}
        </span>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs ${STATUS_CLASS[capability.status]}`}
        >
          {t(status)}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-fg-secondary">
        {summary ? t(summary) : capability.detail}
      </p>
    </div>
  );
}

function DiagnosticsHeader({
  version,
  licenseText,
  onClose,
}: RuntimeDiagnosticsProps): JSX.Element {
  const { t } = useI18n();
  return (
    <header className="border-b border-border-default px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-fg-primary">
            {t('shell.runtimeDiagnostics')}
          </h2>
          <p className="mt-1 text-xs text-fg-muted">{t('diagnostics.subtitle')}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={requestSpaceVersionRefresh}
            aria-label={t('diagnostics.refresh')}
            title={t('diagnostics.refresh')}
            className="rounded-md p-1.5 text-fg-muted hover:bg-hover-bg hover:text-fg-primary"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('shell.closeDiagnostics')}
            title={t('common.close')}
            className="rounded-md p-1.5 text-fg-muted hover:bg-hover-bg hover:text-fg-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-fg-primary">
        <span className="font-medium">Space {version?.spaceVersion ?? t('shell.loading')}</span>
        <span className="text-fg-secondary">
          SDK {version?.kodaxSdkVersion ?? t('shell.loading')}
        </span>
      </div>
      <p className="mt-1.5 break-words text-xs leading-5 text-fg-muted">{licenseText}</p>
    </header>
  );
}

function TechnicalDetails({ version }: { readonly version: SpaceVersionOutput }): JSX.Element {
  const { t } = useI18n();
  const fields = [
    [t('diagnostics.dependency'), version.kodaxDependencySpec],
    [t('diagnostics.ledger'), version.capabilityContract],
    [t('shell.platform'), `${version.platform} · Electron ${version.electronVersion}`],
    ['Chromium / Node.js', `${version.chromeVersion} / ${version.nodeVersion}`],
  ];
  return (
    <details className="border-t border-border-default pt-3 text-[13px]">
      <summary className="cursor-pointer py-1 text-fg-secondary">
        {t('diagnostics.details')}
      </summary>
      <dl className="mt-3 space-y-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-fg-muted">{label}</dt>
            <dd className="mt-0.5 break-words font-mono text-xs text-fg-secondary">{value}</dd>
          </div>
        ))}
      </dl>
      {version.capabilities.map((row) => (
        <div key={row.id} className="mt-3">
          <div className="break-words font-mono text-xs text-fg-primary">
            {row.id} · {row.state ?? row.status}
          </div>
          <p className="mt-1 break-words text-xs leading-5 text-fg-muted">{row.detail}</p>
        </div>
      ))}
    </details>
  );
}

export function RuntimeDiagnostics(props: RuntimeDiagnosticsProps): JSX.Element {
  const { t } = useI18n();
  const { onClose } = props;
  const currentSurface = useSurfaceStore((state) => state.currentSurface);
  useEffect(() => {
    requestSpaceVersionRefresh();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <section
      role="region"
      aria-label={t('shell.runtimeDiagnostics')}
      className="workspace-menu app-no-drag absolute right-3 top-8 z-50 flex max-h-[calc(100dvh-3rem)] w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-2 text-fg-secondary shadow-2xl"
    >
      <DiagnosticsHeader {...props} />
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-4">
        {props.version ? (
          <>
            {props.version.capabilities.map((capability) => (
              <CapabilityRow key={capability.id} capability={capability} />
            ))}
            <TechnicalDetails version={props.version} />
          </>
        ) : (
          <p className="py-4 text-sm">{t('shell.loadingDiagnostics')}</p>
        )}
        {currentSurface === 'partner' && (
          <div className="mt-3 max-h-48 overflow-auto">
            <AdminAuditPanel />
          </div>
        )}
      </div>
    </section>
  );
}
