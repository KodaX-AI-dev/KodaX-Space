// Partner mode e2e coverage.
//
// These tests intentionally mirror Coder's core "normal use" path while staying
// on the Partner surface: create by first send, receive a mock assistant turn,
// use slash/mode controls, switch surfaces, resume after reload, manage sources,
// and recover the composer after deleting the current Partner session.
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { launchSpace } from './fixtures.js';

type Surface = 'code' | 'partner';

interface SessionListEnvelope {
  ok: boolean;
  data?: { sessions?: Array<{ sessionId: string; title?: string; surface?: Surface }> };
  error?: { message?: string };
}

interface SourceListEnvelope {
  ok: boolean;
  data?: { sources?: Array<{ id: string; label?: string; path: string }> };
  error?: { message?: string };
}

type PartnerSourceSummary = NonNullable<NonNullable<SourceListEnvelope['data']>['sources']>[number];

function sha256(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

async function createProject(testId: string): Promise<string> {
  const projectDir = path.join(os.tmpdir(), `kodax-test-${testId}-project`);
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, 'brief.md'),
    '# Partner brief\n\nUse this file as evidence for the Partner e2e flow.\n',
    'utf-8',
  );
  return projectDir;
}

async function switchSurface(page: Page, surface: 'Coder' | 'Partner'): Promise<void> {
  await page.getByRole('button', { name: surface, exact: true }).click();
}

function launchPartnerSpace(testId: string) {
  // These scenarios exercise the Partner renderer against the mock session
  // host. Shared-daemon startup has separate lifecycle coverage and can block
  // an otherwise isolated UI profile while another local Space is running.
  return launchSpace(testId, {
    env: { KODAX_SPACE_RUNTIME_HOST: 'legacy' },
  });
}

async function readSessions(
  page: Page,
  projectRoot: string,
  surface: Surface,
): Promise<Array<{ sessionId: string; title?: string; surface?: Surface }>> {
  return page.evaluate(
    async ({ projectRoot: root, surface: targetSurface }) => {
      const bridge = (
        window as unknown as {
          kodaxSpace: { invoke: (name: string, input: unknown) => Promise<SessionListEnvelope> };
        }
      ).kodaxSpace;
      const result = await bridge.invoke('session.list', {
        projectRoot: root,
        surface: targetSurface,
      });
      if (!result.ok) throw new Error(result.error?.message ?? 'session.list failed');
      return result.data?.sessions ?? [];
    },
    { projectRoot, surface },
  );
}

async function onlySessionId(page: Page, projectRoot: string, surface: Surface): Promise<string> {
  const sessions = await readSessions(page, projectRoot, surface);
  expect(sessions, `${surface} session count`).toHaveLength(1);
  expect(sessions[0].surface ?? 'code').toBe(surface);
  return sessions[0].sessionId;
}

async function createPartnerSession(page: Page, projectRoot: string): Promise<string> {
  const result = await page.evaluate(async (root) => {
    const bridge = window.kodaxSpace;
    if (!bridge) throw new Error('KodaX Space bridge unavailable');
    return bridge.invoke('session.create', {
      projectRoot: root,
      provider: 'mock',
      surface: 'partner',
    });
  }, projectRoot);
  if (!result.ok) throw new Error(result.error.message);
  return result.data.sessionId;
}

async function readPartnerSources(
  page: Page,
  sessionId: string,
  projectRoot: string,
): Promise<PartnerSourceSummary[]> {
  return page.evaluate(
    async ({ sid, root }) => {
      const bridge = (
        window as unknown as {
          kodaxSpace: { invoke: (name: string, input: unknown) => Promise<SourceListEnvelope> };
        }
      ).kodaxSpace;
      const result = await bridge.invoke('partner.sources.list', {
        sessionId: sid,
        projectRoot: root,
      });
      if (!result.ok) throw new Error(result.error?.message ?? 'partner.sources.list failed');
      return result.data?.sources ?? [];
    },
    { sid: sessionId, root: projectRoot },
  );
}

