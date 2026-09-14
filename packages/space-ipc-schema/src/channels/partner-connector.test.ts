import assert from 'node:assert/strict';
import test from 'node:test';
import { spaceExtensionManifestSchema } from './space-extension.js';
import {
  connectorInvokeChannels,
  connectorPushChannels,
  feishuBaseCreateFieldsSchema,
  feishuBaseUrlSchema,
  isPartnerConnectorResource,
  partnerConnectorConnectionSchema,
  partnerConnectorResourceKey,
  partnerConnectorSelectionSchema,
  partnerFeishuDocumentCreateInputSchema,
  partnerFeishuBaseCreateInputSchema,
  partnerFeishuBaseCreateToolInputJsonSchema,
  partnerFeishuBaseCreateTaskSchema,
  partnerNativeDocumentTaskSchema,
  partnerNativeDocumentEligibilitySchema,
  partnerRemoteRecordsSchema,
  partnerRemoteProposalInputSchema,
  partnerRemoteProposalSchema,
  spaceConnectorDefinitionSchema,
} from './partner-connector.js';

const baseFields = [
  { type: 'text', name: '事项' },
  {
    type: 'select',
    name: '状态',
    multiple: false,
    options: [{ name: '待处理' }, { name: '已完成' }],
  },
  { type: 'datetime', name: '截止日期', style: { format: 'yyyy-MM-dd' } },
  { type: 'checkbox', name: '完成' },
] as const;

test('Base creation has a typed, bounded public contract and no raw JSON escape hatch', () => {
  const input = {
    connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
    folderUrl: 'https://test.feishu.cn/drive/folder/Folder1',
    baseName: '项目台账',
    tableName: '任务',
    fields: baseFields,
  };
  assert.equal(partnerFeishuBaseCreateInputSchema.safeParse(input).success, true);
  assert.equal(
    partnerFeishuBaseCreateInputSchema.safeParse({
      connectionId: input.connectionId,
      baseName: input.baseName,
      tableName: input.tableName,
      fields: input.fields,
    }).success,
    true,
  );
  assert.equal(
    partnerFeishuBaseCreateInputSchema.safeParse({ ...input, fieldsJson: '[]' }).success,
    false,
  );
  assert.equal(
    partnerFeishuBaseCreateInputSchema.safeParse({
      ...input,
      fields: [{ type: 'formula', name: '危险字段', expression: '1+1' }],
    }).success,
    false,
  );
  assert.equal(
    feishuBaseCreateFieldsSchema.safeParse([
      { type: 'number', name: '不是主文本列' },
      { type: 'text', name: '事项' },
    ]).success,
    false,
  );
  assert.equal(
    feishuBaseCreateFieldsSchema.safeParse([
      { type: 'text', name: '事项' },
      { type: 'checkbox', name: '事项' },
    ]).success,
    false,
  );
  assert.equal(
    feishuBaseCreateFieldsSchema.safeParse([
      { type: 'text', name: '主列' },
      ...Array.from({ length: 20 }, (_, index) => ({ type: 'text', name: `字段${index}` })),
    ]).success,
    false,
  );
  assert.equal(
    partnerFeishuBaseCreateInputSchema.safeParse({
      ...input,
      fields: [
        { type: 'text', name: '主列' },
        {
          type: 'select',
          name: '超大选项',
          options: Array.from({ length: 100 }, (_, index) => ({
            name: `${index}-${'中'.repeat(90)}`,
          })),
        },
      ],
    }).success,
    false,
  );
});

