import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  airtableRemoteMcpProvider,
  atlassianRemoteMcpProvider,
  createOfficialRemoteConnectorBundle,
  createVerifiedCredentialStore,
  notionRemoteMcpProvider,
  officialRemoteOAuthConfigs,
  resolveAirtableSubject,
} from './official-remote-runtime.js';
import { ReadConnectorError } from './read-connector.js';
import type { CredentialStore } from './remote-mcp-oauth.js';

class MemoryCredentials implements CredentialStore {
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

test('official remote providers pin reviewed HTTPS endpoints and read-only tools', () => {
  assert.deepEqual(
    [notionRemoteMcpProvider, airtableRemoteMcpProvider, atlassianRemoteMcpProvider].map(
      (provider) => ({
        endpoint: provider.endpoint,
        hosts: provider.allowedHosts,
        tools: Object.keys(provider.readTools),
      }),
    ),
    [
      {
        endpoint: 'https://mcp.notion.com/mcp',
        hosts: ['mcp.notion.com'],
        tools: ['notion-fetch'],
      },
      {
        endpoint: 'https://mcp.airtable.com/mcp',
        hosts: ['mcp.airtable.com'],
        tools: ['list_workspaces', 'list_records_for_table'],
      },
      {
        endpoint: 'https://mcp.atlassian.com/v2/mcp',
        hosts: ['mcp.atlassian.com'],
        tools: [
          'atlassianUserInfo',
          'getAccessibleAtlassianResources',
          'getJiraIssue',
          'getConfluenceContent',
        ],
      },
    ],
  );
});

test('OAuth contracts accept only reviewed provider endpoints and request no write scopes', () => {
  const configs = Object.values(officialRemoteOAuthConfigs);
  assert.equal(
    configs.flatMap((config) => config.scopes).some((scope) => /write|delete|manage/iu.test(scope)),
    false,
  );
  assert.equal(
    officialRemoteOAuthConfigs.notion.isAuthorizationEndpoint(
      new URL('https://mcp.notion.com/authorize'),
    ),
    true,
  );
  assert.equal(
    officialRemoteOAuthConfigs.airtable.isTokenEndpoint(
      new URL('https://airtable.com/oauth2/v1/token'),
    ),
    true,
  );
  assert.equal(
    officialRemoteOAuthConfigs.atlassian.isRegistrationEndpoint(
      new URL('https://auth.atlassian.com/VCeDsk8ZHncYF1g234fKtc4lNipbBhu3/dcr/register'),
    ),
    true,
  );
  for (const config of configs) {
    assert.equal(config.isAuthorizationEndpoint(new URL('https://evil.example/authorize')), false);
    assert.equal(config.isTokenEndpoint(new URL(`${config.serverUrl}?redirect=evil`)), false);
  }
});

test('Airtable identity comes from the fixed official whoami endpoint without exposing failures', async () => {
  let request: { url: string; authorization: string | null; redirect: RequestRedirect } | undefined;
  const subject = await resolveAirtableSubject('host-only-token', async (input, init) => {
    const headers = new Headers(init?.headers);
    request = {
      url: String(input),
      authorization: headers.get('authorization'),
      redirect: init?.redirect ?? 'follow',
    };
    return new Response(
      JSON.stringify({
        id: 'usrAirtableUser123',
        scopes: [...officialRemoteOAuthConfigs.airtable.scopes],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  assert.equal(subject, 'usrAirtableUser123');
  assert.deepEqual(request, {
    url: 'https://api.airtable.com/v0/meta/whoami',
    authorization: 'Bearer host-only-token',
    redirect: 'error',
  });
  await assert.rejects(
    resolveAirtableSubject('host-only-token', async () =>
      Promise.reject(new Error('tenant-private network body')),
    ),
    (error: unknown) => {
      assert.ok(error instanceof ReadConnectorError);
      assert.equal(error.code, 'read_failed');
      assert.doesNotMatch(error.message, /tenant-private/u);
      return true;
    },
  );
});

test('bundle registers live remote adapters and credential-backed API adapters', async () => {
  const credentials = new MemoryCredentials();
  const bundle = createOfficialRemoteConnectorBundle({
    root: '/private/kodax-space/partner-connectors',
    credentials,
  });
  assert.deepEqual(
    Object.keys(bundle).sort(),
    ['notion-mcp', 'airtable-mcp', 'atlassian-mcp', 'slack-mcp', 'zoom-mcp', 'github-api'].sort(),
  );
  assert.equal(
    bundle['notion-mcp'].acceptsResource('notion://page/0123456789abcdef0123456789abcdef'),
    true,
  );
  assert.equal(
    bundle['airtable-mcp'].acceptsResource('airtable://base/appAbCdEfGhIjKl/table/tblAbCdEfGhIjKl'),
    true,
  );
  assert.equal((await bundle['slack-mcp'].inspect('profile')).identity, undefined);
  assert.equal((await bundle['zoom-mcp'].inspect('profile')).identity, undefined);
  await credentials.set('partner-connector-oauth:slack:profile', 'legacy-slack-secret');
  await credentials.set('partner-connector-oauth:zoom:profile', 'legacy-zoom-secret');
  await bundle['slack-mcp'].disconnect?.('profile');
  await bundle['zoom-mcp'].disconnect?.('profile');
  assert.equal(await credentials.get('partner-connector-oauth:slack:profile'), undefined);
  assert.equal(await credentials.get('partner-connector-oauth:zoom:profile'), undefined);
  assert.throws(
    () =>
      createOfficialRemoteConnectorBundle({
        root: 'relative/path',
        credentials: new MemoryCredentials(),
      }),
    /absolute/u,
  );
});

test('configuration-required cleanup fails closed when a legacy credential remains readable', async () => {
  const profile = 'space-legacy-slack';
  const credentialKey = `partner-connector-oauth:slack:${profile}`;
  const persisted = new Map([[credentialKey, 'legacy-host-only-credential']]);
  let attempts = 0;
  const credentials = createVerifiedCredentialStore({
    get: async (key) => persisted.get(key),
    set: async (key, value) => {
      persisted.set(key, value);
    },
    delete: async (key) => {
      if (key === credentialKey) attempts++;
      if (key !== credentialKey || attempts > 1) persisted.delete(key);
    },
  });
  const connector = createOfficialRemoteConnectorBundle({
    root: '/private/kodax-space/partner-connectors',
    credentials,
  })['slack-mcp'];

  await assert.rejects(connector.disconnect!(profile), (error: unknown) => {
    assert.ok(error instanceof ReadConnectorError);
    assert.equal(error.code, 'authorization_failed');
    assert.doesNotMatch(error.message, /legacy-host-only/u);
    return true;
  });
  assert.equal(persisted.has(credentialKey), true);

  await connector.disconnect!(profile);
  assert.equal(attempts, 2);
  assert.equal(persisted.has(credentialKey), false);
});

test('disconnect fails closed when credential deletion is unverified and can be retried', async () => {
  const profile = 'space-delete-retry';
  const credentialKey = `partner-connector-oauth:notion:${profile}`;
  const persisted = new Map([[credentialKey, 'host-only-credential']]);
  let attempts = 0;
  const credentials = createVerifiedCredentialStore({
    get: async (key) => persisted.get(key),
    set: async (key, value) => {
      persisted.set(key, value);
    },
    delete: async (key) => {
      attempts += 1;
      if (attempts > 1) persisted.delete(key);
    },
  });
  const connector = createOfficialRemoteConnectorBundle({
    root: '/private/kodax-space/partner-connectors',
    credentials,
  })['notion-mcp'];
  assert.ok(connector.disconnect);

  await assert.rejects(connector.disconnect(profile), (error: unknown) => {
    assert.ok(error instanceof ReadConnectorError);
    assert.equal(error.code, 'authorization_failed');
    assert.doesNotMatch(error.message, /host-only/u);
    return true;
  });
  assert.equal(persisted.has(credentialKey), true);

  await connector.disconnect(profile);
  assert.equal(attempts, 2);
  assert.equal(persisted.has(credentialKey), false);
});
