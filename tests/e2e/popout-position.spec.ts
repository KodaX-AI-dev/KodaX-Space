import { test, expect } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { launchSpace } from './fixtures.js';

const TEST_ID = `popout-position-${Date.now()}`;

test('diff popout overlays the conversation without blocking the composer', async () => {
  const projectDir = path.join(os.tmpdir(), `kodax-test-proj-${TEST_ID}`);
  await fs.mkdir(projectDir, { recursive: true });

  const space = await launchSpace(TEST_ID);
  try {
    const { page } = space;
    await space.seedProject(projectDir);
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('kodax-space.shell-popout', {
          detail: { kind: 'diff' },
        }),
      );
    });

    const closeBtn = page.getByRole('button', { name: 'Close popout' });
    await expect(closeBtn).toBeVisible({ timeout: 5000 });

    const metrics = await page.evaluate(() => {
      const closeButton = document.querySelector('button[aria-label="Close popout"]');
      const aside = closeButton?.closest('aside') as HTMLElement | null;
      const textarea = document.querySelector(
        '[data-testid="composer-input"]',
      ) as HTMLElement | null;
      if (!aside || !textarea) return null;

      const asideRect = aside.getBoundingClientRect();
      const taRect = textarea.getBoundingClientRect();
      const textareaHitTarget = document.elementFromPoint(taRect.left + 12, taRect.top + 12);

      return {
        position: getComputedStyle(aside).position,
        asideTop: asideRect.top,
        asideBottom: asideRect.bottom,
        asideHeight: asideRect.height,
        textareaTop: taRect.top,
        textareaHitTag: textareaHitTarget?.tagName ?? null,
        textareaHitClass:
          textareaHitTarget instanceof HTMLElement ? textareaHitTarget.className : null,
        textareaReceivesPointer: textarea?.contains(textareaHitTarget),
      };
    });

    expect(metrics, 'popout aside + textarea must both be present').not.toBeNull();
    const m = metrics!;

    expect(m.position, 'popout aside must be position:absolute').toBe('absolute');
    expect(
      m.asideTop,
      `popout top (${Math.round(m.asideTop)}) must be above textarea top (${Math.round(m.textareaTop)})`,
    ).toBeLessThan(m.textareaTop);
    expect(m.asideHeight, 'popout must have real height').toBeGreaterThan(100);
    expect(m.asideBottom, 'popout must end before the composer starts').toBeLessThanOrEqual(
      m.textareaTop,
    );
    expect(
      m.textareaReceivesPointer,
      `textarea hit target was ${m.textareaHitTag ?? 'null'} ${String(m.textareaHitClass ?? '')}`,
    ).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('popout-diff')).toBeHidden({ timeout: 2_000 });
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('activity toolbar opens the review popout', async () => {
  const testId = `popout-toolbar-${Date.now()}`;
  const projectDir = path.join(os.tmpdir(), `kodax-test-proj-${testId}`);
  await fs.mkdir(projectDir, { recursive: true });

  const space = await launchSpace(testId);
  try {
    const { page } = space;
    await space.seedProject(projectDir);

    await page.getByRole('button', { name: 'Activity views' }).click();
    await page.getByRole('button', { name: /^Review\b/ }).click();

    await expect(page.getByTestId('popout-diff')).toBeVisible({ timeout: 5_000 });
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});
