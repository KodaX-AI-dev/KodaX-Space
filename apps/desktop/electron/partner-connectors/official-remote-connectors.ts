import type { FeishuOnboardingInput } from './feishu-onboarding-cli.js';
import {
  ReadConnectorError,
  checkReadConnectorDocument,
  type ReadConnector,
  type ReadConnectorDocument,
  type ReadConnectorIdentity,
  type ReadConnectorInput,
  type ReadConnectorStatus,
} from './read-connector.js';

export interface RemoteMcpResult {
  readonly content?: string;
  readonly structuredContent?: unknown;
}

/** Host-owned auth port. Implementations keep credentials out of renderer, extension and model. */
export interface RemoteMcpAuthPort {
  authorize(input: FeishuOnboardingInput): Promise<void>;
  accessToken(profile: string, signal?: AbortSignal): Promise<string>;
  disconnect(profile: string): Promise<void>;
  isAuthorizationUrl(value: unknown): value is string;
}

/** Narrow projection over remote-mcp-client; arbitrary endpoint/tool dispatch is intentionally absent. */
export interface RemoteMcpClientPort<TTool extends string> {
  executeFixed(
    tool: TTool,
    args: Record<string, unknown>,
    guard?: {
      readonly beforeDispatch?: () => void | Promise<void>;
      readonly assertAllowed?: () => void;
    },
  ): Promise<RemoteMcpResult>;
}

export interface OfficialRemoteConnectorOptions<TTool extends string> {
  readonly auth: RemoteMcpAuthPort;
  /** The composition root supplies a provider-pinned client; this layer cannot select a URL. */
  readonly client: (profile: string, bearerToken: string) => RemoteMcpClientPort<TTool>;
  /** Optional fixed-provider identity endpoint; used when MCP does not expose a stable user id. */
  readonly resolveSubject?: (bearerToken: string, signal?: AbortSignal) => Promise<string>;
}

export type DisconnectingReadConnector = ReadConnector & {
  disconnect(profile: string, signal?: AbortSignal): Promise<void>;
};

interface VerifiedAccount {
  identity: ReadConnectorIdentity;
  authorities?: ReadonlySet<string>;
  authorityAliases?: ReadonlyMap<string, string>;
}

interface ResourceCall<TTool extends string> {
  documentId: string;
  title: string;
  tool: TTool;
  args: Record<string, unknown>;
}

interface ProviderDefinition<TTool extends string> {
  id: 'notion-mcp' | 'airtable-mcp' | 'atlassian-mcp';
  identityCalls: readonly { tool: TTool; args: Record<string, unknown> }[];
  parseIdentity(results: readonly RemoteMcpResult[]): VerifiedAccount;
  parseResource(value: string, account?: VerifiedAccount): ResourceCall<TTool> | undefined;
}

const PROFILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const NOTION_PAGE = /^notion:\/\/page\/([0-9a-f]{32})$/u;
const AIRTABLE_TABLE =
  /^airtable:\/\/base\/(app[A-Za-z0-9]{10,32})\/table\/(tbl[A-Za-z0-9]{10,32})$/u;
const ATLASSIAN_RESOURCE =
  /^atlassian:\/\/(jira|confluence)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([A-Z][A-Z0-9]{0,31}-[1-9][0-9]{0,15}|[1-9][0-9]{0,31})$/u;
const ATLASSIAN_JIRA_URL =
  /^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net)\/browse\/([A-Z][A-Z0-9]{0,31}-[1-9][0-9]{0,15})$/u;
const ATLASSIAN_CONFLUENCE_URL =
  /^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net)\/wiki\/spaces\/[A-Za-z0-9_-]{1,128}\/pages\/([1-9][0-9]{0,31})(?:\/[A-Za-z0-9%._~-]{1,200})?$/u;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown, maximum = 160): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    return undefined;
  return value.trim() || undefined;
}

function value(result: RemoteMcpResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (typeof result.content !== 'string' || Buffer.byteLength(result.content) > 2 * 1024 * 1024)
    throw new ReadConnectorError('invalid_response');
  try {
    return JSON.parse(result.content) as unknown;
  } catch {
    throw new ReadConnectorError('invalid_response');
  }
}

