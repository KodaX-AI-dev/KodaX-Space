import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type {
  PartnerConnectorSnapshotT,
  PartnerFeishuBaseCreateTaskT,
  PartnerNativeDocumentTaskT,
  PartnerRemoteProposalT,
  PartnerRemoteSourceT,
} from '@kodax-space/space-ipc-schema';
import { partnerFeishuBaseCreateToolInputJsonSchema } from '@kodax-space/space-ipc-schema';
import {
  createPartnerConnectorRunRuntime,
  PARTNER_CONNECTOR_READ,
  PARTNER_CONNECTOR_PROPOSE,
  PARTNER_FEISHU_BASE_CREATE,
  PARTNER_FEISHU_DOCUMENT_CREATE,
} from './partner-connector-runtime.js';
import type { ExtensionRuntimeContract, KodaXExtensionRuntime } from '@kodax-ai/kodax/coding';

const connectionId = randomUUID();
const binding: PartnerConnectorSnapshotT = {
  extensionId: 'kodax.partner-library',
  connectorId: 'feishu',
  connectionId,
  connectionRevision: 1,
  name: 'Feishu',
  accountLabel: 'QA',
  documents: [{ url: 'https://example.feishu.cn/docx/Allowed', access: 'append' }],
};
const source: PartnerRemoteSourceT = {
  id: randomUUID(),
  sessionId: 'session-one',
  projectRoot: '/project',
  extensionId: binding.extensionId,
  connectorId: binding.connectorId,
  connectionId,
  documentId: 'Allowed',
  url: binding.documents[0]!.url,
  title: 'Document',
  revision: 1,
  content: 'Actual remote evidence',
  contentHash: 'a'.repeat(64),
  readAt: new Date().toISOString(),
};
const context = {
  sessionId: 'session-one',
  projectRoot: '/project',
  surface: 'partner' as const,
  permissionMode: 'accept-edits' as const,
  bindings: [binding],
};
const service = {
  describeBindings: async (items: readonly PartnerConnectorSnapshotT[]) => ({
    connectors: items.map((item) => ({ binding: item, available: true })),
  }),
  read: async () => source,
  propose: async (): Promise<PartnerRemoteProposalT> => {
    throw new Error('No writes expected');
  },
  createBase: async (): Promise<PartnerFeishuBaseCreateTaskT> => {
    throw new Error('No Base writes expected');
  },
};

test('the admitted Partner run exposes a direct Feishu tool without model-selected account data', async () => {
  const turnExecutionId = '615f80de-b447-4dd2-a416-28f1f6c7e2f8';
  let received:
    | { readonly turnExecutionId: string; readonly input: Record<string, unknown> }
    | undefined;
  const created: PartnerNativeDocumentTaskT = {
    id: randomUUID(),
    sessionId: context.sessionId,
    projectRoot: context.projectRoot,
    extensionId: binding.extensionId,
    connectorId: binding.connectorId,
    connectionId,
    connectionRevision: 1,
    provider: 'feishu',
    turnExecutionId,
    invocationKey: 'a'.repeat(64),
    target: { kind: 'personal-space' },
    requestedTitle: '周报',
    content: '本周进展',
    inputHash: 'b'.repeat(64),
    scopeHash: 'c'.repeat(64),
    status: 'succeeded',
    resourceId: 'NewDoc',
    title: '周报',
    canonicalUrl: 'https://example.feishu.cn/docx/NewDoc',
    revision: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    {
      ...context,
      nativeDocumentDelivery: { turnExecutionId },
      getCurrentBindings: () => [binding],
    },
    {
      ...service,
      createDocument: async (_context, receivedTurnExecutionId, input) => {
        received = { turnExecutionId: receivedTurnExecutionId, input };
        return created;
      },
    },
  );
  assert.ok(runtime);
  const tool = runtime.listRunTools!('mcp').find(
    (item) => item.name === PARTNER_FEISHU_DOCUMENT_CREATE,
  );
  assert.ok(tool);
  const proposalTool = runtime.listRunTools!('mcp').find(
    (item) => item.name === PARTNER_CONNECTOR_PROPOSE,
  );
  assert.deepEqual(
    (proposalTool?.inputSchema.properties as Record<string, { enum?: string[] }>).operation?.enum,
    ['append'],
  );
  assert.equal('connectionId' in (tool.inputSchema.properties as Record<string, unknown>), false);
  await assert.rejects(
    runtime.executeCapability('mcp', 'partner-connectors/propose', {
      connectionId,
      operation: 'create',
      title: '不应创建本地待审核稿',
      content: '正文',
    }),
  );
  const result = await runtime.executeCapability('mcp', tool.capabilityId, {
    title: '周报',
    content: '本周进展',
  });
  assert.deepEqual(received, {
    turnExecutionId,
    input: { title: '周报', content: '本周进展' },
  });
  assert.ok(typeof result.content === 'string');
  assert.equal(JSON.parse(result.content).canonicalUrl, created.canonicalUrl);
});

