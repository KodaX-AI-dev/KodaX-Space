import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  createRemoteMcpOAuth,
  type CredentialStore,
  type LoopbackCallbackServer,
  type RemoteMcpOAuthConfig,
  RemoteMcpOAuthError,
} from './remote-mcp-oauth.js';

const profile = 'space-2dc58f91-02b9-4439-aef1-4381273c9dd8';
const endpoints = {
  authorizationEndpoint: 'https://auth.example.com/oauth/authorize',
  tokenEndpoint: 'https://auth.example.com/oauth/token',
  registrationEndpoint: 'https://auth.example.com/oauth/register',
  resource: 'https://mcp.example.com/mcp',
};

class MemoryCredentialStore implements CredentialStore {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function encodeSha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function baseConfig(overrides: Partial<RemoteMcpOAuthConfig> = {}): RemoteMcpOAuthConfig {
  return {
    providerId: 'notion',
    serverUrl: 'https://mcp.example.com/mcp',
    clientName: 'KodaX Space',
    clientId: 'configured-public-client',
    isAuthorizationEndpoint: (url) => url.href === endpoints.authorizationEndpoint,
    isTokenEndpoint: (url) => url.href === endpoints.tokenEndpoint,
    isRegistrationEndpoint: (url) => url.href === endpoints.registrationEndpoint,
    ...overrides,
  };
}

function callbackFor(authorizationUrl: string, code: string, state?: string): URL {
  const authorization = new URL(authorizationUrl);
  const callback = new URL(authorization.searchParams.get('redirect_uri') ?? 'invalid:');
  callback.searchParams.set('code', code);
  callback.searchParams.set('state', state ?? authorization.searchParams.get('state') ?? '');
  return callback;
}

test('authorize enforces endpoint allowlists and binds a PKCE code to a random state', async () => {
  const credentials = new MemoryCredentialStore();
  const tokenRequests: URLSearchParams[] = [];
  let authorizationUrl: URL | undefined;
  let randomByte = 0;
  const callbackServer: LoopbackCallbackServer = {
    redirectUri: 'http://127.0.0.1:43125/oauth/callback',
    waitForCallback: async () => {
      assert.ok(authorizationUrl);
      return new URL(
        `http://127.0.0.1:43125/oauth/callback?code=one-time-code&state=${authorizationUrl.searchParams.get('state')}`,
      );
    },
    close: async () => {},
  };
  const oauth = createRemoteMcpOAuth(
    {
      providerId: 'notion',
      serverUrl: 'https://mcp.example.com/mcp',
      clientName: 'KodaX Space',
      scopes: ['content:read'],
      isAuthorizationEndpoint: (url) => url.href === endpoints.authorizationEndpoint,
      isTokenEndpoint: (url) => url.href === endpoints.tokenEndpoint,
      isRegistrationEndpoint: (url) => url.href === endpoints.registrationEndpoint,
    },
    {
      credentials,
      discoverEndpoints: async () => endpoints,
      registerClient: async () => ({ clientId: 'dynamic-public-client' }),
      createLoopbackServer: async () => callbackServer,
      randomBytes: (size) => new Uint8Array(size).fill(++randomByte),
      fetchFn: async (_input, init) => {
        assert.equal(init?.method, 'POST');
        const body = new URLSearchParams(String(init?.body));
        tokenRequests.push(body);
        return Response.json({
          access_token: 'access-secret',
          refresh_token: 'refresh-secret',
          expires_in: 3600,
          token_type: 'Bearer',
        });
      },
    },
  );

  await oauth.authorize(profile, {
    onAuthorizationUrl: (value) => {
      authorizationUrl = new URL(value);
      assert.equal(oauth.isAuthorizationUrl(value), true);
    },
  });

  assert.ok(authorizationUrl);
  assert.equal(authorizationUrl.origin, 'https://auth.example.com');
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorizationUrl.searchParams.get('response_type'), 'code');
  assert.equal(authorizationUrl.searchParams.get('resource'), endpoints.resource);
  assert.equal(oauth.isAuthorizationUrl('https://evil.example/oauth/authorize'), false);
  assert.equal(tokenRequests.length, 1);
  const verifier = tokenRequests[0]?.get('code_verifier');
  assert.ok(verifier);
  assert.equal(encodeSha256(verifier), authorizationUrl.searchParams.get('code_challenge'));
  assert.equal(tokenRequests[0]?.get('code'), 'one-time-code');
  assert.equal(tokenRequests[0]?.get('client_id'), 'dynamic-public-client');
  assert.equal(await oauth.accessToken(profile), 'access-secret');
});

