import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runIsolatedSdkProbe } from './sdk-runtime-probe.js';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test.setTimeout(150_000);

async function prepareGlobalRules(root: string) {
  await mkdir(path.join(root, 'rules'), { recursive: true });
  await writeFile(path.join(root, 'rules', 'AGENTS.md'), 'GLOBAL_FRAGMENT_KEEP');
  await writeFile(path.join(root, 'AGENTS.md'), 'GLOBAL_AGENTS_KEEP');
}

async function prepareProjectRules(root: string) {
  const rules = path.join(root, '.kodax', 'rules');
  await mkdir(rules, { recursive: true });
  for (let index = 0; index < 24; index++) {
    await writeFile(
      path.join(rules, index === 0 ? 'AGENTS.md' : `rule-${index}.md`),
      index === 0 ? 'PROJECT_FRAGMENT_KEEP' : `Project rule ${index}: preserve existing behavior.`,
    );
  }
  await writeFile(path.join(root, 'AGENTS.md'), 'PROJECT_AGENTS_KEEP');
}

test('beta.3 rules reach Coder and Partner while instruction editing preserves every fragment', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `beta3-rules-${Date.now()}`,
    provider.url,
    prepareGlobalRules,
  );
  try {
    await prepareProjectRules(projectRoot);
    await sendSdkPrompt(space, 'BETA3_RULES_CODER');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:BETA3_RULES_CODER',
    );
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);
    await verifyHostContracts(space, sessionId);
    await assertContextSources(space, sessionId, projectRoot);
    expect(provider.requestInstructions[0]).toContain('GLOBAL_FRAGMENT_KEEP');
    expect(provider.requestInstructions[0]).toContain('PROJECT_FRAGMENT_KEEP');
    await editProjectInstructions(space, projectRoot);
    await assertSourceFiles(space, projectRoot);
    await space.page
      .getByTestId('popout-agents')
      .getByRole('button', { name: 'Close popout' })
      .click();
    await space.page.getByRole('button', { name: 'Partner', exact: true }).click();
    await sendSdkPrompt(space, 'BETA3_RULES_PARTNER');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:BETA3_RULES_PARTNER',
    );
    expect(provider.requestInstructions.at(-1)).toContain('PROJECT_FRAGMENT_KEEP');
    expect(provider.requestInstructions.at(-1)).toContain('GLOBAL_FRAGMENT_KEEP');
    expect(provider.errors).toEqual([]);
  } finally {
    await space.close();
    await provider.close();
  }
});

type Space = Awaited<ReturnType<typeof launchRealSdkSpace>>['space'];

async function assertContextSources(space: Space, sessionId: string, projectRoot: string) {
  const context = await space.page.evaluate(
    (sessionId) => window.kodaxSpace!.invoke('session.agentsMd', { sessionId }),
    sessionId,
  );
  expect(context.ok).toBe(true);
  if (!context.ok) throw new Error(context.error.message);
  expect(context.data.files).toHaveLength(27);
  expect(
    context.data.files
      .filter((file) => file.editableScope)
      .map((file) => file.path)
      .sort(),
  ).toEqual(
    [path.join(space.testDataDir, 'AGENTS.md'), path.join(projectRoot, 'AGENTS.md')].sort(),
  );
}

async function assertSourceFiles(space: Space, projectRoot: string) {
  await expect
    .poll(() => readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8'))
    .toBe('PROJECT_AGENTS_UPDATED');
  expect(await readFile(path.join(space.testDataDir, 'AGENTS.md'), 'utf8')).toBe(
    'GLOBAL_AGENTS_KEEP',
  );
  expect(await readFile(path.join(space.testDataDir, 'rules', 'AGENTS.md'), 'utf8')).toBe(
    'GLOBAL_FRAGMENT_KEEP',
  );
  const rules = path.join(projectRoot, '.kodax', 'rules');
  expect(await readFile(path.join(rules, 'AGENTS.md'), 'utf8')).toBe('PROJECT_FRAGMENT_KEEP');
  for (let index = 1; index < 24; index++) {
    expect(await readFile(path.join(rules, `rule-${index}.md`), 'utf8')).toBe(
      `Project rule ${index}: preserve existing behavior.`,
    );
  }
}

const HOST_CONTRACT_PROBE = `
    const settings=await client.sessions.getSettingsVersioned(process.env.SPACE_CONTRACT_SESSION);
    process.stdout.write(JSON.stringify({capabilities:client.capabilities,workModeLocked:settings.workModeLocked}));
  `;

async function verifyHostContracts(space: Space, sessionId: string) {
  const { stdout } = await runIsolatedSdkProbe(
    space,
    HOST_CONTRACT_PROBE,
    { SPACE_CONTRACT_SESSION: sessionId },
    20_000,
  );
  const facts = JSON.parse(stdout) as {
    capabilities: Record<string, number | { version: number }>;
    workModeLocked: boolean;
  };
  for (const name of [
    'productHistoryLocation',
    'productHistoryTurnResolution',
    'productInputRecovery',
    'productExecutionModeConstraint',
    'repoIntelligenceDiagnostics',
  ]) {
    const capability = facts.capabilities[name];
    expect(
      typeof capability === 'number' ? capability : capability?.version,
      name,
    ).toBeGreaterThanOrEqual(1);
  }
  expect(facts.workModeLocked).toBe(true);
  const executable = await space.app.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    executable: process.execPath,
    electron: process.versions.electron,
  }));
  const evidence = test.info().outputPath('actual-beta3-host-contracts.json');
  await writeFile(evidence, JSON.stringify({ facts, executable }));
  await test.info().attach('actual-beta3-host-contracts.json', {
    path: evidence,
    contentType: 'application/json',
  });
}

async function editProjectInstructions(space: Space, projectRoot: string) {
  await space.page.getByRole('button', { name: 'Activity views', exact: true }).click();
  await space.page.getByRole('button', { name: 'Agents', exact: true }).click();
  const panel = space.page.getByTestId('popout-agents');
  await expect(panel.getByText('GLOBAL_FRAGMENT_KEEP', { exact: true })).toBeVisible();
  await panel.screenshot({ path: test.info().outputPath('beta3-instructions.png') });
  await expect(panel.getByRole('button', { name: /Edit$/ })).toHaveCount(0);
  await panel
    .getByRole('button')
    .and(panel.getByTitle(path.join(projectRoot, 'AGENTS.md'), { exact: true }))
    .click();
  await panel.getByRole('button', { name: /Edit$/ }).click();
  const editor = panel.locator('textarea');
  await expect(editor).toHaveValue('PROJECT_AGENTS_KEEP');
  await editor.fill('PROJECT_AGENTS_UPDATED');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toHaveCount(0);
}
