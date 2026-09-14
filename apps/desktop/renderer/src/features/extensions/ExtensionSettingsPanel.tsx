import { useState } from 'react';
import { Loader2, PackageOpen, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { SpaceExtensionT } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { requestConfirm } from '../../store/confirmStore.js';
import { useSpaceExtensions } from './SpaceExtensionsProvider.js';
import type { ExtensionCatalogSnapshot } from './extensionCatalog.js';

interface ExtensionSettingsContentProps {
  readonly snapshot: ExtensionCatalogSnapshot;
  readonly busy: string | null;
  readonly actionError: string | null;
  readonly onInstall: () => void;
  readonly onRefresh: () => void;
  readonly onSetEnabled: (extension: SpaceExtensionT) => void;
  readonly onUninstall: (extension: SpaceExtensionT) => void;
}

export function ExtensionSettingsPanel(): JSX.Element {
  const { t } = useI18n();
  const { catalog, snapshot } = useSpaceExtensions();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<unknown>): Promise<void> {
    if (busy) return;
    setBusy(id);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function uninstall(extension: SpaceExtensionT): Promise<void> {
    if (busy) return;
    const confirmed = await requestConfirm({
      title: t('extensions.uninstallTitle', { name: extension.name }),
      message: t('extensions.uninstallDetail'),
      confirmLabel: t('extensions.uninstall'),
      danger: true,
    });
    if (confirmed) await run(extension.id, () => catalog.uninstall(extension.id));
  }

  return (
    <ExtensionSettingsContent
      snapshot={snapshot}
      busy={busy}
      actionError={actionError}
      onInstall={() => void run('install', catalog.install)}
      onRefresh={() => void run('refresh', catalog.refresh)}
      onSetEnabled={(extension) =>
        void run(extension.id, () => catalog.setEnabled(extension.id, !extension.enabled))
      }
      onUninstall={(extension) => void uninstall(extension)}
    />
  );
}

export function ExtensionSettingsContent({
  snapshot,
  busy,
  actionError,
  onInstall,
  onRefresh,
  onSetEnabled,
  onUninstall,
}: ExtensionSettingsContentProps): JSX.Element {
  const { t } = useI18n();
  const error = actionError ?? snapshot.error;
  return (
    <div className="space-y-5 p-5" data-testid="extension-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-lg text-xs leading-5 text-fg-muted">{t('extensions.description')}</p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy !== null || snapshot.loading}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border-default hover:bg-hover-bg disabled:opacity-50"
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${snapshot.loading ? 'animate-spin' : ''}`}
              aria-hidden
            />
          </button>
          <button
            type="button"
            data-testid="extension-install"
            onClick={onInstall}
            disabled={busy !== null}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-surface-3 px-3 text-xs font-medium hover:bg-hover-bg disabled:opacity-50"
          >
            {busy === 'install' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden />
            )}
            {t('extensions.install')}
          </button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs text-danger"
        >
          {error}
        </div>
      )}
      {snapshot.loading && snapshot.extensions.length === 0 ? (
        <p role="status" className="flex items-center gap-2 py-6 text-xs text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('common.loading')}
        </p>
      ) : snapshot.extensions.length === 0 ? (
        <div
          data-testid="extensions-empty"
          className="rounded-xl border border-dashed border-border-default px-6 py-12 text-center"
        >
          <PackageOpen
            className="mx-auto mb-3 h-8 w-8 text-fg-muted"
            strokeWidth={1.5}
            aria-hidden
          />
          <h3 className="text-sm font-medium">{t('extensions.emptyTitle')}</h3>
          <p className="mt-2 text-xs leading-5 text-fg-muted">{t('extensions.emptyDetail')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {snapshot.extensions.map((extension) => (
            <article
              key={extension.id}
              className="rounded-xl border border-border-default bg-surface/70 p-4"
              data-testid="extension-item"
            >
              <div className="flex items-start gap-3">
                <PackageOpen className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">{extension.name}</h3>
                    <span className="text-[11px] text-fg-muted">v{extension.version}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-fg-muted">{extension.description}</p>
                  <p className="mt-2 break-all font-mono text-[10px] text-fg-muted">
                    {extension.id}
                  </p>
                </div>
                <span className="rounded border border-border-default px-1.5 py-0.5 text-[10px] text-fg-muted">
                  {t(extension.enabled ? 'extensions.enabled' : 'extensions.disabled')}
                </span>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={extension.enabled}
                  aria-label={t('extensions.toggle', { name: extension.name })}
                  disabled={busy !== null}
                  onClick={() => onSetEnabled(extension)}
                  className="rounded-md border border-border-default px-3 py-1.5 text-xs hover:bg-hover-bg disabled:opacity-50"
                >
                  {t(extension.enabled ? 'extensions.disable' : 'extensions.enable')}
                </button>
                <button
                  type="button"
                  data-testid="extension-uninstall"
                  disabled={busy !== null}
                  onClick={() => onUninstall(extension)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs text-fg-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {t('extensions.uninstall')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="text-[11px] leading-5 text-fg-muted">{t('extensions.trustNote')}</p>
    </div>
  );
}
