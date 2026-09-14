import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PartnerConnectorService, type PartnerConnectorContext } from './service.js';
import { FeishuCli } from './feishu-cli.js';
import type { ReadConnector } from './read-connector.js';
const ref = 'mail://qq/inbox/99/42';
async function fixture(t: { after(fn: () => Promise<void>): void }, kind: 'mail' | 'doc') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'partner-new-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const identity = { authorityId: 'test', subjectId: 'test', label: 'Test' };
  let calls = 0;
  let guard: () => void = () => undefined;
  let result: 'success' | 'unknown' = 'success';
  const id = kind === 'mail' ? 'qq-mail-imap' : 'tencent-docs-mcp';
  const adapter: ReadConnector = {
    id,
    inspect: async () => ({ installed: true, identity }),
    run: async () => undefined,
    isAuthorizationUrl: (_v): _v is string => false,
    acceptsResource: (url) =>
      kind === 'mail' ? url === ref : url === 'https://docs.qq.com/doc/abc',
    read: async (input) => {
      await input.beforeRead();
      input.assertRead();
      guard();
      return {
        documentId: kind === 'mail' ? 'inbox/99/42' : 'abc',
        url: input.documentUrl,
        title: 'Subject',
        content: 'Body',
        revision: 0,
      };
    },
    search: async (input) => {
      await input.beforeRead();
      input.assertRead();
      guard();
      return {
        messages: [
          { reference: ref, subject: 'Subject', from: 'a@qq.com', to: 'b@qq.com', size: 100 },
        ],
        uidValidity: '99',
        scannedUidRange: { from: 1, to: 42 },
        hasMore: false,
      };
    },
    createDocument: async (input) => {
      await input.beforeDispatch();
      input.assertDispatch();
      calls++;
      guard();
      return result === 'success'
        ? { status: 'success', documentId: 'abc', url: 'https://docs.qq.com/doc/abc', revision: 0 }
        : { status: 'unknown' };
    },
  };
  const service = new PartnerConnectorService(root, {
    cli: new FeishuCli(async () => {
      throw Error('not Feishu');
    }),
    readConnectors: { [id]: adapter },
    catalog: async () => [{ id: kind, adapter: id, name: 'Test', description: '' }],
    checkPolicy: async () => undefined,
  });
  const account = await service.connect({
    extensionId: 'partner.library',
    connectorId: kind,
    profile: 'test',
  });
  const bindings = await service.resolveSelections([
    {
      extensionId: 'partner.library',
      connectorId: kind,
      connectionId: account.id,
      connectionRevision: account.revision,
      adapter: id,
      documents: [],
      ...(kind === 'mail' ? { mailbox: 'inbox' as const } : { allowCreateDocument: true }),
    },
  ]);
  let current = bindings;
  const context: PartnerConnectorContext = {
    sessionId: 'session',
    projectRoot: '/project',
    surface: 'partner',
    permissionMode: 'accept-edits',
    bindings,
    getCurrentBindings: () => current,
  };
  return {
    service,
    context,
    account,
    adapter,
    revoke: () => {
      current = [];
    },
    guard: (fn: () => void) => {
      guard = fn;
    },
    calls: () => calls,
    unknown: () => {
      result = 'unknown';
    },
  };
}
test('mail search and read use INBOX grant and discard revoked or cross-provider results', async (t) => {
  const f = await fixture(t, 'mail');
  assert.equal(
    (await f.service.search(f.context, { connectionId: f.account.id, query: {} })).messages.length,
    1,
  );
  assert.equal(
    (await f.service.read(f.context, { connectionId: f.account.id, documentUrl: ref })).content,
    'Body',
  );
  await assert.rejects(() =>
    f.service.read(f.context, {
      connectionId: f.account.id,
      documentUrl: 'mail://netease/inbox/99/42',
    }),
  );
  const unscoped = {
    ...f.context,
    bindings: f.context.bindings.map((b) => ({ ...b, mailbox: undefined })),
    getCurrentBindings: undefined,
  };
  await assert.rejects(() => f.service.search(unscoped, { connectionId: f.account.id, query: {} }));
  f.guard(f.revoke);
  await assert.rejects(() =>
    f.service.search(f.context, { connectionId: f.account.id, query: {} }),
  );
});
test('Tencent native creation uses persisted shared receipt and deduplicates same invocation', async (t) => {
  const f = await fixture(t, 'doc');
  const turn = randomUUID();
  const input = { connectionId: f.account.id, title: 'Test', content: 'Body' };
  const task = await f.service.createConnectorDocument(f.context, turn, input);
  assert.equal(task.status, 'succeeded');
  assert.equal(task.provider, 'tencent-docs');
  assert.equal(task.canonicalUrl, 'https://docs.qq.com/doc/abc');
  assert.equal(f.calls(), 1);
  assert.equal((await f.service.createConnectorDocument(f.context, turn, input)).id, task.id);
  assert.equal(f.calls(), 1);
  const records = await f.service.records(f.context);
  assert.equal(records.documentTasks[0]?.provider, 'tencent-docs');
});
test('Tencent unknown is never automatically retried and missing create scope/plan block dispatch', async (t) => {
  const f = await fixture(t, 'doc');
  const turn = randomUUID();
  const input = { connectionId: f.account.id, title: 'Test', content: 'Body' };
  await assert.rejects(() =>
    f.service.createConnectorDocument({ ...f.context, permissionMode: 'plan' }, turn, input),
  );
  assert.equal(f.calls(), 0);
  f.unknown();
  const task = await f.service.createConnectorDocument(f.context, turn, input);
  assert.equal(task.status, 'unknown');
  assert.equal((await f.service.createConnectorDocument(f.context, turn, input)).status, 'unknown');
  assert.equal(f.calls(), 1);
});

