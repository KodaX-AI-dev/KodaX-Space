import type { PartnerExpertSnapshotT, SkillMeta } from '@kodax-space/space-ipc-schema';
import { Bot, Sparkles, WandSparkles } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { requestPartnerSkillDraft } from './partnerSkillDraft.js';
import { usePartnerTaskCollaboration } from './usePartnerTaskCollaboration.js';
import { usePartnerRemoteRecords } from '../extensions/usePartnerRemoteRecords.js';

export function PartnerCollaborationPanel({
  onOpenExpert,
  onOpenSkill,
  onOpenProposal,
}: {
  readonly onOpenExpert: (expert: PartnerExpertSnapshotT) => void;
  readonly onOpenSkill: (skill: SkillMeta) => void;
  readonly onOpenProposal: (proposalId: string, title: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const { expert, skills, loading, error } = usePartnerTaskCollaboration();
  const { records } = usePartnerRemoteRecords();
  const reviews = records.proposals.filter(
    (proposal) => proposal.operation === 'append' && proposal.status === 'pending',
  );
  const empty = !expert && skills.length === 0 && reviews.length === 0;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-surface"
      data-testid="partner-collaboration-panel"
    >
      <header className="border-b border-border-default px-4 py-3">
        <h2 className="text-sm font-medium text-fg-primary">
          {t('partner.taskCards.collaboration')}
        </h2>
        <p className="mt-1 text-[11px] leading-4 text-fg-muted">
          {t('partner.collaboration.description')}
        </p>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {reviews.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-medium text-fg-muted">
              {t('connectors.remoteReviews')}
            </h3>
            <div className="space-y-2">
              {reviews.map((proposal) => (
                <CollaborationRow
                  key={proposal.id}
                  icon={<WandSparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                  title={proposal.title}
                  subtitle={t('connectors.pending')}
                  onClick={() => onOpenProposal(proposal.id, proposal.title)}
                />
              ))}
            </div>
          </section>
        )}
        {error && (
          <p role="status" className="text-xs text-danger">
            {error}
          </p>
        )}
        {expert && (
          <section>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
              {t('partner.collaboration.expert')}
            </h3>
            <CollaborationRow
              icon={<Bot className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
              title={expert.expert.name}
              subtitle={expert.expert.description}
              onClick={() => onOpenExpert(expert)}
            />
          </section>
        )}
        {skills.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
              {t('partner.collaboration.skills')}
            </h3>
            <div className="space-y-2">
              {skills.map((skill) => (
                <CollaborationRow
                  key={skill.name}
                  icon={<Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                  title={skill.name}
                  subtitle={skill.description}
                  onClick={() => onOpenSkill(skill)}
                />
              ))}
            </div>
          </section>
        )}
        {empty && !loading && (
          <div className="rounded-xl border border-dashed border-border-default px-4 py-8 text-center text-xs leading-5 text-fg-muted">
            {t('partner.collaboration.empty')}
          </div>
        )}
      </div>
      <div className="border-t border-border-default p-3">
        <button
          type="button"
          onClick={() => requestPartnerSkillDraft(t('partner.collaboration.createSkillPrompt'))}
          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-border-default bg-surface-2 px-3 text-xs text-fg-secondary hover:bg-hover-bg hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
          data-testid="partner-save-task-as-skill"
        >
          <WandSparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t('partner.collaboration.saveAsSkill')}
        </button>
        <p className="mt-2 text-center text-[10px] leading-4 text-fg-muted">
          {t('partner.collaboration.saveAsSkillHint')}
        </p>
      </div>
    </div>
  );
}

function CollaborationRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  readonly icon: JSX.Element;
  readonly title: string;
  readonly subtitle: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg border border-border-default bg-surface-2 p-3 text-left hover:bg-hover-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
    >
      <span className="mt-0.5 text-fg-muted">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-fg-primary">{title}</span>
        <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-fg-muted">
          {subtitle}
        </span>
      </span>
    </button>
  );
}
