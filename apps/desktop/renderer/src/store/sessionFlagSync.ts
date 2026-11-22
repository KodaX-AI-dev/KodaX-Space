// F149: 任务置顶 / 归档标记由主进程 session-flags.json 持久化（重启保持）；unread 仍只在 renderer。
// 操作先更新界面，再写主进程；写失败时回滚并提示。规则与主进程共用 applySessionFlagChange。

import {
  applySessionFlagChange,
  type SessionFlagChange,
  type SessionFlagEntry,
} from '@kodax-space/space-ipc-schema';
import { useAppStore } from './appStore.js';
import { pushToast } from './toastStore.js';
import { invokeWithTimeout } from '../lib/ipcInvokeWithTimeout.js';

type Bridge = NonNullable<Window['kodaxSpace']>;
type PersistedFlags = Record<string, SessionFlagEntry>;

function persistedFlags(): PersistedFlags {
  const out: PersistedFlags = {};
  for (const [id, entry] of Object.entries(useAppStore.getState().sessionFlags)) {
    if (entry?.pinnedAt === undefined && entry?.archivedAt === undefined) continue;
    out[id] = {
      ...(entry.pinnedAt !== undefined ? { pinnedAt: entry.pinnedAt } : {}),
      ...(entry.archivedAt !== undefined ? { archivedAt: entry.archivedAt } : {}),
    };
  }
  return out;
}

/** 启动时读取全部置顶 / 归档标记；失败时保留当前值并返回 false。 */
export async function loadSessionFlags(bridge: Bridge): Promise<boolean> {
  const result = await invokeWithTimeout(bridge, 'session.flags.list', undefined);
  if (result.ok) useAppStore.getState().replacePersistedSessionFlags(result.data.flags);
  return result.ok;
}

/** 置顶 / 归档一个任务。failedMessage 为写入失败时的提示文案。 */
export async function changeSessionFlags(
  sessionId: string,
  change: SessionFlagChange,
  failedMessage: string,
): Promise<boolean> {
  const bridge = window.kodaxSpace;
  if (!bridge) return false;
  const { replacePersistedSessionFlags } = useAppStore.getState();
  const before = persistedFlags();
  const { [sessionId]: prev, ...others } = before;
  const next = applySessionFlagChange(prev, change, Date.now());
  replacePersistedSessionFlags(next === undefined ? others : { ...others, [sessionId]: next });

  const result = await invokeWithTimeout(bridge, 'session.flags.set', { sessionId, ...change });
  if (result.ok) {
    replacePersistedSessionFlags(result.data.flags);
    return true;
  }
  replacePersistedSessionFlags(before);
  pushToast(failedMessage, 'error');
  return false;
}

/** 切换置顶 / 归档（按当前状态取反），供菜单与行按钮使用。 */
export function toggleSessionFlagPersisted(
  sessionId: string,
  flag: 'pinned' | 'archived',
  failedMessage: string,
): Promise<boolean> {
  const entry = useAppStore.getState().sessionFlags[sessionId];
  const on = (flag === 'pinned' ? entry?.pinnedAt : entry?.archivedAt) !== undefined;
  return changeSessionFlags(sessionId, { [flag]: !on }, failedMessage);
}
