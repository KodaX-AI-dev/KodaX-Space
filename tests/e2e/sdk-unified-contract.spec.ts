import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { connectKodaXClient } from '@kodax-ai/kodax/client';
import { parseOwnedTestDaemonPid } from './fixture-daemon-cleanup.js';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  readSdkHistory,
  readPublicSpaceExit,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test.setTimeout(90_000);

test('real SDK Stop admits a new prompt while the cancelled HTTP stream is still open', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-stop-only-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'HOLD_CANCEL');
    await expect.poll(() => provider.requests).toContain('HOLD_CANCEL');
    const sessionId = await currentSdkSession(space);
    await space.page.getByRole('button', { name: 'Stop generation', exact: true }).click();
    await waitSdkIdle(space, sessionId);
    await sendSdkPrompt(space, 'AFTER_STOP');
    try {
      await expect(space.page.getByTestId('conversation-stream')).toContainText(
        'SDK_REPLY:AFTER_STOP',
        { timeout: 10_000 },
      );
    } catch (error) {
      const live = await space.page.evaluate(
        (id) => window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId: id }),
        sessionId,
      );
      await test.info().attach('public-sdk-state.json', {
        body: JSON.stringify({ live, requests: provider.requests }),
        contentType: 'application/json',
      });
      throw error;
    }
  } finally {
    await provider.close();
    await space.close();
  }
});

