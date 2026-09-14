import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

type SdkMcpModule = typeof import('@kodax-ai/kodax/mcp');
type DiscoveredOAuthEndpoints = import('@kodax-ai/kodax/mcp').DiscoveredOAuthEndpoints;
type OAuthClientInfo = import('@kodax-ai/kodax/mcp').OAuthClientInfo;

let sdkMcpModuleCache: SdkMcpModule | null = null;
async function loadSdkMcpModule(): Promise<SdkMcpModule> {
  if (sdkMcpModuleCache === null) sdkMcpModuleCache = await import('@kodax-ai/kodax/mcp');
  return sdkMcpModuleCache;
}

export interface CredentialStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface LoopbackCallbackServer {
  readonly redirectUri: string;
  waitForCallback(signal?: AbortSignal): Promise<URL>;
  close(): Promise<void>;
}

export type RemoteMcpOAuthErrorCode =
  | 'authorization_cancelled'
  | 'authorization_expired'
  | 'authorization_failed'
  | 'invalid_profile'
  | 'not_authorized';

const ERROR_MESSAGES: Record<RemoteMcpOAuthErrorCode, string> = {
  authorization_cancelled: 'OAuth authorization was cancelled.',
  authorization_expired: 'OAuth authorization expired.',
  authorization_failed: 'OAuth authorization failed.',
  invalid_profile: 'The connector profile is invalid.',
  not_authorized: 'The connector is not authorized.',
};

export class RemoteMcpOAuthError extends Error {
  constructor(readonly code: RemoteMcpOAuthErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'RemoteMcpOAuthError';
  }
}

export interface RemoteMcpOAuthConfig {
  readonly providerId: string;
  readonly serverUrl: string;
  readonly clientName: string;
  readonly scopes?: readonly string[];
  readonly clientId?: string;
  readonly timeoutMs?: number;
  readonly isAuthorizationEndpoint: (url: URL) => boolean;
  readonly isTokenEndpoint: (url: URL) => boolean;
  readonly isRegistrationEndpoint: (url: URL) => boolean;
  readonly isResourceMetadataUrl?: (url: URL) => boolean;
}

interface DiscoverInput {
  readonly serverUrl: string;
  readonly resourceMetadataUrl?: string;
  readonly fetchFn?: typeof fetch;
}

interface RegisterInput {
  readonly registrationEndpoint: string;
  readonly redirectUri: string;
  readonly clientName: string;
  readonly scope?: string;
  readonly fetchFn?: typeof fetch;
}

export interface RemoteMcpOAuthDependencies {
  readonly credentials: CredentialStore;
  readonly fetchFn?: typeof fetch;
  readonly discoverEndpoints?: (
    input: DiscoverInput,
  ) => Promise<DiscoveredOAuthEndpoints | undefined>;
  readonly registerClient?: (input: RegisterInput) => Promise<OAuthClientInfo>;
  readonly createLoopbackServer?: (signal?: AbortSignal) => Promise<LoopbackCallbackServer>;
  readonly randomBytes?: (size: number) => Uint8Array;
  readonly now?: () => number;
}

export interface RemoteMcpAuthorizeInput {
  readonly signal?: AbortSignal;
  readonly resourceMetadataUrl?: string;
  readonly onAuthorizationUrl: (url: string) => void | Promise<void>;
}

export interface RemoteMcpOAuth {
  authorize(profile: string, input: RemoteMcpAuthorizeInput): Promise<void>;
  accessToken(profile: string, signal?: AbortSignal): Promise<string>;
  disconnect(profile: string): Promise<void>;
  isAuthorizationUrl(value: unknown): value is string;
}

interface StoredCredential {
  readonly version: 1;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: number;
  readonly tokenType?: string;
  readonly scope?: string;
  readonly tokenEndpoint: string;
  readonly resource?: string;
}

const PROFILE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,126}[a-z0-9])?$/u;
const PROVIDER_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const AUTHORIZATION_PARAMETERS = new Set([
  'client_id',
  'code_challenge',
  'code_challenge_method',
  'redirect_uri',
  'resource',
  'response_type',
  'scope',
  'state',
]);

function fail(code: RemoteMcpOAuthErrorCode): never {
  throw new RemoteMcpOAuthError(code);
}

function credentialKey(providerId: string, profile: string): string {
  if (!PROFILE_PATTERN.test(profile)) fail('invalid_profile');
  return `partner-connector-oauth:${providerId}:${profile}`;
}

