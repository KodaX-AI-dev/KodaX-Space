import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PartnerConnectorService, type PartnerConnectorContext } from './service.js';
import { FeishuCli } from './feishu-cli.js';
import {
  ReadConnectorError,
  type ReadConnector,
  type ReadConnectorIdentity,
} from './read-connector.js';
import { createWecomConnector } from './wecom-cli.js';
import { createAtlassianConnector } from './official-remote-connectors.js';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'partner-read-connectors-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let identity: ReadConnectorIdentity = {
    authorityId: 'corp1',
    subjectId: 'user1',
    label: 'Account',
  };
  let reads = 0;
  let disconnects = 0;
  let disconnectFailures = 0;
  const adapter: ReadConnector = {
    id: 'wecom-cli',
    inspect: async () => ({ installed: true, version: '1.2.0', identity }),
    run: async () => undefined,
    isAuthorizationUrl: (value): value is string =>
      typeof value === 'string' && value.startsWith('https://work.weixin.qq.com/'),
    acceptsResource: (value) => /^wecom:\/\/document\/[A-Za-z0-9]+$/.test(value),
    read: async (input) => {
      await input.beforeRead();
      input.assertRead();
      reads++;
      return {
        documentId: 'Doc1',
        url: input.documentUrl,
        title: 'Document',
        revision: 0,
        content: 'Safe text',
      };
    },
    disconnect: async (selectedProfile) => {
      assert.equal(selectedProfile, owner.profile);
      disconnects++;
      if (disconnectFailures > 0) {
        disconnectFailures--;
        throw new ReadConnectorError('authorization_failed');
      }
    },
  };
  const service = new PartnerConnectorService(root, {
    cli: new FeishuCli(async () => {
      throw new Error('Must not dispatch through Feishu');
    }),
    readConnectors: { 'wecom-cli': adapter },
    catalog: async () => [{ id: 'wecom', adapter: 'wecom-cli', name: '企业微信', description: '' }],
    checkPolicy: async () => undefined,
  });
  const owner = { extensionId: 'partner.library', connectorId: 'wecom', profile: 'space-test' };
  const connection = await service.connect(owner);
  const selection = {
    extensionId: owner.extensionId,
    connectorId: owner.connectorId,
    connectionId: connection.id,
    connectionRevision: connection.revision,
    adapter: 'wecom-cli' as const,
    documents: [{ url: 'wecom://document/Doc1', access: 'read' as const }],
  };
  const bindings = await service.resolveSelections([selection]);
  const context: PartnerConnectorContext = {
    sessionId: 'session1',
    projectRoot: '/project',
    surface: 'partner',
    permissionMode: 'accept-edits',
    bindings,
  };
  return {
    service,
    connection,
    selection,
    context,
    adapter,
    reads: () => reads,
    disconnects: () => disconnects,
    failNextDisconnect: () => {
      disconnectFailures++;
    },
    switchIdentity: () => {
      identity = { ...identity, subjectId: 'user2' };
    },
  };
}

test('disconnect revokes a remote credential profile as well as the local connection', async (t) => {
  const f = await fixture(t);
  await f.service.disconnect({
    extensionId: f.connection.extensionId,
    connectorId: f.connection.connectorId,
    connectionId: f.connection.id,
  });
  assert.equal(f.disconnects(), 1);
  assert.equal(
    (await f.service.accounts(f.connection.extensionId, f.connection.connectorId))[0]?.connected,
    false,
  );
});

test('a credential deletion failure is surfaced and the disconnect remains retryable', async (t) => {
  const f = await fixture(t);
  const input = {
    extensionId: f.connection.extensionId,
    connectorId: f.connection.connectorId,
    connectionId: f.connection.id,
  };
  f.failNextDisconnect();

  await assert.rejects(f.service.disconnect(input), { code: 'authorization_failed' });
  assert.equal(f.disconnects(), 1);

  await f.service.disconnect(input);
  assert.equal(f.disconnects(), 2);
});

