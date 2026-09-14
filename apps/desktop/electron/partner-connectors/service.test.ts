import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PartnerConnectorService, type PartnerConnectorContext } from './service.js';
import type {
  PartnerNativeDocumentTaskSummaryT,
  PartnerRemoteProposalInputT,
} from '@kodax-space/space-ipc-schema';
import {
  FeishuCliError,
  type FeishuCli,
  type FeishuCreateBaseInput,
  type FeishuCreateInput,
} from './feishu-cli.js';

const doc = 'https://test.feishu.cn/docx/doc123';
const folder = 'https://test.feishu.cn/drive/folder/folder123';
const baseFields: FeishuCreateBaseInput['fields'] = [
  { type: 'text', name: '事项' },
  { type: 'checkbox', name: '完成' },
];
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'partner-connectors-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let enabled = true;
  let writes = 0;
  let revision = 1;
  let writesAllowed = true;
  const changes: Array<{
    sessionId?: string;
    projectRoot?: string;
    extensionId?: string;
    baseTaskId?: string;
    documentTaskId?: string;
    recordRevision?: number;
  }> = [];
  const cli: Pick<
    FeishuCli,
    'inspect' | 'listProfiles' | 'read' | 'create' | 'append' | 'createBase'
  > = {
    inspect: async (profile) => ({
      installed: true,
      version: '1.0.92',
      identity: {
        profile,
        appId: 'cli_test',
        openId: 'ou_test',
        label: 'Test user',
        scopes: [
          'docx:document:readonly',
          'docx:document:create',
          'docx:document:write_only',
          'base:app:create',
          'base:table:read',
          'base:table:create',
          'base:table:update',
          'base:table:delete',
        ],
      },
    }),
    listProfiles: async () => [{ name: 'test', label: 'Test' }],
    read: async () => ({
      documentId: 'doc123',
      url: doc,
      title: 'Test',
      revision,
      content: `text${revision}`,
    }),
    create: async (input: FeishuCreateInput) => {
      await input.beforeDispatch?.();
      input.assertDispatch?.();
      writes++;
      return {
        status: 'success',
        documentId: 'new123',
        url: 'https://test.feishu.cn/docx/new123',
        revision: 1,
      };
    },
    append: async (input) => {
      await input.beforeDispatch?.();
      input.assertDispatch?.();
      writes++;
      return { status: 'success', documentId: 'doc123', url: doc, revision: 2 };
    },
    createBase: async (input: FeishuCreateBaseInput) => {
      await input.beforeDispatch?.();
      input.assertDispatch?.();
      writes++;
      return {
        status: 'success',
        baseToken: 'baseToken',
        tableId: 'tblTask',
        url: 'https://www.feishu.cn/base/baseToken',
      };
    },
  };
  const service = new PartnerConnectorService(root, {
    cli,
    catalog: async () => {
      if (!enabled) throw new Error('disabled');
      return [{ id: 'feishu', adapter: 'feishu-cli', name: '飞书文档', description: '' }];
    },
    checkPolicy: async (_connectorId, write) => {
      if (write && !writesAllowed) throw new Error('writes blocked');
    },
    changed: (value) => changes.push(value ?? {}),
  });
  const connection = await service.connect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    profile: 'test',
  });
  const bindings = await service.resolveSelections([
    {
      extensionId: 'partner.library',
      connectorId: 'feishu',
      connectionId: connection.id,
      connectionRevision: connection.revision,
      documents: [{ url: doc, access: 'append' }],
      createFolderUrl: folder,
      createBaseFolderUrl: folder,
    },
  ]);
  const context: PartnerConnectorContext = {
    sessionId: 'session-a',
    projectRoot: '/test/project',
    surface: 'partner',
    permissionMode: 'accept-edits',
    bindings,
    getCurrentBindings: () => bindings,
  };
  return {
    root,
    service,
    context,
    connection,
    cli,
    writes: () => writes,
    changes,
    blockWrites: () => {
      writesAllowed = false;
    },
    disable: () => {
      enabled = false;
    },
    advance: () => {
      revision++;
    },
  };
}

async function waitForDocumentTask(
  service: PartnerConnectorService,
  context: PartnerConnectorContext,
  id: string,
  predicate: (task: PartnerNativeDocumentTaskSummaryT) => boolean,
): Promise<PartnerNativeDocumentTaskSummaryT> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const task = (await service.records(context)).documentTasks.find((item) => item.id === id);
    if (task && predicate(task)) return task;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`document task ${id} did not reach the expected verification state`);
}

