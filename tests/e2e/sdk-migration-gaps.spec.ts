import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { connectKodaXClient } from '@kodax-ai/kodax/client';
import { createArtifactSdk } from '@kodax-ai/kodax/artifacts';
import { createKodaXArtifactPort } from '@kodax-ai/kodax/artifacts/client';
import { saveGeneratedWorkflow } from '@kodax-ai/kodax/coding';
import path from 'node:path';
import {
  createLocalSdkProvider,
  currentSdkSession,
  FINALIZED_E2E_PLAN,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test.setTimeout(150_000);

test('Workflow execution and Memory management share the actual Host with another client', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `sdk-host-domains-${Date.now()}`,
    provider.url,
  );
  let peer: Awaited<ReturnType<typeof connectKodaXClient>> | undefined;
  try {
    await sendSdkPrompt(space, 'HOST_DOMAINS_SETUP');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:HOST_DOMAINS_SETUP',
      { timeout: 30_000 },
    );
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);
    const daemonDir = path.join(space.testDataDir, 'runtime/daemon/coder');
    const descriptor = JSON.parse(await readFile(path.join(daemonDir, 'daemon.json'), 'utf8')) as {
      endpoint: string;
    };
    peer = await connectKodaXClient({
      profile: 'coder',
      endpoint: descriptor.endpoint,
      clientInfo: {
        name: 'Space migration E2E',
        instanceId: crypto.randomUUID(),
        instanceSecret: crypto.randomUUID(),
      },
      token: (await readFile(path.join(daemonDir, 'daemon.token'), 'utf8')).trim(),
    });
    const saved = await saveGeneratedWorkflow({
      dir: path.join(projectRoot, '.kodax', 'workflows'),
      name: 'host-migration',
      manifest: {
        name: 'host-migration',
        description: 'Host ownership probe',
        phases: ['check'],
        readOnly: true,
        maxAgents: 1,
        maxConcurrency: 1,
        patterns: ['fan-out-and-synthesize'],
      },
      source: 'async function run(wf, args) { return { synthesis: "HOST_WORKFLOW_COMPLETE" }; }',
    });
    const started = await space.page.evaluate(
      (input) => window.kodaxSpace!.invoke('workflow.start', input),
      { sessionId, source: 'saved' as const, target: saved.path },
    );
    expect(started.ok && started.data).toHaveProperty('runId');
    if (!started.ok || !('runId' in started.data) || !started.data.runId)
      throw new Error(JSON.stringify(started));
    const runId = started.data.runId;
    await expect.poll(async () => (await peer!.workflows.get(runId))?.status).toBe('completed');
    expect((await peer.workflows.list({ runId }))[0]?.runId).toBe(runId);
    // The rerun reads the Host-managed run directory while the first run may
    // still be finalizing it; the run record lands on disk after the daemon
    // already reports `completed` from memory, so retry with a real backoff
    // budget instead of three immediate attempts.
    let rerun: { ok: boolean; data?: { runId: string } } | undefined;
    for (let attempt = 1; ; attempt++) {
      rerun = await space.page.evaluate(
        (input) => window.kodaxSpace!.invoke('workflow.rerun', input),
        { sessionId, runId },
      );
      if ((rerun.ok && rerun.data) || attempt >= 15) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    expect(rerun.ok && rerun.data).toHaveProperty('runId');
    const memory = await peer.memory.forProject(projectRoot);
    expect(
      (
        await memory.controller.remember({
          statement: 'Only the shared Host owns this Memory.',
          claimKind: 'policy',
          claimKey: 'migration.owner',
          evidenceRef: 'user-command:migration',
        })
      ).status,
    ).not.toBe('error');
    const listed = await space.page.evaluate(
      (id) => window.kodaxSpace!.invoke('memory.list', { sessionId: id }),
      sessionId,
    );
    expect(listed.ok && listed.data.refs.some((ref) => ref.kind === 'memdir')).toBe(true);
    if (!listed.ok) throw new Error(listed.error.message);
    const ref = listed.data.refs.find((item) => item.kind === 'memdir')!;
    const body = await space.page.evaluate(
      (input) => window.kodaxSpace!.invoke('memory.readRef', input),
      { sessionId, ref: { ...ref, storageUri: path.join(projectRoot, 'README.md') } },
    );
    expect(body.ok && body.data.snapshot.body).toContain('shared Host owns this Memory');
    const mcp = await space.page.evaluate(() =>
      window.kodaxSpace!.invoke('mcp.servers', undefined),
    );
    expect(mcp.ok && mcp.data.canStop).toBe(false);
    const catalog = await peer.catalog.extensions();
    expect(
      catalog.diagnostics.tools.filter((tool) => tool.name.startsWith('artifact_')),
    ).toHaveLength(9);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    );
    await writeFile(path.join(projectRoot, 'migration-artifact.png'), png);
    const requestsBeforeArtifact = provider.requests.length;
    const artifact = createArtifactSdk(createKodaXArtifactPort(peer, sessionId));
    // The worker protocol consumes its request file once; a loaded runner can
    // race the first attempt's file lifecycle. Render is idempotent, so retry
    // the whole operation instead of failing the shared-Host coverage.
    let rendered: Awaited<ReturnType<typeof artifact.render>>;
    for (let attempt = 1; ; attempt++) {
      rendered = await artifact.render({ path: 'migration-artifact.png' });
      if (rendered.status === 'ready' || attempt >= 3) break;
    }
    expect(rendered.status).toBe('ready');
    if (rendered.status !== 'ready') throw new Error(JSON.stringify(rendered));
    const evidence = await artifact.readEvidence({
      source: rendered.evidence.source,
      raster: rendered.evidence.evidence[0],
    });
    expect(evidence.status).toBe('ready');
    if (evidence.status !== 'ready') throw new Error(JSON.stringify(evidence));
    expect(Buffer.from(evidence.image.dataBase64, 'base64')).toEqual(png);
    expect(provider.requests.length).toBe(requestsBeforeArtifact);
  } finally {
    await peer?.disconnect();
    await provider.close();
    await space.close();
  }
});

