import { expect, test } from '@playwright/test';
import path from 'node:path';
import { launchSpace, type SpaceInstance } from './fixtures.js';
import { startConflictingHistoryHost } from './shared-host-fixture.js';
import { createLocalSdkProvider } from './sdk-provider-fixture.js';
import { stopOwnedTestDaemon } from './fixture-daemon-cleanup.js';

test.setTimeout(180_000);

for (const holdClient of [false, true]) {
  test(`shared default Host ${holdClient ? 'protects active work then self-heals' : 'recovers idle ownership'} and restores every selected history`, async () => {
    const provider = await createLocalSdkProvider();
    let owner: Awaited<ReturnType<typeof startConflictingHistoryHost>> | undefined;
    let space: SpaceInstance | undefined;
    try {
      space = await launchSpace(`shared-host-${holdClient}-${Date.now()}`, {
        env: { KODAX_FORCE_MOCK: '0' },
        prepareProfile: async (root) => {
          owner = await startConflictingHistoryHost(root, holdClient ? provider.url : undefined);
        },
      });
      await space.seedProject(path.join(space.testDataDir, 'workspace'));
      await space.page
        .getByTestId('sidebar-session-row')
        .filter({ hasText: 'ISSUE222 first history' })
        .click();
      if (holdClient) {
        await expect.poll(() => provider.requests).toContain('HOLD_QUEUE');
        await expect(space.page.getByTestId('history-paging-status')).toBeVisible({
          timeout: 15_000,
        });
        await expect(space.page.getByTestId('history-paging-status')).toContainText(
          'Host profile: default',
          { timeout: 15_000 },
        );
        await expect(space.page.getByTestId('history-paging-status')).toContainText('active_runs');
        // Cross the SDK's first startup deadline, exercising Space's continuing
        // recovery rather than a single successful foreground connection.
        await new Promise((resolve) => setTimeout(resolve, 65_000));
        expect(process.kill(owner!.pid, 0)).toBe(true);
        provider.release('HOLD_QUEUE');
        await owner!.release();
      }
      for (const label of ['first', 'second']) {
        if (label === 'second')
          await space.page
            .getByTestId('sidebar-session-row')
            .filter({ hasText: `ISSUE222 ${label} history` })
            .click();
        const conversation = space.page.getByTestId('conversation-stream');
        await expect(conversation).toContainText(`saved question ${label}`, { timeout: 35_000 });
        await expect(conversation).toContainText(`saved answer ${label}`, { timeout: 35_000 });
        await expect(space.page.getByTestId('history-runtime-unavailable')).toHaveCount(0);
      }
      if (!holdClient) {
        const readConnection = () =>
          space!.page.evaluate(async () => {
            const result = await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined);
            if (!result.ok) throw new Error('Runtime profile read failed');
            return result.data.connection;
          });
        const beforeExit = await readConnection();
        expect(beforeExit.state).toBe('ready');
        expect(await stopOwnedTestDaemon(space.testDataDir)).toBe(true);
        // The same selected history must reattach after a real isolated Host exit.
        // Reading this IPC snapshot is passive; it must not trigger startup.
        await expect
          .poll(
            async () => {
              const connection = await readConnection();
              return connection.state === 'ready' && connection.runtimeId !== beforeExit.runtimeId;
            },
            { timeout: 35_000 },
          )
          .toBe(true);
        await expect(space.page.getByTestId('conversation-stream')).toContainText(
          'saved answer second',
        );
      }
    } finally {
      provider.release('HOLD_QUEUE');
      await space?.app.close().catch(() => undefined);
      try {
        await owner?.stop();
      } finally {
        try {
          await space?.close();
        } finally {
          await provider.close();
        }
      }
    }
  });
}
