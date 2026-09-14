import { createHash, randomUUID } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import {
  partnerConnectorConnectionSchema,
  partnerConnectorSearchInputSchema,
  partnerConnectorSearchResultSchema,
  partnerConnectorDocumentCreateInputSchema,
  partnerMailboxAllowsResource,
  isPartnerMailAdapter,
  tencentDocumentUrlSchema,
  type PartnerConnectorSearchInputT,
  type PartnerConnectorSearchResultT,
  type PartnerConnectorDocumentCreateInputT,
  partnerConnectorSelectionsSchema,
  partnerRemoteProposalInputSchema,
  partnerRemoteProposalSchema,
  partnerRemoteSourceSchema,
  partnerRemoteReceiptSchema,
  partnerFeishuDocumentCreateInputSchema,
  partnerFeishuBaseCreateInputSchema,
  partnerFeishuBaseCreateTaskSchema,
  partnerNativeDocumentTaskSchema,
  partnerNativeDocumentEligibilitySchema,
  FEISHU_MY_LIBRARY_TARGET,
  feishuFolderUrlSchema,
  feishuProfileSchema,
  partnerConnectorResourceKey,
  partnerReadResourceSchema,
  type PartnerConnectorConnectionT,
  type PartnerConnectorInspectionT,
  type PartnerConnectorSelectionT,
  type PartnerConnectorSnapshotT,
  type PartnerConnectorStateT,
  type PartnerRemoteProposalInputT,
  type PartnerRemoteProposalT,
  type PartnerRemoteSourceT,
  type PartnerRemoteRecordsT,
  type PartnerFeishuDocumentCreateInputT,
  type PartnerFeishuBaseCreateInputT,
  type PartnerFeishuBaseCreateTaskT,
  type PartnerNativeDocumentTaskT,
  type PartnerNativeDocumentEligibilityT,
  type SpaceConnectorDefinitionT,
  type SpaceExtensionHostCapabilityT,
  type Surface,
  type PermissionMode,
} from '@kodax-space/space-ipc-schema';
import {
  FeishuCli,
  FeishuCliError,
  type FeishuBaseWriteResult,
  type FeishuWriteResult,
} from './feishu-cli.js';
import { FEISHU_BASE_CREATE_SCOPES } from './feishu-scopes.js';
import { FEISHU_CLI_VERSION } from './feishu-cli-release.js';
import {
  MAX_PARTNER_CONNECTOR_ACCOUNTS,
  PartnerConnectorStore,
  type ConnectorAccount,
} from './store.js';
import {
  checkReadConnectorDocument,
  type ReadConnector,
  type ReadConnectorId,
  type ReadConnectorDocument,
} from './read-connector.js';

export interface PartnerConnectorContext {
  sessionId: string;
  projectRoot: string;
  surface: Surface;
  permissionMode: PermissionMode;
  bindings: readonly PartnerConnectorSnapshotT[];
  getCurrentBindings?: () => readonly PartnerConnectorSnapshotT[];
  getCurrentPermissionMode?: () => PermissionMode;
  /** Host-owned per-admitted-turn identity; never model or renderer input. */
  nativeDocumentDelivery?: { readonly turnExecutionId: string };
}
/** Main-owned task lease; never accepted from IPC or an extension package. */
export interface PartnerConnectorConnectionLease {
  readonly signal?: AbortSignal;
  readonly expectedAdapter?: ReadConnectorId;
  assertActive(): void;
  complete(connection: PartnerConnectorConnectionT): void;
}
export class PartnerConnectorCommitError extends Error {
  constructor() {
    super('连接取消后的本地清理未完成，请检查并断开该账号后重试');
    this.name = 'PartnerConnectorCommitError';
  }
}
interface Dependencies {
  cli: Pick<FeishuCli, 'inspect' | 'listProfiles' | 'read' | 'create' | 'append' | 'createBase'>;
  readConnectors?: Partial<Record<ReadConnectorId, ReadConnector>>;
  catalog: (extensionId: string) => Promise<SpaceConnectorDefinitionT[]>;
  checkPolicy: (connectorId: string, write: boolean) => Promise<void>;
  getPolicyRevision?: () => number;
  changed?: (context?: {
    sessionId?: string;
    projectRoot?: string;
    extensionId?: string;
    baseTaskId?: string;
    documentTaskId?: string;
    recordRevision?: number;
  }) => void;
  revokeConnections?: (extensionId?: string) => Promise<void>;
  extensionCapabilities?: (
    extensionId: string,
  ) => Promise<readonly SpaceExtensionHostCapabilityT[]>;
}
interface ConnectorAuthorization {
  readonly binding: PartnerConnectorSnapshotT;
  readonly account: ConnectorAccount;
  readonly assertLive: () => void;
}
interface BaseDispatchGate {
  readonly beforeDispatch: () => Promise<void>;
  readonly assertDispatch: () => void;
  readonly wasClaimed: () => boolean;
  readonly wasAdmitted: () => boolean;
}
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const scopeHash = (binding: PartnerConnectorSnapshotT): string =>
  digest(
    JSON.stringify({
      extensionId: binding.extensionId,
      connectorId: binding.connectorId,
      connectionId: binding.connectionId,
      connectionRevision: binding.connectionRevision,
      ...(binding.adapter ? { adapter: binding.adapter } : {}),
      documents: [...binding.documents].sort((a, b) => a.url.localeCompare(b.url)),
      createFolderUrl: binding.createFolderUrl,
      createBaseFolderUrl: binding.createBaseFolderUrl,
      mailbox: binding.mailbox,
      allowCreateDocument: binding.allowCreateDocument,
    }),
  );
const contentHash = (input: {
  operation: string;
  targetUrl: string;
  title: string;
  content: string;
}): string =>
  digest(JSON.stringify([input.operation, input.targetUrl, input.title, input.content]));
const baseInputHash = (input: PartnerFeishuBaseCreateInputT): string =>
  digest(JSON.stringify([input.folderUrl, input.baseName, input.tableName, input.fields]));
const normalizeDocumentText = (value: string): string =>
  value
    .normalize('NFC')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n$/u, '');
const normalizeDocumentTitle = (value: string): string => normalizeDocumentText(value).trim();
function documentExportTitle(line: string): string | null {
  const value = line.trim();
  const tagged = /^<title>(.*?)<\/title>$/u.exec(value);
  const heading = /^#+\s+(.+?)\s*$/u.exec(value);
  const title = tagged?.[1] ?? heading?.[1];
  if (title === undefined) return null;
  return normalizeDocumentTitle(
    title
      .replace(/&lt;/gu, '<')
      .replace(/&gt;/gu, '>')
      .replace(/&quot;/gu, '"')
      .replace(/&apos;/gu, "'")
      .replace(/&amp;/gu, '&'),
  );
}
const normalizeMarkdownSource = (value: string): string =>
  value.normalize('NFC').replace(/\r\n?/gu, '\n');
const markdownParser = unified().use(remarkParse).use(remarkGfm);
function semanticMarkdownNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticMarkdownNode);
  if (value === null || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'position') result[key] = semanticMarkdownNode(child);
  }
  return result;
}
function markdownContentMatches(left: string, right: string): boolean {
  if (normalizeMarkdownSource(left) === normalizeMarkdownSource(right)) return true;
  try {
    return (
      JSON.stringify(semanticMarkdownNode(markdownParser.parse(left))) ===
      JSON.stringify(semanticMarkdownNode(markdownParser.parse(right)))
    );
  } catch {
    return false;
  }
}
function normalizeDocumentBody(title: string, value: string): string {
  const content = normalizeDocumentText(value);
  const lines = content.split('\n');
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentLine < 0) return content;
  const heading = /^#\s+(.+?)\s*$/u.exec(lines[firstContentLine]!.trim());
  if (!heading || normalizeDocumentTitle(heading[1]!) !== title) return content;
  const body = normalizeDocumentText(
    [...lines.slice(0, firstContentLine), ...lines.slice(firstContentLine + 1)].join('\n'),
  ).replace(/^\n+/u, '');
  return body || content;
}
const documentInputHash = (input: PartnerFeishuDocumentCreateInputT): string =>
  digest(JSON.stringify([input.folderUrl, input.title, input.content]));
function feishuReadBackMatches(
  input: PartnerFeishuDocumentCreateInputT,
  document: { title: string; content: string },
): boolean {
  const lines = normalizeDocumentText(document.content).split('\n');
  const titleIndex = lines.findIndex((line) => line.trim().length > 0);
  if (titleIndex < 0) return false;
  const title = documentExportTitle(lines[titleIndex]!);
  if (title === null) return false;
  const bodyLines = lines.slice(titleIndex + 1);
  return (
    title === input.title &&
    normalizeDocumentTitle(document.title) === input.title &&
    markdownContentMatches(bodyLines.join('\n'), input.content)
  );
}
const baseResultStatus = (result: FeishuBaseWriteResult): PartnerFeishuBaseCreateTaskT['status'] =>
  result.status === 'success' && result.baseToken && result.tableId && result.url
    ? 'succeeded'
    : result.status === 'success'
      ? 'partial'
      : result.status;
const own = (
  context: PartnerConnectorContext,
  record: { sessionId: string; projectRoot: string },
): boolean => context.sessionId === record.sessionId && context.projectRoot === record.projectRoot;
const publicAccount = (account: ConnectorAccount): PartnerConnectorConnectionT => {
  const { appId: _appId, openId: _openId, providerIdentity: _identity, ...value } = account;
  return partnerConnectorConnectionSchema.parse(value);
};

