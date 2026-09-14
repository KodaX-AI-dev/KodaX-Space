import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAirtableConnector,
  createAtlassianConnector,
  createNotionConnector,
  type RemoteMcpAuthPort,
  type RemoteMcpClientPort,
} from './official-remote-connectors.js';
import { ReadConnectorError, type ReadConnectorIdentity } from './read-connector.js';

const profile = 'space-11111111-1111-4111-8111-111111111111';

function harness<const TResult extends Record<string, unknown>>(results: TResult) {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  let authorizations = 0;
  let disconnected = 0;
  const auth: RemoteMcpAuthPort = {
    authorize: async (input) => {
      assert.equal(input.profile, profile);
      authorizations++;
    },
    accessToken: async (selectedProfile) => {
      assert.equal(selectedProfile, profile);
      return 'host-only-token';
    },
    disconnect: async (selectedProfile) => {
      assert.equal(selectedProfile, profile);
      disconnected++;
    },
    isAuthorizationUrl: (value): value is string =>
      typeof value === 'string' && value.startsWith('https://accounts.example.test/'),
  };
  const client = (
    selectedProfile: string,
    bearerToken: string,
  ): RemoteMcpClientPort<Extract<keyof TResult, string>> => ({
    executeFixed: async (tool, args, guard) => {
      assert.equal(selectedProfile, profile);
      assert.equal(bearerToken, 'host-only-token');
      calls.push({ tool, args: structuredClone(args) });
      await guard?.beforeDispatch?.();
      guard?.assertAllowed?.();
      const value = results[tool];
      if (value === undefined) throw new Error(`unexpected tool ${tool}`);
      return { structuredContent: structuredClone(value) };
    },
  });
  return {
    auth,
    client,
    calls,
    authorizations: () => authorizations,
    disconnected: () => disconnected,
  };
}

const input = (expected: ReadConnectorIdentity, documentUrl: string) => ({
  profile,
  expected,
  documentUrl,
  beforeRead: async () => undefined,
  assertRead: () => undefined,
});

test('Notion uses only official fetch for verified identity and the selected canonical page', async () => {
  const h = harness({
    'notion-fetch': {
      self: {
        workspace: { id: 'workspace-1', name: '产品团队' },
        user: { id: 'user-1', name: '小林', email: 'lin@example.test' },
      },
      title: '产品路线图',
      text: 'roadmap',
    },
  });
  const connector = createNotionConnector(h);
  const identity = { authorityId: 'workspace-1', subjectId: 'user-1', label: '小林 · 产品团队' };

  await connector.run({
    profile,
    installCli: false,
    signal: new AbortController().signal,
    onProgress: () => undefined,
  });
  assert.equal(h.authorizations(), 1);
  assert.deepEqual((await connector.inspect(profile)).identity, identity);
  const result = await connector.read(
    input(identity, 'notion://page/0123456789abcdef0123456789abcdef'),
  );
  assert.equal(result.documentId, '0123456789abcdef0123456789abcdef');
  assert.equal(result.url, 'notion://page/0123456789abcdef0123456789abcdef');
  assert.match(result.content, /roadmap/u);
  assert.deepEqual(
    [...h.calls].reverse().find((call) => call.args.id !== 'self'),
    {
      tool: 'notion-fetch',
      args: { id: '0123456789abcdef0123456789abcdef' },
    },
  );
  await connector.disconnect?.(profile);
  assert.equal(h.disconnected(), 1);
  assert.ok(h.calls.every((call) => call.tool === 'notion-fetch'));
});

test('Airtable binds the stable OAuth user and reads only one selected table page', async () => {
  const h = harness({
    list_workspaces: {
      workspaces: [
        { id: 'wspOne123456789', name: '运营' },
        { id: 'wspTwo123456789', name: '销售' },
      ],
    },
    list_records_for_table: {
      records: [{ id: 'recOne123456789', fields: { Name: 'Q3 pipeline' } }],
    },
  });
  const connector = createAirtableConnector({
    ...h,
    resolveSubject: async (bearerToken) => {
      assert.equal(bearerToken, 'host-only-token');
      return 'usrAirtableUser123';
    },
  });
  const status = await connector.inspect(profile);
  assert.ok(status.identity);
  assert.equal(status.identity.authorityId, 'airtable');
  assert.equal(status.identity.subjectId, 'usrAirtableUser123');
  assert.match(status.identity.label, /运营/u);
  const result = await connector.read(
    input(status.identity, 'airtable://base/appAbCdEfGhIjKl/table/tblAbCdEfGhIjKl'),
  );
  assert.equal(result.documentId, 'appAbCdEfGhIjKl/tblAbCdEfGhIjKl');
  assert.match(result.content, /Q3 pipeline/u);
  assert.deepEqual(
    [...h.calls].reverse().find((call) => call.tool === 'list_records_for_table'),
    {
      tool: 'list_records_for_table',
      args: {
        baseId: 'appAbCdEfGhIjKl',
        tableId: 'tblAbCdEfGhIjKl',
        pageSize: 25,
      },
    },
  );
  const otherAccount = createAirtableConnector({
    ...h,
    resolveSubject: async () => 'usrOtherUser12345',
  });
  assert.notEqual(
    (await otherAccount.inspect(profile)).identity?.subjectId,
    status.identity.subjectId,
  );
});

