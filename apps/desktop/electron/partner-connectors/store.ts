import path from 'node:path';
import { z } from 'zod';
import {
  partnerConnectorConnectionSchema,
  partnerRemoteSourceSchema,
  partnerRemoteProposalSchema,
  partnerRemoteReceiptSchema,
  partnerFeishuBaseCreateTaskSchema,
  partnerNativeDocumentTaskSchema,
} from '@kodax-space/space-ipc-schema';
import {
  replaceFileWithoutFollowingAliases,
  withFileTransactionLock,
} from '../kodax/atomic-file.js';
import { assertOwnedDirectory, readRegularFile } from '../space-extensions/files.js';

export const MAX_PARTNER_CONNECTOR_ACCOUNTS = 64;

const connectionSchema = partnerConnectorConnectionSchema
  .extend({
    appId: z.string().max(160).optional(),
    openId: z.string().max(160).optional(),
    providerIdentity: z
      .object({
        authorityId: z.string().min(1).max(160),
        subjectId: z.string().min(1).max(160),
        label: z.string().min(1).max(160),
      })
      .strict()
      .optional(),
  })
  .refine(
    (value) =>
      (value.adapter ?? 'feishu-cli') === 'feishu-cli'
        ? value.appId !== undefined && value.openId !== undefined && !value.providerIdentity
        : !!value.providerIdentity && value.appId === undefined && value.openId === undefined,
    'Account identity must match its adapter',
  );
const legacyDatabaseSchema = z
  .object({
    version: z.literal(1),
    connections: z.array(connectionSchema).max(MAX_PARTNER_CONNECTOR_ACCOUNTS),
    sources: z.array(partnerRemoteSourceSchema).max(1000),
    proposals: z.array(partnerRemoteProposalSchema).max(1000),
    receipts: z.array(partnerRemoteReceiptSchema).max(1000),
    baseTasks: z.array(partnerFeishuBaseCreateTaskSchema).max(1000).default([]),
    dispatchOwners: z.record(z.string(), z.number().int().positive()),
  })
  .strict();
const databaseSchema = z
  .object({
    version: z.literal(2),
    connections: z.array(connectionSchema).max(MAX_PARTNER_CONNECTOR_ACCOUNTS),
    sources: z.array(partnerRemoteSourceSchema).max(1000),
    proposals: z.array(partnerRemoteProposalSchema).max(1000),
    receipts: z.array(partnerRemoteReceiptSchema).max(1000),
    baseTasks: z.array(partnerFeishuBaseCreateTaskSchema).max(1000).default([]),
    documentTasks: z.array(partnerNativeDocumentTaskSchema).max(1000).default([]),
    recordRevision: z.number().int().nonnegative().default(0),
    dispatchOwners: z.record(z.string(), z.number().int().positive()),
  })
  .strict();
export type ConnectorDatabase = z.infer<typeof databaseSchema>;
export type ConnectorAccount = z.infer<typeof connectionSchema>;
const MAX_BYTES = 32 * 1024 * 1024;
function writerAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function parseDatabase(value: unknown): ConnectorDatabase {
  const current = databaseSchema.safeParse(value);
  if (current.success) return current.data;
  const legacy = legacyDatabaseSchema.parse(value);
  return databaseSchema.parse({
    ...legacy,
    version: 2,
    documentTasks: [],
    recordRevision: 0,
  });
}

interface DatabaseRead {
  readonly database: ConnectorDatabase;
  readonly migrated: boolean;
}

