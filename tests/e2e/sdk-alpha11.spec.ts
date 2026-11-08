import { expect, test } from '@playwright/test';
import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createSessionManager } from '@kodax-ai/kodax/session';
import { connectKodaXClient } from '@kodax-ai/kodax/client';
import { connectKodaXRuntime } from '@kodax-ai/kodax/runtime';
import { randomUUID } from 'node:crypto';
import {
  createLocalSdkProvider,
  launchRealSdkSpace,
  readSdkProductView,
  readSdkHistoryPage,
  sendSdkPrompt,
  waitSdkIdle,
  currentSdkSession,
} from './sdk-provider-fixture.js';
import { readProductItemText } from '../../apps/desktop/renderer/src/lib/productItemContent.js';

test.setTimeout(150_000);
const ORIGINAL = '你😀'.repeat(24_000) + 'ORIGINAL_TAIL_EVIDENCE';
const SESSION = 'alpha11-history';

async function recordJson(name: string, value: unknown) {
  const file = test.info().outputPath(name);
  await writeFile(file, JSON.stringify(value, null, 2));
  await test.info().attach(name, { path: file, contentType: 'application/json' });
}

async function seed(root: string) {
  const project = path.join(root, 'project');
  await mkdir(project, { recursive: true });
  const outputPath = path.join(root, 'saved-tool.txt');
  await writeFile(outputPath, ORIGINAL);
  const manager = createSessionManager({
    sessionsDir: path.join(root, 'sessions'),
    configHome: root,
  });
  await manager.storage.save(SESSION, {
    title: 'ALPHA11_HISTORY',
    gitRoot: project,
    scope: 'user',
    runtimeInfo: { workspaceRoot: project, surface: 'repl' },
    messages: [
      { role: 'user', inputId: 'query', content: 'Read original evidence' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'call', name: 'mcp_call', input: {} }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call',
            content: 'TRUNCATED_PREVIEW',
            metadata: { truncated: true, outputPath },
          },
        ],
      },
      {
        role: 'user',
        content: 'Child delivery',
        _source: 'agent-completed',
        _taskResult: {
          type: 'task_result',
          source: 'child_task',
          taskId: 'child-1',
          status: 'failed',
          summary: '**Child report**\n\n`&quot;`',
        },
      },
      {
        role: 'user',
        content: '<agent-completed>\n**Unknown report**\n</agent-completed>',
        _source: 'agent-completed',
      },
    ],
    uiHistory: [
      {
        id: 'independent',
        type: 'info',
        text: 'Child delivery',
        presentationOnly: true,
        sourceRunId: 'notice-run',
      },
    ],
  });
}

