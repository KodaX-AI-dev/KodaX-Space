import { expect, test } from '@playwright/test';
import { launchSpace } from './fixtures.js';

test('settings requires separate confirmation for download and installation', async () => {
  const space = await launchSpace(`manual-update-${Date.now()}`);
  try {
    await space.app.evaluate(({ ipcMain, BrowserWindow }) => {
      const calls = { checks: 0, downloads: [] as string[], installs: [] as string[] };
      let state: Record<string, unknown> = { state: 'idle' };
      Object.assign(globalThis, { manualUpdateCalls: calls });
      const push = () =>
        BrowserWindow.getAllWindows().forEach((win) =>
          win.webContents.send('updater.status', state),
        );
      for (const name of [
        'updater.getState',
        'updater.check',
        'updater.download',
        'updater.install',
      ])
        ipcMain.removeHandler(name);
      ipcMain.handle('updater.getState', () => ({ ok: true, data: { enabled: true, state } }));
      ipcMain.handle('updater.check', () => {
        calls.checks++;
        state = { state: 'available', version: '0.1.48' };
        push();
        return { ok: true, data: { enabled: true, state } };
      });
      ipcMain.handle('updater.download', (_, input: { version: string }) => {
        calls.downloads.push(input.version);
        state = { state: 'ready', version: input.version };
        push();
        return { ok: true, data: { accepted: true } };
      });
      ipcMain.handle('updater.install', (_, input: { version: string }) => {
        calls.installs.push(input.version);
        return { ok: true, data: { accepted: true } };
      });
    });
    const calls = () =>
      space.app.evaluate(
        () =>
          (
            globalThis as unknown as {
              manualUpdateCalls: { checks: number; downloads: string[]; installs: string[] };
            }
          ).manualUpdateCalls,
      );
    await space.page.getByTestId('settings-button').click();
    const section = space.page.getByTestId('update-settings');
    await expect(
      section.getByRole('button', { name: 'Check for updates', exact: true }),
    ).toBeEnabled();
    expect(await calls()).toEqual({ checks: 0, downloads: [], installs: [] });
    await section.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await section.getByRole('button', { name: 'Download update', exact: true }).click();
    await space.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    expect((await calls()).downloads).toEqual([]);
    await section.getByRole('button', { name: 'Download update', exact: true }).click();
    await space.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await expect(
      section.getByRole('button', { name: 'Restart & install', exact: true }),
    ).toBeVisible();
    expect((await calls()).downloads).toEqual(['0.1.48']);
    await section.getByRole('button', { name: 'Restart & install', exact: true }).click();
    await space.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    expect((await calls()).installs).toEqual([]);
    await section.getByRole('button', { name: 'Restart & install', exact: true }).click();
    await space.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await expect.poll(async () => (await calls()).installs).toEqual(['0.1.48']);
    await expect(section.getByRole('button', { name: 'Installing...', exact: true })).toBeDisabled();
  } finally {
    await space.close();
  }
});
