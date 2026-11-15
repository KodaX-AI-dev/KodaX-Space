import { expect, test } from '@playwright/test';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test.setTimeout(150_000);

test('a running child agent shows its live work at the bottom while the root waits', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`live-child-${Date.now()}`, provider.url);
  const { page } = space;
  const shot = (name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  try {
    await sendSdkPrompt(space, 'WARMUP');
    await expect(page.getByText('SDK_REPLY:WARMUP')).toBeVisible({ timeout: 20_000 });
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);

    await sendSdkPrompt(space, 'LIVE_CHILD_AGENT');
    await expect
      .poll(() => provider.requests.some((prompt) => prompt.includes('CHILD_PROBE_WORK')), {
        timeout: 30_000,
      })
      .toBe(true);
    const rows = page.getByTestId('child-agent-live-row');
    await expect(rows).toHaveCount(1, { timeout: 20_000 });
    await expect(rows.first()).toContainText('child-probe');
    await expect(rows.first()).toContainText('checking the README first');
    await expect(page.getByText(/1 个 Agent 工作中|Agents working: 1/)).toBeVisible();
    await shot('1-child-thinking');

    provider.release('CHILD_TOOL');
    await expect(rows.first()).toContainText('writing the child report', { timeout: 20_000 });
    await shot('2-child-after-tool');

    provider.release('CHILD_ANSWER');
    await expect(page.getByText('LIVE_CHILD_DONE')).toBeVisible({ timeout: 60_000 });
    await waitSdkIdle(space, sessionId);
    await expect(rows).toHaveCount(0);
    await shot('3-settled');
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});
