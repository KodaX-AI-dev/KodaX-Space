import { useEffect, useRef, useState } from 'react';
import type { ChannelInput, ChannelOutput } from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import type { PartnerDetailOpenTarget } from '../partner/partnerDetailWorkspace.js';
import { invokeExtensionHost } from './SpaceExtensionsProvider.js';
import { usePartnerConnectors } from './PartnerConnectorProvider.js';
import { expertContextMatches } from './partnerExpertBinding.js';

const inputClass = 'mt-1 w-full rounded-md border border-border-default bg-surface px-2 py-1.5';
const buttonClass =
  'rounded-md border border-border-default px-2.5 py-1.5 hover:bg-hover-bg disabled:opacity-40';
type MailQuery = ChannelInput<'partner.connectors.search'>['query'];
type SearchResult = ChannelOutput<'partner.connectors.search'>;

/** Search stays within the saved inbox scope; only explicitly read mail becomes a source. */
export function PartnerMailboxSearch({
  connectionId,
  connectionRevision,
  onOpenDetail,
}: {
  readonly connectionId: string;
  readonly connectionRevision: number;
  readonly onOpenDetail?: (target: PartnerDetailOpenTarget) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const context = usePartnerConnectors();
  const [query, setQuery] = useState<MailQuery>({});
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (!context) return null;
  const { snapshot, binding } = context;
  const scope = snapshot.context;
  const allowed = (current: typeof snapshot): boolean =>
    !current.loading &&
    !current.changing &&
    !current.error &&
    current.state.connectors.some(
      (item) =>
        item.available &&
        item.binding.connectionId === connectionId &&
        item.binding.connectionRevision === connectionRevision &&
        item.binding.mailbox === 'inbox',
    );
  const isActive = (): boolean =>
    mounted.current &&
    expertContextMatches(scope, {
      surface: useSurfaceStore.getState().currentSurface,
      projectRoot: useAppStore.getState().currentProjectPath,
      sessionId: useAppStore.getState().currentSessionId,
    }) &&
    expertContextMatches(scope, binding.getSnapshot().context) &&
    allowed(binding.getSnapshot());
  const updateQuery = (patch: Partial<MailQuery>): void => {
    setQuery((current) => ({ ...current, ...patch }));
    setResult(null);
    setError(null);
    setFeedback(null);
  };
  const act = async (action: () => Promise<void>): Promise<void> => {
    if (busy || !isActive()) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await action();
    } catch (reason) {
      if (isActive()) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const owner = { projectRoot: scope.projectRoot!, sessionId: scope.sessionId!, connectionId };
  const search = async (cursor?: string): Promise<void> => {
    const normalizedQuery = Object.fromEntries(
      Object.entries(query).filter(
        ([, value]) => value !== undefined && value !== '' && value !== false,
      ),
    ) as MailQuery;
    const next = await invokeExtensionHost('partner.connectors.search', {
      ...owner,
      query: normalizedQuery,
      ...(cursor ? { cursor } : {}),
      limit: 25,
    });
    if (isActive()) setResult(next);
  };
  const read = async (reference: string): Promise<void> => {
    const { source } = await invokeExtensionHost('partner.connectors.read', {
      ...owner,
      documentUrl: reference,
    });
    if (!isActive()) return;
    if (
      source.projectRoot !== scope.projectRoot ||
      source.sessionId !== scope.sessionId ||
      source.connectionId !== connectionId
    )
      throw new Error(t('connectors.scopeChanged'));
    if (onOpenDetail)
      onOpenDetail({ kind: 'remoteSource', sourceId: source.id, title: source.title });
    else setFeedback(t('connectors.remoteSources'));
  };
  return (
    <section
      className="space-y-3 rounded-lg border border-border-default p-3 text-xs"
      data-testid="partner-mailbox-search"
    >
      <h3 className="font-medium">{t('connectors.mailboxSearch')}</h3>
      {!scope.sessionId ? (
        <p className="text-fg-muted">{t('connectors.sessionRequired')}</p>
      ) : !allowed(snapshot) ? (
        <p className="text-fg-muted">{t('connectors.mailSaveScope')}</p>
      ) : (
        <>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void act(() => search());
            }}
          >
            <label className="block">
              {t('connectors.mailSubject')}
              <input
                className={inputClass}
                value={query.subject ?? ''}
                maxLength={200}
                disabled={busy}
                onChange={(event) => updateQuery({ subject: event.target.value })}
              />
            </label>
            <label className="block">
              {t('connectors.mailFrom')}
              <input
                className={inputClass}
                value={query.from ?? ''}
                maxLength={200}
                disabled={busy}
                onChange={(event) => updateQuery({ from: event.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                {t('connectors.mailSince')}
                <input
                  type="date"
                  className={inputClass}
                  value={query.since ?? ''}
                  disabled={busy}
                  onChange={(event) => updateQuery({ since: event.target.value })}
                />
              </label>
              <label>
                {t('connectors.mailBefore')}
                <input
                  type="date"
                  className={inputClass}
                  value={query.before ?? ''}
                  disabled={busy}
                  onChange={(event) => updateQuery({ before: event.target.value })}
                />
              </label>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={query.unreadOnly ?? false}
                disabled={busy}
                onChange={(event) => updateQuery({ unreadOnly: event.target.checked })}
              />
              {t('connectors.mailUnreadOnly')}
            </label>
            <button className={buttonClass} type="submit" disabled={busy}>
              {busy ? t('connectors.busy') : t('connectors.mailSearch')}
            </button>
          </form>
          {result && (
            <div className="space-y-3" aria-live="polite">
              {!result.messages.length && (
                <p className="text-fg-muted">{t('connectors.mailNoResults')}</p>
              )}
              {result.messages.map((message) => (
                <article
                  key={message.reference}
                  className="space-y-2 border-t border-border-default pt-3"
                >
                  <h4 className="break-words font-medium">
                    {message.subject || t('connectors.mailUntitled')}
                  </h4>
                  <p className="break-words text-fg-muted">{message.from}</p>
                  {message.date && <p className="text-fg-muted">{message.date}</p>}
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void act(() => read(message.reference))}
                  >
                    {t('connectors.mailRead')}
                  </button>
                </article>
              ))}
              {result.hasMore && result.nextCursor && (
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void act(() => search(result.nextCursor))}
                >
                  {t('connectors.mailNextPage')}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="break-words text-danger">
          {error}
        </p>
      )}
      {feedback && <p role="status">{feedback}</p>}
    </section>
  );
}
