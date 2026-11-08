import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { launchSpace, waitForRendererRoot, type SpaceInstance } from './fixtures.js';

test.setTimeout(60_000);

async function hideAfterPaint(app: ElectronApplication): Promise<Page> {
  await expect
    .poll(
      () =>
        app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0];
          return (
            win?.webContents.getURL() === 'app://space/index.html' &&
            win.webContents.getBackgroundThrottling()
          );
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
  const page = app.windows().find((candidate) => candidate.url() === 'app://space/index.html');
  if (!page) throw new Error('Painted application page is unavailable');
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    win.webContents.setBackgroundThrottling(true);
    win.hide();
  });
  return page;
}

async function deferRoot(page: Page, reattach: boolean): Promise<void> {
  await page.evaluate((reattach) => {
    const root = document.getElementById('root');
    if (!root) throw new Error('The application root must exist before the controlled delay');
    const state = { frames: 0, framesAtAttachment: null as number | null };
    (window as unknown as { startupFrameProbe: typeof state }).startupFrameProbe = state;
    const tick = () => {
      state.frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    root.remove();
    if (reattach)
      setTimeout(() => {
        document.body.append(root);
        state.framesAtAttachment = state.frames;
      }, 250);
  }, reattach);
}

async function observeRoot(app: ElectronApplication, page: Page) {
  await delay(1500);
  const documentState = await page.evaluate(() => {
    const state = (
      window as unknown as {
        startupFrameProbe: { frames: number; framesAtAttachment: number | null };
      }
    ).startupFrameProbe;
    return {
      root: !!window.document.getElementById('root'),
      ready: window.document.readyState,
      framesAfterAttachment:
        state.framesAtAttachment === null ? null : state.frames - state.framesAtAttachment,
    };
  });
  const windowState = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    return { visible: win.isVisible(), throttling: win.webContents.getBackgroundThrottling() };
  });
  return { ...documentState, ...windowState };
}

test('startup accepts an attached root while the native window has no animation frames', async () => {
  test.skip(process.platform !== 'win32', 'Exercises native Windows background frame suspension');
  let proof: Promise<unknown> | undefined;
  let space: SpaceInstance | undefined;
  try {
    space = await launchSpace(`root-without-frames-${Date.now()}`, {
      onLaunched: async (app) => {
        const page = await hideAfterPaint(app);
        await deferRoot(page, true);
        proof = observeRoot(app, page).catch((error: unknown) => ({
          probeError: error instanceof Error ? error.name : 'unknown',
        }));
        await waitForRendererRoot(app, page);
      },
    });
    expect(await proof).toMatchObject({
      root: true,
      ready: 'complete',
      visible: false,
      throttling: true,
      framesAfterAttachment: 0,
    });
    expect(await space.page.locator('#root').count()).toBe(1);
  } finally {
    try {
      if (proof)
        await writeFile(
          test.info().outputPath('root-frame-proof.json'),
          JSON.stringify(await proof, null, 2),
        );
    } finally {
      await space?.close();
    }
  }
});

test('startup rejects a missing root and preserves bounded diagnostics before cleanup', async () => {
  test.skip(process.platform !== 'win32', 'Exercises native Windows startup');
  await expect(
    launchSpace(`root-missing-${Date.now()}`, {
      onLaunched: async (app) => {
        const page = await hideAfterPaint(app);
        await deferRoot(page, false);
        app.context().setDefaultTimeout(1000);
        await waitForRendererRoot(app, page);
      },
    }),
  ).rejects.toThrow(/locator.waitFor: Timeout 1000ms exceeded/);
  const evidence = test.info().attachments.find((item) => item.name === 'startup-root-failure');
  expect(evidence, 'Failure evidence must survive isolated profile cleanup').toBeDefined();
  expect(JSON.parse(evidence!.body!.toString())).toMatchObject({
    document: { status: 'fulfilled', value: { rootAttached: false, readyState: 'complete' } },
    windows: {
      status: 'fulfilled',
      value: [{ appDocument: true, visible: false, backgroundThrottling: true }],
    },
  });
});
