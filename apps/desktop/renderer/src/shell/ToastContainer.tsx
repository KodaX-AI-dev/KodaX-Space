// Toasts sit below the title bar, clear of the composer and its Stop/Send controls.
//
// 显示 pushToast 推进来的瞬态消息。tone 决定图标颜色 + 默认 ttl；用户也可以 × 手动关。
// 不需要订阅 sessionId / projectPath 等业务状态，与 Shell 解耦。

import type { Toast, ToastTone } from '../store/toastStore.js';
import { useToastStore } from '../store/toastStore.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { ComposerNotice, type ComposerNoticeTone } from './ComposerNotice.js';

const TOAST_TONE: Record<ToastTone, ComposerNoticeTone> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'danger',
};

export function ToastContainer(): JSX.Element | null {
  const { t } = useI18n();
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-12 right-4 z-50 flex max-h-[50vh] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto pointer-events-none sm:max-w-sm">
      {toasts.map((toast: Toast) => (
        // Opaque backing + heavier shadow: a toast floats over content, unlike docked notices.
        <div
          key={toast.id}
          className="pointer-events-auto shrink-0 rounded-lg bg-surface-2 shadow-lg"
        >
          <ComposerNotice
            tone={TOAST_TONE[toast.tone]}
            role="status"
            onDismiss={() => dismiss(toast.id)}
            dismissLabel={t('notification.dismiss')}
          >
            {toast.message}
          </ComposerNotice>
        </div>
      ))}
    </div>
  );
}
