import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import JSZip from 'jszip';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, afterEach, before, test } from 'node:test';
import type {
  PartnerConnectorSnapshotT,
  PartnerExpertSnapshotT,
  SpaceExtensionManifestT,
  PartnerRemoteProposalT,
  SessionEvent,
} from '@kodax-space/space-ipc-schema';
import type { PartnerConnectorRunService } from './partner-connector-runtime.js';

process.env.KODAX_TEST_ONBOARDING = `connector-sdk-${randomUUID()}`;
process.env.KODAX_SPACE_ENABLE_SDK_EXTENSIONS = '0';
const credentialEnv = 'CONNECTOR_TEST_UNUSED';
const previousCredential = process.env[credentialEnv];
process.env[credentialEnv] = 'connector-test-credential';
const { applySdkHomeEnv, getKodaxDir } = await import('./data-paths.js');
applySdkHomeEnv();
const directory = getKodaxDir();
const projectRoot = path.join(directory, 'workspace');
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(
  path.join(directory, 'config.json'),
  `${JSON.stringify(
    {
      customProviders: [
        {
          name: 'space-connector-sdk-test',
          protocol: 'openai',
          baseUrl: 'https://example.invalid/v1',
          apiKeyEnv: credentialEnv,
          model: 'test',
          reasoning: 'none',
        },
      ],
    },
    null,
    2,
  )}\n`,
);
const keychain = await import('../providers/keychain.js');
keychain._resetMemoryStoreForTesting();
const { RealKodaXSession } = await import('./real-session.js');
const { setRendererTarget } = await import('../ipc/push.js');
setRendererTarget(() => null);
const { KodaXBaseProvider, registerModelProvider } = await import('@kodax-ai/kodax/llm');
const sdk = await import('@kodax-ai/kodax/coding');
const { getSpaceExpertCatalog, getSpaceExtensionStore } =
  await import('../space-extensions/runtime.js');