/** Private, bounded host records. Tokens remain exclusively in the official CLI store. */
export class PartnerConnectorStore {
  private readonly file: string;
  constructor(private readonly root: string) {
    if (!path.isAbsolute(root) || path.resolve(root) === path.parse(root).root)
      throw new Error('Invalid connector data directory');
    this.file = path.join(root, 'records.json');
  }
  async read(): Promise<ConnectorDatabase> {
    const initial = await this.readUnlocked();
    if (!initial.migrated) return initial.database;
    await assertOwnedDirectory(this.root, true);
    return withFileTransactionLock(this.file, '连接器记录正在迁移，请稍后再试', async () => {
      const current = await this.readUnlocked();
      if (current.migrated) await this.writeUnlocked(current.database);
      return current.database;
    });
  }
  private async readUnlocked(): Promise<DatabaseRead> {
    try {
      await assertOwnedDirectory(this.root);
      const value: unknown = JSON.parse(
        (await readRegularFile(this.file, MAX_BYTES)).toString('utf8'),
      );
      const current = databaseSchema.safeParse(value);
      return current.success
        ? { database: current.data, migrated: false }
        : { database: parseDatabase(value), migrated: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return {
          database: {
            version: 2,
            connections: [],
            sources: [],
            proposals: [],
            receipts: [],
            baseTasks: [],
            documentTasks: [],
            recordRevision: 0,
            dispatchOwners: {},
          },
          migrated: false,
        };
      throw error;
    }
  }
  private async writeUnlocked(db: ConnectorDatabase): Promise<void> {
    const bytes = Buffer.from(JSON.stringify(databaseSchema.parse(db)));
    if (bytes.length > MAX_BYTES) throw new Error('连接器本地记录已达容量限制');
    await replaceFileWithoutFollowingAliases(this.file, bytes, '连接器记录在保存时发生变化');
  }
  async mutate<T>(operation: (db: ConnectorDatabase) => T): Promise<T> {
    await assertOwnedDirectory(this.root, true);
    return withFileTransactionLock(this.file, '连接器记录正在更新，请稍后再试', async () => {
      const { database: db } = await this.readUnlocked();
      // A dead writer might already have changed the remote document: never replay it.
      for (const proposal of db.proposals) {
        if (proposal.status !== 'submitting') continue;
        const pid = db.dispatchOwners[proposal.id];
        if (!writerAlive(pid)) {
          proposal.status = 'unknown';
          proposal.error = '上次提交中断，请到飞书核对；不会自动重试';
          proposal.updatedAt = new Date().toISOString();
          delete db.dispatchOwners[proposal.id];
        }
      }
      for (const task of db.baseTasks) {
        if (task.status !== 'preparing' && task.status !== 'submitting') continue;
        const pid = db.dispatchOwners[task.id];
        if (writerAlive(pid)) continue;
        const wasSubmitted = task.status === 'submitting';
        task.status = wasSubmitted ? 'unknown' : 'failed';
        task.error = wasSubmitted
          ? '上次创建中断，请到飞书核对；不会自动重试'
          : '上次创建尚未提交，请重新发起任务';
        task.updatedAt = new Date().toISOString();
        delete db.dispatchOwners[task.id];
      }
      for (const task of db.documentTasks) {
        if (task.status !== 'preparing' && task.status !== 'submitting') continue;
        const pid = db.dispatchOwners[task.id];
        if (writerAlive(pid)) continue;
        const wasSubmitted = task.status === 'submitting';
        task.status = wasSubmitted ? 'unknown' : 'failed';
        task.error = wasSubmitted
          ? '上次创建中断，请到对应文档平台核对；不会自动重试'
          : '上次创建尚未提交，请重新发起任务';
        task.updatedAt = new Date().toISOString();
        delete db.dispatchOwners[task.id];
      }
      const result = operation(db);
      db.recordRevision += 1;
      await this.writeUnlocked(db);
      return result;
    });
  }
  async readReconciled(): Promise<ConnectorDatabase> {
    const db = await this.read();
    return db.proposals.some(
      (p) => p.status === 'submitting' && !writerAlive(db.dispatchOwners[p.id]),
    ) ||
      db.baseTasks.some(
        (task) =>
          (task.status === 'preparing' || task.status === 'submitting') &&
          !writerAlive(db.dispatchOwners[task.id]),
      ) ||
      db.documentTasks.some(
        (task) =>
          (task.status === 'preparing' || task.status === 'submitting') &&
          !writerAlive(db.dispatchOwners[task.id]),
      )
      ? this.mutate((value) => value)
      : db;
  }
}