test('authorize rejects a mismatched callback state without dispatching or leaking the code', async () => {
  const credentials = new MemoryCredentialStore();
  let authorizationUrl = '';
  let closed = false;
  const oauth = createRemoteMcpOAuth(baseConfig(), {
    credentials,
    discoverEndpoints: async () => endpoints,
    createLoopbackServer: async () => ({
      redirectUri: 'http://127.0.0.1:43126/oauth/callback',
      waitForCallback: async () =>
        new URL('http://127.0.0.1:43126/oauth/callback?code=DO_NOT_LEAK_CODE&state=wrong-state'),
      close: async () => {
        closed = true;
      },
    }),
    fetchFn: async () => {
      assert.fail('a mismatched state must stop before token exchange');
    },
  });

  await assert.rejects(
    oauth.authorize(profile, {
      onAuthorizationUrl: (value) => {
        authorizationUrl = value;
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof RemoteMcpOAuthError);
      assert.equal(error.code, 'authorization_failed');
      assert.doesNotMatch(error.message, /DO_NOT_LEAK_CODE|wrong-state/u);
      return true;
    },
  );
  assert.ok(authorizationUrl);
  assert.equal(closed, true);
  assert.equal(credentials.values.size, 0);
});

test('authorize closes the loopback server and returns a fixed cancellation error', async () => {
  const credentials = new MemoryCredentialStore();
  const controller = new AbortController();
  let closed = false;
  const oauth = createRemoteMcpOAuth(baseConfig(), {
    credentials,
    discoverEndpoints: async () => endpoints,
    createLoopbackServer: async () => ({
      redirectUri: 'http://127.0.0.1:43127/oauth/callback',
      waitForCallback: async (signal) => {
        if (signal?.aborted) throw new Error('DO_NOT_LEAK_ABORT_DETAIL');
        return new Promise<URL>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('DO_NOT_LEAK_ABORT_DETAIL')), {
            once: true,
          });
        });
      },
      close: async () => {
        closed = true;
      },
    }),
  });

  await assert.rejects(
    oauth.authorize(profile, {
      signal: controller.signal,
      onAuthorizationUrl: () => controller.abort('DO_NOT_LEAK_ABORT_REASON'),
    }),
    (error: unknown) => {
      assert.ok(error instanceof RemoteMcpOAuthError);
      assert.equal(error.code, 'authorization_cancelled');
      assert.doesNotMatch(error.message, /DO_NOT_LEAK/u);
      return true;
    },
  );
  assert.equal(closed, true);
  assert.equal(credentials.values.size, 0);
});

test('dynamic client registration receives only the loopback redirect and configured scopes', async () => {
  const credentials = new MemoryCredentialStore();
  let authorizationUrl = '';
  let registration:
    | {
        registrationEndpoint: string;
        redirectUri: string;
        clientName: string;
        scope?: string;
      }
    | undefined;
  const oauth = createRemoteMcpOAuth(
    baseConfig({ clientId: undefined, scopes: ['pages:read', 'users:read'] }),
    {
      credentials,
      discoverEndpoints: async () => endpoints,
      registerClient: async (input) => {
        registration = input;
        return { clientId: 'dcr-public-client' };
      },
      createLoopbackServer: async () => ({
        redirectUri: 'http://127.0.0.1:43128/oauth/callback',
        waitForCallback: async () => callbackFor(authorizationUrl, 'dcr-code'),
        close: async () => {},
      }),
      fetchFn: async () => Response.json({ access_token: 'dcr-access-token' }),
    },
  );
  await oauth.authorize(profile, {
    onAuthorizationUrl: (value) => {
      authorizationUrl = value;
    },
  });

  assert.ok(registration);
  assert.equal(registration.registrationEndpoint, endpoints.registrationEndpoint);
  assert.equal(registration.redirectUri, 'http://127.0.0.1:43128/oauth/callback');
  assert.equal(registration.clientName, 'KodaX Space');
  assert.equal(registration.scope, 'pages:read users:read');
  assert.equal(await oauth.accessToken(profile), 'dcr-access-token');
});

