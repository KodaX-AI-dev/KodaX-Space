import { expect, test } from '@playwright/test';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test('a real Coder question stays pending and Skip continues without selecting its default', async () => {
  test.setTimeout(90_000);
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-question-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'SDK_QUESTION');
    const question = space.page.getByText('Choose a direction before continuing', { exact: true });
    await expect(question).toBeVisible({ timeout: 20_000 });
    expect(provider.questionResults).toEqual([]);
    const screenshot = test.info().outputPath('pending-question.png');
    await space.page.screenshot({ path: screenshot });
    await test.info().attach('pending-question', { path: screenshot, contentType: 'image/png' });
    await space.page.getByRole('button', { name: 'Skip (Esc)', exact: true }).click();
    await expect(question).toHaveCount(0);
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:SDK_QUESTION',
    );
    await waitSdkIdle(space, await currentSdkSession(space));
    expect(provider.questionResults).toEqual([
      expect.objectContaining({ success: true, status: 'unanswered', reason: 'skipped' }),
    ]);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});