test('direct document creation stays hidden until trusted eligibility resolves one account', async () => {
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    {
      ...context,
      nativeDocumentDelivery: {
        turnExecutionId: '615f80de-b447-4dd2-a416-28f1f6c7e2f8',
      },
    },
    {
      ...service,
      createDocument: async () => {
        throw new Error('must remain hidden');
      },
      documentCreateEligibility: async () => ({
        status: 'unavailable',
        reason: 'missing-scope',
        recoveryAction: 'reauthorize',
        candidates: [],
      }),
    },
  );
  assert.ok(runtime);
  assert.equal(
    runtime.listRunTools!('mcp').some((tool) => tool.name === PARTNER_FEISHU_DOCUMENT_CREATE),
    false,
  );
});

test('the host capability handshake creates a turn identity without renderer or model input', async () => {
  let receivedTurnExecutionId: string | undefined;
  const runtime = await createPartnerConnectorRunRuntime(undefined, context, {
    ...service,
    nativeDocumentDeliveryEnabled: async () => true,
    documentCreateEligibility: async () => ({
      status: 'ready',
      candidate: {
        provider: 'feishu',
        connectionId,
        connectionRevision: binding.connectionRevision,
        accountLabel: binding.accountLabel,
      },
    }),
    createDocument: async (_context, turnExecutionId) => {
      receivedTurnExecutionId = turnExecutionId;
      throw new Error('dispatch sentinel');
    },
  });
  assert.ok(runtime);
  const tool = runtime.listRunTools!('mcp').find(
    (item) => item.name === PARTNER_FEISHU_DOCUMENT_CREATE,
  );
  assert.ok(tool);
  await assert.rejects(
    runtime.executeCapability('mcp', tool.capabilityId, {
      title: '周报',
      content: '本周进展',
    }),
    /dispatch sentinel/u,
  );
  assert.match(receivedTurnExecutionId ?? '', /^[0-9a-f-]{36}$/u);
});

test('direct document creation accepts only the host-scoped folder for the trusted account', async () => {
  const scopedFolder = 'https://example.feishu.cn/drive/folder/TrustedFolder';
  const scopedBinding = { ...binding, createFolderUrl: scopedFolder };
  const turnExecutionId = '615f80de-b447-4dd2-a416-28f1f6c7e2f8';
  let createCalls = 0;
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    {
      ...context,
      bindings: [scopedBinding],
      nativeDocumentDelivery: { turnExecutionId },
      getCurrentBindings: () => [scopedBinding],
    },
    {
      ...service,
      documentCreateEligibility: async () => ({
        status: 'ready',
        candidate: {
          provider: 'feishu',
          connectionId,
          connectionRevision: scopedBinding.connectionRevision,
          accountLabel: scopedBinding.accountLabel,
        },
      }),
      createDocument: async () => {
        createCalls++;
        throw new Error('dispatch sentinel');
      },
    },
  );
  assert.ok(runtime);
  await assert.rejects(
    runtime.executeCapability('mcp', 'partner-connectors/feishu-document-create', {
      folderUrl: 'https://example.feishu.cn/drive/folder/NotAuthorized',
      title: '周报',
      content: '本周进展',
    }),
    /trusted Feishu account selection/u,
  );
  assert.equal(createCalls, 0);
  await assert.rejects(
    runtime.executeCapability('mcp', 'partner-connectors/feishu-document-create', {
      folderUrl: scopedFolder,
      title: '周报',
      content: '本周进展',
    }),
    /dispatch sentinel/u,
  );
  assert.equal(createCalls, 1);
});

