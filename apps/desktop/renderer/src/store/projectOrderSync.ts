// 项目主列表顺序存于 main 端 projects.json (F149: 完整手动顺序，main 负责补齐与新项目前插)，
// dev (localhost) 与打包版 (app://) 共享；localStorage 只作为旧版本数据的一次性迁移来源。

import { clearLegacyProjectOrder, readLegacyProjectOrder, useAppStore } from './appStore.js';
import { invokeWithTimeout } from '../lib/ipcInvokeWithTimeout.js';

type Bridge = NonNullable<Window['kodaxSpace']>;

/** 写入 projects.json；返回是否成功，失败由调用方提示用户。 */
export async function saveProjectOrder(bridge: Bridge, order: readonly string[]): Promise<boolean> {
  const result = await invokeWithTimeout(bridge, 'project.order.set', { order: [...order] });
  return result.ok;
}

/** F149: 写入置顶项目列表 (canon 路径，置顶区顺序)；返回是否成功。 */
export async function savePinnedProjects(
  bridge: Bridge,
  pinned: readonly string[],
): Promise<boolean> {
  const result = await invokeWithTimeout(bridge, 'project.pinned.set', { pinned: [...pinned] });
  return result.ok;
}

/**
 * 启动时：projects.json 还没存顺序 (savedOrder 为空) 才把旧 localStorage 顺序交给 main（缺项由 main 补齐），
 * 成功后刷新列表并清掉旧值，失败下次重试；已存顺序时文件为准，旧值直接清掉（另一 origin 的旧值不能覆盖它）。
 */
export async function migrateLegacyProjectOrder(
  bridge: Bridge,
  savedOrder: readonly string[],
): Promise<void> {
  const legacy = readLegacyProjectOrder();
  if (legacy.length === 0) return;
  if (savedOrder.length > 0) {
    clearLegacyProjectOrder();
    return;
  }
  if (!(await saveProjectOrder(bridge, legacy))) return;
  clearLegacyProjectOrder();
  const listed = await invokeWithTimeout(bridge, 'project.list', undefined);
  if (listed.ok) useAppStore.getState().setProjects(listed.data.projects);
}