test('Host builtins and complete finalized plans reach the real approval UI', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(`sdk-plan-${Date.now()}`, provider.url);
  try {
    const skills = await space.page.evaluate(
      (root) => window.kodaxSpace!.invoke('skill.discover', { projectRoot: root }),
      projectRoot,
    );
    expect(skills.ok && skills.data.skills.map((skill) => skill.name)).toEqual(
      expect.arrayContaining([
        'copywriting',
        'customer-research',
        'draft-response',
        'status-report',
      ]),
    );
    await sendSdkPrompt(space, 'PLAN_SETUP');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:PLAN_SETUP',
    );
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);
    const mode = await space.page.evaluate(
      (id) =>
        window.kodaxSpace!.invoke('session.setPermissionMode', { sessionId: id, mode: 'plan' }),
      sessionId,
    );
    expect(mode.ok).toBe(true);
    const currentRequestId = () =>
      space.page.evaluate(async (id) => {
        const snapshot = await window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId: id });
        if (!snapshot.ok) throw new Error(snapshot.error.message);
        const request = snapshot.data.interactions.find(
          (item) => item.kind === 'permission',
        )?.request;
        if (!request) throw new Error('Host did not supply the pending plan request');
        return request.reqId;
      }, sessionId);
    await sendSdkPrompt(space, 'SDK_PLAN');
    const plan = space.page.getByTestId('permission-finalized-plan');
    await expect(plan).toBeVisible({ timeout: 20_000 });
    expect(await plan.locator('pre').textContent()).toBe(FINALIZED_E2E_PLAN);
    let requestId = await currentRequestId();
    await space.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Allow once (Enter)', exact: true })
      .click();
    await expect(plan).toHaveCount(0);
    await waitSdkIdle(space, sessionId);
    await expect(space.page.getByTestId('conversation-stream')).toContainText('SDK_REPLY:SDK_PLAN');
    const lateAnswer = () =>
      space.page.evaluate(async (reqId) => {
        return window.kodaxSpace!.invoke('permission.answer', {
          reqId,
          decision: 'allow_once',
        });
      }, requestId);
    const firstLateAnswer = await lateAnswer();
    expect(firstLateAnswer, JSON.stringify(firstLateAnswer)).toMatchObject({
      ok: true,
      data: { accepted: false },
    });
    for (const decision of ['deny', 'stop'] as const) {
      await space.page.evaluate(
        (id) =>
          window.kodaxSpace!.invoke('session.setPermissionMode', {
            sessionId: id,
            mode: 'plan',
          }),
        sessionId,
      );
      await sendSdkPrompt(space, 'SDK_PLAN');
      await expect(plan).toBeVisible({ timeout: 20_000 });
      expect(await plan.locator('pre').textContent()).toBe(FINALIZED_E2E_PLAN);
      requestId = await currentRequestId();
      if (decision === 'deny')
        await space.page
          .getByRole('dialog')
          .getByRole('button', { name: 'Deny (Esc)', exact: true })
          .click();
      else
        expect(
          await space.page.evaluate(async (id) => {
            const live = await window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId: id });
            if (!live.ok || !live.data.activeRun) throw new Error('No active plan Run to stop');
            return window.kodaxSpace!.invoke('session.cancel', {
              sessionId: id,
              runId: live.data.activeRun.runId,
              requestId: crypto.randomUUID(),
            });
          }, sessionId),
        ).toMatchObject({ ok: true });
      await expect(plan).toHaveCount(0);
      await waitSdkIdle(space, sessionId);
      expect(await lateAnswer()).toMatchObject({ ok: true, data: { accepted: false } });
    }
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('Host tool image previews survive history reload without executing the tool twice', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `sdk-tool-image-${Date.now()}`,
    provider.url,
  );
  provider.setProject(projectRoot);
  try {
    await writeFile(
      path.join(projectRoot, 'evidence.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64',
      ),
    );
    await sendSdkPrompt(space, 'SDK_TOOL_IMAGE');
    await expect(space.page.getByTestId('conversation-stream')).toContainText('SDK_REPLY:');
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);
    await test.info().attach('image-contract.json', {
      body: JSON.stringify(
        await space.page.evaluate(
          (id) => window.kodaxSpace!.invoke('session.productSnapshot', { sessionId: id }),
          sessionId,
        ),
      ),
      contentType: 'application/json',
    });
    await space.page.getByRole('button', { name: /Ran 1 command/ }).click();
    const preview = space.page
      .getByTestId('tool-call-card')
      .getByTestId('user-image-thumbnail')
      .locator('img');
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBe(1);
    const requests = provider.requests.length;
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_TOOL_IMAGE' })
      .first()
      .click();
    await space.page.getByRole('button', { name: /Ran 1 command/ }).click();
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBe(1);
    expect(provider.requests.length).toBe(requests);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('project prompt commands execute once through the Host preparation entry', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `sdk-prompt-command-${Date.now()}`,
    provider.url,
  );
  try {
    await sendSdkPrompt(space, 'COMMAND_SETUP');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:COMMAND_SETUP',
    );
    await waitSdkIdle(space, await currentSdkSession(space));
    const directory = path.join(projectRoot, '.kodax', 'commands');
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'migration-probe.md'),
      '---\ndescription: Host command probe\n---\nHOST_COMMAND_BODY $ARGUMENTS\n',
    );
    await space.page.locator('textarea').first().fill('/migration-probe exact-argument');
    await space.page.locator('textarea').first().press('Escape');
    await space.page.locator('textarea').first().press('Enter');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:/migration-probe exact-argument',
    );
    await waitSdkIdle(space, await currentSdkSession(space));
    expect(provider.preparedCommandRequests).toBe(1);
    expect(
      provider.requests.filter((request) => request === '/migration-probe exact-argument'),
    ).toHaveLength(1);
  } finally {
    await provider.close();
    await space.close();
  }
});