test('published SDK tools, statistics and canonical history survive Renderer reload and fork', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(`sdk-tools-${Date.now()}`, provider.url);
  provider.setProject(projectRoot);
  try {
    await sendSdkPrompt(space, 'SDK_TOOLS');
    await expect
      .poll(() => readFile(path.join(projectRoot, 'sdk-created.txt'), 'utf8').catch(() => ''), {
        timeout: 30_000,
      })
      .toBe('REAL_SDK_TOOL_EXECUTION');
    const sessionId = await currentSdkSession(space);
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:SDK_TOOLS',
      { timeout: 20_000 },
    );
    const facts = await space.page.evaluate(async (id) => {
      const summary = await window.kodaxSpace!.invoke('session.statistics', { sessionId: id });
      const tools = await window.kodaxSpace!.invoke('session.executionFacts', {
        sessionId: id,
        kind: 'tools',
      });
      if (!summary.ok || !tools.ok) throw new Error('Real Host facts unavailable');
      return { summary: summary.data, tools: tools.data };
    }, sessionId);
    expect(facts.summary.physicalRequestCount).toBeGreaterThanOrEqual(2);
    expect(facts.summary.usage.totalTokens).toBeGreaterThanOrEqual(240);
    expect(facts.tools.kind).toBe('tools');
    expect(facts.tools.items.map((item) => ('name' in item ? item.name : ''))).toEqual(
      expect.arrayContaining(['write', 'read', 'space_manual']),
    );
    const history = await readSdkHistory(space, sessionId);
    expect(history.conversation?.status).toBe('resolved');
    expect(history.items.filter((item) => item.kind === 'user').length).toBe(1);
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_TOOLS' })
      .first()
      .click();
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:SDK_TOOLS',
      { timeout: 20_000 },
    );
    await space.page.getByTestId('session-token-indicator').click();
    await expect(space.page.getByTestId('session-token-breakdown')).toBeVisible();
    await space.page.keyboard.press('Escape');
    await space.page.getByRole('button', { name: 'Fork from here', exact: true }).last().click();
    await expect.poll(() => currentSdkSession(space)).not.toBe(sessionId);
    const forkId = await currentSdkSession(space);
    expect(
      (await readSdkHistory(space, forkId)).items.filter((item) => item.kind === 'user').length,
    ).toBe(1);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('real Host queued input survives reload, drains once and Stop preserves a later send', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-queue-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'HOLD_QUEUE');
    await expect
      .poll(() => provider.requests.some((prompt) => prompt.includes('HOLD_QUEUE')))
      .toBe(true);
    const sessionId = await currentSdkSession(space);
    await sendSdkPrompt(space, 'QUEUED_AFTER_TURN', 'Control+Enter');
    await expect
      .poll(async () => {
        const result = await space.page.evaluate(
          (id) => window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId: id }),
          sessionId,
        );
        return result.ok ? result.data.queuedInputs?.length : -1;
      })
      .toBe(1);
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'HOLD_QUEUE' })
      .first()
      .click();
    await expect(space.page.getByTestId('conversation-stream')).toContainText('QUEUED_AFTER_TURN', {
      timeout: 15_000,
    });
    provider.release('HOLD_QUEUE');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:QUEUED_AFTER_TURN',
      { timeout: 20_000 },
    );
    await expect
      .poll(
        async () =>
          (await readSdkHistory(space, sessionId)).items.filter(
            (item) => item.kind === 'user' && item.content === 'QUEUED_AFTER_TURN',
          ).length,
        { timeout: 15_000 },
      )
      .toBe(1);
    await waitSdkIdle(space, sessionId);
    await sendSdkPrompt(space, 'HOLD_CANCEL');
    await expect
      .poll(() => provider.requests.some((prompt) => prompt.includes('HOLD_CANCEL')))
      .toBe(true);
    await space.page.getByRole('button', { name: 'Stop generation', exact: true }).click();
    await waitSdkIdle(space, sessionId);
    await sendSdkPrompt(space, 'AFTER_STOP');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:AFTER_STOP',
      { timeout: 20_000 },
    );
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('desktop complete exit settles the last real SDK Host without fixture process killing', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-exit-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'BEFORE_COMPLETE_EXIT');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:BEFORE_COMPLETE_EXIT',
      { timeout: 20_000 },
    );
    await waitSdkIdle(space, await currentSdkSession(space));
    const descriptor = JSON.parse(
      await readFile(path.join(space.testDataDir, 'runtime/daemon/coder/daemon.json'), 'utf8'),
    ) as { pid: number; runtimeId: string };
    const applicationProcess = space.app.process();
    await writeFile(path.join(space.testDataDir, 'space/complete-exit.trigger'), 'exit');
    await expect.poll(() => applicationProcess.exitCode, { timeout: 30_000 }).toBe(0);
    const receipt = await readPublicSpaceExit(space);
    expect(receipt.runtimeId).toBe(descriptor.runtimeId);
    expect(receipt.cleanup.state).toBe('succeeded');
    expect(receipt.host.state).toBe('succeeded');
    await expect
      .poll(
        () => {
          try {
            process.kill(descriptor.pid, 0);
            return true;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
            throw error;
          }
        },
        { timeout: 20_000 },
      )
      .toBe(false);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('real canonical boundaries reject stale mutations and UI Rewind permits subsequent input', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-rewind-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'FIRST_TURN');
    const sessionId = await currentSdkSession(space);
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:FIRST_TURN',
    );
    await waitSdkIdle(space, sessionId);
    const before = await readSdkHistory(space, sessionId);
    const boundary = before.items.find((item) => item.kind === 'user')?.historyBoundary;
    expect(boundary).toBeDefined();
    await sendSdkPrompt(space, 'SECOND_TURN');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:SECOND_TURN',
    );
    await waitSdkIdle(space, sessionId);
    const stale = await space.page.evaluate(
      async ({ id, historyBoundary }) =>
        window.kodaxSpace!.invoke('session.rewind', {
          sessionId: id,
          rewindPastTurnIdx: 0,
          historyBoundary,
        }),
      { id: sessionId, historyBoundary: boundary },
    );
    expect(stale.ok && stale.data.ok).toBe(false);
    expect(
      (await readSdkHistory(space, sessionId)).items.filter((item) => item.kind === 'user'),
    ).toHaveLength(2);
    await space.page.getByRole('button', { name: 'Rewind to here', exact: true }).first().click();
    await space.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Rewind to here', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await readSdkHistory(space, sessionId)).items.filter((item) => item.kind === 'user')
            .length,
      )
      .toBe(1);
    await expect(space.page.getByTestId('conversation-stream')).not.toContainText('SECOND_TURN');
    await sendSdkPrompt(space, 'AFTER_REWIND');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:AFTER_REWIND',
    );
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('Space complete exit protects another connected product client', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-peer-exit-${Date.now()}`, provider.url);
  let peer: Awaited<ReturnType<typeof connectKodaXClient>> | undefined;
  try {
    await sendSdkPrompt(space, 'PEER_SESSION');
    const sessionId = await currentSdkSession(space);
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:PEER_SESSION',
    );
    await waitSdkIdle(space, sessionId);
    const daemonDir = path.join(space.testDataDir, 'runtime/daemon/coder');
    const descriptor = await readFile(path.join(daemonDir, 'daemon.json'), 'utf8');
    expect(parseOwnedTestDaemonPid(descriptor, space.testDataDir)).toBeDefined();
    peer = await connectKodaXClient({
      profile: 'coder',
      endpoint: (JSON.parse(descriptor) as { endpoint: string }).endpoint,
      token: (await readFile(path.join(daemonDir, 'daemon.token'), 'utf8')).trim(),
      clientInfo: {
        name: 'Space E2E peer',
        instanceId: randomUUID(),
        instanceSecret: randomUUID(),
      },
    });
    const applicationProcess = space.app.process();
    await writeFile(path.join(space.testDataDir, 'space/complete-exit.trigger'), 'exit');
    await expect.poll(() => applicationProcess.exitCode, { timeout: 30_000 }).toBe(0);
    const receipt = await readPublicSpaceExit(space);
    expect(receipt.runtimeId).toBe((JSON.parse(descriptor) as { runtimeId: string }).runtimeId);
    expect(receipt.cleanup.state).toBe('succeeded');
    expect(receipt.host.state).toBe('protected');
    const history = await peer.sessions.readHistory(sessionId);
    expect(history.items.some((item) => item.type === 'user' && item.text === 'PEER_SESSION')).toBe(
      true,
    );
  } finally {
    await peer?.disconnect();
    await provider.close();
    await space.close();
  }
});