test('without native document delivery, review remains append-only while Base creation stays direct', async () => {
  let proposalInput: Record<string, unknown> | undefined;
  let baseInput: Record<string, unknown> | undefined;
  const now = new Date().toISOString();
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    { ...context, getCurrentBindings: () => [binding] },
    {
      ...service,
      propose: async (_context, input) => {
        proposalInput = input;
        return {
          id: randomUUID(),
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          extensionId: binding.extensionId,
          connectorId: binding.connectorId,
          connectionId,
          connectionRevision: 1,
          operation: 'append',
          targetUrl: 'https://test.feishu.cn/docx/doc123',
          title: '周报',
          content: '本周进展',
          rationale: '',
          contentHash: 'b'.repeat(64),
          scopeHash: 'c'.repeat(64),
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        };
      },
      createBase: async (_context, input) => {
        baseInput = input;
        return {
          id: randomUUID(),
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          extensionId: binding.extensionId,
          connectorId: binding.connectorId,
          connectionId,
          connectionRevision: 1,
          baseName: '项目台账',
          tableName: '任务',
          fields: [{ type: 'text', name: '事项' }],
          timeZone: 'Asia/Shanghai',
          inputHash: 'd'.repeat(64),
          scopeHash: 'e'.repeat(64),
          status: 'succeeded',
          baseToken: 'baseToken',
          tableId: 'tblTask',
          url: 'https://www.feishu.cn/base/baseToken',
          createdAt: now,
          updatedAt: now,
        };
      },
    },
  );
  assert.ok(runtime);
  assert.deepEqual(
    runtime.listRunTools!('mcp').map((tool) => tool.name),
    [PARTNER_CONNECTOR_READ, PARTNER_CONNECTOR_PROPOSE, PARTNER_FEISHU_BASE_CREATE],
  );
  const proposalTool = runtime.listRunTools!('mcp').find(
    (tool) => tool.name === PARTNER_CONNECTOR_PROPOSE,
  );
  assert.deepEqual(
    (proposalTool?.inputSchema.properties as Record<string, { enum?: string[] }>).operation?.enum,
    ['append'],
  );
  await assert.rejects(
    runtime.executeCapability('mcp', 'partner-connectors/propose', {
      connectionId,
      operation: 'create',
      title: '周报',
      content: '本周进展',
    }),
  );
  await runtime.executeCapability('mcp', 'partner-connectors/propose', {
    connectionId,
    operation: 'append',
    targetUrl: 'https://test.feishu.cn/docx/doc123',
    title: '周报',
    content: '本周进展',
  });
  assert.deepEqual(proposalInput, {
    connectionId,
    operation: 'append',
    targetUrl: 'https://test.feishu.cn/docx/doc123',
    title: '周报',
    content: '本周进展',
    rationale: '',
  });
  await runtime.executeCapability('mcp', 'partner-connectors/feishu-base-create', {
    connectionId,
    baseName: '项目台账',
    tableName: '任务',
    fields: [{ type: 'text', name: '事项' }],
  });
  assert.deepEqual(baseInput, {
    connectionId,
    baseName: '项目台账',
    tableName: '任务',
    fields: [{ type: 'text', name: '事项' }],
  });
});