test('Tencent creation needs its explicit session grant and cannot enter Feishu or mail create paths', async (t) => {
  const f = await fixture(t, 'doc');
  const input = { connectionId: f.account.id, title: 'Test', content: 'Body' };
  const scoped = f.context.bindings.map((binding) => ({ ...binding, allowCreateDocument: false }));
  await assert.rejects(
    f.service.createConnectorDocument(
      { ...f.context, bindings: scoped, getCurrentBindings: () => scoped },
      randomUUID(),
      input,
    ),
  );
  await assert.rejects(
    f.service.createDocument(f.context, randomUUID(), { title: 'Wrong route', content: 'Body' }),
  );
  await assert.rejects(
    f.service.createConnectorDocument(f.context, randomUUID(), {
      ...input,
      folderUrl: 'https://example.feishu.cn/drive/folder/abc',
    } as typeof input),
  );
  assert.equal(f.calls(), 0);
  assert.equal((await f.service.records(f.context)).documentTasks.length, 0);
  const mail = await fixture(t, 'mail');
  await assert.rejects(
    mail.service.createConnectorDocument(mail.context, randomUUID(), {
      ...input,
      connectionId: mail.account.id,
    }),
  );
  assert.equal(mail.calls(), 0);
});

test('Tencent revocation between persisted admission and final dispatch prevents a remote write', async (t) => {
  const f = await fixture(t, 'doc');
  let writes = 0;
  f.adapter.createDocument = async (input) => {
    await input.beforeDispatch();
    f.revoke();
    input.assertDispatch();
    writes++;
    return {
      status: 'success',
      documentId: 'abc',
      url: 'https://docs.qq.com/doc/abc',
      revision: 0,
    };
  };
  const task = await f.service.createConnectorDocument(f.context, randomUUID(), {
    connectionId: f.account.id,
    title: 'Test',
    content: 'Body',
  });
  assert.equal(task.status, 'failed');
  assert.equal(writes, 0);
  assert.equal((await f.service.records(f.context)).documentTasks[0]?.status, 'failed');
});

test('Tencent switching to plan at the final dispatch gate prevents the write', async (t) => {
  const f = await fixture(t, 'doc');
  let plan = false;
  let writes = 0;
  f.context.getCurrentPermissionMode = () => (plan ? 'plan' : 'accept-edits');
  f.adapter.createDocument = async (input) => {
    await input.beforeDispatch();
    plan = true;
    input.assertDispatch();
    writes++;
    return { status: 'unknown' };
  };
  const task = await f.service.createConnectorDocument(f.context, randomUUID(), {
    connectionId: f.account.id,
    title: 'Test',
    content: 'Body',
  });
  assert.equal(task.status, 'failed');
  assert.equal(writes, 0);
});

test('Tencent disconnect at the final dispatch gate blocks the stale account without deadlock', async (t) => {
  const f = await fixture(t, 'doc');
  let disconnected: Promise<void> | undefined;
  let writes = 0;
  f.adapter.createDocument = async (input) => {
    await input.beforeDispatch();
    disconnected = f.service.disconnect({
      extensionId: 'partner.library',
      connectorId: 'doc',
      connectionId: f.account.id,
    });
    input.assertDispatch();
    writes++;
    return { status: 'unknown' };
  };
  const input = { connectionId: f.account.id, title: 'Test', content: 'Body' };
  const task = await f.service.createConnectorDocument(f.context, randomUUID(), input);
  await disconnected;
  assert.equal(task.status, 'failed');
  assert.equal(writes, 0);
  await assert.rejects(f.service.createConnectorDocument(f.context, randomUUID(), input));
});

test('Tencent receipt without both gates cannot become a successful native task', async (t) => {
  const f = await fixture(t, 'doc');
  f.adapter.createDocument = async () => ({
    status: 'success',
    documentId: 'abc',
    url: 'https://docs.qq.com/doc/abc',
    revision: 0,
  });
  const task = await f.service.createConnectorDocument(f.context, randomUUID(), {
    connectionId: f.account.id,
    title: 'Test',
    content: 'Body',
  });
  assert.equal(task.status, 'failed');
  assert.equal(task.canonicalUrl, undefined);
});

test('Tencent invalid receipt after dispatch remains unknown and cannot be deduplicated into another write', async (t) => {
  const f = await fixture(t, 'doc');
  let writes = 0;
  f.adapter.createDocument = async (input) => {
    await input.beforeDispatch();
    input.assertDispatch();
    writes++;
    return {
      status: 'success',
      documentId: 'different',
      url: 'https://docs.qq.com/doc/abc',
      revision: 0,
    };
  };
  const turn = randomUUID();
  const input = { connectionId: f.account.id, title: 'Test', content: 'Body' };
  const task = await f.service.createConnectorDocument(f.context, turn, input);
  assert.equal(task.status, 'unknown');
  assert.equal(task.canonicalUrl, undefined);
  assert.equal((await f.service.createConnectorDocument(f.context, turn, input)).id, task.id);
  assert.equal(writes, 1);
});

test('Tencent concurrent repeats share one persisted invocation while a new turn can explicitly create again', async (t) => {
  const f = await fixture(t, 'doc');
  const turn = randomUUID();
  const input = { connectionId: f.account.id, title: 'Test', content: 'Body' };
  const [one, two] = await Promise.all([
    f.service.createConnectorDocument(f.context, turn, input),
    f.service.createConnectorDocument(f.context, turn, input),
  ]);
  assert.equal(one.id, two.id);
  assert.equal(f.calls(), 1);
  const next = await f.service.createConnectorDocument(f.context, randomUUID(), input);
  assert.notEqual(next.id, one.id);
  assert.equal(f.calls(), 2);
  assert.equal(one.contentVerification, 'unverified');
});
