// TranscriptViewMenu — alpha.1
//
// Claude Desktop 截图 7：右上小按钮，点击弹出：
//   ┌─────────────────────────┐
//   │ Transcript view  Ctrl+Shift+O │
//   │   Normal       ✓        │
//   │   Thinking              │
//   │   Verbose               │
//   │   Summary               │
//   │   [Aa] [Aa] [Aa]        │
//   └─────────────────────────┘
//
// 4 个 transcript view 模式 + 3 档字号。Ctrl+Shift+O 切换打开。

import { useEffect, useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useAppStore } from '../store/appStore.js';
import { useZoomStore, ZOOM_STEP } from '../store/zoomStore.js';
import { useI18n } from '../i18n/I18nProvider.js';
import type { MessageKey } from '../i18n/messages.js';

const VIEW_OPTIONS = [
  { key: 'normal' as const, labelKey: 'transcript.view.normal' as MessageKey },
  { key: 'thinking' as const, labelKey: 'transcript.view.thinking' as MessageKey },
  { key: 'verbose' as const, labelKey: 'transcript.view.verbose' as MessageKey },
  { key: 'summary' as const, labelKey: 'transcript.view.summary' as MessageKey },
];

const FONT_OPTIONS = [
  {
    key: 'sm' as const,
    label: 'Aa',
    cls: 'text-[11px]',
    titleKey: 'transcript.font.small' as MessageKey,
  },
  {
    key: 'base' as const,
    label: 'Aa',
    cls: 'text-xs',
    titleKey: 'transcript.font.medium' as MessageKey,
  },
  {
    key: 'lg' as const,
    label: 'Aa',
    cls: 'text-sm',
    titleKey: 'transcript.font.large' as MessageKey,
  },
];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

export function TranscriptViewMenu(): JSX.Element {
  const { t } = useI18n();
  const view = useAppStore((s) => s.transcriptView);
  const setView = useAppStore((s) => s.setTranscriptView);
  const fontSize = useAppStore((s) => s.transcriptFontSize);
  const setFont = useAppStore((s) => s.setTranscriptFontSize);
  const zoomFactor = useZoomStore((s) => s.factor);
  const stepZoom = useZoomStore((s) => s.stepZoom);
  const resetZoom = useZoomStore((s) => s.resetZoom);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (
        e.ctrlKey &&
        e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        e.key.toLowerCase() === 'o' &&
        !isEditableTarget(e.target)
      ) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    function onDocDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDocDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDocDown);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`px-2 py-1 text-xs rounded font-mono ${
          open
            ? 'bg-surface-3 text-fg-primary'
            : 'text-fg-secondary hover:text-fg-primary hover:bg-hover-bg'
        }`}
        title={t('transcript.titleWithShortcut')}
        aria-label={t('transcript.title')}
      >
        <ScrollText className="w-4 h-4" strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div className="workspace-menu absolute right-0 top-full mt-1 w-56 bg-surface-4 border border-border-default rounded-lg shadow-xl py-1 text-xs z-50">
          <div className="px-3 py-1 flex justify-between items-center text-fg-muted text-[11px] uppercase tracking-wider">
            <span>{t('transcript.title')}</span>
            <span className="font-mono text-fg-muted flex items-center gap-1">
              <kbd className="px-1 border border-border-strong rounded">⇧</kbd>
              <kbd className="px-1 border border-border-strong rounded">Ctrl</kbd>
              <kbd className="px-1 border border-border-strong rounded">O</kbd>
            </span>
          </div>
          {VIEW_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                setView(o.key);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1 hover:bg-hover-bg flex items-center gap-2 ${
                view === o.key ? 'text-fg-primary' : 'text-fg-secondary'
              }`}
            >
              <span className="flex-1">{t(o.labelKey)}</span>
              {view === o.key && (
                <span className="text-ok" aria-hidden>
                  ✓
                </span>
              )}
            </button>
          ))}
          {/* 字号选择 */}
          <div className="border-t border-border-default mt-1 pt-1 px-3 py-1 flex items-center gap-2">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFont(f.key)}
                className={`px-2 py-0.5 rounded border ${
                  fontSize === f.key
                    ? 'border-ok text-fg-primary'
                    : 'border-border-strong text-fg-muted hover:text-fg-primary'
                }`}
                title={t('transcript.fontTitle', { size: t(f.titleKey) })}
              >
                <span className={f.cls}>{f.label}</span>
              </button>
            ))}
          </div>
          {/* 整窗缩放 — 浏览器式 −/百分比/+。点百分比复位 100%。系数全局持久；
              与 Ctrl+滚轮 / Ctrl+± / Ctrl+0 同源（zoomStore）。注意：这跟上面只缩放
              transcript 的字号 [Aa] 是两回事——这里是整个 app 缩放。 */}
          <div className="border-t border-border-default mt-1 pt-1.5 px-3 py-1.5 flex items-center justify-between gap-2">
            <span className="text-fg-muted">{t('transcript.zoom')}</span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => stepZoom(-ZOOM_STEP)}
                className="w-6 h-6 rounded border border-border-strong text-fg-secondary hover:bg-hover-bg hover:text-fg-primary flex items-center justify-center text-sm leading-none"
                title={t('transcript.zoomOutTitle')}
                aria-label={t('transcript.zoomOut')}
              >
                −
              </button>
              <button
                type="button"
                onClick={resetZoom}
                className="min-w-[3.25rem] px-1 py-0.5 rounded text-fg-primary hover:bg-hover-bg tabular-nums text-center"
                title={t('transcript.zoomResetTitle')}
                aria-label={t('transcript.zoomReset')}
              >
                {Math.round(zoomFactor * 100)}%
              </button>
              <button
                type="button"
                onClick={() => stepZoom(ZOOM_STEP)}
                className="w-6 h-6 rounded border border-border-strong text-fg-secondary hover:bg-hover-bg hover:text-fg-primary flex items-center justify-center text-sm leading-none"
                title={t('transcript.zoomInTitle')}
                aria-label={t('transcript.zoomIn')}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
