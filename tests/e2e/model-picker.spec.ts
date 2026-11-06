import { test, expect } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { launchSpace } from './fixtures.js';

test('Escape dismisses composer selectors without changing their selection', async () => {
  const space = await launchSpace(`composer-selectors-escape-${Date.now()}`);
  try {
    const { page } = space;
    const controls = [page.getByTitle(/^Mode:/), page.getByTestId('model-effort-selector')];
    for (const control of controls) {
      const selection = await control.textContent();
      await control.click();
      await expect(control).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(control).toHaveAttribute('aria-expanded', 'false');
      await expect(control).toHaveText(selection ?? '');
    }
  } finally {
    await space.close();
  }
});

test('unknown reasoning controls preserve selection before and after Mock session creation', async () => {
  const testId = `reasoning-picker-${Date.now()}`;
  const space = await launchSpace(testId, { env: { OPENAI_API_KEY: 'e2e-placeholder' } });
  const projectDir = path.join(space.testDataDir, 'reasoning-project');
  try {
    await fs.mkdir(projectDir, { recursive: true });
    await space.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('provider.modelContextWindow');
      ipcMain.handle('provider.modelContextWindow', () => ({
        ok: true,
        data: { contextWindow: 200000, source: 'fallback', compactionTriggerPercent: 75 },
      }));
    });
    await space.seedProject(projectDir);
    const selector = space.page.getByTestId('model-effort-selector');
    await selector.click();
    await space.page.locator('button[title="OpenAI"]').click();
    await space.page.getByRole('button', { name: 'gpt-5.4', exact: true }).click();
    await selector.click();
    await expect(space.page.getByText('Capabilities unknown.', { exact: false })).toBeVisible();
    for (const label of ['Off', 'Auto', 'Low', 'Medium', 'High', 'XHigh', 'Max']) {
      await expect(space.page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await expect(space.page.getByRole('button', { name: 'Minimal', exact: true })).toHaveCount(0);
    await space.page.getByRole('button', { name: 'Off', exact: true }).click();
    await space.page.keyboard.press('Control+i');
    await expect(space.page.getByText('Capabilities unknown.', { exact: false })).toHaveCount(0);
    const textarea = space.page.getByTestId('composer-input');
    await textarea.click();
    await textarea.fill('reasoning observation fixture');
    await textarea.press('Enter');
    await expect(selector).toHaveAttribute('aria-label', 'Change provider, model, and effort');
    // Mock execution has no real Run that synchronizes pending SDK settings.
    // Canonical wire observations have their own browser contract test.
    await selector.click();
    await space.page.getByRole('button', { name: 'Off', exact: true }).click();
    await expect(selector).toContainText('Off');
    await space.page.screenshot({ path: test.info().outputPath('reasoning-picker.png') });
    await space.page.getByRole('button', { name: 'Max', exact: true }).click();
    await expect(selector).toContainText('Max');
  } finally {
    await space.close();
  }
});

test('provider/model picker applies selections before and after session creation', async () => {
  const testId = `model-picker-${Date.now()}`;
  const projectDir = path.join(os.tmpdir(), `kodax-test-${testId}-project`);
  await fs.mkdir(projectDir, { recursive: true });

  const rendererWarnings: string[] = [];
  let space: Awaited<ReturnType<typeof launchSpace>> | undefined;
  try {
    space = await launchSpace(testId, {
      env: {
        ANTHROPIC_API_KEY: 'e2e-placeholder',
        OPENAI_API_KEY: 'e2e-placeholder',
        SPACE_DISABLE_HARDWARE_ACCELERATION: '1',
      },
      onConsole: (message) => {
        if (message.type === 'warning' || message.type === 'error') {
          rendererWarnings.push(message.text);
        }
      },
    });
    await space.seedProject(projectDir);
    const selector = space.page.getByTestId('model-effort-selector');
    await expect(selector).toBeVisible({ timeout: 10_000 });

    await selector.click();
    await space.page.locator('button[title="OpenAI"]').click();
    await space.page.getByRole('button', { name: 'gpt-5.4', exact: true }).click();
    await expect(selector).toContainText('gpt-5.4');

    const textarea = space.page.getByTestId('composer-input');
    await expect(textarea).toBeEnabled({ timeout: 10_000 });
    await textarea.fill('model picker active-session check');
    await textarea.press('Enter');
    await expect(selector).toHaveAttribute('aria-label', 'Change provider, model, and effort', {
      timeout: 15_000,
    });

    await selector.click();
    await space.page.locator('button[title="Anthropic"]').click();
    await space.page.getByRole('button', { name: 'claude-opus-4-8', exact: true }).click();
    await expect(selector).toContainText('claude-opus-4-8');
    expect(rendererWarnings.filter((message) => message.includes('[picker]'))).toEqual([]);
  } finally {
    await space?.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});
