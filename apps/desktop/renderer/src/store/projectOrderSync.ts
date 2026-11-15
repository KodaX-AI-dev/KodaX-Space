// 用户拖排的项目顺序存于 main 端 projects.json，dev (localhost) 与打包版 (app://) 共享；
// localStorage 按 origin 隔离，只作为旧版本数据的一次性迁移来源。

import { clearLegacyProjectOrder, readLegacyProjectOrder, useAppStore } from './appStore.js';
import { invokeWithTimeout } from '../lib/ipcInvokeWithTimeout.js';

type Bridge = NonNullable<Window['kodaxSpace']>;

/** 写入 projects.json；返回是否成功，失败由调用方提示用户。 */
export async function saveProjectOrder(bridge: Bridge, order: readonly string[]): Promise<boolean> {
  const result = await invokeWithTimeout(bridge, 'project.order.set', { order: [...order] });
  return result.ok;
}

/** 启动时采用 projects.json 的顺序；文件里还没有时，把旧 localStorage 顺序迁移过去。 */
export async function adoptSavedProjectOrder(
  bridge: Bridge,
  saved: readonly string[],
): Promise<void> {
  const legacy = readLegacyProjectOrder();
  if (saved.length > 0 || legacy.length === 0) {
    useAppStore.getState().setProjectOrder(saved);
    clearLegacyProjectOrder();
    return;
  }
  useAppStore.getState().setProjectOrder(legacy);
  // 迁移失败时保留旧值，下次启动重试。
  if (await saveProjectOrder(bridge, legacy)) clearLegacyProjectOrder();
}
