import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  readSdkHistoryPage,
  waitSdkIdle,
} from './sdk-provider-fixture.js';
import type { SpaceInstance } from './fixtures.js';

test.setTimeout(150_000);

function trackRendererFailures(space: SpaceInstance): string[] {
  const errors: string[] = [];
  space.page.on('pageerror', (error) => errors.push(error.message));
  space.page.on('console', (message) => {
    if (message.type() === 'error' && /React error|Maximum update depth/.test(message.text()))
      errors.push(message.text());
  });
  return errors;
}

async function completePrompt(
  space: SpaceInstance,
  provider: Awaited<ReturnType<typeof createLocalSdkProvider>>,
  prompt: string,
  expected = `SDK_REPLY:${prompt}`,
): Promise<void> {
  await sendSdkPrompt(space, prompt);
  await expect.poll(() => provider.requests, { timeout: 30000 }).toContain(prompt);
  await expect(space.page.getByTestId('conversation-stream')).toContainText(expected, {
    timeout: 30000,
  });
  await waitSdkIdle(space, await currentSdkSession(space));
}

async function slash(space: SpaceInstance, sessionId: string, name: string, args: string[]) {
  const result = await space.page.evaluate(
    (input) => window.kodaxSpace!.invoke('slash.exec', input),
    { sessionId, name, args },
  );
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  expect(result.data.ok, JSON.stringify(result.data)).toBe(true);
  return result.data;
}

