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
    const agent = picker.getByRole('radio', { name: 'Agent', exact: true });
    await expect(agent).toBeEnabled({ timeout: 30_000 });
    await agent.click();
    await expect(agent).toBeChecked();
    await expect(agent).toBeEnabled();
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
    expect(mode).toMatchObject({ ok: true, data: { workMode: 'agent', locked: true } });
    await expect(space.page.getByTestId('work-mode-current')).toContainText('Agent');
    await expect(picker).toHaveCount(0);
    await space.page.screenshot({ path: test.info().outputPath('first-input-locked.png') });
    expect(provider.requests).toEqual(['FIRST_AGENT_INPUT']);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('work-mode command reads but cannot change a started session, without a model request', async () => {
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
    const composer = space.page.getByTestId('composer-input');
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
    await expect(
      space.page.getByText(
        'Work mode is fixed for this conversation. Start a new session to choose another mode.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(space.page.getByTestId('work-mode-current')).toContainText('Coding');
    expect(await command(['invalid'])).toMatchObject({ ok: true, data: { ok: false } });
    expect(await command(['coding', 'extra'])).toMatchObject({ ok: true, data: { ok: false } });
    expect(await command([])).toMatchObject({ ok: true, data: { message: 'Work mode: coding' } });
    expect(provider.requests.length).toBe(requests);
  } finally {
    await provider.close();
    await space.close();
  }
});