test('an explicitly scoped Feishu Base folder exposes one direct typed task tool with honest side effects', async () => {
  const baseBinding: PartnerConnectorSnapshotT = {
    ...binding,
    createBaseFolderUrl: 'https://example.feishu.cn/drive/folder/BaseFolder',
  };
  let calls = 0;
  let mode: 'accept-edits' | 'plan' = 'accept-edits';
  const created: PartnerFeishuBaseCreateTaskT = {
    id: randomUUID(),
    sessionId: context.sessionId,
    projectRoot: context.projectRoot,
    extensionId: binding.extensionId,
    connectorId: binding.connectorId,
    connectionId,
    connectionRevision: 1,
    folderUrl: baseBinding.createBaseFolderUrl!,
    baseName: '项目台账',
    tableName: '任务',
    fields: [{ type: 'text', name: '事项' }],
    timeZone: 'Asia/Shanghai',
    inputHash: 'd'.repeat(64),
    scopeHash: 'e'.repeat(64),
    status: 'succeeded',
    baseToken: 'baseToken',
    tableId: 'tblTask',
    url: 'https://www.feishu.cn/base/baseToken',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    {
      ...context,
      bindings: [baseBinding],
      getCurrentBindings: () => [baseBinding],
      getCurrentPermissionMode: () => mode,
    },
    {
      ...service,
      createBase: async (_context, input) => {
        calls++;
        assert.deepEqual(input, {
          connectionId,
          folderUrl: baseBinding.createBaseFolderUrl,
          baseName: '项目台账',
          tableName: '任务',
          fields: [{ type: 'text', name: '事项' }],
        });
        return mode === 'plan'
          ? {
              ...created,
              status: 'failed',
              baseToken: undefined,
              tableId: undefined,
              url: undefined,
              error: 'Plan mode blocked this task',
            }
          : created;
      },
    },
  );
  assert.ok(runtime);
  assert.deepEqual(
    runtime.listRunTools!('mcp').map((tool) => tool.name),
    [PARTNER_CONNECTOR_READ, PARTNER_CONNECTOR_PROPOSE, PARTNER_FEISHU_BASE_CREATE],
  );
  const tool = runtime.listRunTools!('mcp').find(
    (item) => item.name === PARTNER_FEISHU_BASE_CREATE,
  )!;
  assert.match(tool.description, /删除.*默认表/);
  assert.match(tool.description, /不会自动重试/);
  assert.strictEqual(tool.inputSchema, partnerFeishuBaseCreateToolInputJsonSchema);
  assert.equal('fieldsJson' in (tool.inputSchema.properties as Record<string, unknown>), false);
  const input = {
    connectionId,
    folderUrl: baseBinding.createBaseFolderUrl,
    baseName: '项目台账',
    tableName: '任务',
    fields: [{ type: 'text', name: '事项' }],
  };
  const succeeded = await runtime.executeCapability('mcp', tool.capabilityId, input);
  assert.ok(typeof succeeded.content === 'string');
  assert.equal(JSON.parse(succeeded.content).status, 'succeeded');
  mode = 'plan';
  const failed = await runtime.executeCapability('mcp', tool.capabilityId, input);
  assert.ok(typeof failed.content === 'string');
  assert.equal(JSON.parse(failed.content).status, 'failed');
  assert.equal(calls, 2);
});

