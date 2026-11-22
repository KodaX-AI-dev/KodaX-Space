// F149: 任务置顶 / 归档标记的规则。主进程持久化时与 renderer 乐观更新时共用，避免两端漂移。
//
// 规则：归档即取消置顶；已归档的任务不能置顶；取消归档不恢复置顶；重复置顶 / 归档保留原时间。

export interface SessionFlagEntry {
  readonly pinnedAt?: number;
  readonly archivedAt?: number;
}

export interface SessionFlagChange {
  readonly pinned?: boolean;
  readonly archived?: boolean;
}

/** 把一次修改应用到单个任务；返回 undefined 表示没有任何标记。 */
export function applySessionFlagChange(
  prev: SessionFlagEntry | undefined,
  change: SessionFlagChange,
  now: number,
): SessionFlagEntry | undefined {
  let archivedAt = prev?.archivedAt;
  let pinnedAt = prev?.pinnedAt;
  if (change.archived === true) archivedAt = archivedAt ?? now;
  if (change.archived === false) archivedAt = undefined;
  if (change.pinned === true && archivedAt === undefined) pinnedAt = pinnedAt ?? now;
  if (change.pinned === false || archivedAt !== undefined) pinnedAt = undefined;
  if (archivedAt === undefined && pinnedAt === undefined) return undefined;
  return {
    ...(pinnedAt !== undefined ? { pinnedAt } : {}),
    ...(archivedAt !== undefined ? { archivedAt } : {}),
  };
}
