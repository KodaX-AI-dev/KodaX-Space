// Partner visual layout e2e coverage.
//
// This catches the class of regressions that normal interaction tests miss:
// usable-width collapse, panel overlap, clipped menus, and modal/composer
// layering problems on the Partner surface.
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { launchSpace } from './fixtures.js';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

interface LayoutSnapshot {
  viewport: { width: number; height: number };
  rects: Record<string, Rect | null>;
}

const AUDIT_DIR = path.join(process.cwd(), 'artifacts', 'partner-ui-audit');

async function createProject(testId: string): Promise<string> {
  const projectDir = path.join(os.tmpdir(), `kodax-test-${testId}-project`);
  await fs.mkdir(path.join(projectDir, 'docs'), { recursive: true });
  await fs.writeFile(
    path.join(projectDir, 'brief.md'),
    '# Partner brief\n\nUse this file as evidence for visual layout checks.\n',
    'utf-8',
  );
  await fs.writeFile(
    path.join(projectDir, 'docs', 'long-file-name-for-layout-overflow-testing.md'),
    '# Long file\n',
    'utf-8',
  );
  return projectDir;
}

async function switchToPartner(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Partner', exact: true }).click();
  await expect(page.getByTestId('partner-workspace')).toBeVisible({ timeout: 10_000 });
}

async function sendPrompt(page: Page, prompt: string): Promise<void> {
  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeEnabled({ timeout: 10_000 });
  await textarea.fill(prompt);
  await textarea.press('Enter');
  const stream = page.getByTestId('conversation-stream');
  await expect(stream.getByTestId('user-message-bubble').filter({ hasText: prompt })).toBeVisible({
    timeout: 10_000,
  });
  await expect(stream.getByText(/Ran 1 command/).first()).toBeVisible({ timeout: 20_000 });
  await expect(stream.locator('.activity-spinner-comet')).toHaveCount(0, { timeout: 20_000 });
}

async function saveScreenshot(page: Page, name: string): Promise<void> {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(AUDIT_DIR, `${name}.png`), fullPage: false });
}

async function dragRightSidebarBy(page: Page, deltaX: number): Promise<void> {
  const resizeHandle = page.getByRole('separator', { name: 'Resize right sidebar' });
  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox, 'Right sidebar resize handle').not.toBeNull();
  const startX = handleBox!.x + handleBox!.width / 2;
  const pointerY = handleBox!.y + Math.min(20, handleBox!.height / 2);
  await page.mouse.move(startX, pointerY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, pointerY);
  await page.mouse.up();
}

async function snapshotLayout(page: Page): Promise<LayoutSnapshot> {
  return page.evaluate(() => {
    const selectors: Record<string, string> = {
      left: '[data-testid="left-sidebar"]',
      workspace: '[data-testid="partner-workspace"]',
      context: '[data-testid="partner-context-rail"]',
      conversation: '[data-testid="partner-conversation"]',
      detail: '[data-testid="right-sidebar"]',
      stream: '[data-testid="conversation-stream"]',
      textarea: 'textarea',
      send: '[aria-label="Send message"]',
      menu: '[role="menu"]',
      dialog: '[role="dialog"]',
    };
    const rectFor = (selector: string): Rect | null => {
      const element = document.querySelector(selector);
      if (!element) return null;
      if (window.getComputedStyle(element).display === 'none') return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      };
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rects: Object.fromEntries(
        Object.entries(selectors).map(([name, selector]) => [name, rectFor(selector)]),
      ),
    };
  });
}

function horizontallySeparated(left: Rect, right: Rect): boolean {
  return left.right <= right.x + 0.5;
}

function insideViewport(rect: Rect, viewport: { width: number; height: number }): boolean {
  return (
    rect.x >= -0.5 &&
    rect.y >= -0.5 &&
    rect.right <= viewport.width + 0.5 &&
    rect.bottom <= viewport.height + 0.5
  );
}

async function expectUsablePartnerLayout(page: Page): Promise<void> {
  const snap = await snapshotLayout(page);
  const { viewport, rects } = snap;
  expect(rects.workspace, 'Partner workspace exists').not.toBeNull();
  expect(rects.conversation, 'Partner conversation exists').not.toBeNull();
  expect(rects.textarea, 'Composer exists').not.toBeNull();

  const workspace = rects.workspace!;
  const conversation = rects.conversation!;
  const textarea = rects.textarea!;

  expect(insideViewport(workspace, viewport), 'workspace is clipped by viewport').toBe(true);
  expect(insideViewport(conversation, viewport), 'conversation is clipped by viewport').toBe(true);
  expect(insideViewport(textarea, viewport), 'composer is clipped by viewport').toBe(true);
  expect(conversation.width, 'conversation needs a readable lane').toBeGreaterThanOrEqual(360);

  if (rects.left) {
    expect(horizontallySeparated(rects.left, workspace), 'left sidebar overlaps workspace').toBe(
      true,
    );
  }
  if (rects.context) {
    expect(
      horizontallySeparated(conversation, rects.context),
      'context rail overlaps conversation',
    ).toBe(true);
  }
  if (rects.detail) {
    expect(insideViewport(rects.detail, viewport), 'detail panel is clipped by viewport').toBe(
      true,
    );
    expect(horizontallySeparated(workspace, rects.detail), 'workspace overlaps detail panel').toBe(
      true,
    );
  }
}

