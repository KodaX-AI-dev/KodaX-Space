import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, afterEach, beforeEach, test } from 'node:test';
import type { PartnerConnectorSnapshotT } from '@kodax-space/space-ipc-schema';
import type { IpcMainInvokeEvent } from 'electron';

process.env.KODAX_TEST_ONBOARDING = `connector-ipc-${randomUUID()}`;
const { applySdkHomeEnv, getKodaxDir } = await import('../kodax/data-paths.js');
applySdkHomeEnv();
const profile = getKodaxDir();
const ipc = await import('./session.js');
const { kodaxHost } = await import('../kodax/host.js');
const { SessionRuntimeStore, setSessionRuntimeStoreForTesting } =
  await import('../kodax/session-runtime-store.js');
const { installSessionStoreMock } = await import('../test/_helpers/session-store-mock.js');
const { setUserConfigImpl } = await import('../kodax/user-config.js');
const { setRendererTarget } = await import('./push.js');
const binding: PartnerConnectorSnapshotT = {
  extensionId: 'kodax.partner-library',
  connectorId: 'feishu',
  connectionId: randomUUID(),
  connectionRevision: 1,
  name: 'Feishu',
  accountLabel: 'Test account',
  documents: [{ url: 'https://example.feishu.cn/docx/Allowed', access: 'read' }],
};
const { name: _name, accountLabel: _label, ...selection } = binding;
let directory = '';
let store: InstanceType<typeof SessionRuntimeStore>;
let persisted: ReturnType<typeof installSessionStoreMock>;
const service = {
  resolveSelections: async (items: readonly unknown[]) =>
    items.length ? [structuredClone(binding)] : [],
  describeBindings: async (items: readonly PartnerConnectorSnapshotT[]) => ({
    connectors: items.map((item) => ({ binding: item, available: true })),
  }),
};

beforeEach(async () => {
  await fs.mkdir(profile, { recursive: true });
  directory = await fs.mkdtemp(path.join(profile, 'session-'));
  store = new SessionRuntimeStore(directory);
  setSessionRuntimeStoreForTesting(store);
  persisted = installSessionStoreMock();
  setUserConfigImpl({
    loadConfig: (() => ({ provider: 'mock' })) as never,
    registerCustomProviders: (() => undefined) as never,
  });
  await kodaxHost.disposeAll();
  setRendererTarget(() => null);
});
afterEach(async () => {
  await kodaxHost.disposeAll();
  setSessionRuntimeStoreForTesting(null);
  persisted.reset();
  setUserConfigImpl(null);
  await fs.rm(directory, { recursive: true, force: true });
});
after(async () => {
  await fs.rm(profile, { recursive: true, force: true });
});

test('session creation resolves connector identities in host and persists snapshots before its ACK', async () => {
  const result = await ipc.createSessionForIpc(
    {
      projectRoot: directory,
      provider: 'mock',
      surface: 'partner',
      partnerConnectors: [selection],
    },
    {},
    undefined,
    service,
  );
  assert.deepEqual(result.partnerConnectors, [binding]);
  assert.deepEqual((await store.read(result.sessionId))?.partnerConnectors, [binding]);
  assert.deepEqual(
    (await ipc.getPartnerConnectorsForIpc({ sessionId: result.sessionId }, service)).connectors[0]
      ?.binding,
    binding,
  );
});

test('a delayed selection cannot resurrect a connector after a later remove request', async () => {
  const session = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
  });
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayed = {
    ...service,
    resolveSelections: async (items: readonly unknown[]) => {
      if (items.length) {
        entered();
        await gate;
      }
      return service.resolveSelections(items);
    },
  };
  const choosing = ipc.setPartnerConnectorsForIpc(
    { sessionId: session.sessionId, connectors: [selection] },
    delayed,
  );
  await started;
  const removing = ipc.setPartnerConnectorsForIpc(
    { sessionId: session.sessionId, connectors: [] },
    delayed,
  );
  release();
  await Promise.all([choosing, removing]);
  assert.deepEqual(kodaxHost.get(session.sessionId)?.partnerConnectors, []);
  assert.deepEqual((await store.read(session.sessionId))?.partnerConnectors, []);
});