test('a single Feishu account creates and privately verifies one native document task', async (t) => {
  const f = await fixture(t);
  let createInput: FeishuCreateInput | undefined;
  let createCalls = 0;
  let releaseRead!: () => void;
  let markReadStarted!: () => void;
  const readBarrier = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const readStarted = new Promise<void>((resolve) => {
    markReadStarted = resolve;
  });
  f.cli.create = async (input) => {
    createCalls++;
    createInput = input;
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    return {
      status: 'success',
      documentId: 'new123',
      url: 'https://test.feishu.cn/docx/new123',
      revision: 1,
    };
  };
  f.cli.read = async (input) => {
    assert.equal(input.documentUrl, 'https://test.feishu.cn/docx/new123');
    await input.beforeRead?.();
    input.assertRead?.();
    markReadStarted();
    await readBarrier;
    return {
      documentId: 'new123',
      url: input.documentUrl,
      title: 'TraceOps 项目备忘（示例文档）',
      revision: 2,
      content:
        '<title>TraceOps 项目备忘（示例文档）</title>\n\n# TraceOps 项目备忘\n\n## 待办\n\n- [ ] item 1\n- [ ] item 2',
    };
  };

  const before = f.changes.length;
  const createPromise = f.service.createDocument(
    f.context,
    '615f80de-b447-4dd2-a416-28f1f6c7e2f8',
    {
      title: 'TraceOps 项目备忘（示例文档）',
      content: '# TraceOps 项目备忘\n\n## 待办\n- [ ] item 1\n- [ ] item 2',
    },
  );
  await readStarted;
  let receiptDeadline: ReturnType<typeof setTimeout> | undefined;
  const task = await Promise.race([
    createPromise,
    new Promise<null>((resolve) => {
      receiptDeadline = setTimeout(() => resolve(null), 1_000);
    }),
  ]);
  if (receiptDeadline) clearTimeout(receiptDeadline);
  if (!task) {
    releaseRead();
    await createPromise;
    assert.fail('可信创建回执被内容回读阻塞');
  }
  assert.equal(createInput?.folderUrl, undefined);
  assert.equal(createInput?.title, 'TraceOps 项目备忘（示例文档）');
  assert.equal(createInput?.text, '# TraceOps 项目备忘\n\n## 待办\n- [ ] item 1\n- [ ] item 2');
  assert.equal(task.status, 'succeeded');
  assert.equal(task.provider, 'feishu');
  assert.equal(task.resourceId, 'new123');
  assert.equal(task.title, 'TraceOps 项目备忘（示例文档）');
  assert.equal(task.canonicalUrl, 'https://test.feishu.cn/docx/new123');
  assert.equal(task.revision, 1);
  assert.equal(task.contentVerification, 'unverified');
  assert.match(task.verificationWarning ?? '', /尚未完成/u);
  assert.deepEqual(task.target, { kind: 'personal-space' });
  assert.equal(createCalls, 1);

  const persistedReceipt = await f.service.records(f.context);
  assert.equal(persistedReceipt.documentTasks[0]?.id, task.id);
  assert.equal(persistedReceipt.documentTasks[0]?.canonicalUrl, task.canonicalUrl);
  assert.equal(persistedReceipt.documentTasks[0]?.contentVerification, 'unverified');

  releaseRead();
  const verified = await waitForDocumentTask(
    f.service,
    f.context,
    task.id,
    (candidate) => candidate.contentVerification === 'verified',
  );
  assert.equal(verified.revision, 2);
  assert.equal(verified.verificationWarning, undefined);
  assert.equal('content' in verified, false);
  assert.equal('invocationKey' in verified, false);
  assert.deepEqual(persistedReceipt.proposals, []);
  assert.deepEqual(persistedReceipt.receipts, []);
  assert.deepEqual(persistedReceipt.sources, []);
  const changes = f.changes.slice(before);
  assert.equal(changes.length, 4);
  assert.ok(changes.every((change) => change.documentTaskId === task.id));
  assert.ok(changes.every((change) => Number.isInteger(change.recordRevision)));
});

test('provider Markdown normalization verifies semantically and preserves the created resource', async (t) => {
  const f = await fixture(t);
  f.cli.create = async (input) => {
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    return {
      status: 'success',
      documentId: 'normalized123',
      url: 'https://test.feishu.cn/docx/normalized123',
      revision: 4,
    };
  };
  f.cli.read = async (input) => ({
    documentId: 'normalized123',
    url: input.documentUrl,
    title: '项目预算',
    revision: 5,
    content: '<title>项目预算</title>\n\n| 项目 | 预算 |\n| - | - |\n| 免费额度 | \\$0 |',
  });

  const task = await f.service.createDocument(f.context, '715f80de-b447-4dd2-a416-28f1f6c7e2f8', {
    title: '项目预算',
    content: '| 项目 | 预算 |\n| --- | --- |\n| 免费额度 | $0 |',
  });

  assert.equal(task.status, 'succeeded');
  assert.equal(task.contentVerification, 'unverified');
  assert.equal(task.canonicalUrl, 'https://test.feishu.cn/docx/normalized123');
  assert.equal(task.revision, 4);
  const verified = await waitForDocumentTask(
    f.service,
    f.context,
    task.id,
    (candidate) => candidate.contentVerification === 'verified',
  );
  assert.equal(verified.verificationWarning, undefined);
  assert.equal(verified.revision, 5);
});

test('a trusted create receipt remains an addressable success when content verification warns', async (t) => {
  const f = await fixture(t);
  f.cli.create = async (input) => {
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    return {
      status: 'partial',
      documentId: 'warning123',
      url: 'https://test.feishu.cn/docx/warning123',
      revision: 7,
    };
  };
  f.cli.read = async (input) => ({
    documentId: 'warning123',
    url: input.documentUrl,
    title: '项目预算',
    revision: 8,
    content: '<title>项目预算</title>\n\n| 项目 | 预算 |\n| - | - |\n| 免费额度 | $100 |',
  });

  const task = await f.service.createDocument(f.context, '815f80de-b447-4dd2-a416-28f1f6c7e2f8', {
    title: '项目预算',
    content: '| 项目 | 预算 |\n| --- | --- |\n| 免费额度 | $0 |',
  });

  assert.equal(task.status, 'succeeded');
  assert.equal(task.contentVerification, 'unverified');
  assert.match(task.verificationWarning ?? '', /内容/);
  assert.equal(task.resourceId, 'warning123');
  assert.equal(task.canonicalUrl, 'https://test.feishu.cn/docx/warning123');
  assert.equal(task.revision, 7);
  const warned = await waitForDocumentTask(f.service, f.context, task.id, (candidate) =>
    /未完全确认/u.test(candidate.verificationWarning ?? ''),
  );
  assert.equal(warned.contentVerification, 'unverified');
  assert.equal(warned.revision, 7);
});

test('content verification preserves semantic blank lines inside fenced code', async (t) => {
  const f = await fixture(t);
  f.cli.create = async (input) => {
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    return {
      status: 'success',
      documentId: 'code123',
      url: 'https://test.feishu.cn/docx/code123',
      revision: 3,
    };
  };
  f.cli.read = async (input) => ({
    documentId: 'code123',
    url: input.documentUrl,
    title: '脚本说明',
    revision: 4,
    content: '<title>脚本说明</title>\n\n```js\nconst first = 1;\nconst second = 2;\n```',
  });

  const task = await f.service.createDocument(f.context, '915f80de-b447-4dd2-a416-28f1f6c7e2f8', {
    title: '脚本说明',
    content: '```js\nconst first = 1;\n\nconst second = 2;\n```',
  });
  assert.equal(task.status, 'succeeded');
  assert.equal(task.canonicalUrl, 'https://test.feishu.cn/docx/code123');

  const warned = await waitForDocumentTask(f.service, f.context, task.id, (candidate) =>
    /未完全确认/u.test(candidate.verificationWarning ?? ''),
  );
  assert.equal(warned.contentVerification, 'unverified');
  assert.equal(warned.revision, 3);
});