/** Session-local consent on top of the official CLI; never installs SDK/global tools. */
export class PartnerConnectorService {
  private readonly store: PartnerConnectorStore;
  private readonly blocked = new Map<string, number>();
  private readonly active = new Map<Promise<unknown>, string>();
  private readonly activeDocumentInvocations = new Map<
    string,
    Promise<PartnerNativeDocumentTaskT>
  >();
  private readonly accountEpochs = new Map<string, number>();
  private readonly connectorMutationTails = new Map<string, Promise<void>>();
  private revocationEpoch = 0;
  constructor(
    root: string,
    private readonly deps: Dependencies,
  ) {
    this.store = new PartnerConnectorStore(root);
  }
  private async withConnectorMutation<T>(
    extensionId: string,
    connectorId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = JSON.stringify([extensionId, connectorId]);
    const previous = this.connectorMutationTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => current);
    this.connectorMutationTails.set(key, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.connectorMutationTails.get(key) === tail) this.connectorMutationTails.delete(key);
    }
  }
  private async drainActive(extensionId?: string): Promise<void> {
    const key = extensionId ?? '*';
    for (;;) {
      const pending = [...this.active]
        .filter(([, id]) => key === '*' || id === key)
        .map(([promise]) => promise);
      if (pending.length === 0) return;
      await Promise.allSettled(pending);
    }
  }
  async catalog(extensionId: string): Promise<SpaceConnectorDefinitionT[]> {
    if (this.blocked.has('*') || this.blocked.has(extensionId))
      throw new Error('插件正在停用或更新');
    return this.deps.catalog(extensionId);
  }
  private async definition(extensionId: string, connectorId: string) {
    const definition = (await this.catalog(extensionId)).find(
      (item) =>
        item.id === connectorId &&
        (item.adapter === 'feishu-cli' || !!this.deps.readConnectors?.[item.adapter]),
    );
    if (!definition) throw new Error('连接器已不可用');
    return definition;
  }
  async onboardingAdapter(
    extensionId: string,
    connectorId: string,
  ): Promise<ReadConnector | undefined> {
    const definition = await this.definition(extensionId, connectorId);
    return definition.adapter === 'feishu-cli'
      ? undefined
      : this.deps.readConnectors?.[definition.adapter];
  }
  private async verifiedStatus(
    definition: SpaceConnectorDefinitionT,
    profile: string,
    lease?: PartnerConnectorConnectionLease,
  ) {
    if (definition.adapter !== 'feishu-cli') {
      const adapter = this.deps.readConnectors?.[definition.adapter];
      if (!adapter) throw new Error('连接组件不可用');
      const status = await adapter.inspect(profile, lease?.signal);
      if (!status.installed || !status.identity)
        throw new Error(status.reason ?? '账号验证未通过，请重新连接');
      const identity = status.identity;
      if (
        [identity.authorityId, identity.subjectId, identity.label].some(
          (value) =>
            typeof value !== 'string' ||
            !value.trim() ||
            value.length > 160 ||
            /[\u0000-\u001f\u007f]/u.test(value),
        )
      )
        throw new Error('账号身份无法验证');
      return {
        account: { adapter: definition.adapter, providerIdentity: identity },
        label: identity.label,
        permissions: {
          read: true,
          create: !!adapter.createDocument,
          append: false,
          createBase: false,
        },
      };
    }
    const status = await this.deps.cli.inspect(profile, lease?.signal);
    if (!status.installed || status.version !== FEISHU_CLI_VERSION || !status.identity)
      throw new Error(status.reason ?? '飞书连接组件不可用，请更新或重新安装 KodaX Space');
    const identity = status.identity;
    const permissions = {
      read: identity.scopes.includes('docx:document:readonly'),
      create: identity.scopes.includes('docx:document:create'),
      append: identity.scopes.includes('docx:document:write_only'),
      createBase: FEISHU_BASE_CREATE_SCOPES.every((scope) => identity.scopes.includes(scope)),
    };
    if (lease && Object.values(permissions).some((allowed) => !allowed))
      throw new Error('飞书账号缺少向导要求的飞书权限，请重新授权');
    return {
      account: { appId: identity.appId, openId: identity.openId },
      label: identity.label,
      permissions,
    };
  }
  private sameIdentity(a: Partial<ConnectorAccount>, b: Partial<ConnectorAccount>): boolean {
    return (
      (a.adapter ?? 'feishu-cli') === (b.adapter ?? 'feishu-cli') &&
      a.appId === b.appId &&
      a.openId === b.openId &&
      a.providerIdentity?.authorityId === b.providerIdentity?.authorityId &&
      a.providerIdentity?.subjectId === b.providerIdentity?.subjectId
    );
  }
  private feishuArgs(account: ConnectorAccount) {
    if ((account.adapter ?? 'feishu-cli') !== 'feishu-cli' || !account.appId || !account.openId)
      throw new Error('此连接器不支持飞书文档操作');
    return { profile: account.profile, expected: { appId: account.appId, openId: account.openId } };
  }
  async inspect(extensionId: string, connectorId: string): Promise<PartnerConnectorInspectionT> {
    const adapter = await this.onboardingAdapter(extensionId, connectorId);
    if (adapter)
      return {
        installed: false,
        profiles: [],
        reason: '此连接器使用 Space 专用账号配置，请通过连接向导添加。',
        connections: await this.accounts(extensionId, connectorId),
      };
    const status = await this.deps.cli.inspect('default');
    const profiles = status.installed ? await this.deps.cli.listProfiles().catch(() => []) : [];
    return {
      installed: status.installed,
      ...(status.version ? { version: status.version } : {}),
      ...(status.reason ? { reason: status.reason } : {}),
      profiles,
      connections: (await this.store.read()).connections
        .filter((item) => item.extensionId === extensionId && item.connectorId === connectorId)
        .map(publicAccount),
    };
  }
  async accounts(extensionId: string, connectorId: string): Promise<PartnerConnectorConnectionT[]> {
    const accounts = (await this.store.read()).connections.filter(
      (item) => item.extensionId === extensionId && item.connectorId === connectorId,
    );
    let definition: SpaceConnectorDefinitionT;
    try {
      definition = await this.definition(extensionId, connectorId);
    } catch {
      // Keep disabled/unavailable connector accounts visible so users can remove them,
      // while failing closed instead of reporting an unverifiable live connection.
      return accounts.map((account) => publicAccount({ ...account, connected: false }));
    }
    if (definition.adapter === 'feishu-cli') return accounts.map(publicAccount);
    if (!definition.adapter.endsWith('-mcp')) return accounts.map(publicAccount);
    const adapter = this.deps.readConnectors?.[definition.adapter];
    return Promise.all(
      accounts.map(async (account) => {
        if (!account.connected || !adapter) return publicAccount(account);
        let online = false;
        try {
          const status = await adapter.inspect(account.profile);
          online =
            status.installed &&
            !!status.identity &&
            this.sameIdentity(account, {
              adapter: definition.adapter,
              providerIdentity: status.identity,
            });
        } catch {
          online = false;
        }
        return publicAccount(online ? account : { ...account, connected: false });
      }),
    );
  }
  async assertConnectionAllowed(extensionId: string, connectorId: string): Promise<void> {
    await this.definition(extensionId, connectorId);
    await this.deps.checkPolicy(connectorId, false);
  }
  async connect(
    input: {
      extensionId: string;
      connectorId: string;
      profile: string;
    },
    lease?: PartnerConnectorConnectionLease,
  ): Promise<PartnerConnectorConnectionT> {
    const startedEpoch = this.revocationEpoch;
    const policyRevision = this.deps.getPolicyRevision?.() ?? 0;
    const assertActive = () => {
      lease?.assertActive();
      if (
        this.revocationEpoch !== startedEpoch ||
        this.blocked.has('*') ||
        this.blocked.has(input.extensionId) ||
        (this.deps.getPolicyRevision?.() ?? 0) !== policyRevision
      )
        throw new Error('连接期间授权状态已改变，请重新验证');
    };
    assertActive();
    const started = (await this.store.read()).connections.find(
      (item) =>
        item.extensionId === input.extensionId &&
        item.connectorId === input.connectorId &&
        item.profile === input.profile,
    );
    if (lease && started) throw new Error('向导专用账号配置已经存在，拒绝覆盖');
    const definition = await this.definition(input.extensionId, input.connectorId);
    if (lease?.expectedAdapter && definition.adapter !== lease.expectedAdapter)
      throw new Error('连接器类型已变化');
    await this.deps.checkPolicy(input.connectorId, false);
    const verified = await this.verifiedStatus(
      definition,
      feishuProfileSchema.parse(input.profile),
      lease,
    );
    // Cancellation may wait for this connection while holding the mutation lock.
    // Check synchronously before joining that queue, with no intervening await.
    assertActive();
    return this.withConnectorMutation(input.extensionId, input.connectorId, async () => {
      const latestDefinition = await this.definition(input.extensionId, input.connectorId);
      if (latestDefinition.adapter !== definition.adapter) throw new Error('连接器类型已变化');
      let reclaimed: ConnectorAccount | undefined;
      const connection = await this.store.mutate((db) => {
        assertActive();
        const old = db.connections.find(
          (item) =>
            item.extensionId === input.extensionId &&
            item.connectorId === input.connectorId &&
            item.profile === input.profile,
        );
        const permissions = verified.permissions;
        if (this.revocationEpoch !== startedEpoch || old?.revision !== started?.revision)
          throw new Error('连接期间授权状态已改变，请重新验证');
        if (
          old?.connected &&
          this.sameIdentity(old, verified.account) &&
          JSON.stringify(old.permissions) === JSON.stringify(permissions)
        )
          return publicAccount(old);
        const record: ConnectorAccount = {
          id: old?.id ?? randomUUID(),
          ...input,
          revision: (old?.revision ?? 0) + 1,
          accountLabel: verified.label,
          connected: true,
          permissions,
          ...verified.account,
        };
        if (old) db.connections[db.connections.indexOf(old)] = record;
        else {
          const reusableIndex =
            definition.adapter === 'feishu-cli' &&
            db.connections.length >= MAX_PARTNER_CONNECTOR_ACCOUNTS
              ? db.connections.findIndex(
                  (account) =>
                    !account.connected &&
                    (account.adapter ?? 'feishu-cli') === 'feishu-cli' &&
                    account.extensionId === input.extensionId &&
                    account.connectorId === input.connectorId,
                )
              : -1;
          if (reusableIndex < 0) db.connections.push(record);
          else {
            // Keep historical records and their revoked IDs. The new account gets
            // a fresh ID; it cannot inherit any previous session authorization.
            reclaimed = db.connections[reusableIndex];
            db.connections[reusableIndex] = record;
          }
        }
        return publicAccount(record);
      });
      try {
        assertActive();
      } catch (error) {
        if (connection.revision !== started?.revision) {
          try {
            await this.store.mutate((db) => {
              const index = db.connections.findIndex(
                (item) => item.id === connection.id && item.revision === connection.revision,
              );
              if (index < 0) return;
              if (started)
                db.connections[index] = { ...started, revision: connection.revision + 1 };
              else if (reclaimed) db.connections[index] = reclaimed;
              else db.connections.splice(index, 1);
            });
          } catch {
            throw new PartnerConnectorCommitError();
          }
        }
        throw error;
      }
      if (connection.revision !== started?.revision)
        this.accountEpochs.set(connection.id, (this.accountEpochs.get(connection.id) ?? 0) + 1);
      lease?.complete(connection);
      this.deps.changed?.({ extensionId: input.extensionId });
      return connection;
    });
  }
  async disconnect(input: {
    extensionId: string;
    connectorId: string;
    connectionId: string;
  }): Promise<void> {
    this.revocationEpoch++;
    const cancelledConnections = this.deps.revokeConnections?.(input.extensionId);
    this.accountEpochs.set(
      input.connectionId,
      (this.accountEpochs.get(input.connectionId) ?? 0) + 1,
    );
    return this.withConnectorMutation(input.extensionId, input.connectorId, async () => {
      try {
        let credentialProfile:
          | { adapter: ReadConnectorId; profile: string; connector: ReadConnector }
          | undefined;
        await this.store.mutate((db) => {
          const account = db.connections.find(
            (item) =>
              item.id === input.connectionId &&
              item.extensionId === input.extensionId &&
              item.connectorId === input.connectorId,
          );
          if (!account) throw new Error('连接不存在');
          if (account.adapter && account.adapter !== 'feishu-cli') {
            const connector = this.deps.readConnectors?.[account.adapter];
            if (connector?.disconnect)
              credentialProfile = { adapter: account.adapter, profile: account.profile, connector };
          }
          account.connected = false;
          account.revision++;
        });
        this.deps.changed?.({ extensionId: input.extensionId });
        await this.drainActive(input.extensionId);
        await cancelledConnections;
        if (credentialProfile)
          await credentialProfile.connector.disconnect?.(credentialProfile.profile);
        this.deps.changed?.({ extensionId: input.extensionId });
      } finally {
        // A connect that began while cleanup was in progress must fail before committing.
        this.revocationEpoch++;
      }
    });
  }
  async forget(input: {
    extensionId: string;
    connectorId: string;
    connectionId: string;
    connectionRevision: number;
  }): Promise<void> {
    return this.withConnectorMutation(input.extensionId, input.connectorId, () =>
      this.forgetLocked(input),
    );
  }
  private async forgetLocked(input: {
    extensionId: string;
    connectorId: string;
    connectionId: string;
    connectionRevision: number;
  }): Promise<void> {
    const stored = (await this.store.read()).connections.find(
      (item) =>
        item.id === input.connectionId &&
        item.extensionId === input.extensionId &&
        item.connectorId === input.connectorId,
    );
    if (!stored) throw new Error('连接不存在');
    if (stored.adapter !== 'slack-mcp' && stored.adapter !== 'zoom-mcp')
      throw new Error('仅能移除需要产品应用配置的本地账号记录');
    if (stored.revision !== input.connectionRevision)
      throw new Error('连接记录已发生变化，请刷新后重试');
    const connector = this.deps.readConnectors?.[stored.adapter];
    if (!connector?.disconnect) throw new Error('连接组件无法安全清理本地凭据');

    this.revocationEpoch++;
    try {
      const cancelledConnections = this.deps.revokeConnections?.(input.extensionId);
      this.accountEpochs.set(
        input.connectionId,
        (this.accountEpochs.get(input.connectionId) ?? 0) + 1,
      );
      let forgottenRevision = 0;
      let credentialProfile: { profile: string; connector: ReadConnector } | undefined;
      await this.store.mutate((db) => {
        const account = db.connections.find(
          (item) =>
            item.id === input.connectionId &&
            item.extensionId === input.extensionId &&
            item.connectorId === input.connectorId,
        );
        if (!account) throw new Error('连接不存在');
        if (account.adapter !== 'slack-mcp' && account.adapter !== 'zoom-mcp')
          throw new Error('仅能移除需要产品应用配置的本地账号记录');
        if (account.revision !== input.connectionRevision)
          throw new Error('连接记录已发生变化，请刷新后重试');
        credentialProfile = { profile: account.profile, connector };
        account.connected = false;
        forgottenRevision = ++account.revision;
      });
      this.deps.changed?.({ extensionId: input.extensionId });
      await this.drainActive(input.extensionId);
      await cancelledConnections;
      if (!credentialProfile) throw new Error('连接组件无法安全清理本地凭据');
      await credentialProfile.connector.disconnect?.(credentialProfile.profile);
      await this.store.mutate((db) => {
        const index = db.connections.findIndex(
          (item) =>
            item.id === input.connectionId &&
            item.extensionId === input.extensionId &&
            item.connectorId === input.connectorId,
        );
        if (index < 0) return;
        const account = db.connections[index];
        if (
          account.connected ||
          account.revision !== forgottenRevision ||
          (account.adapter !== 'slack-mcp' && account.adapter !== 'zoom-mcp')
        )
          throw new Error('连接记录已发生变化，请刷新后重试');
        db.connections.splice(index, 1);
      });
      this.deps.changed?.({ extensionId: input.extensionId });
    } finally {
      // Close the cleanup generation before a concurrently verified connect can commit.
      this.revocationEpoch++;
    }
  }
  async resolveSelections(
    selections: readonly PartnerConnectorSelectionT[],
  ): Promise<PartnerConnectorSnapshotT[]> {
    const result: PartnerConnectorSnapshotT[] = [];
    for (const selection of partnerConnectorSelectionsSchema.parse(selections)) {
      const definition = await this.definition(selection.extensionId, selection.connectorId);
      if ((selection.adapter ?? 'feishu-cli') !== definition.adapter)
        throw new Error('连接器类型与范围不符');
      const account = await this.account(selection);
      if (definition.adapter !== 'feishu-cli') {
        const adapter = this.deps.readConnectors?.[definition.adapter];
        if (
          !adapter ||
          selection.documents.some((document) => !adapter.acceptsResource(document.url))
        )
          throw new Error('资源引用无效或不属于此连接器');
        const status = await this.verifiedStatus(definition, account.profile);
        if (!this.sameIdentity(account, status.account)) throw new Error('账号已变化，请重新连接');
        await this.account(selection);
        result.push({ ...selection, name: definition.name, accountLabel: account.accountLabel });
        continue;
      }
      const status = await this.deps.cli.inspect(account.profile);
      if (
        !status.installed ||
        status.version !== FEISHU_CLI_VERSION ||
        !status.identity ||
        status.identity.appId !== account.appId ||
        status.identity.openId !== account.openId
      )
        throw new Error('飞书账号已变化，请重新连接并确认范围');
      if (selection.documents.length && !status.identity.scopes.includes('docx:document:readonly'))
        throw new Error('飞书账号缺少文档读取权限');
      if (
        selection.documents.some((item) => item.access === 'append') &&
        !status.identity.scopes.includes('docx:document:write_only')
      )
        throw new Error('飞书账号缺少文档追加权限');
      if (selection.createFolderUrl && !status.identity.scopes.includes('docx:document:create'))
        throw new Error('飞书账号缺少新建文档权限');
      if (selection.createBaseFolderUrl && !account.permissions.createBase)
        throw new Error('该连接尚未确认多维表格创建权限，请重新连接');
      if (
        selection.createBaseFolderUrl &&
        FEISHU_BASE_CREATE_SCOPES.some((scope) => !status.identity!.scopes.includes(scope))
      )
        throw new Error('飞书账号缺少新建多维表格所需权限');
      await this.account(selection);
      result.push({ ...selection, name: definition.name, accountLabel: account.accountLabel });
    }
    return result;
  }
  async describeBindings(
    bindings: readonly PartnerConnectorSnapshotT[],
  ): Promise<PartnerConnectorStateT> {
    return {
      connectors: await Promise.all(
        bindings.map(async (binding) => {
          try {
            const definition = await this.definition(binding.extensionId, binding.connectorId);
            if (definition.adapter !== (binding.adapter ?? 'feishu-cli'))
              throw new Error('连接器类型已变化');
            await this.account(binding);
            return { binding, available: true };
          } catch {
            return {
              binding,
              available: false,
              unavailableReason: '连接器或账号已停用，请重新连接并确认文档范围',
            };
          }
        }),
      ),
    };
  }
  async documentCreateEligibility(
    context: PartnerConnectorContext,
  ): Promise<PartnerNativeDocumentEligibilityT> {
    this.assertContext(context);
    if (context.permissionMode === 'plan' || context.getCurrentPermissionMode?.() === 'plan')
      return partnerNativeDocumentEligibilitySchema.parse({
        status: 'unavailable',
        reason: 'plan-mode',
        recoveryAction: 'leave-plan',
        candidates: [],
      });
    const bindings = context.bindings.filter(
      (binding) => (binding.adapter ?? 'feishu-cli') === 'feishu-cli',
    );
    if (bindings.length === 0)
      return partnerNativeDocumentEligibilitySchema.parse({
        status: 'unavailable',
        reason: 'not-selected',
        recoveryAction: 'open-connectors',
        candidates: [],
      });
    const candidates: Array<{
      provider: 'feishu';
      connectionId: string;
      connectionRevision: number;
      accountLabel: string;
    }> = [];
    let missingScope = false;
    for (const binding of bindings) {
      const current = (context.getCurrentBindings?.() ?? context.bindings).find(
        (item) => item.connectionId === binding.connectionId,
      );
      if (!current || scopeHash(current) !== scopeHash(binding)) continue;
      try {
        const definition = await this.definition(binding.extensionId, binding.connectorId);
        if (definition.adapter !== 'feishu-cli') continue;
        const account = await this.account(binding);
        if (!account.permissions.create || !account.permissions.read) {
          missingScope = true;
          continue;
        }
        candidates.push({
          provider: 'feishu',
          connectionId: binding.connectionId,
          connectionRevision: binding.connectionRevision,
          accountLabel: binding.accountLabel,
        });
      } catch {
        // Unavailable bindings remain recoverable in the connector selector.
      }
    }
    if (candidates.length === 0)
      return partnerNativeDocumentEligibilitySchema.parse({
        status: 'unavailable',
        reason: missingScope ? 'missing-scope' : 'disconnected',
        recoveryAction: missingScope ? 'reauthorize' : 'open-connectors',
        candidates: [],
      });
    if (candidates.length === 1)
      return partnerNativeDocumentEligibilitySchema.parse({
        status: 'ready',
        candidate: candidates[0],
      });
    return partnerNativeDocumentEligibilitySchema.parse({
      status: 'selection-required',
      reason: 'multiple-accounts',
      recoveryAction: 'choose-account',
      candidates,
    });
  }
  async nativeDocumentDeliveryEnabled(context: PartnerConnectorContext): Promise<boolean> {
    this.assertContext(context);
    if (!this.deps.extensionCapabilities) return false;
    const extensionIds = [
      ...new Set(
        context.bindings
          .filter(
            (binding) =>
              (binding.adapter ?? 'feishu-cli') === 'feishu-cli' ||
              (binding.adapter === 'tencent-docs-mcp' && binding.allowCreateDocument),
          )
          .map((binding) => binding.extensionId),
      ),
    ];
    if (extensionIds.length === 0) return false;
    const capabilities = await Promise.all(
      extensionIds.map((extensionId) => this.deps.extensionCapabilities!(extensionId)),
    );
    return capabilities.every((items) => items.includes('partnerNativeDocumentDeliveryV1'));
  }
  private async account(binding: PartnerConnectorSelectionT): Promise<ConnectorAccount> {
    const record = (await this.store.read()).connections.find(
      (item) =>
        item.id === binding.connectionId &&
        item.extensionId === binding.extensionId &&
        item.connectorId === binding.connectorId &&
        item.revision === binding.connectionRevision &&
        item.connected,
    );
    if (!record) throw new Error('连接已断开或授权版本变化，请重新选择');
    if ((record.adapter ?? 'feishu-cli') !== (binding.adapter ?? 'feishu-cli'))
      throw new Error('账号与连接器类型不符');
    return record;
  }
  private assertContext(context: PartnerConnectorContext): void {
    if (context.surface !== 'partner') throw new Error('连接器只允许在 Partner 会话使用');
  }
  private publishChanged(
    context: PartnerConnectorContext,
    extensionId?: string,
    baseTaskId?: string,
  ): void {
    this.deps.changed?.({
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      ...(extensionId ? { extensionId } : {}),
      ...(baseTaskId ? { baseTaskId } : {}),
    });
  }
  private async publishDocumentChanged(
    context: PartnerConnectorContext,
    extensionId: string,
    documentTaskId: string,
  ): Promise<void> {
    this.deps.changed?.({
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId,
      documentTaskId,
      recordRevision: (await this.store.read()).recordRevision,
    });
  }
  private async authorize(
    context: PartnerConnectorContext,
    connectionId: string,
    targetUrl: string | undefined,
    operation: 'read' | 'search' | 'create' | 'append' | 'createBase',
  ): Promise<ConnectorAuthorization> {
    this.assertContext(context);
    const binding = context.bindings.find((item) => item.connectionId === connectionId);
    const current = (context.getCurrentBindings?.() ?? context.bindings).find(
      (item) => item.connectionId === connectionId,
    );
    if (!binding || !current || scopeHash(binding) !== scopeHash(current))
      throw new Error('会话连接器范围已撤销或改变');
    const mailboxRead =
      operation === 'read' &&
      typeof targetUrl === 'string' &&
      partnerMailboxAllowsResource(binding.adapter ?? 'feishu-cli', binding.mailbox, targetUrl);
    const nativeCreate =
      operation === 'create' &&
      binding.adapter === 'tencent-docs-mcp' &&
      binding.allowCreateDocument === true &&
      targetUrl === 'tencent-docs://personal-space';
    if (operation === 'search') {
      if (!isPartnerMailAdapter(binding.adapter ?? 'feishu-cli') || binding.mailbox !== 'inbox')
        throw new Error('本会话尚未允许搜索该收件箱');
    } else if (nativeCreate) {
      // Explicit per-session creation grant; no implicit Feishu folder semantics.
    } else if (operation === 'create' || operation === 'createBase') {
      const personalSpace =
        (operation === 'create' && targetUrl === FEISHU_MY_LIBRARY_TARGET) ||
        (operation === 'createBase' && targetUrl === undefined);
      if (!personalSpace) {
        feishuFolderUrlSchema.parse(targetUrl);
        if (
          (operation === 'create' ? binding.createFolderUrl : binding.createBaseFolderUrl) !==
          targetUrl
        )
          throw new Error(
            operation === 'create' ? '未授权在此文件夹新建文档' : '未授权在此文件夹新建多维表格',
          );
      }
    } else {
      partnerReadResourceSchema.parse(targetUrl);
      const scope = binding.documents.find((item) => item.url === targetUrl);
      if ((!scope && !mailboxRead) || (operation === 'append' && scope?.access !== 'append'))
        throw new Error('文档不在本会话授权范围内');
    }
    if (
      operation !== 'read' &&
      operation !== 'search' &&
      (context.permissionMode === 'plan' || context.getCurrentPermissionMode?.() === 'plan')
    )
      throw new Error('计划模式不允许远端写入提案或提交');
    const accountEpoch = this.accountEpochs.get(connectionId) ?? 0;
    const policyRevision = this.deps.getPolicyRevision?.() ?? 0;
    const definition = await this.definition(binding.extensionId, binding.connectorId);
    if (definition.adapter !== (binding.adapter ?? 'feishu-cli'))
      throw new Error('连接器类型已变化');
    if (definition.adapter !== 'feishu-cli') {
      const adapter = this.deps.readConnectors?.[definition.adapter];
      const allowed =
        (operation === 'search' && !!adapter?.search) ||
        (nativeCreate && !!adapter?.createDocument) ||
        (operation === 'read' &&
          typeof targetUrl === 'string' &&
          !!adapter?.acceptsResource(targetUrl));
      if (!allowed) throw new Error('此连接器不支持该操作或资源');
    }
    await this.deps.checkPolicy(
      binding.connectorId,
      operation !== 'read' && operation !== 'search',
    );
    const account = await this.account(binding);
    if (operation === 'createBase' && !account.permissions.createBase)
      throw new Error('该连接尚未确认多维表格创建权限，请重新连接');
    // No await after this live check until the caller's next operation.
    const latest = (context.getCurrentBindings?.() ?? context.bindings).find(
      (item) => item.connectionId === connectionId,
    );
    if (!latest || scopeHash(latest) !== scopeHash(binding)) throw new Error('会话授权已撤销');
    const assertLive = () => {
      const latest = (context.getCurrentBindings?.() ?? context.bindings).find(
        (item) => item.connectionId === connectionId,
      );
      if (
        !latest ||
        scopeHash(latest) !== scopeHash(binding) ||
        this.blocked.has('*') ||
        this.blocked.has(binding.extensionId) ||
        (this.accountEpochs.get(connectionId) ?? 0) !== accountEpoch ||
        (this.deps.getPolicyRevision?.() ?? 0) !== policyRevision
      )
        throw new Error('会话、账号或策略授权已改变');
      if (
        operation !== 'read' &&
        operation !== 'search' &&
        (context.permissionMode === 'plan' || context.getCurrentPermissionMode?.() === 'plan')
      )
        throw new Error('计划模式不允许远端写入');
    };
    assertLive();
    return {
      binding,
      account,
      assertLive,
    };
  }
  async search(
    context: PartnerConnectorContext,
    value: PartnerConnectorSearchInputT,
  ): Promise<PartnerConnectorSearchResultT> {
    const input = partnerConnectorSearchInputSchema.parse(value);
    const auth = await this.authorize(context, input.connectionId, undefined, 'search');
    const adapter = this.deps.readConnectors?.[auth.account.adapter as ReadConnectorId];
    const expected = auth.account.providerIdentity;
    if (!adapter?.search || !expected) throw new Error('连接器不支持收件箱搜索');
    let checked = false;
    let dispatched = false;
    const result = partnerConnectorSearchResultSchema.parse(
      await adapter.search({
        ...input,
        profile: auth.account.profile,
        expected,
        beforeRead: async () => {
          await this.authorize(context, input.connectionId, undefined, 'search');
          checked = true;
        },
        assertRead: () => {
          auth.assertLive();
          if (!checked) throw new Error('搜索未通过权限检查');
          dispatched = true;
        },
      }),
    );
    auth.assertLive();
    if (
      !dispatched ||
      result.messages.some(
        (message) =>
          !partnerMailboxAllowsResource(adapter.id, auth.binding.mailbox, message.reference),
      )
    )
      throw new Error('搜索结果与授权收件箱不一致');
    return result;
  }
  async read(
    context: PartnerConnectorContext,
    input: { connectionId: string; documentUrl: string },
  ): Promise<PartnerRemoteSourceT> {
    const auth = await this.authorize(context, input.connectionId, input.documentUrl, 'read');
    const beforeRead = async () => {
      await this.authorize(context, input.connectionId, input.documentUrl, 'read');
    };
    let document: ReadConnectorDocument;
    if (auth.account.adapter && auth.account.adapter !== 'feishu-cli') {
      const adapter = this.deps.readConnectors?.[auth.account.adapter];
      const expected = auth.account.providerIdentity;
      if (!adapter || !expected) throw new Error('连接组件不可用');
      const status = await this.verifiedStatus(
        await this.definition(auth.binding.extensionId, auth.binding.connectorId),
        auth.account.profile,
      );
      if (!this.sameIdentity(auth.account, status.account))
        throw new Error('账号已变化，请重新连接');
      let checked = false;
      let dispatched = false;
      document = await adapter.read({
        profile: auth.account.profile,
        expected,
        documentUrl: input.documentUrl,
        beforeRead: async () => {
          await beforeRead();
          checked = true;
        },
        assertRead: () => {
          auth.assertLive();
          if (!checked) throw new Error('读取未通过权限检查');
          dispatched = true;
        },
      });
      if (!dispatched) throw new Error('读取未通过权限检查');
      checkReadConnectorDocument(document);
    } else
      document = await this.deps.cli.read({
        ...this.feishuArgs(auth.account),
        documentUrl: input.documentUrl,
        beforeRead,
        assertRead: auth.assertLive,
      });
    await this.authorize(context, input.connectionId, input.documentUrl, 'read');
    const resourceKey = partnerConnectorResourceKey(
      auth.account.adapter ?? 'feishu-cli',
      input.documentUrl,
    );
    if (!resourceKey || document.url !== input.documentUrl || document.documentId !== resourceKey)
      throw new Error('返回的资源与请求不一致');
    const source = partnerRemoteSourceSchema.parse({
      id: randomUUID(),
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId: auth.binding.extensionId,
      connectorId: auth.binding.connectorId,
      connectionId: input.connectionId,
      ...document,
      contentHash: digest(document.content),
      readAt: new Date().toISOString(),
    });
    await this.store.mutate((db) => {
      db.sources = db.sources.filter(
        (item) =>
          !(
            own(context, item) &&
            item.connectionId === input.connectionId &&
            item.url === input.documentUrl
          ),
      );
      db.sources.push(source);
    });
    try {
      auth.assertLive();
    } catch (error) {
      await this.store.mutate((db) => {
        db.sources = db.sources.filter((item) => item.id !== source.id);
      });
      throw error;
    }
    this.publishChanged(context, auth.binding.extensionId);
    return source;
  }
  async propose(
    context: PartnerConnectorContext,
    value: PartnerRemoteProposalInputT,
  ): Promise<PartnerRemoteProposalT> {
    const input = partnerRemoteProposalInputSchema.parse(value);
    const auth = await this.authorize(
      context,
      input.connectionId,
      input.targetUrl,
      input.operation,
    );
    const base = await this.deps.cli.read({
      ...this.feishuArgs(auth.account),
      documentUrl: input.targetUrl,
      beforeRead: async () => {
        await this.authorize(context, input.connectionId, input.targetUrl, input.operation);
      },
      assertRead: auth.assertLive,
    });
    await this.authorize(context, input.connectionId, input.targetUrl, input.operation);
    const now = new Date().toISOString();
    const proposal = partnerRemoteProposalSchema.parse({
      ...input,
      id: randomUUID(),
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId: auth.binding.extensionId,
      connectorId: auth.binding.connectorId,
      connectionRevision: auth.binding.connectionRevision,
      contentHash: contentHash(input),
      scopeHash: scopeHash(auth.binding),
      baseRevision: base.revision,
      baseContentHash: digest(base.content),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    await this.store.mutate((db) => {
      db.proposals.push(proposal);
    });
    try {
      auth.assertLive();
    } catch (error) {
      await this.finish(proposal, 'rejected', '生成期间授权已撤销，提案未交付');
      throw error;
    }
    this.publishChanged(context, auth.binding.extensionId);
    return proposal;
  }
  async createBase(
    context: PartnerConnectorContext,
    value: PartnerFeishuBaseCreateInputT,
  ): Promise<PartnerFeishuBaseCreateTaskT> {
    const input = partnerFeishuBaseCreateInputSchema.parse(value);
    const binding = this.baseTaskBinding(context, input);
    const now = new Date().toISOString();
    const task = partnerFeishuBaseCreateTaskSchema.parse({
      id: randomUUID(),
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId: binding.extensionId,
      connectorId: binding.connectorId,
      connectionId: input.connectionId,
      connectionRevision: binding.connectionRevision,
      folderUrl: input.folderUrl,
      baseName: input.baseName,
      tableName: input.tableName,
      fields: input.fields,
      timeZone: 'Asia/Shanghai',
      inputHash: baseInputHash(input),
      scopeHash: scopeHash(binding),
      status: 'preparing',
      createdAt: now,
      updatedAt: now,
    });
    await this.store.mutate((db) => {
      db.baseTasks.push(task);
      db.dispatchOwners[task.id] = process.pid;
    });
    this.publishChanged(context, task.extensionId, task.id);
    const promise = this.submitBase(context, task);
    this.active.set(promise, task.extensionId);
    try {
      return await promise;
    } finally {
      this.active.delete(promise);
      this.publishChanged(context, task.extensionId, task.id);
    }
  }
  async createDocument(
    context: PartnerConnectorContext,
    turnExecutionId: string,
    value: PartnerFeishuDocumentCreateInputT,
  ): Promise<PartnerNativeDocumentTaskT> {
    const parsed = partnerFeishuDocumentCreateInputSchema.parse(value);
    const title = normalizeDocumentTitle(parsed.title);
    const input = partnerFeishuDocumentCreateInputSchema.parse({
      ...parsed,
      title,
      content: normalizeDocumentBody(title, parsed.content),
    });
    const binding = this.documentTaskBinding(context, input);
    const inputHash = documentInputHash(input);
    const bindingScopeHash = scopeHash(binding);
    const now = new Date().toISOString();
    const task = partnerNativeDocumentTaskSchema.parse({
      id: randomUUID(),
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId: binding.extensionId,
      connectorId: binding.connectorId,
      connectionId: binding.connectionId,
      connectionRevision: binding.connectionRevision,
      provider: 'feishu',
      turnExecutionId,
      invocationKey: digest(
        JSON.stringify([
          context.sessionId,
          turnExecutionId,
          binding.connectionId,
          binding.connectionRevision,
          bindingScopeHash,
          input.folderUrl ?? FEISHU_MY_LIBRARY_TARGET,
          digest(input.title),
          digest(input.content),
        ]),
      ),
      target: input.folderUrl
        ? { kind: 'scoped-resource', canonicalRef: input.folderUrl }
        : { kind: 'personal-space' },
      requestedTitle: input.title,
      content: input.content,
      inputHash,
      scopeHash: bindingScopeHash,
      status: 'preparing',
      createdAt: now,
      updatedAt: now,
    });
    const active = this.activeDocumentInvocations.get(task.invocationKey);
    if (active) return active;
    const promise = this.createOrReuseDocument(context, task);
    this.activeDocumentInvocations.set(task.invocationKey, promise);
    this.active.set(promise, task.extensionId);
    try {
      return await promise;
    } finally {
      if (this.activeDocumentInvocations.get(task.invocationKey) === promise)
        this.activeDocumentInvocations.delete(task.invocationKey);
      this.active.delete(promise);
    }
  }
  async createConnectorDocument(
    context: PartnerConnectorContext,
    turnExecutionId: string,
    value: PartnerConnectorDocumentCreateInputT,
  ): Promise<PartnerNativeDocumentTaskT> {
    const input = partnerConnectorDocumentCreateInputSchema.parse(value);
    const auth = await this.authorize(
      context,
      input.connectionId,
      'tencent-docs://personal-space',
      'create',
    );
    if (auth.binding.adapter !== 'tencent-docs-mcp') throw new Error('连接器不支持此文档创建入口');
    const inputHash = documentInputHash({ title: input.title, content: input.content });
    const bindingScopeHash = scopeHash(auth.binding);
    const now = new Date().toISOString();
    const task = partnerNativeDocumentTaskSchema.parse({
      id: randomUUID(),
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId: auth.binding.extensionId,
      connectorId: auth.binding.connectorId,
      connectionId: input.connectionId,
      connectionRevision: auth.binding.connectionRevision,
      provider: 'tencent-docs',
      turnExecutionId,
      invocationKey: digest(
        JSON.stringify([
          context.sessionId,
          turnExecutionId,
          input.connectionId,
          auth.binding.connectionRevision,
          bindingScopeHash,
          inputHash,
        ]),
      ),
      target: { kind: 'personal-space' },
      requestedTitle: input.title,
      content: input.content,
      inputHash,
      scopeHash: bindingScopeHash,
      status: 'preparing',
      createdAt: now,
      updatedAt: now,
    });
    const active = this.activeDocumentInvocations.get(task.invocationKey);
    if (active) return active;
    const promise = this.createOrReuseDocument(context, task);
    this.activeDocumentInvocations.set(task.invocationKey, promise);
    this.active.set(promise, task.extensionId);
    try {
      return await promise;
    } finally {
      this.activeDocumentInvocations.delete(task.invocationKey);
      this.active.delete(promise);
    }
  }
  private async submitConnectorDocument(
    context: PartnerConnectorContext,
    task: PartnerNativeDocumentTaskT,
  ): Promise<PartnerNativeDocumentTaskT> {
    let gate: BaseDispatchGate | undefined;
    try {
      const auth = await this.authorize(
        context,
        task.connectionId,
        'tencent-docs://personal-space',
        'create',
      );
      this.assertDocumentTaskAuthorization(task, auth.binding);
      const adapter = this.deps.readConnectors?.[auth.account.adapter as ReadConnectorId];
      const expected = auth.account.providerIdentity;
      if (!adapter?.createDocument || !expected) throw new Error('连接组件不支持文档创建');
      gate = this.createDocumentDispatchGate(context, task, auth);
      const result = await adapter.createDocument({
        profile: auth.account.profile,
        expected,
        title: task.requestedTitle,
        content: task.content,
        beforeDispatch: gate.beforeDispatch,
        assertDispatch: gate.assertDispatch,
      });
      if (!gate.wasAdmitted()) throw new Error('创建未通过提交门');
      if (
        result.status !== 'success' ||
        !result.url ||
        !tencentDocumentUrlSchema.safeParse(result.url).success ||
        result.documentId !== partnerConnectorResourceKey(adapter.id, result.url) ||
        result.revision === undefined
      )
        return this.finishDocument(
          task,
          'unknown',
          '创建结果未确认，请到腾讯文档核对；不会自动重试',
          true,
        );
      return this.finishDocument(task, 'succeeded', undefined, true, {
        resourceId: result.documentId!,
        title: task.requestedTitle,
        canonicalUrl: result.url,
        revision: result.revision,
        contentVerification: 'unverified',
        verificationWarning: '腾讯文档已返回创建回执；内容尚未完成回读校验，请在右侧查看实际文档',
      });
    } catch {
      const uncertain = gate?.wasAdmitted();
      return this.finishDocument(
        task,
        uncertain ? 'unknown' : 'failed',
        uncertain
          ? '创建未确认，请到腾讯文档核对；不会自动重试'
          : '创建前检查失败，请确认账号、范围和策略后重新发起',
        gate?.wasClaimed(),
      );
    }
  }
  private async createOrReuseDocument(
    context: PartnerConnectorContext,
    task: PartnerNativeDocumentTaskT,
  ): Promise<PartnerNativeDocumentTaskT> {
    const admitted = await this.store.mutate((db) => {
      const existing = db.documentTasks.find(
        (candidate) => candidate.invocationKey === task.invocationKey,
      );
      if (existing)
        return { created: false as const, task: partnerNativeDocumentTaskSchema.parse(existing) };
      db.documentTasks.push(task);
      db.dispatchOwners[task.id] = process.pid;
      return { created: true as const, task };
    });
    if (!admitted.created) return admitted.task;
    await this.publishDocumentChanged(context, task.extensionId, task.id);
    try {
      return task.provider === 'feishu'
        ? await this.submitDocument(context, task)
        : await this.submitConnectorDocument(context, task);
    } finally {
      await this.publishDocumentChanged(context, task.extensionId, task.id);
    }
  }
  private documentTaskBinding(
    context: PartnerConnectorContext,
    input: PartnerFeishuDocumentCreateInputT,
  ): PartnerConnectorSnapshotT {
    this.assertContext(context);
    const bindings = context.bindings.filter(
      (item) =>
        (item.adapter ?? 'feishu-cli') === 'feishu-cli' &&
        (input.folderUrl === undefined || item.createFolderUrl === input.folderUrl),
    );
    if (bindings.length !== 1)
      throw new Error(
        bindings.length === 0
          ? '当前会话没有可用于新建文档的飞书账号'
          : '当前会话有多个飞书账号，请先选择本次创建使用的账号',
      );
    return bindings[0]!;
  }
  private async submitDocument(
    context: PartnerConnectorContext,
    task: PartnerNativeDocumentTaskT,
  ): Promise<PartnerNativeDocumentTaskT> {
    let gate: BaseDispatchGate | undefined;
    let auth: ConnectorAuthorization | undefined;
    let result: FeishuWriteResult;
    try {
      auth = await this.authorize(
        context,
        task.connectionId,
        task.target.kind === 'scoped-resource'
          ? task.target.canonicalRef
          : FEISHU_MY_LIBRARY_TARGET,
        'create',
      );
      this.assertDocumentTaskAuthorization(task, auth.binding);
      gate = this.createDocumentDispatchGate(context, task, auth);
      result = await this.deps.cli.create({
        ...this.feishuArgs(auth.account),
        ...(task.target.kind === 'scoped-resource' ? { folderUrl: task.target.canonicalRef } : {}),
        title: task.requestedTitle,
        text: task.content,
        beforeDispatch: gate.beforeDispatch,
        assertDispatch: gate.assertDispatch,
      });
      if (!gate.wasAdmitted()) throw new Error('CLI 适配没有经过任务提交门');
    } catch (error) {
      const uncertain = error instanceof FeishuCliError ? error.dispatched : gate?.wasAdmitted();
      return this.finishDocument(
        task,
        uncertain ? 'unknown' : 'failed',
        uncertain
          ? '创建未确认，请到飞书核对；不会自动重试'
          : '创建前检查失败，请确认插件、账号和策略后重新发起任务',
        gate?.wasClaimed(),
      );
    }
    if (
      (result.status !== 'success' && result.status !== 'partial') ||
      !result.documentId ||
      !result.url ||
      result.revision === undefined
    )
      return this.finishDocument(
        task,
        'unknown',
        '创建结果没有可信文档链接，请到飞书核对；不会自动重试',
        true,
      );
    const receipt = {
      resourceId: result.documentId,
      title: task.requestedTitle,
      canonicalUrl: result.url,
      revision: result.revision,
    };
    const confirmed = await this.finishDocument(task, 'succeeded', undefined, true, {
      ...receipt,
      contentVerification: 'unverified',
      verificationWarning: '文档已创建，内容尚未完成校验；请在右侧查看实际文档',
    });
    this.startDocumentVerification(context, confirmed, auth);
    return confirmed;
  }
  private startDocumentVerification(
    context: PartnerConnectorContext,
    task: PartnerNativeDocumentTaskT,
    auth: ConnectorAuthorization,
  ): void {
    if (this.blocked.has('*') || this.blocked.has(task.extensionId)) return;
    const verification = this.verifyDocumentContent(context, task, auth);
    this.active.set(verification, task.extensionId);
    void verification.then(
      () => this.active.delete(verification),
      () => this.active.delete(verification),
    );
  }
  private async verifyDocumentContent(
    context: PartnerConnectorContext,
    task: PartnerNativeDocumentTaskT,
    auth: ConnectorAuthorization,
  ): Promise<void> {
    if (
      task.status !== 'succeeded' ||
      !task.resourceId ||
      !task.canonicalUrl ||
      task.revision === undefined
    )
      return;
    let verification:
      | {
          readonly contentVerification: 'verified';
          readonly resourceId: string;
          readonly title: string;
          readonly canonicalUrl: string;
          readonly revision: number;
        }
      | {
          readonly contentVerification: 'unverified';
          readonly verificationWarning: string;
        };
    try {
      const targetUrl = task.canonicalUrl;
      const document = await this.deps.cli.read({
        ...this.feishuArgs(auth.account),
        documentUrl: targetUrl,
        beforeRead: async () => {
          const live = await this.authorize(
            context,
            task.connectionId,
            task.target.kind === 'scoped-resource'
              ? task.target.canonicalRef
              : FEISHU_MY_LIBRARY_TARGET,
            'create',
          );
          this.assertDocumentTaskAuthorization(task, live.binding);
          live.assertLive();
          auth.assertLive();
        },
        assertRead: auth.assertLive,
      });
      if (
        document.documentId !== task.resourceId ||
        document.url !== targetUrl ||
        !feishuReadBackMatches({ title: task.requestedTitle, content: task.content }, document)
      ) {
        verification = {
          contentVerification: 'unverified',
          verificationWarning: '文档已创建，内容回读未完全确认；请在右侧查看实际文档',
        };
      } else {
        verification = {
          resourceId: document.documentId,
          title: normalizeDocumentTitle(document.title),
          canonicalUrl: document.url,
          revision: document.revision,
          contentVerification: 'verified',
        };
      }
    } catch {
      verification = {
        contentVerification: 'unverified',
        verificationWarning: '文档已创建，内容回读暂未完成；请在右侧查看实际文档',
      };
    }
    const updated = await this.updateDocumentVerification(task, verification);
    if (updated) await this.publishDocumentChanged(context, task.extensionId, task.id);
  }
  private updateDocumentVerification(
    task: PartnerNativeDocumentTaskT,
    verification:
      | {
          readonly contentVerification: 'verified';
          readonly resourceId: string;
          readonly title: string;
          readonly canonicalUrl: string;
          readonly revision: number;
        }
      | {
          readonly contentVerification: 'unverified';
          readonly verificationWarning: string;
        },
  ): Promise<PartnerNativeDocumentTaskT | null> {
    return this.store.mutate((db) => {
      const current = db.documentTasks.find((item) => item.id === task.id);
      if (
        !current ||
        current.status !== 'succeeded' ||
        current.resourceId !== task.resourceId ||
        current.canonicalUrl !== task.canonicalUrl ||
        current.revision !== task.revision
      )
        return null;
      current.contentVerification = verification.contentVerification;
      if (verification.contentVerification === 'verified') {
        current.resourceId = verification.resourceId;
        current.title = verification.title;
        current.canonicalUrl = verification.canonicalUrl;
        current.revision = verification.revision;
        delete current.verificationWarning;
      } else {
        current.verificationWarning = verification.verificationWarning;
      }
      current.updatedAt = new Date().toISOString();
      return partnerNativeDocumentTaskSchema.parse(current);
    });
  }
  private assertDocumentTaskAuthorization(
    task: PartnerNativeDocumentTaskT,
    binding: PartnerConnectorSnapshotT,
  ): void {
    const input = {
      ...(task.target.kind === 'scoped-resource' ? { folderUrl: task.target.canonicalRef } : {}),
      title: task.requestedTitle,
      content: task.content,
    };
    if (
      binding.connectionRevision !== task.connectionRevision ||
      scopeHash(binding) !== task.scopeHash ||
      documentInputHash(input) !== task.inputHash
    )
      throw new Error('文档创建任务或授权范围已变化');
  }
  private createDocumentDispatchGate(
    context: PartnerConnectorContext,
    task: PartnerNativeDocumentTaskT,
    auth: ConnectorAuthorization,
  ): BaseDispatchGate {
    let claimed = false;
    let admitted = false;
    return {
      beforeDispatch: async () => {
        const current = await this.authorize(
          context,
          task.connectionId,
          task.target.kind === 'scoped-resource'
            ? task.target.canonicalRef
            : task.provider === 'tencent-docs'
              ? 'tencent-docs://personal-space'
              : FEISHU_MY_LIBRARY_TARGET,
          'create',
        );
        await this.claimDocumentTask(task);
        claimed = true;
        await this.publishDocumentChanged(context, task.extensionId, task.id);
        current.assertLive();
        auth.assertLive();
      },
      assertDispatch: () => {
        auth.assertLive();
        if (!claimed) throw new Error('未完成持久化提交门');
        admitted = true;
      },
      wasClaimed: () => claimed,
      wasAdmitted: () => admitted,
    };
  }
  private claimDocumentTask(task: PartnerNativeDocumentTaskT): Promise<void> {
    return this.store.mutate((db) => {
      const current = db.documentTasks.find((item) => item.id === task.id);
      if (
        current?.status !== 'preparing' ||
        current.inputHash !== task.inputHash ||
        current.invocationKey !== task.invocationKey
      )
        throw new Error('文档创建任务已经处理或内容变化');
      const connected = db.connections.some(
        (account) =>
          account.id === task.connectionId &&
          account.revision === task.connectionRevision &&
          account.connected,
      );
      if (!connected) throw new Error('连接授权已撤销');
      current.status = 'submitting';
      current.updatedAt = new Date().toISOString();
      db.dispatchOwners[task.id] = process.pid;
    });
  }
  private finishDocument(
    task: PartnerNativeDocumentTaskT,
    status: PartnerNativeDocumentTaskT['status'],
    error?: string,
    ownsDispatch = false,
    result?: {
      resourceId: string;
      title: string;
      canonicalUrl: string;
      revision: number;
      contentVerification: 'verified' | 'unverified';
      verificationWarning?: string;
    },
  ): Promise<PartnerNativeDocumentTaskT> {
    return this.store.mutate((db) => {
      const current = db.documentTasks.find((item) => item.id === task.id)!;
      if (current.status !== 'preparing' && !(current.status === 'submitting' && ownsDispatch))
        return current;
      current.status = status;
      current.updatedAt = new Date().toISOString();
      if (error) current.error = error;
      if (status === 'succeeded' && result) Object.assign(current, result);
      delete db.dispatchOwners[task.id];
      return partnerNativeDocumentTaskSchema.parse(current);
    });
  }
  private baseTaskBinding(
    context: PartnerConnectorContext,
    input: PartnerFeishuBaseCreateInputT,
  ): PartnerConnectorSnapshotT {
    this.assertContext(context);
    const binding = context.bindings.find(
      (item) =>
        item.connectionId === input.connectionId &&
        (item.adapter === undefined || item.adapter === 'feishu-cli') &&
        (input.folderUrl === undefined || item.createBaseFolderUrl === input.folderUrl),
    );
    if (!binding) throw new Error('未授权在此文件夹新建多维表格');
    return binding;
  }
  private async submitBase(
    context: PartnerConnectorContext,
    task: PartnerFeishuBaseCreateTaskT,
  ): Promise<PartnerFeishuBaseCreateTaskT> {
    let gate: BaseDispatchGate | undefined;
    try {
      const auth = await this.authorize(context, task.connectionId, task.folderUrl, 'createBase');
      this.assertBaseTaskAuthorization(task, auth.binding);
      gate = this.createBaseDispatchGate(context, task, auth);
      const result: FeishuBaseWriteResult = await this.deps.cli.createBase({
        ...this.feishuArgs(auth.account),
        folderUrl: task.folderUrl,
        baseName: task.baseName,
        tableName: task.tableName,
        fields: task.fields,
        beforeDispatch: gate.beforeDispatch,
        assertDispatch: gate.assertDispatch,
      });
      if (!gate.wasAdmitted()) throw new Error('CLI 适配没有经过任务提交门');
      const status = baseResultStatus(result);
      return this.finishBase(
        task,
        status,
        status === 'succeeded' ? undefined : '创建结果未完全确认，请到飞书核对；不会自动重试',
        gate.wasClaimed(),
        result,
      );
    } catch (error) {
      const uncertain = error instanceof FeishuCliError ? error.dispatched : gate?.wasAdmitted();
      return this.finishBase(
        task,
        uncertain ? 'unknown' : 'failed',
        uncertain
          ? '创建未确认，请到飞书核对；不会自动重试'
          : '创建前检查失败，请确认插件、账号、目录和策略后重新发起任务',
        gate?.wasClaimed(),
      );
    }
  }
  private assertBaseTaskAuthorization(
    task: PartnerFeishuBaseCreateTaskT,
    binding: PartnerConnectorSnapshotT,
  ): void {
    if (
      binding.connectionRevision !== task.connectionRevision ||
      scopeHash(binding) !== task.scopeHash ||
      baseInputHash(task) !== task.inputHash
    )
      throw new Error('多维表格任务或授权范围已变化');
  }
  private createBaseDispatchGate(
    context: PartnerConnectorContext,
    task: PartnerFeishuBaseCreateTaskT,
    auth: ConnectorAuthorization,
  ): BaseDispatchGate {
    let claimed = false;
    let admitted = false;
    return {
      beforeDispatch: async () => {
        const current = await this.authorize(
          context,
          task.connectionId,
          task.folderUrl,
          'createBase',
        );
        await this.claimBaseTask(task);
        claimed = true;
        this.publishChanged(context, task.extensionId, task.id);
        current.assertLive();
        auth.assertLive();
      },
      assertDispatch: () => {
        auth.assertLive();
        if (!claimed) throw new Error('未完成持久化提交门');
        admitted = true;
      },
      wasClaimed: () => claimed,
      wasAdmitted: () => admitted,
    };
  }
  private claimBaseTask(task: PartnerFeishuBaseCreateTaskT): Promise<void> {
    return this.store.mutate((db) => {
      const current = db.baseTasks.find((item) => item.id === task.id);
      if (
        current?.status !== 'preparing' ||
        current.inputHash !== task.inputHash ||
        baseInputHash(current) !== task.inputHash
      )
        throw new Error('多维表格任务已经处理或内容变化');
      const connected = db.connections.some(
        (account) =>
          account.id === task.connectionId &&
          account.revision === task.connectionRevision &&
          account.connected,
      );
      if (!connected) throw new Error('连接授权已撤销');
      current.status = 'submitting';
      current.updatedAt = new Date().toISOString();
      db.dispatchOwners[task.id] = process.pid;
    });
  }
  private finishBase(
    task: PartnerFeishuBaseCreateTaskT,
    status: PartnerFeishuBaseCreateTaskT['status'],
    error?: string,
    ownsDispatch = false,
    result: FeishuBaseWriteResult = { status: 'unknown' },
  ): Promise<PartnerFeishuBaseCreateTaskT> {
    return this.store.mutate((db) => {
      const current = db.baseTasks.find((item) => item.id === task.id)!;
      if (current.status !== 'preparing' && !(current.status === 'submitting' && ownsDispatch))
        return current;
      current.status = status;
      current.updatedAt = new Date().toISOString();
      if (error) current.error = error;
      if (result.baseToken) current.baseToken = result.baseToken;
      if (result.tableId) current.tableId = result.tableId;
      if (result.url) current.url = result.url;
      delete db.dispatchOwners[task.id];
      return partnerFeishuBaseCreateTaskSchema.parse(current);
    });
  }
  async records(context: PartnerConnectorContext): Promise<PartnerRemoteRecordsT> {
    this.assertContext(context);
    // Also reconciles dead writers; only metadata leaves this list endpoint.
    const db = await this.store.readReconciled();
    return {
      sources: db.sources
        .filter((item) => own(context, item))
        .slice(-200)
        .map(({ content: _content, ...item }) => item),
      proposals: db.proposals
        .filter((item) => own(context, item))
        .slice(-200)
        .map(({ content: _content, ...item }) => item),
      receipts: db.receipts.filter((item) => own(context, item)).slice(-200),
      baseTasks: db.baseTasks.filter((item) => own(context, item)).slice(-200),
      documentTasks: db.documentTasks
        .filter((item) => own(context, item))
        .slice(-200)
        .map(
          ({
            turnExecutionId: _turnExecutionId,
            invocationKey: _invocationKey,
            content: _content,
            inputHash: _inputHash,
            scopeHash: _scopeHash,
            ...item
          }) => item,
        ),
      recordRevision: db.recordRevision,
    };
  }
  async getSource(
    context: PartnerConnectorContext,
    id: string,
  ): Promise<PartnerRemoteSourceT | null> {
    this.assertContext(context);
    return (
      (await this.store.read()).sources.find((item) => item.id === id && own(context, item)) ?? null
    );
  }
  async getProposal(
    context: PartnerConnectorContext,
    id: string,
  ): Promise<PartnerRemoteProposalT | null> {
    this.assertContext(context);
    return (
      (await this.store.read()).proposals.find((item) => item.id === id && own(context, item)) ??
      null
    );
  }
  async reject(context: PartnerConnectorContext, id: string): Promise<PartnerRemoteProposalT> {
    this.assertContext(context);
    const proposal = await this.store.mutate((db) => {
      const p = db.proposals.find((item) => item.id === id && own(context, item));
      if (!p) throw new Error('提案不存在');
      if (p.status === 'pending') {
        p.status = 'rejected';
        p.updatedAt = new Date().toISOString();
      }
      return p;
    });
    this.publishChanged(context, proposal.extensionId);
    return proposal;
  }
  async apply(
    context: PartnerConnectorContext,
    id: string,
    expectedContentHash: string,
  ): Promise<PartnerRemoteProposalT> {
    this.assertContext(context);
    const p = await this.getProposal(context, id);
    if (!p) throw new Error('提案不存在');
    if (p.contentHash !== expectedContentHash || contentHash(p) !== expectedContentHash)
      throw new Error('提案内容变化，请重新审核');
    if (p.status !== 'pending') return p;
    const promise = this.submit(context, p);
    this.active.set(promise, p.extensionId);
    try {
      return await promise;
    } finally {
      this.active.delete(promise);
      this.publishChanged(context, p.extensionId);
    }
  }
  private async submit(
    context: PartnerConnectorContext,
    p: PartnerRemoteProposalT,
  ): Promise<PartnerRemoteProposalT> {
    if (p.operation !== 'append')
      return this.finish(p, 'rejected', '旧版新建文档审核流程已停用，请从聊天中重新发起创建任务');
    let claimed = false;
    let dispatched = false;
    try {
      const auth = await this.authorize(context, p.connectionId, p.targetUrl, p.operation);
      if (
        auth.binding.connectionRevision !== p.connectionRevision ||
        scopeHash(auth.binding) !== p.scopeHash
      )
        throw new Error('提案授权范围已变化');
      const base = await this.deps.cli.read({
        ...this.feishuArgs(auth.account),
        documentUrl: p.targetUrl,
        beforeRead: async () => {
          await this.authorize(context, p.connectionId, p.targetUrl, p.operation);
        },
        assertRead: auth.assertLive,
      });
      if (base.revision !== p.baseRevision || digest(base.content) !== p.baseContentHash)
        return this.finish(p, 'conflict', '飞书文档已变化，请读取最新内容并创建新提案');
      const beforeDispatch = async () => {
        const currentAuth = await this.authorize(context, p.connectionId, p.targetUrl, p.operation);
        await this.store.mutate((db) => {
          const current = db.proposals.find((item) => item.id === p.id);
          if (current?.status !== 'pending' || current.contentHash !== p.contentHash)
            throw new Error('提案已经处理，请刷新状态');
          if (
            !db.connections.some(
              (account) =>
                account.id === p.connectionId &&
                account.revision === p.connectionRevision &&
                account.connected,
            )
          )
            throw new Error('连接授权已撤销');
          current.status = 'submitting';
          current.updatedAt = new Date().toISOString();
          db.dispatchOwners[p.id] = process.pid;
        });
        claimed = true;
        currentAuth.assertLive();
        auth.assertLive();
      };
      const assertDispatch = () => {
        auth.assertLive();
        if (!claimed) throw new Error('未完成持久化提交门');
        dispatched = true;
      };
      const result: FeishuWriteResult = await this.deps.cli.append({
        ...this.feishuArgs(auth.account),
        documentUrl: p.targetUrl,
        baseRevision: p.baseRevision!,
        text: p.content,
        beforeRead: async () => {
          await this.authorize(context, p.connectionId, p.targetUrl, p.operation);
        },
        assertRead: auth.assertLive,
        beforeDispatch,
        assertDispatch,
      });
      if (!dispatched) throw new Error('CLI 适配没有经过审核提交门');
      if (result.status !== 'success')
        return this.finish(
          p,
          result.status,
          '提交结果未完全确认，请到飞书核对；不会自动重试',
          claimed,
        );
      const receipt = partnerRemoteReceiptSchema.parse({
        id: randomUUID(),
        sessionId: p.sessionId,
        projectRoot: p.projectRoot,
        extensionId: p.extensionId,
        connectorId: p.connectorId,
        connectionId: p.connectionId,
        proposalId: p.id,
        operation: p.operation,
        documentId: result.documentId,
        url: result.url,
        title: p.title,
        revision: result.revision,
        completedAt: new Date().toISOString(),
      });
      if (receipt.url !== p.targetUrl) throw new Error('飞书回执目标不一致');
      return this.store.mutate((db) => {
        const current = db.proposals.find((item) => item.id === p.id)!;
        current.status = 'succeeded';
        current.updatedAt = receipt.completedAt;
        db.receipts.push(receipt);
        delete db.dispatchOwners[p.id];
        return current;
      });
    } catch (error) {
      if (error instanceof FeishuCliError && error.code === 'revision_changed' && !dispatched)
        return this.finish(p, 'conflict', '飞书文档已变化，请创建新提案');
      // Preflight errors cannot write; once dispatch is admitted, uncertainty is permanent.
      return this.finish(
        p,
        dispatched || (error instanceof FeishuCliError && error.dispatched) ? 'unknown' : 'failed',
        dispatched
          ? '提交未确认，请到飞书核对；不会自动重试'
          : '提交前检查失败，请确认插件、账号、范围和策略后创建新提案',
        claimed,
      );
    }
  }
  private finish(
    p: PartnerRemoteProposalT,
    status: PartnerRemoteProposalT['status'],
    error: string,
    ownsDispatch = false,
  ): Promise<PartnerRemoteProposalT> {
    return this.store.mutate((db) => {
      const current = db.proposals.find((item) => item.id === p.id)!;
      if (current.status !== 'pending' && !(current.status === 'submitting' && ownsDispatch))
        return current;
      current.status = status;
      current.error = error;
      current.updatedAt = new Date().toISOString();
      delete db.dispatchOwners[p.id];
      return current;
    });
  }
  async deactivate<T>(extensionId: string | undefined, operation: () => Promise<T>): Promise<T> {
    this.revocationEpoch++;
    const key = extensionId ?? '*';
    this.blocked.set(key, (this.blocked.get(key) ?? 0) + 1);
    try {
      await this.deps.revokeConnections?.(extensionId);
      await this.drainActive(extensionId);
      return await operation();
    } finally {
      const count = this.blocked.get(key)! - 1;
      if (count) this.blocked.set(key, count);
      else this.blocked.delete(key);
    }
  }
}
