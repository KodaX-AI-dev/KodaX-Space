import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Loader2 } from 'lucide-react';
import type { PartnerComponentIdT, PartnerComponentT } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { invokeExtensionHost } from './SpaceExtensionsProvider.js';

function useComponentActions(
  setComponents: Dispatch<SetStateAction<PartnerComponentT[]>>,
  setError: Dispatch<SetStateAction<string | null>>,
  revision: { current: number },
) {
  const [busy, setBusy] = useState(false);
  async function act(id: PartnerComponentIdT, action: 'install' | 'cancel'): Promise<void> {
    if (busy) return;
    revision.current++;
    setBusy(true);
    setError(null);
    try {
      const result = await invokeExtensionHost(`partner.components.${action}`, { id });
      setComponents((current) =>
        current.map((component) => (component.id === id ? result.component : component)),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }
  return { busy, act };
}

function useConnectorComponents(active: boolean) {
  const [components, setComponents] = useState<PartnerComponentT[]>([]);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const installing = components.some((component) => component.state === 'installing');
  function invalidatePending(): void {
    revision.current++;
  }

  async function refresh(verify: boolean): Promise<void> {
    const request = ++revision.current;
    try {
      const result = await invokeExtensionHost('partner.components.list', { refresh: verify });
      if (revision.current === request) {
        setComponents(result.components);
        setError(null);
      }
    } catch (failure) {
      if (revision.current === request)
        setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  const { busy, act } = useComponentActions(setComponents, setError, revision);
  useEffect(() => {
    if (active) void refresh(true);
    return invalidatePending;
  }, [active]);
  useEffect(() => {
    if (!active || !installing || busy) return;
    const timer = setTimeout(() => void refresh(false), 750);
    return () => clearTimeout(timer);
  }, [active, installing, components, busy]);

  return { components, error, busy, installing, refresh, act };
}

type ComponentActionProps = {
  readonly component: PartnerComponentT;
  readonly busy: boolean;
  readonly act: (id: PartnerComponentIdT, action: 'install' | 'cancel') => Promise<void>;
};

function ComponentAction({ component, busy, act }: ComponentActionProps): JSX.Element | null {
  const { t } = useI18n();
  if (component.state === 'unsupported') return null;
  return (
    <button
      type="button"
      disabled={busy}
      className="rounded-md border border-border-default px-3 py-1.5 text-xs disabled:opacity-50"
      onClick={() =>
        void act(component.id, component.state === 'installing' ? 'cancel' : 'install')
      }
    >
      {t(
        component.state === 'installing'
          ? 'common.cancel'
          : component.state === 'ready' || component.state === 'failed'
            ? 'components.repair'
            : 'components.install',
      )}
    </button>
  );
}

function ComponentCard({ component, busy, act }: ComponentActionProps): JSX.Element {
  const { t } = useI18n();
  return (
    <article
      data-testid={`component-${component.id}`}
      className="rounded-lg border border-border-default p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm">
            {t(`components.${component.id}`)}{' '}
            <span className="text-xs text-fg-muted">{component.version}</span>
          </p>
          <p role="status" className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
            {component.state === 'installing' && (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            )}
            {t(`components.state.${component.state}`)}
          </p>
        </div>
        <ComponentAction component={component} busy={busy} act={act} />
      </div>
      {component.error && <p className="mt-2 text-xs text-danger">{component.error}</p>}
    </article>
  );
}

export function ConnectorComponentsPanel({
  active,
}: {
  readonly active: boolean;
}): JSX.Element | null {
  const { t } = useI18n();
  const { components, error, busy, installing, refresh, act } = useConnectorComponents(active);
  if (!active) return null;
  return (
    <section
      className="space-y-3 border-t border-border-default p-5"
      aria-label={t('components.title')}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{t('components.title')}</h3>
        <button
          type="button"
          className="text-xs text-accent-ink"
          disabled={busy || installing}
          onClick={() => void refresh(true)}
        >
          {t('common.refresh')}
        </button>
      </div>
      <p className="text-xs leading-5 text-fg-muted">{t('components.description')}</p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {components.length === 0 && !error && (
        <p role="status" className="text-xs text-fg-muted">
          {t('common.loading')}
        </p>
      )}
      {components.map((component) => (
        <ComponentCard key={component.id} component={component} busy={busy} act={act} />
      ))}
    </section>
  );
}
