// Native OS notification handler — F020 (v0.1.3)
//
// renderer 调 'notification.show' → main 用 Electron Notification 弹原生 OS 通知。
// 用户点通知 → 把主窗口拉前台 + push 'notification.clicked' 让 renderer
// setCurrentSession 到对应 session。
//
// 平台覆盖：
//   - macOS: Notification Center (首次会触发系统 grant dialog)
//   - Windows: Action Center
//   - Linux: libnotify (没装则 Notification.isSupported() = false → 返 shown:false)
//
// **不**触发 OS-level "do not disturb" 检查 —— 让 OS 自己决定。如果用户在勿扰，
// OS 把通知放收纳中心，不响铃；这是用户期望的行为。

import { Notification, type BrowserWindow } from 'electron';
import type { ChannelOutput } from '@kodax-space/space-ipc-schema';
import { registerChannel } from './register.js';
import { pushToRenderer } from './push.js';

let getMainWindow: (() => BrowserWindow | null) | null = null;

/**
 * main.ts 在 createMainWindow 后调一次注入 window getter，
 * 让通知点击时能把窗口拉前台。
 */
export function setNotificationWindowGetter(getter: () => BrowserWindow | null): void {
  getMainWindow = getter;
}

export function registerNotificationChannels(onShown: () => void = () => {}): void {
  registerChannel('notification.show', async (input) => {
    if (!Notification.isSupported()) {
      // Linux 没装 libnotify / headless / etc. — UI 退化到 in-app NotificationsSurface
      return { shown: false, reason: 'unsupported' as const };
    }
    let notif: Notification;
    try {
      notif = new Notification({
        title: input.title,
        body: input.body,
        silent: input.silent ?? false,
      });
    } catch {
      return { shown: false, reason: 'failed' as const };
    }
    notif.on('click', () => {
      // 拉窗口前台 + 推 click event 让 renderer 切到对应 session
      const win = getMainWindow?.();
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
      pushToRenderer('notification.clicked', {
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      });
    });
    return showNativeNotification(notif, onShown);
  });
}

function showNativeNotification(
  notification: Notification,
  onShown: () => void,
): Promise<ChannelOutput<'notification.show'>> {
  // Permission dialogs can outlive the bounded IPC confirmation. A later native
  // success still grants the opportunity to restore the cached macOS badge.
  notification.once('show', onShown);
  const forgetShown = () => notification.removeListener('show', onShown);
  notification.once('failed', forgetShown);
  notification.once('close', forgetShown);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ChannelOutput<'notification.show'>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      notification.removeListener('show', onShow);
      notification.removeListener('failed', onFailed);
      notification.removeListener('close', onClosed);
      resolve(result);
    };
    const onShow = () => finish({ shown: true });
    const onFailed = () => finish({ shown: false, reason: 'failed' });
    const onClosed = () => finish({ shown: false, reason: 'not_confirmed' });
    const timer = setTimeout(onClosed, 10_000);
    timer.unref?.();
    notification.once('show', onShow);
    notification.once('failed', onFailed);
    notification.once('close', onClosed);
    try {
      notification.show();
    } catch {
      forgetShown();
      onFailed();
    }
  });
}
