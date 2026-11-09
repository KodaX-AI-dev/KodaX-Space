import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test('local compact has one durable command receipt and history retains colored references', async () => {
  test.setTimeout(120_000);
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`command-history-${Date.now()}`, provider.url);
  try {
    const composer = space.page.getByTestId('composer-input');
    await composer.fill('Inspect @README.md with /skill:code-review');
    await space.page.getByLabel('Send message').click();
    await expect(space.page.getByTestId('user-query-content')).toHaveText(
      'Inspect @README.md with /skill:code-review',
    );
    const sessionId = await currentSdkSession(space);
    await expect(
      space.page.getByText('SDK_REPLY:Inspect @README.md with /skill:code-review', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await waitSdkIdle(space, sessionId);
    const stream = space.page.getByTestId('conversation-stream');
    await expect(stream.locator('[data-composer-token="file"]')).toHaveText('@README.md');
    await expect(stream.locator('[data-composer-token="skill"]')).toHaveText('/skill:code-review');
    await composer.fill('/compact');
    await space.page.getByLabel('Send message').click();
    await expect(composer).toHaveText('');
    await expect(stream.locator('[data-composer-token="command"]')).toHaveText('/compact');
    await expect(stream.getByTestId('user-query-label')).toHaveCount(1);
    await expect(stream.getByText(/Compaction skipped|Compacted context/).first()).toBeVisible({
      timeout: 45_000,
    });
    const view = await space.page.evaluate(
      (id) => window.kodaxSpace!.invoke('session.productSnapshot', { sessionId: id }),
      sessionId,
    );
    expect(view.ok).toBe(true);
    if (view.ok) expect(view.data?.items.filter((item) => item.text === '/compact')).toEqual([]);
    await space.page.reload();
    await space.page
      .getByRole('button', { name: /^Inspect @README.md with \/skill:code-review/ })
      .click();
    await expect(stream.locator('[data-composer-token="command"]')).toHaveText('/compact', {
      timeout: 20_000,
    });
    await expect(stream.getByTestId('user-query-label')).toHaveCount(1);
    await space.page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            document.body.dataset.copiedMessage = text;
          },
        },
      });
    });
    await stream
      .getByTestId('user-message-bubble')
      .getByRole('button', { name: 'Copy message', exact: true })
      .click();
    await expect(space.page.locator('body')).toHaveAttribute(
      'data-copied-message',
      'Inspect @README.md with /skill:code-review',
    );
    await stream
      .getByTestId('local-notice-bubble')
      .filter({ hasText: '/compact' })
      .getByRole('button', { name: 'Copy message', exact: true })
      .click();
    await expect(space.page.locator('body')).toHaveAttribute('data-copied-message', '/compact');
    const commandFits = await stream
      .locator('[data-composer-token="command"]')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
    expect(commandFits, 'short commands must be fully readable in their receipt').toBe(true);
    expect(provider.requests).toEqual(['Inspect @README.md with /skill:code-review']);
    await mkdir('artifacts/command-history', { recursive: true });
    for (const theme of ['light', 'dark']) {
      await space.page.evaluate((next) => {
        document.documentElement.classList.toggle('dark', next === 'dark');
      }, theme);
      await stream.screenshot({ path: `artifacts/command-history/${theme}.png` });
    }
  } finally {
    await space.close();
    await provider.close();
  }
});
