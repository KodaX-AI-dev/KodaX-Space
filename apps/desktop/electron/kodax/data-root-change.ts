// 提交一次数据根变更:可选地把当前根复制到新位置,然后写指针。
//
// 只在 Space 完成"安全退出"(Host 已验证停止)之后、重启之前执行。顺序固定:先复制,
// 复制成功才写指针。复制失败或中途退出都不会改指针,Space 回到旧根继续用;旧根始终只读。

import type {
  copyKodaXDataRoot,
  CopyKodaXDataRootProgress,
  CopyKodaXDataRootResult,
} from '@kodax-ai/kodax/runtime';
import { writeDataRootPointer } from './data-root.js';

/**
 * Space 在每个数据根里各自持有的状态,不能带到新根:新根是另一个 Host 的客户端,应生成自己的身份;
 * 待恢复的输入意图按该身份寻址,换了身份就再也找不到。
 */
export const SPACE_PER_ROOT_EXCLUDES: readonly string[] = [
  'space/runtime-client-identity.json',
  'space/input-intents',
];

export type DataRootCopyFunction = typeof copyKodaXDataRoot;

/** SDK 的 copyKodaXDataRoot(@kodax-ai/kodax/runtime)。按需加载:SDK 不在 Space 启动早期载入。 */
export const copyDataRootWithSdk: DataRootCopyFunction = async (options) =>
  (await import('@kodax-ai/kodax/runtime')).copyKodaXDataRoot(options);

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
    readonly copyRoot: DataRootCopyFunction;
    readonly onProgress?: (progress: CopyKodaXDataRootProgress) => void;
  },
): Promise<CopyKodaXDataRootResult | null> {
  let copied: CopyKodaXDataRootResult | null = null;
  if (change.target !== null && change.copyFrom !== null) {
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
