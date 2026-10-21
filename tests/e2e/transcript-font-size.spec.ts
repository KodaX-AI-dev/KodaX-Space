import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { launchSpace } from './fixtures.js';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

// Public seam: the actual view menu must change rendered conversation text.
test('transcript font buttons visibly resize existing conversation text', async () => {
  const space = await launchSpace(`transcript-font-${Date.now()}`);
  try {
    const { page } = space;
    await page.setViewportSize({ width: 1920, height: 1032 });
    const composer = page.locator('.composer-surface textarea');
    await expect(composer).toBeEnabled();
    await composer.fill('检查对话文字大小是否随菜单选择真正变化');
    await composer.press('Enter');
    const paragraph = page.locator('.conversation-assistant .markdown-body p').first();
    await expect(paragraph).toBeVisible();
    await page.getByRole('button', { name: 'Transcript view', exact: true }).click();
    const sizes: number[] = [];
    for (const size of ['Small font', 'Medium font', 'Large font']) {
      await page.getByTitle(`Font: ${size}`, { exact: true }).click();
      sizes.push(await paragraph.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)));
    }
    await test.info().attach('rendered-font-sizes', {
      body: JSON.stringify(sizes),
      contentType: 'application/json',
    });
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    expect(sizes[2]).toBeGreaterThan(sizes[1]);
    await captureFontChoices(page);
  } finally {
    await space.close();
  }
});

test('the empty workspace offers a live message-font preview and reachable zoom controls', async () => {
  const space = await launchSpace(`empty-transcript-font-${Date.now()}`);
  try {
    const { page } = space;
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.getByRole('button', { name: 'Transcript view', exact: true }).click();
    const fonts = page.getByRole('group', { name: 'Message text size', exact: true });
    await expect(fonts).toBeVisible();
    const preview = page.getByTestId('transcript-font-preview');
    const sizes: number[] = [];
    for (const size of ['Small font', 'Medium font', 'Large font']) {
      const choice = fonts.getByRole('button', { name: `Font: ${size}`, exact: true });
      await choice.click();
      await expect(choice).toHaveAttribute('aria-pressed', 'true');
      sizes.push(await preview.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)));
    }
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    expect(sizes[2]).toBeGreaterThan(sizes[1]);
    await expect(fonts).toContainText('Use Zoom below to resize the interface');
    const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
    await zoom.focus();
    await expect(zoom).toBeInViewport();
  } finally {
    await space.close();
  }
});

test('a real SDK conversation keeps its chosen font sizes after reload', async () => {
  test.setTimeout(60_000);
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-transcript-font-${Date.now()}`, provider.url);
  try {
    const { page } = space;
    await sendSdkPrompt(space, 'FONT_CHECK');
    await waitSdkIdle(space, await currentSdkSession(space));
    const paragraph = page.locator('.conversation-assistant .markdown-body p').first();
    await expect(paragraph).toContainText('SDK_REPLY:FONT_CHECK');
    for (const size of ['Small font', 'Medium font', 'Large font']) {
      await page.getByRole('button', { name: 'Transcript view', exact: true }).click();
      await page.getByTitle(`Font: ${size}`, { exact: true }).click();
      const chosenSize = await paragraph.evaluate((node) => getComputedStyle(node).fontSize);
      await page.keyboard.press('Escape');
      await page.reload();
      await page.getByTestId('sidebar-session-row').first().click();
      await expect(paragraph).toContainText('SDK_REPLY:FONT_CHECK');
      await expect(paragraph).toHaveCSS('font-size', chosenSize);
    }
  } finally {
    await provider.close();
    await space.close();
  }
});

async function captureFontChoices(page: Page): Promise<void> {
  const evidence = process.env.SPACE_VISUAL_AUDIT_DIR;
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-button').click();
  const settings = page.getByTestId('settings-workspace');
  await settings.getByRole('button', { name: 'Dark', exact: true }).click();
  await settings.getByRole('button', { name: '简体中文', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '对话视图', exact: true }).click();
  for (const [name, label] of [
    ['small', '小字号'],
    ['medium', '中字号'],
    ['large', '大字号'],
  ]) {
    await page.getByTitle(`字号：${label}`, { exact: true }).click();
    const paragraph = page.locator('.conversation-assistant .markdown-body p').first();
    const font = await paragraph.evaluate((node) => getComputedStyle(node).fontSize);
    await expect(page.getByTestId('transcript-font-preview')).toHaveCSS('font-size', font);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(evidence, `font-${name}.png`) });
  }
}
