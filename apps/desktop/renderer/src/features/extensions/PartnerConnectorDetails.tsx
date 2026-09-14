import { useCallback, useEffect, useRef, useState } from 'react';
import {
  partnerConnectorSelectionSchema,
  partnerConnectorSupports,
  type PartnerConnectorConnectionT,
  type SpaceConnectorDefinitionT,
} from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { requestConfirm } from '../../store/confirmStore.js';
import { invokeExtensionHost, useSpaceExtensions } from './SpaceExtensionsProvider.js';
import { requestPartnerConnectorDialog, usePartnerConnectors } from './PartnerConnectorProvider.js';
import { expertContextMatches } from './partnerExpertBinding.js';
import type { PartnerDetailOpenTarget } from '../partner/partnerDetailWorkspace.js';
import { PartnerMailboxSearch } from './PartnerMailboxSearch.js';
import { PartnerRemoteComposer } from './PartnerRemoteComposer.js';
import { PartnerConnectorIcon } from './PartnerConnectorIcon.js';
import { projectPartnerConnectorGuidance } from './partnerConnectorGuidance.js';
import { requestPartnerSkillDraft as requestPartnerDraft } from '../partner/partnerSkillDraft.js';
import {
  connectorPresentation,
  isConfigurationRequiredConnector,
} from './partnerConnectorPresentation.js';

export const connectorButtonClass =
  'rounded-md border border-border-default px-2.5 py-1.5 text-xs hover:bg-hover-bg disabled:opacity-40';
export const connectorInputClass =
  'w-full rounded-md border border-border-default bg-surface px-2 py-1.5 text-xs';

/** Exact document scope stays in the host; account setup has its own connection dialog. */
export function PartnerConnectorDetails({
  extensionId,
  connector,
  connectionId,
  onOpenDetail,
}: {
  readonly extensionId: string;
  readonly connector: SpaceConnectorDefinitionT;
  readonly connectionId?: string;
  readonly onOpenDetail?: (target: PartnerDetailOpenTarget) => void;
}): JSX.Element {
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const surface = useSurfaceStore((state) => state.currentSurface);
  const { snapshot } = useSpaceExtensions();
  const installed = snapshot.extensions.find((item) => item.id === extensionId);
  const key = JSON.stringify([
    surface,
    projectRoot,
    sessionId,
    installed?.version,
    installed?.installedAt,
    installed?.enabled,
    connectionId,
  ]);
  return (
    <ConnectorDetailsContent
      key={key}
      extensionId={extensionId}
      connector={connector}
      initialConnectionId={connectionId}
      onOpenDetail={onOpenDetail}
    />
  );
}

