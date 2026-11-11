import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchSpace } from './fixtures.js';

test('complete exit cancels a cold startup without requiring force close', async () => {
  test.setTimeout(60_000);
  const space = await launchSpace(`startup-exit-${Date.now()}`, {
    env: {
      KODAX_FORCE_MOCK: '0',
      KODAX_INTERNAL_DAEMON_TEST_READY_DELAY_MS: '30000',
      SPACE_TEST_BYPASS_COMPLETE_EXIT: '0',
      SPACE_TEST_COMPLETE_EXIT_TRIGGER: '1',
      SPACE_DISABLE_TRAY: '0',
    },
  });
  try {
    await expect(space.page.getByTestId('runtime-startup-status')).toBeVisible();
    await expect
      .poll(
        () =>
          readFile(path.join(space.testDataDir, 'runtime/daemon/default/daemon.json'), 'utf8')
            .then((value) => (JSON.parse(value) as { status: string }).status)
            .catch(() => 'missing'),
        { timeout: 10_000 },
      )
      .toBe('starting');
    await space.page.clock.install();
    await space.page.clock.fastForward(35_000);
    await expect(space.page.getByTestId('runtime-startup-status')).toContainText(
      'longer than usual',
    );
    await expect
      .poll(async () =>
        Number(
          (await space.page.getByTestId('runtime-startup-elapsed').innerText()).match(/\d+/)?.[0],
        ),
      )
      .toBeGreaterThanOrEqual(35);
    await space.page.screenshot({ path: test.info().outputPath('startup-wait.png') });
    // A restored/new Session can already be admitted while it waits on the same cold Host.
    await space.page.evaluate((projectRoot) => {
      void window.kodaxSpace!.invoke('session.create', {
        projectRoot,
        surface: 'code',
        ephemeral: true,
      });
    }, space.testDataDir);
    const applicationProcess = space.app.process();
    await writeFile(path.join(space.testDataDir, 'space/complete-exit.trigger'), 'exit');
    await expect
      .poll(
        () =>
          space.app
            .evaluate(({ BrowserWindow }) =>
              BrowserWindow.getAllWindows().some((win) => win.isVisible()),
            )
            .catch(() => false),
        { timeout: 5_000 },
      )
      .toBe(false);
    // The SDK still owns the starting daemon. Finish its safe settlement after the hold,
    // without a ten-second admission warning or a user-confirmed forced exit.
    await expect.poll(() => applicationProcess.exitCode, { timeout: 40_000 }).toBe(0);
  } catch (error) {
    await test.info().attach('startup-exit-diagnostics', {
      body: await readFile(
        path.join(space.testDataDir, 'space/electron-user-data/diagnostics/space-main.jsonl'),
      ),
      contentType: 'application/json',
    });
    throw error;
  } finally {
    await space.close();
  }
});
