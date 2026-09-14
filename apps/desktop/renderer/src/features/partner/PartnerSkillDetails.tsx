import type { SkillMeta } from '@kodax-space/space-ipc-schema';
import { Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';

export function PartnerSkillDetails({ skill }: { readonly skill: SkillMeta }): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="h-full overflow-y-auto p-4" data-testid="partner-skill-details">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-accent/10 p-2 text-accent-ink" aria-hidden>
          <Sparkles className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="break-words text-base font-medium text-fg-primary">{skill.name}</h2>
          <p className="mt-1 text-xs leading-5 text-fg-muted">{skill.description}</p>
        </div>
      </div>
      <dl className="mt-5 space-y-3 text-xs">
        <div>
          <dt className="text-fg-muted">{t('partner.collaboration.skillSource')}</dt>
          <dd className="mt-1 text-fg-secondary">{skill.source}</dd>
        </div>
        {skill.argumentHint && (
          <div>
            <dt className="text-fg-muted">{t('partner.collaboration.skillArguments')}</dt>
            <dd className="mt-1 font-mono text-fg-secondary">{skill.argumentHint}</dd>
          </div>
        )}
      </dl>
      <p className="mt-5 text-[11px] leading-5 text-fg-muted">
        {t('partner.collaboration.skillPolicy')}
      </p>
    </div>
  );
}
