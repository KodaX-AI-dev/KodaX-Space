// 数据根解析 —— 优先级:测试模式 > 设置项(指针文件) > KODAX_HOME 环境变量 > ~/.kodax
//
// 设置项存放在**数据根之外**的一个小指针文件(Electron appData 下),因为 settings.json 本身
// 就在数据根里,读它之前得先知道根在哪。指针只存一个绝对路径。
//
// 本模块不依赖 Electron,只做:读/写指针、探测目录是否可用、按优先级给出结论。
// 把结论落到 process.env.KODAX_HOME 的是 data-root-bootstrap.ts(必须在所有 store 模块之前执行)。

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    const record = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const root = typeof record.root === 'string' ? absoluteDir(record.root) : null;
    if (record.version !== 1 || root === null) {
      return { pointer: null, error: 'Data root pointer has an unsupported version or a non-absolute root.' };
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
    return { source: fallback, settingRoot: null, envRoot, problem: { root: pointer.root, reason }, pointerError: null };
  }
  return { source: 'setting', settingRoot: pointer.root, envRoot, problem: null, pointerError: null };
}
