import { expect, test, type Locator } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { saveGeneratedWorkflow } from '@kodax-ai/kodax/coding';
import type { PushPayload, WorkflowRunT } from '@kodax-space/space-ipc-schema';
import type { SpaceInstance } from './fixtures.js';
import { createContractProvider } from './sdk-contract-fixture.js';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test.setTimeout(120_000);

test('repo inspection uses the current execution Host without initializing or calling the model', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(`repo-host-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'REPO_HOST_SETUP');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:REPO_HOST_SETUP',
    );
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);
    const before = provider.requests.length;
    const facts = await space.page.evaluate(
      async (input) => ({
        profile: await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined),
        repo: await window.kodaxSpace!.invoke('repointel.status', input),
      }),
      { sessionId, projectRoot, probe: false },
    );
    expect(facts.repo).toMatchObject({ ok: true, data: { initialized: false } });
    if (!facts.repo.ok || !facts.profile.ok) throw new Error('Host facts unavailable');
    expect(facts.repo.data.runtimeId).toBe(facts.profile.data.connection.runtimeId);
    await sendSdkPrompt(space, '/repointel status');
    await expect(space.page.getByTestId('conversation-stream')).toContainText('initialized=false');
    expect(provider.requests).toHaveLength(before);
    await space.page.screenshot({ path: test.info().outputPath('repo-host-inspection.png') });
  } finally {
    await provider.close();
    await space.close();
  }
});

async function completedHostWorkflow(
  space: SpaceInstance,
  projectRoot: string,
): Promise<WorkflowRunT> {
  await sendSdkPrompt(space, 'WORKFLOW_UI_SETUP');
  await expect(space.page.getByTestId('conversation-stream')).toContainText(
    'SDK_REPLY:WORKFLOW_UI_SETUP',
    { timeout: 30_000 },
  );
  const sessionId = await currentSdkSession(space);
  await waitSdkIdle(space, sessionId);
  const saved = await saveGeneratedWorkflow({
    dir: path.join(projectRoot, '.kodax/workflows'),
    name: 'acceptance-ui',
    manifest: {
      name: 'acceptance-ui',
      description: 'UI contract acceptance',
      phases: ['check'],
      readOnly: true,
      maxAgents: 1,
      maxConcurrency: 1,
      patterns: ['fan-out-and-synthesize'],
    },
    source: 'async function run() { return { synthesis: "ACCEPTANCE_WORKFLOW_DONE" }; }',
  });
  const started = await space.page.evaluate(
    (input) => window.kodaxSpace!.invoke('workflow.start', input),
    { sessionId, source: 'saved' as const, target: saved.path },
  );
  if (!started.ok || !('runId' in started.data)) throw new Error(JSON.stringify(started));
  const runId = started.data.runId;
  const read = () =>
    space.page.evaluate((runId) => window.kodaxSpace!.invoke('workflow.get', { runId }), runId);
  await expect
    .poll(async () => {
      const r = await read();
      return r.ok && r.data.run?.status;
    })
    .toBe('completed');
  const completed = await read();
  if (!completed.ok || !completed.data.run) throw new Error('Host workflow result missing');
  return completed.data.run;
}

async function sendWorkflowObservation(
  space: SpaceInstance,
  payload: PushPayload<'workflow.observation'>,
) {
  await space.app.evaluate(({ BrowserWindow }, value) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('app://space/'),
    )!;
    win.webContents.send('workflow.observation', value);
  }, payload);
}

async function delayWorkflowList(space: SpaceInstance) {
  await space.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('workflow.list');
    ipcMain.handle(
      'workflow.list',
      () =>
        new Promise((resolve) => {
          Reflect.set(globalThis, 'acceptanceReleaseWorkflowRead', () =>
            resolve({ ok: true, data: { stale: true, runs: [] } }),
          );
        }),
    );
  });
  await space.page
    .getByTestId('workflow-management-panel')
    .getByRole('button', { name: 'Refresh workflow list', exact: true })
    .click();
  await expect
    .poll(() =>
      space.app.evaluate(() => typeof Reflect.get(globalThis, 'acceptanceReleaseWorkflowRead')),
    )
    .toBe('function');
}

async function staleWorkflowList(space: SpaceInstance, hostRun: WorkflowRunT) {
  await space.app.evaluate(({ ipcMain }, run) => {
    ipcMain.removeHandler('workflow.list');
    ipcMain.handle('workflow.list', () => ({
      ok: true,
      data: { stale: true, runs: [{ ...run, status: 'running' }] },
    }));
  }, hostRun);
}

async function openWorkflowManagement(space: SpaceInstance) {
  await space.page.getByRole('button', { name: 'Activity views', exact: true }).click();
  await space.page
    .getByRole('button', { name: 'Workflow', exact: true })
    .and(space.page.locator('[title="Workflow"]'))
    .click();
  return space.page.getByTestId('workflow-management-panel');
}

test('a completed Host workflow survives stale list fallback and delayed reads in its management UI', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `workflow-ui-${Date.now()}`,
    provider.url,
  );
  try {
    const hostRun = await completedHostWorkflow(space, projectRoot);
    const requestsBefore = provider.requests.length;
    // Fault injection starts at the public IPC boundary; execution above used the actual Host.
    await staleWorkflowList(space, hostRun);
    const panel = await openWorkflowManagement(space);
    await expect(panel).toContainText('last known results may be out of date');
    await expect(
      panel
        .getByTestId('workflow-run-list-item')
        .filter({ hasText: hostRun.displayName ?? hostRun.workflowName }),
    ).toContainText('completed');
    const notices = space.page.locator(
      '[data-testid="system-notice"][data-notice-variant="workflow"]',
    );
    const noticeCount = await notices.count();
    await sendWorkflowObservation(space, { status: 'recovering' });
    await expect(panel).toContainText('reconnecting');
    await delayWorkflowList(space);
    await sendWorkflowObservation(space, { status: 'ready', runs: [hostRun] });
    await expect(panel).not.toContainText('reconnecting');
    await expect(panel).not.toContainText('out of date');
    await space.app.evaluate(() =>
      (Reflect.get(globalThis, 'acceptanceReleaseWorkflowRead') as () => void)(),
    );
    await expect(panel).not.toContainText('out of date');
    await expect(notices).toHaveCount(noticeCount);
    expect(provider.requests).toHaveLength(requestsBefore);
    await space.page.screenshot({ path: test.info().outputPath('workflow-recovered.png') });
  } finally {
    await provider.close();
    await space.close();
  }
});

async function seedBrokenExtension(root: string) {
  const extension = path.join(root, 'acceptance-broken.mjs');
  await writeFile(
    extension,
    'export default function () { throw new Error("Cannot find module acceptance-dependency?token=acceptance-secret"); }',
  );
  await mkdir(path.join(root, 'integrations'), { recursive: true });
  await writeFile(
    path.join(root, 'integrations/extensions.json'),
    JSON.stringify({ version: 1, paths: [extension] }),
  );
}

async function expectNoWorkflowManagement(scope: Locator) {
  for (const name of ['Rename', 'Delete', 'Save', 'Rerun']) {
    const button = scope.getByRole('button', { name, exact: true });
    await expect(button).toHaveCount(0);
  }
}

async function readHostManagementResults(space: SpaceInstance, runId: string) {
  const result = await space.page.evaluate(
    async (runId) => ({
      rename: await window.kodaxSpace!.invoke('workflow.rename', {
        runId,
        displayName: 'UNSUPPORTED_RENAME',
      }),
      delete: await window.kodaxSpace!.invoke('workflow.delete', { runId }),
      retained: await window.kodaxSpace!.invoke('workflow.get', { runId }),
    }),
    runId,
  );
  await writeFile(
    test.info().outputPath('host-workflow-management.json'),
    JSON.stringify(result, null, 2),
  );
  return result;
}

test('explicit Workflow execution retains its Host final response without saved-run management', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `workflow-management-${Date.now()}`,
    provider.url,
  );
  try {
    const run = await completedHostWorkflow(space, projectRoot);
    const results = await readHostManagementResults(space, run.runId);
    const unsupported = {
      ok: true,
      data: { ok: false, unavailableReason: 'host-management-unavailable' },
    };
    expect(results.rename).toMatchObject(unsupported);
    expect(results.delete).toMatchObject(unsupported);
    expect(results.retained).toMatchObject({
      ok: true,
      data: { run: { runId: run.runId, status: 'completed' } },
    });
    const panel = await openWorkflowManagement(space);
    await expectNoWorkflowManagement(panel);
    await expect(panel.getByTestId('workflow-saved-list-item')).toHaveCount(0);
    await panel.getByTestId('workflow-result-toggle').click();
    await expect(panel.getByTestId('workflow-result-body')).toContainText(
      'ACCEPTANCE_WORKFLOW_DONE',
    );
    const result = await space.page.evaluate(
      (runId) => window.kodaxSpace!.invoke('workflow.result', { runId }),
      run.runId,
    );
    expect(result).toMatchObject({
      ok: true,
      data: { result: expect.stringContaining('ACCEPTANCE_WORKFLOW_DONE') },
    });
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'ACCEPTANCE_WORKFLOW_DONE',
    );
    await expect(
      space.page
        .locator('[data-testid="system-notice"][data-notice-variant="workflow"]')
        .filter({ hasText: '[workflow] completed:' }),
    ).toHaveCount(0);
    await space.page.screenshot({
      path: test.info().outputPath('workflow-management-capabilities.png'),
    });
  } finally {
    await provider.close();
    await space.close();
  }
});

async function readExtensionHealth(space: SpaceInstance) {
  const result = await space.page.evaluate(() =>
    window.kodaxSpace!.invoke('runtime.extensionHealth', undefined),
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

async function expectAvailableBuiltinsWithFailure(space: SpaceInstance) {
  await expect
    .poll(
      async () =>
        (await readExtensionHealth(space)).failures.some(
          (f) => f.target === 'acceptance-broken.mjs',
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  const actual = await readExtensionHealth(space);
  await writeFile(
    test.info().outputPath('actual-extension-health.json'),
    JSON.stringify(actual, null, 2),
  );
  await writeFile(
    test.info().outputPath('configured-extension-paths.json'),
    await readFile(path.join(space.testDataDir, 'integrations/extensions.json'), 'utf8'),
  );
  expect(actual).toMatchObject({ state: 'ready', builtins: { skills: true, artifacts: true } });
  expect(JSON.stringify(actual)).not.toContain('acceptance-secret');
  expect(JSON.stringify(actual)).not.toContain(space.testDataDir);
}

test('actual Host extension diagnostics reach Settings while Skills and conversation remain available', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(
    `extensions-ui-${Date.now()}`,
    provider.url,
    seedBrokenExtension,
  );
  try {
    await sendSdkPrompt(space, 'EXTENSION_DIAGNOSTICS_SETUP');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:EXTENSION_DIAGNOSTICS_SETUP',
      { timeout: 30_000 },
    );
    expect(provider.requests).toContain('EXTENSION_DIAGNOSTICS_SETUP');
    await waitSdkIdle(space, await currentSdkSession(space));
    await expectAvailableBuiltinsWithFailure(space);
    await space.page.getByTestId('settings-button').click();
    await space.page.locator('#settings-tab-diagnostics').click();
    const panel = space.page.getByTestId('extension-health');
    await expect(panel).toContainText('Builtin capabilities are available.');
    await panel.locator('summary').click();
    await expect(panel).toContainText('acceptance-broken.mjs');
    await expect(panel).toContainText('extension module or dependency is missing');
    await expect(panel).not.toContainText('acceptance-secret');
    await space.page.screenshot({ path: test.info().outputPath('host-extension-diagnostics.png') });
    await space.page.keyboard.press('Escape');
    await sendSdkPrompt(space, 'EXTENSION_FAILURE_CHAT_CONTINUES');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:EXTENSION_FAILURE_CHAT_CONTINUES',
      { timeout: 30_000 },
    );
    await waitSdkIdle(space, await currentSdkSession(space));
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('a model can invoke a Space builtin on the first Coder turn without opening Skill discovery', async () => {
  const provider = await createContractProvider({
    NATURAL_BUILTIN: [{ name: 'skill', input: { skill: 'draft-response' } }],
  });
  const { space } = await launchRealSdkSpace(`natural-builtin-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'NATURAL_BUILTIN');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'CONTRACT_DONE:NATURAL_BUILTIN',
      { timeout: 30_000 },
    );
    await waitSdkIdle(space, await currentSdkSession(space));
    const results = provider.requests
      .filter((r) => r.prompt === 'NATURAL_BUILTIN')
      .flatMap((r) => r.results)
      .join('\n');
    expect(results).toContain('区分客户陈述');
    expect(results).not.toMatch(/unknown Skill|not registered|Provider request failed/);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('a real pending Host question survives Renderer reload and answers once without a default submission', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`question-reload-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'SDK_QUESTION');
    const sessionId = await currentSdkSession(space);
    const question = space.page.getByText('Choose a direction before continuing', { exact: true });
    await expect(question).toBeVisible({ timeout: 20_000 });
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_QUESTION' })
      .first()
      .click();
    await expect(question).toBeVisible({ timeout: 20_000 });
    expect(await currentSdkSession(space)).toBe(sessionId);
    expect(provider.questionResults).toEqual([]);
    await space.page.getByRole('button', { name: 'Skip (Esc)', exact: true }).click();
    await waitSdkIdle(space, sessionId);
    expect(provider.questionResults).toEqual([
      expect.objectContaining({ status: 'unanswered', reason: 'skipped' }),
    ]);
    expect(provider.requests.filter((p) => p === 'SDK_QUESTION')).toHaveLength(2);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

const RESPONSES_METADATA = {
  api: 'responses' as const,
  headers: { 'x-route-id': 'acceptance-route' },
  reasoningProfile: { effortStrategy: 'openai-chat-effort' as const },
};
const RESPONSES_MODEL = { id: 'retained-model', contextWindow: 131_072, maxOutputTokens: 8_192 };

async function seedResponsesProvider(root: string) {
  const { createCustomProvider, createFileProviderCredentialStore } =
    await import('@kodax-ai/kodax/llm');
  const connection = {
    name: 'responses-acceptance',
    protocol: 'openai' as const,
    baseUrl: 'https://example.invalid/v1',
    apiKeyEnv: 'SPACE_ACCEPTANCE_RESPONSES_KEY',
    model: RESPONSES_MODEL.id,
    models: [RESPONSES_MODEL],
    ...RESPONSES_METADATA,
  };
  await writeFile(
    path.join(root, 'config.json'),
    JSON.stringify({
      customProviders: [connection],
    }),
  );
  await createFileProviderCredentialStore(path.join(root, 'auth.json')).setApiKey(
    {
      profile: 'default',
      provider: connection.name,
      connectionFingerprint: createCustomProvider(connection).getCredentialConnectionFingerprint(),
    },
    'fixture-responses-key',
  );
}

test('editing a Responses provider through Settings preserves SDK-only route and model metadata', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(
    `provider-edit-${Date.now()}`,
    provider.url,
    seedResponsesProvider,
  );
  try {
    await space.page.getByTestId('settings-button').click();
    await space.page.locator('#settings-tab-providers').click();
    const card = space.page.locator('article').filter({ hasText: 'responses-acceptance' });
    await card.getByRole('button', { name: 'Edit', exact: true }).click();
    await space.page.getByLabel('Display name', { exact: true }).fill('responses-retained');
    await space.page.getByRole('button', { name: 'Save provider', exact: true }).click();
    await expect(
      space.page.locator('article').filter({ hasText: 'responses-retained' }),
    ).toBeVisible();
    const config = JSON.parse(
      await readFile(path.join(space.testDataDir, 'config.json'), 'utf8'),
    ) as {
      customProviders: Array<Record<string, unknown>>;
    };
    const retained = config.customProviders.find((p) => p.name === 'responses-retained');
    expect(retained).toMatchObject({ ...RESPONSES_METADATA, models: [RESPONSES_MODEL] });
    expect(provider.requests).toEqual([]);
    await space.page.screenshot({
      path: test.info().outputPath('responses-provider-retained.png'),
    });
  } finally {
    await provider.close();
    await space.close();
  }
});