test('Base tool JSON Schema publishes the shared shape and execution-only refinement guidance', () => {
  assert.deepEqual(partnerFeishuBaseCreateToolInputJsonSchema.required, [
    'connectionId',
    'baseName',
    'tableName',
    'fields',
  ]);
  assert.equal(partnerFeishuBaseCreateToolInputJsonSchema.additionalProperties, false);
  assert.equal(partnerFeishuBaseCreateToolInputJsonSchema.properties.baseName.maxLength, 100);
  assert.equal(partnerFeishuBaseCreateToolInputJsonSchema.properties.tableName.maxLength, 100);
  assert.match(partnerFeishuBaseCreateToolInputJsonSchema.properties.baseName.pattern, /u0000/);
  assert.equal(partnerFeishuBaseCreateToolInputJsonSchema.properties.fields.minItems, 1);
  assert.equal(partnerFeishuBaseCreateToolInputJsonSchema.properties.fields.maxItems, 20);
  assert.deepEqual(
    partnerFeishuBaseCreateToolInputJsonSchema.properties.fields.items.oneOf.map(
      (field) => field.properties.type.const,
    ),
    ['text', 'number', 'select', 'datetime', 'checkbox'],
  );
  assert.match(
    partnerFeishuBaseCreateToolInputJsonSchema.properties.fields.description,
    /first field.*text.*unique.*8192/iu,
  );
  assert.equal('fieldsJson' in partnerFeishuBaseCreateToolInputJsonSchema.properties, false);
});

test('Base consent and task records are explicit while legacy connections remain readable', () => {
  const legacy = partnerConnectorConnectionSchema.parse({
    id: 'b6c4724a-979d-4267-9968-8ce67653c880',
    extensionId: 'partner.library',
    connectorId: 'feishu',
    revision: 1,
    profile: 'test',
    accountLabel: 'Test',
    connected: true,
    permissions: { read: true, create: true, append: true },
  });
  assert.equal(legacy.permissions.createBase, false);

  const selection = partnerConnectorSelectionSchema.parse({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    connectionId: legacy.id,
    connectionRevision: legacy.revision,
    documents: [],
    createBaseFolderUrl: 'https://test.feishu.cn/drive/folder/Folder1',
  });
  assert.equal(selection.createBaseFolderUrl?.endsWith('/Folder1'), true);
  assert.equal(
    partnerConnectorSelectionSchema.safeParse({
      ...selection,
      adapter: 'tencent-meeting-cli',
    }).success,
    false,
  );

  const task = partnerFeishuBaseCreateTaskSchema.parse({
    id: '785fc824-c17a-48c2-a360-e515028869b5',
    sessionId: 'session1',
    projectRoot: '/test/project',
    extensionId: 'partner.library',
    connectorId: 'feishu',
    connectionId: legacy.id,
    connectionRevision: legacy.revision,
    folderUrl: selection.createBaseFolderUrl,
    baseName: '项目台账',
    tableName: '任务',
    fields: baseFields,
    timeZone: 'Asia/Shanghai',
    inputHash: 'a'.repeat(64),
    scopeHash: 'b'.repeat(64),
    status: 'succeeded',
    baseToken: 'baseToken',
    tableId: 'tblTask',
    url: 'https://www.feishu.cn/base/baseToken',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:01.000Z',
  });
  assert.equal(task.status, 'succeeded');
  assert.equal(
    partnerFeishuBaseCreateTaskSchema.safeParse({ ...task, folderUrl: undefined }).success,
    true,
  );
  assert.equal(
    partnerFeishuBaseCreateTaskSchema.safeParse({ ...task, url: undefined }).success,
    false,
  );
  assert.equal(
    partnerFeishuBaseCreateTaskSchema.safeParse({
      ...task,
      url: 'https://www.feishu.cn/base/anotherToken',
    }).success,
    false,
  );
  assert.equal(
    partnerRemoteRecordsSchema.parse({ sources: [], proposals: [], receipts: [] }).baseTasks.length,
    0,
  );
  assert.equal(feishuBaseUrlSchema.safeParse(task.url).success, true);
  assert.equal(
    feishuBaseUrlSchema.safeParse('https://www.feishu.cn.evil.test/base/baseToken').success,
    false,
  );
});

