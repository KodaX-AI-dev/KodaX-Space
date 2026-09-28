import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchSpace } from './fixtures.js';

test('queued message notification leaves the composer accessible at narrow and wide sizes', async () => {
  test.setTimeout(90_000);
  const project = await mkdtemp(path.join(os.tmpdir(), 'kodax-queue-toast-'));
  const space = await launchSpace(`queue-toast-${Date.now()}`);
  try {
    await space.seedProject(project);
    await space.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('session.send');
      ipcMain.handle('session.send', () => ({
        ok: true,
        data: {
          accepted: true,
          queued: true,
          queueMode: 'after-turn',
          queueId: 'fixture-queue',
        },
      }));
    });
    for (const [width, height] of [
      [1920, 1152],
      [1024, 768],
      [480, 640],
    ]) {
      await space.app.evaluate(
        ({ BrowserWindow }, size) => {
          const window = BrowserWindow.getAllWindows().find((candidate) =>
            candidate.webContents.getURL().startsWith('app://space/'),
          )!;
          window.setMinimumSize(320, 400);
          window.setSize(size.width, size.height);
        },
        { width: width!, height: height! },
      );
      const composer = space.page.locator('textarea').first();
      await expect(composer).toBeEnabled();
      await composer.fill(`next message ${width}`);
      await composer.press('Enter');
      const toast = space.page
        .getByRole('status')
        .filter({ hasText: /queued/i })
        .last();
      await expect(toast).toBeVisible();
      const toastBox = await toast.boundingBox();
      const composerBox = await composer.boundingBox();
      expect(toastBox).not.toBeNull();
      expect(composerBox).not.toBeNull();
      expect(toastBox!.y + toastBox!.height).toBeLessThan(composerBox!.y);
      await expect(composer).toHaveValue('');
      await composer.fill('can still type');
      await toast.getByRole('button').click();
      await expect(toast).toHaveCount(0);
    }
  } finally {
    await space.close();
    await rm(project, { recursive: true, force: true });
  }
});
