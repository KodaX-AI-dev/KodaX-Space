import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import type { ChannelOutput, PushPayload } from '@kodax-space/space-ipc-schema';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  readSdkHistory,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

import type { SpaceInstance } from './fixtures.js';

test.setTimeout(150_000);

test('Partner uses its selected expert default in Agent mode and retains shell through the shared Host', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`beta1-expert-${Date.now()}`, provider.url);
  try {
    await space.page.getByRole('button', { name: 'Partner', exact: true }).click();
    await space.page
      .getByTestId('partner-starter-tasks')
      .getByRole('button', { name: /Polish your writing/ })
      .click();
    await expect(space.page.getByTestId('partner-expert-chip')).toHaveText('营销文案');
    await expect(space.page.getByTestId('composer-input')).toHaveText(/请根据【产品、受众和证据】/);
    await sendSdkPrompt(space, 'BETA1_DEFAULT_EXPERT');
    await expect
      .poll(() => provider.requests.some((text) => text.includes('BETA1_DEFAULT_EXPERT')), {
        timeout: 30_000,
      })
      .toBe(true);
    const id = await currentSdkSession(space);
    await waitSdkIdle(space, id);
    const state = await space.page.evaluate(async (sessionId) => {
      const mode = await window.kodaxSpace!.invoke('session.workMode', { sessionId });
      const live = await window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId });
      return { mode, live };
    }, id);
    expect(state.mode).toMatchObject({ ok: true, data: { workMode: 'agent' } });
    expect(state.live.ok).toBe(true);
    if (state.live.ok) {
      expect(state.live.data.lastTerminalRun?.effectiveConfig?.agentProfile?.name).toBe('营销文案');
      expect(state.live.data.lastTerminalRun?.effectiveConfig?.toolScope).toContain('bash');
    }
    const history = await readSdkHistory(space, id);
    expect(history.items.filter((item) => item.type === 'user').map((item) => item.text)).toContain(
      'BETA1_DEFAULT_EXPERT',
    );
    await expect(space.page.getByTestId('partner-expert-chip')).toHaveText('营销文案');
    await expect(space.page.getByTestId('partner-work-mode')).toHaveText('Agent');
    // Revisit a cached idle Session; its foreground subscription must be restored too.
    await space.page.getByRole('button', { name: 'New session', exact: true }).click();
    await space.page
      .getByTestId('partner-starter-tasks')
      .getByRole('button', { name: /Polish your writing/ })
      .click();
    await expect(space.page.getByTestId('partner-expert-chip')).toHaveText('营销文案');
    await expect(space.page.getByTestId('composer-input')).toHaveText(/请根据【产品、受众和证据】/);
    await sendSdkPrompt(space, 'BETA1_OTHER_EXPERT_SESSION');
    const otherId = await currentSdkSession(space);
    expect(otherId).not.toBe(id);
    await waitSdkIdle(space, otherId);
    await space.page
      .locator(`[data-testid="sidebar-session-row"][data-session-id="${id}"]`)
      .click();
    await expect(space.page.getByTestId('conversation-stream')).toHaveAttribute(
      'data-session-id',
      id,
    );
    await expect(space.page.getByTestId('partner-expert-chip')).toHaveText('营销文案');
    await space.page
      .locator(`[data-testid="sidebar-session-row"][data-session-id="${otherId}"]`)
      .click();
    await expect(space.page.getByTestId('conversation-stream')).toHaveAttribute(
      'data-session-id',
      otherId,
    );
    await space.page
      .locator(`[data-testid="sidebar-session-row"][data-session-id="${id}"]`)
      .click();
    await expect(space.page.getByTestId('conversation-stream')).toHaveAttribute(
      'data-session-id',
      id,
    );
    // A second public SDK client changes the idle Host setting, bypassing Space's setter guard.
    await promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      const {connectKodaXRuntime} = await import('@kodax-ai/kodax/runtime');
      const path = await import('node:path');
      const client = await connectKodaXRuntime({profile:'coder', sessionsDir:path.join(process.env.KODAX_HOME,'sessions')});
      try {
        const current = await client.sessions.getSettingsVersioned(process.env.SPACE_E2E_MODE_SESSION);
        await client.sessions.updateSettingsVersioned(process.env.SPACE_E2E_MODE_SESSION,{workMode:'coding'},{expectedRevision:current.revision});
      } finally { await client.close(); }
    `,
      ],
      {
        windowsHide: true,
        timeout: 15_000,
        env: { ...process.env, KODAX_HOME: space.testDataDir, SPACE_E2E_MODE_SESSION: id },
      },
    );
    await expect(space.page.getByTestId('partner-work-mode')).toContainText('coding');
    await sendSdkPrompt(space, 'BETA1_AGENT_RESTORED');
    await expect
      .poll(() => provider.requests.some((text) => text.includes('BETA1_AGENT_RESTORED')))
      .toBe(true);
    await waitSdkIdle(space, id);
    await expect(space.page.getByTestId('partner-work-mode')).toHaveText('Agent');
    expect(provider.requests.some((text) => text.includes('BETA1_DEFAULT_EXPERT'))).toBe(true);
  } catch (error) {
    await recordPartnerFailure(space, provider).catch((diagnosticError: unknown) => {
      console.error('[partner-e2e] failure evidence unavailable:', diagnosticError);
    });
    throw error;
  } finally {
    await provider.close();
    await space.close();
  }
});

async function recordPartnerFailure(
  space: SpaceInstance,
  provider: Awaited<ReturnType<typeof createLocalSdkProvider>>,
): Promise<void> {
  const transportBeforeProbe = provider.transport;
  const url = provider.url;
  const sessionId = await currentSdkSession(space);
  const contracts = await space.page.evaluate(async (id) => {
    const [providers, live, product, statistics] = await Promise.all([
      window.kodaxSpace!.invoke('provider.list', undefined),
      window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId: id }),
      window.kodaxSpace!.invoke('session.productSnapshot', { sessionId: id }),
      window.kodaxSpace!.invoke('session.statistics', { sessionId: id }),
    ]);
    return { providers, live, product, statistics };
  }, sessionId);
  const health = await space.app.evaluate(async (_electron, baseUrl) => {
    try {
      return {
        status: (await fetch(baseUrl + '/models', { signal: AbortSignal.timeout(2_000) })).status,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, url);
  await test.info().attach('partner-failure-contracts.json', {
    body: JSON.stringify({ url, transportBeforeProbe, contracts, health }),
    contentType: 'application/json',
  });
}

type ForegroundRead = { sessionId: string; retainObservation?: boolean; afterRelease: boolean };
type ForegroundSession = { id: string; live: ChannelOutput<'session.liveSnapshot'> };

async function createForegroundSession(
  space: SpaceInstance,
  prompt: string,
): Promise<ForegroundSession> {
  await sendSdkPrompt(space, prompt);
  const id = await currentSdkSession(space);
  await waitSdkIdle(space, id);
  const live = await space.page.evaluate(
    (sessionId) => window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId }),
    id,
  );
  if (!live.ok) throw new Error(live.error.message);
  return { id, live: live.data };
}

async function selectForegroundSession(space: SpaceInstance, id: string): Promise<void> {
  await space.page.locator(`[data-testid="sidebar-session-row"][data-session-id="${id}"]`).click();
  await expect(space.page.getByTestId('conversation-stream')).toHaveAttribute(
    'data-session-id',
    id,
  );
  await space.page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function installForegroundReadGate(
  space: SpaceInstance,
  first: ForegroundSession,
  second: ForegroundSession,
  foreground: boolean,
): Promise<void> {
  await space.app.evaluate(
    ({ ipcMain, BrowserWindow }, input) => {
      const requests: ForegroundRead[] = [];
      const control = { requests, release: () => {}, held: false, released: false };
      Reflect.set(globalThis, 'foregroundFlightControl', control);
      ipcMain.removeHandler('session.liveSnapshot');
      ipcMain.handle(
        'session.liveSnapshot',
        (_event, request: Omit<ForegroundRead, 'afterRelease'>) => {
          requests.push({ ...request, afterRelease: control.released });
          const reply = {
            ok: true,
            data: request.sessionId === input.first.id ? input.first.live : input.second.live,
          };
          if (
            request.sessionId === input.first.id &&
            Boolean(request.retainObservation) === input.foreground &&
            !control.held
          ) {
            control.held = true;
            return new Promise((resolve) => {
              control.release = () => {
                control.released = true;
                resolve(reply);
              };
            });
          }
          return reply;
        },
      );
      if (!input.foreground)
        BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL().startsWith('app://space/'))!
          .webContents.send('session.liveInvalidated', {
            sessionId: input.first.id,
            runtimeId: input.first.live.cursor.runtimeId,
            reason: 'settings_changed',
            message: 'Controlled background read',
          });
    },
    { first, second, foreground },
  );
}

async function readForegroundRequests(space: SpaceInstance): Promise<ForegroundRead[]> {
  return space.app.evaluate(
    () => Reflect.get(globalThis, 'foregroundFlightControl').requests as ForegroundRead[],
  );
}

async function waitForForegroundRead(
  space: SpaceInstance,
  sessionId: string,
  retained: boolean,
  afterRelease = false,
): Promise<void> {
  await expect
    .poll(async () =>
      (await readForegroundRequests(space)).some(
        (request) =>
          request.sessionId === sessionId &&
          Boolean(request.retainObservation) === retained &&
          (!afterRelease || request.afterRelease),
      ),
    )
    .toBe(true);
}

async function releaseForegroundRead(space: SpaceInstance): Promise<void> {
  await space.app.evaluate(() => Reflect.get(globalThis, 'foregroundFlightControl')?.release());
}

for (const foreground of [false, true]) {
  test(`foreground activation survives a slow ${foreground ? 'previous foreground' : 'background'} snapshot`, async () => {
    const provider = await createLocalSdkProvider();
    const { space } = await launchRealSdkSpace(`foreground-flight-${Date.now()}`, provider.url);
    try {
      const first = await createForegroundSession(space, 'FOREGROUND_A');
      await space.page.getByRole('button', { name: 'New session', exact: true }).click();
      const second = await createForegroundSession(space, 'FOREGROUND_B');
      await installForegroundReadGate(space, first, second, foreground);
      if (foreground) await selectForegroundSession(space, first.id);
      await waitForForegroundRead(space, first.id, foreground);
      if (foreground) {
        await selectForegroundSession(space, second.id);
        await waitForForegroundRead(space, second.id, true);
      }
      await selectForegroundSession(space, first.id);
      await expect(space.page.getByTestId('conversation-stream')).toContainText('FOREGROUND_A');
      await releaseForegroundRead(space);
      await waitForForegroundRead(space, first.id, true, true);
    } finally {
      await releaseForegroundRead(space);
      const recorded = await space.app.evaluate(
        () => Reflect.get(globalThis, 'foregroundFlightControl')?.requests ?? [],
      );
      await test.info().attach('foreground-flight-requests.json', {
        body: JSON.stringify(recorded),
        contentType: 'application/json',
      });
      await provider.close();
      await space.close();
    }
  });
}

test('blocked queued input is visible and taking it back preserves text beyond the Host preview', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`beta1-blocked-${Date.now()}`, provider.url);
  try {
    await space.page.getByRole('button', { name: 'Partner', exact: true }).click();
    await sendSdkPrompt(space, 'HOLD_QUEUE');
    await expect.poll(() => provider.requests).toContain('HOLD_QUEUE');
    const id = await currentSdkSession(space);
    const selected = await space.page.evaluate(async (sessionId) => {
      const catalog = await window.kodaxSpace!.invoke('space.extensions.catalog', {
        extensionId: 'kodax.partner-library',
      });
      if (!catalog.ok) throw new Error(catalog.error.message);
      const expert = catalog.data.experts.find((item) => item.id === 'writing-mentor')!;
      return window.kodaxSpace!.invoke('session.partnerExpert.set', {
        sessionId,
        expert: {
          extensionId: 'kodax.partner-library',
          expertId: expert.id,
          revision: expert.revision,
        },
      });
    }, id);
    expect(selected.ok).toBe(true);
    const original = `BETA1_BLOCKED_${'complete input '.repeat(800)}_END`;
    await space.page.evaluate((sessionId) => {
      const probe = window as unknown as { __queueChanges: PushPayload<'session.liveChanged'>[] };
      probe.__queueChanges = [];
      window.kodaxSpace!.on('session.liveChanged', (change) => {
        if (change.sessionId === sessionId) probe.__queueChanges.push(change);
      });
    }, id);
    const composer = space.page.getByTestId('composer-input');
    await composer.fill(original);
    await composer.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await expect(space.page.getByTestId('queued-user-message-bubble')).toBeVisible();
    const disabled = await space.page.evaluate(() =>
      window.kodaxSpace!.invoke('space.extensions.setEnabled', {
        extensionId: 'kodax.partner-library',
        enabled: false,
      }),
    );
    expect(disabled.ok).toBe(true);
    provider.release('HOLD_QUEUE');
    const takeBack = space.page.getByRole('button', { name: 'Take back message', exact: true });
    await expect(takeBack).toBeVisible({ timeout: 30_000 });
    await expect(space.page.getByTestId('queued-user-message-bubble')).toContainText(
      'execution_binding_rejected',
    );
    const before = await space.page.evaluate(
      () =>
        (window as unknown as { __queueChanges: PushPayload<'session.liveChanged'>[] })
          .__queueChanges,
    );
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'HOLD_QUEUE' })
      .first()
      .click();
    expect(await currentSdkSession(space)).toBe(id);
    try {
      await expect(takeBack).toBeVisible({ timeout: 30_000 });
    } catch (error) {
      const main = await space.page.evaluate(
        async (sessionId) => ({
          live: await window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId }),
          product: await window.kodaxSpace!.invoke('session.productSnapshot', { sessionId }),
        }),
        id,
      );
      const ids = [
        ...new Set(
          before.flatMap((event) =>
            'queuedInputs' in event.change
              ? (event.change.queuedInputs?.map((input) => input.inputId) ?? [])
              : [],
          ),
        ),
      ];
      await test.info().attach('queue-reload-main.json', {
        body: JSON.stringify({ before, main, ids }),
        contentType: 'application/json',
      });
      const sdk = await promisify(execFile)(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        const {connectKodaXRuntime}=await import('@kodax-ai/kodax/runtime');const path=await import('node:path');
        const runtime=await connectKodaXRuntime({profile:'coder',sessionsDir:path.join(process.env.KODAX_HOME,'sessions')});
        let view;let subscription;
        try{const sessionId=process.env.QUEUE_SESSION;subscription=await runtime.sessions.observeView(sessionId,value=>view=structuredClone(value));
          const inputs=await Promise.all(JSON.parse(process.env.QUEUE_IDS).map(id=>runtime.runs.getInput(sessionId,id)));
          process.stdout.write(JSON.stringify({view,inputs}));
        }finally{subscription?.close();await runtime.close();}`,
        ],
        {
          windowsHide: true,
          timeout: 20000,
          env: {
            ...process.env,
            KODAX_HOME: space.testDataDir,
            QUEUE_SESSION: id,
            QUEUE_IDS: JSON.stringify(ids),
          },
        },
      );
      await test.info().attach('queue-reload-independent.json', {
        body: sdk.stdout,
        contentType: 'application/json',
      });
      throw error;
    }
    await expect(space.page.getByTestId('queued-user-message-bubble')).not.toContainText('_END');
    await takeBack.scrollIntoViewIfNeeded();
    await expect(takeBack).toBeInViewport();
    await space.page.screenshot({ path: test.info().outputPath('blocked-queue.png') });
    await takeBack.click();
    await expect(takeBack).toHaveCount(0);
    const retained = space.page.getByTestId('queued-user-message-bubble');
    await expect(retained).toHaveAttribute('data-status', 'failed');
    await expect(retained).toContainText('Withdrawn');
    await expect(retained).not.toContainText('Not delivered');
    await expect(retained).toContainText('_END');
    expect(provider.requests.some((text) => text.includes('BETA1_BLOCKED_'))).toBe(false);
  } finally {
    provider.release('HOLD_QUEUE');
    await provider.close();
    await space.close();
  }
});