test('removing an unavailable connection retains the other unavailable snapshot without reauthorizing it', async () => {
  const other = { ...structuredClone(binding), connectionId: randomUUID() };
  const session = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
    partnerConnectors: [binding, other],
  });
  let resolutions = 0;
  const unavailable = {
    resolveSelections: async () => {
      resolutions++;
      throw new Error('Extension disabled');
    },
    describeBindings: async (items: readonly PartnerConnectorSnapshotT[]) => ({
      connectors: items.map((item) => ({
        binding: item,
        available: false,
        unavailableReason: 'Extension disabled',
      })),
    }),
  };
  const remaining = { ...selection, connectionId: other.connectionId };
  const state = await ipc.setPartnerConnectorsForIpc(
    { sessionId: session.sessionId, connectors: [remaining] },
    unavailable,
  );
  assert.equal(resolutions, 0);
  assert.deepEqual(state.connectors, [
    { binding: other, available: false, unavailableReason: 'Extension disabled' },
  ]);
  assert.deepEqual((await store.read(session.sessionId))?.partnerConnectors, [other]);

  // The removal shortcut must never grant a new identity, revision, target or permission.
  assert.equal(await kodaxHost.setPartnerConnectors(session.sessionId, [binding, other]), 'ok');
  for (const changed of [
    { ...remaining, extensionId: 'other.extension' },
    { ...remaining, connectorId: 'other-connector' },
    { ...remaining, connectionId: randomUUID() },
    { ...remaining, connectionRevision: 2 },
    { ...remaining, documents: [{ url: remaining.documents[0]!.url, access: 'append' as const }] },
    {
      ...remaining,
      documents: [{ url: 'https://example.feishu.cn/docx/Other', access: 'read' as const }],
    },
    { ...remaining, createFolderUrl: 'https://example.feishu.cn/drive/folder/New' },
    { ...remaining, createBaseFolderUrl: 'https://example.feishu.cn/drive/folder/NewBase' },
  ]) {
    await assert.rejects(
      () =>
        ipc.setPartnerConnectorsForIpc(
          { sessionId: session.sessionId, connectors: [changed] },
          unavailable,
        ),
      /Extension disabled/,
    );
  }
  assert.equal(resolutions, 8);
  assert.deepEqual(kodaxHost.get(session.sessionId)?.partnerConnectors, [binding, other]);
});

test('invalid Coder/temporary binding rejects without contacting a connector', async () => {
  const forbidden = {
    ...service,
    resolveSelections: async () => {
      throw new Error('must not resolve');
    },
  };
  for (const extra of [
    { surface: 'code' as const },
    { surface: 'partner' as const, ephemeral: true },
  ]) {
    await assert.rejects(
      () =>
        ipc.createSessionForIpc(
          { projectRoot: directory, provider: 'mock', ...extra, partnerConnectors: [selection] },
          {},
          undefined,
          forbidden,
        ),
      /Partner|persistent/,
    );
  }
});

test('connector session channels reject extension frames before reading session authority', async () => {
  const handlers = new Map<
    string,
    (
      input: { sessionId: string; connectors: (typeof selection)[] },
      event: IpcMainInvokeEvent,
    ) => unknown
  >();
  ipc.registerPartnerConnectorChannels((name, handler) => {
    handlers.set(name, handler as never);
  });
  const mainFrame = { url: 'app://space/' };
  const event = {
    sender: { mainFrame },
    senderFrame: { url: 'app://space/__space-extension-frame' },
  } as unknown as IpcMainInvokeEvent;
  for (const handler of handlers.values()) {
    assert.throws(
      () => handler({ sessionId: 'foreign', connectors: [] }, event),
      /primary application main frame/,
    );
  }
  assert.equal(handlers.size, 2);
});
