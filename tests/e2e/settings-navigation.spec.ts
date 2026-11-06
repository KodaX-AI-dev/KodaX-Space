import { test, expect } from '@playwright/test';
import { launchSpace } from './fixtures.js';

test('Grouped settings expose resources directly and preserve drafts across resource refresh', async () => {
  const space = await launchSpace(`settings-navigation-${Date.now()}`);
  try {
    const { page } = space;
    await page.getByTestId('settings-button').click();
    const settings = page.getByTestId('settings-workspace');
    await expect(settings.getByRole('tab', { name: 'General', exact: true })).toBeVisible();
    await expect(settings.getByRole('tab', { name: 'MCP', exact: true })).toBeVisible();
    await expect(settings.getByRole('tab', { name: 'Skills', exact: true })).toBeVisible();
    await expect(page.locator('#settings-panel-providers')).toHaveCount(0);
    await expect(page.locator('#settings-panel-context')).toHaveCount(0);

    const workspace = settings.getByLabel('Default workspace');
    await workspace.fill('unsaved-workspace');
    await settings.getByRole('tab', { name: 'Context & limits', exact: true }).click();
    const trigger = settings.getByLabel('Trigger percent', { exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.fill('42');
    await settings.getByRole('tab', { name: 'MCP', exact: true }).click();
    await expect(page.locator('#settings-panel-mcp')).toBeVisible();
    await settings.getByRole('button', { name: 'Reload MCP', exact: true }).click();
    await expect(settings.getByRole('button', { name: 'Reload MCP', exact: true })).toBeEnabled();
    await settings.getByRole('tab', { name: 'Context & limits', exact: true }).click();
    await expect(trigger).toHaveValue('42');
    await settings.getByRole('tab', { name: 'General', exact: true }).click();
    await expect(workspace).toHaveValue('unsaved-workspace');
    await settings.getByRole('tab', { name: 'About', exact: true }).click();
    await expect(settings.getByTestId('update-settings')).toBeVisible();
    await expect(settings.getByRole('heading', { name: 'License', exact: true })).toBeVisible();
  } finally {
    await space.close();
  }
});

test('Migration preview is lazy and its failure stays in troubleshooting', async () => {
  const space = await launchSpace(`settings-migration-scope-${Date.now()}`);
  try {
    await space.app.evaluate(({ ipcMain }) => {
      Reflect.set(globalThis, 'settingsMigrationReads', 0);
      ipcMain.removeHandler('settings.kodaxConfig.planIntegrationMigration');
      ipcMain.handle('settings.kodaxConfig.planIntegrationMigration', () => {
        Reflect.set(
          globalThis,
          'settingsMigrationReads',
          Number(Reflect.get(globalThis, 'settingsMigrationReads')) + 1,
        );
        return {
          ok: false,
          error: { code: 'internal_error', message: 'Migration preview unavailable' },
        };
      });
    });
    const { page } = space;
    await page.getByTestId('settings-button').click();
    const settings = page.getByTestId('settings-workspace');
    await settings.getByRole('tab', { name: 'Context & limits', exact: true }).click();
    await expect(settings.getByLabel('Trigger percent', { exact: true })).toBeEnabled();
    expect(await space.app.evaluate(() => Reflect.get(globalThis, 'settingsMigrationReads'))).toBe(
      0,
    );
    await settings.getByRole('tab', { name: 'Troubleshooting', exact: true }).click();
    await expect(settings.getByRole('alert')).toContainText('Migration preview unavailable');
    expect(await space.app.evaluate(() => Reflect.get(globalThis, 'settingsMigrationReads'))).toBe(
      1,
    );
    await settings.getByRole('tab', { name: 'Context & limits', exact: true }).click();
    await expect(settings.getByRole('alert')).toHaveCount(0);
    await settings.getByRole('tab', { name: 'MCP', exact: true }).click();
    await expect(settings.getByRole('alert')).toHaveCount(0);
    await settings
      .getByRole('button', { name: 'Configuration & migration details', exact: true })
      .click();
    await expect(page.locator('#settings-panel-diagnostics')).toBeVisible();
    await expect(page.locator('#settings-config-details')).toHaveAttribute('open', '');
    await expect(settings.getByRole('alert')).toContainText('Migration preview unavailable');
  } finally {
    await space.close();
  }
});

test('Grouped settings remain readable and keyboard reachable in both themes and narrow windows', async () => {
  const space = await launchSpace(`settings-layout-${Date.now()}`);
  try {
    const { page } = space;
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByTestId('settings-button').click();
    const settings = page.getByTestId('settings-workspace');
    await settings.getByRole('button', { name: '简体中文', exact: true }).click();
    await page.locator('#settings-tab-appearance').click();
    await settings.getByRole('button', { name: '深色', exact: true }).click();
    await settings.getByRole('button', { name: '均衡', exact: true }).click();
    await expect(page.getByText('显示语言已更新', { exact: true })).not.toBeVisible({
      timeout: 6000,
    });
    for (const id of ['preferences', 'mcp', 'context', 'appearance', 'about']) {
      await page.locator(`#settings-tab-${id}`).click();
      await expect(page.locator(`#settings-panel-${id}`)).toBeVisible();
      await page.screenshot({
        path: `artifacts/settings-implementation/screenshots/zh-dark-${id}.png`,
        animations: 'disabled',
      });
    }
    await page.locator('#settings-tab-appearance').click();
    await settings.getByRole('button', { name: '浅色', exact: true }).click();
    await page.locator('#settings-tab-preferences').click();
    await page.screenshot({
      path: 'artifacts/settings-implementation/screenshots/zh-light-preferences.png',
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1100, height: 520 });
    await page.locator('#settings-tab-diagnostics').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#settings-tab-about')).toBeFocused();
    await expect(page.locator('#settings-tab-about')).toBeInViewport();
    await page.keyboard.press('Home');
    await expect(page.locator('#settings-tab-preferences')).toBeFocused();
    await expect(page.locator('#settings-tab-preferences')).toBeInViewport();
    await page.screenshot({
      path: 'artifacts/settings-implementation/screenshots/zh-light-short.png',
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 640, height: 600 });
    const titleFits = await settings
      .locator('.settings-navigation h2')
      .evaluate(
        (node) =>
          node.getBoundingClientRect().height <= parseFloat(getComputedStyle(node).lineHeight) + 1,
      );
    expect(titleFits).toBe(true);
    await page.locator('#settings-tab-skills').click();
    await expect(page.locator('#settings-tab-skills')).toBeInViewport();
    await expect(settings.getByRole('button', { name: '关闭设置' })).toBeInViewport();
    expect(await settings.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({
      path: 'artifacts/settings-implementation/screenshots/zh-light-narrow.png',
      animations: 'disabled',
    });
  } finally {
    await space.close();
  }
});