function body(result: RemoteMcpResult): string {
  if (typeof result.content === 'string' && result.content.length > 0) return result.content;
  if (result.structuredContent === undefined) throw new ReadConnectorError('invalid_response');
  try {
    const serialized = JSON.stringify(result.structuredContent, null, 2);
    if (!serialized) throw new Error('empty');
    return serialized;
  } catch {
    throw new ReadConnectorError('invalid_response');
  }
}

function notionIdentity(results: readonly RemoteMcpResult[]): VerifiedAccount {
  const root = record(value(results[0]!));
  const self = record(root?.self);
  const workspace = record(self?.workspace);
  const user = record(self?.user);
  const authorityId = text(workspace?.id ?? self?.workspace_id);
  const workspaceName = text(workspace?.name ?? self?.workspace_name);
  const subjectId = text(user?.id ?? self?.user_id);
  const userName = text(user?.name ?? self?.user_name ?? user?.email ?? self?.user_email);
  if (!authorityId || !subjectId || !userName || !workspaceName)
    throw new ReadConnectorError('invalid_response');
  return {
    identity: { authorityId, subjectId, label: `${userName} · ${workspaceName}`.slice(0, 160) },
  };
}

function workspaceArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  const root = record(value);
  return Array.isArray(root?.workspaces) ? root.workspaces : undefined;
}

function airtableIdentity(results: readonly RemoteMcpResult[]): VerifiedAccount {
  const workspaces = workspaceArray(value(results[0]!));
  if (!workspaces || workspaces.length < 1 || workspaces.length > 1000)
    throw new ReadConnectorError('invalid_response');
  const parsed = workspaces.map((item) => {
    const workspace = record(item);
    const id = text(workspace?.id);
    const name = text(workspace?.name);
    if (!id || !name) throw new ReadConnectorError('invalid_response');
    return { id, name };
  });
  const ids = parsed.map((item) => item.id).sort();
  const suffix = parsed.length > 1 ? ` 等 ${parsed.length} 个工作区` : '';
  return {
    identity: {
      authorityId: 'airtable',
      subjectId: 'airtable-user-unverified',
      label: `Airtable · ${parsed[0]!.name}${suffix}`.slice(0, 160),
    },
    authorities: new Set(ids),
  };
}

function atlassianResources(value: unknown): Array<{ id: string; name: string; hostname: string }> {
  const source = Array.isArray(value) ? value : record(value)?.resources;
  if (!Array.isArray(source) || source.length < 1 || source.length > 1000)
    throw new ReadConnectorError('invalid_response');
  return source.map((item) => {
    const resource = record(item);
    const id = text(resource?.id);
    const name = text(resource?.name);
    const url = text(resource?.url, 512);
    if (!id || !name || !url) throw new ReadConnectorError('invalid_response');
    let hostname: string;
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' ||
        !parsed.hostname.endsWith('.atlassian.net') ||
        parsed.username ||
        parsed.password
      )
        throw new Error('origin');
      hostname = parsed.hostname;
    } catch {
      throw new ReadConnectorError('invalid_response');
    }
    return { id, name, hostname };
  });
}

function atlassianIdentity(results: readonly RemoteMcpResult[]): VerifiedAccount {
  const user = record(value(results[0]!));
  const resources = atlassianResources(value(results[1]!));
  const subjectId = text(user?.account_id ?? user?.accountId ?? user?.id);
  const userName = text(user?.name ?? user?.displayName ?? user?.email);
  if (!subjectId || !userName) throw new ReadConnectorError('invalid_response');
  return {
    identity: {
      authorityId: 'atlassian',
      subjectId,
      label: `${userName} · ${resources[0]!.name}`.slice(0, 160),
    },
    authorities: new Set(resources.map((item) => item.id)),
    authorityAliases: new Map(resources.map((item) => [item.hostname, item.id])),
  };
}

