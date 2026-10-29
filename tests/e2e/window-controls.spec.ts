import { expect, test } from '@playwright/test';
import { launchSpace } from './fixtures.js';

test('custom window controls perform native maximize restore and minimize operations', async () => {
  test.skip(
    process.platform !== 'win32',
    'Native window operations require the Windows desktop fixture; Kylin/UKUI has separate manual acceptance.',
  );
  const space = await launchSpace(`window-controls-${Date.now()}`);
  try {
    const controls = space.page.getByRole('group', { name: 'Window controls', exact: true });
    await expect(controls.getByRole('button', { name: 'Close window', exact: true })).toBeVisible();
    await controls.getByRole('button', { name: 'Maximize', exact: true }).click();
    await expect(controls.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
    await controls.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(controls.getByRole('button', { name: 'Maximize', exact: true })).toBeVisible();
    await controls.getByRole('button', { name: 'Minimize', exact: true }).click();
    await expect
      .poll(() =>
        space.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMinimized()),
      )
      .toBe(true);
    await space.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.restore());
  } finally {
    await space.close();
  }
});