test('Quick Ask continues in Coder with its original Session and answer after Host promotion', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`beta1-promotion-${Date.now()}`, provider.url);
  try {
    await space.page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    const quick = space.page.getByRole('dialog', { name: 'Quick Ask' });
    await space.page.evaluate(() => {
      const probe = window as unknown as { __beta1QuickSessions: string[] };
      probe.__beta1QuickSessions = [];
      window.kodaxSpace!.on('session.event', (event) => {
        if (event.kind === 'session_start') probe.__beta1QuickSessions.push(event.sessionId);
      });
    });
    await quick.locator('textarea').fill('BETA1_QUICK_PROMOTION');
    await quick.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(quick).toContainText('SDK_REPLY:BETA1_QUICK_PROMOTION', { timeout: 30_000 });
    const original = await space.page.evaluate(async () => {
      const listed = await window.kodaxSpace!.invoke('session.list', { surface: 'code' });
      if (!listed.ok) throw new Error(listed.error.message);
      return listed.data.sessions.map((session) => session.sessionId);
    });
    await quick.getByRole('button', { name: /Continue in Coder/ }).click();
    await expect(quick).toHaveCount(0, { timeout: 20_000 });
    const id = await currentSdkSession(space);
    expect(original).not.toContain(id);
    const quickSessionIds = await space.page.evaluate(
      () => (window as unknown as { __beta1QuickSessions: string[] }).__beta1QuickSessions,
    );
    expect(quickSessionIds).toContain(id);
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'BETA1_QUICK_PROMOTION',
    );
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:BETA1_QUICK_PROMOTION',
    );
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'BETA1_QUICK_PROMOTION' })
      .first()
      .click();
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:BETA1_QUICK_PROMOTION',
      { timeout: 30_000 },
    );
    expect(await currentSdkSession(space)).toBe(id);
    await space.page.screenshot({ path: test.info().outputPath('promoted-session.png') });
  } finally {
    await provider.close();
    await space.close();
  }
});
