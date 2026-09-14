import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron';
import {
  connectorInvokeChannels,
  connectorOnboardingInvokeChannels,
  type ChannelInput,
  type ChannelOutput,
  type InvokeChannelName,
} from '@kodax-space/space-ipc-schema';

process.env.KODAX_TEST_ONBOARDING = `partner-connector-ipc-${randomUUID()}`;
const { applySdkHomeEnv, getKodaxDir, getSpaceDataDir } = await import('../kodax/data-paths.js');
applySdkHomeEnv();
const { registerPartnerConnectorChannels } = await import('./partner-connectors.js');
const { setRendererTarget } = await import('./push.js');
type Handler = (
  input: ChannelInput<InvokeChannelName>,
  event: IpcMainInvokeEvent,
) => Promise<ChannelOutput<InvokeChannelName>> | ChannelOutput<InvokeChannelName>;
const handlers = new Map<string, Handler>();
registerPartnerConnectorChannels((name, handler) => {
  handlers.set(name, handler as Handler);
});
const mainFrame = { url: 'app://space/index.html' } as WebFrameMain;
const sender = { id: 776, mainFrame, isDestroyed: () => false } as unknown as WebContents;
setRendererTarget(() => sender);
after(async () => {
  setRendererTarget(() => null);
  await fs.rm(getKodaxDir(), { recursive: true, force: true });
});

test('all account, scope, content and apply handlers reject extension/subframes before inspecting input', async () => {
  assert.deepEqual(
    [...handlers.keys()].sort(),
    Object.keys({ ...connectorInvokeChannels, ...connectorOnboardingInvokeChannels })
      .filter((name) => !name.startsWith('session.'))
      .sort(),
  );
  const child = {
    sender,
    senderFrame: { url: 'app://space/__space-extension-frame' },
  } as IpcMainInvokeEvent;
  for (const handler of handlers.values())
    await assert.rejects(
      async () => handler({} as ChannelInput<InvokeChannelName>, child),
      /primary application main frame/,
    );
  const foreign = { sender: { id: 999, mainFrame }, senderFrame: mainFrame } as IpcMainInvokeEvent;
  for (const handler of handlers.values())
    await assert.rejects(
      async () => handler({} as ChannelInput<InvokeChannelName>, foreign),
      /primary application main frame/,
    );
});

