import { useEffect, useState } from 'react';
import type { UpdaterStateT } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { requestConfirm } from '../../store/confirmStore.js';

export function UpdateSettings(): JSX.Element {
  const { t } = useI18n();
  const [state, setState] = useState<UpdaterStateT>({ state: 'idle' });
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const bridge = window.kodaxSpace;
    if (!bridge) return;
    let active = true;
    let observedPush = false;
    const unsubscribe = bridge.on('updater.status', (next) => {
      observedPush = true;
      if (active) {
        setState(next);
        if (next.state === 'error') setInstalling(false);
      }
    });
    void bridge
      .invoke('updater.getState', {})
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setEnabled(result.data.enabled);
        if (!observedPush) setState(result.data.state);
      })
      .catch((reason: unknown) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function check(): Promise<void> {
    if (busy || !window.kodaxSpace) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.kodaxSpace.invoke('updater.check', {});
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setEnabled(result.data.enabled);
      setState(result.data.state);
      setChecked(true);
    } catch (reason: unknown) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function confirmUpdate(action: 'download' | 'install'): Promise<void> {
    if (
      busy ||
      installing ||
      !window.kodaxSpace ||
      (state.state !== 'available' && state.state !== 'ready')
    )
      return;
    const version = state.version;
    setBusy(true);
    setError('');
    try {
      const accepted = await requestConfirm({
        title: t(action === 'download' ? 'update.download' : 'update.restartInstall'),
        message: t(action === 'download' ? 'update.confirmDownload' : 'update.confirmInstall', {
          version,
        }),
      });
      if (!accepted) return;
      const result =
        action === 'download'
          ? await window.kodaxSpace.invoke('updater.download', { version })
          : await window.kodaxSpace.invoke('updater.install', { version });
      if (!result.ok) setError(result.error.message);
      else if (!result.data.accepted) setError(t('update.changed'));
      else if (action === 'install') setInstalling(true);
    } catch (reason: unknown) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  const checking =
    busy || installing || state.state === 'checking' || state.state === 'downloading';
  return (
    <div className="space-y-3" data-testid="update-settings">
      {enabled === false && <p className="text-xs text-fg-muted">{t('update.unavailable')}</p>}
      <button
        type="button"
        className="rounded border border-border-default px-3 py-2 text-xs hover:bg-hover-bg disabled:opacity-50"
        onClick={() => void check()}
        disabled={enabled !== true || checking}
      >
        {state.state === 'checking' ? t('update.checking') : t('update.check')}
      </button>
      {checked && state.state === 'idle' && (
        <p role="status" className="text-xs text-fg-muted">
          {t('update.upToDate')}
        </p>
      )}
      {state.state === 'available' && (
        <div className="flex items-center gap-3 text-xs">
          <span>{t('update.available', { version: state.version })}</span>
          <button
            type="button"
            className="rounded border border-ok/50 bg-ok/15 px-3 py-2 text-ok"
            disabled={busy}
            onClick={() => void confirmUpdate('download')}
          >
            {t('update.download')}
          </button>
        </div>
      )}
      {state.state === 'downloading' && (
        <p role="status" className="text-xs">
          {t('update.downloadingVersion', { version: state.version })} {Math.round(state.percent)}%
        </p>
      )}
      {state.state === 'ready' && (
        <div className="flex items-center gap-3 text-xs">
          <span>{t('update.ready', { version: state.version })}</span>
          <button
            type="button"
            className="rounded border border-ok/50 bg-ok/15 px-3 py-2 text-ok"
            disabled={busy || installing}
            onClick={() => void confirmUpdate('install')}
          >
            {installing ? t('update.installing') : t('update.restartInstall')}
          </button>
        </div>
      )}
      {(error || state.state === 'error') && (
        <p role="alert" className="text-xs text-danger">
          {error || (state.state === 'error' ? state.message : '')}
        </p>
      )}
    </div>
  );
}