const NOTION: ProviderDefinition<'notion-fetch'> = {
  id: 'notion-mcp',
  identityCalls: [{ tool: 'notion-fetch', args: { id: 'self' } }],
  parseIdentity: notionIdentity,
  parseResource: (resource) => {
    const id = NOTION_PAGE.exec(resource)?.[1];
    return id
      ? {
          documentId: id,
          title: `Notion 页面 ${id.slice(0, 8)}`,
          tool: 'notion-fetch',
          args: { id },
        }
      : undefined;
  },
};

const AIRTABLE: ProviderDefinition<'list_workspaces' | 'list_records_for_table'> = {
  id: 'airtable-mcp',
  identityCalls: [{ tool: 'list_workspaces', args: {} }],
  parseIdentity: airtableIdentity,
  parseResource: (resource) => {
    const match = AIRTABLE_TABLE.exec(resource);
    if (!match) return undefined;
    const [, baseId, tableId] = match;
    return {
      documentId: `${baseId}/${tableId}`,
      title: `Airtable 表 ${tableId}`,
      tool: 'list_records_for_table',
      args: { baseId, tableId, pageSize: 25 },
    };
  },
};

const ATLASSIAN: ProviderDefinition<
  'atlassianUserInfo' | 'getAccessibleAtlassianResources' | 'getJiraIssue' | 'getConfluenceContent'
> = {
  id: 'atlassian-mcp',
  identityCalls: [
    { tool: 'atlassianUserInfo', args: {} },
    { tool: 'getAccessibleAtlassianResources', args: {} },
  ],
  parseIdentity: atlassianIdentity,
  parseResource: (resource, account) => {
    const internal = ATLASSIAN_RESOURCE.exec(resource);
    const jira = ATLASSIAN_JIRA_URL.exec(resource);
    const confluence = ATLASSIAN_CONFLUENCE_URL.exec(resource);
    if (!internal && !jira && !confluence) return undefined;
    const kind = internal?.[1] ?? (jira ? 'jira' : 'confluence');
    const authorityKey = internal?.[2] ?? jira?.[1] ?? confluence![1];
    const id = internal?.[3] ?? jira?.[2] ?? confluence![2];
    const cloudId = internal
      ? authorityKey
      : (account?.authorityAliases?.get(authorityKey) ?? authorityKey);
    if (
      account &&
      (internal ? !account.authorities?.has(cloudId) : !account.authorityAliases?.has(authorityKey))
    )
      return undefined;
    return kind === 'jira'
      ? {
          documentId: `${authorityKey}/jira/${id}`,
          title: `Jira ${id}`,
          tool: 'getJiraIssue',
          args: { cloudId, issueIdOrKey: id },
        }
      : {
          documentId: `${authorityKey}/confluence/${id}`,
          title: `Confluence ${id}`,
          tool: 'getConfluenceContent',
          args: { cloudId, contentId: id },
        };
  },
};

function sameIdentity(expected: ReadConnectorIdentity, actual: ReadConnectorIdentity): boolean {
  return expected.authorityId === actual.authorityId && expected.subjectId === actual.subjectId;
}

function mapRemoteFailure(error: unknown, signal?: AbortSignal): never {
  if (error instanceof ReadConnectorError) throw error;
  if (signal?.aborted) throw new ReadConnectorError('cancelled');
  throw new ReadConnectorError('read_failed');
}