function safeUrl(value: string): URL | undefined {
  if (value.length > 4096 || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function allowedEndpoint(value: string, predicate: (url: URL) => boolean): URL {
  const url = safeUrl(value);
  if (!url || url.protocol !== 'https:' || url.search || !predicate(url))
    fail('authorization_failed');
  return url;
}

function validLoopbackRedirect(value: string): boolean {
  const url = safeUrl(value);
  return (
    !!url &&
    url.protocol === 'http:' &&
    url.hostname === '127.0.0.1' &&
    /^\d+$/u.test(url.port) &&
    url.pathname === '/oauth/callback' &&
    !url.search
  );
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function fixedEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function parseCredential(value: string | undefined): StoredCredential | undefined {
  if (!value || value.length > 131072) return undefined;
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
    const record = candidate as Record<string, unknown>;
    if (
      record.version !== 1 ||
      !validSecret(record.clientId) ||
      !validSecret(record.accessToken) ||
      typeof record.tokenEndpoint !== 'string'
    )
      return undefined;
    return {
      version: 1,
      clientId: record.clientId,
      ...(validSecret(record.clientSecret) ? { clientSecret: record.clientSecret } : {}),
      accessToken: record.accessToken,
      ...(validSecret(record.refreshToken) ? { refreshToken: record.refreshToken } : {}),
      ...(typeof record.expiresAt === 'number' && Number.isFinite(record.expiresAt)
        ? { expiresAt: record.expiresAt }
        : {}),
      ...(typeof record.tokenType === 'string' ? { tokenType: record.tokenType } : {}),
      ...(typeof record.scope === 'string' ? { scope: record.scope } : {}),
      tokenEndpoint: record.tokenEndpoint,
      ...(typeof record.resource === 'string' ? { resource: record.resource } : {}),
    };
  } catch {
    return undefined;
  }
}

function validSecret(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 32768 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function normalizeScopes(values: readonly string[] | undefined): string | undefined {
  if (!values?.length) return undefined;
  if (
    values.length > 64 ||
    values.some((value) => !/^[\u0021\u0023-\u005b\u005d-\u007e]{1,256}$/u.test(value))
  )
    fail('authorization_failed');
  return [...new Set(values)].join(' ');
}

function parseTokenResponse(
  value: unknown,
  now: number,
): Omit<StoredCredential, 'version' | 'clientId' | 'tokenEndpoint'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('authorization_failed');
  const record = value as Record<string, unknown>;
  if (!validSecret(record.access_token)) fail('authorization_failed');
  const expiresIn = record.expires_in;
  if (
    expiresIn !== undefined &&
    (typeof expiresIn !== 'number' ||
      !Number.isFinite(expiresIn) ||
      expiresIn < 0 ||
      expiresIn > 315360000)
  )
    fail('authorization_failed');
  if (record.refresh_token !== undefined && !validSecret(record.refresh_token))
    fail('authorization_failed');
  return {
    accessToken: record.access_token,
    ...(validSecret(record.refresh_token) ? { refreshToken: record.refresh_token } : {}),
    ...(typeof expiresIn === 'number' ? { expiresAt: now + expiresIn * 1000 } : {}),
    ...(typeof record.token_type === 'string' ? { tokenType: record.token_type } : {}),
    ...(typeof record.scope === 'string' ? { scope: record.scope } : {}),
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > 131072) fail('authorization_failed');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail('authorization_failed');
  }
}

function authorizationUrlIsValid(
  value: unknown,
  predicate: (url: URL) => boolean,
): value is string {
  if (typeof value !== 'string') return false;
  const url = safeUrl(value);
  if (!url || url.protocol !== 'https:') return false;
  const endpoint = new URL(url);
  endpoint.search = '';
  if (!predicate(endpoint)) return false;
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => !AUTHORIZATION_PARAMETERS.has(key))) return false;
  if ([...new Set(keys)].length !== keys.length) return false;
  const redirect = url.searchParams.get('redirect_uri');
  return (
    url.searchParams.get('response_type') === 'code' &&
    validSecret(url.searchParams.get('client_id')) &&
    !!redirect &&
    validLoopbackRedirect(redirect) &&
    validSecret(url.searchParams.get('state')) &&
    validSecret(url.searchParams.get('code_challenge')) &&
    url.searchParams.get('code_challenge_method') === 'S256'
  );
}

function createAbortScope(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let expired = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    expired: () => expired,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    },
  };
}

