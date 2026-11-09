import { test, expect } from '@playwright/test';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

const QUERY_HEAD = 'QUERY_HEAD: compare the current architecture with the proposed direction.';
const QUERY_TAIL = 'QUERY_TAIL: finish with a concrete recommendation and acceptance criteria.';
const LONG_QUERY = [
  QUERY_HEAD,
  ...Array.from(
    { length: 12 },
    (_, index) =>
      `Context paragraph ${index + 1}: preserve enough deterministic text to wrap across several visual lines in the conversation transcript at supported desktop widths.`,
  ),
  QUERY_TAIL,
].join('\n\n');

test('long user queries keep a four-line preview and can expand or collapse in place', async () => {
  const testId = `user-query-collapse-${Date.now()}`;
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(testId, provider.url);
  try {
    const textarea = space.page.getByTestId('composer-input');
    await expect(textarea).toBeEnabled({ timeout: 10_000 });
    await textarea.fill(LONG_QUERY);
    await textarea.press('Enter');

    const bubble = space.page
      .getByTestId('conversation-stream')
      .getByTestId('user-message-bubble')
      .filter({ hasText: QUERY_HEAD })
      .last();
    await expect(bubble).toBeVisible({ timeout: 10_000 });

    await expect.poll(() => provider.requests.length).toBe(1);
    await waitSdkIdle(space, await currentSdkSession(space));
    await bubble.scrollIntoViewIfNeeded();
    const label = bubble.getByTestId('user-query-label');
    await expect(label).toHaveText('You');
    for (const theme of ['light', 'dark']) {
      await space.page.locator('html').evaluate((element, theme) => {
        element.classList.toggle('dark', theme === 'dark');
      }, theme);
      const style = await bubble.locator('.conversation-user-content').evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          border: Number.parseFloat(style.borderLeftWidth),
          ordinaryBorder: Number.parseFloat(style.borderRightWidth),
          background: style.backgroundColor,
          pixelRatio: window.devicePixelRatio,
        };
      });
      // Chromium snaps border widths to device pixels at fractional desktop scaling.
      expect(style.border).toBeGreaterThan(style.ordinaryBorder * 2);
      expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
      await expect(label).toBeInViewport();
      await test.info().attach(`query-${theme}-style.json`, {
        body: JSON.stringify(style),
        contentType: 'application/json',
      });
      await space.page.screenshot({
        path: test.info().outputPath(`query-${theme}.png`),
        animations: 'disabled',
      });
    }
    const content = bubble.getByTestId('user-query-content');
    const toggle = bubble.getByTestId('user-query-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAccessibleName('Expand query');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(content).toContainText(QUERY_HEAD);

    const collapsed = await content.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(collapsed.overflowY).toBe('hidden');
    expect(collapsed.scrollHeight).toBeGreaterThan(collapsed.clientHeight + 8);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAccessibleName('Collapse query');
    await expect(content).toContainText(QUERY_TAIL);
    await expect
      .poll(async () => {
        const [toggleBox, contentBox] = await Promise.all([
          toggle.boundingBox(),
          content.boundingBox(),
        ]);
        return toggleBox && contentBox ? toggleBox.y < contentBox.y : false;
      })
      .toBe(true);
    await expect
      .poll(() =>
        content.evaluate((element) => Math.abs(element.scrollHeight - element.clientHeight)),
      )
      .toBeLessThanOrEqual(1);

    await bubble.getByRole('button', { name: 'Copy message', exact: true }).click();
    await expect
      .poll(async () =>
        (await space.page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'),
      )
      .toBe(LONG_QUERY);
    await expect(label).toHaveText('You');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAccessibleName('Expand query');
    await expect
      .poll(() => content.evaluate((element) => element.clientHeight))
      .toBeLessThanOrEqual(collapsed.clientHeight + 1);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});
