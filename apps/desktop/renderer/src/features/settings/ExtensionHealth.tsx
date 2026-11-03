import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChannelOutput } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
export function ExtensionHealth() {
  const { t } = useI18n();
  const [value, setValue] = useState<ChannelOutput<'runtime.extensionHealth'>>();
  const [unavailable, setUnavailable] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = await window.kodaxSpace?.invoke('runtime.extensionHealth', undefined);
      if (request !== generation.current) return;
      if (result?.ok) {
        setValue(result.data);
        setUnavailable(false);
      } else setUnavailable(true);
    } catch {
      if (request === generation.current) setUnavailable(true);
    }
  }, []);
  useEffect(() => {
    const requestGeneration = generation;
    void refresh();
    return () => {
      requestGeneration.current++;
    };
  }, [refresh]);
  return (
    <div className="my-3 text-xs" data-testid="extension-health">
      <button type="button" className="underline" onClick={() => void refresh()}>
        {t('settings.extensionHealth.refresh')}
      </button>
      <p>
        {unavailable || !value
          ? t('settings.integrationHealth.unavailable')
          : t(`settings.extensionHealth.${value.state}`)}
      </p>
      {value && (
        <>
          <p>
            {t('settings.extensionHealth.builtins', {
              skills: String(value.builtins.skills),
              artifacts: String(value.builtins.artifacts),
            })}
          </p>
          <details>
            <summary>{t('settings.extensionHealth.history')}</summary>
            {value.failures.map((failure, index) => (
              <p key={index}>
                {failure.occurredAt} {failure.stage}: {failure.target} — {failure.message}
              </p>
            ))}
            <p>{value.tools.join(', ')}</p>
          </details>
        </>
      )}
    </div>
  );
}
