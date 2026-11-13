// 提交一次数据根变更:可选地把当前根复制到新位置,然后写指针。
//
// 只在 Space 完成"安全退出"(Host 已验证停止)之后、重启之前执行。顺序固定:先复制,
// 复制成功才写指针。复制失败或中途退出都不会改指针,Space 回到旧根继续用;旧根始终只读。

import { writeDataRootPointer } from './data-root.js';

/**
 * Space 在每个数据根里各自持有的状态,不能带到新根:新根是另一个 Host 的客户端,应生成自己的身份;
 * 待恢复的输入意图按该身份寻址,换了身份就再也找不到。
 */
export const SPACE_PER_ROOT_EXCLUDES: readonly string[] = [
  'space/runtime-client-identity.json',
  'space/input-intents',
];

export interface DataRootCopyProgress {
  readonly files: number;
  readonly totalFiles: number;
  readonly bytes: number;
  readonly totalBytes: number;
}

export interface DataRootCopyOptions {
  readonly from: string;
  readonly to: string;
  readonly exclude: readonly string[];
  readonly onProgress?: (progress: DataRootCopyProgress) => void;
}

export interface DataRootCopyOutcome {
  readonly files: number;
  readonly bytes: number;
  /** 未复制的条目(每 Host / 每进程状态、排除项、链接),供诊断日志。 */
  readonly skipped: readonly { readonly path: string; readonly reason: string }[];
  /** 其中指向旧根的绝对路径已改写为新根的 JSON / JSONL 文件数。 */
  readonly rebasedFiles: number;
}

export type DataRootCopyFunction = (options: DataRootCopyOptions) => Promise<DataRootCopyOutcome>;

/**
 * SDK 的 copyKodaXDataRoot(@kodax-ai/kodax/runtime)。Space 依赖的 SDK 版本不带它时返回 null,
 * 调用方据此不提供"复制"选项,而不是在退出之后才失败。
 */
export async function loadSdkDataRootCopy(): Promise<DataRootCopyFunction | null> {
  const sdk: Record<string, unknown> = await import('@kodax-ai/kodax/runtime');
  return typeof sdk.copyKodaXDataRoot === 'function'
    ? (sdk.copyKodaXDataRoot as DataRootCopyFunction)
    : null;
}

export interface DataRootChange {
  /** 新根;null = 恢复默认(清除指针)。 */
  readonly target: string | null;
  /** 复制的源(当前根);null = 不复制。恢复默认时不复制。 */
  readonly copyFrom: string | null;
}

export async function commitDataRootChange(
  change: DataRootChange,
  deps: {
    readonly pointerFile: string;
    readonly copyRoot: DataRootCopyFunction | null;
    readonly onProgress?: (progress: DataRootCopyProgress) => void;
  },
): Promise<DataRootCopyOutcome | null> {
  let copied: DataRootCopyOutcome | null = null;
  if (change.target !== null && change.copyFrom !== null) {
    if (deps.copyRoot === null) {
      throw new Error('This KodaX SDK build cannot copy a data root.');
    }
    copied = await deps.copyRoot({
      from: change.copyFrom,
      to: change.target,
      exclude: SPACE_PER_ROOT_EXCLUDES,
      ...(deps.onProgress ? { onProgress: deps.onProgress } : {}),
    });
  }
  writeDataRootPointer(
    deps.pointerFile,
    change.target === null ? null : { version: 1, root: change.target },
  );
  return copied;
}