function createRemoteConnector<TTool extends string>(
  provider: ProviderDefinition<TTool>,
  options: OfficialRemoteConnectorOptions<TTool>,
): DisconnectingReadConnector {
  const token = async (profile: string, signal?: AbortSignal): Promise<string> => {
    try {
      return await options.auth.accessToken(profile, signal);
    } catch (error) {
      mapRemoteFailure(error, signal);
    }
  };
  const call = async (
    profile: string,
    tool: TTool,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    dispatch?: Pick<ReadConnectorInput, 'beforeRead' | 'assertRead'>,
    bearerToken?: string,
  ): Promise<RemoteMcpResult> => {
    if (!PROFILE.test(profile) || signal?.aborted) throw new ReadConnectorError('cancelled');
    try {
      const client = options.client(profile, bearerToken ?? (await token(profile, signal)));
      return await client.executeFixed(
        tool,
        args,
        dispatch
          ? {
              beforeDispatch: dispatch.beforeRead,
              assertAllowed: dispatch.assertRead,
            }
          : undefined,
      );
    } catch (error) {
      mapRemoteFailure(error, signal);
    }
  };
  const account = async (profile: string, signal?: AbortSignal): Promise<VerifiedAccount> => {
    try {
      const bearerToken = await token(profile, signal);
      const results: RemoteMcpResult[] = [];
      for (const probe of provider.identityCalls)
        results.push(await call(profile, probe.tool, probe.args, signal, undefined, bearerToken));
      const parsed = provider.parseIdentity(results);
      if (!options.resolveSubject) return parsed;
      const subjectId = text(await options.resolveSubject(bearerToken, signal));
      if (!subjectId) throw new ReadConnectorError('invalid_response');
      return { ...parsed, identity: { ...parsed.identity, subjectId } };
    } catch (error) {
      mapRemoteFailure(error, signal);
    }
  };
  const inspect = async (profile: string, signal?: AbortSignal): Promise<ReadConnectorStatus> => {
    try {
      return {
        installed: true,
        version: 'remote-mcp',
        identity: (await account(profile, signal)).identity,
      };
    } catch {
      if (signal?.aborted) throw new ReadConnectorError('cancelled');
      return {
        installed: true,
        version: 'remote-mcp',
        reason: '官方远程服务账号尚未完成在线验证，请重新连接。',
      };
    }
  };
  const read = async (input: ReadConnectorInput): Promise<ReadConnectorDocument> => {
    const first = await account(input.profile);
    if (!sameIdentity(input.expected, first.identity))
      throw new ReadConnectorError('identity_changed');
    const resource = provider.parseResource(input.documentUrl, first);
    if (!resource) throw new ReadConnectorError('invalid_resource');
    let guardedAccount: VerifiedAccount | undefined;
    const result = await call(input.profile, resource.tool, resource.args, undefined, {
      beforeRead: async () => {
        await input.beforeRead();
        guardedAccount = await account(input.profile);
        if (!sameIdentity(input.expected, guardedAccount.identity))
          throw new ReadConnectorError('identity_changed');
        if (!provider.parseResource(input.documentUrl, guardedAccount))
          throw new ReadConnectorError('invalid_resource');
      },
      assertRead: input.assertRead,
    });
    input.assertRead();
    return checkReadConnectorDocument({
      documentId: resource.documentId,
      url: input.documentUrl,
      title: resource.title,
      revision: 0,
      content: body(result),
    });
  };
  return {
    id: provider.id,
    inspect,
    run: async (input) => {
      if (!PROFILE.test(input.profile)) throw new ReadConnectorError('invalid_response');
      input.onProgress({ phase: 'preparing' });
      await options.auth.authorize(input);
      if (input.signal.aborted) throw new ReadConnectorError('cancelled');
      input.onProgress({ phase: 'verifying' });
      await account(input.profile, input.signal);
    },
    isAuthorizationUrl: (candidate): candidate is string =>
      options.auth.isAuthorizationUrl(candidate),
    acceptsResource: (candidate) => !!provider.parseResource(candidate),
    read,
    disconnect: async (profile, signal) => {
      if (signal?.aborted) throw new ReadConnectorError('cancelled');
      await options.auth.disconnect(profile);
    },
  };
}

export function createNotionConnector(
  options: OfficialRemoteConnectorOptions<'notion-fetch'>,
): DisconnectingReadConnector {
  return createRemoteConnector(NOTION, options);
}

export function createAirtableConnector(
  options: OfficialRemoteConnectorOptions<'list_workspaces' | 'list_records_for_table'> & {
    readonly resolveSubject: NonNullable<
      OfficialRemoteConnectorOptions<'list_workspaces' | 'list_records_for_table'>['resolveSubject']
    >;
  },
): DisconnectingReadConnector {
  return createRemoteConnector(AIRTABLE, options);
}

export function createAtlassianConnector(
  options: OfficialRemoteConnectorOptions<
    | 'atlassianUserInfo'
    | 'getAccessibleAtlassianResources'
    | 'getJiraIssue'
    | 'getConfluenceContent'
  >,
): DisconnectingReadConnector {
  return createRemoteConnector(ATLASSIAN, options);
}
