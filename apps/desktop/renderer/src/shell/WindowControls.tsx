import { useCallback, useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.js';

export function WindowControls({
  platformClass,
}: {
  readonly platformClass: string;
}): JSX.Element | null {
  const visible = platformClass === 'platform-win32' || platformClass === 'platform-linux';
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);

  const refreshState = useCallback(async (): Promise<void> => {
    if (!window.kodaxSpace) return;
    const result = await window.kodaxSpace.invoke('window.state', undefined);
    if (result.ok) setMaximized(result.data.maximized);
  }, []);

  useEffect(() => {
    if (!visible) return;
    void refreshState();
    const onStateHint = (): void => void refreshState();
    window.addEventListener('focus', onStateHint);
    window.addEventListener('resize', onStateHint);
    return () => {
      window.removeEventListener('focus', onStateHint);
      window.removeEventListener('resize', onStateHint);
    };
  }, [refreshState, visible]);

  const runControl = useCallback(
    async (action: 'minimize' | 'toggleMaximize' | 'close'): Promise<void> => {
      if (!window.kodaxSpace) return;
      const result = await window.kodaxSpace.invoke('window.control', { action });
      if (result.ok) setMaximized(result.data.maximized);
    },
    [],
  );

  const maximizeLabel = maximized ? t('windowControls.restore') : t('windowControls.maximize');

  if (!visible) return null;
  return (
    <div
      role="group"
      className="window-controls app-no-drag"
      aria-label={t('windowControls.group')}
    >
      <button
        type="button"
        className="window-control-button"
        onClick={() => void runControl('minimize')}
        title={t('windowControls.minimize')}
        aria-label={t('windowControls.minimize')}
      >
        <Minus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
      </button>
      <button
        type="button"
        className="window-control-button"
        onClick={() => void runControl('toggleMaximize')}
        title={maximizeLabel}
        aria-label={maximizeLabel}
      >
        {maximized ? (
          <Copy className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden />
        ) : (
          <Square className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="window-control-button window-control-button--close"
        onClick={() => void runControl('close')}
        title={t('windowControls.close')}
        aria-label={t('windowControls.close')}
      >
        <X className="h-4 w-4" strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
}