async function expectSelectorInViewport(
  page: Page,
  selector: string,
  label: string,
): Promise<void> {
  const handle = await page.waitForFunction((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }, selector);
  const box = (await handle.jsonValue()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const viewport = await page.viewportSize();
  expect(viewport, 'viewport size').not.toBeNull();
  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(-0.5);
  expect(box.y, `${label} top edge`).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(viewport!.width + 0.5);
  expect(box.y + box.height, `${label} bottom edge`).toBeLessThanOrEqual(viewport!.height + 0.5);
}

test('Partner layout remains usable without panel overlap across common widths', async () => {
  const testId = `partner-layout-${Date.now()}`;
  const projectDir = await createProject(testId);
  const space = await launchSpace(testId);

  try {
    const { page } = space;
    await space.seedProject(projectDir);
    await switchToPartner(page);

    await page.setViewportSize({ width: 1280, height: 760 });
    await saveScreenshot(page, '01-desktop-welcome');
    await expect(page.getByTestId('partner-workbench')).toHaveCount(0);
    const sceneShortcuts = page.getByTestId('partner-scene-shortcuts');
    await expect(sceneShortcuts).toBeVisible();
    const composer = page.locator('textarea').first();
    await expect(composer).toHaveAttribute(
      'placeholder',
      /Describe a task - sending will create a Partner session/,
    );
    await sceneShortcuts.getByRole('button', { name: 'Slides' }).click();
    await expect(composer).toHaveValue(/Create a presentation/);
    await sceneShortcuts.getByRole('button', { name: 'Data analysis' }).click();
    await expect(composer).toHaveValue(/Analyze the attached data/);
    await sceneShortcuts.getByRole('button', { name: 'Document processing' }).click();
    await expect(composer).toHaveValue(/Use the attached material/);
    await composer.fill('');
    const contextRail = page.getByTestId('partner-context-rail');
    await expect(contextRail).toBeVisible();
    await expect(contextRail).toHaveCSS('width', '300px');
    await expect(page.getByTestId('right-sidebar')).toBeHidden();
    await expectUsablePartnerLayout(page);

    await page.getByTestId('partner-detail-toggle').click();
    await expect(page.getByTestId('right-sidebar')).toBeVisible();
    await expect(contextRail).toHaveCount(0);
    await expect(page.getByTestId('partner-detail-launcher')).toBeVisible();
    await saveScreenshot(page, '02-desktop-detail');
    await expectUsablePartnerLayout(page);

    await page.getByTestId('partner-context-toggle').click();
    await expect(page.getByTestId('right-sidebar')).toBeHidden();
    await expect(contextRail).toBeVisible();

    await sendPrompt(page, 'partner visual overlap audit prompt');
    await expect(page.getByTestId('right-sidebar')).toBeHidden();
    await saveScreenshot(page, '03-desktop-after-send');
    await expectUsablePartnerLayout(page);

    await page.getByTestId('partner-context-add-material').click();
    const sourcesPanel = page.getByTestId('partner-sources-panel');
    await expect(sourcesPanel).toBeVisible();
    await sourcesPanel.getByRole('button', { name: 'brief.md' }).click();
    await expect(page.getByTestId('file-viewer')).toBeVisible();
    await page
      .getByTestId('partner-detail-tabs')
      .getByRole('tab', { name: 'Materials', exact: true })
      .click();
    await expect(sourcesPanel).toBeVisible();
    await sourcesPanel.getByRole('button', { name: 'Attach selected file' }).click();
    await expect(sourcesPanel.getByText('brief.md').first()).toBeVisible();
    await saveScreenshot(page, '04-source-attached');
    await expectUsablePartnerLayout(page);

    await page.getByTestId('partner-context-toggle').click();
    await expect(page.getByTestId('right-sidebar')).toBeHidden();
    await expect(contextRail).toBeVisible();

    await page.setViewportSize({ width: 980, height: 680 });
    await saveScreenshot(page, '05-narrow-width');
    await expect(page.getByTestId('partner-context-rail')).toBeVisible();
    await expect(page.getByTestId('partner-context-toggle')).toBeVisible();
    await expect(page.getByTestId('partner-detail-toggle')).toBeVisible();
    await expectUsablePartnerLayout(page);

    await page.setViewportSize({ width: 820, height: 620 });
    await saveScreenshot(page, '06-compact-width');
    await expect(page.getByTestId('partner-context-rail')).toHaveCount(0);
    await expect(page.getByTestId('right-sidebar')).toBeHidden();
    await expect(page.getByTestId('partner-context-toggle')).toBeVisible();
    await expect(page.getByTestId('partner-detail-toggle')).toBeVisible();
    await expectUsablePartnerLayout(page);

    await page.getByTestId('partner-context-toggle').click();
    await expect(page.getByTestId('right-sidebar')).toBeVisible();
    await expect(page.getByTestId('partner-sources-panel')).toBeVisible();
    await expectUsablePartnerLayout(page);
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Partner detail history and width survive a Coder round trip without changing Coder width', async () => {
  test.setTimeout(60_000);
  const testId = `partner-detail-round-trip-${Date.now()}`;
  const projectDir = await createProject(testId);
  const space = await launchSpace(testId);

  try {
    const { page } = space;
    await space.seedProject(projectDir);
    await page.setViewportSize({ width: 1440, height: 760 });
    await page.evaluate(() => {
      window.localStorage.setItem('kodax-space.currentSurface', 'code');
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await page.getByLabel('Show right sidebar').click();
    const coderDock = page.locator('[data-dock-kind="task-dock"]');
    await expect(coderDock).toBeVisible();
    await dragRightSidebarBy(page, -36);
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('kodax-space.rightSidebarWidth')))
      .not.toBeNull();
    const coderPersistedWidth = await page.evaluate(() =>
      window.localStorage.getItem('kodax-space.rightSidebarWidth'),
    );
    expect(coderPersistedWidth).not.toBeNull();
    await expect(coderDock).toHaveCSS('width', `${coderPersistedWidth}px`);
    const coderWidthBefore = (await coderDock.boundingBox())?.width ?? 0;
    expect(coderWidthBefore).toBeGreaterThan(0);

    await switchToPartner(page);
    await page.getByTestId('partner-detail-toggle').click();
    const partnerDock = page.locator('[data-dock-kind="partner-detail-dock"]');
    await expect(partnerDock).toBeVisible();
    await page.getByTestId('partner-detail-open-browser').click();
    await expect(
      partnerDock.getByTestId('partner-detail-tabs').getByRole('tab', { name: 'Browser' }),
    ).toBeVisible();

    await dragRightSidebarBy(page, -48);

    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('kodax-space.rightSidebarWidth')))
      .toBe(coderPersistedWidth);

    await page.getByRole('button', { name: 'Coder', exact: true }).click();
    await expect(page.getByTestId('coder-workspace')).toBeVisible();
    await expect(partnerDock).toHaveCount(1);
    await expect(partnerDock).toBeHidden();
    await expect(
      partnerDock.getByTestId('partner-detail-tabs').getByRole('tab', { name: 'Browser' }),
    ).toHaveCount(1);
    await expect(coderDock).toBeVisible();
    await expect
      .poll(async () => (await coderDock.boundingBox())?.width ?? 0)
      .toBeCloseTo(coderWidthBefore, 0);

    await switchToPartner(page);
    await expect(partnerDock).toBeVisible();
    await expect(
      partnerDock.getByTestId('partner-detail-tabs').getByRole('tab', { name: 'Browser' }),
    ).toBeVisible();
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Partner menu and delete dialog stay above layout and inside the viewport', async () => {
  const testId = `partner-overlays-${Date.now()}`;
  const projectDir = await createProject(testId);
  const space = await launchSpace(testId);

  try {
    const { page } = space;
    await space.seedProject(projectDir);
    await switchToPartner(page);
    await page.setViewportSize({ width: 980, height: 680 });

    const prompt = 'partner overlay visual audit prompt';
    await sendPrompt(page, prompt);

    const row = page.getByTestId('sidebar-session-row').filter({ hasText: prompt }).first();
    await expect(row).toBeVisible();
    await row.click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const deleteMenuItem = page.getByRole('menuitem', { name: /^Delete\b/ });
    await expect(deleteMenuItem).toBeVisible();
    await expectSelectorInViewport(page, '[role="menu"]', 'session context menu');
    await saveScreenshot(page, '06-session-menu');

    try {
      // A late session-list refresh can legitimately remount the row after the
      // screenshot. Use a short click deadline, then reopen the menu instead of
      // waiting 30 seconds on a locator that has already disappeared.
      await deleteMenuItem.click({ timeout: 3_000 });
    } catch {
      await row.click({ button: 'right' });
      const reopenedDeleteMenuItem = page.getByRole('menuitem', { name: /^Delete\b/ });
      await expect(reopenedDeleteMenuItem).toBeVisible();
      await reopenedDeleteMenuItem.click();
    }
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectSelectorInViewport(page, '[role="dialog"]', 'delete dialog');
    await saveScreenshot(page, '07-delete-dialog');
    await expectUsablePartnerLayout(page);
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});
