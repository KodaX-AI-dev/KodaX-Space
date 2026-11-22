// F149: 置顶区必须显示全部置顶任务。每个项目只加载最近 200 条，窗口外的置顶任务
// 用 session.list { sessionIds } 按 id 补齐；结果留在置顶区本地，不进 store.sessions
// （项目重新加载会整体替换该项目的 session，补进去的会被冲掉）。
// 每个 id 每个工作面只请求一次；调用方按工作面 key 组件以重置。

import { useEffect, useRef, useState } from 'react';
import type { SessionMeta, Surface } from '@kodax-space/space-ipc-schema';

export function usePinnedSessionsOutsideWindow(
  pinnedIds: readonly string[],
  loadedIds: ReadonlySet<string>,
  surface: Surface,
): readonly SessionMeta[] {
  const [fetched, setFetched] = useState<readonly SessionMeta[]>([]);
  const requested = useRef(new Set<string>());
  const missingKey = pinnedIds
    .filter((id) => !loadedIds.has(id) && !requested.current.has(id))
    .sort()
    .join('\n');

  useEffect(() => {
    const bridge = window.kodaxSpace;
    if (!bridge || missingKey === '') return;
    const ids = missingKey.split('\n');
    for (const id of ids) requested.current.add(id);
    const forget = (reason: string): void => {
      for (const id of ids) requested.current.delete(id);
      console.warn('[PinnedTasks] pinned task lookup failed:', reason);
    };
    bridge
      .invoke('session.list', { surface, sessionIds: ids })
      .then((result) => {
        if (!result.ok) return forget(result.error.message);
        setFetched((prev) => [
          ...prev.filter((s) => !ids.includes(s.sessionId)),
          ...result.data.sessions,
        ]);
      })
      .catch((err: unknown) => forget(err instanceof Error ? err.message : String(err)));
  }, [missingKey, surface]);

  return fetched;
}