test('configuration-required account records can be durably forgotten while live providers cannot', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'partner-forget-connectors-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let disconnects = 0;
  let changes = 0;
  const staleAdapter: ReadConnector = {
    id: 'slack-mcp',
    inspect: async () => ({
      installed: true,
      version: 'legacy-product-app',
      identity: { authorityId: 'slack-team', subjectId: 'slack-user', label: 'Old Slack account' },
    }),
    run: async () => undefined,
    isAuthorizationUrl: (_value): _value is string => false,
    acceptsResource: () => false,
    read: async () => {
      throw new ReadConnectorError('configuration_required');
    },
    disconnect: async () => {
      disconnects++;
    },
  };
  const createService = () =>
    new PartnerConnectorService(root, {
      cli: new FeishuCli(async () => {
        throw new Error('Must not dispatch through Feishu');
      }),
      readConnectors: { 'slack-mcp': staleAdapter },
      catalog: async () => [{ id: 'slack', adapter: 'slack-mcp', name: 'Slack', description: '' }],
      checkPolicy: async () => undefined,
      changed: () => {
        changes++;
      },
    });
  const owner = { extensionId: 'partner.library', connectorId: 'slack', profile: 'legacy-slack' };
  const service = createService();
  const connection = await service.connect(owner);
  await service.disconnect({ ...owner, connectionId: connection.id });
  const reconnected = await service.connect(owner);
  assert.equal(reconnected.id, connection.id);
  assert.ok(reconnected.revision > connection.revision);

  await assert.rejects(
    service.forget({
      ...owner,
      connectionId: connection.id,
      connectionRevision: connection.revision,
    }),
    /连接记录已发生变化/u,
  );
  assert.equal((await service.accounts(owner.extensionId, owner.connectorId))[0]?.connected, true);

  const cleanupCredential = staleAdapter.disconnect;
  assert.ok(cleanupCredential);
  delete staleAdapter.disconnect;
  await assert.rejects(
    service.forget({
      ...owner,
      connectionId: reconnected.id,
      connectionRevision: reconnected.revision,
    }),
    /连接组件无法安全清理本地凭据/u,
  );
  staleAdapter.disconnect = cleanupCredential;

  let cleanupFailures = 1;
  staleAdapter.disconnect = async () => {
    disconnects++;
    if (cleanupFailures-- > 0) throw new ReadConnectorError('authorization_failed');
  };
  const changesBeforeFailure = changes;
  await assert.rejects(
    service.forget({
      ...owner,
      connectionId: reconnected.id,
      connectionRevision: reconnected.revision,
    }),
    { code: 'authorization_failed' },
  );
  assert.equal(changes, changesBeforeFailure + 1);
  const retry = (await service.accounts(owner.extensionId, owner.connectorId))[0]!;
  assert.equal(retry.connected, false);
  assert.ok(retry.revision > reconnected.revision);
  await service.forget({
    ...owner,
    connectionId: retry.id,
    connectionRevision: retry.revision,
  });

  assert.equal(disconnects, 3);
  assert.deepEqual(await service.accounts(owner.extensionId, owner.connectorId), []);
  assert.deepEqual(await createService().accounts(owner.extensionId, owner.connectorId), []);

  const live = await fixture(t);
  await assert.rejects(
    live.service.forget({
      extensionId: live.connection.extensionId,
      connectorId: live.connection.connectorId,
      connectionId: live.connection.id,
      connectionRevision: live.connection.revision,
    }),
    /仅能移除需要产品应用配置的本地账号记录/u,
  );
});

test('forget serializes a reconnect until credential cleanup and durable deletion complete', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'partner-forget-race-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let cleanupStarted!: () => void;
  let releaseCleanup!: () => void;
  const entered = new Promise<void>((resolve) => {
    cleanupStarted = resolve;
  });
  const held = new Promise<void>((resolve) => {
    releaseCleanup = resolve;
  });
  t.after(() => releaseCleanup());
  const adapter: ReadConnector = {
    id: 'slack-mcp',
    inspect: async () => ({
      installed: true,
      identity: { authorityId: 'team', subjectId: 'user', label: 'Slack account' },
    }),
    run: async () => undefined,
    isAuthorizationUrl: (_value): _value is string => false,
    acceptsResource: () => false,
    read: async () => {
      throw new ReadConnectorError('configuration_required');
    },
    disconnect: async () => {
      cleanupStarted();
      await held;
    },
  };
  const service = new PartnerConnectorService(root, {
    cli: new FeishuCli(async () => {
      throw new Error('Must not dispatch through Feishu');
    }),
    readConnectors: { 'slack-mcp': adapter },
    catalog: async () => [{ id: 'slack', adapter: 'slack-mcp', name: 'Slack', description: '' }],
    checkPolicy: async () => undefined,
  });
  const owner = { extensionId: 'partner.library', connectorId: 'slack', profile: 'legacy-slack' };
  const connection = await service.connect(owner);
  const forgetting = service.forget({
    ...owner,
    connectionId: connection.id,
    connectionRevision: connection.revision,
  });
  await entered;
  let reconnectSettled = false;
  const reconnecting = service.connect(owner).then(
    (value) => {
      reconnectSettled = true;
      return value;
    },
    (error: unknown) => {
      reconnectSettled = true;
      throw error;
    },
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(reconnectSettled, false);

  releaseCleanup();
  await forgetting;
  await assert.rejects(reconnecting, /连接期间授权状态已改变/u);
  const reconnected = await service.connect(owner);
  assert.equal(reconnected.connected, true);
  assert.notEqual(reconnected.id, connection.id);
});

