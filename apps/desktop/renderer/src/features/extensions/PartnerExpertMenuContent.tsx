import { ArrowUpRight, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { requestPartnerExpertManagement, usePartnerExpert } from './PartnerExpertProvider.js';
import { invokeExtensionHost, useSpaceExtensions } from './SpaceExtensionsProvider.js';
import {
  readPartnerExpertRecency,
  recordPartnerExpertUsage,
  visiblePartnerExperts,
  type PartnerExpertMenuItem,
} from './partnerExpertMenu.js';

export function PartnerExpertMenuContent({
  onClose,
}: {
  readonly onClose: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const partnerExpert = usePartnerExpert();
  const { snapshot: extensions } = useSpaceExtensions();
  const [catalog, setCatalog] = useState<readonly PartnerExpertMenuItem[]>([]);
  const [recency, setRecency] = useState<string[]>(() => readPartnerExpertRecency(localStorage));
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (extensions.loading) {
      setLoading(true);
      return;
    }
    const sources = extensions.extensions.filter(
      (extension) => extension.enabled && extension.expertCount,
    );
    let current = true;
    setLoading(true);
    setError(extensions.error);
    void Promise.all(
      sources.map(async (extension) => {
        const { experts } = await invokeExtensionHost('space.extensions.catalog', {
          extensionId: extension.id,
        });
        return experts.map((expert) => ({
          extensionId: extension.id,
          extensionName: extension.name,
          expert,
        }));
      }),
    )
      .then((groups) => {
        if (!current) return;
        setCatalog(groups.flat());
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!current) return;
        setCatalog([]);
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [extensions.error, extensions.extensions, extensions.loading]);

  const visible = useMemo(() => visiblePartnerExperts(catalog, recency), [catalog, recency]);
  const selected = partnerExpert?.snapshot.state.expert;

  const select = async (item: PartnerExpertMenuItem): Promise<void> => {
    if (!partnerExpert || partnerExpert.snapshot.context.surface !== 'partner') return;
    const key = `${item.extensionId}:${item.expert.id}`;
    setSelecting(key);
    setError(null);
    try {
      await partnerExpert.binding.select({
        extensionId: item.extensionId,
        expertId: item.expert.id,
        revision: item.expert.revision,
      });
      setRecency(recordPartnerExpertUsage(localStorage, item));
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSelecting(null);
    }
  };

  return (
    <div data-testid="partner-expert-menu-content">
      {loading && (
        <p role="status" className="px-3 py-2 text-xs text-fg-muted">
          {t('attach.loading')}
        </p>
      )}
      {!loading && visible.length === 0 && !error && (
        <p className="px-3 py-2 text-xs text-fg-muted">{t('extensions.noExperts')}</p>
      )}
      {visible.map((item) => {
        const key = `${item.extensionId}:${item.expert.id}`;
        const active =
          selected?.extensionId === item.extensionId && selected.expert.id === item.expert.id;
        return (
          <button
            key={key}
            type="button"
            disabled={selecting !== null || partnerExpert?.snapshot.changing}
            onClick={() => void select(item)}
            aria-current={active ? 'true' : undefined}
            title={item.expert.description}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-hover-bg disabled:opacity-50 ${active ? 'bg-hover-bg text-fg-primary' : 'text-fg-secondary'}`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-ink">
              <UserRound className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate">{item.expert.name}</span>
          </button>
        );
      })}
      {error && (
        <p role="alert" className="px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="mt-1 border-t border-border-default pt-1">
        <button
          type="button"
          onClick={() => {
            if (partnerExpert) requestPartnerExpertManagement(partnerExpert.snapshot.context);
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg-secondary hover:bg-hover-bg"
        >
          <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-muted" strokeWidth={1.75} aria-hidden />
          <span>{t('extensions.moreExperts')}</span>
        </button>
      </div>
    </div>
  );
}
