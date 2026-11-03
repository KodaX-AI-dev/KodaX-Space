import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';

function useNotificationTest() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function send(): Promise<void> {
    if (busy || !window.kodaxSpace) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await window.kodaxSpace.invoke('notification.show', {
        title: 'KodaX Space',
        body: t('settings.notifications.testBody'),
      });
      setMessage(
        t(
          result.ok && result.data.shown
            ? 'settings.notifications.accepted'
            : 'settings.notifications.notConfirmed',
        ),
      );
    } catch {
      setMessage(t('settings.notifications.notConfirmed'));
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, send };
}

export function NativeCompletionNotificationSettings(): JSX.Element {
  const { t } = useI18n();
  const enabled = useAppStore((s) => s.nativeCompletionNotificationsEnabled);
  const setEnabled = useAppStore((s) => s.setNativeCompletionNotificationsEnabled);
  const { busy, message, send } = useNotificationTest();
  return (
    <section
      data-testid="native-notification-settings"
      className="rounded-lg border border-border-default bg-surface px-3 py-3"
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-1 h-4 w-4 accent-ok"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg-primary">
            {t('settings.notifications.title')}
          </span>
          <span className="mt-1 block text-xs leading-5 text-fg-muted">
            {t('settings.notifications.description')}
          </span>
        </span>
      </label>
      <p className="mt-2 text-xs leading-5 text-fg-muted">
        {t('settings.notifications.systemHelp')}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void send()}
        className="mt-2 rounded-md border border-border-default px-3 py-1.5 text-xs text-fg-primary disabled:opacity-50"
      >
        {busy ? t('common.loading') : t('settings.notifications.test')}
      </button>
      {message && (
        <p role="status" className="mt-2 text-xs leading-5 text-fg-secondary">
          {message}
        </p>
      )}
    </section>
  );
}
