import { Handshake, FolderPlus, Plug } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import {
  requestPartnerExpertManagement,
  usePartnerExpert,
} from '../extensions/PartnerExpertProvider.js';
import { openPartnerMaterialPicker } from './partnerMaterialPicker.js';
import { PartnerStarterTasks } from './PartnerStarterTasks.js';
import {
  requestPartnerConnectorManagement,
  usePartnerConnectors,
} from '../extensions/PartnerConnectorProvider.js';

export function PartnerWelcome(): JSX.Element {
  const { t } = useI18n();
  return (
    <header
      className="mx-auto w-full max-w-[760px] shrink-0 px-6 pb-6 pt-8 text-center"
      data-testid="partner-welcome"
    >
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-border/20 bg-accent-ink/5 text-accent-ink">
        <Handshake className="h-6 w-6" strokeWidth={1.5} aria-hidden />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-fg-primary">
        {t('partner.welcome.title')}
      </h1>
      <p className="mt-3 text-sm leading-6 text-fg-muted">{t('partner.welcome.description')}</p>
    </header>
  );
}

export function PartnerWelcomeStarters(): JSX.Element {
  const { t } = useI18n();
  const project = useAppStore((state) => state.currentProjectPath);
  const expert = usePartnerExpert();
  const connectors = usePartnerConnectors();
  return (
    <section
      className="mx-auto w-full max-w-[760px] shrink-0 px-4 pb-8"
      aria-label={t('partner.welcome.starters')}
    >
      <div className="mb-7 flex flex-wrap items-center justify-center gap-3 text-xs text-fg-secondary">
        <button
          type="button"
          disabled={!expert}
          onClick={() => expert && requestPartnerExpertManagement(expert.snapshot.context)}
          className="inline-flex items-center gap-2 rounded-full border border-border-default px-3 py-2 hover:bg-hover-bg disabled:opacity-50"
        >
          <img
            src="./expert-avatars/research.jpg"
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 rounded-full"
          />
          {t('partner.welcome.experts')}
        </button>
        <button
          type="button"
          disabled={!connectors}
          onClick={() =>
            connectors && requestPartnerConnectorManagement(connectors.snapshot.context)
          }
          className="inline-flex items-center gap-2 rounded-full border border-border-default px-3 py-2 hover:bg-hover-bg disabled:opacity-50"
        >
          <Plug className="h-4 w-4" aria-hidden />
          {t('partner.welcome.connectors')}
        </button>
        <button
          type="button"
          onClick={openPartnerMaterialPicker}
          disabled={!project}
          className="inline-flex items-center gap-2 rounded-full border border-border-default px-3 py-2 hover:bg-hover-bg disabled:opacity-50"
        >
          <FolderPlus className="h-4 w-4" aria-hidden />
          {t('partner.welcome.materials')}
        </button>
      </div>
      <p className="mb-3 text-xs text-fg-muted">{t('partner.welcome.starters')}</p>
      <PartnerStarterTasks />
      <p className="mt-4 text-center text-[11px] leading-5 text-fg-muted">
        {t(project ? 'partner.welcome.editHint' : 'partner.welcome.openFolderFirst')}
      </p>
    </section>
  );
}
