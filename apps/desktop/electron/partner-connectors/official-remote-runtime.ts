import { createSlackConnector } from './slack-api.js';
import { createZoomConnector } from './zoom-api.js';
import { createGithubConnector } from './github-api.js';
import path from 'node:path';
import { deleteKey, getKey, setKey } from '../providers/keychain.js';
import {
  createAirtableConnector,
  createAtlassianConnector,
  createNotionConnector,
  type RemoteMcpAuthPort,
} from './official-remote-connectors.js';
import {
  createRemoteMcpClient,
  defineRemoteMcpProvider,
  type RemoteMcpManagerFactory,
} from './remote-mcp-client.js';
import {
  createRemoteMcpOAuth,
  RemoteMcpOAuthError,
  type CredentialStore,
  type RemoteMcpOAuth,
  type RemoteMcpOAuthConfig,
} from './remote-mcp-oauth.js';
import { ReadConnectorError, type ReadConnector } from './read-connector.js';

const strictObject = (
  properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  required: readonly string[] = [],
) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

/** Audited, read-only capabilities. Live schemas must still match before every dispatch. */
export const notionRemoteMcpProvider = defineRemoteMcpProvider({
  serverId: 'notion-office-read',
  endpoint: 'https://mcp.notion.com/mcp',
  allowedHosts: ['mcp.notion.com'],
  readTools: {
    'notion-fetch': {
      inputSchema: strictObject({ id: { type: 'string' } }, ['id']),
    },
  },
});

export const airtableRemoteMcpProvider = defineRemoteMcpProvider({
  serverId: 'airtable-office-read',
  endpoint: 'https://mcp.airtable.com/mcp',
  allowedHosts: ['mcp.airtable.com'],
  readTools: {
    list_workspaces: { inputSchema: strictObject({}) },
    list_records_for_table: {
      inputSchema: strictObject(
        {
          baseId: { type: 'string' },
          tableId: { type: 'string' },
          pageSize: { type: 'integer' },
        },
        ['baseId', 'tableId'],
      ),
    },
  },
});

export const atlassianRemoteMcpProvider = defineRemoteMcpProvider({
  serverId: 'atlassian-office-read',
  endpoint: 'https://mcp.atlassian.com/v2/mcp',
  allowedHosts: ['mcp.atlassian.com'],
  readTools: {
    atlassianUserInfo: { inputSchema: strictObject({}) },
    getAccessibleAtlassianResources: { inputSchema: strictObject({}) },
    getJiraIssue: {
      inputSchema: strictObject({ cloudId: { type: 'string' }, issueIdOrKey: { type: 'string' } }, [
        'cloudId',
        'issueIdOrKey',
      ]),
    },
    getConfluenceContent: {
      inputSchema: strictObject({ cloudId: { type: 'string' }, contentId: { type: 'string' } }, [
        'cloudId',
        'contentId',
      ]),
    },
  },
});

function exactEndpoint(origin: string, pathname: string): (url: URL) => boolean {
  return (url) =>
    url.origin === origin &&
    url.pathname === pathname &&
    url.search === '' &&
    url.hash === '' &&
    url.username === '' &&
    url.password === '';
}

const NOTION_ORIGIN = 'https://mcp.notion.com';
const AIRTABLE_ORIGIN = 'https://airtable.com';
const ATLASSIAN_ORIGIN = 'https://auth.atlassian.com';
const ATLASSIAN_DCR_TENANT = 'VCeDsk8ZHncYF1g234fKtc4lNipbBhu3';

