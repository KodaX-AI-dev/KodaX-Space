// AgentPicker — markdown agent 选择器,REPL "@agent-name" UX 等价 (v0.1.x)
//
// 用户点 BottomBar 上的 ⌬ 按钮 → 弹出当前 project 可用的 markdown agents 列表;
// 点击一个 agent → 把 `@agent-name ` 插入 textarea 当前光标位置。
//
// 数据: 每次打开弹层时调一次 agent.discover IPC (no cache; 频次低,~每次打开一次)。
// picker 只负责插入显式 @agent 引用；发送时 RealKodaXSession 会按当前项目加载 scoped agents。

import { useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import type { AgentMeta } from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../store/appStore.js';
import { useI18n } from '../i18n/I18nProvider.js';

const SOURCE_DOT_COLOR: Record<AgentMeta['source'], string> = {
  'markdown:user': 'text-warn',
  'markdown:project': 'text-ok',
};

interface Props {
  /** 将 `@agent-name ` 插入 input 当前 caret 位置;由 BottomBar 通过 ref 传进来. */
  readonly insertAtCaret: (text: string) => void;
}

export function AgentPicker({ insertAtCaret }: Props): JSX.Element | null {
  const { t } = useI18n();
  const projectRoot = useAppStore((s) => s.currentProjectPath);
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<readonly AgentMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 打开时拉一次
  useEffect(() => {
    if (!open || !projectRoot || !window.kodaxSpace) return;
    let cancelled = false;
    setLoading(true);
    void window.kodaxSpace
      .invoke('agent.discover', { projectRoot })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setAgents(r.data.agents);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectRoot]);

  // 点击其他地方关闭
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent): void => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (!projectRoot) return null;

  function pickAgent(name: string): void {
    insertAtCaret(`@${name} `);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-6 h-6 rounded-md text-fg-muted hover:text-fg-secondary hover:bg-hover-bg flex items-center justify-center"
        title={t('agentPicker.insertTitle')}
        aria-label={t('agentPicker.pickAria')}
      >
        <Bot className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">{t('agentPicker.agent')}</span>
      </button>

      {open && (
        <div className="workspace-menu absolute left-0 bottom-full mb-2 w-64 max-h-72 overflow-auto bg-surface-4 border border-border-default rounded-lg shadow-xl p-2 text-xs z-50">
          <div className="text-fg-muted text-[11px] uppercase tracking-wider mb-1.5 px-1">
            {t('agentPicker.insertReference')}
          </div>
          {loading ? (
            <div className="text-fg-muted italic px-1 py-2">{t('agentPicker.discovering')}</div>
          ) : agents.length === 0 ? (
            <div className="text-fg-muted italic px-1 py-2">{t('agentPicker.empty')}</div>
          ) : (
            <ul className="space-y-0.5">
              {agents.map((a) => (
                <li key={a.path}>
                  <button
                    type="button"
                    onClick={() => pickAgent(a.name)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-hover-bg flex items-start gap-2"
                  >
                    <span className={`${SOURCE_DOT_COLOR[a.source]} mt-0.5`} aria-hidden>
                      ●
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-fg-primary font-mono truncate">{a.name}</div>
                      <div className="text-fg-muted text-[11px] truncate" title={a.description}>
                        {a.description}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