function waitForRefresh(promise: Promise<string>, signal?: AbortSignal): Promise<string> {
  if (!signal) return promise;
  if (signal.aborted) fail('authorization_cancelled');
  return new Promise<string>((resolve, reject) => {
    const abort = () => reject(new RemoteMcpOAuthError('authorization_cancelled'));
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function defaultLoopbackServer(signal?: AbortSignal): Promise<LoopbackCallbackServer> {
  return new Promise((resolve, reject) => {
    let listeningPort = 0;
    let callbackResolve: ((url: URL) => void) | undefined;
    let callbackReject: ((error: Error) => void) | undefined;
    const callback = new Promise<URL>((callbackDone, callbackFailed) => {
      callbackResolve = callbackDone;
      callbackReject = callbackFailed;
    });
    const server = createServer((request, response) => {
      const raw = request.url ?? '';
      let url: URL | undefined;
      try {
        if (raw.length <= 4096) url = new URL(raw, `http://127.0.0.1:${listeningPort.toString()}`);
      } catch {
        url = undefined;
      }
      const valid = request.method === 'GET' && url?.pathname === '/oauth/callback';
      response.writeHead(valid ? 200 : 400, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end(
        valid ? 'Authorization received. You can close this window.' : 'Invalid callback.',
      );
      if (valid && url) callbackResolve?.(url);
    });
    const abort = () => {
      callbackReject?.(new Error('aborted'));
      server.close();
      reject(new Error('aborted'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    server.once('error', () => reject(new Error('server_failed')));
    server.listen(0, '127.0.0.1', () => {
      signal?.removeEventListener('abort', abort);
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('server_failed'));
        return;
      }
      listeningPort = address.port;
      resolve({
        redirectUri: `http://127.0.0.1:${address.port}/oauth/callback`,
        waitForCallback: async (waitSignal) => {
          if (!waitSignal) return callback;
          if (waitSignal.aborted) throw new Error('aborted');
          return Promise.race([
            callback,
            new Promise<URL>((_done, failed) => {
              waitSignal.addEventListener('abort', () => failed(new Error('aborted')), {
                once: true,
              });
            }),
          ]);
        },
        close: () =>
          new Promise<void>((done) => {
            if (!server.listening) done();
            else server.close(() => done());
          }),
      });
    });
  });
}

export function createRemoteMcpOAuth(
  config: RemoteMcpOAuthConfig,
  dependencies: RemoteMcpOAuthDependencies,
): RemoteMcpOAuth {
  if (!PROVIDER_PATTERN.test(config.providerId)) fail('authorization_failed');
  const serverUrl = safeUrl(config.serverUrl);
  if (!serverUrl || serverUrl.protocol !== 'https:') fail('authorization_failed');
  const timeoutMs = config.timeoutMs ?? 300000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 600000)
    fail('authorization_failed');
  const fetchFn = dependencies.fetchFn ?? fetch;
  const discover =
    dependencies.discoverEndpoints ??
    (async (input: DiscoverInput) => (await loadSdkMcpModule()).discoverOAuthEndpoints(input));
  const register =
    dependencies.registerClient ??
    (async (input: RegisterInput) => (await loadSdkMcpModule()).registerOAuthClient(input));
  const createLoopback = dependencies.createLoopbackServer ?? defaultLoopbackServer;
  const random = dependencies.randomBytes ?? ((size: number) => nodeRandomBytes(size));
  const now = dependencies.now ?? Date.now;
  const revisions = new Map<string, number>();
  const refreshes = new Map<string, Promise<string>>();

  const key = (profile: string) => credentialKey(config.providerId, profile);
  const load = async (profile: string) => {
    try {
      return parseCredential(await dependencies.credentials.get(key(profile)));
    } catch {
      fail('authorization_failed');
    }
  };
  const save = async (storageKey: string, credential: StoredCredential) => {
    try {
      await dependencies.credentials.set(storageKey, JSON.stringify(credential));
    } catch {
      fail('authorization_failed');
    }
  };
  const remove = async (profile: string) => {
    try {
      await dependencies.credentials.delete(key(profile));
    } catch {
      fail('authorization_failed');
    }
  };

  async function exchange(
    tokenEndpoint: string,
    body: URLSearchParams,
    signal: AbortSignal,
  ): Promise<{ response: Response; json: unknown }> {
    try {
      const response = await fetchFn(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal,
      });
      return { response, json: await readJson(response) };
    } catch {
      fail(signal.aborted ? 'authorization_cancelled' : 'authorization_failed');
    }
  }

  async function refreshCredential(
    profile: string,
    storageKey: string,
    revision: number,
    credential: StoredCredential & { refreshToken: string },
  ): Promise<string> {
    const tokenEndpoint = allowedEndpoint(credential.tokenEndpoint, config.isTokenEndpoint);
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credential.clientId,
      refresh_token: credential.refreshToken,
    });
    if (credential.clientSecret) body.set('client_secret', credential.clientSecret);
    if (credential.resource) body.set('resource', credential.resource);
    const controller = createAbortScope(undefined, Math.min(timeoutMs, 60000));
    try {
      const exchanged = await exchange(tokenEndpoint.href, body, controller.signal);
      if (!exchanged.response.ok) {
        const record =
          exchanged.json && typeof exchanged.json === 'object' && !Array.isArray(exchanged.json)
            ? (exchanged.json as Record<string, unknown>)
            : undefined;
        if (record?.error === 'invalid_grant' && (revisions.get(storageKey) ?? 0) === revision)
          await remove(profile);
        fail(record?.error === 'invalid_grant' ? 'not_authorized' : 'authorization_failed');
      }
      const refreshed = parseTokenResponse(exchanged.json, now());
      const next: StoredCredential = {
        ...credential,
        ...refreshed,
        refreshToken: refreshed.refreshToken ?? credential.refreshToken,
      };
      if (controller.signal.aborted || (revisions.get(storageKey) ?? 0) !== revision)
        fail('not_authorized');
      await save(storageKey, next);
      if ((revisions.get(storageKey) ?? 0) !== revision) {
        await remove(profile);
        fail('not_authorized');
      }
      return next.accessToken;
    } finally {
      controller.dispose();
    }
  }

  return {
    async authorize(profile, input) {
      const storageKey = key(profile);
      const revision = revisions.get(storageKey) ?? 0;
      const abortScope = createAbortScope(input.signal, timeoutMs);
      const authorizeFetch: typeof fetch = (request, init) =>
        fetchFn(request, { ...init, signal: abortScope.signal });
      let loopback: LoopbackCallbackServer | undefined;
      try {
        if (abortScope.signal.aborted) fail('authorization_cancelled');
        const metadataUrl = input.resourceMetadataUrl;
        if (metadataUrl) {
          const parsed = safeUrl(metadataUrl);
          const permitted = config.isResourceMetadataUrl
            ? !!parsed && config.isResourceMetadataUrl(parsed)
            : !!parsed && parsed.origin === serverUrl.origin;
          if (!permitted) fail('authorization_failed');
        }
        const discovered = await discover({
          serverUrl: config.serverUrl,
          ...(metadataUrl ? { resourceMetadataUrl: metadataUrl } : {}),
          fetchFn: authorizeFetch,
        });
        if (!discovered) fail('authorization_failed');
        if (abortScope.signal.aborted) fail('authorization_cancelled');
        const authorizationEndpoint = allowedEndpoint(
          discovered.authorizationEndpoint,
          config.isAuthorizationEndpoint,
        );
        const tokenEndpoint = allowedEndpoint(discovered.tokenEndpoint, config.isTokenEndpoint);
        if (discovered.registrationEndpoint)
          allowedEndpoint(discovered.registrationEndpoint, config.isRegistrationEndpoint);
        loopback = await createLoopback(abortScope.signal);
        if (!validLoopbackRedirect(loopback.redirectUri)) fail('authorization_failed');
        const scope = normalizeScopes(
          config.scopes ?? discovered.scopesSupported ?? discovered.resourceScopesSupported,
        );
        let clientId = config.clientId;
        let clientSecret: string | undefined;
        if (!clientId) {
          if (!discovered.registrationEndpoint) fail('authorization_failed');
          const registered = await register({
            registrationEndpoint: discovered.registrationEndpoint,
            redirectUri: loopback.redirectUri,
            clientName: config.clientName,
            ...(scope ? { scope } : {}),
            fetchFn: authorizeFetch,
          });
          if (!validSecret(registered.clientId)) fail('authorization_failed');
          if (registered.clientSecret !== undefined && !validSecret(registered.clientSecret))
            fail('authorization_failed');
          clientId = registered.clientId;
          clientSecret = registered.clientSecret;
        }
        if (!validSecret(clientId)) fail('authorization_failed');
        const verifier = base64Url(random(32));
        const state = base64Url(random(32));
        if (!validSecret(verifier) || !validSecret(state) || fixedEqual(verifier, state))
          fail('authorization_failed');
        const authorization = new URL(authorizationEndpoint);
        authorization.searchParams.set('response_type', 'code');
        authorization.searchParams.set('client_id', clientId);
        authorization.searchParams.set('redirect_uri', loopback.redirectUri);
        authorization.searchParams.set('state', state);
        authorization.searchParams.set(
          'code_challenge',
          createHash('sha256').update(verifier).digest('base64url'),
        );
        authorization.searchParams.set('code_challenge_method', 'S256');
        if (scope) authorization.searchParams.set('scope', scope);
        if (discovered.resource) {
          const resource = safeUrl(discovered.resource);
          if (!resource || resource.origin !== serverUrl.origin) fail('authorization_failed');
          authorization.searchParams.set('resource', discovered.resource);
        }
        if (!authorizationUrlIsValid(authorization.href, config.isAuthorizationEndpoint))
          fail('authorization_failed');
        await input.onAuthorizationUrl(authorization.href);
        const callback = await loopback.waitForCallback(abortScope.signal);
        if (
          callback.origin !== new URL(loopback.redirectUri).origin ||
          callback.pathname !== '/oauth/callback'
        )
          fail('authorization_failed');
        const callbackKeys = [...callback.searchParams.keys()];
        if (
          callbackKeys.length !== 2 ||
          new Set(callbackKeys).size !== 2 ||
          !callbackKeys.includes('code') ||
          !callbackKeys.includes('state')
        )
          fail('authorization_failed');
        const code = callback.searchParams.get('code');
        const returnedState = callback.searchParams.get('state');
        if (!validSecret(code) || !returnedState || !fixedEqual(state, returnedState))
          fail('authorization_failed');
        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          redirect_uri: loopback.redirectUri,
          code_verifier: verifier,
        });
        if (clientSecret) body.set('client_secret', clientSecret);
        if (discovered.resource) body.set('resource', discovered.resource);
        const exchanged = await exchange(tokenEndpoint.href, body, abortScope.signal);
        if (!exchanged.response.ok) fail('authorization_failed');
        const tokens = parseTokenResponse(exchanged.json, now());
        const credential: StoredCredential = {
          version: 1,
          clientId,
          ...(clientSecret ? { clientSecret } : {}),
          ...tokens,
          tokenEndpoint: tokenEndpoint.href,
          ...(discovered.resource ? { resource: discovered.resource } : {}),
        };
        if (abortScope.signal.aborted || (revisions.get(storageKey) ?? 0) !== revision)
          fail('authorization_cancelled');
        await save(storageKey, credential);
        if ((revisions.get(storageKey) ?? 0) !== revision) {
          await remove(profile);
          fail('authorization_cancelled');
        }
      } catch (error) {
        if (error instanceof RemoteMcpOAuthError) {
          if (abortScope.expired()) throw new RemoteMcpOAuthError('authorization_expired');
          throw error;
        }
        if (abortScope.expired()) throw new RemoteMcpOAuthError('authorization_expired');
        if (input.signal?.aborted || abortScope.signal.aborted)
          throw new RemoteMcpOAuthError('authorization_cancelled');
        throw new RemoteMcpOAuthError('authorization_failed');
      } finally {
        abortScope.dispose();
        await loopback?.close().catch(() => undefined);
      }
    },

    async accessToken(profile, signal) {
      if (signal?.aborted) fail('authorization_cancelled');
      const storageKey = key(profile);
      const active = refreshes.get(storageKey);
      if (active) return waitForRefresh(active, signal);
      const revision = revisions.get(storageKey) ?? 0;
      const credential = await load(profile);
      if (!credential) fail('not_authorized');
      if (credential.expiresAt === undefined || credential.expiresAt > now() + 30000)
        return credential.accessToken;
      if (!credential.refreshToken) {
        await remove(profile);
        fail('not_authorized');
      }
      const joined = refreshes.get(storageKey);
      if (joined) return waitForRefresh(joined, signal);
      const refresh = refreshCredential(profile, storageKey, revision, {
        ...credential,
        refreshToken: credential.refreshToken,
      });
      refreshes.set(storageKey, refresh);
      const clear = () => {
        if (refreshes.get(storageKey) === refresh) refreshes.delete(storageKey);
      };
      void refresh.then(clear, clear);
      return waitForRefresh(refresh, signal);
    },

    disconnect: async (profile) => {
      const storageKey = key(profile);
      revisions.set(storageKey, (revisions.get(storageKey) ?? 0) + 1);
      await remove(profile);
    },
    isAuthorizationUrl: (value): value is string =>
      authorizationUrlIsValid(value, config.isAuthorizationEndpoint),
  };
}