test('a second provider connects independently, pins read scope and stores real read results', async (t) => {
  const f = await fixture(t);
  assert.equal(f.connection.adapter, 'wecom-cli');
  assert.deepEqual(f.connection.permissions, {
    read: true,
    create: false,
    append: false,
    createBase: false,
  });
  assert.equal('providerIdentity' in f.connection, false);
  assert.equal('subjectId' in f.connection, false);
  const source = await f.service.read(f.context, {
    connectionId: f.connection.id,
    documentUrl: 'wecom://document/Doc1',
  });
  assert.equal(source.content, 'Safe text');
  assert.equal(f.reads(), 1);
  assert.equal((await f.service.records(f.context)).sources.length, 1);
  await assert.rejects(
    f.service.read(f.context, {
      connectionId: f.connection.id,
      documentUrl: 'wecom://document/Other',
    }),
  );
  await assert.rejects(
    f.service.resolveSelections([
      {
        ...f.selection,
        adapter: 'dingtalk-cli',
        documents: [{ url: 'dingtalk://document/Doc1', access: 'read' }],
      },
    ]),
  );
  await assert.rejects(
    f.service.read(
      { ...f.context, surface: 'code' },
      { connectionId: f.connection.id, documentUrl: 'wecom://document/Doc1' },
    ),
  );
  f.switchIdentity();
  await assert.rejects(f.service.resolveSelections([f.selection]));
});

test('read-only host rejects skipped guards, cross-provider writes and revoked reads without persisting results', async (t) => {
  const f = await fixture(t);
  const read = f.adapter.read;
  await assert.rejects(
    f.service.resolveSelections([
      { ...f.selection, documents: [{ url: 'wecom://document/Unsupported_1', access: 'read' }] },
    ]),
    /资源引用/,
  );
  f.adapter.read = async (input) => ({
    documentId: 'Doc1',
    url: input.documentUrl,
    title: 'bad',
    revision: 0,
    content: 'unguarded',
  });
  await assert.rejects(
    f.service.read(f.context, {
      connectionId: f.connection.id,
      documentUrl: 'wecom://document/Doc1',
    }),
    /读取未通过/,
  );
  assert.equal((await f.service.records(f.context)).sources.length, 0);
  f.adapter.read = read;
  await assert.rejects(
    f.service.resolveSelections([
      { ...f.selection, documents: [{ url: 'wecom://document/Doc1', access: 'append' }] },
    ]),
  );
  await assert.rejects(
    f.service.propose(f.context, {
      connectionId: f.connection.id,
      operation: 'append',
      targetUrl: 'https://example.feishu.cn/docx/Doc1',
      title: 'wrong provider',
      content: 'must not write',
      rationale: '',
    }),
  );
  const bindings = [...f.context.bindings];
  f.context.getCurrentBindings = () => bindings;
  f.adapter.read = async (input) => {
    await input.beforeRead();
    bindings.length = 0;
    input.assertRead();
    throw new Error('must not reach business dispatch');
  };
  await assert.rejects(
    f.service.read(f.context, {
      connectionId: f.connection.id,
      documentUrl: 'wecom://document/Doc1',
    }),
  );
  assert.equal(f.reads(), 0);
  assert.equal((await f.service.records(f.context)).sources.length, 0);
});

