// ProjectStore — 持久化"用户最近打开的项目"到 ~/.kodax/space/projects.json。
//
// 设计：
//   - 单一文件，原子写（写 tmp → rename），防进程中途崩了损坏 JSON
//   - 内存缓存 + write-through——读频率远高于写
//   - 不存绝对路径以外的任何元数据（不缓存 git status / file count 等可变状态）
//   - schema 损坏时不抛错，回滚到空列表 + 旁路 log

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { canonProjectRoot } from '@kodax-space/space-ipc-schema';
import { validateProjectRoot, truncateForError } from '../ipc/validate.js';
import { getSpaceDataDir } from '../kodax/data-paths.js';
import { replaceFileWithoutFollowingAliases } from '../kodax/atomic-file.js';

const IS_WIN = process.platform === 'win32';

// 注：与 KodaX CLI 共享 ~/.kodax 根，但 Space 自己的目录是 ~/.kodax/space/。
// 与 KodaX session JSONL 完全隔离，避免一方误删另一方文件。
// OC-12 测试模式 (KODAX_TEST_ONBOARDING) 下 getSpaceDataDir() 返 tmpdir 隔离目录。
const SPACE_DATA_DIR = getSpaceDataDir();
const PROJECTS_FILE = path.join(SPACE_DATA_DIR, 'projects.json');

/** 与 IPC schema 的 projectOrderSchema 上限一致；远大于实际项目数，只为挡住畸形文件。*/
const PROJECT_ORDER_MAX = 4096;

const fileSchema = z.object({
  version: z.literal(1),
  projects: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      addedAt: z.number().int().nonnegative(),
      lastUsedAt: z.number().int().nonnegative(),
      /** F043: 归档项目默认在 LeftSidebar 隐藏。omit when false (清洁序列化)。 */
      archived: z.boolean().optional(),
    }),
  ),
  /** F149: 项目主列表的完整手动顺序 (canonProjectRoot 路径)。缺省 / 缺项按 addedAt 新→旧补在最前。
   *  放在 main 端文件而非 localStorage：dev (localhost) 与打包版 (app://) 的 localStorage 不互通。 */
  order: z.array(z.string().min(1).max(4096)).max(PROJECT_ORDER_MAX).optional(),
  /** F149: 置顶项目 (canon 路径)，同时是置顶区内的顺序。不改 order：取消置顶即回原位。 */
  pinned: z.array(z.string().min(1).max(4096)).max(PROJECT_ORDER_MAX).optional(),
});

export type Project = z.infer<typeof fileSchema>['projects'][number];

const canon = (p: string): string => canonProjectRoot(p, IS_WIN);

/**
 * F149: 项目主列表 = 一条手动顺序。saved 里没有的项目（新加入 / 旧文件 / 外部编辑）
 * 按 addedAt 新→旧排在最前；saved 里已不存在的路径丢掉。
 */
export function normalizeProjectOrder(
  projects: readonly Project[],
  saved: readonly string[],
): string[] {
  const present = new Set(projects.map((p) => canon(p.path)));
  const kept = [...new Set(saved)].filter((c) => present.has(c));
  const keptSet = new Set(kept);
  const missing = projects
    .filter((p) => !keptSet.has(canon(p.path)))
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((p) => canon(p.path));
  return [...new Set(missing), ...kept];
}

/** F149: 置顶只保留仍在列表、未归档的项目，各一次（归档 / 移除即取消置顶）。*/
function normalizePinnedProjects(projects: readonly Project[], saved: readonly string[]): string[] {
  const pinnable = new Set(projects.filter((p) => p.archived !== true).map((p) => canon(p.path)));
  return [...new Set(saved)].filter((c) => pinnable.has(c));
}

function sortByOrder(projects: readonly Project[], order: readonly string[]): Project[] {
  const idx = new Map(order.map((c, i) => [c, i] as const));
  const rank = (p: Project): number => idx.get(canon(p.path)) ?? -1;
  return [...projects].sort((a, b) => rank(a) - rank(b));
}

