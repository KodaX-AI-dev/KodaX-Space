import { Monitor, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { setSpaceTheme } from '../../space-control/semanticActions.js';
import { useI18n } from '../../i18n/I18nProvider.js';

const THEMES = [
  { id: 'light', Icon: Sun },
  { id: 'dark', Icon: Moon },
  { id: 'system', Icon: Monitor },
] as const;
const QUALITIES = ['minimal', 'balanced', 'full'] as const;

/** Uses the same preferences as the titlebar and semantic controls. */
export function AppearanceSettings(): JSX.Element {
  return (
    <div className="appearance-settings space-y-6">
      <ThemeChoices />
      <QualityChoices />
    </div>
  );
}

function ThemeChoices(): JSX.Element {
  const { t } = useI18n();
  const theme = useAppStore((state) => state.theme);
  return (
    <fieldset>
      <legend className="mb-3 text-xs font-medium text-fg-secondary">{t('menu.view.theme')}</legend>
      <div className="appearance-choices">
        {THEMES.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={theme === id}
            onClick={() => setSpaceTheme(id)}
            className="appearance-choice"
          >
            <span className={`appearance-preview appearance-preview--${id}`} aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <span className="inline-flex items-center gap-2">
              <Icon size={14} aria-hidden />
              {t(`theme.${id}`)}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function QualityChoices(): JSX.Element {
  const { t } = useI18n();
  const quality = useAppStore((state) => state.visualQuality);
  const setQuality = useAppStore((state) => state.setVisualQuality);
  return (
    <fieldset>
      <legend className="mb-3 text-xs font-medium text-fg-secondary">
        {t('menu.view.visualQuality')}
      </legend>
      <div className="appearance-choices">
        {QUALITIES.map((id) => (
          <button
            key={id}
            type="button"
            aria-label={t(`visualQuality.${id}`)}
            aria-pressed={quality === id}
            onClick={() => setQuality(id)}
            className="quality-choice"
            aria-describedby={`appearance-${id}-hint`}
          >
            <span className={`quality-material quality-material--${id}`} aria-hidden>
              <span />
            </span>
            <span>{t(`visualQuality.${id}`)}</span>
            <small id={`appearance-${id}-hint`}>{t(`visualQuality.${id}Hint`)}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