test('a DCR-issued client secret stays in the credential vault and authenticates token exchanges', async () => {
  const credentials = new MemoryCredentialStore();
  let authorizationUrl = '';
  let tokenRequest: URLSearchParams | undefined;
  const oauth = createRemoteMcpOAuth(baseConfig({ clientId: undefined }), {
    credentials,
    discoverEndpoints: async () => endpoints,
    registerClient: async () => ({
      clientId: 'dcr-confidential-client',
      clientSecret: 'DCR_SECRET_DO_NOT_LEAK',
    }),
    createLoopbackServer: async () => ({
      redirectUri: 'http://127.0.0.1:43138/oauth/callback',
      waitForCallback: async () => callbackFor(authorizationUrl, 'confidential-code'),
      close: async () => {},
    }),
    fetchFn: async (_input, init) => {
      tokenRequest = new URLSearchParams(String(init?.body));
      return Response.json({ access_token: 'confidential-access-token' });
    },
  });

  await oauth.authorize(profile, {
    onAuthorizationUrl: (value) => {
      authorizationUrl = value;
    },
  });

  assert.equal(tokenRequest?.get('client_id'), 'dcr-confidential-client');
  assert.equal(tokenRequest?.get('client_secret'), 'DCR_SECRET_DO_NOT_LEAK');
  assert.equal(await oauth.accessToken(profile), 'confidential-access-token');
  const stored = [...credentials.values.values()][0] ?? '';
  assert.match(stored, /DCR_SECRET_DO_NOT_LEAK/u);
});

test('authorize refuses discovered authorization, token, and registration endpoints outside allowlists', async () => {
  const mutations = [
    { authorizationEndpoint: 'https://evil.example/oauth/authorize' },
    { tokenEndpoint: 'https://evil.example/oauth/token' },
    { registrationEndpoint: 'https://evil.example/oauth/register' },
  ];
  for (const mutation of mutations) {
    const credentials = new MemoryCredentialStore();
    const oauth = createRemoteMcpOAuth(baseConfig(), {
      credentials,
      discoverEndpoints: async () => ({ ...endpoints, ...mutation }),
      createLoopbackServer: async () => {
        assert.fail('untrusted discovery must stop before loopback startup');
      },
      fetchFn: async () => {
        assert.fail('untrusted discovery must stop before network dispatch');
      },
    });
    await assert.rejects(oauth.authorize(profile, { onAuthorizationUrl: () => {} }), {
      code: 'authorization_failed',
    });
    assert.equal(credentials.values.size, 0);
  }
});

test('the default callback server binds a temporary 127.0.0.1 port', async () => {
  const credentials = new MemoryCredentialStore();
  const oauth = createRemoteMcpOAuth(baseConfig(), {
    credentials,
    discoverEndpoints: async () => endpoints,
    fetchFn: async () => Response.json({ access_token: 'loopback-access-token' }),
  });

  await oauth.authorize(profile, {
    onAuthorizationUrl: async (value) => {
      const callback = callbackFor(value, 'loopback-code');
      assert.equal(callback.protocol, 'http:');
      assert.equal(callback.hostname, '127.0.0.1');
      assert.match(callback.port, /^\d+$/u);
      const response = await fetch(callback);
      assert.equal(response.status, 200);
    },
  });
  assert.equal(await oauth.accessToken(profile), 'loopback-access-token');
});

test('accessToken refreshes an expired credential and persists refresh-token rotation', async () => {
  const credentials = new MemoryCredentialStore();
  const requests: URLSearchParams[] = [];
  let authorizationUrl = '';
  let now = 1_000;
  const oauth = createRemoteMcpOAuth(baseConfig(), {
    credentials,
    now: () => now,
    discoverEndpoints: async () => endpoints,
    createLoopbackServer: async () => ({
      redirectUri: 'http://127.0.0.1:43129/oauth/callback',
      waitForCallback: async () => callbackFor(authorizationUrl, 'refresh-code'),
      close: async () => {},
    }),
    fetchFn: async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      requests.push(body);
      if (body.get('grant_type') === 'authorization_code') {
        return Response.json({
          access_token: 'old-access-token',
          refresh_token: 'old-refresh-token',
          expires_in: 1,
        });
      }
      assert.equal(body.get('grant_type'), 'refresh_token');
      assert.equal(body.get('refresh_token'), 'old-refresh-token');
      return Response.json({
        access_token: 'rotated-access-token',
        refresh_token: 'rotated-refresh-token',
        expires_in: 3600,
      });
    },
  });
  await oauth.authorize(profile, {
    onAuthorizationUrl: (value) => {
      authorizationUrl = value;
    },
  });

  now = 2_001;
  assert.equal(await oauth.accessToken(profile), 'rotated-access-token');
  assert.equal(await oauth.accessToken(profile), 'rotated-access-token');
  assert.equal(requests.length, 2);
  const stored = [...credentials.values.values()][0] ?? '';
  assert.match(stored, /rotated-refresh-token/u);
  assert.doesNotMatch(stored, /old-access-token|old-refresh-token/u);
});