test('one admitted turn retries the same native document invocation without a second dispatch', async (t) => {
  const f = await fixture(t);
  let createCalls = 0;
  const bodies = new Map<string, { title: string; content: string }>();
  f.cli.create = async (input) => {
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    createCalls++;
    const documentId = `new${createCalls}`;
    bodies.set(documentId, { title: input.title, content: input.text });
    return {
      status: 'success',
      documentId,
      url: `https://test.feishu.cn/docx/${documentId}`,
      revision: 1,
    };
  };
  f.cli.read = async (input) => {
    const documentId = input.documentUrl.split('/').at(-1)!;
    const body = bodies.get(documentId)!;
    await input.beforeRead?.();
    input.assertRead?.();
    return {
      documentId,
      url: input.documentUrl,
      title: body.title,
      revision: 2,
      content: `# ${body.title}\n${body.content}`,
    };
  };
  const turnExecutionId = '615f80de-b447-4dd2-a416-28f1f6c7e2f8';
  const first = await f.service.createDocument(f.context, turnExecutionId, {
    title: '周报',
    content: '本周进展',
  });
  const retry = await f.service.createDocument(f.context, turnExecutionId, {
    title: ' 周报 ',
    content: '本周进展\r\n',
  });
  assert.equal(retry.id, first.id);
  assert.equal(retry.status, 'succeeded');
  assert.equal(createCalls, 1);

  const newTurn = await f.service.createDocument(
    f.context,
    '10c18831-5fdf-45a1-91fe-362964a6185d',
    { title: '周报', content: '本周进展' },
  );
  assert.notEqual(newTurn.id, first.id);
  await Promise.all(
    [first.id, newTurn.id].map((id) =>
      waitForDocumentTask(
        f.service,
        f.context,
        id,
        (candidate) => candidate.contentVerification === 'verified',
      ),
    ),
  );
  assert.equal(createCalls, 2);
});

test('document-create eligibility keeps account choice in trusted session bindings', async (t) => {
  const f = await fixture(t);
  const ready = await f.service.documentCreateEligibility(f.context);
  assert.equal(ready.status, 'ready');
  assert.equal(
    ready.status === 'ready' ? ready.candidate.connectionId : undefined,
    f.connection.id,
  );

  const second = await f.service.connect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    profile: 'second',
  });
  const bindings = await f.service.resolveSelections([
    ...f.context.bindings.map(({ name: _name, accountLabel: _label, ...binding }) => binding),
    {
      extensionId: 'partner.library',
      connectorId: 'feishu',
      connectionId: second.id,
      connectionRevision: second.revision,
      documents: [],
    },
  ]);
  const selection = await f.service.documentCreateEligibility({
    ...f.context,
    bindings,
    getCurrentBindings: () => bindings,
  });
  assert.equal(selection.status, 'selection-required');
  assert.deepEqual(
    selection.status === 'selection-required'
      ? selection.candidates.map((candidate) => candidate.connectionId)
      : [],
    [f.connection.id, second.id],
  );

  const plan = await f.service.documentCreateEligibility({
    ...f.context,
    permissionMode: 'plan',
  });
  assert.deepEqual(plan, {
    status: 'unavailable',
    reason: 'plan-mode',
    recoveryAction: 'leave-plan',
    candidates: [],
  });
});

test('an explicit typed Base task writes directly once and persists its verified resource receipt', async (t) => {
  const f = await fixture(t);
  const task = await f.service.createBase(f.context, {
    connectionId: f.connection.id,
    folderUrl: folder,
    baseName: '项目台账',
    tableName: '任务',
    fields: baseFields,
  });
  assert.equal(task.status, 'succeeded');
  assert.equal(task.timeZone, 'Asia/Shanghai');
  assert.equal(task.url, 'https://www.feishu.cn/base/baseToken');
  assert.equal(f.writes(), 1);
  assert.deepEqual((await f.service.records(f.context)).baseTasks, [task]);
  assert.equal((await f.service.records({ ...f.context, sessionId: 'other' })).baseTasks.length, 0);
});

test('Base lifecycle publishes a narrow task id at preparing, submitting and final state', async (t) => {
  const f = await fixture(t);
  let entered!: () => void;
  let release!: () => void;
  const submitted = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.cli.createBase = async (input) => {
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    entered();
    await held;
    return {
      status: 'success',
      baseToken: 'baseToken',
      tableId: 'tblTask',
      url: 'https://www.feishu.cn/base/baseToken',
    };
  };
  const before = f.changes.length;
  const creating = f.service.createBase(f.context, {
    connectionId: f.connection.id,
    folderUrl: folder,
    baseName: '项目台账',
    tableName: '任务',
    fields: baseFields,
  });
  await submitted;
  const live = (await f.service.records(f.context)).baseTasks[0]!;
  assert.equal(live.status, 'submitting');
  const progress = f.changes.slice(before);
  assert.equal(progress.length, 2);
  assert.deepEqual(progress[0], {
    sessionId: f.context.sessionId,
    projectRoot: f.context.projectRoot,
    extensionId: 'partner.library',
    baseTaskId: live.id,
  });
  assert.deepEqual(progress[1], progress[0]);
  release();
  const finished = await creating;
  assert.equal(finished.status, 'succeeded');
  assert.deepEqual(f.changes.slice(before), [progress[0], progress[0], progress[0]]);
});

test('a typed Base request persists a failed task when write policy blocks preflight', async (t) => {
  const f = await fixture(t);
  f.blockWrites();
  const before = f.changes.length;
  const task = await f.service.createBase(f.context, {
    connectionId: f.connection.id,
    folderUrl: folder,
    baseName: '项目台账',
    tableName: '任务',
    fields: baseFields,
  });
  assert.equal(task.status, 'failed');
  assert.equal(f.writes(), 0);
  assert.deepEqual((await f.service.records(f.context)).baseTasks, [task]);
  assert.deepEqual(f.changes.slice(before), [
    {
      sessionId: f.context.sessionId,
      projectRoot: f.context.projectRoot,
      extensionId: 'partner.library',
      baseTaskId: task.id,
    },
    {
      sessionId: f.context.sessionId,
      projectRoot: f.context.projectRoot,
      extensionId: 'partner.library',
      baseTaskId: task.id,
    },
  ]);
});