test('review proposals accept append only; new documents use the direct native task contract', () => {
  const connectionId = 'b6c4724a-979d-4267-9968-8ce67653c880';
  assert.equal(
    partnerRemoteProposalInputSchema.safeParse({
      connectionId,
      operation: 'append',
      title: '周报',
      content: '补充内容',
    }).success,
    false,
  );
  assert.equal(
    partnerRemoteProposalInputSchema.safeParse({
      connectionId,
      operation: 'append',
      targetUrl: 'https://example.feishu.cn/docx/Document1',
      title: '周报',
      content: '补充内容',
    }).success,
    true,
  );
  assert.equal(
    partnerRemoteProposalInputSchema.safeParse({
      connectionId,
      operation: 'create',
      title: '周报',
      content: '本周进展',
    }).success,
    false,
  );
  assert.equal(
    connectorInvokeChannels['partner.connectors.proposals.create'].input.safeParse({
      projectRoot: '/test/project',
      sessionId: 'session1',
      connectionId,
      operation: 'create',
      title: '周报',
      content: '本周进展',
    }).success,
    false,
  );
});

test('Base lifecycle notifications identify one host-owned task without accepting task data', () => {
  const payload = connectorPushChannels['partner.connectors.changed'].payload;
  assert.equal(
    payload.safeParse({
      sessionId: 'session1',
      projectRoot: '/test/project',
      extensionId: 'partner.library',
      baseTaskId: '785fc824-c17a-48c2-a360-e515028869b5',
    }).success,
    true,
  );
  assert.equal(
    payload.safeParse({
      sessionId: 'session1',
      projectRoot: '/test/project',
      baseTaskId: '785fc824-c17a-48c2-a360-e515028869b5',
      status: 'succeeded',
    }).success,
    false,
  );
});

test('native document delivery uses one provider-neutral task and a bounded Feishu adapter input', () => {
  const createInput = {
    folderUrl: 'https://test.feishu.cn/drive/folder/Folder1',
    title: '周报',
    content: '本周进展',
  };
  assert.deepEqual(partnerFeishuDocumentCreateInputSchema.parse(createInput), createInput);
  assert.equal(
    partnerFeishuDocumentCreateInputSchema.safeParse({
      ...createInput,
      connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
    }).success,
    false,
  );
  assert.equal(
    partnerFeishuDocumentCreateInputSchema.safeParse({ ...createInput, content: '   ' }).success,
    false,
  );

  const common = {
    id: '785fc824-c17a-48c2-a360-e515028869b5',
    sessionId: 'session1',
    projectRoot: '/test/project',
    extensionId: 'partner.library',
    connectorId: 'documents',
    connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
    connectionRevision: 1,
    turnExecutionId: '615f80de-b447-4dd2-a416-28f1f6c7e2f8',
    invocationKey: 'a'.repeat(64),
    target: { kind: 'personal-space' },
    requestedTitle: '周报',
    content: '本周进展',
    inputHash: 'b'.repeat(64),
    scopeHash: 'c'.repeat(64),
    status: 'succeeded',
    contentVerification: 'verified',
    title: '周报',
    revision: 7,
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:01.000Z',
  } as const;
  for (const [provider, resourceId, canonicalUrl] of [
    ['feishu', 'Doc123', 'https://test.feishu.cn/docx/Doc123'],
    ['dingtalk', 'Node123', 'https://alidocs.dingtalk.com/i/nodes/Node123'],
    ['tencent-docs', 'DRExample123', 'https://docs.qq.com/doc/DRExample123'],
    ['future-office', 'Future123', 'https://docs.future-office.example/document/Future123'],
  ] as const) {
    const parsed = partnerNativeDocumentTaskSchema.parse({
      ...common,
      provider,
      resourceId,
      canonicalUrl,
    });
    assert.equal(parsed.provider, provider);
    assert.equal(parsed.canonicalUrl, canonicalUrl);
  }
  for (const canonicalUrl of [
    'http://docs.future-office.example/document/Future123',
    'https://user:secret@docs.future-office.example/document/Future123',
    'file:///tmp/Future123',
  ]) {
    assert.equal(
      partnerNativeDocumentTaskSchema.safeParse({
        ...common,
        provider: 'future-office',
        resourceId: 'Future123',
        canonicalUrl,
      }).success,
      false,
    );
  }
  assert.equal(
    partnerNativeDocumentTaskSchema.safeParse({
      ...common,
      provider: 'feishu',
      resourceId: 'Doc123',
      canonicalUrl: 'https://test.feishu.cn/docx/Doc123',
      status: 'partial',
    }).success,
    false,
  );
  assert.equal(
    partnerNativeDocumentTaskSchema.safeParse({
      ...common,
      provider: 'feishu',
      resourceId: 'Doc123',
      canonicalUrl: 'https://test.feishu.cn/docx/Doc123',
      contentVerification: 'unverified',
      verificationWarning: '创建已确认，但内容尚未完成校验',
    }).success,
    true,
  );
  assert.equal(
    partnerNativeDocumentTaskSchema.safeParse({
      ...common,
      provider: 'feishu',
      resourceId: 'Doc123',
      canonicalUrl: 'https://test.feishu.cn/docx/Doc123',
      contentVerification: 'unverified',
    }).success,
    false,
  );
  assert.deepEqual(partnerRemoteRecordsSchema.parse({ sources: [], proposals: [], receipts: [] }), {
    sources: [],
    proposals: [],
    receipts: [],
    baseTasks: [],
    documentTasks: [],
    recordRevision: 0,
  });
  const changed = connectorPushChannels['partner.connectors.changed'].payload;
  assert.equal(
    changed.safeParse({
      sessionId: 'session1',
      projectRoot: '/test/project',
      documentTaskId: common.id,
      recordRevision: 8,
    }).success,
    true,
  );
  assert.equal(
    changed.safeParse({
      sessionId: 'session1',
      projectRoot: '/test/project',
      documentTaskId: common.id,
      recordRevision: 8,
      canonicalUrl: 'https://test.feishu.cn/docx/Doc123',
    }).success,
    false,
  );
});

