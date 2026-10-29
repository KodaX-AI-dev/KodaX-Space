import { expect, test } from '@playwright/test';
import {
  createLocalSdkProvider,
  launchRealSdkSpace,
  sendSdkPrompt,
  currentSdkSession,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test.setTimeout(90_000);

test('a new Coder session can select Agent before its first input reaches the Host', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`work-draft-${Date.now()}`, provider.url);
  try {
    const picker = space.page.getByTestId('work-mode-selector');
    await expect(picker).toBeEnabled({ timeout: 30_000 });
    await picker.selectOption('agent');
    await expect(picker).toHaveValue('agent');
    await expect(picker).toBeEnabled();
    expect(provider.requests).toEqual([]);
    await space.page.screenshot({ path: test.info().outputPath('first-input-agent.png') });
    const draftId = await currentSdkSession(space);
    await sendSdkPrompt(space, 'FIRST_AGENT_INPUT');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:FIRST_AGENT_INPUT',
    );
    expect(await currentSdkSession(space)).toBe(draftId);
    const mode = await space.page.evaluate(
      (sessionId) => window.kodaxSpace!.invoke('session.workMode', { sessionId }),
      draftId,
    );
    expect(mode).toMatchObject({ ok: true, data: { workMode: 'agent' } });
    expect(provider.requests).toEqual(['FIRST_AGENT_INPUT']);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('work-mode command reads and updates the Host without a model request', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `work-command-${Date.now()}`,
    provider.url,
  );
  try {
    await sendSdkPrompt(space, 'MODE_INITIAL');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:MODE_INITIAL',
    );
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);
    const requests = provider.requests.length;
    const composer = space.page.locator('textarea').first();
    await composer.fill('/work-mode');
    await composer.press('Escape');
    await composer.press('Enter');
    await expect(space.page.getByTestId('conversation-stream')).toContainText('Work mode: coding');
    const command = (args: string[]) =>
      space.page.evaluate((input) => window.kodaxSpace!.invoke('slash.exec', input), {
        sessionId,
        expectedProjectRoot: projectRoot,
        expectedSurface: 'code' as const,
        name: 'work-mode',
        args,
      });
    expect(await command([])).toMatchObject({
      ok: true,
      data: { ok: true, message: 'Work mode: coding' },
    });
    await composer.fill('/work-mode agent');
    await composer.press('Escape');
    await composer.press('Enter');
    await expect(space.page.getByTestId('conversation-stream')).toContainText('Work mode: agent');
    await expect(space.page.getByTestId('work-mode-selector')).toHaveValue('agent');
    expect(await command(['invalid'])).toMatchObject({ ok: true, data: { ok: false } });
    expect(await command(['coding', 'extra'])).toMatchObject({ ok: true, data: { ok: false } });
    expect(await command([])).toMatchObject({ ok: true, data: { message: 'Work mode: agent' } });
    expect(provider.requests.length).toBe(requests);
  } finally {
    await provider.close();
    await space.close();
  }
});