test('Base task scope rejects and plan failure is visible; post-spawn uncertainty never retries', async (t) => {
  const f = await fixture(t);
  const input = {
    connectionId: f.connection.id,
    folderUrl: folder,
    baseName: '项目台账',
    tableName: '任务',
    fields: baseFields,
  };
  const planTask = await f.service.createBase({ ...f.context, permissionMode: 'plan' }, input);
  assert.equal(planTask.status, 'failed');
  await assert.rejects(
    f.service.createBase(f.context, {
      ...input,
      folderUrl: 'https://test.feishu.cn/drive/folder/otherFolder',
    }),
  );
  assert.equal(f.writes(), 0);
  let calls = 0;
  f.cli.createBase = async (value) => {
    await value.beforeDispatch?.();
    value.assertDispatch?.();
    calls++;
    throw new FeishuCliError('timeout', true);
  };
  const task = await f.service.createBase(f.context, input);
  assert.equal(task.status, 'unknown');
  assert.match(task.error ?? '', /不会自动重试/);
  assert.equal(calls, 1);
  assert.equal((await f.service.records(f.context)).baseTasks.length, 2);
});

test('verified account is separate from per-session document consent and Coder cannot read', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.service.read(
      { ...f.context, surface: 'code' },
      { connectionId: f.connection.id, documentUrl: doc },
    ),
  );
  await assert.rejects(
    f.service.read(f.context, {
      connectionId: f.connection.id,
      documentUrl: 'https://test.feishu.cn/docx/other',
    }),
  );
  const source = await f.service.read(f.context, {
    connectionId: f.connection.id,
    documentUrl: doc,
  });
  assert.equal(source.content, 'text1');
  assert.equal(
    (await f.service.records({ ...f.context, sessionId: 'session-b' })).sources.length,
    0,
  );
  assert.equal((await f.service.records(f.context)).sources.length, 1);
  f.disable();
  await assert.rejects(
    f.service.read(f.context, { connectionId: f.connection.id, documentUrl: doc }),
  );
});

test('creating a proposal never writes; a reviewed immutable proposal commits at most once', async (t) => {
  const f = await fixture(t);
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: 'New',
    content: 'hello',
    rationale: '',
  });
  assert.equal(f.writes(), 0);
  await assert.rejects(f.service.apply(f.context, p.id, '0'.repeat(64)));
  const result = await f.service.apply(f.context, p.id, p.contentHash);
  assert.equal(result.status, 'succeeded');
  assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, 'succeeded');
  assert.equal(f.writes(), 1);
  assert.equal((await f.service.records(f.context)).receipts.length, 1);
});

test('legacy create proposals are rejected before persistence or remote dispatch', async (t) => {
  const f = await fixture(t);
  const legacyCreate = {
    connectionId: f.connection.id,
    operation: 'create',
    title: '周报',
    content: '本周进展',
    rationale: '',
  } as unknown as PartnerRemoteProposalInputT;
  await assert.rejects(f.service.propose(f.context, legacyCreate));
  assert.equal(f.writes(), 0);
  assert.deepEqual((await f.service.records(f.context)).proposals, []);

  const id = '785fc824-c17a-48c2-a360-e515028869b5';
  const title = '历史周报';
  const content = '历史正文';
  const contentHash = createHash('sha256')
    .update(JSON.stringify(['create', folder, title, content]))
    .digest('hex');
  const file = path.join(f.root, 'records.json');
  const state = JSON.parse(await readFile(file, 'utf8'));
  state.proposals.push({
    id,
    sessionId: f.context.sessionId,
    projectRoot: f.context.projectRoot,
    extensionId: 'partner.library',
    connectorId: 'feishu',
    connectionId: f.connection.id,
    connectionRevision: f.connection.revision,
    operation: 'create',
    targetUrl: folder,
    title,
    content,
    rationale: '',
    contentHash,
    scopeHash: 'a'.repeat(64),
    status: 'pending',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  });
  await writeFile(file, JSON.stringify(state));
  const historical = await f.service.apply(f.context, id, contentHash);
  assert.equal(historical.status, 'rejected');
  assert.match(historical.error ?? '', /已停用/u);
  assert.equal(f.writes(), 0);
  assert.deepEqual((await f.service.records(f.context)).receipts, []);
});

test('creating a Base without a folder uses the connected account personal space', async (t) => {
  const f = await fixture(t);
  let target: string | undefined = 'not-called';
  f.cli.createBase = async (input) => {
    target = input.folderUrl;
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    return {
      status: 'success',
      baseToken: 'baseToken',
      tableId: 'tblTask',
      url: 'https://www.feishu.cn/base/baseToken',
    };
  };
  const task = await f.service.createBase(f.context, {
    connectionId: f.connection.id,
    baseName: '项目台账',
    tableName: '任务',
    fields: baseFields,
  });
  assert.equal(task.status, 'succeeded');
  assert.equal(task.folderUrl, undefined);
  assert.equal(target, undefined);
});

test('append conflicts, plan mode, disconnect, and hot scope removal never dispatch writes', async (t) => {
  const f = await fixture(t);
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: 'Test',
    content: 'append',
    rationale: '',
  });
  f.advance();
  assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, 'conflict');
  await assert.rejects(
    f.service.propose(
      { ...f.context, permissionMode: 'plan' },
      {
        connectionId: f.connection.id,
        operation: 'append',
        targetUrl: doc,
        title: 'New',
        content: 'text',
        rationale: '',
      },
    ),
  );
  await assert.rejects(
    f.service.read(
      { ...f.context, getCurrentBindings: () => [] },
      { connectionId: f.connection.id, documentUrl: doc },
    ),
  );
  await f.service.disconnect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    connectionId: f.connection.id,
  });
  await assert.rejects(
    f.service.read(f.context, { connectionId: f.connection.id, documentUrl: doc }),
  );
  assert.equal(f.writes(), 0);
});