test('native document eligibility distinguishes ready, recovery, and trusted account selection', () => {
  const candidate = {
    provider: 'feishu' as const,
    connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
    connectionRevision: 3,
    accountLabel: '工作账号',
  };
  assert.equal(
    partnerNativeDocumentEligibilitySchema.parse({
      status: 'ready',
      candidate,
    }).candidate.connectionId,
    candidate.connectionId,
  );
  assert.equal(
    partnerNativeDocumentEligibilitySchema.safeParse({
      status: 'selection-required',
      reason: 'multiple-accounts',
      recoveryAction: 'choose-account',
      candidates: [
        candidate,
        { ...candidate, connectionId: '785fc824-c17a-48c2-a360-e515028869b5' },
      ],
    }).success,
    true,
  );
  assert.equal(
    partnerNativeDocumentEligibilitySchema.safeParse({
      status: 'selection-required',
      reason: 'multiple-accounts',
      recoveryAction: 'choose-account',
      candidates: [candidate],
    }).success,
    false,
  );
  assert.equal(
    partnerNativeDocumentEligibilitySchema.safeParse({
      status: 'unavailable',
      reason: 'missing-scope',
      recoveryAction: 'reauthorize',
      candidates: [],
    }).success,
    true,
  );
});

test('read-only providers pin their adapter and cannot inherit Feishu scope or write consent', () => {
  const connectionId = 'b6c4724a-979d-4267-9968-8ce67653c880';
  for (const [adapter, url] of [
    ['wecom-cli', 'wecom://document/Doc123'],
    ['dingtalk-cli', 'dingtalk://document/Node123'],
    ['tencent-meeting-cli', 'tmeet://meeting-code/1234567890123'],
  ]) {
    assert.equal(
      spaceConnectorDefinitionSchema.safeParse({
        id: 'provider',
        adapter,
        name: 'Provider',
        description: '',
      }).success,
      true,
    );
    const selection = {
      extensionId: 'partner.library',
      connectorId: 'provider',
      connectionId,
      connectionRevision: 1,
      adapter,
      documents: [{ url, access: 'read' }],
    };
    assert.equal(partnerConnectorSelectionSchema.safeParse(selection).success, true);
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({
        ...selection,
        documents: [{ url, access: 'append' }],
      }).success,
      false,
    );
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({
        ...selection,
        createFolderUrl: 'https://test.feishu.cn/drive/folder/Folder1',
      }).success,
      false,
    );
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({ ...selection, adapter: 'feishu-cli' }).success,
      false,
    );
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({
        ...selection,
        documents: [{ url: url + '?token=secret', access: 'read' }],
      }).success,
      false,
    );
  }
});

