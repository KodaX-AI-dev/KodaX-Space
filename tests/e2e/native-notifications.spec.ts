import { expect, test } from '@playwright/test';
import { launchSpace } from './fixtures.js';

test('notification settings reports native rejection and confirmation without enabling completion alerts', async () => {
  const space = await launchSpace(`native-notifications-${Date.now()}`);
  try {
    await space.app.evaluate(({ Notification }) => {
      Object.defineProperty(Notification, 'isSupported', { value: () => true });
      Object.assign(globalThis, { nativeNoticeMode: 'failed' });
      Notification.prototype.show = function (this: InstanceType<typeof Notification>) {
        const mode = (globalThis as unknown as { nativeNoticeMode: string }).nativeNoticeMode;
        queueMicrotask(() => this.emit(mode, {}, 'OS rejected the request'));
      };
    });
    await space.page.getByTestId('settings-button').click();
    const panel = space.page.getByTestId('native-notification-settings');
    const enabled = panel.getByRole('checkbox');
    await expect(enabled).not.toBeChecked();
    await panel.getByRole('button', { name: 'Test notification', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('not confirmed');
    await expect(enabled).not.toBeChecked();
    await space.app.evaluate(() => Object.assign(globalThis, { nativeNoticeMode: 'show' }));
    await panel.getByRole('button', { name: 'Test notification', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('accepted');
    await expect(enabled).not.toBeChecked();
    await enabled.check();
    await expect(enabled).toBeChecked();
    await space.page.screenshot({ path: test.info().outputPath('notification-settings.png') });
  } finally {
    await space.close();
  }
});