export class ProjectStore {
  private cached: Project[] | null = null;
  private cachedOrder: string[] = [];
  private cachedPinned: string[] = [];
  /** projects.json 是否已存有 order（升级前的旧文件没有，第一次写入后才有）。*/
  private orderSaved = false;
  private writeLock: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string = PROJECTS_FILE,
    private readonly dir: string = SPACE_DATA_DIR,
  ) {}

  async list(): Promise<Project[]> {
    if (this.cached) return [...this.cached];
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = fileSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        console.warn(
          `[ProjectStore] ${this.filePath} schema invalid, starting empty:`,
          parsed.error.issues.map((i) => i.path.join('.')).join(', '),
        );
        this.cached = [];
      } else {
        // 文件可能被外部（别的进程 / 攻击者 / 手工编辑）写入畸形 path——
        // schema 只确保字符串；不验证语义。这里再过一遍 validateProjectRoot 把
        // 非绝对 / 含 .. / 含 NUL 的条目 drop 掉。filename basename 是显示用的，
        // 不影响实际打开行为（实际打开走 IPC 边界还会再 validate 一次）。
        const valid = parsed.data.projects.filter((p) => {
          try {
            validateProjectRoot(p.path);
            return true;
          } catch (err) {
            console.warn(
              `[ProjectStore] dropping invalid entry: ${err instanceof Error ? err.message : String(err)}`,
            );
            return false;
          }
        });
        this.cachedPinned = parsed.data.pinned ?? [];
        this.orderSaved = parsed.data.order !== undefined;
        this.cached = this.orderedList(valid, parsed.data.order ?? []);
      }
    } catch (err) {
      // ENOENT = 首次启动；其他错误也按"启动空列表"处理，写新文件时会覆盖
      if (!(err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT')) {
        console.warn(
          '[ProjectStore] read failed, starting empty:',
          err instanceof Error ? err.message : String(err),
        );
      }
      this.cached = [];
    }
    return [...this.cached];
  }

  /**
   * F005 v0.1.5：**allowlist 版**的 projectRoot 校验 — 用户必须显式打开过该路径才放行。
   *
   * 流程：
   *   1. validateProjectRoot 做 shape 检查（绝对路径 / no '..' / no NUL）
   *   2. 规范化后跟 store 里每条项目做 canonProjectRoot 比较（Windows 大小写 + 分隔符兼容）
   *   3. 找不到 → throw，让 registerChannel 转 HANDLER_ERROR envelope
   *
   * 用于所有"基于 projectRoot 起 child_process / 读文件 / 列目录"的 IPC handler：
   *   - project.gitStats / gitStatus / gitChanges / gitDiff （spawn git）
   *   - project.fileSearch（递归 readdir）
   *   - files.tree / files.read（目录 + 文件读取）
   *   - session.list 的 projectRoot filter
   *
   * 不用：project.recent.add / remove 这种"操作 allowlist 自身"的 handler。
   *
   * 跟 validateProjectRoot 的边界差异：renderer 即便发了合法绝对路径（如 /etc），
   * 没在 allowlist 里就是拒绝 — 阻断 renderer compromise / dev-console 滥用面。
   *
   * @returns normalized 安全路径
   * @throws Error 含原文 truncate 的 prefix（不带完整 path，免日志泄露）
   */
  async assertAllowed(input: string): Promise<string> {
    const normalized = validateProjectRoot(input);
    const targetCanon = canonProjectRoot(normalized, IS_WIN);
    const projects = await this.list();
    const isAllowed = projects.some((p) => canonProjectRoot(p.path, IS_WIN) === targetCanon);
    if (!isAllowed) {
      throw new Error(`projectRoot not in recent projects allowlist: ${truncateForError(input)}`);
    }
    return normalized;
  }

  /**
   * 加入或刷新最近项目。已存在的 path 只更新 lastUsedAt，不改 addedAt / name。
   * 返回更新后的 Project 对象。
   */
  async addOrBump(absPath: string): Promise<Project> {
    return this.mutate((list) => {
      const now = Date.now();
      const existingIdx = list.findIndex((p) => p.path === absPath);
      if (existingIdx >= 0) {
        const project: Project = { ...list[existingIdx], lastUsedAt: now };
        list[existingIdx] = project;
        return { list, ret: project };
      }
      const project: Project = {
        path: absPath,
        name: path.basename(absPath) || absPath,
        addedAt: now,
        lastUsedAt: now,
      };
      list.unshift(project);
      return { list, ret: project };
    });
  }

  async remove(absPath: string): Promise<boolean> {
    return this.mutate((list) => {
      const before = list.length;
      const next = list.filter((p) => p.path !== absPath);
      if (next.length === before) return { list, ret: false };
      return { list: next, ret: true };
    });
  }

  /** F043: 改 displayName (`project.name`)。不影响文件夹。
   *  返回 false 表示该 path 不在 store（不存在或已被 remove）。*/
  async rename(absPath: string, name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (trimmed.length === 0) return false;
    return this.mutate((list) => {
      const idx = list.findIndex((p) => p.path === absPath);
      if (idx < 0) return { list, ret: false };
      // 不可变 spread — 项目内 immutability 风格
      const next = [...list];
      next[idx] = { ...next[idx]!, name: trimmed };
      return { list: next, ret: true };
    });
  }

  /** F043: 切归档。归档后 LeftSidebar 默认隐藏，仍可显式 toggle 显示。*/
  async setArchived(absPath: string, archived: boolean): Promise<boolean> {
    return this.mutate((list) => {
      const idx = list.findIndex((p) => p.path === absPath);
      if (idx < 0) return { list, ret: false };
      const next = [...list];
      // archived=false 时 omit 字段 (跟"从来没归档过的项目"序列化一致，文件干净)
      const prev = next[idx]!;
      next[idx] = archived
        ? { ...prev, archived: true }
        : { path: prev.path, name: prev.name, addedAt: prev.addedAt, lastUsedAt: prev.lastUsedAt };
      return { list: next, ret: true };
    });
  }

  /** 主列表顺序（canon 路径），覆盖全部项目（含已归档）。*/
  async order(): Promise<string[]> {
    await this.list();
    return [...this.cachedOrder];
  }

  /** projects.json 是否已存有主列表顺序；没有时 renderer 才迁移旧 localStorage 顺序。*/
  async hasSavedOrder(): Promise<boolean> {
    await this.list();
    return this.orderSaved;
  }

  /** 替换主列表顺序。renderer 拖排时发送完整顺序；缺项按 normalizeProjectOrder 补齐。*/
  async setOrder(order: readonly string[]): Promise<void> {
    await this.mutate((list) => {
      this.cachedOrder = [...order];
      return { list, ret: undefined };
    });
  }

  /** F149: 置顶项目 (canon 路径)，按置顶区顺序。*/
  async pinned(): Promise<string[]> {
    await this.list();
    return [...this.cachedPinned];
  }

  /** 替换置顶列表（置顶 / 取消置顶 / 置顶区拖排都发完整列表）。*/
  async setPinned(pinned: readonly string[]): Promise<void> {
    await this.mutate((list) => {
      this.cachedPinned = [...pinned];
      return { list, ret: undefined };
    });
  }

  /** 规范化主列表顺序与置顶列表，返回按顺序排好的项目。*/
  private orderedList(list: readonly Project[], saved: readonly string[]): Project[] {
    this.cachedOrder = normalizeProjectOrder(list, saved);
    this.cachedPinned = normalizePinnedProjects(list, this.cachedPinned);
    return sortByOrder(list, this.cachedOrder);
  }

  /** 测试用：丢内存 cache 强制下次 list 重新读盘。*/
  invalidate(): void {
    this.cached = null;
    this.cachedOrder = [];
    this.cachedPinned = [];
    this.orderSaved = false;
  }

  /**
   * 串行化"读-改-写"。两个并发 caller 必须按 enqueue 顺序拿到最新 cache 再修改，
   * 不能各自 snapshot 然后最后写的赢——那样会丢前面的写。
   *
   * 实现：把整个"读 cache + apply mutation + persist"塞进同一个 lock，
   * lock 用 promise 链。每个调用排到链尾，wait 前一个完成后再跑。
   */
  private async mutate<R>(apply: (list: Project[]) => { list: Project[]; ret: R }): Promise<R> {
    const prev = this.writeLock;
    let release: () => void = () => {};
    this.writeLock = new Promise((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      const current = await this.list();
      const { list, ret } = apply([...current]); // copy 防 mutation 泄露
      this.cached = this.orderedList(list, this.cachedOrder);
      await this.persistLocked(this.cached);
      this.orderSaved = true;
      return ret;
    } finally {
      release();
    }
  }

  /** 已经持锁的写入。**不**自己再持锁——只能从 mutate() 调。*/
  private async persistLocked(list: Project[]): Promise<void> {
    // mode 0o700 / 0o600：projects.json 含用户项目路径，可能泄露 proprietary 代码名等。
    // Windows 忽略 mode，POSIX 强制 user-only。
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const payload = JSON.stringify(
      { version: 1, projects: list, order: this.cachedOrder, pinned: this.cachedPinned },
      null,
      2,
    );
    await replaceFileWithoutFollowingAliases(
      this.filePath,
      Buffer.from(payload, 'utf8'),
      'projects registry changed during atomic replacement',
    );
  }
}

// 单例。main 端各 handler 通过 import 这个实例操作。
// 测试时也可以 new ProjectStore(tmpPath) 用独立路径，但建议直接复用单例 + invalidate()。
export const projectStore = new ProjectStore();

/** 测试用：可注入自定义路径的 store。*/
export function createProjectStore(filePath: string, dir: string): ProjectStore {
  return new ProjectStore(filePath, dir);
}
