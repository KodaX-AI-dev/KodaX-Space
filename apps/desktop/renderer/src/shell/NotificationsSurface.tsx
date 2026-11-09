// NotificationsSurface — 持久内联通知 (REPL NotificationsSurface 等价, v0.1.x)
//
// 与 ToastContainer 的区别:
//   - Toast: 几秒自动消失,适合 ephemeral 反馈 (复制成功 / IPC 错)
//   - 这里:  持续显示,直到用户 dismiss 或来源条件消失。eg "Auto-mode fell back to rules"
//     这种系统级状态用户必须确认 — 不能用一闪而过的 toast 处理。
//
// 来源 (当前 v0.1.x 触发器):
//   - 后续: context 80% warning / 反复 retry / network down 等
//
// session 过滤: notice.sessionId 与 currentSessionId 不匹配且非全局 (undefined sessionId) 时不显示。

import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/appStore.js';
import type { Notification } from '../store/appStore.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { ComposerNotice, type ComposerNoticeTone } from './ComposerNotice.js';

const SEVERITY_TONE: Record<Notification['severity'], ComposerNoticeTone> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  error: 'danger',
};

interface NotificationRowProps {
  readonly notification: Notification;
  readonly onDismiss: (id: string) => void;
}

function NotificationRow({ notification, onDismiss }: NotificationRowProps): JSX.Element {
  const { t } = useI18n();
  return (
    <div data-notification-id={notification.id} data-testid="notification-row">
      <ComposerNotice
        tone={SEVERITY_TONE[notification.severity]}
        onDismiss={() => onDismiss(notification.id)}
        dismissLabel={t('notification.dismissAria')}
        dismissTestId="notification-dismiss"
      >
        {notification.text}
      </ComposerNotice>
    </div>
  );
}

export function NotificationsSurface(): JSX.Element | null {
  const { t } = useI18n();
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const notifications = useAppStore((s) => s.notifications);
  const dismissNotification = useAppStore((s) => s.dismissNotification);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Visible: global notifications or notifications for the current session.
  const visible = useMemo(
    () =>
      notifications.filter((n) => n.sessionId === undefined || n.sessionId === currentSessionId),
    [currentSessionId, notifications],
  );
  const dismissOnOutsideInteractionIds = useMemo(
    () => visible.filter((n) => n.dismissOnOutsideInteraction).map((n) => n.id),
    [visible],
  );

  useEffect(() => {
    if (dismissOnOutsideInteractionIds.length === 0) return;

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      for (const id of dismissOnOutsideInteractionIds) dismissNotification(id);
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [dismissNotification, dismissOnOutsideInteractionIds]);
  if (visible.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="px-3 space-y-1"
      role="region"
      aria-label={t('notification.systemAria')}
      data-testid="notifications-surface"
    >
      {visible.map((n) => (
        <NotificationRow key={n.id} notification={n} onDismiss={dismissNotification} />
      ))}
    </div>
  );
}
