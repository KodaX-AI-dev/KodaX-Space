import { test, expect } from '@playwright/test';
import { launchSpace } from './fixtures.js';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test('settings is a work surface that preserves the composer and all appearance choices', async () => {
  test.setTimeout(60_000);
  const space = await launchSpace(`integrated-workspace-${Date.now()}`);
  try {
    const { page } = space;
    const composer = page.locator('[data-testid="coder-workspace"] textarea');
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill('Keep this draft while changing appearance');
    await page.getByTestId('settings-button').click();
    const settings = page.getByRole('region', { name: 'Settings', exact: true });
    await expect(settings).toBeVisible();
    await expect(page.getByTestId('left-sidebar')).toBeVisible();
    await expect(composer).toBeAttached();
    await expect(composer).not.toBeVisible();
    await expect(settings.getByRole('tab')).toHaveCount(6);
    await settings.getByRole('tab', { name: 'Preferences', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(
      settings.getByRole('button', { name: 'Back to workspace', exact: true }),
    ).toBeFocused();
    await settings.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    for (const quality of ['Minimal', 'Balanced', 'Full']) {
      await settings.getByRole('button', { name: quality, exact: true }).click();
      await expect(page.locator('html')).toHaveClass(new RegExp(`q-${quality.toLowerCase()}`));
      expect(
        await page
          .getByTestId('coder-workspace')
          .evaluate((node) => getComputedStyle(node).backdropFilter),
      ).toBe('none');
      if (quality === 'Minimal') {
        expect(
          await page
            .locator('.settings-navigation')
            .evaluate((node) => getComputedStyle(node).backdropFilter),
        ).toBe('none');
      }
    }
    await settings.getByRole('button', { name: 'System', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('kodax-space.theme')))
      .toBe('system');
    await settings.getByRole('button', { name: 'Dark', exact: true }).click();
    await settings.getByRole('button', { name: 'Balanced', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await settings.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    await page.setViewportSize({ width: 640, height: 800 });
    await expect(settings.getByRole('button', { name: 'Close settings' })).toBeInViewport();
    await expect(settings.getByRole('tab', { name: 'Preferences', exact: true })).toBeInViewport();
    await page.setViewportSize({ width: 1280, height: 800 });
    await settings.getByRole('button', { name: 'Close settings' }).click();
    await expect(composer).toBeVisible();
    await expect(composer).toHaveValue('Keep this draft while changing appearance');
    await page.getByRole('button', { name: 'Results', exact: true }).click();
    const results = page.getByTestId('popout-artifact');
    await expect(results).toBeVisible();
    await page.getByTestId('settings-button').click();
    await expect(results).toBeAttached();
    await expect(results).not.toBeVisible();
    await page.evaluate(() =>
      window.dispatchEvent(new Event('kodax-space.open-provider-settings')),
    );
    await expect(page.locator('#settings-panel-providers')).toBeVisible();
    await expect(page.getByTestId('settings-workspace')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
    await expect(results).toBeVisible();
    await expect(composer).toHaveValue('Keep this draft while changing appearance');
  } finally {
    await space.close();
  }
});

test('two projects keep real SDK runs active while settings and review surfaces change', async () => {
  const testInfo = test.info();
  test.setTimeout(150_000);
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`integrated-parallel-${Date.now()}`, provider.url);
  try {
    const { page } = space;
    await sendSdkPrompt(space, 'HOLD_CANCEL');
    await expect.poll(() => provider.requests).toContain('HOLD_CANCEL');
    const firstId = await currentSdkSession(space);
    const secondProject = path.join(space.testDataDir, 'Atlas Web');
    await mkdir(secondProject);
    await space.seedProject(secondProject);
    await page.getByRole('button', { name: 'New session', exact: true }).click();
    await sendSdkPrompt(space, 'STREAM_PRODUCT');
    await expect.poll(() => provider.requests).toContain('STREAM_PRODUCT');
    const secondId = await currentSdkSession(space);
    expect(secondId).not.toBe(firstId);
    const secondRow = page.locator(
      `[data-session-id="${secondId}"][data-testid="sidebar-session-row"]`,
    );
    await expect(secondRow.locator('.sidebar-status-spinner')).toBeVisible();
    await page.getByTestId('settings-button').click();
    const settings = page.getByTestId('settings-workspace');
    await expect(settings).toBeVisible();
    await expect(page.getByTestId('left-sidebar')).toContainText('Atlas Web');
    const firstLive = await page.evaluate(
      (sessionId) => window.kodaxSpace.invoke('session.liveSnapshot', { sessionId }),
      firstId,
    );
    expect(firstLive.ok && firstLive.data.activeRun).toBeTruthy();
    await settings.getByRole('button', { name: 'Dark', exact: true }).click();
    await settings.getByRole('button', { name: 'Balanced', exact: true }).click();
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('settings-dark.png'),
    });
    await settings.getByRole('button', { name: 'Light', exact: true }).click();
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('settings-light.png'),
    });
    provider.release('HOLD_CANCEL');
    await waitSdkIdle(space, firstId);
    await expect(secondRow.locator('.sidebar-status-spinner')).toBeVisible();
    await settings.getByRole('button', { name: 'Back to workspace', exact: true }).click();
    await expect(page.getByTestId('conversation-stream')).toContainText('SDK_PARTIAL');
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('workspace-light.png'),
    });
    await page.getByTestId('settings-button').click();
    await settings.getByRole('button', { name: 'Dark', exact: true }).click();
    await settings.getByRole('button', { name: 'Close settings' }).click();
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('workspace-dark.png'),
    });
    await page.getByRole('button', { name: 'Results', exact: true }).click();
    await expect(page.getByTestId('popout-artifact')).toBeVisible();
    await page
      .getByTestId('popout-artifact')
      .getByRole('button', { name: 'Focus Mode', exact: true })
      .click();
    await expect(page.getByTestId('left-sidebar')).toHaveCount(0);
    await page.keyboard.press('Control+,');
    await expect(settings).toBeVisible();
    await expect(page.getByTestId('left-sidebar')).toBeVisible();
    await page.keyboard.press('Control+Backslash');
    await expect(page.getByTestId('left-sidebar')).toBeVisible();
    await settings.getByRole('button', { name: 'Back to workspace', exact: true }).click();
    await expect(page.getByTestId('left-sidebar')).toHaveCount(0);
    await page
      .getByTestId('popout-artifact')
      .getByRole('button', { name: 'Exit focus', exact: true })
      .click();
    await expect(page.getByTestId('left-sidebar')).toBeVisible();
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    await expect(page.getByTestId('popout-artifact')).toHaveCount(0);
    provider.release('STREAM_PRODUCT');
    await waitSdkIdle(space, secondId);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});