test('parallel approvals preserve the active submission and do not turn it into failed', async (t) => {
  const f = await fixture(t);
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const append = f.cli.append;
  f.cli.append = async (input) => {
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    started();
    await wait;
    return append({ ...input, beforeDispatch: undefined, assertDispatch: undefined });
  };
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  const first = f.service.apply(f.context, p.id, p.contentHash);
  await ready;
  const second = await f.service.apply(f.context, p.id, p.contentHash);
  assert.equal(second.status, 'submitting');
  release();
  assert.equal((await first).status, 'succeeded');
  assert.equal(f.writes(), 1);
});

test('uncertain/partial writes never get success receipts or automatic retries', async (t) => {
  for (const status of ['unknown', 'partial'] as const) {
    const f = await fixture(t);
    let calls = 0;
    f.cli.append = async (input) => {
      await input.beforeDispatch?.();
      input.assertDispatch?.();
      calls++;
      return { status };
    };
    const p = await f.service.propose(f.context, {
      connectionId: f.connection.id,
      operation: 'append',
      targetUrl: doc,
      title: 'New',
      content: 'body',
      rationale: '',
    });
    assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, status);
    await f.service.apply(f.context, p.id, p.contentHash);
    assert.equal(calls, 1);
    assert.equal((await f.service.records(f.context)).receipts.length, 0);
  }
});

test('revocation during CLI preflight denies dispatch and rejected proposals remain unwritten', async (t) => {
  const f = await fixture(t);
  f.cli.append = async (input) => {
    f.context.getCurrentBindings = () => [];
    await input.beforeDispatch?.();
    throw new Error('must not dispatch');
  };
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, 'failed');
  assert.equal(f.writes(), 0);
  f.context.getCurrentBindings = () => f.context.bindings;
  const next = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  await f.service.reject(f.context, next.id);
  assert.equal((await f.service.apply(f.context, next.id, next.contentHash)).status, 'rejected');
});

test('after restart a dead submitting writer is unknown, never replayed', async (t) => {
  const f = await fixture(t);
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  const file = path.join(f.root, 'records.json');
  const state = JSON.parse(await readFile(file, 'utf8'));
  state.proposals[0].status = 'submitting';
  state.dispatchOwners[p.id] = 2147483647;
  await writeFile(file, JSON.stringify(state));
  assert.equal((await f.service.records(f.context)).proposals[0].status, 'unknown');
  assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, 'unknown');
  assert.equal(f.writes(), 0);
});

test('native document recovery fails pre-dispatch work and never replays uncertain submits', async (t) => {
  const f = await fixture(t);
  const turnExecutionId = '615f80de-b447-4dd2-a416-28f1f6c7e2f8';
  const task = await f.service.createDocument(f.context, turnExecutionId, {
    title: '周报',
    content: '本周进展',
  });
  await waitForDocumentTask(f.service, f.context, task.id, (candidate) =>
    /未完全确认/u.test(candidate.verificationWarning ?? ''),
  );
  const file = path.join(f.root, 'records.json');
  const preparing = JSON.parse(await readFile(file, 'utf8'));
  const stored = preparing.documentTasks.find(
    (candidate: { id: string }) => candidate.id === task.id,
  );
  stored.status = 'preparing';
  delete stored.resourceId;
  delete stored.title;
  delete stored.canonicalUrl;
  delete stored.revision;
  delete stored.contentVerification;
  delete stored.verificationWarning;
  delete stored.error;
  preparing.dispatchOwners[task.id] = 2147483647;
  await writeFile(file, JSON.stringify(preparing));

  const failed = (await f.service.records(f.context)).documentTasks.find(
    (candidate) => candidate.id === task.id,
  )!;
  assert.equal(failed.status, 'failed');
  assert.match(failed.error ?? '', /尚未提交/u);

  const submitting = JSON.parse(await readFile(file, 'utf8'));
  submitting.documentTasks.find((candidate: { id: string }) => candidate.id === task.id).status =
    'submitting';
  submitting.documentTasks.find((candidate: { id: string }) => candidate.id === task.id).error =
    undefined;
  submitting.dispatchOwners[task.id] = 2147483647;
  await writeFile(file, JSON.stringify(submitting));
  const writesBeforeRetry = f.writes();

  const unknown = (await f.service.records(f.context)).documentTasks.find(
    (candidate) => candidate.id === task.id,
  )!;
  assert.equal(unknown.status, 'unknown');
  assert.match(unknown.error ?? '', /不会自动重试/u);
  const retry = await f.service.createDocument(f.context, turnExecutionId, {
    title: '周报',
    content: '本周进展',
  });
  assert.equal(retry.id, task.id);
  assert.equal(retry.status, 'unknown');
  assert.equal(f.writes(), writesBeforeRetry);
});

test('legacy records default Base tasks and a dead Base submit becomes unknown without replay', async (t) => {
  const f = await fixture(t);
  const file = path.join(f.root, 'records.json');
  const legacy = JSON.parse(await readFile(file, 'utf8'));
  delete legacy.baseTasks;
  await writeFile(file, JSON.stringify(legacy));
  assert.deepEqual((await f.service.records(f.context)).baseTasks, []);

  const task = await f.service.createBase(f.context, {
    connectionId: f.connection.id,
    folderUrl: folder,
    baseName: '项目台账',
    tableName: '任务',
    fields: baseFields,
  });
  const state = JSON.parse(await readFile(file, 'utf8'));
  state.baseTasks[0].status = 'submitting';
  delete state.baseTasks[0].baseToken;
  delete state.baseTasks[0].tableId;
  delete state.baseTasks[0].url;
  state.dispatchOwners[task.id] = 2147483647;
  await writeFile(file, JSON.stringify(state));
  const recovered = (await f.service.records(f.context)).baseTasks[0]!;
  assert.equal(recovered.status, 'unknown');
  assert.match(recovered.error ?? '', /不会自动重试/);
  assert.equal(f.writes(), 1);
});

