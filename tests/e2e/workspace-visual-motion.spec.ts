import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { SessionEvent } from '@kodax-space/space-ipc-schema';
import { launchSpace, type SpaceInstance } from './fixtures.js';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

// Actual Electron UI with deterministic display content. Real parallel SDK execution
// remains covered by integrated-workspace.spec.ts; these events are visual fixtures.
test('Chinese workspace, menus and settings form a coherent visual journey', async () => {
  test.setTimeout(90_000);
  const evidence = process.env.SPACE_VISUAL_AUDIT_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  const space = await launchSpace(`visual-journey-${Date.now()}`, {
    onPageError: (error) => errors.push(error.message),
    ...(evidence ? { recordVideo: { dir: evidence, size: { width: 1440, height: 960 } } } : {}),
  });
  const { page } = space;
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await seedVisualConversation(space);
    await selectChineseFullAppearance(page);
    await page.keyboard.press('Escape');
    await inspectComposerAndMenu(page);
    await inspectSettingsJourney(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.composer-surface textarea')).toHaveValue(
      '继续优化界面，让每次操作都更有质感',
    );
    await page.mouse.click(750, 90);
    await page.waitForTimeout(400);
    await captureVisualStep(page, '07-workspace-light.png');
    await page.locator('.composer-surface textarea').click();
    await page.waitForTimeout(220);
    await captureVisualStep(page, '07b-composer-light-focus.png');
    await page.waitForTimeout(850);
    expect(errors).toEqual([]);
  } finally {
    await space.close();
    if (evidence) await page.video()?.saveAs(path.join(evidence, 'journey.webm'));
  }
});

test('focus feedback is finite, honours quality and reduced motion, and pauses in the background', async () => {
  test.setTimeout(60_000);
  const space = await launchSpace(`visual-guards-${Date.now()}`);
  const { page } = space;
  try {
    await page.getByTestId('settings-button').click();
    const settings = page.getByTestId('settings-workspace');
    await settings.getByRole('button', { name: 'Full', exact: true }).click();
    await page.keyboard.press('Escape');
    const composer = page.locator('.composer-surface textarea');
    await composer.fill('Motion must keep the editor and its controls usable');
    const light = page.locator('.composer-focus-light');
    await expect(light).toBeAttached();
    await inspectFocusAndBackground(space);
    await inspectScrollAndMenu(page);
    await inspectQualityGates(page);
  } finally {
    await space.close();
  }
});

test('Full quality stays quiet during real parallel SDK output and restores the workspace', async () => {
  test.setTimeout(120_000);
  const evidence = process.env.SPACE_VISUAL_AUDIT_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(
    `visual-parallel-${Date.now()}`,
    provider.url,
    undefined,
    evidence ? { dir: evidence, size: { width: 1440, height: 960 } } : undefined,
  );
  const { page } = space;
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await selectChineseFullAppearance(page);
    await page.keyboard.press('Escape');
    const { firstId, secondId } = await startParallelRuns(space, provider);
    await inspectParallelSettings(space, firstId, secondId);
    provider.release('HOLD_CANCEL');
    provider.release('STREAM_PRODUCT');
    await waitSdkIdle(space, firstId);
    await waitSdkIdle(space, secondId);
    await expect(page.locator('html')).not.toHaveClass(/visual-streaming-active/);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
    if (evidence) await page.video()?.saveAs(path.join(evidence, 'real-parallel.webm'));
  }
});
test('animated context menus retain their final size inside the viewport', async () => {
  const space = await launchSpace(`visual-menu-edge-${Date.now()}`);
  const { page } = space;
  try {
    await page.setViewportSize({ width: 1000, height: 400 });
    const composer = page.locator('textarea').first();
    await composer.fill('Check menu placement');
    await composer.press('Enter');
    const row = page.getByTestId('sidebar-session-row').first();
    await expect(row).toBeVisible();
    await row.click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await page.waitForTimeout(350);
    const bounds = await menu.boundingBox();
    await test.info().attach('context-menu-bounds', {
      body: JSON.stringify(bounds),
      contentType: 'application/json',
    });
    expect(bounds).not.toBeNull();
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(392.5);
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem').last()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  } finally {
    await space.close();
  }
});

async function captureVisualStep(page: Page, name: string): Promise<void> {
  const evidence = process.env.SPACE_VISUAL_AUDIT_DIR;
  await page.screenshot({
    path: evidence ? path.join(evidence, name) : test.info().outputPath(name),
  });
}

function visualEvents(sessionId: string): SessionEvent[] {
  return [
    {
      kind: 'text_delta',
      sessionId,
      text: '### 让工作保持连贯\n\n已检查工作区的主要入口。项目与会话状态都保留在左侧，切换设置时仍可继续后台任务。\n\n- **阅读层级**：将主要操作与辅助信息区分开。\n- **交互反馈**：聚焦、展开与选择都有明确反馈。\n- **视觉材质**：玻璃集中在输入区和固定界面，正文保持清晰。',
    },
    {
      kind: 'tool_start',
      sessionId,
      toolId: 'visual-read',
      toolName: 'read',
      input: { path: 'README.md' },
    },
    {
      kind: 'tool_result',
      sessionId,
      toolId: 'visual-read',
      toolName: 'read',
      content: '# KodaX Space\n\nA workspace for ideas, agents and projects.',
    },
    { kind: 'session_complete', sessionId },
  ];
}

