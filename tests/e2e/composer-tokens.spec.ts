import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchSpace } from './fixtures.js';

test('file completion is atomic and sends exactly the existing path reference', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodax-composer-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'composer-demo.ts'), 'export const demo = 1;');
  const space = await launchSpace(`composer-${Date.now()}`);
  try {
    await space.seedProject(root);
    const page = space.page;
    const input = page.getByTestId('composer-input');
    await input.fill('Inspect @composer-demo');
    await expect(page.getByRole('option', { name: /composer-demo.ts/ })).toBeVisible();
    await input.press('Enter');
    await expect(input.locator('[data-composer-token="file"]')).toHaveText('composer-demo.ts');
    await expect(page.getByTestId('sidebar-session-row')).toHaveCount(0);
    await input.press('Backspace');
    await expect(input).toHaveText('Inspect');
    await input.press('ControlOrMeta+z');
    await expect(input.locator('[data-composer-token]')).toHaveCount(1);
    for (const dark of [false, true]) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle('dark', value),
        dark,
      );
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`composer-${dark ? 'dark' : 'light'}.png`),
      });
    }
    await page.setViewportSize({ width: 760, height: 800 });
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('composer-narrow.png'),
    });
    await space.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('session.send');
      ipcMain.handle('session.send', (_event, payload: unknown) => {
        (globalThis as unknown as { composerSent?: unknown }).composerSent = payload;
        return {
          ok: false,
          error: {
            code: 'ERR_TEST_REJECTED',
            message: 'Test send rejected to verify draft restoration',
          },
        };
      });
    });
    await input.press('Enter');
    await expect
      .poll(() =>
        space.app.evaluate(
          () => (globalThis as unknown as { composerSent?: unknown }).composerSent,
        ),
      )
      .toBeTruthy();
    const sent = await space.app.evaluate(
      () => (globalThis as unknown as { composerSent: { prompt: string } }).composerSent,
    );
    expect(sent.prompt).toBe('Inspect @src/composer-demo.ts');
    await expect(input.locator('[data-composer-token]')).toHaveCount(1);
  } finally {
    await space.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('command and skill selection stays local and shows distinct tokens', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodax-command-'));
  const space = await launchSpace(`composer-command-${Date.now()}`);
  try {
    await space.seedProject(root);
    const page = space.page;
    const input = page.getByTestId('composer-input');
    await input.fill('/help');
    await expect(page.locator('[data-completion-kind="slash"]').first()).toBeVisible();
    await input.press('Enter');
    await expect(input.locator('[data-composer-token="command"]')).toHaveText('/help');
    await expect(page.getByTestId('sidebar-session-row')).toHaveCount(0);
    await input.press('Backspace');
    await expect(input).toHaveText('');
    await input.fill('/');
    const skill = page.locator('[data-completion-kind="skill"]').first();
    await expect(skill).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('completion-groups.png') });
    const label = await skill.locator('.composer-completion-name').innerText();
    await skill.click();
    await expect(input.locator('[data-composer-token="skill"]')).toHaveText(label);
    await expect(page.getByTestId('sidebar-session-row')).toHaveCount(0);
    await input.press('Backspace');
    await expect(input).toHaveText('');
  } finally {
    await space.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