test('official office providers use strict canonical references with adapter-owned resource keys', () => {
  const cloudId = '11111111-2222-4333-8444-555555555555';
  const fixtures = [
    [
      'notion-mcp',
      'notion://page/0123456789abcdef0123456789abcdef',
      '0123456789abcdef0123456789abcdef',
    ],
    [
      'airtable-mcp',
      'airtable://base/appAbCdEfGhIjKl/table/tblAbCdEfGhIjKl',
      'appAbCdEfGhIjKl/tblAbCdEfGhIjKl',
    ],
    ['atlassian-mcp', `atlassian://jira/${cloudId}/OPS-42`, `${cloudId}/jira/OPS-42`],
    ['atlassian-mcp', `atlassian://confluence/${cloudId}/12345`, `${cloudId}/confluence/12345`],
    ['atlassian-mcp', 'https://acme.atlassian.net/browse/OPS-42', 'acme.atlassian.net/jira/OPS-42'],
    [
      'atlassian-mcp',
      'https://acme.atlassian.net/wiki/spaces/OPS/pages/12345/Runbook',
      'acme.atlassian.net/confluence/12345',
    ],
    [
      'slack-mcp',
      'slack://channel/C0123456789/message/1725190200.123456',
      'C0123456789/1725190200.123456',
    ],
    ['zoom-mcp', 'zoom://meeting/12345678901', '12345678901'],
  ] as const;
  for (const [adapter, resource, key] of fixtures) {
    assert.equal(
      spaceConnectorDefinitionSchema.safeParse({
        id: 'provider',
        adapter,
        name: 'Provider',
        description: '',
      }).success,
      true,
    );
    assert.equal(isPartnerConnectorResource(adapter, resource), true);
    assert.equal(partnerConnectorResourceKey(adapter, resource), key);
    assert.equal(isPartnerConnectorResource(adapter, `${resource}?token=secret`), false);
    assert.equal(partnerConnectorResourceKey(adapter, `${resource}?token=secret`), undefined);
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({
        extensionId: 'partner.library',
        connectorId: 'provider',
        connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
        connectionRevision: 1,
        adapter,
        documents: [{ url: resource, access: 'read' }],
      }).success,
      true,
    );
  }
  assert.equal(isPartnerConnectorResource('notion-mcp', 'https://notion.so/anything'), false);
  assert.equal(
    isPartnerConnectorResource(
      'atlassian-mcp',
      'atlassian://jira/11111111-2222-4333-8444-555555555555/../../OPS-42',
    ),
    false,
  );
  assert.equal(
    isPartnerConnectorResource('atlassian-mcp', 'https://evil.example/browse/OPS-42'),
    false,
  );
});

test('Tencent Meeting scope uses only a canonical 6-15 digit meeting code', () => {
  for (const value of ['tmeet://meeting-code/123456', 'tmeet://meeting-code/123456789012345'])
    assert.equal(isPartnerConnectorResource('tencent-meeting-cli', value), true);
  for (const value of [
    'tmeet://meeting/123456',
    'tmeet://meeting-code/12345',
    'tmeet://meeting-code/1234567890123456',
  ])
    assert.equal(isPartnerConnectorResource('tencent-meeting-cli', value), false);
});

