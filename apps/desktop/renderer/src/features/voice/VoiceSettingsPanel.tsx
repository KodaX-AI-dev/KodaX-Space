import { useEffect, useState } from 'react';
import type { VoiceStatus, VoiceLanguage } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';

export function readVoiceLanguage(): VoiceLanguage {
  const value = localStorage.getItem('space.voice.language');
  return value === 'en' || value === 'auto' ? value : 'zh';
}

export function VoiceSettingsPanel({ active = true }: { readonly active?: boolean }): JSX.Element {
  const { t } = useI18n();
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState(readVoiceLanguage);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async (): Promise<void> => {
      try {
        if (!window.kodaxSpace) throw new Error('Desktop bridge unavailable');
        const result = await window.kodaxSpace.invoke('voice.status', undefined);
        if (disposed) return;
        if (result.ok) {
          setStatus(result.data);
          setError(false);
        } else setError(true);
      } catch {
        if (!disposed) setError(true);
      }
      if (!disposed)
        timer = setTimeout(() => {
          void refresh();
        }, 1000);
    };
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [active]);

  async function action(
    channel: 'voice.install' | 'voice.cancelInstall' | 'voice.remove',
  ): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      if (!window.kodaxSpace) throw new Error('Desktop bridge unavailable');
      const result = await window.kodaxSpace.invoke(channel, undefined);
      if (!result.ok) setError(true);
      const refreshed = await window.kodaxSpace.invoke('voice.status', undefined);
      if (refreshed.ok) setStatus(refreshed.data);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const phase = status?.phase ?? 'checking';
  const buttonClass =
    'ix-press rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-hover-bg disabled:opacity-50';
  return (
    <section className="space-y-4 p-5" aria-label={t('voice.title')}>
      <div>
        <h3 className="text-sm font-semibold text-fg-primary">{t('voice.title')}</h3>
        <p className="mt-2 text-sm text-fg-muted">{t('voice.description')}</p>
      </div>
      <p className="text-xs text-fg-muted">{t('voice.privacy')}</p>
      <p className="text-sm" role="status">
        {t(`voice.state.${phase}`)}
      </p>
      {phase === 'installing' && status && (
        <div className="space-y-1">
          <progress
            className="h-2 w-full"
            max={status.total || 1}
            value={status.downloaded}
            aria-label={t('voice.progress')}
          />
          <p className="text-xs text-fg-muted">
            {(status.downloaded / 1e6).toFixed(1)} / {(status.total / 1e6).toFixed(1)} MB
          </p>
        </div>
      )}
      {(error || status?.error) && (
        <p className="text-sm text-danger" role="alert">
          {t(status?.error === 'runtime' ? 'voice.runtimeFailed' : 'voice.installFailed')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {phase === 'installing' ? (
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={() => void action('voice.cancelInstall')}
          >
            {t('voice.cancel')}
          </button>
        ) : (
          phase !== 'unsupported' && (
            <button
              type="button"
              className={buttonClass}
              disabled={busy || phase === 'checking'}
              onClick={() => void action('voice.install')}
            >
              {t(phase === 'ready' || phase === 'failed' ? 'voice.repair' : 'voice.install')}
            </button>
          )
        )}
        {(phase === 'ready' || phase === 'failed' || phase === 'missing') && (
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={() => void action('voice.remove')}
          >
            {t('voice.remove')}
          </button>
        )}
      </div>
      <label className="flex items-center gap-3 text-sm">
        {t('voice.language')}
        <select
          className="rounded border border-border bg-surface px-2 py-1"
          value={language}
          onChange={(event) => {
            const value = event.target.value as VoiceLanguage;
            setLanguage(value);
            localStorage.setItem('space.voice.language', value);
          }}
        >
          <option value="zh">{t('voice.chinese')}</option>
          <option value="en">English</option>
          <option value="auto">{t('voice.auto')}</option>
        </select>
      </label>
      <p className="text-xs text-fg-muted">{t('voice.license')}</p>
    </section>
  );
}