test('real WeCom adapter composes with host guards and retains both approved reference forms', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'partner-wecom-compose-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const executable = path.join(root, 'fixture-native');
  await writeFile(executable, 'fixture', { mode: 0o700 });
  let businessReads = 0;
  const adapter = createWecomConnector({
    root,
    platform: 'darwin',
    arch: 'arm64',
    verifyBinary: async (file) => file === executable,
    installer: { executable, install: async () => executable },
    processFactory: () => async (input) => {
      await input.beforeSpawn?.();
      input.assertSpawn?.();
      let stdout = '';
      if (input.args[0] === '--version')
        stdout = 'wecom-cli 1.2.0 (unknown 2026-08-25T10:23:42Z 78c514b)\n';
      else if (input.args[0] === 'auth') stdout = 'Status: authorized\nBot ID: aib-test-bot\n';
      else if (input.args[0] === 'identity') stdout = '{"opaqueIdentity":{"serverOwned":true}}';
      else {
        businessReads++;
        stdout = JSON.stringify({
          url: 'https://doc.weixin.qq.com/doc/Doc1',
          name: 'Document',
          content: 'Fixture body',
          version: 1,
        });
      }
      return { exitCode: 0, stdout, stderr: '' };
    },
  });
  const service = new PartnerConnectorService(root, {
    cli: new FeishuCli(async () => {
      throw new Error('No Feishu calls');
    }),
    readConnectors: { 'wecom-cli': adapter },
    catalog: async () => [{ id: 'wecom', adapter: 'wecom-cli', name: '企业微信', description: '' }],
    checkPolicy: async () => undefined,
  });
  const owner = {
    extensionId: 'partner.library',
    connectorId: 'wecom',
    profile: 'space-11111111-1111-4111-8111-111111111111',
  };
  const connection = await service.connect(owner);
  for (const url of ['wecom://document/Doc1', 'https://doc.weixin.qq.com/doc/Doc1']) {
    const bindings = await service.resolveSelections([
      {
        extensionId: owner.extensionId,
        connectorId: owner.connectorId,
        connectionId: connection.id,
        connectionRevision: connection.revision,
        adapter: 'wecom-cli',
        documents: [{ url, access: 'read' }],
      },
    ]);
    const context: PartnerConnectorContext = {
      sessionId: 'session',
      projectRoot: '/project',
      surface: 'partner',
      permissionMode: 'accept-edits',
      bindings,
    };
    const result = await service.read(context, { connectionId: connection.id, documentUrl: url });
    assert.equal(result.url, url);
    assert.equal(result.content, 'Fixture body');
  }
  assert.equal(businessReads, 2);
});

test('host compares compound provider document ids with the shared canonical resource key', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'partner-airtable-key-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const identity = { authorityId: 'airtable', subjectId: 'subject', label: 'Airtable' };
  const resource = 'airtable://base/appAbCdEfGhIjKl/table/tblAbCdEfGhIjKl';
  const adapter: ReadConnector = {
    id: 'airtable-mcp',
    inspect: async () => ({ installed: true, identity }),
    run: async () => undefined,
    isAuthorizationUrl: (_value): _value is string => false,
    acceptsResource: (value) => value === resource,
    read: async (request) => {
      await request.beforeRead();
      request.assertRead();
      return {
        documentId: 'appAbCdEfGhIjKl/tblAbCdEfGhIjKl',
        url: request.documentUrl,
        title: 'Table',
        revision: 0,
        content: 'Rows',
      };
    },
  };
  const service = new PartnerConnectorService(root, {
    cli: new FeishuCli(async () => {
      throw new Error('No Feishu calls');
    }),
    readConnectors: { 'airtable-mcp': adapter },
    catalog: async () => [
      { id: 'airtable', adapter: 'airtable-mcp', name: 'Airtable', description: '' },
    ],
    checkPolicy: async () => undefined,
  });
  const owner = {
    extensionId: 'partner.library',
    connectorId: 'airtable',
    profile: 'space-11111111-1111-4111-8111-111111111111',
  };
  const connection = await service.connect(owner);
  const bindings = await service.resolveSelections([
    {
      extensionId: owner.extensionId,
      connectorId: owner.connectorId,
      connectionId: connection.id,
      connectionRevision: connection.revision,
      adapter: 'airtable-mcp',
      documents: [{ url: resource, access: 'read' }],
    },
  ]);
  const source = await service.read(
    {
      sessionId: 'session',
      projectRoot: '/project',
      surface: 'partner',
      permissionMode: 'accept-edits',
      bindings,
    },
    { connectionId: connection.id, documentUrl: resource },
  );
  assert.equal(source.documentId, 'appAbCdEfGhIjKl/tblAbCdEfGhIjKl');
});