test('a Feishu connector declares a host adapter, never a command or credential', () => {
  const definition = {
    id: 'feishu-docs',
    adapter: 'feishu-cli',
    name: '飞书文档',
    description: '文档读取与受审追加',
  };
  assert.equal(spaceConnectorDefinitionSchema.parse(definition).adapter, 'feishu-cli');
  assert.equal(
    spaceConnectorDefinitionSchema.safeParse({ ...definition, command: 'bash' }).success,
    false,
  );
  assert.equal(
    spaceConnectorDefinitionSchema.safeParse({ ...definition, token: 'fixture-secret' }).success,
    false,
  );
});

test('the installed extension manifest admits the implemented Feishu adapter', () => {
  const manifest = {
    formatVersion: 1,
    hostApiVersion: 1,
    id: 'test.library',
    name: 'Library',
    description: '',
    version: '0.4.0',
    ui: { entry: 'ui/index.html', sha256: 'a'.repeat(64) },
    connectors: [{ id: 'feishu-docs', adapter: 'feishu-cli', name: '飞书文档', description: '' }],
  };
  assert.equal(spaceExtensionManifestSchema.parse(manifest).connectors.length, 1);
  assert.equal(
    spaceExtensionManifestSchema.safeParse({
      ...manifest,
      connectors: [...manifest.connectors, ...manifest.connectors],
    }).success,
    false,
  );
});

test('forget requires a positive account revision so stale UI cannot purge a replacement', () => {
  const input = connectorInvokeChannels['partner.connectors.forget'].input;
  const request = {
    extensionId: 'kodax.partner-library',
    connectorId: 'slack',
    connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
    connectionRevision: 3,
  };
  assert.equal(input.safeParse(request).success, true);
  assert.equal(input.safeParse({ ...request, connectionRevision: 0 }).success, false);
  const { connectionRevision: _revision, ...staleRequest } = request;
  assert.equal(input.safeParse(staleRequest).success, false);
});

test('review submission cannot replace approved content or target and uncertain outcomes remain distinct', () => {
  const input = connectorInvokeChannels['partner.connectors.proposals.apply'].input;
  const approval = {
    sessionId: 'session1',
    projectRoot: '/test/project',
    id: 'b6c4724a-979d-4267-9968-8ce67653c880',
    expectedContentHash: 'a'.repeat(64),
  };
  assert.equal(input.safeParse(approval).success, true);
  assert.equal(input.safeParse({ ...approval, content: 'changed' }).success, false);
  assert.equal(
    input.safeParse({ ...approval, targetUrl: 'https://other.feishu.cn/docx/Other' }).success,
    false,
  );
  assert.equal(partnerRemoteProposalSchema.shape.status.safeParse('unknown').success, true);
  assert.equal(partnerRemoteProposalSchema.shape.status.safeParse('partial').success, true);
});

test('session consent pins one connection revision and an explicit document allowlist', () => {
  const selection = {
    extensionId: 'kodax.partner-library',
    connectorId: 'feishu-docs',
    connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
    connectionRevision: 1,
    documents: [{ url: 'https://example.feishu.cn/docx/Doc123', access: 'read' }],
  };
  assert.equal(partnerConnectorSelectionSchema.parse(selection).documents[0]?.access, 'read');
  for (const url of [
    'file:///secret',
    'https://example.feishu.cn.evil.test/docx/Doc123',
    'https://u:p@example.feishu.cn/docx/Doc123',
    'https://example.feishu.cn/docx/../secret',
  ]) {
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({
        ...selection,
        documents: [{ url, access: 'append' }],
      }).success,
      false,
    );
  }
  assert.equal(
    partnerConnectorSelectionSchema.safeParse({
      ...selection,
      documents: [...selection.documents, ...selection.documents],
    }).success,
    false,
  );
  assert.equal(
    partnerConnectorSelectionSchema.safeParse({ ...selection, accessToken: 'fixture-secret' })
      .success,
    false,
  );
});