test('two pending approvals racing at the dispatch gate cannot overwrite each other', async (t) => {
  const f = await fixture(t);
  let arrived = 0;
  let admit!: () => void;
  let finish!: () => void;
  let dispatched!: () => void;
  const gate = new Promise<void>((r) => {
    admit = r;
  });
  const completion = new Promise<void>((r) => {
    finish = r;
  });
  const writing = new Promise<void>((r) => {
    dispatched = r;
  });
  f.cli.append = async (input) => {
    arrived++;
    if (arrived === 2) admit();
    await gate;
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    dispatched();
    await completion;
    return {
      status: 'success',
      documentId: 'doc123',
      url: doc,
      revision: 2,
    };
  };
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  const a = f.service.apply(f.context, p.id, p.contentHash);
  const b = f.service.apply(f.context, p.id, p.contentHash);
  await writing;
  const loser = await Promise.race([a, b]);
  assert.equal(loser.status, 'submitting');
  finish();
  const results = await Promise.all([a, b]);
  assert.equal(results.filter((x) => x.status === 'succeeded').length, 1);
});

test('inspection contains no private identity, unchanged verification preserves session consent', async (t) => {
  const f = await fixture(t);
  const status = await f.service.inspect('partner.library', 'feishu');
  assert.equal(status.profiles[0].name, 'test');
  assert.equal(JSON.stringify(status).includes('ou_test'), false);
  const again = await f.service.connect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    profile: 'test',
  });
  assert.equal(again.revision, f.connection.revision);
  assert.equal(
    (await f.service.describeBindings(f.context.bindings)).connectors[0].available,
    true,
  );
  f.disable();
  assert.equal(
    (await f.service.describeBindings(f.context.bindings)).connectors[0].available,
    false,
  );
});

test('disable rejects new calls and waits for already dispatched write settlement', async (t) => {
  const f = await fixture(t);
  let started!: () => void;
  let release!: () => void;
  let removed = false;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const wait = new Promise<void>((r) => {
    release = r;
  });
  f.cli.append = async (input) => {
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    started();
    await wait;
    return {
      status: 'success',
      documentId: 'doc123',
      url: doc,
      revision: 2,
    };
  };
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  const applying = f.service.apply(f.context, p.id, p.contentHash);
  await ready;
  const removing = f.service.deactivate('partner.library', async () => {
    removed = true;
    f.disable();
  });
  await assert.rejects(
    f.service.read(f.context, { connectionId: f.connection.id, documentUrl: doc }),
  );
  assert.equal(removed, false);
  release();
  await applying;
  await removing;
  assert.equal(removed, true);
  assert.equal((await f.service.getProposal(f.context, p.id))?.status, 'succeeded');
});

test('disconnect also waits for document verification spawned by an admitted create', async (t) => {
  const f = await fixture(t);
  let markCreateStarted!: () => void;
  let releaseCreate!: () => void;
  let markReadStarted!: () => void;
  let releaseRead!: () => void;
  let disconnected = false;
  const createStarted = new Promise<void>((resolve) => {
    markCreateStarted = resolve;
  });
  const createBarrier = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });
  const readStarted = new Promise<void>((resolve) => {
    markReadStarted = resolve;
  });
  const readBarrier = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  f.cli.create = async (input) => {
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    markCreateStarted();
    await createBarrier;
    return {
      status: 'success',
      documentId: 'drain123',
      url: 'https://test.feishu.cn/docx/drain123',
      revision: 1,
    };
  };
  f.cli.read = async (input) => {
    markReadStarted();
    await readBarrier;
    await input.beforeRead?.();
    input.assertRead?.();
    return {
      documentId: 'drain123',
      url: input.documentUrl,
      title: '停用并发测试',
      revision: 2,
      content: '<title>停用并发测试</title>\n\n正文',
    };
  };

  const creating = f.service.createDocument(f.context, 'a15f80de-b447-4dd2-a416-28f1f6c7e2f8', {
    title: '停用并发测试',
    content: '正文',
  });
  await createStarted;
  const disconnecting = f.service
    .disconnect({
      extensionId: 'partner.library',
      connectorId: 'feishu',
      connectionId: f.connection.id,
    })
    .then(() => {
      disconnected = true;
    });

  releaseCreate();
  const created = await creating;
  assert.equal(created.status, 'succeeded');
  await readStarted;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(disconnected, false);

  releaseRead();
  await disconnecting;
  assert.equal(disconnected, true);
});

test('scope removal during the submitting disk write still prevents business dispatch', async (t) => {
  const f = await fixture(t);
  let writes = 0;
  f.cli.append = async (input) => {
    let checks = 0;
    let revoked = false;
    f.context.getCurrentBindings = () => {
      checks++;
      if (checks === 2)
        queueMicrotask(() => {
          revoked = true;
        });
      return revoked ? [] : f.context.bindings;
    };
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    writes++;
    return {
      status: 'success',
      documentId: 'doc123',
      url: doc,
      revision: 2,
    };
  };
  const p = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: 'New',
    content: 'body',
    rationale: '',
  });
  assert.equal((await f.service.apply(f.context, p.id, p.contentHash)).status, 'failed');
  assert.equal(writes, 0);
});

test('an old asynchronous verification cannot reconnect after a newer disconnect', async (t) => {
  const f = await fixture(t);
  const inspect = f.cli.inspect;
  let resume!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const wait = new Promise<void>((r) => {
    resume = r;
  });
  f.cli.inspect = async (profile) => {
    started();
    await wait;
    return inspect(profile);
  };
  const reconnect = f.service.connect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    profile: 'test',
  });
  await ready;
  await f.service.disconnect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    connectionId: f.connection.id,
  });
  resume();
  await assert.rejects(reconnect, /授权状态已改变/);
  assert.equal(
    (await f.service.describeBindings(f.context.bindings)).connectors[0].available,
    false,
  );
});

