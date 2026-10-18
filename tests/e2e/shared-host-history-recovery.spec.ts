import { expect, test } from '@playwright/test';
import path from 'node:path';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { x as extractTar } from 'tar';
import { launchSpace, type SpaceInstance } from './fixtures.js';
import { startConflictingHistoryHost } from './shared-host-fixture.js';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  readPublicSpaceExit,
  readSdkHistory,
  sendSdkPrompt,
} from './sdk-provider-fixture.js';
import { stopOwnedTestDaemon } from './fixture-daemon-cleanup.js';

test.setTimeout(180_000);

let legacySdkRoot: string;
test.beforeAll(async () => {
  legacySdkRoot = await mkdtemp(path.resolve('.tmp-issue222-legacy-'));
  await extractTar({
    file: path.resolve('vendor/issue-222/kodax-ai-kodax-0.7.97-alpha.6.issue222.4.tgz'),
    cwd: legacySdkRoot,
    strict: true,
  });
  // Supply the unchanged locked dependencies absent from the older tarball,
  // preserving its bundled dependency, SDK code and native bytes.
  await cp(
    path.resolve('node_modules/@kodax-ai/kodax/node_modules'),
    path.join(legacySdkRoot, 'package/node_modules'),
    { recursive: true, force: false },
  );
});
test.afterAll(async () => {
  if (
    legacySdkRoot &&
    path.dirname(legacySdkRoot) === process.cwd() &&
    path.basename(legacySdkRoot).startsWith('.tmp-issue222-legacy-')
  )
    await rm(legacySdkRoot, { recursive: true, force: true });
});

for (const holdClient of [false, true]) {
  test(`shared default Host ${holdClient ? 'protects active work then self-heals' : 'recovers idle ownership'} and restores every selected history`, async () => {
    const provider = await createLocalSdkProvider();
    let owner: Awaited<ReturnType<typeof startConflictingHistoryHost>> | undefined;
    let space: SpaceInstance | undefined;
    try {
      space = await launchSpace(`shared-host-${holdClient}-${Date.now()}`, {
        env: { KODAX_FORCE_MOCK: '0' },
        prepareProfile: async (root) => {
          owner = await startConflictingHistoryHost(root, {
            providerUrl: holdClient ? provider.url : undefined,
            sdkDirectory: path.join(legacySdkRoot, 'package'),
          });
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

test('an explicitly retained published Host remains available for every saved history', async () => {
  let owner: Awaited<ReturnType<typeof startConflictingHistoryHost>> | undefined;
  let space: SpaceInstance | undefined;
  try {
    space = await launchSpace(`retained-host-${Date.now()}`, {
      env: { KODAX_FORCE_MOCK: '0', SPACE_TEST_COMPLETE_EXIT_TRIGGER: '1' },
      prepareProfile: async (root) => {
        owner = await startConflictingHistoryHost(root, { persistent: true });
      },
    });
    await space.seedProject(path.join(space.testDataDir, 'workspace'));
    for (const label of ['first', 'second']) {
      await space.page
        .getByTestId('sidebar-session-row')
        .filter({ hasText: `ISSUE222 ${label} history` })
        .click();
      await expect(space.page.getByTestId('conversation-stream')).toContainText(
        `saved answer ${label}`,
        { timeout: 35_000 },
      );
    }
    const connection = await space.page.evaluate(async () => {
      const result = await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined);
      if (!result.ok) throw new Error('Runtime profile read failed');
      return result.data.connection;
    });
    expect(connection.state).toBe('ready');
    expect(connection.runtimeId).toBe(owner!.runtimeId);
    expect(connection.profile).toBe('default');
    expect(process.kill(owner!.pid, 0)).toBe(true);
    const applicationProcess = space.app.process();
    await writeFile(path.join(space.testDataDir, 'space/complete-exit.trigger'), 'exit');
    await expect.poll(() => applicationProcess.exitCode, { timeout: 30_000 }).toBe(0);
    const receipt = await readPublicSpaceExit(space);
    expect(receipt.runtimeId).toBe(owner!.runtimeId);
    expect(receipt.host.state).toBe('succeeded');
  } finally {
    await space?.app.close().catch(() => undefined);
    try {
      await owner?.stop();
    } finally {
      await space?.close();
    }
  }
});

test('a Host crash during streaming restores accepted history without resubmitting the input', async () => {
  const provider = await createLocalSdkProvider();
  let space: SpaceInstance | undefined;
  try {
    ({ space } = await launchRealSdkSpace(`stream-crash-${Date.now()}`, provider.url));
    await sendSdkPrompt(space, 'STREAM_PRODUCT');
    await expect(space.page.getByTestId('conversation-stream')).toContainText('SDK_PARTIAL');
    const sessionId = await currentSdkSession(space);
    const readConnection = () =>
      space!.page.evaluate(async () => {
        const result = await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined);
        if (!result.ok) throw new Error('Runtime profile read failed');
        return result.data.connection;
      });
    const before = await readConnection();
    expect(await stopOwnedTestDaemon(space.testDataDir)).toBe(true);
    await expect
      .poll(
        async () => {
          const connection = await readConnection();
          return connection.state === 'ready' && connection.runtimeId !== before.runtimeId;
        },
        { timeout: 35_000 },
      )
      .toBe(true);
    await expect(space.page.getByTestId('conversation-stream')).toContainText('STREAM_PRODUCT', {
      timeout: 65_000,
    });
    await expect
      .poll(
        async () => {
          try {
            const history = await readSdkHistory(space!, sessionId);
            return history.items.filter(
              (item) => item.type === 'user' && item.text === 'STREAM_PRODUCT',
            ).length;
          } catch {
            return -1;
          }
        },
        { timeout: 65_000 },
      )
      .toBe(1);
    expect(provider.requests.filter((prompt) => prompt === 'STREAM_PRODUCT')).toHaveLength(1);
  } finally {
    provider.release('STREAM_PRODUCT');
    await space?.close();
    await provider.close();
  }
});
