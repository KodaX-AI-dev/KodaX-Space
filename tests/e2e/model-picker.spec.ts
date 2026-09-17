import { test, expect } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { launchSpace } from './fixtures.js';

test('unknown reasoning controls preserve selection and show last sent effort separately', async () => {
  const testId = `reasoning-picker-${Date.now()}`;
  const space = await launchSpace(testId, { env: { OPENAI_API_KEY: 'e2e-placeholder' } });
  const projectDir = path.join(space.testDataDir, 'reasoning-project');
  try {
    await fs.mkdir(projectDir, { recursive: true });
    await space.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('provider.modelContextWindow');
      ipcMain.handle('provider.modelContextWindow', () => ({
        ok: true, data: { contextWindow: 200000, source: 'fallback', compactionTriggerPercent: 75 },
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
    const textarea = space.page.locator('textarea').first();
    await textarea.click();
    await textarea.fill('reasoning observation fixture');
    await textarea.press('Enter');
    await expect(selector).toHaveAttribute('aria-label', 'Change provider, model, and effort');
    const session = await space.page.evaluate(async () => {
      const result = await window.kodaxSpace.invoke('session.list', { surface: 'code' });
      if (!result.ok || !result.data.sessions[0]) throw new Error('Test session unavailable');
      return result.data.sessions[0];
    });
    await space.app.evaluate(({ BrowserWindow }, current) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('session.event', {
        kind: 'reasoning_resolved', sessionId: current.sessionId,
        resolution: { provider: current.provider, model: current.model ?? 'gpt-5.4',
          requestedEffort: 'none', sentEffort: 'minimal', verified: false,
          fallbacks: [{ effort: 'none', reason: 'cached-rejection' }] },
      });
    }, session);
    await space.page.keyboard.press('Control+i');
    await expect(selector).toContainText('Off');
    const observation = space.page.getByTestId('reasoning-resolution');
    await expect(observation).toContainText('Last request sent: Minimal. Effective strength unconfirmed.');
    await expect(observation).toContainText('Skipped a previously rejected setting');
    await space.page.screenshot({ path: test.info().outputPath('reasoning-picker.png') });
    await space.page.getByRole('button', { name: 'Max', exact: true }).click();
    await expect(selector).toContainText('Max');
    await expect(observation).toHaveCount(0);
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

    const textarea = space.page.locator('textarea').first();
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
