import { expect, test } from '@playwright/test';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test('Coder executes the installed draft-response builtin through the independent Host', async () => {
  test.setTimeout(90_000);
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `sdk-builtin-${Date.now()}`,
    provider.url,
  );
  try {
    const skills = await space.page.evaluate(
      (root) => window.kodaxSpace!.invoke('skill.discover', { projectRoot: root }),
      projectRoot,
    );
    if (!skills.ok) throw new Error(skills.error.message);
    const skill = skills.data.skills.find((item) => item.name === 'draft-response');
    await sendSdkPrompt(space, '/draft-response Draft a polite response to a delivery delay.');
    await expect(space.page.getByTestId('conversation-stream')).toContainText('SDK_REPLY:', {
      timeout: 20_000,
    });
    await waitSdkIdle(space, await currentSdkSession(space));
    expect(provider.requests.length).toBeGreaterThan(0);
    expect(provider.errors).toEqual([]);
    expect(skill?.source).toBe('builtin');
  } finally {
    await provider.close();
    await space.close();
  }
});