async function sendPartnerPrompt(page: Page, prompt: string): Promise<void> {
  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeEnabled({ timeout: 10_000 });
  await textarea.fill(prompt);
  await textarea.press('Enter');

  const stream = page.getByTestId('conversation-stream');
  await expect(stream.getByTestId('user-message-bubble').filter({ hasText: prompt })).toBeVisible({
    timeout: 10_000,
  });
  await expect(stream.getByText(/Ran 1 command/).first()).toBeVisible({ timeout: 20_000 });
}

async function seedPartnerDeliveries(options: {
  readonly testDataDir: string;
  readonly projectDir: string;
  readonly sessionId: string;
}): Promise<void> {
  const spaceDir = path.join(options.testDataDir, 'space');
  const now = Date.now();

  const beforeContent = 'before checkpoint content\n';
  const afterContent = 'after checkpoint content\n';
  const targetRelativePath = 'src/partner-note.txt';
  const targetPath = path.join(options.projectDir, ...targetRelativePath.split('/'));
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, afterContent, 'utf-8');

  const checkpointDir = path.join(spaceDir, 'partner-checkpoints', 'pc-e2e');
  const beforeSnapshotPath = path.join(checkpointDir, 'before.bin');
  await fs.mkdir(checkpointDir, { recursive: true });
  await fs.writeFile(beforeSnapshotPath, beforeContent, 'utf-8');

  const runRelativePath = 'reports/custom.weird';
  const runContent = Buffer.from([0x4b, 0x44, 0x58, 0x2d, 0x77, 0x65, 0x69, 0x72, 0x64]);
  const runRootPath = path.join(spaceDir, 'partner-runs', options.sessionId);
  const runPath = path.join(runRootPath, ...runRelativePath.split('/'));
  await fs.mkdir(path.dirname(runPath), { recursive: true });
  await fs.writeFile(runPath, runContent);

  const markdownRelativePath = 'reports/partner-preview.md';
  const markdownContent = [
    '# Partner preview',
    '',
    'This delivery should read like a rendered document, not editable source.',
    '',
    '| State | Surface |',
    '| --- | --- |',
    '| Read only | Artifact preview |',
    '',
  ].join('\n');
  const markdownPath = path.join(runRootPath, ...markdownRelativePath.split('/'));
  await fs.writeFile(markdownPath, markdownContent, 'utf-8');

  const workspaceDelivery = {
    id: 'pd-workspace-e2e',
    sessionId: options.sessionId,
    projectRoot: options.projectDir,
    rootKind: 'workspace-session',
    rootPath: options.projectDir,
    absolutePath: targetPath,
    relativePath: targetRelativePath,
    kind: 'file',
    title: 'partner-note.txt',
    mime: 'text/plain',
    extension: '.txt',
    sizeBytes: Buffer.byteLength(afterContent),
    contentHash: sha256(afterContent),
    sourceRefs: ['brief.md'],
    producer: 'write_partner_workspace_file',
    checkpointId: 'pc-e2e',
    createdAt: now,
    updatedAt: now,
  };
  const arbitraryDelivery = {
    id: 'pd-run-e2e',
    sessionId: options.sessionId,
    projectRoot: options.projectDir,
    rootKind: 'run-output',
    rootPath: runRootPath,
    absolutePath: runPath,
    relativePath: runRelativePath,
    kind: 'file',
    title: 'custom.weird',
    mime: 'application/octet-stream',
    extension: '.weird',
    sizeBytes: runContent.byteLength,
    contentHash: sha256(runContent),
    sourceRefs: [],
    producer: 'write_partner_deliverable',
    createdAt: now + 1,
    updatedAt: now + 1,
  };
  const markdownDelivery = {
    id: 'pd-markdown-e2e',
    sessionId: options.sessionId,
    projectRoot: options.projectDir,
    rootKind: 'run-output',
    rootPath: runRootPath,
    absolutePath: markdownPath,
    relativePath: markdownRelativePath,
    kind: 'file',
    title: 'partner-preview.md',
    mime: 'text/markdown',
    extension: '.md',
    sizeBytes: Buffer.byteLength(markdownContent),
    contentHash: sha256(markdownContent),
    sourceRefs: ['brief.md'],
    producer: 'write_partner_deliverable',
    createdAt: now + 2,
    updatedAt: now + 2,
  };
  const checkpoint = {
    id: 'pc-e2e',
    sessionId: options.sessionId,
    projectRoot: options.projectDir,
    rootPath: options.projectDir,
    absolutePath: targetPath,
    relativePath: targetRelativePath,
    operation: 'update',
    status: 'active',
    beforeHash: sha256(beforeContent),
    beforeSizeBytes: Buffer.byteLength(beforeContent),
    beforeSnapshotPath,
    afterHash: sha256(afterContent),
    afterSizeBytes: Buffer.byteLength(afterContent),
    deliveryId: workspaceDelivery.id,
    producer: 'write_partner_workspace_file',
    diff: {
      before: beforeContent,
      after: afterContent,
      unified: [
        '--- a/src/partner-note.txt',
        '+++ b/src/partner-note.txt',
        '@@ partner checkpoint @@',
        '-before checkpoint content',
        '+after checkpoint content',
      ].join('\n'),
      truncated: false,
    },
    createdAt: now,
    updatedAt: now,
  };

  await fs.writeFile(
    path.join(spaceDir, 'partner-deliveries.json'),
    JSON.stringify(
      { version: 1, deliveries: [workspaceDelivery, arbitraryDelivery, markdownDelivery] },
      null,
      2,
    ),
    'utf-8',
  );
  await fs.writeFile(
    path.join(spaceDir, 'partner-checkpoints.json'),
    JSON.stringify({ version: 1, checkpoints: [checkpoint] }, null, 2),
    'utf-8',
  );
}