async function seedVisualConversation(space: SpaceInstance): Promise<void> {
  const { page } = space;
  for (const name of ['Atlas Web', 'KodaX Space']) {
    const project = path.join(space.testDataDir, name);
    await mkdir(project);
    await space.seedProject(project);
    const input = page.locator('textarea').first();
    await expect(input).toBeEnabled();
    await input.fill(name === 'Atlas Web' ? '梳理首页的交互与内容层级' : '检查工作区的交互细节');
    await input.press('Enter');
    await expect(page.getByTestId('user-message-bubble').first()).toBeVisible();
  }
  const sessionId = await page.evaluate(async () => {
    const result = await window.kodaxSpace.invoke('session.list', { surface: 'code' });
    return result.ok ? result.data.sessions[0]?.sessionId : undefined;
  });
  expect(sessionId).toBeTruthy();
  if (!sessionId) throw new Error('Visual fixture session missing');
  const events = visualEvents(sessionId);
  await space.app.evaluate(({ BrowserWindow }, payloads) => {
    for (const payload of payloads)
      BrowserWindow.getAllWindows()[0].webContents.send('session.event', payload);
  }, events);
}

async function selectChineseFullAppearance(page: Page): Promise<void> {
  await page.getByTestId('settings-button').click();
  const settings = page.getByTestId('settings-workspace');
  await settings.getByRole('button', { name: 'Dark', exact: true }).click();
  await settings.getByRole('button', { name: 'Full', exact: true }).click();
  await settings.getByRole('button', { name: '简体中文', exact: true }).click();
  await expect(page.getByText('显示语言已更新', { exact: true })).not.toBeVisible({
    timeout: 6000,
  });
}

async function inspectComposerAndMenu(page: Page): Promise<void> {
  const composer = page.locator('.composer-surface textarea');
  await composer.fill('继续优化界面，让每次操作都更有质感');
  await page.mouse.click(750, 90);
  await page.waitForTimeout(600);
  await captureVisualStep(page, '01-workspace-dark.png');
  await composer.click();
  await page.waitForTimeout(220);
  await captureVisualStep(page, '02-composer-focus.png');
  await page.waitForTimeout(800);
  await page.getByTestId('model-effort-selector').click();
  await page.waitForTimeout(350);
  await captureVisualStep(page, '03-model-menu.png');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
}

async function inspectSettingsJourney(page: Page): Promise<void> {
  await page.getByTestId('settings-button').click();
  const settings = page.getByTestId('settings-workspace');
  await expect(settings).toBeVisible();
  await expect(page.getByTestId('left-sidebar')).not.toBeVisible();
  await page.waitForTimeout(650);
  await captureVisualStep(page, '04-settings-dark.png');
  await settings.getByRole('button', { name: '全特效', exact: true }).hover();
  await page.waitForTimeout(700);
  await settings.getByRole('tab').nth(1).click();
  await page.waitForTimeout(500);
  await captureVisualStep(page, '05-settings-category.png');
  await settings.getByRole('tab').first().click();
  await settings.getByRole('button', { name: '浅色', exact: true }).click();
  await page.waitForTimeout(600);
  await captureVisualStep(page, '06-settings-light.png');
}

