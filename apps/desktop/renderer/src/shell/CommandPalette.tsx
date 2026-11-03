// CommandPalette — F026 全局命令面板
//
// 触发: ⌘Shift+P (macOS) / Ctrl+Shift+P (Win/Linux) — VS Code 同款 muscle memory
// 关闭: Esc / 点 backdrop / Enter 选中后 / blur 外面 input
//
// (注：原 plan 是 ⌘K，但 F018 Quick Ask 已占该键；让命令面板换到 ⌘Shift+P，
//  跟 VS Code/GitHub/Cursor 对齐；⌘K 留给 Quick Ask 走 Linear/Slack 语义。)
//
// 4 个分组 (action / session / file / slash); 在单一 input 中模糊搜，结果
// 跨组归一排序 (kind 不影响主排序，只在 hint 旁标个角标)。
//
// 焦点管理:
//   - 唤出时记录 document.activeElement 作为 previousFocus
//   - input.autoFocus
//   - 关闭时 previousFocus?.focus() 回还原焦点 (BottomBar textarea 等)
//
// 性能:
//   - 唤出时 gatherCommands 一次性拉全候选 (file 200 项 + session 30 项 + slash 全部 + 动态 action)
//   - 之后纯 renderer 端 fuzzy filter，无 IPC 往返
//   - 5k 文件时 fuzzy P99 < 50ms (fuzzy.ts benchmark 已验证)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore.js';
import { useSurfaceStore } from '../store/surface.js';
import { createMatcher, type FuzzyMatcher } from '../lib/fuzzy.js';
import { requestInsert } from './inputBridge.js';
import { pushToast } from '../store/toastStore.js';
import { useI18n } from '../i18n/I18nProvider.js';
import {
  gatherCommands,
  type CommandItem,
  type CommandKind,
  type CommandContext,
} from './commandSources.js';

/**
 * Route picked text to BottomBar via module-private registry (inputBridge.ts).
 * Replaces an earlier `window` CustomEvent design that was ambient — any
 * renderer JS could fire it.
 */
function emitInsert(text: string, failureMessage: string): void {
  const ok = requestInsert(text);
  if (!ok) {
    pushToast(failureMessage, 'warning', 2000);
  }
}

const KIND_BADGE_CLASS: Record<CommandKind, string> = {
  action: 'text-warn bg-warn/10',
  session: 'text-run bg-run/10',
  file: 'text-ok bg-ok/10',
  slash: 'text-thinking bg-thinking/10',
};

const GROUP_ORDER: readonly CommandKind[] = ['action', 'session', 'file', 'slash'];

interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

