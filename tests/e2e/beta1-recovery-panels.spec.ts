import { expect, test } from '@playwright/test';
import { launchSpace } from './fixtures.js';

test('a late Host extension error cannot overwrite the latest successful settings refresh', async () => {
  const space = await launchSpace(`beta1-health-${Date.now()}`);
  try {
    await space.app.evaluate(({ ipcMain }) => {
      let calls = 0;
      ipcMain.removeHandler('runtime.extensionHealth');
      ipcMain.handle('runtime.extensionHealth', () => {
        calls++;
        if (calls === 1)
          return new Promise((resolve) => {
            Reflect.set(globalThis, 'releaseOldExtensionHealth', () =>
              resolve({
                ok: false,
                error: { code: 'internal_error', message: 'Old Host retired' },
              }),
            );
          });
        return {
          ok: true,
          data: {
            state: 'ready',
            active: true,
            builtins: { skills: true, artifacts: true },
            tools: ['artifact_capabilities'],
            extensions: [],
            failures: [],
          },
        };
      });
    });
    await space.page.getByTestId('settings-button').click();
    await space.page.locator('#settings-tab-runtime').click();
    const panel = space.page.getByTestId('extension-health');
    await expect(panel).toBeVisible();
    await panel
      .getByRole('button', { name: 'Refresh Host extension capabilities', exact: true })
      .click();
    await expect(panel).toContainText('Builtin capabilities are available.');
    await space.app.evaluate(() => {
      const release = Reflect.get(globalThis, 'releaseOldExtensionHealth') as () => void;
      release();
    });
    await expect(panel).toContainText('Builtin capabilities are available.');
    await expect(panel).not.toContainText('unavailable');
    await space.page.screenshot({ path: test.info().outputPath('extension-health.png') });
  } finally {
    await space.close();
  }
});