test('first records request resumes a disk-only Partner session and still rejects other projects and Coder', async (t) => {
  const { kodaxHost } = await import('../kodax/host.js');
  const { projectStore } = await import('../projects/store.js');
  const { SessionRuntimeStore, setSessionRuntimeStoreForTesting } =
    await import('../kodax/session-runtime-store.js');
  const { PartnerConnectorStore } = await import('../partner-connectors/store.js');
  const { installSessionStoreMock } = await import('../test/_helpers/session-store-mock.js');
  const { setUserConfigImpl } = await import('../kodax/user-config.js');
  await fs.mkdir(getKodaxDir(), { recursive: true });
  const directory = await fs.mkdtemp(path.join(getKodaxDir(), 'restored-'));
  const otherProject = path.join(directory, 'other-project');
  const runtime = new SessionRuntimeStore(path.join(directory, 'runtime'));
  setSessionRuntimeStoreForTesting(runtime);
  const persisted = installSessionStoreMock();
  setUserConfigImpl({
    loadConfig: (() => ({ provider: 'mock' })) as never,
    registerCustomProviders: (() => undefined) as never,
  });
  t.after(async () => {
    await kodaxHost.disposeAll();
    setSessionRuntimeStoreForTesting(null);
    setUserConfigImpl(null);
    persisted.reset();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await projectStore.addOrBump(directory);
  await projectStore.addOrBump(otherProject);
  persisted.seedTagged('disk-only-partner', directory, 'partner');
  persisted.seedTagged('disk-only-coder', directory, 'code');
  await runtime.set('disk-only-partner', { provider: 'mock' });
  await runtime.set('disk-only-coder', { provider: 'mock' });
  const source = {
    id: randomUUID(),
    sessionId: 'disk-only-partner',
    projectRoot: directory,
    extensionId: 'kodax.partner-library',
    connectorId: 'feishu-docs',
    connectionId: randomUUID(),
    documentId: 'Allowed',
    url: 'https://example.feishu.cn/docx/Allowed',
    title: 'Persisted source',
    revision: 1,
    content: 'Previously read document',
    contentHash: createHash('sha256').update('Previously read document').digest('hex'),
    readAt: new Date().toISOString(),
  };
  await new PartnerConnectorStore(path.join(getSpaceDataDir(), 'partner-connectors')).mutate((db) =>
    db.sources.push(source),
  );
  assert.equal(kodaxHost.get(source.sessionId), undefined);
  const event = { sender, senderFrame: mainFrame } as IpcMainInvokeEvent;
  const records = (await handlers.get('partner.connectors.records')!(
    { sessionId: source.sessionId, projectRoot: directory },
    event,
  )) as ChannelOutput<'partner.connectors.records'>;
  assert.equal(kodaxHost.get(source.sessionId)?.surface, 'partner');
  assert.equal(records.sources[0]?.id, source.id);
  assert.equal('content' in records.sources[0]!, false);
  for (const input of [
    { sessionId: source.sessionId, projectRoot: otherProject },
    { sessionId: 'disk-only-coder', projectRoot: directory },
    { sessionId: 'missing-session', projectRoot: directory },
  ]) {
    await assert.rejects(
      async () => handlers.get('partner.connectors.records')!(input, event),
      /会话与项目不匹配/,
    );
  }
});

test('primary-frame onboarding IPC invokes real task start/get/reopen/cancel without granting a session', async (t) => {
  const { PartnerConnectorTasks } = await import('../partner-connectors/connection-tasks.js');
  let opens = 0;
  let runs = 0;
  const tasks = new PartnerConnectorTasks({
    service: {
      assertConnectionAllowed: async () => undefined,
      connect: async () => {
        assert.fail('Cancelled authorization must not commit');
      },
    },
    run: async (input) => {
      runs++;
      input.onProgress({
        phase: 'waiting_app',
        authorizationUrl: 'https://open.feishu.cn/page/cli?user_code=private-code',
      });
      await new Promise<void>((resolve) =>
        input.signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    },
    openExternal: async (_url, assertActive) => {
      assertActive();
      opens++;
    },
  });
  t.after(() => tasks.dispose());
  const routes = new Map<string, Handler>();
  registerPartnerConnectorChannels(
    (name, handler) => {
      routes.set(name, handler as Handler);
    },
    () => tasks,
  );
  const event = { sender, senderFrame: mainFrame } as IpcMainInvokeEvent;
  const owner = { extensionId: 'partner.library', connectorId: 'feishu' };
  const input = { ...owner, installCli: false };
  const start = (await routes.get('partner.connectors.onboarding.start')!(
    input,
    event,
  )) as ChannelOutput<'partner.connectors.onboarding.start'>;
  const duplicate = (await routes.get('partner.connectors.onboarding.start')!(
    input,
    event,
  )) as ChannelOutput<'partner.connectors.onboarding.start'>;
  assert.equal(duplicate.job.id, start.job.id);
  for (let count = 0; count < 30 && runs === 0; count++)
    await new Promise((resolve) => setTimeout(resolve, 2));
  const identity = { ...owner, id: start.job.id };
  const current = (await routes.get('partner.connectors.onboarding.get')!(
    identity,
    event,
  )) as ChannelOutput<'partner.connectors.onboarding.get'>;
  assert.equal(current.job.phase, 'waiting_app');
  assert.equal(JSON.stringify(current).includes('private-code'), false);
  assert.deepEqual(await routes.get('partner.connectors.onboarding.reopen')!(identity, event), {
    ok: true,
  });
  assert.equal(opens, 2);
  const cancelled = (await routes.get('partner.connectors.onboarding.cancel')!(
    identity,
    event,
  )) as ChannelOutput<'partner.connectors.onboarding.cancel'>;
  assert.equal(cancelled.job.phase, 'cancelled');
  assert.equal(runs, 1);
  await assert.rejects(
    async () =>
      routes.get('partner.connectors.onboarding.get')!(
        { ...identity, extensionId: 'another.library' },
        event,
      ),
    /不属于/,
  );
  await assert.rejects(
    async () => routes.get('partner.connectors.onboarding.reopen')!(identity, event),
    /取消/,
  );
});