test('a live Base scope revocation is delegated so the host can persist a failed task', async () => {
  const baseBinding: PartnerConnectorSnapshotT = {
    ...binding,
    createBaseFolderUrl: 'https://example.feishu.cn/drive/folder/BaseFolder',
  };
  let currentBindings: readonly PartnerConnectorSnapshotT[] = [baseBinding];
  let calls = 0;
  const failed: PartnerFeishuBaseCreateTaskT = {
    id: randomUUID(),
    sessionId: context.sessionId,
    projectRoot: context.projectRoot,
    extensionId: binding.extensionId,
    connectorId: binding.connectorId,
    connectionId,
    connectionRevision: 1,
    folderUrl: baseBinding.createBaseFolderUrl!,
    baseName: '项目台账',
    tableName: '任务',
    fields: [{ type: 'text', name: '事项' }],
    timeZone: 'Asia/Shanghai',
    inputHash: 'd'.repeat(64),
    scopeHash: 'e'.repeat(64),
    status: 'failed',
    error: 'Scope revoked before dispatch',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    {
      ...context,
      bindings: [baseBinding],
      getCurrentBindings: () => currentBindings,
    },
    {
      ...service,
      createBase: async () => {
        calls++;
        return failed;
      },
    },
  );
  assert.ok(runtime);
  currentBindings = [];
  const result = await runtime.executeCapability('mcp', 'partner-connectors/feishu-base-create', {
    connectionId,
    folderUrl: baseBinding.createBaseFolderUrl,
    baseName: '项目台账',
    tableName: '任务',
    fields: [{ type: 'text', name: '事项' }],
  });
  assert.ok(typeof result.content === 'string');
  assert.equal(JSON.parse(result.content).status, 'failed');
  assert.equal(calls, 1);
});

test('read-only connector runs never advertise proposals and accept only their scoped resource', async () => {
  const selected: PartnerConnectorSnapshotT = {
    ...binding,
    adapter: 'tencent-meeting-cli',
    connectorId: 'tencent-meeting',
    name: '腾讯会议',
    documents: [{ url: 'tmeet://meeting-code/123456', access: 'read' }],
  };
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    { ...context, bindings: [selected] },
    service,
  );
  assert.ok(runtime);
  assert.deepEqual(
    runtime.listRunTools!('mcp').map((tool) => tool.name),
    [PARTNER_CONNECTOR_READ],
  );
  assert.doesNotMatch(runtime.listRunTools!('mcp')[0].description, /Feishu document/);
  await runtime.executeCapability('mcp', 'partner-connectors/read', {
    connectionId,
    documentUrl: 'tmeet://meeting-code/123456',
  });
  await assert.rejects(
    runtime.executeCapability('mcp', 'partner-connectors/read', {
      connectionId,
      documentUrl: 'tmeet://meeting-code/999',
    }),
  );
  await assert.rejects(runtime.executeCapability('mcp', 'partner-connectors/propose', {}));
});

test('connector tools are run-scoped, Partner-only, available-only and never registered globally', async () => {
  const sdk = await import('@kodax-ai/kodax/coding');
  const before = sdk.getAllRegisteredTools().map((tool) => tool.name);
  const runtime = await createPartnerConnectorRunRuntime(undefined, context, service);
  assert.deepEqual(
    sdk.listRunScopedTools(runtime).map((tool) => tool.name),
    [PARTNER_CONNECTOR_READ, PARTNER_CONNECTOR_PROPOSE, PARTNER_FEISHU_BASE_CREATE],
  );
  assert.equal(
    await createPartnerConnectorRunRuntime(undefined, { ...context, surface: 'code' }, service),
    undefined,
  );
  assert.equal(
    await createPartnerConnectorRunRuntime(undefined, { ...context, bindings: [] }, service),
    undefined,
  );
  const disabled = await createPartnerConnectorRunRuntime(undefined, context, {
    ...service,
    describeBindings: async () => ({
      connectors: [{ binding, available: false, unavailableReason: 'Disabled' }],
    }),
  });
  assert.deepEqual(sdk.listRunScopedTools(disabled), []);
  assert.deepEqual(
    sdk.getAllRegisteredTools().map((tool) => tool.name),
    before,
  );
});

