import { test, expect } from '@playwright/test';
import { launchSpace } from './fixtures.js';

const TEST_ID = `i18n-language-switch-${Date.now()}`;

test('language switch updates settings, sidebar, and command palette copy', async () => {
  const testInfo = test.info();
  test.setTimeout(60_000);
  const space = await launchSpace(TEST_ID);
  try {
    const { page } = space;
    await page.waitForTimeout(2000);
    await expect(page.getByLabel('Runtime diagnostics')).toContainText('Community');
    await expect(page.getByText('Total tokens', { exact: true })).toBeVisible();

    await page.getByTestId('settings-button').click();
    await expect(page.locator('#settings-modal-title')).toHaveText('Settings');
    await expect(page.getByRole('tab', { name: 'License' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Workflow host' })).toBeVisible();

    await page.getByRole('button', { name: '简体中文' }).click();
    await expect(page.locator('#settings-modal-title')).toHaveText('设置');
    await expect(page.getByText('显示语言已更新', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: '许可证' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '工作流宿主' })).toBeVisible();
    await expect(page.getByTestId('settings-button')).toContainText('设置');
    await expect(page.getByText('项目', { exact: true }).first()).toBeVisible();
    const settings = page.getByTestId('settings-workspace');
    await expect(settings.getByRole('tab')).toHaveCount(6);
    await expect(settings.getByRole('heading', { name: '外观', exact: true })).toBeVisible();
    for (const quality of ['极简', '均衡', '全特效']) {
      await expect(settings.getByRole('button', { name: quality, exact: true })).toBeVisible();
    }
    await settings.getByRole('button', { name: '深色', exact: true }).click();
    await settings.getByRole('button', { name: '均衡', exact: true }).click();
    await page.mouse.move(800, 90);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('settings-zh-dark.png'),
    });
    await settings.getByRole('button', { name: '浅色', exact: true }).click();
    await page.mouse.move(800, 90);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('settings-zh-light.png'),
    });
    await settings.getByRole('button', { name: '深色', exact: true }).click();

    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-modal-title')).toHaveCount(0);
    await expect(page.getByLabel('运行时诊断')).toContainText('社区版');
    await expect(page.getByText('Token 总数', { exact: true })).toBeVisible();
    await expect(page.locator('button[aria-label^="主题"]').first()).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('workspace-zh-dark.png'),
    });
    await page.keyboard.press('Control+Shift+P');
    const palette = page.getByRole('dialog', { name: '命令面板' });
    await expect(palette).toBeVisible();
    await expect(palette.getByLabel('命令查询')).toHaveAttribute(
      'placeholder',
      '输入命令、文件、会话或 /slash...',
    );
    await expect(palette.getByRole('button', { name: /操作 新对话/ })).toBeVisible();

    await page.keyboard.press('Escape');
    await page.reload();
    await page.getByTestId('settings-button').click();
    await expect(page.locator('#settings-modal-title')).toHaveText('设置');
    await expect(page.getByRole('button', { name: '简体中文' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('#settings-modal-title')).toHaveText('Settings');
    await expect(page.getByText('Display language updated', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'License' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Workflow host' })).toBeVisible();
    await expect(page.getByTestId('settings-button')).toContainText('Settings');
    await expect(page.getByLabel('Runtime diagnostics')).toContainText('Community');
    await expect(page.locator('button[aria-label^="Theme"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Follow system', exact: true }).click();
    const result = await page.evaluate(() => window.kodaxSpace.invoke('settings.get', {}));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Could not read language settings');
    expect(result.data.languageMode).toBe('system');
    expect(result.data.preferredSystemLanguages).toEqual(
      await space.app.evaluate(({ app }) => app.getPreferredSystemLanguages()),
    );
    await expect(page.locator('#settings-modal-title')).toHaveText(
      result.data.effectiveLocale === 'zh-CN' ? '设置' : 'Settings',
    );
  } finally {
    await space.close();
  }
});