test('a pasted Jira page URL resolves through the authorized site to the fixed cloudId tool call', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'partner-atlassian-url-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cloudId = '11111111-2222-4333-8444-555555555555';
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const adapter = createAtlassianConnector({
    auth: {
      authorize: async () => undefined,
      accessToken: async () => 'host-only-token',
      disconnect: async () => undefined,
      isAuthorizationUrl: (_value): _value is string => false,
    },
    client: () => ({
      executeFixed: async (tool, args, guard) => {
        await guard?.beforeDispatch?.();
        guard?.assertAllowed?.();
        calls.push({ tool, args: structuredClone(args) });
        if (tool === 'atlassianUserInfo')
          return { structuredContent: { account_id: 'user-1', name: 'Ada' } };
        if (tool === 'getAccessibleAtlassianResources')
          return {
            structuredContent: [{ id: cloudId, name: 'Acme', url: 'https://acme.atlassian.net' }],
          };
        return { structuredContent: { key: 'OPS-42', fields: { summary: 'Release blocker' } } };
      },
    }),
  });
  const service = new PartnerConnectorService(root, {
    cli: new FeishuCli(async () => {
      throw new Error('No Feishu calls');
    }),
    readConnectors: { 'atlassian-mcp': adapter },
    catalog: async () => [
      { id: 'atlassian', adapter: 'atlassian-mcp', name: 'Atlassian', description: '' },
    ],
    checkPolicy: async () => undefined,
  });
  const owner = {
    extensionId: 'partner.library',
    connectorId: 'atlassian',
    profile: 'space-11111111-1111-4111-8111-111111111111',
  };
  const connection = await service.connect(owner);
  const resource = 'https://acme.atlassian.net/browse/OPS-42';
  const bindings = await service.resolveSelections([
    {
      extensionId: owner.extensionId,
      connectorId: owner.connectorId,
      connectionId: connection.id,
      connectionRevision: connection.revision,
      adapter: 'atlassian-mcp',
      documents: [{ url: resource, access: 'read' }],
    },
  ]);
  const source = await service.read(
    {
      sessionId: 'session',
      projectRoot: '/project',
      surface: 'partner',
      permissionMode: 'accept-edits',
      bindings,
    },
    { connectionId: connection.id, documentUrl: resource },
  );
  assert.equal(source.documentId, 'acme.atlassian.net/jira/OPS-42');
  assert.deepEqual(
    [...calls].reverse().find((call) => call.tool === 'getJiraIssue'),
    { tool: 'getJiraIssue', args: { cloudId, issueIdOrKey: 'OPS-42' } },
  );
});

test('remote account listings fail closed when online OAuth identity can no longer be verified', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'partner-remote-status-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const identity = { authorityId: 'workspace', subjectId: 'user', label: 'Notion account' };
  let status: 'connected' | 'missing' | 'changed' | 'offline' = 'connected';
  const adapter: ReadConnector = {
    id: 'notion-mcp',
    inspect: async () => {
      if (status === 'offline') throw new Error('private provider outage body');
      if (status === 'missing')
        return { installed: true, version: 'remote-mcp', reason: 'not authorized' };
      return {
        installed: true,
        version: 'remote-mcp',
        identity: status === 'changed' ? { ...identity, subjectId: 'different-user' } : identity,
      };
    },
    run: async () => undefined,
    isAuthorizationUrl: (_value): _value is string => false,
    acceptsResource: () => true,
    read: async () => {
      throw new Error('unused');
    },
  };
  const service = new PartnerConnectorService(root, {
    cli: new FeishuCli(async () => {
      throw new Error('No Feishu calls');
    }),
    readConnectors: { 'notion-mcp': adapter },
    catalog: async () => [{ id: 'notion', adapter: 'notion-mcp', name: 'Notion', description: '' }],
    checkPolicy: async () => undefined,
  });
  const owner = {
    extensionId: 'partner.library',
    connectorId: 'notion',
    profile: 'space-11111111-1111-4111-8111-111111111111',
  };
  await service.connect(owner);
  assert.equal((await service.accounts(owner.extensionId, owner.connectorId))[0]?.connected, true);
  for (status of ['missing', 'changed', 'offline'] as const)
    assert.equal(
      (await service.accounts(owner.extensionId, owner.connectorId))[0]?.connected,
      false,
    );
  status = 'missing';
  assert.equal(
    (await service.inspect(owner.extensionId, owner.connectorId)).connections[0]?.connected,
    false,
  );
});
