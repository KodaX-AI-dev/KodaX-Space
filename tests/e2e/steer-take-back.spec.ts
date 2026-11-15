// SDK beta.9: a steer input queued against a real Run can be taken back before its safe point,
// and the model never receives it.
import { expect, test } from '@playwright/test';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test('taking back a steer input before its safe point keeps it from the model', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`steer-take-back-${Date.now()}`, provider.url);
  try {
    // The model call is held open, so the Run cannot reach a safe point.
    await sendSdkPrompt(space, 'HOLD_QUEUE');
    await expect.poll(() => provider.requests).toContain('HOLD_QUEUE');
    const sessionId = await currentSdkSession(space);

    const steer = `STEER_TAKE_BACK ${Date.now()}`;
    const composer = space.page.getByTestId('composer-input');
    await composer.fill(steer);
    await composer.press('Enter');
    const bubble = space.page.getByTestId('queued-user-message-bubble');
    await expect(bubble).toContainText('Interrupt queued');
    await expect(bubble).toContainText('Waiting for safe point');
    await expect(bubble).toHaveAttribute('data-status', 'queued', { timeout: 15_000 });

    await bubble.getByRole('button', { name: 'Take back message', exact: true }).click();
    // The text goes back to the composer and the queued bubble leaves the transcript.
    await expect(bubble).toHaveCount(0);
    await expect(composer).toContainText(steer);

    provider.release('HOLD_QUEUE');
    await expect(
      space.page.getByTestId('conversation-stream').getByText('SDK_REPLY:HOLD_QUEUE'),
    ).toBeVisible({ timeout: 30_000 });
    await waitSdkIdle(space, sessionId);
    expect(provider.requests.join('\n')).not.toContain(steer);
    // The taken-back input does not come back after the Run ends.
    await expect(bubble).toHaveCount(0);
    await expect(composer).toContainText(steer);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});
