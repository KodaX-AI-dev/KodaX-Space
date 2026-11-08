// Session lineage popover — F016 (v0.1.2)
//
// 展示一个 session 在 fork tree 里的位置：root 祖先 + 所有兄弟 / 子孙。
// 数据源：renderer store 里的 sessions[]，每条带 parentSessionId + forkPointTurnIdx。
// FEATURE_033 in-memory fork 已经在 schema 里塞了这两个字段（SDK 0.7.42 持久化后
// 仍是相同形状，无需改本组件）。
//
// 触发：SessionMenu 加 "Lineage" 行 → 点击展开本 popover。
// 行为：
//   - 树形列表，按 fork 深度缩进
//   - 每行显示 title + 'fork @ turn N' 角标
//   - 点击非当前 session → setCurrentSession 切过去
//   - 单 session 树（无 parent / 无 child）时显示空态文案
//
// 设计：在 SessionMenu 内联渲染（小型 popover），不抢全屏。Esc / 点击外部关闭。

import { useMemo } from 'react';
import type { SessionMeta as SessionMetaT } from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../../store/appStore.js';
import { useI18n } from '../../i18n/I18nProvider.js';

interface SessionLineagePanelProps {
  /** 入口 session — 通常是 SessionMenu 上下文里那条。从它向上找 root，再向下展开整树。*/
  readonly anchorSessionId: string;
  readonly onPickSession: (sessionId: string) => void;
}

interface TreeNode {
  readonly session: SessionMetaT;
  readonly depth: number;
  readonly children: TreeNode[];
}

/**
 * 从 anchor 向上找到 root，再 BFS 向下展开整棵 fork tree。
 * 返回 root 节点 + 一份 depth-stamped 数组（便于直接 map 渲染）。
 */
function buildLineageTree(sessions: readonly SessionMetaT[], anchorId: string): TreeNode | null {
  const byId = new Map<string, SessionMetaT>();
  for (const s of sessions) byId.set(s.sessionId, s);

  // 向上找 root —— 防 cycle 用步数上限，恶意伪造 parentSessionId 不能死循环
  let rootId = anchorId;
  let safety = 100;
  while (safety-- > 0) {
    const cur = byId.get(rootId);
    if (!cur || !cur.parentSessionId) break;
    rootId = cur.parentSessionId;
  }
  const root = byId.get(rootId);
  if (!root) return null;

  // 构儿子索引
  const childrenOf = new Map<string, SessionMetaT[]>();
  for (const s of sessions) {
    if (s.parentSessionId) {
      const list = childrenOf.get(s.parentSessionId) ?? [];
      list.push(s);
      childrenOf.set(s.parentSessionId, list);
    }
  }
  // 子按 forkPointTurnIdx 升序排，相同 turn 时按 createdAt 升序
  for (const list of childrenOf.values()) {
    list.sort((a, b) => {
      const at = a.forkPointTurnIdx ?? 0;
      const bt = b.forkPointTurnIdx ?? 0;
      if (at !== bt) return at - bt;
      return a.createdAt - b.createdAt;
    });
  }

  function buildSubtree(s: SessionMetaT, depth: number): TreeNode {
    const kids = (childrenOf.get(s.sessionId) ?? []).map((c) => buildSubtree(c, depth + 1));
    return { session: s, depth, children: kids };
  }
  return buildSubtree(root, 0);
}

/**
 * 把 tree 拍平成 DFS 顺序的数组（preorder），方便直接 .map 渲染。
 */
function flattenTree(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  const stack: TreeNode[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    out.push(cur);
    // 倒序 push 让 DFS 顺序与孩子顺序一致
    for (let i = cur.children.length - 1; i >= 0; i--) stack.push(cur.children[i]);
  }
  return out;
}

export function SessionLineagePanel({
  anchorSessionId,
  onPickSession,
}: SessionLineagePanelProps): JSX.Element {
  const { t } = useI18n();
  const sessions = useAppStore((s) => s.sessions);
  const currentSessionId = useAppStore((s) => s.currentSessionId);

  const flatTree = useMemo<readonly TreeNode[]>(() => {
    const root = buildLineageTree(sessions, anchorSessionId);
    return root ? flattenTree(root) : EMPTY;
  }, [sessions, anchorSessionId]);

  // 单 session 树（没人 fork、也不是 fork 出来的）→ 没什么可看
  if (flatTree.length <= 1) {
    return <div className="px-3 py-2 text-xs text-fg-muted italic">{t('lineage.noLineage')}</div>;
  }

  return (
    <div className="py-1 max-h-72 overflow-y-auto">
      <div className="px-3 py-1 text-[11px] uppercase tracking-wider text-fg-muted flex items-center justify-between">
        <span>{t('lineage.header', { count: flatTree.length })}</span>
        <span className="font-mono normal-case tracking-normal dark:text-fg-faint text-fg-muted">
          ⑂ {t('lineage.fork')}
        </span>
      </div>
      {flatTree.map((node) => {
        const s = node.session;
        const isCurrent = s.sessionId === currentSessionId;
        const isAnchor = s.sessionId === anchorSessionId;
        const title = s.title ?? t('breadcrumb.untitledSession');
        return (
          <button
            key={s.sessionId}
            type="button"
            onClick={() => onPickSession(s.sessionId)}
            disabled={isCurrent}
            className={[
              'w-full text-left px-3 py-1 flex items-center gap-2 text-xs',
              'hover:bg-hover-bg',
              isCurrent ? 'bg-info/15 text-info cursor-default' : 'text-fg-secondary',
            ].join(' ')}
            title={
              isCurrent
                ? t('lineage.currentTitle', { sessionId: s.sessionId })
                : t('lineage.switchTitle', { sessionId: s.sessionId })
            }
          >
            <span
              className="font-mono dark:text-fg-faint text-fg-muted flex-shrink-0"
              aria-hidden
              style={{ paddingLeft: `${node.depth * 12}px` }}
            >
              {node.depth === 0 ? '●' : '└'}
            </span>
            <span className="truncate flex-1">{title}</span>
            {s.forkPointTurnIdx !== undefined && (
              <span className="text-[9px] text-fg-muted font-mono flex-shrink-0">
                {t('lineage.turn', { turn: s.forkPointTurnIdx + 1 })}
              </span>
            )}
            {isAnchor && !isCurrent && (
              <span className="text-[9px] dark:text-fg-faint text-fg-muted">
                {t('lineage.anchor')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const EMPTY: readonly TreeNode[] = [];