test('disconnect finishes when cancelled onboarding completes verification concurrently', async (t) => {
  const f = await fixture(t);
  let connecting: Promise<unknown> = Promise.resolve();
  let cancelled = false;
  const service = new PartnerConnectorService(f.root, {
    cli: f.cli,
    catalog: async () => [{ id: 'feishu', adapter: 'feishu-cli', name: '飞书', description: '' }],
    checkPolicy: async () => undefined,
    revokeConnections: () => {
      cancelled = true;
      return connecting.then(
        () => undefined,
        () => undefined,
      );
    },
  });
  const inspect = f.cli.inspect;
  let markVerifying!: () => void;
  let releaseVerification!: () => void;
  const verifying = new Promise<void>((resolve) => {
    markVerifying = resolve;
  });
  const verification = new Promise<void>((resolve) => {
    releaseVerification = resolve;
  });
  f.cli.inspect = async (profile) => {
    const status = await inspect(profile);
    markVerifying();
    await verification;
    return status;
  };
  connecting = service.connect(
    { extensionId: 'partner.library', connectorId: 'feishu', profile: 'new-onboarding' },
    {
      assertActive: () => {
        if (cancelled) throw new Error('cancelled');
      },
      complete: () => assert.fail('Cancelled onboarding must not connect'),
    },
  );
  const connectionRejected = assert.rejects(connecting, /cancelled/);
  await verifying;
  const disconnecting = service.disconnect({ ...f.connection, connectionId: f.connection.id });
  assert.equal(cancelled, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  releaseVerification();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([disconnecting, connectionRejected]),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Disconnect deadlocked with cancelled onboarding')),
          1000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  assert.deepEqual(await service.accounts('partner.library', 'feishu'), [
    { ...f.connection, connected: false, revision: f.connection.revision + 1 },
  ]);
  const next = await service.connect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    profile: 'next-onboarding',
  });
  assert.equal(next.connected, true);
});

test('a cancelled onboarding lease during account persistence cannot leave a connected account', async (t) => {
  const f = await fixture(t);
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const rename = fs.rename.bind(fs);
  let intercepted = false;
  t.mock.method(
    fs,
    'rename',
    async (from: Parameters<typeof fs.rename>[0], to: Parameters<typeof fs.rename>[1]) => {
      if (!intercepted && String(to) === path.join(f.root, 'records.json')) {
        intercepted = true;
        entered();
        await held;
      }
      return rename(from, to);
    },
  );
  let cancelled = false;
  let completed = false;
  const connection = f.service.connect(
    { extensionId: 'partner.library', connectorId: 'feishu', profile: 'space-new' },
    {
      assertActive: () => {
        if (cancelled) throw new Error('cancelled');
      },
      complete: () => {
        completed = true;
      },
    },
  );
  await waiting;
  cancelled = true;
  release();
  await assert.rejects(connection, /cancelled/);
  assert.equal(completed, false);
  const accounts = await f.service.accounts('partner.library', 'feishu');
  assert.deepEqual(accounts, [f.connection]);
});

test('onboarding cannot overwrite an existing profile or connect without every required scope; accounts is local only', async (t) => {
  const f = await fixture(t);
  let inspections = 0;
  const inspect = f.cli.inspect;
  f.cli.inspect = async (profile) => {
    inspections++;
    const status = await inspect(profile);
    return { ...status, identity: { ...status.identity!, scopes: ['docx:document:readonly'] } };
  };
  const lease = { assertActive: () => undefined, complete: () => assert.fail('must not commit') };
  await assert.rejects(f.service.connect({ ...f.connection, profile: 'test' }, lease), /拒绝覆盖/);
  assert.equal(inspections, 0);
  await assert.rejects(
    f.service.connect({ ...f.connection, profile: 'space-fresh' }, lease),
    /缺少/,
  );
  assert.equal(inspections, 1);
  assert.deepEqual(await f.service.accounts('partner.library', 'feishu'), [f.connection]);
  assert.equal(inspections, 1);
});

test('a full Feishu account history permits a fresh identity without reviving old authorization', async (t) => {
  const f = await fixture(t);
  const source = await f.service.read(f.context, {
    connectionId: f.connection.id,
    documentUrl: doc,
  });
  const proposal = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: '历史提案',
    content: '已审核内容',
    rationale: '',
  });
  await f.service.apply(f.context, proposal.id, proposal.contentHash);
  await f.service.createBase(f.context, {
    connectionId: f.connection.id,
    baseName: '历史台账',
    tableName: '任务',
    fields: baseFields,
  });
  const document = await f.service.createDocument(
    f.context,
    '53a9811c-d822-4f2d-bab5-2c99b4b111fa',
    {
      title: '历史文档',
      content: '文档内容',
    },
  );
  await waitForDocumentTask(f.service, f.context, document.id, (task) =>
    /未完全确认/u.test(task.verificationWarning ?? ''),
  );
  const pending = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: '待审核提案',
    content: '不能继承的授权',
    rationale: '',
  });
  await f.service.disconnect({ ...f.connection, connectionId: f.connection.id });
  const inspect = f.cli.inspect;
  f.cli.inspect = async (profile) => {
    const status = await inspect(profile);
    return {
      ...status,
      identity: { ...status.identity!, appId: `cli_${profile}`, openId: `ou_${profile}` },
    };
  };
  for (let index = 1; index < 64; index++) {
    const account = await f.service.connect({
      extensionId: 'partner.library',
      connectorId: 'feishu',
      profile: `account-${index}`,
    });
    await f.service.disconnect({ ...account, connectionId: account.id });
  }
  assert.equal((await f.service.accounts('partner.library', 'feishu')).length, 64);
  const history = await f.service.records(f.context);
  const fresh = await f.service.connect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    profile: 'fresh-identity',
  });
  const accounts = await f.service.accounts('partner.library', 'feishu');
  assert.equal(accounts.length, 64);
  assert.equal(accounts.filter((account) => account.connected).length, 1);
  assert.equal(
    accounts.some((account) => account.id === f.connection.id),
    false,
  );
  assert.notEqual(fresh.id, f.connection.id);
  assert.equal(fresh.revision, 1);
  const after = await f.service.records(f.context);
  for (const key of ['sources', 'proposals', 'receipts', 'baseTasks', 'documentTasks'] as const)
    assert.deepEqual(after[key], history[key]);
  assert.deepEqual(await f.service.getSource(f.context, source.id), source);
  assert.deepEqual(await f.service.getProposal(f.context, pending.id), pending);
  assert.equal(
    (await f.service.describeBindings(f.context.bindings)).connectors[0]!.available,
    false,
  );
  const bindings = await f.service.resolveSelections([
    {
      extensionId: 'partner.library',
      connectorId: 'feishu',
      connectionId: fresh.id,
      connectionRevision: fresh.revision,
      documents: [{ url: doc, access: 'append' }],
    },
  ]);
  const writes = f.writes();
  assert.equal(
    (
      await f.service.apply(
        { ...f.context, bindings, getCurrentBindings: () => bindings },
        pending.id,
        pending.contentHash,
      )
    ).status,
    'failed',
  );
  assert.equal(f.writes(), writes);
});

