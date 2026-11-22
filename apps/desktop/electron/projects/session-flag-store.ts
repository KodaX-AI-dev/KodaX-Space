// SessionFlagStore — F149: 任务的置顶 / 归档标记，持久化到 ~/.kodax/space/session-flags.json。
//
// Space 自己的侧栏状态，不走 SDK archiveSession（那会把任务移出默认列表）。
// 规则见 space-ipc-schema 的 applySessionFlagChange（renderer 乐观更新共用）。
// 读失败 / schema 损坏时按空表启动并 warn（main 的 console 进结构化日志），写入原子替换。

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  applySessionFlagChange,
  type SessionFlagChange,
  type SessionFlagEntry,
} from '@kodax-space/space-ipc-schema';
import { getSpaceDataDir } from '../kodax/data-paths.js';
import { replaceFileWithoutFollowingAliases } from '../kodax/atomic-file.js';

const SPACE_DATA_DIR = getSpaceDataDir();
const FLAGS_FILE = path.join(SPACE_DATA_DIR, 'session-flags.json');

const entrySchema = z.object({
  pinnedAt: z.number().int().positive().optional(),
  archivedAt: z.number().int().positive().optional(),
});
const fileSchema = z.object({
  version: z.literal(1),
  sessions: z.record(z.string().min(1), entrySchema),
});

export type SessionFlagMap = Record<string, SessionFlagEntry>;

export class SessionFlagStore {
  private cached: SessionFlagMap | null = null;
  private writeLock: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string = FLAGS_FILE,
    private readonly dir: string = SPACE_DATA_DIR,
  ) {}

  async list(): Promise<SessionFlagMap> {
    if (this.cached === null) this.cached = await this.read();
    return { ...this.cached };
  }

  async set(sessionId: string, change: SessionFlagChange): Promise<SessionFlagMap> {
    return this.mutate((flags) => {
      const next = applySessionFlagChange(flags[sessionId], change, Date.now());
      if (next === undefined) delete flags[sessionId];
      else flags[sessionId] = next;
    });
  }

  /** 删除任务时清掉它的标记；没有标记时不写盘。 */
  async remove(sessionId: string): Promise<void> {
    if ((await this.list())[sessionId] === undefined) return;
    await this.mutate((flags) => {
      delete flags[sessionId];
    });
  }

  private async read(): Promise<SessionFlagMap> {
    try {
      const parsed = fileSchema.safeParse(JSON.parse(await fs.readFile(this.filePath, 'utf-8')));
      if (parsed.success) return parsed.data.sessions;
      console.warn(`[SessionFlagStore] ${this.filePath} schema invalid, starting empty`);
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? (err as { code: string }).code : '';
      if (code !== 'ENOENT') {
        console.warn(
          '[SessionFlagStore] read failed, starting empty:',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    return {};
  }

  /** 串行化"读-改-写"，与 ProjectStore 同模式。 */
  private async mutate(apply: (flags: SessionFlagMap) => void): Promise<SessionFlagMap> {
    const prev = this.writeLock;
    let release: () => void = () => {};
    this.writeLock = new Promise((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      const flags = await this.list();
      apply(flags);
      await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
      const payload = JSON.stringify({ version: 1, sessions: flags }, null, 2);
      await replaceFileWithoutFollowingAliases(
        this.filePath,
        Buffer.from(payload, 'utf8'),
        'session flags changed during atomic replacement',
      );
      this.cached = flags;
      return { ...flags };
    } finally {
      release();
    }
  }
}

export const sessionFlagStore = new SessionFlagStore();

/** 测试用：可注入自定义路径的 store。*/
export function createSessionFlagStore(filePath: string, dir: string): SessionFlagStore {
  return new SessionFlagStore(filePath, dir);
}
