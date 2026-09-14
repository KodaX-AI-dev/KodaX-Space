import { useEffect, useState } from 'react';
import type { PartnerConnectorInspectionT } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { invokeExtensionHost } from './SpaceExtensionsProvider.js';

/** Existing CLI profiles remain an explicit advanced path, not part of iframe metadata. */
export function PartnerConnectorAdvanced({
  extensionId,
  connectorId,
  isActive,
  onConnected,
}: {
  readonly extensionId: string;
  readonly connectorId: string;
  readonly isActive: () => boolean;
  readonly onConnected: () => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  const [inspection, setInspection] = useState<PartnerConnectorInspectionT | null>(null);
  const [profile, setProfile] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    void invokeExtensionHost('partner.connectors.inspect', { extensionId, connectorId })
      .then((result) => {
        if (!mounted || !isActive()) return;
        setInspection(result);
        setProfile(result.profiles[0]?.name ?? '');
      })
      .catch((reason) => {
        if (mounted && isActive())
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      mounted = false;
    };
  }, [extensionId, connectorId, isActive]);
  const verify = async (): Promise<void> => {
    if (busy || !isActive()) return;
    setBusy(true);
    setError(null);
    try {
      await invokeExtensionHost('partner.connectors.connect', {
        extensionId,
        connectorId,
        profile,
      });
      if (isActive()) await onConnected();
    } catch (reason) {
      if (isActive()) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (isActive()) setBusy(false);
    }
  };
  return (
    <div className="mt-3 space-y-3 text-xs">
      {(error || inspection?.reason) && (
        <p role="alert" className="text-danger">
          {error || inspection?.reason}
        </p>
      )}
      {!inspection && !error && <p>{t('common.loading')}</p>}
      {inspection && (
        <>
          <p className="text-fg-muted">lark-cli {inspection.version ?? '—'}</p>
          <label className="block">
            {t('connectors.profile')}
            <select
              className="mt-2 w-full rounded-lg border border-border-default bg-surface px-3 py-2"
              value={profile}
              onChange={(event) => setProfile(event.target.value)}
              disabled={busy}
            >
              {inspection.profiles.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.label || item.name}
                </option>
              ))}
            </select>
          </label>
          {!inspection.profiles.length && (
            <p className="text-fg-muted">{t('connectors.noProfiles')}</p>
          )}
          <button
            type="button"
            className="rounded-lg border border-border-default px-3 py-2 disabled:opacity-40"
            disabled={busy || !profile}
            onClick={() => void verify()}
          >
            {t('connectors.verify')}
          </button>
        </>
      )}
    </div>
  );
}