test('cancelling a full-capacity Feishu connection restores the reclaimed disconnected account', async (t) => {
  const f = await fixture(t);
  await f.service.disconnect({ ...f.connection, connectionId: f.connection.id });
  for (let index = 1; index < 64; index++) {
    const account = await f.service.connect({
      extensionId: 'partner.library',
      connectorId: 'feishu',
      profile: `account-${index}`,
    });
    await f.service.disconnect({ ...account, connectionId: account.id });
  }
  const before = await f.service.accounts('partner.library', 'feishu');
  const rename = fs.rename.bind(fs);
  const controller = new AbortController();
  let intercepted = false;
  t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
    await rename(...args);
    if (!intercepted && String(args[1]) === path.join(f.root, 'records.json')) {
      intercepted = true;
      controller.abort();
    }
  });
  await assert.rejects(
    f.service.connect(
      { extensionId: 'partner.library', connectorId: 'feishu', profile: 'cancelled-onboarding' },
      {
        signal: controller.signal,
        assertActive: () => {
          if (controller.signal.aborted) throw new Error('cancelled');
        },
        complete: () => assert.fail('Cancelled connection must not be delivered'),
      },
    ),
    /cancelled/,
  );
  assert.equal(intercepted, true);
  assert.deepEqual(await f.service.accounts('partner.library', 'feishu'), before);
  const fresh = await f.service.connect({
    extensionId: 'partner.library',
    connectorId: 'feishu',
    profile: 'retry-onboarding',
  });
  assert.equal(fresh.connected, true);
  assert.notEqual(fresh.id, f.connection.id);
});

test('full-capacity Feishu connections never reclaim an active account', async (t) => {
  const f = await fixture(t);
  for (let index = 1; index < 64; index++) {
    await f.service.connect({
      extensionId: 'partner.library',
      connectorId: 'feishu',
      profile: `active-${index}`,
    });
  }
  const before = await f.service.accounts('partner.library', 'feishu');
  await assert.rejects(
    f.service.connect({
      extensionId: 'partner.library',
      connectorId: 'feishu',
      profile: 'over-capacity',
    }),
  );
  assert.deepEqual(await f.service.accounts('partner.library', 'feishu'), before);
  assert.equal(
    (await f.service.describeBindings(f.context.bindings)).connectors[0]!.available,
    true,
  );
});

test('account reclamation waits for an already dispatched write to finish disconnecting', async (t) => {
  const f = await fixture(t);
  for (let index = 1; index < 64; index++) {
    const account = await f.service.connect({
      extensionId: 'partner.library',
      connectorId: 'feishu',
      profile: `account-${index}`,
    });
    await f.service.disconnect({ ...account, connectionId: account.id });
  }
  const proposal = await f.service.propose(f.context, {
    connectionId: f.connection.id,
    operation: 'append',
    targetUrl: doc,
    title: '提交中的提案',
    content: '已审核内容',
    rationale: '',
  });
  const append = f.cli.append;
  let markDispatched!: () => void;
  let releaseWrite!: () => void;
  const dispatched = new Promise<void>((resolve) => {
    markDispatched = resolve;
  });
  const writeBarrier = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  f.cli.append = async (input) => {
    const result = await append(input);
    markDispatched();
    await writeBarrier;
    return result;
  };
  const writing = f.service.apply(f.context, proposal.id, proposal.contentHash);
  await dispatched;
  const disconnecting = f.service.disconnect({ ...f.connection, connectionId: f.connection.id });
  let markInspected!: () => void;
  const inspected = new Promise<void>((resolve) => {
    markInspected = resolve;
  });
  const inspect = f.cli.inspect;
  f.cli.inspect = async (profile) => {
    const result = await inspect(profile);
    markInspected();
    return result;
  };
  const nextInput = { extensionId: 'partner.library', connectorId: 'feishu', profile: 'fresh' };
  const connecting = f.service.connect(nextInput);
  const rejected = assert.rejects(connecting, /授权状态已改变/);
  try {
    await inspected;
    const duringCleanup = await f.service.accounts('partner.library', 'feishu');
    assert.equal(
      duringCleanup.some((account) => account.id === f.connection.id),
      true,
    );
    assert.equal(
      duringCleanup.some((account) => account.profile === 'fresh'),
      false,
    );
  } finally {
    releaseWrite();
  }
  await Promise.all([writing, disconnecting, rejected]);
  const fresh = await f.service.connect(nextInput);
  assert.notEqual(fresh.id, f.connection.id);
  assert.equal((await f.service.getProposal(f.context, proposal.id))!.status, 'succeeded');
  assert.equal((await f.service.records(f.context)).receipts[0]!.connectionId, f.connection.id);
});

test('late revocation discards a read before returning or publishing its persisted body', async (t) => {
  const f = await fixture(t);
  const read = f.cli.read;
  f.cli.read = async (input) => {
    let checks = 0;
    let revoked = false;
    f.context.getCurrentBindings = () => {
      checks++;
      if (checks === 3)
        queueMicrotask(() => {
          revoked = true;
        });
      return revoked ? [] : f.context.bindings;
    };
    return read(input);
  };
  await assert.rejects(
    f.service.read(f.context, { connectionId: f.connection.id, documentUrl: doc }),
  );
  assert.equal((await f.service.records(f.context)).sources.length, 0);
});
