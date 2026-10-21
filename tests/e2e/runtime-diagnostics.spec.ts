import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchSpace } from './fixtures.js';

test('runtime diagnostics reports the running build and its declared SDK dependency', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../../apps/desktop/package.json', import.meta.url), 'utf8'),
  ) as { version: string; dependencies: Record<string, string> };
  const space = await launchSpace(`runtime-diagnostics-${Date.now()}`);
  try {
    const { page } = space;
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('button', { name: 'Runtime diagnostics', exact: true }).click();
    const result = await page.evaluate(() => window.kodaxSpace.invoke('space.version', undefined));
    if (!result.ok) throw new Error(result.error.message);
    const evidence = process.env.SPACE_VISUAL_AUDIT_DIR;
    if (evidence) {
      await mkdir(evidence, { recursive: true });
      await writeFile(path.join(evidence, 'version.json'), JSON.stringify(result.data, null, 2));
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(evidence, 'diagnostics.png') });
    }
    expect(result.data.spaceVersion).toBe(manifest.version);
    expect(result.data.kodaxDependencySpec).toBe(manifest.dependencies['@kodax-ai/kodax']);
    expect(result.data.capabilityContract).toBe(`space-${manifest.version}`);
    await expect(page.locator('[data-capability-id]')).toHaveCount(result.data.capabilities.length);
  } finally {
    await space.close();
  }
});

test('an open diagnostics panel follows Runtime readiness instead of retaining its startup snapshot', async () => {
  const space = await launchSpace(`runtime-diagnostics-ready-${Date.now()}`, {
    env: { KODAX_INTERNAL_DAEMON_TEST_READY_DELAY_MS: '4000' },
  });
  try {
    const { page } = space;
    await page.getByRole('button', { name: 'Runtime diagnostics', exact: true }).click();
    await expect
      .poll(
        async () => {
          const result = await page.evaluate(() =>
            window.kodaxSpace.invoke('space.version', undefined),
          );
          if (!result.ok) throw new Error(result.error.message);
          return result.data.capabilities.find((row) => row.id === 'runtime.hostAdapter')?.status;
        },
        { timeout: 20_000 },
      )
      .toBe('supported');
    const row = page.getByText('Runtime Host Adapter', { exact: true }).locator('..');
    await expect(row).toContainText(/supported|Available/);
  } finally {
    await space.close();
  }
});

test('Chinese diagnostics explains current capability limits and preserves technical details', async () => {
  const space = await launchSpace(`runtime-diagnostics-language-${Date.now()}`);
  try {
    const { page } = space;
    await page.getByTestId('settings-button').click();
    await page.getByRole('button', { name: '简体中文', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '运行时诊断', exact: true }).click();
    await expect(page.getByText('记忆能力', { exact: true })).toBeVisible();
    const panel = page.getByRole('region', { name: '运行时诊断', exact: true });
    await expect(panel).toContainText('部分支持');
    await expect(panel).not.toContainText('Space v0.1.42');
    await panel.getByText('技术详情', { exact: true }).click();
    await expect(panel).toContainText('SDK 声明依赖');
    await expect(panel).toContainText('0.7.97-alpha.9');
    await expect(panel).not.toContainText('unknown');
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  } finally {
    await space.close();
  }
});

test('diagnostics remains readable in both themes and short windows', async () => {
  const space = await launchSpace(`runtime-diagnostics-layout-${Date.now()}`);
  try {
    const { page } = space;
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByTestId('settings-button').click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.getByRole('button', { name: '简体中文', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '运行时诊断', exact: true }).click();
    await expect(page.locator('[data-capability-id="runtime.hostAdapter"]')).toContainText('可用');
    await expect(page.getByText('显示语言已更新', { exact: true })).toBeHidden();
    await captureDiagnostics(page, 'zh-dark');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-button').click();
    await page.getByRole('button', { name: '浅色', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '运行时诊断', exact: true }).click();
    await captureDiagnostics(page, 'zh-light');
    await page.setViewportSize({ width: 640, height: 480 });
    await captureDiagnostics(page, 'zh-narrow');
    const details = page.getByText('技术详情', { exact: true });
    await details.focus();
    await expect(details).toBeInViewport();
    await details.press('Enter');
    await page
      .getByText('SDK 声明依赖', { exact: true })
      .evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await expect(page.getByText('0.7.97-alpha.9', { exact: true })).toBeInViewport();
    await captureDiagnostics(page, 'zh-technical');
    await page.setViewportSize({ width: 1280, height: 400 });
    const refresh = page.getByRole('button', { name: '刷新诊断', exact: true });
    await expect(refresh).toBeInViewport();
    await refresh.click();
    await captureDiagnostics(page, 'zh-short');
    await inspectEnglishDiagnostics(page);
  } finally {
    await space.close();
  }
});

async function inspectEnglishDiagnostics(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByTestId('settings-button').click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Runtime diagnostics', exact: true }).click();
  await expect(page.getByText('Memory capabilities', { exact: true })).toBeVisible();
  await captureDiagnostics(page, 'en-light');
}

async function captureDiagnostics(page: Page, name: string): Promise<void> {
  const panel = page.getByRole('region', { name: /运行时诊断|Runtime diagnostics/ });
  await expect(panel).toBeVisible();
  await page.waitForTimeout(250);
  const bounds = await panel.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error('Missing diagnostics geometry');
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  const evidence = process.env.SPACE_VISUAL_AUDIT_DIR;
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: path.join(evidence, `${name}.png`) });
}
