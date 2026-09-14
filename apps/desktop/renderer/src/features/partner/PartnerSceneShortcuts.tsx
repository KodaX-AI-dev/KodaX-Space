import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { PARTNER_SCENE_TEMPLATES, type PartnerSceneTemplate } from './partnerSceneTemplates.js';

interface PartnerSceneShortcutsProps {
  readonly onChoose: (template: PartnerSceneTemplate) => void;
}

const PRIMARY_SCENE_COUNT = 4;

export function PartnerSceneShortcuts({ onChoose }: PartnerSceneShortcutsProps): JSX.Element {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const visibleTemplates = expanded
    ? PARTNER_SCENE_TEMPLATES
    : PARTNER_SCENE_TEMPLATES.slice(0, PRIMARY_SCENE_COUNT);

  return (
    <div
      className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5"
      aria-label={t('partner.sceneTemplate.aria')}
      data-testid="partner-scene-shortcuts"
    >
      {visibleTemplates.map((template) => (
        <button
          key={template.sceneId}
          type="button"
          onClick={() => onChoose(template)}
          className="h-8 shrink-0 rounded-lg border border-border-default bg-surface px-2.5 text-[11px] text-fg-secondary transition-colors hover:border-border-strong hover:bg-hover-bg hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          title={t(template.descriptionKey)}
        >
          {t(template.labelKey)}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] text-fg-muted hover:bg-hover-bg hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        )}
        <span>{expanded ? t('partner.sceneTemplate.less') : t('partner.sceneTemplate.more')}</span>
      </button>
    </div>
  );
}