function CommandPalette({ open, onClose }: CommandPaletteProps): JSX.Element | null {
  const { t, effectiveLocale } = useI18n();
  const currentProjectPath = useAppStore((s) => s.currentProjectPath);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const surface = useSurfaceStore((state) => state.currentSurface);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<readonly CommandItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const matcherRef = useRef<FuzzyMatcher | null>(null);
  if (matcherRef.current === null) matcherRef.current = createMatcher();
  /** Guards the queueMicrotask focus restore — set true when palette re-opens
   *  before the microtask runs, so we don't steal focus from the just-opened input. */
  const focusRestoreCancelledRef = useRef(false);

  // 唤出时记录焦点 + 重置 query
  useEffect(() => {
    if (!open) return;
    // 新一轮 open: 取消上一轮还没跑的焦点还原 microtask
    focusRestoreCancelledRef.current = true;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setActiveIdx(0);
    return () => {
      // 关闭：把 cancelled 翻回 false（默认还原），然后排个 microtask
      focusRestoreCancelledRef.current = false;
      const target = previousFocusRef.current;
      if (!target) return;
      queueMicrotask(() => {
        // 如果在 microtask 跑之前下一轮 open 又把 cancelled 设回 true，跳过还原
        if (focusRestoreCancelledRef.current) return;
        target.focus({ preventScroll: false });
      });
    };
  }, [open]);

  // 唤出时拉候选
  useEffect(() => {
    if (!open) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const ctx: CommandContext = {
      projectPath: currentProjectPath,
      sessionId: currentSessionId,
      surface,
      close: onClose,
      t,
      locale: effectiveLocale,
      insertToInput: (text) => emitInsert(text, t('commandPalette.insertNotReady')),
    };
    void gatherCommands(ctx).then((next) => {
      if (cancelled) return;
      setItems(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, currentProjectPath, currentSessionId, surface, onClose, effectiveLocale, t]);

  // Fuzzy filter — items 或 query 变化时重算
  const filtered = useMemo((): readonly { item: CommandItem; score: number }[] => {
    const matcher = matcherRef.current;
    if (matcher === null) return [];
    matcher.setCandidates(items.map((i) => i.searchText));
    if (query.trim().length === 0) {
      // 空 query: 用 items 原始顺序，按 kind 分组（已 const action 在前）
      return items.map((item) => ({ item, score: 0 }));
    }
    const results = matcher.search(query, 50);
    // searchText 反查 — 用 FIFO 队列处理多个 CommandItem 共享同一 searchText
    // 的情况（HIGH-2: e.g. 两个 user 自定义 slash 同名同描述 → findIndex 只命中
    // 首个，后续永远被遮蔽）。这里按 items 原始顺序把每个 searchText 推进队列，
    // 一次消费一个，保证 N 个同 searchText 的 item 各自落到 N 个独立 result。
    const buckets = new Map<string, CommandItem[]>();
    for (const item of items) {
      const arr = buckets.get(item.searchText);
      if (arr === undefined) buckets.set(item.searchText, [item]);
      else arr.push(item);
    }
    const out: { item: CommandItem; score: number }[] = [];
    for (const r of results) {
      const arr = buckets.get(r.item);
      if (!arr || arr.length === 0) continue;
      const item = arr.shift();
      if (item) out.push({ item, score: r.score });
    }
    return out;
  }, [items, query]);

  // query 变化重置 activeIdx
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // 滚动 active 项到可见区域
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const child = list.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    if (child) child.scrollIntoView({ block: 'nearest' });
  }, [open, activeIdx]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const picked = filtered[activeIdx];
      if (picked) {
        void picked.item.onPick();
      }
      return;
    }
  };

  // 分组渲染：保持 GROUP_ORDER 顺序内的"组内已按 fuzzy score 排"的项
  const grouped = new Map<CommandKind, { item: CommandItem; score: number; flatIdx: number }[]>();
  filtered.forEach((entry, flatIdx) => {
    const arr = grouped.get(entry.item.kind) ?? [];
    arr.push({ ...entry, flatIdx });
    grouped.set(entry.item.kind, arr);
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-24 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-label={t('commandPalette.label')}
    >
      <div
        className="glass lift ix-zone border border-border-default rounded-lg w-[640px] max-w-[90vw] max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-default px-3 py-2">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('commandPalette.queryPlaceholder')}
            className="w-full bg-transparent text-fg-primary placeholder:text-fg-faint outline-none text-sm"
            aria-label={t('commandPalette.queryAria')}
          />
        </div>
        <ul ref={listRef} className="overflow-y-auto flex-1 text-[13px]">
          {loading && filtered.length === 0 && (
            <li className="px-3 py-4 text-fg-muted text-center">{t('commandPalette.loading')}</li>
          )}
          {!loading && filtered.length === 0 && (
            <li className="px-3 py-4 text-fg-muted text-center">{t('commandPalette.noMatches')}</li>
          )}
          {GROUP_ORDER.flatMap((kind) => {
            const arr = grouped.get(kind);
            if (!arr || arr.length === 0) return [];
            return [
              <li
                key={`group:${kind}`}
                className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-fg-muted"
              >
                {t(`commandPalette.kind.${kind}`)}
              </li>,
              ...arr.map(({ item, flatIdx }) => {
                const isActive = flatIdx === activeIdx;
                return (
                  <li key={item.id} data-idx={flatIdx}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(flatIdx)}
                      onClick={() => void item.onPick()}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
                        isActive
                          ? 'bg-surface-3 text-fg-primary'
                          : 'text-fg-secondary hover:bg-hover-bg'
                      }`}
                    >
                      <span
                        className={`text-[9px] px-1 py-0.5 rounded uppercase tracking-wider ${KIND_BADGE_CLASS[kind]}`}
                      >
                        {t(`commandPalette.kind.${kind}`)}
                      </span>
                      <span className="truncate flex-1">{item.label}</span>
                      {item.hint && (
                        <span
                          className="text-xs text-fg-muted truncate max-w-[40%]"
                          title={item.hint}
                        >
                          {item.hint}
                        </span>
                      )}
                    </button>
                  </li>
                );
              }),
            ];
          })}
        </ul>
        <div className="border-t border-border-default px-3 py-1.5 text-[11px] text-fg-muted flex gap-3">
          <span>{t('commandPalette.navigateHint')}</span>
          <span>{t('commandPalette.selectHint')}</span>
          <span>{t('commandPalette.closeHint')}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Controller — 注册全局 ⌘Shift+P (Mac) / Ctrl+Shift+P (Win/Linux) listener,
 * 挂载 CommandPalette。
 *
 * 选键理由：⌘K 早就被 F018 Quick Ask 占了，两个 modal 抢同一组合键会同时弹。
 * 改用 ⌘Shift+P —— VS Code / GitHub / Cursor 的命令面板 muscle memory，
 * 开发者一上手就懂；和 Linear/Slack 的"⌘K=快速问/搜"语义自然分开。
 * 模仿 HelpOverlayController 的形态，让 Shell.tsx 直接 `<CommandPaletteController />`。
 */
export function CommandPaletteController(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  // Stable ref — feeding inline `() => setOpen(false)` would change every
  // parent render and re-trigger CommandPalette's IPC effect, occasionally
  // resetting candidates while the user was reading them. (review MEDIUM-1)
  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // ⌘Shift+P / Ctrl+Shift+P — VS Code-family command palette muscle memory
      const isCmdShiftP =
        (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p';
      if (isCmdShiftP) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
    };
    const onOpen = (): void => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('kodax-space.open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('kodax-space.open-command-palette', onOpen);
    };
  }, []);

  return <CommandPalette open={open} onClose={handleClose} />;
}
