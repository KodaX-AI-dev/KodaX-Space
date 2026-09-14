import { test, expect } from '@playwright/test';
import path from 'node:path';
import { launchSpace } from './fixtures.js';

test('bundled Partner is available with the default Coder runtime', async () => {
  test.setTimeout(60_000);
  const space = await launchSpace(`partner-default-runtime-${Date.now()}`, {
    executablePath: process.env.SPACE_BUNDLED_TEST_EXECUTABLE,
  });
  try {
    const { page } = space;
    await expect
      .poll(
        async () => {
          const profile = await page.evaluate(() =>
            window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined),
          );
          if (!profile.ok) throw new Error(profile.error.message);
          return profile.data.connection.state;
        },
        { timeout: 20_000 },
      )
      .toBe('ready');
    await page.getByRole('button', { name: 'Partner', exact: true }).click();
    await expect(page.getByTestId('partner-plugins-nav')).toBeVisible();
    await page
      .getByTestId('partner-starter-tasks')
      .getByRole('button', { name: /Polish your writing/ })
      .click();
    await expect(page.getByTestId('partner-expert-chip')).toHaveText('营销文案');
    await page.getByRole('button', { name: 'Coder', exact: true }).click();
    await expect(page.getByTestId('coder-workspace')).toBeVisible();
    await expect(page.getByTestId('partner-plugins-nav')).toHaveCount(0);
  } finally {
    await space.close();
  }
});

test('a fresh Space profile can select and use the bundled Partner expert', async () => {
  const space = await launchSpace(`partner-bundled-${Date.now()}`, {
    executablePath: process.env.SPACE_BUNDLED_TEST_EXECUTABLE,
    env: { KODAX_SPACE_RUNTIME_HOST: 'legacy' },
  });
  const { page } = space;
  try {
    const installed = await page.evaluate(async () => {
      const result = await window.kodaxSpace!.invoke('space.extensions.list', {});
      if (!result.ok) throw new Error(result.error.message);
      return result.data.extensions;
    });
    expect(installed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'kodax.partner-library', enabled: true }),
      ]),
    );

    await page.getByRole('button', { name: 'Partner', exact: true }).click();
    const composer = page.locator('textarea:visible').first();
    await page
      .getByTestId('partner-starter-tasks')
      .getByRole('button', { name: /Polish your writing/ })
      .click();
    await expect(page.getByTestId('partner-expert-chip')).toHaveText('营销文案');
    await expect(composer).not.toHaveValue('');
    const starterDraft = await composer.inputValue();
    await expect(page.getByTestId('sidebar-session-row')).toHaveCount(0);
    await page.getByTestId('partner-plugins-nav').click();
    const library = page.frameLocator('[data-testid="space-extension-frame"]');
    await library.getByRole('button', { name: '查看 营销文案 详情', exact: true }).click();
    await expect(library.getByRole('checkbox', { name: '使用默认方法' })).toBeChecked();
    await library.getByRole('button', { name: '使用专家', exact: true }).click();
    await expect(page.getByTestId('partner-expert-chip')).toHaveText('营销文案');
    await expect(composer).toHaveValue(starterDraft);

    await expect(composer).toBeEnabled();
    await composer.fill('请为测试产品起草一段首页文案。');
    await composer.press('Enter');
    await expect(
      page
        .getByTestId('conversation-stream')
        .getByText(/Ran 1 command/)
        .first(),
    ).toBeVisible({ timeout: 20_000 });
    const expert = await page.evaluate(async () => {
      const bridge = window.kodaxSpace!;
      const projectRoot = localStorage.getItem('kodax-space.currentProjectPath');
      if (!projectRoot) throw new Error('Current workspace unavailable');
      const sessions = await bridge.invoke('session.list', { projectRoot, surface: 'partner' });
      if (!sessions.ok) throw new Error(sessions.error.message);
      if (sessions.data.sessions.length !== 1) throw new Error('Expected one Partner session');
      const state = await bridge.invoke('session.partnerExpert.get', {
        sessionId: sessions.data.sessions[0].sessionId,
      });
      if (!state.ok) throw new Error(state.error.message);
      return state.data;
    });
    expect(expert).toMatchObject({
      available: true,
      expert: {
        extensionId: 'kodax.partner-library',
        useSkill: true,
        expert: { id: 'writing-mentor', skillRef: 'copywriting' },
      },
    });
    await expect(page.getByTestId('partner-expert-chip')).toHaveText('营销文案');
    await page.screenshot({
      path: path.join('artifacts', 'partner-ui-audit', 'bundled-expert.png'),
    });
    await page.reload();
    await page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: '请为测试产品起草一段首页文案。' })
      .click();
    await expect(page.getByTestId('partner-expert-chip')).toHaveText('营销文案');

    await page.getByRole('button', { name: 'Coder', exact: true }).click();
    await expect(page.getByTestId('partner-expert-chip')).toHaveCount(0);
    await expect(page.getByTestId('partner-plugins-nav')).toHaveCount(0);
  } finally {
    await space.close();
  }
});