test('read is grounded in the run scope and live revocation stops even an already admitted tool', async () => {
  let bindings: readonly PartnerConnectorSnapshotT[] = [binding];
  let calls = 0;
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    { ...context, getCurrentBindings: () => bindings },
    {
      ...service,
      read: async () => {
        calls++;
        return source;
      },
    },
  );
  assert.ok(runtime);
  const read = runtime.listRunTools!('mcp')[0]!;
  const result = await runtime.executeCapability('mcp', read.capabilityId, {
    connectionId,
    documentUrl: source.url,
  });
  assert.ok(typeof result.content === 'string');
  assert.match(result.content, /Actual remote evidence/);
  bindings = [];
  await assert.rejects(
    () =>
      runtime.executeCapability('mcp', read.capabilityId, {
        connectionId,
        documentUrl: source.url,
      }),
    /scope|selected|revoked/,
  );
  assert.equal(calls, 1);
});

test('plan hides and rejects proposal tool; no connector operation exposes raw remote write', async () => {
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    { ...context, permissionMode: 'plan' },
    service,
  );
  assert.ok(runtime);
  assert.deepEqual(
    runtime.listRunTools!('mcp').map((tool) => tool.name),
    [PARTNER_CONNECTOR_READ],
  );
  await assert.rejects(
    () => runtime.executeCapability('mcp', 'partner-connectors/propose', {}),
    /not active|not available/,
  );
  await assert.rejects(
    () => runtime.executeCapability('mcp', 'partner-connectors/apply', {}),
    /not active|not available/,
  );
});

test('failed read is not promoted to evidence and revocation while reading suppresses its result', async () => {
  let bindings: readonly PartnerConnectorSnapshotT[] = [binding];
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    { ...context, getCurrentBindings: () => bindings },
    {
      ...service,
      read: async () => {
        bindings = [];
        return source;
      },
    },
  );
  assert.ok(runtime);
  await assert.rejects(
    () =>
      runtime.executeCapability('mcp', 'partner-connectors/read', {
        connectionId,
        documentUrl: source.url,
      }),
    /scope|selected|revoked/,
  );
});

test('a proposal creates only a review record and a live switch to plan blocks later proposals', async () => {
  let mode: 'accept-edits' | 'plan' = 'accept-edits';
  let calls = 0;
  const proposal: PartnerRemoteProposalT = {
    id: randomUUID(),
    sessionId: context.sessionId,
    projectRoot: context.projectRoot,
    extensionId: binding.extensionId,
    connectorId: binding.connectorId,
    connectionId,
    connectionRevision: 1,
    operation: 'append',
    targetUrl: source.url,
    title: 'Append review',
    content: 'A proposed paragraph',
    rationale: 'Requested addition',
    contentHash: 'b'.repeat(64),
    scopeHash: 'c'.repeat(64),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    { ...context, getCurrentPermissionMode: () => mode },
    {
      ...service,
      propose: async () => {
        calls++;
        return proposal;
      },
    },
  );
  assert.ok(runtime);
  const input = {
    connectionId,
    operation: 'append',
    targetUrl: source.url,
    title: proposal.title,
    content: proposal.content,
  };
  const result = await runtime.executeCapability('mcp', 'partner-connectors/propose', input);
  assert.ok(typeof result.content === 'string');
  assert.equal(JSON.parse(result.content).status, 'pending');
  mode = 'plan';
  await assert.rejects(
    () => runtime.executeCapability('mcp', 'partner-connectors/propose', input),
    /plan/,
  );
  assert.equal(calls, 1);
});