test('Partner context rail and detail launcher follow the dual-button layout', async () => {
  test.setTimeout(60_000); // Electron boot + window resize settle is slow on Windows CI
  const testId = `partner-dual-rail-${Date.now()}`;
  const projectDir = await createProject(testId);
  const space = await launchPartnerSpace(testId);

  try {
    const { page } = space;
    await space.seedProject(projectDir);
    await switchSurface(page, 'Partner');
    await expect(page.getByTestId('partner-workspace')).toBeVisible({ timeout: 10_000 });
    await space.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1280, 820);
    });

    const contextToggle = page.getByTestId('partner-context-toggle');
    const detailToggle = page.getByTestId('partner-detail-toggle');
    const contextRail = page.getByTestId('partner-context-rail');
    await expect(contextRail).toBeVisible();
    await expect(contextRail).toHaveCSS('width', '300px');
    await expect(contextToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(detailToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('right-sidebar')).toBeHidden();

    await detailToggle.click();
    const sidebar = page.getByTestId('right-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
    await expect(detailToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(contextRail).toHaveCount(0);
    await expect(page.getByTestId('partner-detail-launcher')).toBeVisible();
    await expect(page.getByTestId('partner-detail-open-files')).toBeVisible();
    await expect(page.getByTestId('partner-detail-open-browser')).toBeVisible();
    await expect(page.getByTestId('partner-detail-open-terminal')).toHaveCount(0);

    await page.getByTestId('partner-detail-open-files').click();
    await expect(page.getByTestId('files-panel')).toBeVisible();
    await page.getByTestId('partner-detail-launcher-toggle').click();
    await page.getByTestId('partner-detail-open-browser').click();
    await expect(page.getByTestId('partner-browser-panel')).toBeVisible();

    // At 1280px the detail dock takes priority. The context button closes it
    // and restores the 300px summary rail instead of squeezing conversation.
    await contextToggle.click();
    await expect(sidebar).toBeHidden();
    await expect(contextRail).toBeVisible();
    await expect(contextToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(detailToggle).toHaveAttribute('aria-pressed', 'false');

    // Hiding the detail surface preserves its tabs, matching the standalone
    // reference. Reopening returns to the previously active tool.
    await detailToggle.click();
    await expect(sidebar).toBeVisible();
    await expect(
      page.getByTestId('partner-detail-tabs').getByRole('tab', { name: 'Browser' }),
    ).toHaveAttribute('aria-selected', 'true');
    await contextToggle.click();
    await expect(sidebar).toBeHidden();
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Partner supports normal composer use, slash clear, mode shortcut, and resume', async () => {
  test.setTimeout(90_000);
  const testId = `partner-parity-${Date.now()}`;
  const projectDir = await createProject(testId);
  const space = await launchPartnerSpace(testId);

  try {
    const { page } = space;
    await space.seedProject(projectDir);

    await switchSurface(page, 'Partner');
    await space.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 880);
    });
    await expect(page.getByTestId('partner-workspace')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('partner-context-rail')).toBeVisible();
    await expect(page.getByTestId('partner-context-add-material')).toBeVisible();
    await expect(page.getByTestId('partner-add-material')).toHaveCount(0);
    await expect(page.getByTestId('right-sidebar')).toBeHidden();
    await expect(page.getByTestId('partner-context-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('partner-detail-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    const navigationToggle = page.getByTestId('partner-left-sidebar-toggle');
    await expect(navigationToggle).toHaveAttribute('aria-pressed', 'true');
    await navigationToggle.click();
    await expect(page.getByTestId('left-sidebar')).toHaveCount(0);
    await expect(navigationToggle).toHaveAttribute('aria-pressed', 'false');
    await navigationToggle.click();
    await expect(page.getByTestId('left-sidebar')).toBeVisible();
    await expect(navigationToggle).toHaveAttribute('aria-pressed', 'true');

    const contextToggle = page.getByTestId('partner-context-toggle');
    await contextToggle.click();
    await expect(page.getByTestId('partner-context-rail')).toHaveCount(0);
    await expect(contextToggle).toHaveAttribute('aria-pressed', 'false');
    await contextToggle.click();
    await expect(page.getByTestId('partner-context-rail')).toBeVisible();
    await expect(contextToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('partner-conversation')).toBeVisible();
    await expect(page.getByTestId('right-sidebar')).toBeHidden();

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('partner-workspace')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('partner-context-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByTestId('partner-context-add-material').click();
    await expect(page.getByTestId('partner-sources-panel')).toBeVisible();
    await expect(page.getByTestId('right-sidebar')).toBeVisible();
    await expect(
      page.getByTestId('partner-detail-tabs').getByRole('tab', { name: 'Materials' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('partner-source-picker')).toBeVisible();
    await page
      .getByTestId('partner-source-picker')
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();

    await page.getByTestId('partner-detail-toggle').click();
    await expect(page.getByTestId('right-sidebar')).toBeHidden();

    const modeLabel = /^Execution: (Plan only|Accept edits|Automatic|Full access)$/;
    await expect(page.getByText(modeLabel).first()).toBeVisible({ timeout: 10_000 });
    const initialMode = await page.getByText(modeLabel).first().textContent();
    await page.keyboard.press('Shift+Tab');
    await expect
      .poll(async () => (await page.getByText(modeLabel).first().textContent()) ?? '', {
        timeout: 5_000,
      })
      .not.toBe(initialMode);

    const prompt = 'partner e2e normal use check';
    await sendPartnerPrompt(page, prompt);
    await expect
      .poll(() => readSessions(page, projectDir, 'partner'), { timeout: 10_000 })
      .toHaveLength(1);
    await expect(await readSessions(page, projectDir, 'code')).toHaveLength(0);
    await expect(page.getByTestId('right-sidebar')).toBeHidden();

    const partnerRow = page.getByTestId('sidebar-session-row').filter({ hasText: prompt }).first();
    await expect(partnerRow).toBeVisible({ timeout: 10_000 });

    await switchSurface(page, 'Coder');
    await expect(page.getByTestId('partner-workspace')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-session-row').filter({ hasText: prompt })).toHaveCount(
      0,
    );

    await switchSurface(page, 'Partner');
    await expect(page.getByTestId('partner-workspace')).toBeVisible();
    await expect(
      page.getByTestId('sidebar-session-row').filter({ hasText: prompt }).first(),
    ).toBeVisible();

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('partner-workspace')).toBeVisible({ timeout: 10_000 });
    const reloadedRow = page.getByTestId('sidebar-session-row').filter({ hasText: prompt }).first();
    await expect(reloadedRow).toBeVisible({ timeout: 10_000 });
    await reloadedRow.click();
    const followUp = 'partner e2e resume follow up';
    await sendPartnerPrompt(page, followUp);
    await expect(await readSessions(page, projectDir, 'partner')).toHaveLength(1);

    const textarea = page.locator('textarea').first();
    await textarea.fill('/clear');
    await page.getByLabel('Send message').click();
    await expect(
      page.getByTestId('conversation-stream').getByText(followUp).first(),
    ).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(textarea).toBeEnabled();
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Partner artifact card updates without stealing focus and opens typed file details', async () => {
  test.setTimeout(90_000);

  const testId = `partner-deliveries-${Date.now()}`;
  const projectDir = await createProject(testId);
  const space = await launchPartnerSpace(testId);

  try {
    const { page } = space;
    await space.seedProject(projectDir);
    // Seed the persistent delivery/checkpoint stores before Partner mounts them.
    // This mirrors an already-existing authoritative result on session resume and
    // avoids mutating the stores behind their in-process caches.
    const sessionId = await createPartnerSession(page, projectDir);
    await seedPartnerDeliveries({ testDataDir: space.testDataDir, projectDir, sessionId });

    await switchSurface(page, 'Partner');
    await space.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 880);
    });
    await expect(page.getByTestId('partner-workspace')).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => readSessions(page, projectDir, 'partner')).toHaveLength(1);
    const sessionRow = page.getByTestId('sidebar-session-row').first();
    await expect(sessionRow).toBeVisible({ timeout: 10_000 });
    await sessionRow.click();

    // Persistent results refresh the compact context card but do not open the
    // detail sidebar or move focus away from the conversation.
    const artifactsCard = page.getByTestId('partner-task-artifacts');
    await expect(artifactsCard).toHaveAttribute('aria-label', 'Task artifacts: 3', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('partner-task-artifacts-card')).toContainText(
      'partner-note.txt',
    );
    await expect(page.getByTestId('right-sidebar')).toBeHidden();
    await expect(page.getByTestId('partner-conversation')).toBeVisible();

    await artifactsCard.click();
    await expect(page.getByTestId('right-sidebar')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('partner-artifact-panel')).toBeVisible();
    const artifactsTab = page
      .getByTestId('partner-detail-tabs')
      .getByRole('tab', { name: 'Task artifacts', exact: true });
    await expect(artifactsTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('partner-result-destinations')).toHaveCount(0);
    await expect(page.getByTestId('partner-results-files-tab')).toHaveCount(0);
    const outputList = page.getByTestId('partner-output-deliveries');
    await expect(outputList).toBeVisible({ timeout: 10_000 });
    await expect(outputList.getByTestId('partner-output-delivery')).toHaveCount(3);
    await outputList.getByRole('button', { name: 'partner-note.txt', exact: true }).click();
    await expect(page.getByTestId('file-viewer')).toBeVisible();
    await expect(
      page
        .getByTestId('partner-detail-tabs')
        .getByRole('tab', { name: 'partner-note.txt', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('text-file-viewer')).toContainText('after checkpoint content');

    await artifactsTab.click();
    await outputList.getByRole('button', { name: 'partner-preview.md', exact: true }).click();
    const activeFileViewer = page
      .locator('[role="tabpanel"]:not([hidden])')
      .getByTestId('file-viewer');
    await expect(activeFileViewer).toBeVisible();
    await expect(activeFileViewer).toContainText('partner-preview.md');
    await expect(activeFileViewer.getByTestId('markdown-file-preview')).toBeVisible();
    await expect(activeFileViewer.getByTestId('markdown-artifact-preview')).toBeVisible();
    await expect(page.getByTestId('partner-file-proposals-panel')).toHaveCount(0);
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Partner material picker keeps its selection while switching detail tabs', async () => {
  const testId = `partner-project-preview-${Date.now()}`;
  const projectDir = await createProject(testId);
  const space = await launchPartnerSpace(testId);

  try {
    const { page } = space;
    await space.seedProject(projectDir);
    await switchSurface(page, 'Partner');
    await space.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 880);
    });

    await page.getByTestId('partner-context-add-material').click();
    const sourcesPanel = page.getByTestId('partner-sources-panel');
    await expect(sourcesPanel).toBeVisible({ timeout: 10_000 });
    const sourcePicker = sourcesPanel.getByTestId('partner-source-picker');
    await expect(sourcePicker).toBeVisible();
    await sourcePicker.getByRole('button', { name: 'brief.md', exact: true }).click();
    await expect(page.getByTestId('file-viewer')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('file-viewer')).toContainText('brief.md');
    await expect(
      page.getByTestId('partner-detail-tabs').getByRole('tab', { name: 'brief.md', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');

    const materialsTab = page
      .getByTestId('partner-detail-tabs')
      .getByRole('tab', { name: 'Task materials', exact: true });
    await materialsTab.click();
    await expect(materialsTab).toHaveAttribute('aria-selected', 'true');
    await expect(sourcesPanel).toBeVisible({ timeout: 10_000 });
    await expect(
      sourcePicker.getByRole('button', { name: 'Stage for first message' }),
    ).toBeEnabled();
    await sourcePicker.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByTestId('partner-source-picker')).toHaveCount(0);
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Partner sources can be attached and removed, and deleting the session recovers composer', async () => {
  const testId = `partner-sources-delete-${Date.now()}`;
  const projectDir = await createProject(testId);
  const space = await launchPartnerSpace(testId);

  try {
    const { page } = space;
    await space.seedProject(projectDir);
    await switchSurface(page, 'Partner');
    await space.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 880);
    });

    const prompt = 'partner e2e source management check';
    await sendPartnerPrompt(page, prompt);
    const sessionId = await onlySessionId(page, projectDir, 'partner');

    await page.getByTestId('partner-context-add-material').click();
    const sourcesPanel = page.getByTestId('partner-sources-panel');
    const sourcePicker = sourcesPanel.getByTestId('partner-source-picker');
    await sourcePicker.getByRole('button', { name: 'brief.md', exact: true }).click();
    await expect(page.getByTestId('file-viewer')).toBeVisible();
    await page
      .getByTestId('partner-detail-tabs')
      .getByRole('tab', { name: 'Task materials', exact: true })
      .click();
    await expect(sourcesPanel).toBeVisible();
    await sourcePicker.getByRole('button', { name: 'Attach selected file', exact: true }).click();
    await expect(page.getByTestId('partner-source-picker')).toHaveCount(0);
    await expect
      .poll(() => readPartnerSources(page, sessionId, projectDir), { timeout: 10_000 })
      .toHaveLength(1);
    await expect(sourcesPanel.getByText('brief.md').first()).toBeVisible();

    await sourcesPanel.getByRole('button', { name: 'Actions for brief.md', exact: true }).click();
    await sourcesPanel
      .getByRole('menuitem', { name: 'Remove from project materials', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Remove from project materials' })
      .click();
    await expect(sourcesPanel.getByText('removed', { exact: true })).toBeVisible();
    await expect
      .poll(
        () =>
          page.evaluate(
            async ({ sid, root }) => {
              const bridge = window.kodaxSpace;
              if (!bridge) throw new Error('KodaX Space bridge unavailable');
              const result = await bridge.invoke('partner.materials.catalog', {
                sessionId: sid,
                projectRoot: root,
              });
              if (!result.ok) throw new Error(result.error.message);
              return result.data.relations.filter((relation) => relation.lifecycle === 'active')
                .length;
            },
            { sid: sessionId, root: projectDir },
          ),
        { timeout: 10_000 },
      )
      .toBe(0);
    // Project-material removal is lifecycle/audit preserving: the current
    // task selection remains available for replay until the session is deleted.
    await expect
      .poll(() => readPartnerSources(page, sessionId, projectDir), { timeout: 10_000 })
      .toHaveLength(1);

    const row = page.getByTestId('sidebar-session-row').filter({ hasText: prompt }).first();
    await expect(row).toBeVisible();
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Delete\b/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByTestId('sidebar-session-row').filter({ hasText: prompt })).toHaveCount(
      0,
      {
        timeout: 10_000,
      },
    );
    const composer = page.locator('textarea').first();
    await expect(composer).toHaveAttribute(
      'placeholder',
      /Describe a task - sending will create a Partner session/,
    );
    await expect(composer).toBeEnabled();
    await composer.fill('typing after partner delete still works');
    await expect(composer).toHaveValue('typing after partner delete still works');
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Partner can stage sources before the first composer send creates the session', async () => {
  const testId = `partner-staged-sources-${Date.now()}`;
  const projectDir = await createProject(testId);
  const space = await launchPartnerSpace(testId);

  try {
    const { page } = space;
    await space.seedProject(projectDir);
    await switchSurface(page, 'Partner');
    await space.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 880);
    });

    await expect.poll(() => readSessions(page, projectDir, 'partner')).toHaveLength(0);
    await page.getByTestId('partner-context-add-material').click();
    const sourcesPanel = page.getByTestId('partner-sources-panel');
    const sourcePicker = sourcesPanel.getByTestId('partner-source-picker');
    await expect(sourcePicker).toBeVisible();
    await expect(
      sourcePicker.getByRole('button', { name: 'Stage for first message', exact: true }),
    ).toBeDisabled();
    await sourcePicker.getByRole('button', { name: 'brief.md', exact: true }).click();
    await expect(page.getByTestId('file-viewer')).toBeVisible();
    await page
      .getByTestId('partner-detail-tabs')
      .getByRole('tab', { name: 'Task materials', exact: true })
      .click();
    await expect(sourcesPanel).toBeVisible();
    await sourcePicker
      .getByRole('button', { name: 'Stage for first message', exact: true })
      .click();
    await expect(page.getByTestId('partner-source-picker')).toHaveCount(0);
    await expect(sourcesPanel.getByText('brief.md').first()).toBeVisible();

    const prompt = 'use the staged brief to write a source-backed summary';
    await sendPartnerPrompt(page, prompt);
    const sessionId = await onlySessionId(page, projectDir, 'partner');

    await expect
      .poll(() => readPartnerSources(page, sessionId, projectDir), { timeout: 10_000 })
      .toHaveLength(1);
    await expect(page.getByTestId('right-sidebar')).toBeVisible();
    // The first send changes the detail workspace from the pre-session scope
    // to the new session scope. Its old tabs are intentionally discarded.
    await expect(page.getByTestId('partner-detail-launcher')).toBeVisible();
    await page.getByTestId('partner-context-toggle').click();
    await expect(page.getByTestId('right-sidebar')).toBeHidden();
    await expect(page.getByTestId('partner-context-rail')).toBeVisible();
    await expect(page.getByTestId('partner-task-materials')).toHaveAttribute(
      'aria-label',
      'Task materials: 1',
      { timeout: 10_000 },
    );
  } finally {
    await space.close();
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
});
