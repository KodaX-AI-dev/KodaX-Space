// HelpOverlay — P3
//
// `?` 在非 input 上下文时触发，弹一个键盘 + slash 命令 cheat sheet。
// 对齐 KodaX TUI 的 `?` overlay 行为：列分组的快捷键 + 当前可用 slash 命令。
//
// 跨平台快捷键显示：data 里用 `Mod` sentinel 表示"平台主修饰键"；formatKey 在
// Mac 上翻译成 ⌘，Win/Linux 上是 Ctrl。Alt/Shift/Meta 同理。

import { useEffect, useMemo, useState } from 'react';
import { formatKey, getPlatform } from '../lib/shortcut-format.js';
import { useI18n } from '../i18n/I18nProvider.js';
import type { MessageKey } from '../i18n/messages.js';

interface ShortcutGroup {
  readonly titleKey: MessageKey;
  readonly items: ReadonlyArray<{ keys: readonly string[]; labelKey: MessageKey }>;
}

const GROUPS: readonly ShortcutGroup[] = [
  {
    titleKey: 'help.group.input',
    items: [
      { keys: ['Enter'], labelKey: 'help.sendMessage' },
      { keys: ['Shift', 'Enter'], labelKey: 'help.insertNewline' },
      { keys: ['Mod', 'Enter'], labelKey: 'help.queueAfterTurn' },
      { keys: ['↑'], labelKey: 'help.previousPrompt' },
      { keys: ['↓'], labelKey: 'help.nextPrompt' },
      { keys: ['/'], labelKey: 'help.openSlashPicker' },
    ],
  },
  {
    titleKey: 'help.group.modes',
    items: [
      { keys: ['Shift', 'Tab'], labelKey: 'help.cyclePermissionMode' },
      { keys: ['Ctrl', 'M'], labelKey: 'help.openPermissionModePicker' },
      { keys: ['Ctrl', 'I'], labelKey: 'help.openModelPicker' },
      { keys: ['Ctrl', 'Shift', 'E'], labelKey: 'help.cycleReasoningDepth' },
      { keys: ['Alt', 'M'], labelKey: 'help.toggleAgentMode' },
    ],
  },
  {
    titleKey: 'help.group.session',
    items: [
      { keys: ['Esc'], labelKey: 'help.cancelCloseOverlay' },
      { keys: ['/clear'], labelKey: 'help.clearCurrentConversation' },
      { keys: ['/new'], labelKey: 'help.startNewSession' },
      { keys: ['/fork'], labelKey: 'help.forkSession' },
    ],
  },
  {
    titleKey: 'help.group.ui',
    items: [
      { keys: ['Mod', 'K'], labelKey: 'help.quickAsk' },
      { keys: ['Mod', ','], labelKey: 'help.openSettings' },
      { keys: ['Mod', 'Shift', 'P'], labelKey: 'help.commandPalette' },
      { keys: ['Ctrl', 'Shift', 'T'], labelKey: 'help.cycleTheme' },
      { keys: ['Mod', 'F'], labelKey: 'help.findTranscript' },
      { keys: ['Ctrl', '\\'], labelKey: 'help.toggleFocusMode' },
      { keys: ['?'], labelKey: 'help.toggleHelp' },
    ],
  },
  {
    titleKey: 'help.group.slashCommands',
    items: [
      { keys: ['/help'], labelKey: 'help.listCommands' },
      { keys: ['/mode'], labelKey: 'help.setPermissionMode' },
      { keys: ['/agent-mode'], labelKey: 'help.setAgentMode' },
      { keys: ['/provider'], labelKey: 'help.switchProvider' },
      { keys: ['/model'], labelKey: 'help.switchModel' },
      { keys: ['/reasoning'], labelKey: 'help.setReasoningDepth' },
      { keys: ['/thinking'], labelKey: 'help.toggleThinking' },
      { keys: ['/copy'], labelKey: 'help.copyLastAssistant' },
      { keys: ['/cost'], labelKey: 'help.showTokenUsage' },
      { keys: ['/tree'], labelKey: 'help.showLineage' },
      { keys: ['/history'], labelKey: 'help.showHistory' },
      { keys: ['/compact'], labelKey: 'help.compactContext' },
      { keys: ['/clear'], labelKey: 'help.clearConversation' },
    ],
  },
];

/** Global `?` shortcut toggles the overlay. Returns the overlay node (or null when closed). */
export function HelpOverlayController(): JSX.Element | null {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // 仅在非输入控件触发，避免 user 在 textarea / input 里输入 ? 被打断
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      const isInputContext = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (e.key === '?' && !isInputContext && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    const onOpen = (): void => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('kodax-space.open-help', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('kodax-space.open-help', onOpen);
    };
  }, [open]);

  // platform 在挂载后稳定，useMemo 单次解析
  const platform = useMemo(() => getPlatform(), []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-surface border border-border-default rounded-lg shadow-2xl max-w-2xl w-[90vw] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-default flex items-center justify-between sticky top-0 bg-surface">
          <h2 className="text-sm font-semibold text-fg-primary">{t('help.title')}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-fg-muted hover:text-fg-primary text-xs px-2 py-0.5"
            aria-label={t('help.close')}
          >
            Esc
          </button>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 p-4">
          {GROUPS.map((g) => (
            <section key={g.titleKey}>
              <h3 className="text-[11px] uppercase tracking-wider text-fg-muted mb-2">
                {t(g.titleKey)}
              </h3>
              <ul className="space-y-1.5 text-xs">
                {g.items.map((it) => (
                  // GROUPS 是 module-level const，label 字符串足够稳定唯一作 key —
                  // 比 array index 更经得起未来 GROUPS 重排时的 React 重用 (review LOW)
                  <li key={it.labelKey} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 text-fg-secondary">{t(it.labelKey)}</span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {it.keys.map((k) => (
                        <kbd
                          // 单 shortcut 内 key 序列各 modifier+letter 已天然唯一
                          key={k}
                          className="px-1.5 py-0.5 border border-border-default rounded bg-surface-2 text-fg-primary text-[11px] font-mono"
                        >
                          {formatKey(k, platform)}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
