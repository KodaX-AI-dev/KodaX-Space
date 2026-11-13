// 数据根解析 —— 优先级:测试模式 > 设置项(指针文件) > KODAX_HOME 环境变量 > ~/.kodax
//
// 设置项存放在**数据根之外**的一个小指针文件(Electron appData 下),因为 settings.json 本身
// 就在数据根里,读它之前得先知道根在哪。指针只存一个绝对路径。
//
// 本模块不依赖 Electron,只做:读/写指针、探测目录是否可用、按优先级给出结论。
// 把结论落到 process.env.KODAX_HOME 的是 data-root-bootstrap.ts(必须在所有 store 模块之前执行)。

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { absoluteDir } from './data-paths.js';

export type DataRootSource = 'test' | 'setting' | 'env' | 'default';

export interface DataRootPointer {
  readonly version: 1;
  readonly root: string;
}

export interface DataRootProblem {
  readonly root: string;
  readonly reason: string;
}

export interface ResolvedDataRoot {
  readonly source: DataRootSource;
  /** 可用的设置项根;source !== 'setting' 时为 null。 */
  readonly settingRoot: string | null;
  /** 环境变量里的有效绝对路径(KODAX_HOME,其次已弃用的 KODAX_PROFILE_DIR),用于冲突提示。 */
  readonly envRoot: string | null;
  /** 设置项指向的目录不可用(目录缺失、不可写等);本次回落,指针保持不变。 */
  readonly problem: DataRootProblem | null;
  /** 指针文件损坏或内容非法;本次回落并忽略它。 */
  readonly pointerError: string | null;
}

export interface PointerReadResult {
  readonly pointer: DataRootPointer | null;
  readonly error: string | null;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function readDataRootPointer(file: string): PointerReadResult {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { pointer: null, error: null };
    return { pointer: null, error: describe(error) };
  }
  try {
    const value: unknown = JSON.parse(text);
    const record =
      value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const root = typeof record.root === 'string' ? absoluteDir(record.root) : null;
    if (record.version !== 1 || root === null) {
      return {
        pointer: null,
        error: 'Data root pointer has an unsupported version or a non-absolute root.',
      };
    }
    return { pointer: { version: 1, root }, error: null };
  } catch (error) {
    return { pointer: null, error: describe(error) };
  }
}

