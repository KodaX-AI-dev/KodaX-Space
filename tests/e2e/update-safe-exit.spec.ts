import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { connectKodaXClient } from '@kodax-ai/kodax/client';
import { parseOwnedTestDaemonPid } from './fixture-daemon-cleanup.js';
import type { SpaceInstance } from './fixtures.js';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  readPublicSpaceExit,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test.setTimeout(90_000);
test.skip(
  process.platform === 'darwin',
  'Unsigned macOS builds deliberately disable in-app updates.',
);

async function prepareUpdate(space: SpaceInstance, daemonPid: number): Promise<string> {
  const evidence = path.join(space.testDataDir, 'installer-started.json');
  await space.app.evaluate(
    ({ app }, input) => {
      const { createRequire } = process.getBuiltinModule('node:module');
      const require = createRequire(`${app.getAppPath()}/package.json`);
      const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');
      const { writeFileSync } = process.getBuiltinModule('node:fs');
      // Exercise the production IPC and lifecycle; substitute only the external
      // updater transport/installer so this test never replaces a user's app.
      Object.defineProperty(app, 'isPackaged', { value: true, configurable: true });
      autoUpdater.checkForUpdates = async () => {
        autoUpdater.emit('update-available', { version: '9.9.9' });
        return null;
      };
      autoUpdater.downloadUpdate = async () => {
        autoUpdater.emit('update-downloaded', { version: '9.9.9' });
        return [];
      };
      autoUpdater.quitAndInstall = () => {
        let daemonAlive = false;
        try {
          process.kill(input.daemonPid, 0);
          daemonAlive = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
        writeFileSync(input.evidence, JSON.stringify({ daemonAlive }));
      };
    },
    { evidence, daemonPid },
  );
  const result = await space.page.evaluate(async () => {
    const bridge = window.kodaxSpace!;
    const checked = await bridge.invoke('updater.check', {});
    if (!checked.ok || checked.data.state.state !== 'available')
      throw new Error('Expected the stubbed candidate through the real update channel');
    return bridge.invoke('updater.download', { version: '9.9.9' });
  });
  expect(result).toMatchObject({ ok: true, data: { accepted: true } });
  await expect
    .poll(() =>
      space.page.evaluate(async () => {
        const result = await window.kodaxSpace!.invoke('updater.getState', {});
        return result.ok ? result.data.state.state : 'failed';
      }),
    )
    .toBe('ready');
  return evidence;
}

for (const blocker of ['none', 'peer', 'active task'] as const) {
  test(`update installation respects real Runtime shutdown (${blocker})`, async () => {
    const provider = await createLocalSdkProvider();
    const { space } = await launchRealSdkSpace(`update-exit-${randomUUID()}`, provider.url);
    let peer: Awaited<ReturnType<typeof connectKodaXClient>> | undefined;
    try {
      await sendSdkPrompt(space, 'UPDATE_SESSION');
      await expect(space.page.getByTestId('conversation-stream')).toContainText(
        'SDK_REPLY:UPDATE_SESSION',
      );
      const sessionId = await currentSdkSession(space);
      await waitSdkIdle(space, sessionId);
      const daemonDir = path.join(space.testDataDir, 'runtime/daemon/default');
      const raw = await readFile(path.join(daemonDir, 'daemon.json'), 'utf8');
      const daemonPid = parseOwnedTestDaemonPid(raw, space.testDataDir);
      expect(daemonPid).toBeDefined();
      const evidence = await prepareUpdate(space, daemonPid!);
      if (blocker === 'peer') {
        peer = await connectKodaXClient({
          endpoint: (JSON.parse(raw) as { endpoint: string }).endpoint,
          token: (await readFile(path.join(daemonDir, 'daemon.token'), 'utf8')).trim(),
          clientInfo: {
            name: 'Update blocker E2E',
            instanceId: randomUUID(),
            instanceSecret: randomUUID(),
          },
        });
      } else if (blocker === 'active task') {
        await sendSdkPrompt(space, 'HOLD_CANCEL');
        await expect.poll(() => provider.requests).toContain('HOLD_CANCEL');
      }
      expect(
        await space.page.evaluate(() =>
          window.kodaxSpace!.invoke('updater.install', { version: '9.9.9' }),
        ),
      ).toMatchObject({ ok: true, data: { accepted: true } });
      if (blocker === 'none') {
        await expect
          .poll(() => readFile(evidence, 'utf8').catch(() => ''), { timeout: 30_000 })
          .toBe(JSON.stringify({ daemonAlive: false }));
        expect((await readPublicSpaceExit(space)).cleanup.state).toBe('succeeded');
      } else {
        await expect
          .poll(() =>
            space.page.evaluate(async () => {
              const result = await window.kodaxSpace!.invoke('updater.getState', {});
              return result.ok ? result.data.state : null;
            }),
          )
          .toMatchObject({ state: 'error', message: expect.stringContaining('blocked') });
        await expect(readFile(evidence, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
        expect(space.app.process().exitCode).toBeNull();
        if (peer)
          expect((await peer.sessions.readHistory(sessionId)).items.length).toBeGreaterThan(0);
        if (blocker === 'active task')
          await expect(
            space.page.getByRole('button', { name: 'Stop generation', exact: true }),
          ).toBeVisible();
      }
    } finally {
      await peer?.disconnect();
      await provider.close();
      await space.close();
    }
  });
}
