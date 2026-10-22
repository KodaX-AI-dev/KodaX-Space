import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { launchSpace } from './fixtures.js';

async function capture(page: Page, name: string): Promise<void> {
  const directory = process.env.SPACE_VISUAL_AUDIT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
}

type Locale = 'en-US' | 'zh-CN';

async function inspectRuntimeCopy(page: Page, locale: Locale): Promise<void> {
  const boundary = page.getByText(
    locale === 'zh-CN'
      ? '这里隔离受支持的命令执行，尚未覆盖全部文档与原生资源访问。启动和普通工具调用不会自动触发设置。'
      : 'This contains supported commands, not all document or native-resource access. Startup and ordinary tool calls never trigger setup.',
    { exact: true },
  );
  await boundary.scrollIntoViewIfNeeded();
  await expect(boundary).toBeInViewport();
  await capture(page, `${locale}-sandbox-boundary`);
  const description = page.getByText(
    locale === 'zh-CN'
      ? '管理外部 Agent 注册项、检查调度就绪状态并查看持久任务。'
      : 'Manage external agent registrations, check dispatch readiness, and inspect durable tasks.',
    { exact: true },
  );
  await description.scrollIntoViewIfNeeded();
  await expect(description).toBeInViewport();
  await capture(page, `${locale}-external-agents`);
}

async function inspectSettings(page: Page, locale: Locale): Promise<void> {
  for (const tab of [
    'preferences',
    'providers',
    'runtime',
    'extensions',
    'license',
    'diagnostics',
  ]) {
    await page.locator(`#settings-tab-${tab}`).click();
    const panel = page.locator(`#settings-panel-${tab}`);
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText(/0\.7\.62|0\.7\.78|F138|v0\.1\.x/);
    if (tab === 'extensions') {
      await expect(panel.getByRole('status').filter({ hasText: /^(Loading|加载中)$/ })).toHaveCount(
        0,
      );
    }
    await capture(page, `${locale}-settings-${tab}`);
    if (tab === 'runtime') await inspectRuntimeCopy(page, locale);
  }
}

async function inspectHelp(page: Page, locale: Locale): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-workspace')).toHaveCount(0);
  await page.keyboard.press('?');
  await expect(
    page.getByRole('heading', {
      name: locale === 'zh-CN' ? '键盘快捷键和命令' : 'Keyboard shortcuts & commands',
    }),
  ).toBeVisible();
  const forkLabel = page.getByText(
    locale === 'zh-CN'
      ? '从最近已加载轮次分支为新会话'
      : 'Fork the latest loaded turn into a new session',
    { exact: true },
  );
  await expect(forkLabel).toBeVisible();
  expect(await forkLabel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await expect(
    page.getByText(
      locale === 'zh-CN' ? '打开模型与推理选择器' : 'Open model and reasoning picker',
      { exact: true },
    ),
  ).toBeVisible();
  await capture(page, `${locale}-help`);
  const compact = page.getByText(locale === 'zh-CN' ? '立即压缩上下文' : 'Compact context now', {
    exact: true,
  });
  await compact.scrollIntoViewIfNeeded();
  await expect(compact).toBeInViewport();
  await capture(page, `${locale}-help-commands`);
  await page.keyboard.press('Escape');
}

async function inspectPanelShortcuts(page: Page): Promise<void> {
  for (const [shortcut, panel] of [
    ['Control+Shift+V', 'preview'],
    ['Control+Shift+D', 'diff'],
    ['Control+Backquote', 'terminal'],
  ]) {
    await page.getByTestId('settings-button').focus();
    await page.keyboard.press(shortcut);
    await expect(page.getByTestId(`popout-${panel}`)).toBeVisible();
    await page.getByTestId('settings-button').focus();
    await page.keyboard.press(shortcut);
    await expect(page.getByTestId(`popout-${panel}`)).toHaveCount(0);
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`settings and help describe current capabilities in ${locale}`, async () => {
    test.setTimeout(90_000);
    const space = await launchSpace(`product-information-${locale}-${Date.now()}`);
    try {
      const { page } = space;
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByTestId('settings-button').click();
      if (locale === 'zh-CN') {
        await page.getByRole('button', { name: '简体中文', exact: true }).click();
        await page.getByRole('button', { name: '浅色', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Dark', exact: true }).click();
      }
      await expect(page.getByText('显示语言已更新', { exact: true })).toHaveCount(0);
      await inspectSettings(page, locale);
      await inspectHelp(page, locale);
      await inspectPanelShortcuts(page);
    } finally {
      await space.close();
    }
  });
}