async function readOptionalText(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

test('goals are stored in the published Host and model default clears its override across UI reload', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot, providerId } = await launchRealSdkSpace(
    `followup-goal-${Date.now()}`,
    provider.url,
  );
  const errors = trackRendererFailures(space);
  try {
    const draft = await space.page.evaluate(
      (input) => window.kodaxSpace!.invoke('session.create', input),
      { projectRoot, provider: providerId, surface: 'code' as const },
    );
    if (!draft.ok) throw new Error(draft.error.message);
    const rejected = await space.page.evaluate(
      (sessionId) =>
        window.kodaxSpace!.invoke('slash.exec', {
          sessionId,
          name: 'goal',
          args: ['Before first message'],
        }),
      draft.data.sessionId,
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok)
      expect(rejected.error.message).toContain('send an input before setting a goal');
    await completePrompt(space, provider, 'FOLLOWUP_GOAL_SEED');
    const id = await currentSdkSession(space);
    await waitSdkIdle(space, id);
    await slash(space, id, 'goal', ['Persisted followup goal', '--tokens', '4000']);
    await slash(space, id, 'goal', ['pause']);
    await slash(space, id, 'model', ['default']);
    const output = await promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      const {connectKodaXRuntime}=await import('@kodax-ai/kodax/runtime');
      const path=await import('node:path');
      const runtime=await connectKodaXRuntime({profile:'coder',sessionsDir:path.join(process.env.KODAX_HOME,'sessions')});
      try {const id=process.env.FOLLOWUP_SESSION;const goal=await runtime.sessions.readGoal(id);const settings=await runtime.sessions.getSettingsVersioned(id);
        process.stdout.write(JSON.stringify({goal,model:settings.value.model??null,repoMode:settings.value.repoIntelligenceMode??null,repoTrace:settings.value.repoIntelligenceTrace??null}));
      }finally{await runtime.close();}`,
      ],
      {
        windowsHide: true,
        timeout: 20000,
        env: { ...process.env, KODAX_HOME: space.testDataDir, FOLLOWUP_SESSION: id },
      },
    );
    expect(JSON.parse(output.stdout)).toMatchObject({
      goal: { objective: 'Persisted followup goal', status: 'paused', tokenBudget: 4000 },
      model: null,
      repoMode: 'off',
      repoTrace: false,
    });
    const auto = await space.page.evaluate(
      (sessionId) =>
        window.kodaxSpace!.invoke('session.setPermissionMode', { sessionId, mode: 'auto' }),
      id,
    );
    expect(auto.ok).toBe(true);
    await completePrompt(space, provider, 'FOLLOWUP_AFTER_MODEL_DEFAULT');
    await waitSdkIdle(space, id);
    const live = await space.page.evaluate(
      (sessionId) => window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId }),
      id,
    );
    if (!live.ok) throw new Error(live.error.message);
    expect(live.data.lastTerminalRun?.phase).toBe('completed');
    expect(provider.requestModels.at(-1)).toBe('space-e2e-model');
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'FOLLOWUP_GOAL_SEED' })
      .first()
      .click();
    const status = await slash(space, id, 'goal', ['status']);
    expect(status.message).toContain('Persisted followup goal');
    expect(status.message).toContain('paused');
    await slash(space, id, 'goal', ['clear']);
    expect((await slash(space, id, 'goal', ['status'])).message).toContain('No goal set');
    expect(errors).toEqual([]);
  } finally {
    await space.close();
    await provider.close();
  }
});

test('Partner proposal review and checkpoint rollback are reachable and change only the reviewed file', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `followup-review-${Date.now()}`,
    provider.url,
  );
  provider.setProject(projectRoot);
  const errors = trackRendererFailures(space);
  try {
    await space.page.getByRole('button', { name: 'Partner', exact: true }).click();
    await completePrompt(space, provider, 'FOLLOWUP_PROPOSE_APPLY');
    const id = await currentSdkSession(space);
    await waitSdkIdle(space, id);
    await expect(
      space.page
        .getByTestId('partner-context-rail')
        .getByRole('button')
        .filter({ hasText: 'reviewed.md' }),
    ).toBeVisible();
    await space.page
      .getByTestId('partner-context-rail')
      .getByRole('button')
      .filter({ hasText: 'reviewed.md' })
      .click();
    const reviews = space.page.getByTestId('partner-file-proposals-panel');
    await expect(reviews).toContainText('REVIEWED_CONTENT');
    await assertAbsent(path.join(projectRoot, 'reviewed.md'));
    await reviews.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect
      .poll(() => readOptionalText(path.join(projectRoot, 'reviewed.md')))
      .toBe('REVIEWED_CONTENT');
    await completePrompt(space, provider, 'FOLLOWUP_PROPOSE_REJECT');
    await waitSdkIdle(space, id);
    await reviews.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(reviews).toContainText('No pending');
    await assertAbsent(path.join(projectRoot, 'rejected.md'));
    await completePrompt(space, provider, 'FOLLOWUP_CHECKPOINT');
    await waitSdkIdle(space, id);
    expect(await readFile(path.join(projectRoot, 'reviewed.md'), 'utf8')).toBe('REVIEWED_CONTENT');
    const allowed = await space.page.evaluate(() =>
      window.kodaxSpace!.invoke('admin.policy.set', {
        workspaceDeliveries: { workspaceWriteAllowed: true, registerWorkspaceAllowed: true },
      }),
    );
    expect(allowed.ok).toBe(true);
    await completePrompt(space, provider, 'FOLLOWUP_CHECKPOINT_ALLOWED');
    await expect
      .poll(() => readOptionalText(path.join(projectRoot, 'reviewed.md')))
      .toBe('CHECKPOINT_REPLACEMENT');
    await space.page.getByTestId('partner-detail-launcher-toggle').click();
    await space.page.getByTestId('partner-detail-open-deliveries').click();
    const history = space.page.getByTestId('partner-deliveries-panel');
    await history.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(history).toContainText('reviewed.md');
    await history.getByRole('button', { name: 'Rollback', exact: true }).click();
    await expect
      .poll(() => readOptionalText(path.join(projectRoot, 'reviewed.md')))
      .toBe('REVIEWED_CONTENT');
    await space.page.screenshot({ path: test.info().outputPath('partner-reviewed-rollback.png') });
    expect(errors).toEqual([]);
  } finally {
    await space.close();
    await provider.close();
  }
});

async function assertAbsent(file: string) {
  expect(
    await stat(file).then(
      () => false,
      (error) => {
        if (error.code === 'ENOENT') return true;
        throw error;
      },
    ),
  ).toBe(true);
}

test('published beta.1 oversized history remains visible with its full Unicode body after reload', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`followup-large-${Date.now()}`, provider.url);
  const errors = trackRendererFailures(space);
  try {
    await completePrompt(space, provider, 'FOLLOWUP_LARGE_HISTORY', 'FOLLOWUP_LARGE_TAIL');
    const id = await currentSdkSession(space);
    await waitSdkIdle(space, id);
    const page = await readSdkHistoryPage(space, id);
    expect(page.productOversized?.length).toBeGreaterThan(0);
    expect(page.productItems?.some((item) => item.text.startsWith('FOLLOWUP_LARGE_HEAD'))).toBe(
      true,
    );
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'FOLLOWUP_LARGE_HISTORY' })
      .first()
      .click();
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'FOLLOWUP_LARGE_TAIL',
      { timeout: 30000 },
    );
    await expect
      .poll(
        async () =>
          (await space.page.getByTestId('conversation-stream').innerText()).includes(
            '中🙂abcdef'.repeat(30_000),
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    const body = await space.page.getByTestId('conversation-stream').innerText();
    expect(body).toContain('FOLLOWUP_LARGE_HEAD');
    expect(body).not.toContain('�');
    expect(errors).toEqual([]);
  } finally {
    await space.close();
    await provider.close();
  }
});
