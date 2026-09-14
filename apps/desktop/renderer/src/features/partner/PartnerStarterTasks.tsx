import { useEffect, useRef, useState } from 'react';
import type { SpaceExpertDefinitionT } from '@kodax-space/space-ipc-schema';
import presentation from '../../../../../../extensions/partner-library/expert-presentation.json';
import { useI18n } from '../../i18n/I18nProvider.js';
import { invokeExtensionHost, useSpaceExtensions } from '../extensions/SpaceExtensionsProvider.js';
import { usePartnerExpert } from '../extensions/PartnerExpertProvider.js';
import { expertContextMatches } from '../extensions/partnerExpertBinding.js';
import { requestPartnerSkillDraft } from './partnerSkillDraft.js';

export const PARTNER_STARTER_EXPERTS = [
  { id: 'research', expertId: 'deep-research' },
  { id: 'data', expertId: 'data-analysis' },
  { id: 'writing', expertId: 'writing-mentor' },
  { id: 'meeting', expertId: 'meeting-minutes' },
  { id: 'email', expertId: 'email-editing' },
  { id: 'report', expertId: 'status-report' },
] as const;
const extensionId = 'kodax.partner-library';

function useStarterCatalog() {
  const { snapshot } = useSpaceExtensions();
  const [catalog, setCatalog] = useState<readonly SpaceExpertDefinitionT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const enabled = snapshot.extensions.some((entry) => entry.id === extensionId && entry.enabled);
  useEffect(() => {
    let current = true;
    setCatalog([]);
    setError(null);
    setLoading(snapshot.loading || enabled);
    if (!snapshot.loading && enabled) {
      void invokeExtensionHost('space.extensions.catalog', { extensionId })
        .then(({ experts }) => {
          if (current) setCatalog(experts.filter((item) => !item.retired));
        })
        .catch((reason: unknown) => {
          if (current) setError(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }
    return () => {
      current = false;
    };
  }, [snapshot.extensions, snapshot.loading, enabled]);
  return { catalog: enabled ? catalog : [], loading, error: error ?? snapshot.error };
}

function StarterCard({
  id,
  expert,
  disabled,
  onSelect,
}: {
  readonly id: (typeof PARTNER_STARTER_EXPERTS)[number]['id'];
  readonly expert?: SpaceExpertDefinitionT;
  readonly disabled: boolean;
  readonly onSelect: (expert: SpaceExpertDefinitionT) => void;
}): JSX.Element {
  const { t } = useI18n();
  const visuals: Readonly<Record<string, { avatar: string }>> = presentation.experts;
  const avatar =
    expert && Object.hasOwn(visuals, expert.id) ? visuals[expert.id]?.avatar : undefined;
  return (
    <button
      type="button"
      disabled={disabled || !expert?.skillRef || !expert.starterTasks[0]}
      onClick={() => expert && onSelect(expert)}
      className="rounded-xl border border-border-default bg-surface p-4 text-left transition-colors hover:border-accent-border hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
    >
      <div className="text-sm font-medium text-fg-primary">{t(`partner.welcome.${id}.title`)}</div>
      <p className="mt-2 text-xs leading-5 text-fg-muted">
        {expert?.workflow?.deliverables[0] ?? t(`partner.welcome.${id}.description`)}
      </p>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-fg-secondary">
        {avatar && (
          <img
            src={`./expert-avatars/${avatar}.jpg`}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 rounded-full"
          />
        )}
        <span>{expert?.name ?? t('partner.welcome.expertUnavailable')}</span>
      </div>
    </button>
  );
}

export function PartnerStarterTasks(): JSX.Element {
  const { t } = useI18n();
  const { catalog, loading, error: catalogError } = useStarterCatalog();
  const context = usePartnerExpert();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const selecting = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const select = async (expert: SpaceExpertDefinitionT): Promise<void> => {
    if (!context || selecting.current) return;
    selecting.current = true;
    setBusy(true);
    setError(null);
    const scope = context.binding.getSnapshot().context;
    try {
      await context.binding.select({
        extensionId,
        expertId: expert.id,
        revision: expert.revision,
        useSkill: true,
      });
      const current = context.binding.getSnapshot();
      if (
        active.current &&
        expertContextMatches(scope, current.context) &&
        current.state.available &&
        current.state.expert?.expert.id === expert.id
      ) {
        requestPartnerSkillDraft(expert.starterTasks[0]!);
      }
    } catch (reason) {
      if (active.current && expertContextMatches(scope, context.binding.getSnapshot().context))
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      selecting.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <div data-testid="partner-starter-tasks">
      {(error || catalogError) && (
        <p role="alert" className="mb-3 text-xs text-danger">
          {error ?? catalogError}
        </p>
      )}
      {(loading || busy) && (
        <p role="status" className="mb-3 text-xs text-fg-muted">
          {t(busy ? 'extensions.expertSaving' : 'attach.loading')}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        {PARTNER_STARTER_EXPERTS.map(({ id, expertId }) => (
          <StarterCard
            key={id}
            id={id}
            expert={catalog.find((item) => item.id === expertId)}
            disabled={
              !context || loading || busy || context.snapshot.loading || context.snapshot.changing
            }
            onSelect={(expert) => void select(expert)}
          />
        ))}
      </div>
    </div>
  );
}