async function inspectFocusAndBackground(space: SpaceInstance): Promise<void> {
  const { page } = space;
  const composer = page.locator('.composer-surface textarea');
  const light = page.locator('.composer-focus-light');
  const window = await space.app.browserWindow(page);
  await window.evaluate((win) => win.focus());
  await page.mouse.click(700, 80);
  await composer.click();
  expect(await composer.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
  const animations = await light.evaluate((node) =>
    node.getAnimations({ subtree: true }).map((animation) => animation.effect?.getTiming()),
  );
  expect(animations.length).toBeGreaterThan(0);
  for (const timing of animations) {
    expect(timing?.iterations).toBe(1);
    expect(Number(timing?.duration)).toBeLessThanOrEqual(1200);
  }
  // Windows can immediately refocus its only window after blur(). Give focus
  // to a real second window on the same isolated test desktop instead.
  const peerId = await space.app.evaluate(async ({ BrowserWindow }) => {
    const peer = new BrowserWindow({ width: 240, height: 160, show: true });
    await peer.loadURL('about:blank');
    peer.focus();
    return peer.id;
  });
  await expect(page.locator('html')).toHaveClass(/visual-ambient-paused/);
  expect(
    await light.evaluate((node) => getComputedStyle(node, '::before').animationPlayState),
  ).toBe('paused');
  await space.app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.close(), peerId);
  await window.evaluate((win) => win.focus());
  await page.waitForTimeout(1250);
  expect(await light.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
}

async function inspectScrollAndMenu(page: Page): Promise<void> {
  const light = page.locator('.composer-focus-light');
  await page.mouse.wheel(0, 120);
  await expect(page.locator('html')).toHaveClass(/visual-interaction-active/);
  expect(
    await light.evaluate((node) => getComputedStyle(node, '::before').animationPlayState),
  ).toBe('paused');
  await expect(page.locator('html')).not.toHaveClass(/visual-interaction-active/);
  await page.getByTestId('model-effort-selector').click();
  await expect(page.locator('.workspace-menu:visible')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.workspace-menu:visible')).toHaveCount(0);
}

async function inspectQualityGates(page: Page): Promise<void> {
  const settings = page.getByTestId('settings-workspace');
  const composer = page.locator('.composer-surface textarea');
  const light = page.locator('.composer-focus-light');
  for (const quality of ['Balanced', 'Minimal']) {
    await page.getByTestId('settings-button').click();
    await settings.getByRole('button', { name: quality, exact: true }).click();
    await page.keyboard.press('Escape');
    await composer.click();
    const timings = await light.evaluate((node) =>
      node
        .getAnimations({ subtree: true })
        .map((animation) => animation.effect?.getTiming().duration),
    );
    if (quality === 'Minimal') expect(timings).toEqual([]);
    else {
      expect(timings.length).toBe(1);
      expect(Number(timings[0])).toBeLessThanOrEqual(700);
    }
  }
  await page.getByTestId('settings-button').click();
  await settings.getByRole('button', { name: 'Full', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settings.getByRole('tab').nth(1).click();
  expect(
    await settings
      .locator('[role="tabpanel"]:visible')
      .evaluate((node) => node.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.keyboard.press('Escape');
  await composer.click();
  expect(await light.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(composer).toHaveValue('Motion must keep the editor and its controls usable');
}

async function startParallelRuns(
  space: SpaceInstance,
  provider: Awaited<ReturnType<typeof createLocalSdkProvider>>,
): Promise<{ firstId: string; secondId: string }> {
  const { page } = space;
  await sendSdkPrompt(space, 'HOLD_CANCEL');
  await expect.poll(() => provider.requests).toContain('HOLD_CANCEL');
  const firstId = await currentSdkSession(space);
  const project = path.join(space.testDataDir, 'Atlas Web');
  await mkdir(project);
  await space.seedProject(project);
  await page.getByRole('button', { name: '新对话', exact: true }).click();
  await sendSdkPrompt(space, 'STREAM_PRODUCT');
  const secondId = await currentSdkSession(space);
  await expect(page.getByTestId('conversation-stream')).toContainText('SDK_PARTIAL');
  await expect(page.locator('html')).toHaveClass(/visual-streaming-active/);
  await expect(page.locator('html')).toHaveClass(/visual-ambient-paused/);
  const first = page.locator(`[data-testid="sidebar-session-row"][data-session-id="${firstId}"]`);
  const second = page.locator(`[data-testid="sidebar-session-row"][data-session-id="${secondId}"]`);
  // Expand the original project so the recording shows both live runs together.
  const originalProject = page
    .getByTestId('left-sidebar')
    .locator('[class~="group/projectrow"]')
    .filter({ hasText: /^project/ });
  if (!(await first.isVisible()))
    await originalProject.getByRole('button', { name: '展开项目', exact: true }).click();
  await expect(first.locator('.sidebar-status-spinner')).toBeVisible();
  await expect(second.locator('.sidebar-status-spinner')).toBeVisible();
  return { firstId, secondId };
}

async function inspectParallelSettings(
  space: SpaceInstance,
  firstId: string,
  secondId: string,
): Promise<void> {
  const { page } = space;
  const settings = page.getByTestId('settings-workspace');
  const first = page.locator(`[data-testid="sidebar-session-row"][data-session-id="${firstId}"]`);
  const second = page.locator(`[data-testid="sidebar-session-row"][data-session-id="${secondId}"]`);
  const composer = page.locator('.composer-surface textarea');
  await composer.fill('两个项目继续并行，保留这份草稿');
  expect(
    await page
      .locator('.composer-focus-light')
      .evaluate((node) => getComputedStyle(node, '::before').animationPlayState),
  ).toBe('paused');
  await page.waitForTimeout(500);
  await captureVisualStep(page, '08-real-parallel-dark.png');
  await page.getByTestId('settings-button').click();
  await expect(page.getByTestId('left-sidebar')).not.toBeVisible();
  const live = await page.evaluate(
    (sessionId) => window.kodaxSpace.invoke('session.liveSnapshot', { sessionId }),
    firstId,
  );
  expect(live.ok && live.data.activeRun).toBeTruthy();
  await settings.getByRole('button', { name: '浅色', exact: true }).click();
  await page.waitForTimeout(500);
  await captureVisualStep(page, '09-real-parallel-settings.png');
  await page.keyboard.press('Escape');
  await expect(composer).toHaveValue('两个项目继续并行，保留这份草稿');
  await expect(first.locator('.sidebar-status-spinner')).toBeVisible();
  await expect(second.locator('.sidebar-status-spinner')).toBeVisible();
  await page.mouse.move(750, 90);
  await page.waitForTimeout(450);
  await captureVisualStep(page, '10-real-parallel-light.png');
}