test('the run adapter preserves existing MCP capability and lifecycle methods without taking ownership', async () => {
  const calls: string[] = [];
  const owners = [{}];
  const base: ExtensionRuntimeContract & Pick<KodaXExtensionRuntime, 'emit' | 'runHook'> = {
    async emit(event) {
      assert.equal(this, base);
      calls.push(event);
    },
    async runHook(hook) {
      assert.equal(this, base);
      calls.push(hook);
      return undefined;
    },
    getToolRegistrationOwners() {
      assert.equal(this, base);
      return owners;
    },
    pinExecutionContributions() {
      assert.equal(this, base);
      calls.push('pinned');
    },
    getDefaults: () => ({ modelSelection: { provider: 'unchanged' } }),
    hydrateSession: async (id) => {
      calls.push(id);
    },
    hasCapabilityProvider: (provider) => provider === 'existing',
    searchCapabilities: async () => ['existing-search'],
    searchCapabilitySnapshot: async () => ({
      items: ['snapshot'],
      complete: true,
      freshness: 'cached',
    }),
    describeCapability: async () => ({ description: 'existing tool' }),
    executeCapability: async () => ({ kind: 'tool', content: 'existing execute' }),
    readCapability: async () => ({ kind: 'resource', content: 'existing read' }),
    getCapabilityPrompt: async () => 'existing prompt',
    getCapabilityPromptContext: async () => 'existing context',
    listRunTools: () => [
      {
        name: 'existing_tool',
        description: '',
        capabilityId: 'existing/id',
        sideEffect: 'readonly',
        planModeAllowed: true,
        inputSchema: { type: 'object' },
      },
    ],
  };
  assert.equal(
    await createPartnerConnectorRunRuntime(base, { ...context, surface: 'code' }, service),
    base,
  );
  const runtime = await createPartnerConnectorRunRuntime(base, context, service);
  assert.ok(runtime);
  assert.deepEqual(runtime.getDefaults?.(), { modelSelection: { provider: 'unchanged' } });
  await runtime.hydrateSession?.('same-session');
  assert.deepEqual(calls, ['same-session']);
  assert.equal(runtime.getToolRegistrationOwners?.(), owners);
  runtime.pinExecutionContributions?.();
  assert.deepEqual(calls, ['same-session', 'pinned']);
  await runtime.emit?.('session:start', { provider: 'mock', sessionId: 'same-session' });
  await runtime.runHook?.('todo:before-create', { seed: { subject: 'Preserved hook' } });
  assert.deepEqual(calls, ['same-session', 'pinned', 'session:start', 'todo:before-create']);
  assert.equal(runtime.hasCapabilityProvider?.('existing'), true);
  assert.equal(runtime.hasCapabilityProvider?.('other'), false);
  assert.deepEqual(await runtime.searchCapabilities('mcp', 'query'), ['existing-search']);
  assert.deepEqual(await runtime.searchCapabilitySnapshot?.('mcp', 'query'), {
    items: ['snapshot'],
    complete: true,
    freshness: 'cached',
  });
  assert.deepEqual(await runtime.describeCapability('mcp', 'id'), { description: 'existing tool' });
  assert.equal((await runtime.executeCapability('existing', 'id', {})).content, 'existing execute');
  assert.equal((await runtime.readCapability('mcp', 'id')).content, 'existing read');
  assert.equal(await runtime.getCapabilityPrompt('mcp', 'id'), 'existing prompt');
  assert.equal(await runtime.getCapabilityPromptContext('mcp'), 'existing context');
  assert.deepEqual(
    runtime.listRunTools?.('other').map((tool) => tool.name),
    ['existing_tool'],
  );
  assert.deepEqual(
    runtime.listRunTools?.('mcp').map((tool) => tool.name),
    [
      'existing_tool',
      PARTNER_CONNECTOR_READ,
      PARTNER_CONNECTOR_PROPOSE,
      PARTNER_FEISHU_BASE_CREATE,
    ],
  );
});

test('reserved connector names cannot be shadowed by an unrelated base capability', async () => {
  const base = await createPartnerConnectorRunRuntime(undefined, context, service);
  assert.ok(base);
  base.listRunTools = () => [
    {
      name: PARTNER_CONNECTOR_READ,
      capabilityId: 'foreign/read',
      description: 'Not the host connector',
      sideEffect: 'reads-network',
      planModeAllowed: true,
      inputSchema: { type: 'object' },
    },
  ];
  const runtime = await createPartnerConnectorRunRuntime(base, context, service);
  assert.deepEqual(
    runtime
      ?.listRunTools?.('mcp')
      .filter((tool) => tool.name === PARTNER_CONNECTOR_READ)
      .map((tool) => tool.capabilityId),
    ['partner-connectors/read'],
  );
});