test('Atlassian verifies user and accessible cloud before fixed Jira or Confluence reads', async () => {
  const cloudId = '11111111-2222-4333-8444-555555555555';
  const h = harness({
    atlassianUserInfo: { account_id: 'atlassian-user-1', name: 'Ada' },
    getAccessibleAtlassianResources: [
      { id: cloudId, name: 'Acme', url: 'https://acme.atlassian.net' },
    ],
    getJiraIssue: { key: 'OPS-42', fields: { summary: 'Release blocker' } },
    getConfluenceContent: { id: '12345', title: 'Runbook', body: 'Steps' },
  });
  const connector = createAtlassianConnector(h);
  const identity = { authorityId: 'atlassian', subjectId: 'atlassian-user-1', label: 'Ada · Acme' };
  assert.deepEqual((await connector.inspect(profile)).identity, identity);

  const jira = await connector.read(input(identity, 'https://acme.atlassian.net/browse/OPS-42'));
  assert.equal(jira.documentId, 'acme.atlassian.net/jira/OPS-42');
  assert.match(jira.content, /Release blocker/u);
  assert.deepEqual(
    [...h.calls].reverse().find((call) => call.tool === 'getJiraIssue'),
    {
      tool: 'getJiraIssue',
      args: { cloudId, issueIdOrKey: 'OPS-42' },
    },
  );
  const confluence = await connector.read(
    input(identity, 'https://acme.atlassian.net/wiki/spaces/OPS/pages/12345/Runbook'),
  );
  assert.equal(confluence.documentId, 'acme.atlassian.net/confluence/12345');
  assert.match(confluence.content, /Runbook/u);
  assert.deepEqual(
    [...h.calls].reverse().find((call) => call.tool === 'getConfluenceContent'),
    {
      tool: 'getConfluenceContent',
      args: { cloudId, contentId: '12345' },
    },
  );
  await assert.rejects(
    connector.read(input(identity, 'atlassian://jira/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/OPS-42')),
    { code: 'invalid_resource' },
  );
});

test('remote transport and provider details are mapped to a fixed read error', async () => {
  const auth: RemoteMcpAuthPort = {
    authorize: async () => undefined,
    accessToken: async () => 'host-only-token',
    disconnect: async () => undefined,
    isAuthorizationUrl: (_value): _value is string => false,
  };
  const connector = createNotionConnector({
    auth,
    client: () => ({
      executeFixed: async () => {
        throw new Error('network failed for tenant-private with bearer-secret');
      },
    }),
  });
  await assert.rejects(
    connector.read(
      input(
        { authorityId: 'workspace-1', subjectId: 'user-1', label: 'User' },
        'notion://page/0123456789abcdef0123456789abcdef',
      ),
    ),
    (error: unknown) => {
      assert.ok(error instanceof ReadConnectorError);
      assert.equal(error.code, 'read_failed');
      assert.doesNotMatch(error.message, /tenant-private|bearer-secret|network failed/u);
      return true;
    },
  );
});

test('remote provider results stay bounded and identity changes fail before business dispatch', async () => {
  let currentUser = 'user-1';
  const calls: string[] = [];
  const auth: RemoteMcpAuthPort = {
    authorize: async () => undefined,
    accessToken: async () => 'secret',
    disconnect: async () => undefined,
    isAuthorizationUrl: (_value): _value is string => false,
  };
  const client = (): RemoteMcpClientPort<'notion-fetch'> => ({
    executeFixed: async (tool, args) => {
      calls.push(tool);
      if (tool === 'notion-fetch' && args.id === 'self')
        return {
          structuredContent: {
            self: {
              workspace: { id: 'workspace-1', name: 'Team' },
              user: { id: currentUser, name: 'User' },
            },
          },
        };
      throw new Error('business dispatch must not run');
    },
  });
  const connector = createNotionConnector({ auth, client });
  const expected = (await connector.inspect(profile)).identity!;
  currentUser = 'user-2';
  await assert.rejects(
    connector.read(input(expected, 'notion://page/0123456789abcdef0123456789abcdef')),
    { code: 'identity_changed' },
  );
  assert.deepEqual(calls, ['notion-fetch', 'notion-fetch']);
});