/** 写入指针(原子:临时文件 + rename);传 null 删除指针,即恢复默认位置。 */
export function writeDataRootPointer(file: string, pointer: DataRootPointer | null): void {
  if (pointer === null) {
    rmSync(file, { force: true });
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(pointer)}\n`, { mode: 0o600 });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/**
 * 目录是否可作数据根:存在、是目录、可写。返回 null 表示可用,否则返回原因。
 * create=false 用于启动:目录缺失(例如移动硬盘被拔)不能被静默新建。
 * create=true 只用于用户在设置里主动选择新位置时。
 */
export function probeDataRoot(root: string, options: { readonly create: boolean }): string | null {
  try {
    if (options.create) mkdirSync(root, { recursive: true });
    if (!statSync(root).isDirectory()) return 'The path is not a directory.';
    const probe = path.join(root, `.space-write-probe-${process.pid}`);
    writeFileSync(probe, '');
    rmSync(probe, { force: true });
    return null;
  } catch (error) {
    return describe(error);
  }
}

export function resolveDataRoot(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly pointerFile: string;
}): ResolvedDataRoot {
  if (input.env.KODAX_TEST_ONBOARDING) {
    return { source: 'test', settingRoot: null, envRoot: null, problem: null, pointerError: null };
  }
  const envRoot = absoluteDir(input.env.KODAX_HOME) ?? absoluteDir(input.env.KODAX_PROFILE_DIR);
  const fallback = envRoot !== null ? 'env' : 'default';
  const { pointer, error } = readDataRootPointer(input.pointerFile);
  if (pointer === null) {
    return { source: fallback, settingRoot: null, envRoot, problem: null, pointerError: error };
  }
  const reason = probeDataRoot(pointer.root, { create: false });
  if (reason !== null) {
    return {
      source: fallback,
      settingRoot: null,
      envRoot,
      problem: { root: pointer.root, reason },
      pointerError: null,
    };
  }
  return {
    source: 'setting',
    settingRoot: pointer.root,
    envRoot,
    problem: null,
    pointerError: null,
  };
}

export type DataRootCandidateResult =
  | { readonly ok: true; readonly root: string; readonly hasData: boolean }
  | {
      readonly ok: false;
      readonly reason:
        | 'not_absolute'
        | 'same'
        | 'nested'
        | 'network'
        | 'unusable'
        | 'unrecognized'
        | 'incomplete_copy';
      readonly detail?: string;
    };

function isSameOrInside(parent: string, child: string): boolean {
  const fold = (value: string): string =>
    process.platform === 'win32' || process.platform === 'darwin' ? value.toLowerCase() : value;
  const relative = path.relative(fold(parent), fold(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** 解析链接/联接后的真实路径;路径还不存在时只能按字面比较。 */
function canonical(target: string): string {
  try {
    return realpathSync.native(target);
  } catch {
    return target;
  }
}

/** Windows 网络位置(UNC)。SQLite WAL 与文件锁在网络共享上不可靠,不可达时还会卡住启动。 */
function isNetworkPath(root: string): boolean {
  if (process.platform !== 'win32') return false;
  const p = root.replaceAll('/', '\\').toLowerCase();
  if (p.startsWith('\\\\?\\unc\\')) return true;
  // \\?\C:\ 与 \\.\ 是本机长路径/设备前缀,不是网络位置。
  return p.startsWith('\\\\') && !p.startsWith('\\\\?\\') && !p.startsWith('\\\\.\\');
}

/** 新建文件夹或磁盘根目录里的系统文件,不算"已有内容"。与 SDK copyKodaXDataRoot 的清单一致。 */
const HOUSEKEEPING_ENTRIES = new Set([
  '.ds_store',
  'desktop.ini',
  'thumbs.db',
  'lost+found',
  '$recycle.bin',
  'system volume information',
  '.spotlight-v100',
  '.fseventsd',
  '.trashes',
  '.temporaryitems',
]);

/**
 * SDK 复制期间留在目标里的标记(KODAX_DATA_ROOT_COPY_MARKER)。此处不能 import SDK:
 * 本模块在 SDK 加载前运行。带标记的目录是中断的复制,既不能按原样使用也不算空。
 */
const COPY_MARKER = '.kodax-copy-incomplete';

/**
 * 用户在设置里选的新数据位置能否采用。必须是绝对路径、可写、不同于也不嵌套于当前根(复制迁移
 * 需要两个互不包含的目录),且要么为空要么已是 KodaX 数据目录(含 space 或 sessions),免得把
 * 数据撒进 Documents 之类的普通文件夹。不在这里新建目录。
 */
export function validateDataRootCandidate(
  candidate: string,
  currentRoot: string,
): DataRootCandidateResult {
  const root = absoluteDir(candidate);
  if (root === null) return { ok: false, reason: 'not_absolute' };
  if (isNetworkPath(root)) return { ok: false, reason: 'network' };
  const real = canonical(root);
  const current = canonical(currentRoot);
  if (isSameOrInside(current, real) && isSameOrInside(real, current)) {
    return { ok: false, reason: 'same' };
  }
  if (isSameOrInside(current, real) || isSameOrInside(real, current)) {
    return { ok: false, reason: 'nested' };
  }
  const unusable = probeDataRoot(root, { create: false });
  if (unusable !== null) return { ok: false, reason: 'unusable', detail: unusable };
  let entries: string[];
  try {
    entries = readdirSync(root).filter((name) => !HOUSEKEEPING_ENTRIES.has(name.toLowerCase()));
  } catch (error) {
    return { ok: false, reason: 'unusable', detail: describe(error) };
  }
  if (entries.includes(COPY_MARKER)) return { ok: false, reason: 'incomplete_copy' };
  if (entries.length > 0 && !entries.includes('space') && !entries.includes('sessions')) {
    return { ok: false, reason: 'unrecognized' };
  }
  // hasData: 已是 KodaX 数据目录,按原样使用,不能再作为复制目标(复制要求目标为空)。
  return { ok: true, root, hasData: entries.length > 0 };
}

/**
 * 设置项生效时 Space 覆盖 KODAX_HOME,而重启、更新安装器、子进程都会继承这个环境。
 * 用这个标记记下"覆盖前的用户值 + 覆盖后的值",下一个 Space 进程据此还原用户值,
 * 否则"恢复默认"后重启会把旧的设置位置当成环境变量继续使用。
 */
export const KODAX_HOME_OVERRIDE_ENV = 'KODAX_SPACE_HOME_OVERRIDE';

type EnvRecord = Readonly<Record<string, string | undefined>>;

/** 标记值:覆盖前的用户 KODAX_HOME(未设为 null)与覆盖后的值。 */
export function kodaxHomeOverrideMark(original: string | undefined, applied: string): string {
  return JSON.stringify({ original: original ?? null, applied });
}

/** 用户自己的 KODAX_HOME:若当前值正是上一个 Space 进程注入的,还原为注入前的值。 */
export function userKodaxHome(env: EnvRecord): string | undefined {
  const raw = env[KODAX_HOME_OVERRIDE_ENV];
  if (raw === undefined) return env.KODAX_HOME;
  let mark: { original?: unknown; applied?: unknown };
  try {
    mark = JSON.parse(raw) as { original?: unknown; applied?: unknown };
  } catch {
    // 不是 Space 写的标记(或被改坏):无从还原,按可见的值处理。
    return env.KODAX_HOME;
  }
  if (typeof mark.applied !== 'string' || mark.applied !== env.KODAX_HOME) return env.KODAX_HOME;
  return typeof mark.original === 'string' ? mark.original : undefined;
}
