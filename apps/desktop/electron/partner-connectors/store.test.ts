import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PartnerConnectorStore } from './store.js';

test('connector records migrate from v1 to v2 without losing an existing account', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-connector-store-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'records');
  await fs.mkdir(root, { mode: 0o700 });
  const legacyConnection = {
    id: 'b6c4724a-979d-4267-9968-8ce67653c880',
    extensionId: 'partner.library',
    connectorId: 'feishu-docs',
    revision: 3,
    profile: 'default',
    accountLabel: '测试账号',
    connected: true,
    permissions: { read: true, create: true, append: true, createBase: false },
    appId: 'cli-app',
    openId: 'ou_legacy',
  };
  await fs.writeFile(
    path.join(root, 'records.json'),
    JSON.stringify({
      version: 1,
      connections: [legacyConnection],
      sources: [],
      proposals: [],
      receipts: [],
      baseTasks: [],
      dispatchOwners: {},
    }),
    { mode: 0o600 },
  );

  const firstRead = await new PartnerConnectorStore(root).read();
  assert.equal(firstRead.version, 2);
  assert.deepEqual(firstRead.connections, [legacyConnection]);
  assert.deepEqual(firstRead.documentTasks, []);
  assert.equal(firstRead.recordRevision, 0);

  await new PartnerConnectorStore(root).mutate(() => undefined);
  const reopened = await new PartnerConnectorStore(root).read();
  assert.equal(reopened.version, 2);
  assert.deepEqual(reopened.connections, [legacyConnection]);
  assert.deepEqual(reopened.documentTasks, []);
  assert.equal(reopened.recordRevision, 1);
});

test('Base recovery fails abandoned preparation but preserves live work and uncertain submits', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-base-recovery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const now = '2026-09-07T00:00:00.000Z';
  const base = {
    sessionId: 'session-a',
    projectRoot: '/test/project',
    extensionId: 'partner.library',
    connectorId: 'feishu',
    connectionId: '9df0d718-d2eb-4464-a533-a43e2a1e64ea',
    connectionRevision: 1,
    baseName: '项目台账',
    tableName: '任务',
    fields: [{ type: 'text', name: '事项' }],
    timeZone: 'Asia/Shanghai',
    inputHash: 'a'.repeat(64),
    scopeHash: 'b'.repeat(64),
    createdAt: now,
    updatedAt: now,
  };
  const abandoned = { ...base, id: '6f2bff7e-eec9-4491-a56a-2d9e6b9db4b6', status: 'preparing' };
  const live = { ...base, id: '8833ba71-29a7-427b-a4e9-a790dcb31089', status: 'preparing' };
  const submitted = { ...base, id: 'cf59c95d-721c-4848-bfa3-16b1b4cb1933', status: 'submitting' };
  // Old preparing records have no owner; crashed submitting records have a dead PID.
  await fs.writeFile(
    path.join(root, 'records.json'),
    JSON.stringify({
      version: 2,
      connections: [],
      sources: [],
      proposals: [],
      receipts: [],
      baseTasks: [abandoned, live, submitted],
      documentTasks: [],
      recordRevision: 0,
      dispatchOwners: { [live.id]: process.pid, [submitted.id]: 2147483647 },
    }),
    { mode: 0o600 },
  );
  const recovered = await new PartnerConnectorStore(root).readReconciled();
  assert.deepEqual(
    recovered.baseTasks.map((task) => task.status),
    ['failed', 'preparing', 'unknown'],
  );
  assert.match(recovered.baseTasks[0]!.error ?? '', /尚未提交/);
  assert.match(recovered.baseTasks[2]!.error ?? '', /不会自动重试/);
  assert.deepEqual(
    (await new PartnerConnectorStore(root).readReconciled()).baseTasks,
    recovered.baseTasks,
  );
});
