// Toasts sit below the title bar, clear of the composer and its Stop/Send controls.
//
// 显示 pushToast 推进来的瞬态消息。tone 决定颜色 + 默认 ttl；用户也可以 × 手动关。
// 不需要订阅 sessionId / projectPath 等业务状态，与 Shell 解耦。

import { Info, CheckCircle2, AlertTriangle, XCircle, X, type LucideIcon } from 'lucide-react';
import type { Toast, ToastTone } from '../store/toastStore.js';
import { useToastStore } from '../store/toastStore.js';
import { useI18n } from '../i18n/I18nProvider.js';

// Dark：深色 bg + 浅色 text；Light：浅色 bg + 深色 text。
// 之前只写 dark-only，文字经全局反转后跟 bg 同深 → 看不清 (用户反馈：Stop 后弹窗黑乎乎)。
const TONE_CLASS: Record<ToastTone, string> = {
  info: 'bg-surface-2 border-border-strong text-fg-primary',
  success: 'bg-surface-2 border-ok/50 text-ok',
  warning: 'bg-surface-2 border-warn/50 text-warn',
  error: 'bg-surface-2 border-danger/50 text-danger',
};

const TONE_ICON: Record<ToastTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

export function ToastContainer(): JSX.Element | null {
  const { t } = useI18n();
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-12 right-4 z-50 flex max-h-[50vh] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto pointer-events-none sm:max-w-sm">
      {toasts.map((toast: Toast) => {
        const Icon = TONE_ICON[toast.tone];
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex shrink-0 items-start gap-2 px-3 py-2 rounded border text-xs shadow-lg ${TONE_CLASS[toast.tone]}`}
          >
            <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
            <div className="flex-1 whitespace-pre-wrap break-words">{toast.message}</div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="text-fg-muted hover:text-fg-primary inline-flex items-center"
              aria-label={t('notification.dismiss')}
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
