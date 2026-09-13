import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchSpace } from './fixtures.js';

test('history rejection restores the draft and retries the same Session with a new operation', async () => {
  test.setTimeout(60_000);
  const project = await mkdtemp(path.join(os.tmpdir(), 'kodax-send-retry-'));
  const space = await launchSpace(`send-retry-${Date.now()}`);
  try {
    await space.seedProject(project);
    await space.app.evaluate(({ ipcMain }) => {
      const calls: Array<{ sessionId: string; operationId: string }> = [];
      ipcMain.removeHandler('session.send');
      ipcMain.handle(
        'session.send',
        (_event, input: { sessionId: string; operationId: string }) => {
          calls.push(input);
          if (calls.length === 2) {
            if (
              input.sessionId !== calls[0]!.sessionId ||
              input.operationId === calls[0]!.operationId
            ) {
              return {
                ok: false,
                error: { code: 'HANDLER_ERROR', message: 'stale retry identity' },
              };
            }
            return { ok: true, data: { accepted: true, queued: false } };
          }
          return {
            ok: true,
            data: {
              accepted: false,
              reason: 'session_history_unavailable',
              queueMode: 'interrupt',
            },
          };
        },
      );
    });
    const composer = space.page.locator('textarea').first();
    await expect(composer).toBeEnabled();
    await composer.fill('retry this exact message');
    await composer.press('Enter');
    const rejection = 'Message not sent: reading the session history timed out.';
    await expect(space.page.getByText(rejection, { exact: false })).toBeVisible();
    await expect(composer).toHaveValue('retry this exact message');
    await expect(composer).toBeEnabled();
    await composer.press('Enter');
    await expect(composer).toHaveValue('');
    await expect(space.page.getByText(rejection, { exact: false })).toHaveCount(0);
    await expect(space.page.getByText('stale retry identity', { exact: false })).toHaveCount(0);
    await expect(
      space.page
        .getByTestId('conversation-stream')
        .getByText('retry this exact message', { exact: true }),
    ).toHaveCount(1);

    // Quick Ask consumes the same structured rejection without waiting for nonexistent events.
    await space.page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    const quickAsk = space.page.getByRole('dialog', { name: 'Quick Ask' });
    await quickAsk.locator('textarea').fill('quick ask failure');
    await quickAsk.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(quickAsk.getByText(rejection, { exact: false })).toBeVisible();
    await expect(quickAsk.locator('textarea')).toHaveValue('quick ask failure');
    await expect(quickAsk.locator('textarea')).toBeEnabled();
    await expect(quickAsk.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
  } finally {
    await space.close();
    await rm(project, { recursive: true, force: true });
  }
});