function ConnectorDetailsContent({
  extensionId,
  connector,
  initialConnectionId,
  onOpenDetail,
}: {
  readonly extensionId: string;
  readonly connector: SpaceConnectorDefinitionT;
  readonly initialConnectionId?: string;
  readonly onOpenDetail?: (target: PartnerDetailOpenTarget) => void;
}): JSX.Element {
  const { t } = useI18n();
  const supportsAppend = partnerConnectorSupports(connector.adapter, 'append');
  const supportsCreateDocument = partnerConnectorSupports(connector.adapter, 'createDocument');
  const supportsCreateBase = partnerConnectorSupports(connector.adapter, 'createBase');
  const readOnly = !supportsAppend && !supportsCreateDocument && !supportsCreateBase;
  const mailboxConnector =
    connector.adapter === 'netease-mail-imap' || connector.adapter === 'qq-mail-imap';
  const tencentDocs = connector.adapter === 'tencent-docs-mcp';
  const configurationRequired = isConfigurationRequiredConnector(connector.adapter);
  const presentation = connectorPresentation[connector.adapter];
  const context = usePartnerConnectors();
  const { catalog, snapshot: extensions } = useSpaceExtensions();
  const [connections, setConnections] = useState<PartnerConnectorConnectionT[]>([]);
  const [connectionId, setConnectionId] = useState(initialConnectionId ?? '');
  const [documents, setDocuments] = useState<{ url: string; access: 'read' | 'append' }[]>([]);
  const [folder, setFolder] = useState('');
  const [baseFolder, setBaseFolder] = useState('');
  const [mailboxEnabled, setMailboxEnabled] = useState(false);
  const [allowCreateDocument, setAllowCreateDocument] = useState(false);
  const [writesAllowed, setWritesAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  const loadRevision = useRef(0);
  const scope = context?.snapshot.context;
  const installed = extensions.extensions.find((item) => item.id === extensionId);
  const installedIdentity = installed ? `${installed.version}:${installed.installedAt}` : null;
  const isActive = useCallback((): boolean => {
    const current = catalog
      .getSnapshot()
      .extensions.find((item) => item.id === extensionId && item.enabled);
    return (
      mounted.current &&
      !!current &&
      `${current.version}:${current.installedAt}` === installedIdentity &&
      !!scope &&
      expertContextMatches(scope, {
        surface: useSurfaceStore.getState().currentSurface,
        projectRoot: useAppStore.getState().currentProjectPath,
        sessionId: useAppStore.getState().currentSessionId,
      })
    );
  }, [catalog, extensionId, installedIdentity, scope]);
  const load = useCallback(async (): Promise<void> => {
    const revision = ++loadRevision.current;
    setError(null);
    try {
      const [next, policy] = await Promise.all([
        invokeExtensionHost('partner.connectors.accounts', {
          extensionId,
          connectorId: connector.id,
        }),
        readOnly ? Promise.resolve(null) : invokeExtensionHost('admin.policy.get', undefined),
      ]);
      if (!isActive() || revision !== loadRevision.current) return;
      setConnections(next.connections);
      setWritesAllowed(policy?.policy.connectors.writesAllowed ?? null);
      setConnectionId((current) =>
        configurationRequired
          ? ''
          : next.connections.some((item) => item.id === current)
            ? current
            : (next.connections.find((item) => item.connected)?.id ?? ''),
      );
    } catch (reason) {
      if (isActive() && revision === loadRevision.current)
        setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [configurationRequired, extensionId, connector.id, isActive, readOnly]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadRevision.current += 1;
    };
  }, [load]);
  const savedBinding = context?.snapshot.state.connectors.find(
    (item) => item.binding.connectionId === connectionId,
  )?.binding;
  const savedScope = JSON.stringify({
    documents: savedBinding?.documents ?? [],
    folder: savedBinding?.createFolderUrl ?? '',
    baseFolder: savedBinding?.createBaseFolderUrl ?? '',
    mailboxEnabled: savedBinding?.mailbox === 'inbox',
    allowCreateDocument: savedBinding?.allowCreateDocument === true,
  });
  useEffect(() => {
    // Availability and record refreshes must not replace unsaved scope edits.
    const saved = JSON.parse(savedScope) as {
      documents: { url: string; access: 'read' | 'append' }[];
      folder: string;
      baseFolder: string;
      mailboxEnabled: boolean;
      allowCreateDocument: boolean;
    };
    setDocuments(saved.documents);
    setFolder(saved.folder);
    setBaseFolder(saved.baseFolder);
    setMailboxEnabled(saved.mailboxEnabled);
    setAllowCreateDocument(saved.allowCreateDocument);
  }, [connectionId, savedScope]);
  const perform = async (action: () => Promise<void>): Promise<void> => {
    if (busy || !isActive()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (reason) {
      if (isActive()) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (isActive()) setBusy(false);
    }
  };
  const connection = connections.find((item) => item.id === connectionId && item.connected);
  const selected =
    context?.snapshot.state.connectors.some((item) => item.binding.connectionId === connectionId) ??
    false;
  const actions = projectPartnerConnectorGuidance(
    {
      connectors:
        context?.snapshot.state.connectors.filter(
          (item) => item.binding.connectionId === connectionId,
        ) ?? [],
    },
    t,
  ).flatMap((group) => group.actions);
  const staleBindings = configurationRequired
    ? (context?.snapshot.state.connectors.filter(
        (item) =>
          item.binding.extensionId === extensionId && item.binding.connectorId === connector.id,
      ) ?? [])
    : [];
  const save = async (): Promise<void> => {
    if (!connection || !context) return;
    const latest = context.binding.getSnapshot();
    if (
      !scope ||
      !expertContextMatches(latest.context, scope) ||
      latest.loading ||
      latest.changing ||
      latest.error
    )
      return;
    const parsed = partnerConnectorSelectionSchema.safeParse({
      extensionId,
      connectorId: connector.id,
      connectionId: connection.id,
      connectionRevision: connection.revision,
      ...(connector.adapter !== 'feishu-cli' ? { adapter: connector.adapter } : {}),
      documents: documents.map((item) => ({ ...item, url: item.url.trim() })),
      ...(mailboxConnector && mailboxEnabled ? { mailbox: 'inbox' } : {}),
      ...(tencentDocs && allowCreateDocument ? { allowCreateDocument: true } : {}),
      ...(folder.trim() ? { createFolderUrl: folder.trim() } : {}),
      ...(baseFolder.trim() ? { createBaseFolderUrl: baseFolder.trim() } : {}),
    });
    if (!parsed.success)
      throw new Error(t(readOnly ? 'connectors.invalidResourceScope' : 'connectors.invalidScope'));
    await context.binding.select(parsed.data);
    if (isActive()) setNotice(t('connectors.saved'));
  };
  const changePolicy = async (): Promise<void> => {
    if (
      writesAllowed === null ||
      !(await requestConfirm({ message: t('connectors.policyConfirm'), danger: true }))
    )
      return;
    if (!isActive()) return;
    const result = await invokeExtensionHost('admin.policy.set', {
      connectors: { writesAllowed: !writesAllowed },
    });
    if (isActive()) setWritesAllowed(result.policy.connectors.writesAllowed);
  };
  const removeStoredAccount = async (account: PartnerConnectorConnectionT): Promise<void> => {
    if (
      !(await requestConfirm({
        message: t('connectors.providerDisconnect'),
        danger: true,
      })) ||
      !isActive()
    )
      return;
    try {
      await invokeExtensionHost('partner.connectors.forget', {
        extensionId,
        connectorId: connector.id,
        connectionId: account.id,
        connectionRevision: account.revision,
      });
    } finally {
      if (isActive()) await load();
    }
    if (!isActive()) return;
    await context?.refreshCatalog();
  };
  return (
    <div className="h-full space-y-5 overflow-y-auto p-4" data-testid="partner-connector-details">
      <header>
        <div className="flex items-center gap-2.5">
          <PartnerConnectorIcon
            adapter={connector.adapter}
            className="h-6 w-6 shrink-0 text-accent-ink"
          />
          <h2 className="text-base font-medium">{connector.name}</h2>
        </div>
        <p className="mt-2 text-xs leading-5 text-fg-muted">{t(presentation.requirementsKey)}</p>
      </header>
      {actions.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium">{t('extensions.connectorActions')}</h3>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={connectorButtonClass}
                disabled={busy || context?.snapshot.loading || context?.snapshot.changing}
                onClick={() => {
                  if (
                    isActive() &&
                    context?.binding
                      .getSnapshot()
                      .state.connectors.some(
                        (item) => item.binding.connectionId === connectionId && item.available,
                      )
                  )
                    requestPartnerDraft(action.promptTemplate);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-5 text-fg-muted">
            {t('extensions.expertStarterTasksHint')}
          </p>
        </section>
      )}
      {!installed?.enabled && (
        <p role="alert" className="text-xs text-danger">
          {t('connectors.unavailable')}
        </p>
      )}
      <button
        type="button"
        className={connectorButtonClass}
        disabled={busy || !installed?.enabled}
        onClick={() =>
          void perform(async () => {
            await Promise.all([load(), context?.binding.refresh()]);
          })
        }
      >
        {t('connectors.refresh')}
      </button>
      {(error || context?.snapshot.error) && (
        <p role="alert" className="break-words text-xs text-danger">
          {error || context?.snapshot.error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-fg-muted">
          {notice}
        </p>
      )}
      <button
        type="button"
        className={connectorButtonClass}
        disabled={!installed?.enabled || !scope}
        onClick={() => {
          if (scope)
            requestPartnerConnectorDialog({ context: scope, extensionId, connector, connectionId });
        }}
      >
        {t('connectors.manage')}
      </button>
      {configurationRequired ? (
        <section className="space-y-3 rounded-lg border border-border-default p-3 text-xs">
          <p className="text-fg-muted">{t('connectors.productAppRequiredHint')}</p>
          {staleBindings.map((item) => (
            <button
              key={item.binding.connectionId}
              type="button"
              className={connectorButtonClass}
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await context?.binding.remove(item.binding.connectionId);
                })
              }
            >
              {t('connectors.removeUnavailable', { name: item.binding.name })}
            </button>
          ))}
          {connections.map((account) => (
            <button
              key={account.id}
              type="button"
              className={connectorButtonClass}
              disabled={busy}
              onClick={() => void perform(() => removeStoredAccount(account))}
            >
              {t('connectors.removeLocalAccount', { name: account.accountLabel })}
            </button>
          ))}
        </section>
      ) : (
        <section className="space-y-3 rounded-lg border border-border-default p-3 text-xs">
          <label className="block">
            {t('connectors.account')}
            <select
              className={`${connectorInputClass} mt-2`}
              value={connectionId}
              onChange={(event) => setConnectionId(event.target.value)}
              disabled={busy}
            >
              <option value="">{t('connectors.selectAccount')}</option>
              {connections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.accountLabel}
                  {!item.connected ? ` · ${t('connectors.unavailable')}` : ''}
                </option>
              ))}
            </select>
          </label>
          {connection && (
            <p className="text-fg-muted">
              {t(selected ? 'connectors.selected' : 'connectors.notSelected')}
            </p>
          )}
        </section>
      )}
      {!configurationRequired && connection && (
        <section className="space-y-3 rounded-lg border border-border-default p-3 text-xs">
          <h3 className="font-medium">
            {t(readOnly ? 'connectors.resourceScope' : 'connectors.scope')}
          </h3>
          <p className="text-fg-muted">
            {t(
              mailboxConnector
                ? 'connectors.mailboxScopeHint'
                : tencentDocs
                  ? 'connectors.tencentDocsHint'
                  : readOnly
                    ? 'connectors.readOnlyScopeHint'
                    : 'connectors.scopeHint',
            )}
          </p>
          {mailboxConnector && (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={mailboxEnabled}
                disabled={busy}
                onChange={(event) => setMailboxEnabled(event.target.checked)}
              />
              {t('connectors.mailboxScope')}
            </label>
          )}
          {!mailboxConnector &&
            documents.map((document, index) => (
              <div key={index} className="space-y-1">
                <input
                  aria-label={`${t('connectors.target')} ${index + 1}`}
                  className={connectorInputClass}
                  value={document.url}
                  disabled={busy}
                  placeholder={presentation.placeholder}
                  onChange={(event) =>
                    setDocuments((items) =>
                      items.map((item, i) =>
                        i === index ? { ...item, url: event.target.value } : item,
                      ),
                    )
                  }
                />
                <div className="flex gap-2">
                  <select
                    aria-label={t('connectors.scope')}
                    className={connectorInputClass}
                    value={document.access}
                    disabled={busy}
                    onChange={(event) =>
                      setDocuments((items) =>
                        items.map((item, i) =>
                          i === index
                            ? { ...item, access: event.target.value as 'read' | 'append' }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="read">{t('connectors.read')}</option>
                    {supportsAppend && (
                      <option value="append" disabled={!connection.permissions.append}>
                        {t('connectors.append')}
                      </option>
                    )}
                  </select>
                  <button
                    type="button"
                    className={connectorButtonClass}
                    disabled={busy}
                    aria-label={`${t('connectors.remove')} ${index + 1}`}
                    onClick={() => setDocuments((items) => items.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          {!mailboxConnector && (
            <button
              type="button"
              className={connectorButtonClass}
              disabled={busy || documents.length >= 32}
              onClick={() => setDocuments((items) => [...items, { url: '', access: 'read' }])}
            >
              {t(readOnly ? 'connectors.addResource' : 'connectors.addDocument')}
            </button>
          )}
          {tencentDocs && (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={allowCreateDocument}
                disabled={busy || !connection.permissions.create}
                onChange={(event) => setAllowCreateDocument(event.target.checked)}
              />
              {t('connectors.allowCreateDocument')}
            </label>
          )}
          {supportsCreateDocument && !tencentDocs && (
            <label className="block">
              {t('connectors.folder')}
              <input
                className={`${connectorInputClass} mt-2`}
                value={folder}
                disabled={busy || !connection.permissions.create}
                placeholder="https://example.feishu.cn/drive/folder/…"
                onChange={(event) => setFolder(event.target.value)}
              />
            </label>
          )}
          {supportsCreateBase && (
            <>
              <label className="block">
                {t('connectors.baseFolder')}
                <input
                  className={`${connectorInputClass} mt-2`}
                  value={baseFolder}
                  disabled={busy || !connection.permissions.createBase}
                  placeholder="https://example.feishu.cn/drive/folder/…"
                  onChange={(event) => setBaseFolder(event.target.value)}
                />
              </label>
              {!connection.permissions.createBase ? (
                <p className="text-fg-muted">{t('connectors.basePermissionRequired')}</p>
              ) : null}
            </>
          )}
          <button
            type="button"
            className={connectorButtonClass}
            disabled={
              busy ||
              context?.snapshot.loading ||
              context?.snapshot.changing ||
              !!context?.snapshot.error ||
              !scope?.projectRoot
            }
            onClick={() => void perform(save)}
          >
            {t('connectors.save')}
          </button>
        </section>
      )}
      {!readOnly && (
        <section className="space-y-2 rounded-lg border border-border-default p-3 text-xs">
          <p>
            {t(
              writesAllowed === null
                ? 'connectors.policyUnknown'
                : writesAllowed
                  ? 'connectors.policyOn'
                  : 'connectors.policyOff',
            )}
          </p>
          <button
            type="button"
            className={connectorButtonClass}
            disabled={busy || writesAllowed === null || !installed?.enabled}
            onClick={() => void perform(changePolicy)}
          >
            {t(writesAllowed ? 'connectors.blockWrites' : 'connectors.allowWrites')}
          </button>
        </section>
      )}
      {mailboxConnector && connection && (
        <PartnerMailboxSearch
          key={connection.id + ':' + connection.revision}
          connectionId={connection.id}
          connectionRevision={connection.revision}
          onOpenDetail={onOpenDetail}
        />
      )}
      {!mailboxConnector && (
        <PartnerRemoteComposer extensionId={extensionId} connectorId={connector.id} />
      )}
    </div>
  );
}