test('concurrent accessToken calls share refresh-token rotation without deleting the new credential', async () => {
  const credentials = new MemoryCredentialStore();
  let authorizationUrl = '';
  let now = 1_000;
  let refreshes = 0;
  let releaseRefresh: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let finishRefresh: (() => void) | undefined;
  const refreshFinished = new Promise<void>((resolve) => {
    finishRefresh = resolve;
  });
  const oauth = createRemoteMcpOAuth(baseConfig(), {
    credentials,
    now: () => now,
    discoverEndpoints: async () => endpoints,
    createLoopbackServer: async () => ({
      redirectUri: 'http://127.0.0.1:43139/oauth/callback',
      waitForCallback: async () => callbackFor(authorizationUrl, 'concurrent-refresh-code'),
      close: async () => {},
    }),
    fetchFn: async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      if (body.get('grant_type') === 'authorization_code')
        return Response.json({
          access_token: 'expired-access-token',
          refresh_token: 'single-use-refresh-token',
          expires_in: 1,
        });
      refreshes += 1;
      if (refreshes > 1) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      releaseRefresh?.();
      await refreshFinished;
      return Response.json({
        access_token: 'rotated-access-token',
        refresh_token: 'rotated-refresh-token',
        expires_in: 3600,
      });
    },
  });
  await oauth.authorize(profile, {
    onAuthorizationUrl: (value) => {
      authorizationUrl = value;
    },
  });

  now = 2_001;
  const first = oauth.accessToken(profile);
  await refreshStarted;
  const second = oauth.accessToken(profile);
  finishRefresh?.();

  assert.deepEqual(await Promise.all([first, second]), [
    'rotated-access-token',
    'rotated-access-token',
  ]);
  assert.equal(refreshes, 1);
  const stored = [...credentials.values.values()][0] ?? '';
  assert.match(stored, /rotated-refresh-token/u);
  assert.doesNotMatch(stored, /single-use-refresh-token/u);
});

test('invalid_grant deletes the profile credential and exposes no provider detail', async () => {
  const credentials = new MemoryCredentialStore();
  let authorizationUrl = '';
  let refreshes = 0;
  const oauth = createRemoteMcpOAuth(baseConfig(), {
    credentials,
    now: () => 50_000,
    discoverEndpoints: async () => endpoints,
    createLoopbackServer: async () => ({
      redirectUri: 'http://127.0.0.1:43130/oauth/callback',
      waitForCallback: async () => callbackFor(authorizationUrl, 'invalid-grant-code'),
      close: async () => {},
    }),
    fetchFn: async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      if (body.get('grant_type') === 'authorization_code')
        return Response.json({
          access_token: 'expired-access-token',
          refresh_token: 'DO_NOT_LEAK_REFRESH_TOKEN',
          expires_in: 0,
        });
      refreshes += 1;
      return Response.json(
        {
          error: 'invalid_grant',
          error_description: 'DO_NOT_LEAK_PROVIDER_DETAIL',
        },
        { status: 400 },
      );
    },
  });
  await oauth.authorize(profile, {
    onAuthorizationUrl: (value) => {
      authorizationUrl = value;
    },
  });

  await assert.rejects(oauth.accessToken(profile), (error: unknown) => {
    assert.ok(error instanceof RemoteMcpOAuthError);
    assert.equal(error.code, 'not_authorized');
    assert.doesNotMatch(error.message, /DO_NOT_LEAK|invalid_grant/u);
    return true;
  });
  assert.equal(credentials.values.size, 0);
  await assert.rejects(oauth.accessToken(profile), { code: 'not_authorized' });
  assert.equal(refreshes, 1);
});

test('credentials are isolated by profile and disconnect deletes only its selected profile', async () => {
  const credentials = new MemoryCredentialStore();
  const secondProfile = 'space-f872f56c-3851-44ec-b95a-c52e129cfba0';
  let authorizationUrl = '';
  const oauth = createRemoteMcpOAuth(baseConfig(), {
    credentials,
    discoverEndpoints: async () => endpoints,
    createLoopbackServer: async () => ({
      redirectUri: 'http://127.0.0.1:43131/oauth/callback',
      waitForCallback: async () => {
        const code = credentials.values.size === 0 ? 'profile-one' : 'profile-two';
        return callbackFor(authorizationUrl, code);
      },
      close: async () => {},
    }),
    fetchFn: async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      return Response.json({ access_token: `access-${body.get('code') ?? 'missing'}` });
    },
  });
  for (const selectedProfile of [profile, secondProfile]) {
    await oauth.authorize(selectedProfile, {
      onAuthorizationUrl: (value) => {
        authorizationUrl = value;
      },
    });
  }

  assert.equal(await oauth.accessToken(profile), 'access-profile-one');
  assert.equal(await oauth.accessToken(secondProfile), 'access-profile-two');
  assert.equal(credentials.values.size, 2);
  await oauth.disconnect(profile);
  await assert.rejects(oauth.accessToken(profile), { code: 'not_authorized' });
  assert.equal(await oauth.accessToken(secondProfile), 'access-profile-two');
  assert.equal(credentials.values.size, 1);
  await assert.rejects(oauth.disconnect('../other-profile'), { code: 'invalid_profile' });
});

