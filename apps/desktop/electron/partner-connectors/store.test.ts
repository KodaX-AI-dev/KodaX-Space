import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  replaceFileWithoutFollowingAliases,
  withFileTransactionLock,
} from '../kodax/atomic-file.js';
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

test('connector record reads stay consistent while another store publishes updates', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-store-concurrent-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const writer = new PartnerConnectorStore(root);
  const reader = new PartnerConnectorStore(root);
  await writer.mutate(() => undefined);
  const writing = (async () => {
    for (let revision = 0; revision < 100; revision += 1) {
      await writer.mutate(() => undefined);
    }
  })();
  const reading = (async () => {
    let previousRevision = 1;
    for (let index = 0; index < 200; index += 1) {
      const snapshot = await reader.read();
      assert.ok(snapshot.recordRevision >= previousRevision);
      previousRevision = snapshot.recordRevision;
    }
  })();
  const results = await Promise.allSettled([writing, reading]);
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }
  assert.equal((await reader.read()).recordRevision, 101);
});

test('connector reads wait through the Windows atomic replacement gap instead of returning an empty database', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-store-replacement-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new PartnerConnectorStore(root);
  await store.mutate(() => undefined);
  const next = { ...(await store.read()), recordRevision: 2 };
  const file = path.join(root, 'records.json');
  let entered!: () => void;
  let release!: () => void;
  const displaced = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writing = withFileTransactionLock(file, 'test writer busy', () =>
    replaceFileWithoutFollowingAliases(
      file,
      Buffer.from(JSON.stringify(next)),
      'test replacement changed',
      {
        forceRenameFallback: true,
        beforeFallbackInstall: async () => {
          entered();
          await released;
        },
      },
    ),
  );
  let reading: ReturnType<PartnerConnectorStore['read']> | undefined;
  try {
    await displaced;
    reading = new PartnerConnectorStore(root).read();
    const early = await Promise.race([
      reading,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 100)),
    ]);
    assert.equal(early, undefined, 'a reader must wait for the active writer');
    release();
    await writing;
    assert.deepEqual(await reading, next);
  } finally {
    release();
    await Promise.allSettled([writing, reading]);
  }
});
