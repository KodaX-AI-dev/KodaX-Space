import { X } from 'lucide-react';
import presentation from '../../../../../../extensions/partner-library/expert-presentation.json';
import { useI18n } from '../../i18n/I18nProvider.js';
import { requestPartnerExpertDetail, usePartnerExpert } from './PartnerExpertProvider.js';

export function PartnerExpertChip({ running }: { readonly running: boolean }): JSX.Element | null {
  const context = usePartnerExpert();
  const { t } = useI18n();
  if (!context || context.snapshot.context.surface !== 'partner') return null;
  const { snapshot, binding } = context;
  const expert = snapshot.state.expert;
  const visuals: Readonly<Record<string, { avatar: string }>> = presentation.experts;
  const visual =
    expert?.extensionId === 'kodax.partner-library' && Object.hasOwn(visuals, expert.expert.id)
      ? visuals[expert.expert.id]
      : undefined;
  if (!expert && !snapshot.error && !snapshot.changing && !snapshot.loading) return null;
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1.5"
      data-testid="partner-expert-binding"
    >
      {expert && (
        <div
          className={`inline-flex h-7 max-w-full items-center rounded-md text-xs ${snapshot.state.available ? 'bg-hover-bg' : 'bg-danger/5'}`}
        >
          <button
            type="button"
            data-testid="partner-expert-remove"
            disabled={snapshot.changing}
            onClick={() =>
              void binding.remove().catch(() => {
                // The binding controller keeps the previous expert and exposes this error below.
              })
            }
            title={t('extensions.removeExpert')}
            aria-label={t('extensions.removeExpert')}
            className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-secondary hover:bg-surface disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            data-testid="partner-expert-chip"
            onClick={() => requestPartnerExpertDetail(expert, snapshot.context)}
            className="inline-flex min-w-0 items-center gap-1.5 px-1.5 pr-2 py-1 text-fg-secondary"
            title={t('extensions.expertDetails')}
          >
            {visual ? (
              <img
                src={`./expert-avatars/${visual.avatar}.jpg`}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-[10px]"
              >
                {Array.from(expert.expert.name)[0]}
              </span>
            )}
            <span className="truncate">{expert.expert.name}</span>
            {!snapshot.state.available && (
              <span className="shrink-0 text-[10px] text-danger">
                {t('extensions.expertUnavailable')}
              </span>
            )}
          </button>
        </div>
      )}
      {expert && snapshot.state.available && !snapshot.loading && !snapshot.changing && (
        <span className="text-[10px] text-fg-muted" title={t('extensions.expertConversationScope')}>
          {t('extensions.expertConversationLabel')}
        </span>
      )}
      {(running || snapshot.changing || snapshot.loading) && (
        <span className="text-[10px] text-fg-muted" role="status">
          {t(
            snapshot.changing || snapshot.loading
              ? 'extensions.expertSaving'
              : 'extensions.expertNextTurn',
          )}
        </span>
      )}
      {(snapshot.error || !snapshot.state.available) && (
        <span role="alert" className="text-[11px] text-danger">
          {snapshot.error ?? snapshot.state.unavailableReason}
        </span>
      )}
      {snapshot.error && (
        <button
          type="button"
          onClick={() => void binding.refresh()}
          disabled={snapshot.loading || snapshot.changing}
          className="text-[11px] text-fg-muted underline disabled:opacity-50"
        >
          {t('common.refresh')}
        </button>
      )}
    </div>
  );
}