test('alpha.11 restored structured reports and original tool content survive reload through Space IPC', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`alpha11-history-${Date.now()}`, provider.url, seed);
  try {
    await expect
      .poll(
        async () =>
          space.page.evaluate(async () => {
            const result = await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined);
            return result.ok ? result.data.connection.state : 'unavailable';
          }),
        { timeout: 30_000 },
      )
      .toBe('ready');
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'ALPHA11_HISTORY' })
      .click();
    const stream = space.page.getByTestId('conversation-stream');
    const reports = stream.getByTestId('system-notice').filter({ hasText: 'Task report' });
    await expect(reports).toHaveCount(2, { timeout: 30_000 });
    await expect(reports.filter({ hasText: 'Failed' })).toHaveCount(1);
    await expect(reports.filter({ hasText: 'Status unknown' })).toHaveCount(1);
    const failedReport = reports.filter({ hasText: 'Failed' });
    await failedReport.locator('summary').click();
    await expect(failedReport.locator('code')).toHaveText('&quot;');
    await expect(failedReport).toHaveAttribute('data-notice-variant', 'info');
    await expect(
      stream.getByTestId('system-notice').filter({ hasText: 'Child delivery' }),
    ).toHaveCount(1);
    const view = await readSdkProductView(space, SESSION);
    expect(
      view.items.find((item) => item.taskResult?.status === 'unknown')?.taskResult?.taskId,
    ).toBeUndefined();
    const history = await readSdkHistoryPage(space, SESSION);
    for (const [source, items] of [
      ['view', view.items],
      ['history', history.productItems ?? []],
    ] as const) {
      const tool = items.find((item) => item.type === 'tool');
      expect(tool?.tool?.outputPath).toBeTruthy();
      if (!tool) throw new Error('No saved tool');
      const full = await readProductItemText(
        tool,
        async (offset) => {
          const reply = await space.page.evaluate(
            (args) => window.kodaxSpace!.invoke('session.productItem', args),
            { sessionId: SESSION, itemId: tool.id, source, part: 'original' as const, offset },
          );
          if (!reply.ok) throw new Error(reply.error.message);
          return reply.data;
        },
        'original',
        source,
      );
      expect(full).toBe(ORIGINAL);
    }
    await stream.getByRole('button', { name: /Ran 1/ }).first().click();
    await stream.getByTestId('tool-call-card').getByRole('button').first().click();
    await stream.getByRole('button', { name: 'Read full original result', exact: true }).click();
    await expect(stream.getByTestId('tool-original-body')).toHaveText(ORIGINAL);
    const originalPath = path.join(space.testDataDir, 'saved-tool.txt');
    await rename(originalPath, originalPath + '.held');
    await stream.getByRole('button', { name: 'Read full original result', exact: true }).click();
    await expect(stream.getByRole('alert')).toContainText('Could not read the original result.');
    await rename(originalPath + '.held', originalPath);
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'ALPHA11_HISTORY' })
      .click();
    await expect(reports).toHaveCount(2, { timeout: 30_000 });
    await reports.first().locator('summary').click();
    await reports.evaluateAll(async (elements) => {
      await Promise.all(
        elements.flatMap((element) =>
          (element.closest('.reveal')?.getAnimations() ?? []).map(
            (animation) => animation.finished,
          ),
        ),
      );
    });
    await space.page.screenshot({ path: test.info().outputPath('alpha11-reports.png') });
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('work modes use Host CAS before the first Run and remain fixed afterwards', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`alpha11-mode-${Date.now()}`, provider.url);
  let peer: Awaited<ReturnType<typeof connectKodaXClient>> | undefined;
  try {
    const picker = space.page.getByTestId('work-mode-selector');
    const agentChoice = picker.getByRole('radio', { name: 'Agent', exact: true });
    await expect(agentChoice).toBeEnabled();
    await agentChoice.click();
    await expect(agentChoice).toBeChecked();
    const sessionId = await currentSdkSession(space);
    await expect
      .poll(async () => {
        const reply = await space.page.evaluate(
          (sessionId) => window.kodaxSpace!.invoke('session.workMode', { sessionId }),
          sessionId,
        );
        return reply.ok ? reply.data.workMode : 'failed';
      })
      .toBe('agent');
    const daemon = path.join(space.testDataDir, 'runtime/daemon/coder');
    const descriptor = JSON.parse(await readFile(path.join(daemon, 'daemon.json'), 'utf8')) as {
      endpoint: string;
    };
    peer = await connectKodaXClient({
      profile: 'coder',
      endpoint: descriptor.endpoint,
      token: (await readFile(path.join(daemon, 'daemon.token'), 'utf8')).trim(),
      clientInfo: {
        name: 'Space alpha11 acceptance',
        instanceId: randomUUID(),
        instanceSecret: randomUUID(),
      },
    });
    const before = await peer.sessions.getSettingsVersioned(sessionId);
    const observer = await connectKodaXRuntime({
      profile: 'coder',
      endpoint: descriptor.endpoint,
      daemonToken: (await readFile(path.join(daemon, 'daemon.token'), 'utf8')).trim(),
    });
    try {
      await recordJson('actual-host-capabilities.json', {
        identity: observer.identity,
        capabilities: observer.capabilities,
      });
      expect(observer.capabilities?.sharedSessionSettings).toMatchObject({
        keys: expect.arrayContaining(['workMode']),
      });
    } finally {
      await observer.close();
    }
    await peer.sessions.updateSettingsVersioned(
      sessionId,
      { workMode: 'coding' },
      { expectedRevision: before.revision },
    );
    const stale = await space.page.evaluate(
      (args) => window.kodaxSpace!.invoke('session.setWorkMode', args),
      { sessionId, workMode: 'agent' as const, expectedRevision: before.revision },
    );
    expect(stale.ok).toBe(false);
    expect((await peer.sessions.getSettings(sessionId)).workMode).toBe('coding');
    await expect(picker.getByRole('radio', { name: 'Coding', exact: true })).toBeChecked();
    await picker.getByRole('radio', { name: 'Script (experimental)', exact: true }).click();
    await expect
      .poll(async () => (await peer!.sessions.getSettings(sessionId)).workMode)
      .toBe('script');
    await picker.getByRole('radio', { name: 'Coding', exact: true }).click();
    await expect
      .poll(async () => (await peer!.sessions.getSettings(sessionId)).workMode)
      .toBe('coding');
    const selected = await peer.sessions.getSettingsVersioned(sessionId);
    for (const key of ['provider', 'model', 'permissionMode', 'agentMode'] as const) {
      expect(selected.value[key]).toEqual(before.value[key]);
    }
    await sendSdkPrompt(space, 'HOLD_QUEUE');
    await expect.poll(() => provider.requests, { timeout: 20_000 }).toContain('HOLD_QUEUE');
    await expect(space.page.getByTestId('work-mode-current')).toContainText('Coding');
    await expect(picker).toHaveCount(0);
    const active = await peer.sessions.getSettingsVersioned(sessionId);
    const blocked = await space.page.evaluate(
      (args) => window.kodaxSpace!.invoke('session.setWorkMode', args),
      { sessionId, workMode: 'agent' as const, expectedRevision: active.revision },
    );
    expect(blocked.ok).toBe(false);
    await expect.poll(() => provider.requests).toContain('HOLD_QUEUE');
    provider.release('HOLD_QUEUE');
    await waitSdkIdle(space, sessionId);
    await space.page.reload();
    await space.page
      .locator(`[data-testid=sidebar-session-row][data-session-id="${sessionId}"]`)
      .click();
    await expect(space.page.getByTestId('work-mode-current')).toContainText('Coding', {
      timeout: 30_000,
    });
    await expect(peer.sessions.updateSettings(sessionId, { workMode: 'agent' })).rejects.toThrow(
      /fixed|first run/i,
    );
    const after = await peer.sessions.getSettingsVersioned(sessionId);
    for (const key of ['provider', 'model', 'permissionMode', 'agentMode'] as const) {
      expect(after.value[key]).toEqual(active.value[key]);
    }
    await recordJson('host-work-mode.json', { before, after });
    expect(provider.errors).toEqual([]);
  } finally {
    await peer?.disconnect();
    await provider.close();
    await space.close();
  }
});

test('alpha.11 thinking and tool argument progress display the Host token estimates', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`alpha11-estimates-${Date.now()}`, provider.url);
  try {
    for (const [prompt, kind] of [
      ['STREAM_THINKING_ESTIMATE', 'thinking'],
      ['STREAM_TOOL_ESTIMATE', 'tool-input'],
    ] as const) {
      await sendSdkPrompt(space, prompt);
      const sessionId = await currentSdkSession(space);
      await expect
        .poll(async () => (await readSdkProductView(space, sessionId)).activity?.streaming.kind)
        .toBe(kind);
      const activity = (await readSdkProductView(space, sessionId)).activity!;
      expect(activity.streaming.estimatedTokenCount).toBeGreaterThan(0);
      await expect(space.page.getByText(new RegExp('~[0-9.]+(?:k)? tokens')).last()).toBeVisible();
      await space.page.screenshot({ path: test.info().outputPath(`${kind}-tokens.png`) });
      const stopped = await space.page.evaluate(
        (args) => window.kodaxSpace!.invoke('session.cancel', args),
        { sessionId, runId: activity.runId, requestId: randomUUID() },
      );
      expect(stopped.ok).toBe(true);
      provider.release(prompt);
      await waitSdkIdle(space, sessionId);
    }
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});