/** OAuth discovery is accepted only when it resolves to these reviewed official endpoints. */
export const officialRemoteOAuthConfigs = {
  notion: {
    providerId: 'notion',
    serverUrl: notionRemoteMcpProvider.endpoint,
    clientName: 'KodaX Space · Notion (read-only)',
    scopes: ['default'],
    isAuthorizationEndpoint: exactEndpoint(NOTION_ORIGIN, '/authorize'),
    isTokenEndpoint: exactEndpoint(NOTION_ORIGIN, '/token'),
    isRegistrationEndpoint: exactEndpoint(NOTION_ORIGIN, '/register'),
  },
  airtable: {
    providerId: 'airtable',
    serverUrl: airtableRemoteMcpProvider.endpoint,
    clientName: 'KodaX Space · Airtable (read-only)',
    scopes: [
      'data.records:read',
      'schema.bases:read',
      'data.recordComments:read',
      'workspacesAndBases:read',
    ],
    isAuthorizationEndpoint: exactEndpoint(AIRTABLE_ORIGIN, '/oauth2/v1/authorize'),
    isTokenEndpoint: exactEndpoint(AIRTABLE_ORIGIN, '/oauth2/v1/token'),
    isRegistrationEndpoint: exactEndpoint(AIRTABLE_ORIGIN, '/oauth2/v1/register'),
  },
  atlassian: {
    providerId: 'atlassian',
    serverUrl: atlassianRemoteMcpProvider.endpoint,
    clientName: 'KodaX Space · Atlassian (read-only)',
    scopes: [
      'read:me',
      'read:account',
      'offline_access',
      'read:jira:agent-interface',
      'read:confluence:agent-interface',
    ],
    isAuthorizationEndpoint: exactEndpoint(ATLASSIAN_ORIGIN, '/authorize'),
    isTokenEndpoint: exactEndpoint(ATLASSIAN_ORIGIN, '/oauth/token'),
    isRegistrationEndpoint: exactEndpoint(
      ATLASSIAN_ORIGIN,
      `/${ATLASSIAN_DCR_TENANT}/dcr/register`,
    ),
  },
} as const satisfies Record<string, RemoteMcpOAuthConfig>;

function mapOAuthError(error: unknown): ReadConnectorError {
  if (error instanceof RemoteMcpOAuthError) {
    if (error.code === 'authorization_cancelled') return new ReadConnectorError('cancelled');
    if (error.code === 'authorization_expired') return new ReadConnectorError('expired');
    if (error.code === 'invalid_profile') return new ReadConnectorError('invalid_response');
  }
  return new ReadConnectorError('authorization_failed');
}

function onboardingAuth(oauth: RemoteMcpOAuth): RemoteMcpAuthPort {
  return {
    authorize: async (input) => {
      try {
        await oauth.authorize(input.profile, {
          signal: input.signal,
          onAuthorizationUrl: (authorizationUrl) =>
            input.onProgress({
              phase: 'waiting_authorization',
              authorizationUrl,
              expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }),
        });
      } catch (error) {
        throw mapOAuthError(error);
      }
    },
    accessToken: async (profile, signal) => {
      try {
        return await oauth.accessToken(profile, signal);
      } catch (error) {
        throw mapOAuthError(error);
      }
    },
    disconnect: async (profile) => {
      try {
        await oauth.disconnect(profile);
      } catch (error) {
        throw mapOAuthError(error);
      }
    },
    isAuthorizationUrl: (value): value is string => oauth.isAuthorizationUrl(value),
  };
}

export interface CredentialPersistence {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<unknown>;
}

/** Credential deletion succeeds only when the same backend can no longer read the secret. */
export function createVerifiedCredentialStore(persistence: CredentialPersistence): CredentialStore {
  return {
    get: (key) => persistence.get(key),
    set: (key, value) => persistence.set(key, value),
    delete: async (key) => {
      // Prime the backend/cache so an adapter that swallows delete errors cannot hide a retained key.
      await persistence.get(key);
      await persistence.delete(key);
      if ((await persistence.get(key)) !== undefined)
        throw new Error('credential deletion could not be verified');
    },
  };
}

const keychainCredentials = createVerifiedCredentialStore({
  get: getKey,
  set: setKey,
  delete: deleteKey,
});

export interface OfficialRemoteConnectorBundleOptions {
  readonly root: string;
  readonly credentials?: CredentialStore;
  readonly managerFactory?: RemoteMcpManagerFactory;
  readonly fetchFn?: typeof fetch;
}

const AIRTABLE_WHOAMI_URL = 'https://api.airtable.com/v0/meta/whoami';
const CREDENTIAL_PROFILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;

function legacyCredentialCleanup(
  providerId: 'slack' | 'zoom',
  credentials: CredentialStore,
): (profile: string, signal?: AbortSignal) => Promise<void> {
  return async (profile, signal) => {
    if (!CREDENTIAL_PROFILE.test(profile)) throw new ReadConnectorError('invalid_response');
    if (signal?.aborted) throw new ReadConnectorError('cancelled');
    const key = `partner-connector-oauth:${providerId}:${profile}`;
    try {
      await credentials.delete(key);
      if ((await credentials.get(key)) !== undefined) throw new Error('credential retained');
    } catch {
      throw new ReadConnectorError('authorization_failed');
    }
  };
}

