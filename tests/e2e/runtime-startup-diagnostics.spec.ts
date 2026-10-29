import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { launchSpace } from './fixtures.js';

test('slow real startup records its timing without the debug environment switch', async () => {
  test.setTimeout(45_000);
  const space = await launchSpace(`startup-diagnostics-${Date.now()}`, {
    env: {
      KODAX_FORCE_MOCK: '0',
      KODAX_SPACE_RUNTIME_STARTUP_DEBUG: '0',
      KODAX_INTERNAL_DAEMON_TEST_READY_DELAY_MS: '11000',
    },
  });
  try {
    const file = path.join(
      space.testDataDir,
      'space/electron-user-data/diagnostics/space-main.jsonl',
    );
    await expect
      .poll(
        async () => {
          const events = (await readFile(file, 'utf8'))
            .trim()
            .split(/\r?\n/)
            .map(
              (line) =>
                JSON.parse(line) as {
                  component: string;
                  event: string;
                  data?: {
                    stage: string;
                    phase: string;
                    totalMs: number;
                    data?: { launcherProgress?: readonly { stage: string }[] };
                  };
                },
            );
          return (
            events.some(
              ({ component, event, data }) =>
                component === 'runtime-startup' &&
                event === 'stage_timing' &&
                data?.stage === 'initialize' &&
                data.phase === 'complete' &&
                data.totalMs >= 10_000,
            ) &&
            events.some(
              ({ data }) =>
                data?.stage === 'runtime_factory_connect' &&
                (data.data?.launcherProgress?.length ?? 0) > 0,
            )
          );
        },
        { timeout: 25_000 },
      )
      .toBe(true);
    await expect(space.page.getByTestId('runtime-startup-status')).toHaveCount(0);
  } catch (error) {
    await test.info().attach('startup-diagnostics', {
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
