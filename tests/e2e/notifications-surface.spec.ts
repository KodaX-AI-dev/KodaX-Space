import { expect, test, type Locator, type Page } from '@playwright/test';
import type { SessionEvent } from '@kodax-space/space-ipc-schema';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { launchSpace, type SpaceInstance } from './fixtures.js';

test.setTimeout(90_000);

interface SessionListEnvelope {
  ok: boolean;
  data?: { sessions?: Array<{ sessionId: string; projectRoot?: string }> };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function createProject(testId: string): Promise<string> {
  const projectDir = path.join(os.tmpdir(), `kodax-test-${testId}-project`);
  await fs.mkdir(projectDir, { recursive: true });
  return projectDir;
}

async function resizeMainWindow(space: SpaceInstance): Promise<void> {
  await space.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No BrowserWindow available');
    win.setSize(760, 720);
  });
  await space.page.waitForTimeout(150);
}

async function createSession(space: SpaceInstance, prompt: string): Promise<string> {
  const textarea = space.page.getByTestId('composer-input');
  await expect(textarea).toBeEnabled({ timeout: 10_000 });
  await textarea.fill(prompt);
  await textarea.press('Enter');
  await expect(space.page.getByTestId('conversation-stream').getByText(prompt).first()).toBeVisible(
    {
      timeout: 10_000,
    },
  );

  const readSessionId = () =>
    space.page.evaluate(async () => {
      const bridge = (
        window as unknown as {
          kodaxSpace: {
            invoke: (name: string, input: unknown) => Promise<SessionListEnvelope>;
          };
        }
      ).kodaxSpace;
      const result = await bridge.invoke('session.list', { surface: 'code' });
      if (!result.ok) return null;
      return result.data?.sessions?.[0]?.sessionId ?? null;
    });

  await expect.poll(readSessionId, { timeout: 20_000 }).not.toBeNull();
  const sessionId = await readSessionId();
  if (!sessionId) throw new Error('Session was not created');
  return sessionId;
}

async function emitSessionEvent(space: SpaceInstance, event: SessionEvent): Promise<void> {
  await space.app.evaluate(({ BrowserWindow }, payload) => {
    const windows = BrowserWindow.getAllWindows().filter(
      (win) => !win.isDestroyed() && !win.webContents.isDestroyed(),
    );
    if (windows.length === 0) throw new Error('No BrowserWindow available');
    for (const win of windows) win.webContents.send('session.event', payload);
  }, event);
}

async function emitTodoDriftWarning(
  space: SpaceInstance,
  sessionId: string,
  input: { toolName: string; subject: string },
): Promise<void> {
  await emitSessionEvent(space, {
    kind: 'todo_drift_warning',
    sessionId,
    warning: {
      kind: 'work_started_without_claimed_todo',
      toolName: input.toolName,
      toolCallId: `tool-${input.toolName}`,
      count: 1,
      pendingCount: 4,
      openCount: 4,
      firstPendingTodoId: 'todo-1',
      firstPendingTodoSubject: input.subject,
    },
  });
}

function driftNotification(page: Page): Locator {
  return page.getByTestId('notification-row').filter({ hasText: 'Todo list drift detected' });
}

async function recordRendererSessionEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as unknown as {
      __notificationE2eEvents?: unknown[];
      kodaxSpace: { on: (channel: string, listener: (payload: unknown) => void) => () => void };
    };
    target.__notificationE2eEvents = [];
    target.kodaxSpace.on('session.event', (payload) => {
      target.__notificationE2eEvents?.push(payload);
    });
  });
}

async function rendererTodoDriftEventCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const events =
      (window as unknown as { __notificationE2eEvents?: Array<{ kind?: string }> })
        .__notificationE2eEvents ?? [];
    return events.filter((event) => event.kind === 'todo_drift_warning').length;
  });
}

async function activeSidebarSessionId(page: Page, prompt: string): Promise<string> {
  const row = page.getByTestId('sidebar-session-row').filter({ hasText: prompt }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  const sessionId = await row.getAttribute('data-session-id');
  if (!sessionId) throw new Error('Active sidebar session row did not expose data-session-id');
  return sessionId;
}

async function requireBox(locator: Locator, label: string): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, `${label} should have a layout box`).not.toBeNull();
  return box!;
}