const { registerSpaceBuiltinSkills } = await import('../skill/space-builtins.js');
const repositoryRoot = path.resolve(import.meta.dirname, '../../../..');
const workflowExperts: PartnerExpertSnapshotT[] = [];
const systemPrompts: string[] = [];
let workflowRun: { binding: PartnerConnectorSnapshotT; stage: number } | undefined;
const binding: PartnerConnectorSnapshotT = {
  extensionId: 'kodax.partner-library',
  connectorId: 'feishu',
  connectionId: randomUUID(),
  connectionRevision: 1,
  name: 'Feishu',
  accountLabel: 'QA',
  documents: [{ url: 'https://example.feishu.cn/docx/Allowed', access: 'append' }],
};
const toolLists: string[][] = [];
const readSessions: string[] = [];
const proposalSessions: string[] = [];
const sessions: InstanceType<typeof RealKodaXSession>[] = [];
let requestRead = false;
let requestPropose = false;
let requestTencent = false;
let requested = false;
let beforeRead: (() => void) | undefined;
class RecordingProvider extends KodaXBaseProvider {
  readonly name = 'space-connector-sdk-test';
  readonly supportsThinking = false;
  protected readonly config = {
    apiKeyEnv: 'CONNECTOR_TEST_UNUSED',
    model: 'test',
    supportsThinking: false,
  };
  override isConfigured(): boolean {
    return true;
  }
  async stream(
    ...args: Parameters<InstanceType<typeof KodaXBaseProvider>['stream']>
  ): Promise<Awaited<ReturnType<InstanceType<typeof KodaXBaseProvider>['stream']>>> {
    toolLists.push(args[1].map((tool) => tool.name));
    if (args[2].includes('KodaX Space Partner surface profile:')) systemPrompts.push(args[2]);
    if (
      workflowRun &&
      workflowRun.stage < 2 &&
      args[2].includes('KodaX Space Partner surface profile:')
    ) {
      const current = workflowRun.binding;
      const reading = workflowRun.stage++ === 0;
      const tencent = current.adapter === 'tencent-docs-mcp';
      const name = reading
        ? 'partner_connector_read'
        : tencent
          ? 'partner_connector_document_create'
          : 'partner_feishu_document_create';
      assert.ok(
        args[1].some((tool) => tool.name === name),
        `Missing tool: ${name}`,
      );
      if (!reading)
        assert.ok(
          JSON.stringify(args[0]).includes('Evidence from scoped read'),
          JSON.stringify(args[0]),
        );
      return {
        textBlocks: [],
        thinkingBlocks: [],
        toolBlocks: [
          {
            type: 'tool_use',
            id: randomUUID(),
            name,
            input: reading
              ? { connectionId: current.connectionId, documentUrl: current.documents[0].url }
              : {
                  ...(tencent ? { connectionId: current.connectionId } : {}),
                  title: 'Workflow report',
                  content: '# Report\nEvidence from scoped read',
                },
          },
        ],
        stopReason: 'tool_use',
      };
    }

    if (
      requestTencent &&
      !requested &&
      args[1].some((tool) => tool.name === 'partner_connector_document_create')
    ) {
      requested = true;
      beforeRead?.();
      return {
        textBlocks: [],
        thinkingBlocks: [],
        toolBlocks: [
          {
            type: 'tool_use',
            id: randomUUID(),
            name: 'partner_connector_document_create',
            input: {
              connectionId: binding.connectionId,
              title: 'SDK Tencent document',
              content: '# Test body',
            },
          },
        ],
        stopReason: 'tool_use',
      };
    }
    if (
      (requestRead || requestPropose) &&
      !requested &&
      args[1].some((tool) => tool.name === 'partner_connector_read')
    ) {
      requested = true;
      beforeRead?.();
      return {
        textBlocks: [],
        thinkingBlocks: [],
        toolBlocks: [
          {
            type: 'tool_use',
            id: randomUUID(),
            name: requestPropose ? 'partner_connector_propose' : 'partner_connector_read',
            input: requestPropose
              ? {
                  connectionId: binding.connectionId,
                  operation: 'append',
                  targetUrl: binding.documents[0]!.url,
                  title: 'Reviewed addition',
                  content: 'A proposed paragraph',
                }
              : { connectionId: binding.connectionId, documentUrl: binding.documents[0]!.url },
          },
        ],
        stopReason: 'tool_use',
      };
    }
    return {
      textBlocks: [{ type: 'text', text: 'Done.' }],
      toolBlocks: [],
      thinkingBlocks: [],
      stopReason: 'end_turn',
    };
  }
}
const unregister = registerModelProvider('space-connector-sdk-test', () => new RecordingProvider());
const service: PartnerConnectorRunService = {
  describeBindings: async (bindings) => ({
    connectors: bindings.map((item) => ({ binding: item, available: true })),
  }),
  read: async (context) => {
    readSessions.push(context.sessionId);
    return {
      id: randomUUID(),
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId: binding.extensionId,
      connectorId: binding.connectorId,
      connectionId: binding.connectionId,
      documentId: 'Allowed',
      url: binding.documents[0]!.url,
      title: 'Evidence',
      revision: 1,
      content: 'Evidence from scoped read',
      contentHash: 'a'.repeat(64),
      readAt: new Date().toISOString(),
    };
  },
  propose: async (context, input): Promise<PartnerRemoteProposalT> => {
    proposalSessions.push(context.sessionId);
    return {
      id: randomUUID(),
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
      extensionId: binding.extensionId,
      connectorId: binding.connectorId,
      connectionRevision: 1,
      ...input,
      contentHash: 'b'.repeat(64),
      scopeHash: 'c'.repeat(64),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },
  createBase: async () => {
    throw new Error('No Base task expected');
  },
};
before(async () => {
  await fs.mkdir(projectRoot, { recursive: true });
  await registerSpaceBuiltinSkills(path.join(repositoryRoot, 'resources/builtin-skills'));
  const manifest: SpaceExtensionManifestT = JSON.parse(
    await fs.readFile(
      path.join(repositoryRoot, 'extensions/partner-library/manifest.json'),
      'utf8',
    ),
  );
  const html = await fs.readFile(
    path.join(repositoryRoot, 'extensions/partner-library/ui/index.html'),
  );
  manifest.ui.sha256 = createHash('sha256').update(html).digest('hex');
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  zip.file('ui/index.html', html);
  const archive = path.join(directory, 'workflow.space-extension');
  await fs.writeFile(archive, await zip.generateAsync({ type: 'nodebuffer' }));
  await getSpaceExtensionStore().install(archive);
  await getSpaceExtensionStore().setEnabled(manifest.id, true);
  for (const id of ['product-management', 'deep-research']) {
    const definition = manifest.experts.find((entry) => entry.id === id)!;
    workflowExperts.push(
      await getSpaceExpertCatalog().resolve({
        extensionId: manifest.id,
        expertId: id,
        revision: definition.revision,
      }),
    );
  }
});
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.dispose()));
  await sdk.awaitLatestCodingMemoryReviewDrain(2000);
  toolLists.length = 0;
  readSessions.length = 0;
  proposalSessions.length = 0;
  requestRead = false;
  requestPropose = false;
  requestTencent = false;
  requested = false;
  beforeRead = undefined;
  workflowRun = undefined;
  systemPrompts.length = 0;
});
after(async () => {
  unregister();
  keychain._resetMemoryStoreForTesting();
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  if (previousCredential === undefined) delete process.env[credentialEnv];
  else process.env[credentialEnv] = previousCredential;
});
function makeSession(
  bindings?: readonly PartnerConnectorSnapshotT[],
  connectorService: PartnerConnectorRunService = service,
  expert?: PartnerExpertSnapshotT,
) {
  const events: SessionEvent[] = [];
  const session = new RealKodaXSession(
    {
      sessionId: `connectors-${randomUUID()}`,
      projectRoot,
      provider: 'space-connector-sdk-test',
      reasoningMode: 'off',
      permissionMode: 'accept-edits',
      agentMode: 'sa',
      surface: 'partner',
      partnerConnectors: bindings,
      partnerExpert: expert,
      emit: (event) => events.push(event),
      requestPermission: async () => 'allow_once',
    },
    { connectorService },
  );
  sessions.push(session);
  return { session, events };
}
async function waitForSession(session: InstanceType<typeof RealKodaXSession>) {
  const deadline = Date.now() + 10000;
  while (session.isRunning()) {
    if (Date.now() > deadline) throw new Error('Connector SDK run timed out');
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

test('actual SDK sees connector tools in Partner A only, not Partner B or ordinary Coder, across multiple turns', async () => {
  const a = makeSession([binding]);
  const b = makeSession();
  await a.session.send('List selected tools.');
  await waitForSession(a.session);
  assert.ok(toolLists.at(-1)?.includes('partner_connector_read'), JSON.stringify(a.events));
  assert.ok(toolLists.at(-1)?.includes('partner_connector_propose'));
  await a.session.send('Continue.');
  await waitForSession(a.session);
  assert.ok(toolLists.at(-1)?.includes('partner_connector_read'));
  await b.session.send('No connectors are selected.');
  await waitForSession(b.session);
  assert.equal(toolLists.at(-1)?.includes('partner_connector_read'), false);
  await sdk.runManagedTask(
    {
      provider: 'space-connector-sdk-test',
      agentMode: 'sa',
      maxIter: 1,
      lsp: false,
      context: {
        gitRoot: projectRoot,
        executionCwd: projectRoot,
        skillsPrompt: '',
        repoIntelligenceMode: 'off',
      },
    },
    'Ordinary Coder baseline.',
  );
  assert.equal(toolLists.at(-1)?.includes('partner_connector_read'), false);
  assert.equal(sdk.getRegisteredToolDefinition('partner_connector_read'), undefined);
});

test('actual SDK dispatches a read through the host gate and a live unbind prevents the next admitted call', async () => {
  const a = makeSession([binding]);
  requestRead = true;
  await a.session.send('Read the scoped document.');
  await waitForSession(a.session);
  assert.deepEqual(readSessions, [a.session.sessionId], JSON.stringify(a.events));
  requested = false;
  beforeRead = () => {
    a.session.partnerConnectors = [];
  };
  await a.session.send('Read again.');
  await waitForSession(a.session);
  assert.deepEqual(readSessions, [a.session.sessionId]);
  assert.ok(
    a.events.some(
      (event) => event.kind === 'tool_result' && /revoked|scope changed/.test(event.content),
    ),
  );
});

test('actual SDK creates only a proposal and plan-mode tightening blocks a previously visible proposal tool', async () => {
  const a = makeSession([binding]);
  requestPropose = true;
  await a.session.send('Propose an addition, do not submit it.');
  await waitForSession(a.session);
  assert.deepEqual(proposalSessions, [a.session.sessionId], JSON.stringify(a.events));
  assert.ok(
    a.events.some((event) => event.kind === 'tool_result' && /pending/.test(event.content)),
  );
  requested = false;
  beforeRead = () => {
    a.session.permissionMode = 'plan';
  };
  await a.session.send('Propose again.');
  await waitForSession(a.session);
  assert.deepEqual(proposalSessions, [a.session.sessionId]);
  requested = false;
  beforeRead = undefined;
  await a.session.send('In plan mode, do not create a proposal.');
  await waitForSession(a.session);
  assert.deepEqual(proposalSessions, [a.session.sessionId]);
  assert.equal(toolLists.at(-1)?.includes('partner_connector_propose'), false);
});

test('actual SDK exposes and dispatches Tencent creation only while the selected grant remains active', async () => {
  const tencent: PartnerConnectorSnapshotT = {
    ...binding,
    adapter: 'tencent-docs-mcp',
    connectorId: 'tencent-docs',
    name: 'Tencent Docs',
    documents: [],
    allowCreateDocument: true,
  };
  let creates = 0;
  const a = makeSession([tencent], {
    ...service,
    nativeDocumentDeliveryEnabled: async () => true,
    createConnectorDocument: async (context, turnExecutionId, input) => {
      creates++;
      const now = new Date().toISOString();
      return {
        id: randomUUID(),
        sessionId: context.sessionId,
        projectRoot: context.projectRoot,
        extensionId: tencent.extensionId,
        connectorId: tencent.connectorId,
        connectionId: tencent.connectionId,
        connectionRevision: tencent.connectionRevision,
        provider: 'tencent-docs',
        turnExecutionId,
        invocationKey: 'a'.repeat(64),
        target: { kind: 'personal-space' },
        requestedTitle: input.title,
        content: input.content,
        inputHash: 'b'.repeat(64),
        scopeHash: 'c'.repeat(64),
        status: 'succeeded',
        resourceId: 'SdkCreated',
        canonicalUrl: 'https://docs.qq.com/doc/SdkCreated',
        title: input.title,
        revision: 0,
        contentVerification: 'unverified',
        verificationWarning: 'API receipt only',
        createdAt: now,
        updatedAt: now,
      };
    },
  });
  requestTencent = true;
  await a.session.send('Create a new Tencent Docs Word document with the supplied content.');
  await waitForSession(a.session);
  assert.ok(
    toolLists.some((tools) => tools.includes('partner_connector_document_create')),
    JSON.stringify(a.events),
  );
  assert.equal(creates, 1, JSON.stringify(a.events));
  assert.ok(
    a.events.some(
      (event) =>
        event.kind === 'tool_result' &&
        event.content.includes('https://docs.qq.com/doc/SdkCreated'),
    ),
  );
  requested = false;
  beforeRead = () => {
    a.session.partnerConnectors = [{ ...tencent, allowCreateDocument: false }];
  };
  await a.session.send('Create another new Tencent document.');
  await waitForSession(a.session);
  assert.equal(creates, 1);
  assert.ok(
    a.events.some(
      (event) => event.kind === 'tool_result' && /revoked|scope changed/.test(event.content),
    ),
  );
  requested = false;
  beforeRead = undefined;
  await a.session.send('Check the available tools after the grant was removed.');
  await waitForSession(a.session);
  assert.equal(toolLists.at(-1)?.includes('partner_connector_document_create'), false);
  assert.equal(sdk.getRegisteredToolDefinition('partner_connector_document_create'), undefined);
});

test('both shipped expert methods read and deliver through Feishu and Tencent in real SDK runs', async () => {
  for (const expert of workflowExperts)
    for (const adapter of ['feishu-cli', 'tencent-docs-mcp'] as const) {
      const tencent = adapter === 'tencent-docs-mcp';
      const selected: PartnerConnectorSnapshotT = {
        ...binding,
        adapter,
        connectorId: tencent ? 'tencent-docs' : 'feishu-docs',
        name: tencent ? '腾讯文档' : '飞书',
        documents: [
          {
            url: tencent ? 'https://docs.qq.com/doc/Allowed' : binding.documents[0]!.url,
            access: 'read',
          },
        ],
        ...(tencent ? { allowCreateDocument: true } : {}),
      };
      const canonicalUrl = tencent
        ? 'https://docs.qq.com/doc/WorkflowCreated'
        : 'https://example.feishu.cn/docx/WorkflowCreated';
      let reads = 0;
      let creates = 0;
      const create: NonNullable<PartnerConnectorRunService['createDocument']> = async (
        context,
        turnExecutionId,
        input,
      ) => {
        creates++;
        assert.equal(reads, 1);
        assert.ok(input.content.includes('Evidence from scoped read'));
        const now = new Date().toISOString();
        return {
          id: randomUUID(),
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          extensionId: selected.extensionId,
          connectorId: selected.connectorId,
          connectionId: selected.connectionId,
          connectionRevision: 1,
          provider: tencent ? 'tencent-docs' : 'feishu',
          turnExecutionId,
          invocationKey: 'a'.repeat(64),
          target: { kind: 'personal-space' },
          requestedTitle: input.title,
          content: input.content,
          inputHash: 'b'.repeat(64),
          scopeHash: 'c'.repeat(64),
          status: 'succeeded',
          resourceId: 'WorkflowCreated',
          canonicalUrl,
          title: input.title,
          revision: 0,
          contentVerification: 'unverified',
          verificationWarning: 'Controlled transport receipt',
          createdAt: now,
          updatedAt: now,
        };
      };
      const { session, events } = makeSession(
        [selected],
        {
          ...service,
          read: async (context, input) => {
            reads++;
            assert.equal(input.documentUrl, selected.documents[0]!.url);
            return {
              ...(await service.read(context, input)),
              connectorId: selected.connectorId,
              url: input.documentUrl,
            };
          },
          nativeDocumentDeliveryEnabled: async () => true,
          createDocument: create,
          createConnectorDocument: create,
        },
        expert,
      );
      workflowRun = { binding: selected, stage: 0 };
      systemPrompts.length = 0;
      assert.equal(
        (await session.send(`读取指定资料，形成研究与需求报告，并在${selected.name}创建文档。`))
          .accepted,
        true,
      );
      await waitForSession(session);
      assert.equal(reads, 1, JSON.stringify(events));
      assert.equal(creates, 1, JSON.stringify(events));
      assert.ok(
        events.some(
          (event) => event.kind === 'tool_result' && event.content.includes(canonicalUrl),
        ),
      );
      assert.equal(
        events.some((event) => event.kind === 'session_error'),
        false,
        JSON.stringify(events),
      );
      const method =
        expert.expert.id === 'product-management'
          ? '证据 → 用户问题 → 需求 → 验收'
          : '多个转载不能算独立交叉验证';
      assert.ok(systemPrompts.length >= 3);
      assert.ok(systemPrompts.every((system) => system.includes(method)));
      assert.ok(
        systemPrompts.every((system) => system.includes(expert.expert.workflow!.qualityChecks[0]!)),
      );
      assert.equal(session.partnerExpert?.expert.id, expert.expert.id);
      await session.dispose();
    }
});