/** Airtable MCP has no stable who-am-I tool; its official Web API returns the OAuth user id. */
export async function resolveAirtableSubject(
  bearerToken: string,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string> {
  if (
    bearerToken.length < 1 ||
    bearerToken.length > 32768 ||
    /[\u0000-\u001f\u007f]/u.test(bearerToken)
  )
    throw new ReadConnectorError('invalid_response');
  let response: Response;
  try {
    response = await fetchFn(AIRTABLE_WHOAMI_URL, {
      headers: { Authorization: `Bearer ${bearerToken}` },
      redirect: 'error',
      signal,
    });
  } catch {
    throw new ReadConnectorError(signal?.aborted ? 'cancelled' : 'read_failed');
  }
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (!response.ok || (declaredLength && declaredLength > 32768))
    throw new ReadConnectorError('read_failed');
  const raw = await response.text();
  if (raw.length > 32768) throw new ReadConnectorError('invalid_response');
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    const record = parsed as Record<string, unknown>;
    if (typeof record.id !== 'string' || !/^usr[A-Za-z0-9]{10,64}$/u.test(record.id))
      throw new Error('identity');
    if (
      !Array.isArray(record.scopes) ||
      record.scopes.some((scope) => typeof scope !== 'string') ||
      officialRemoteOAuthConfigs.airtable.scopes.some(
        (scope) => !(record.scopes as string[]).includes(scope),
      )
    )
      throw new Error('scope');
    return record.id;
  } catch {
    throw new ReadConnectorError('invalid_response');
  }
}

/** Creates only host-owned adapters. No endpoint, token, scope or tool comes from the manifest. */
export function createOfficialRemoteConnectorBundle(
  options: OfficialRemoteConnectorBundleOptions,
): Record<
  'notion-mcp' | 'airtable-mcp' | 'atlassian-mcp' | 'slack-mcp' | 'zoom-mcp' | 'github-api',
  ReadConnector
> {
  if (!path.isAbsolute(options.root)) throw new Error('connector root must be absolute');
  const credentials = options.credentials ?? keychainCredentials;
  const fetchFn = options.fetchFn ?? fetch;
  const notionAuth = onboardingAuth(
    createRemoteMcpOAuth(officialRemoteOAuthConfigs.notion, { credentials, fetchFn }),
  );
  const airtableAuth = onboardingAuth(
    createRemoteMcpOAuth(officialRemoteOAuthConfigs.airtable, { credentials, fetchFn }),
  );
  const atlassianAuth = onboardingAuth(
    createRemoteMcpOAuth(officialRemoteOAuthConfigs.atlassian, { credentials, fetchFn }),
  );
  const cache = (provider: string, profile: string) =>
    path.join(options.root, 'mcp-cache', provider, profile);

  return {
    'notion-mcp': createNotionConnector({
      auth: notionAuth,
      client: (profile, bearerToken) =>
        createRemoteMcpClient({
          provider: notionRemoteMcpProvider,
          bearerToken,
          cacheDir: cache('notion', profile),
          ...(options.managerFactory ? { managerFactory: options.managerFactory } : {}),
        }),
    }),
    'airtable-mcp': createAirtableConnector({
      auth: airtableAuth,
      resolveSubject: (bearerToken, signal) => resolveAirtableSubject(bearerToken, fetchFn, signal),
      client: (profile, bearerToken) =>
        createRemoteMcpClient({
          provider: airtableRemoteMcpProvider,
          bearerToken,
          cacheDir: cache('airtable', profile),
          ...(options.managerFactory ? { managerFactory: options.managerFactory } : {}),
        }),
    }),
    'atlassian-mcp': createAtlassianConnector({
      auth: atlassianAuth,
      client: (profile, bearerToken) =>
        createRemoteMcpClient({
          provider: atlassianRemoteMcpProvider,
          bearerToken,
          cacheDir: cache('atlassian', profile),
          ...(options.managerFactory ? { managerFactory: options.managerFactory } : {}),
        }),
    }),
    'slack-mcp': createSlackConnector({
      credentials,
      fetchFn,
      cleanupLegacy: legacyCredentialCleanup('slack', credentials),
    }),
    'github-api': createGithubConnector({ credentials, fetchFn }),
    'zoom-mcp': createZoomConnector({
      credentials,
      fetchFn,
      cleanupLegacy: legacyCredentialCleanup('zoom', credentials),
    }),
  };
}