function expectClose(actual: number, expected: number, label: string): void {
  // Hover only swaps background/text color (no layout-affecting CSS), so any
  // delta here is sub-pixel reflow/rounding noise. 2px absorbs that while still
  // catching a real jump (border/padding shifts move the button several px).
  expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(2);
}

test('todo drift notification close affordance is stable and dismissible', async () => {
  test.skip(
    !!process.env.CI && process.platform === 'win32',
    'session seed via mock assistant turn can stall on Windows CI; keep local and Linux coverage',
  );
  const testId = `notifications-surface-${Date.now()}`;
  const projectDir = await createProject(testId);
  const space = await launchSpace(testId);

  try {
    await resizeMainWindow(space);
    await space.seedProject(projectDir);
    const page = space.page;
    await recordRendererSessionEvents(page);
    await createSession(space, 'seed notification e2e session');
    const sessionId = await activeSidebarSessionId(page, 'seed notification e2e session');

    await emitTodoDriftWarning(space, sessionId, {
      toolName: 'write',
      subject:
        'Review and stabilize the notification close affordance for wrapped todo drift messages so hover and click geometry remain aligned.',
    });
    await expect.poll(() => rendererTodoDriftEventCount(page), { timeout: 5_000 }).toBe(1);

    const row = driftNotification(page);
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await expect(page.getByTestId('notifications-surface')).toBeVisible();

    const dismiss = row.getByTestId('notification-dismiss');
    const rowBox = await requireBox(row, 'notification row');
    const buttonBox = await requireBox(dismiss, 'notification dismiss button');

    expect(buttonBox.width, 'dismiss button width should stay icon-sized').toBeGreaterThanOrEqual(
      22,
    );
    expect(buttonBox.width, 'dismiss button width should stay icon-sized').toBeLessThanOrEqual(28);
    expect(buttonBox.height, 'dismiss button height should stay icon-sized').toBeGreaterThanOrEqual(
      22,
    );
    expect(buttonBox.height, 'dismiss button height should stay icon-sized').toBeLessThanOrEqual(
      28,
    );

    const rightInset = rowBox.x + rowBox.width - (buttonBox.x + buttonBox.width);
    expect(rightInset, 'dismiss button should sit near the row right edge').toBeGreaterThanOrEqual(
      4,
    );
    expect(rightInset, 'dismiss button should sit near the row right edge').toBeLessThanOrEqual(14);
    expect(buttonBox.y, 'dismiss button should stay inside the row').toBeGreaterThanOrEqual(
      rowBox.y,
    );
    expect(
      buttonBox.y + buttonBox.height,
      'dismiss button should stay inside the row',
    ).toBeLessThanOrEqual(rowBox.y + rowBox.height + 1);

    const backgroundBeforeHover = await dismiss.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    // Re-hover on each poll: notification store updates can re-render the row
    // between a single hover and read, dropping the :hover match (flaky in-suite).
    await expect
      .poll(
        async () => {
          await dismiss.hover();
          return dismiss.evaluate((el) => getComputedStyle(el).backgroundColor);
        },
        { timeout: 5_000, message: 'hover should visibly mark the clickable area' },
      )
      .not.toBe(backgroundBeforeHover);

    const buttonBoxAfterHover = await requireBox(
      dismiss,
      'notification dismiss button after hover',
    );
    expectClose(buttonBoxAfterHover.x, buttonBox.x, 'dismiss button x should not move on hover');
    expectClose(buttonBoxAfterHover.y, buttonBox.y, 'dismiss button y should not move on hover');
    expectClose(
      buttonBoxAfterHover.width,
      buttonBox.width,
      'dismiss button width should not change on hover',
    );
    expectClose(
      buttonBoxAfterHover.height,
      buttonBox.height,
      'dismiss button height should not change on hover',
    );

    const hitTargetIsDismiss = await dismiss.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const target = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return (
        target instanceof Element && target.closest('[data-testid="notification-dismiss"]') === el
      );
    });
    expect(hitTargetIsDismiss, 'visible dismiss affordance should match the hit target').toBe(true);

    await dismiss.click();
    await expect(row).toHaveCount(0);

    await emitTodoDriftWarning(space, sessionId, {
      toolName: 'grep',
      subject: 'Verify outside pointer dismissal for the same todo drift notice.',
    });
    await expect(row).toHaveCount(1, { timeout: 10_000 });

    await page.getByTestId('conversation-stream').click({ position: { x: 24, y: 24 } });
    await expect(row).toHaveCount(0);
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});
