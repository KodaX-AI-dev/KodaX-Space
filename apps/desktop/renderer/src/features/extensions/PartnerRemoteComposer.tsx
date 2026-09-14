import { useEffect, useRef, useState } from 'react';
import {
  partnerConnectorSupports,
  projectPartnerConnectorResource,
} from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import { invokeExtensionHost } from './SpaceExtensionsProvider.js';
import { usePartnerConnectors } from './PartnerConnectorProvider.js';

const inputClass = 'w-full rounded-md border border-border-default bg-surface px-2 py-1.5 text-xs';
const buttonClass =
  'rounded-md border border-border-default px-2.5 py-1.5 text-xs hover:bg-hover-bg disabled:opacity-40';
export function PartnerRemoteComposer({
  extensionId,
  connectorId,
}: {
  readonly extensionId: string;
  readonly connectorId: string;
}): JSX.Element | null {
  const { t } = useI18n();
  const context = usePartnerConnectors();
  const selected =
    context?.snapshot.state.connectors.filter(
      (item) =>
        item.binding.extensionId === extensionId &&
        item.binding.connectorId === connectorId &&
        item.available &&
        partnerConnectorSupports(item.binding.adapter ?? 'feishu-cli', 'read'),
    ) ?? [];
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (!selected.length) return null;
  const scope = context!.snapshot.context;
  const targets = selected.flatMap(({ binding }) =>
    binding.documents.flatMap((document) => {
      const adapter = binding.adapter ?? 'feishu-cli';
      const resource = projectPartnerConnectorResource(document.url, adapter);
      if (!resource) return [];
      return [
        {
          connectionId: binding.connectionId,
          url: resource.canonicalRef,
          kind: resource.kind,
          operation:
            document.access === 'append' && partnerConnectorSupports(adapter, 'append')
              ? ('append' as const)
              : ('read' as const),
          label: binding.accountLabel,
        },
      ];
    }),
  );
  if (!targets.length) return null;
  const key = (item: (typeof targets)[number]) => `${item.connectionId}:${item.url}`;
  const active = targets.find((item) => key(item) === target) ?? targets[0];
  const act = async (read: boolean): Promise<void> => {
    if (busy || !active || !scope.projectRoot || !scope.sessionId) return;
    setBusy(true);
    setFeedback(null);
    const isActive = () =>
      mounted.current &&
      useAppStore.getState().currentProjectPath === scope.projectRoot &&
      useAppStore.getState().currentSessionId === scope.sessionId;
    try {
      const owner = {
        projectRoot: scope.projectRoot,
        sessionId: scope.sessionId,
        connectionId: active.connectionId,
      };
      if (read)
        await invokeExtensionHost('partner.connectors.read', { ...owner, documentUrl: active.url });
      else if (active.operation !== 'read')
        await invokeExtensionHost('partner.connectors.proposals.create', {
          ...owner,
          operation: active.operation,
          targetUrl: active.url,
          title,
          content,
          rationale: '',
        });
      if (isActive())
        setFeedback(t(read ? 'connectors.remoteSources' : 'connectors.remoteReviews'));
    } catch (reason) {
      if (isActive()) setFeedback(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (isActive()) setBusy(false);
    }
  };
  return (
    <section
      className="space-y-3 rounded-lg border border-border-default p-3 text-xs"
      data-testid="partner-remote-composer"
    >
      <h3 className="font-medium">{t('connectors.selected')}</h3>
      {!scope.sessionId ? (
        <p className="text-fg-muted">{t('connectors.sessionRequired')}</p>
      ) : (
        <>
          <label className="block">
            {t('connectors.target')}
            <select
              className={inputClass}
              value={active ? key(active) : ''}
              disabled={busy}
              onChange={(event) => setTarget(event.target.value)}
            >
              {targets.map((item) => (
                <option key={key(item)} value={key(item)}>
                  {item.label} · {item.url}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={buttonClass}
            disabled={busy || !active}
            onClick={() => void act(true)}
          >
            {t(active?.kind === 'document' ? 'connectors.readNow' : 'connectors.readResourceNow')}
          </button>
          {active && active.operation !== 'read' && (
            <>
              <p className="text-fg-muted">{t('connectors.proposalHint')}</p>
              <label className="block">
                {t('connectors.proposalTitle')}
                <input
                  className={inputClass}
                  maxLength={280}
                  value={title}
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="block">
                {t('connectors.content')}
                <textarea
                  className={inputClass}
                  rows={7}
                  maxLength={131072}
                  value={content}
                  disabled={busy}
                  onChange={(event) => setContent(event.target.value)}
                />
              </label>
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !title.trim() || !content.trim()}
                onClick={() => void act(false)}
              >
                {t('connectors.propose')}
              </button>
            </>
          )}
        </>
      )}
      {feedback && (
        <p role="status" className="break-words">
          {feedback}
        </p>
      )}
    </section>
  );
}