test('authorize times out with a fixed error and never retains partial credentials', async () => {
  const credentials = new MemoryCredentialStore();
  let closed = false;
  const oauth = createRemoteMcpOAuth(baseConfig({ timeoutMs: 20 }), {
    credentials,
    discoverEndpoints: async () => endpoints,
    createLoopbackServer: async () => ({
      redirectUri: 'http://127.0.0.1:43132/oauth/callback',
      waitForCallback: async (signal) =>
        new Promise<URL>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('timeout detail')), {
            once: true,
          });
        }),
      close: async () => {
        closed = true;
      },
    }),
  });

  await assert.rejects(
    oauth.authorize(profile, { onAuthorizationUrl: () => {} }),
    (error: unknown) => {
      assert.ok(error instanceof RemoteMcpOAuthError);
      assert.equal(error.code, 'authorization_expired');
      assert.doesNotMatch(error.message, /timeout detail/u);
      return true;
    },
  );
  assert.equal(closed, true);
  assert.equal(credentials.values.size, 0);
});

test('authorization timeout aborts discovery network requests through the injected fetch seam', async () => {
  const credentials = new MemoryCredentialStore();
  let sawAbortSignal = false;
  const oauth = createRemoteMcpOAuth(baseConfig({ timeoutMs: 20 }), {
    credentials,
    discoverEndpoints: async ({ fetchFn }) => {
      await fetchFn?.('https://mcp.example.com/.well-known/oauth-protected-resource');
      return endpoints;
    },
    fetchFn: async (_input, init) => {
      if (!init?.signal) throw new Error('missing authorization abort signal');
      sawAbortSignal = true;
      if (init.signal.aborted) throw new Error('aborted');
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
  });

  await assert.rejects(oauth.authorize(profile, { onAuthorizationUrl: () => {} }), {
    code: 'authorization_expired',
  });
  assert.equal(sawAbortSignal, true);
  assert.equal(credentials.values.size, 0);
});

test('disconnect during token exchange prevents authorization from restoring the profile', async () => {
  const credentials = new MemoryCredentialStore();
  let authorizationUrl = '';
  let releaseExchange: (() => void) | undefined;
  const exchangeStarted = new Promise<void>((resolve) => {
    releaseExchange = resolve;
  });
  let finishExchange: (() => void) | undefined;
  const exchangeFinished = new Promise<void>((resolve) => {
    finishExchange = resolve;
  });
  const oauth = createRemoteMcpOAuth(baseConfig(), {
    credentials,
    discoverEndpoints: async () => endpoints,
    createLoopbackServer: async () => ({
      redirectUri: 'http://127.0.0.1:43133/oauth/callback',
      waitForCallback: async () => callbackFor(authorizationUrl, 'disconnect-race-code'),
      close: async () => {},
    }),
    fetchFn: async () => {
      releaseExchange?.();
      await exchangeFinished;
      return Response.json({ access_token: 'must-not-be-restored' });
    },
  });
  const authorization = oauth.authorize(profile, {
    onAuthorizationUrl: (value) => {
      authorizationUrl = value;
    },
  });
  await exchangeStarted;
  await oauth.disconnect(profile);
  finishExchange?.();

  await assert.rejects(authorization, { code: 'authorization_cancelled' });
  assert.equal(credentials.values.size, 0);
});

test('credential-store failures are mapped to fixed errors without leaking storage detail', async () => {
  const oauth = createRemoteMcpOAuth(baseConfig(), {
    credentials: {
      get: async () => {
        throw new Error('DO_NOT_LEAK_KEYCHAIN_DETAIL');
      },
      set: async () => {
        throw new Error('DO_NOT_LEAK_KEYCHAIN_DETAIL');
      },
      delete: async () => {
        throw new Error('DO_NOT_LEAK_KEYCHAIN_DETAIL');
      },
    },
  });

  for (const operation of [() => oauth.accessToken(profile), () => oauth.disconnect(profile)]) {
    await assert.rejects(operation(), (error: unknown) => {
      assert.ok(error instanceof RemoteMcpOAuthError);
      assert.equal(error.code, 'authorization_failed');
      assert.doesNotMatch(error.message, /DO_NOT_LEAK/u);
      return true;
    });
  }
});
