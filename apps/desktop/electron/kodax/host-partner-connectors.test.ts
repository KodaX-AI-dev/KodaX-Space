import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import type { PartnerConnectorSnapshotT } from '@kodax-space/space-ipc-schema';
import { kodaxHost } from './host.js';
import { SessionRuntimeStore, setSessionRuntimeStoreForTesting } from './session-runtime-store.js';
import { setRendererTarget } from '../ipc/push.js';
import {
  installSessionStoreMock,
  type MockSessionState,
} from '../test/_helpers/session-store-mock.js';
import { setUserConfigImpl } from './user-config.js';
import { deleteSessionForIpc } from '../ipc/session.js';

const binding: PartnerConnectorSnapshotT = {
  extensionId: 'kodax.partner-library',
  connectorId: 'feishu',
  connectionId: randomUUID(),
  connectionRevision: 1,
  name: '飞书文档',
  accountLabel: 'QA account',
  documents: [{ url: 'https://example.feishu.cn/docx/Allowed', access: 'append' }],
};
let directory = '';
let store: SessionRuntimeStore;
let persisted: MockSessionState;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-connectors-host-'));
  store = new SessionRuntimeStore(directory);
  setSessionRuntimeStoreForTesting(store);
  persisted = installSessionStoreMock();
  setUserConfigImpl({
    loadConfig: (() => ({})) as never,
    registerCustomProviders: (() => undefined) as never,
  });
  await kodaxHost.disposeAll();
  setRendererTarget(() => null);
});
afterEach(async () => {
  await kodaxHost.disposeAll();
  setSessionRuntimeStoreForTesting(null);
  setUserConfigImpl(null);
  persisted.reset();
  await fs.rm(directory, { recursive: true, force: true });
});

test('Partner creates, persists and forks independent connector scopes; other sessions do not inherit them', async () => {
  const first = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
    partnerConnectors: [binding],
  });
  const second = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
  });
  assert.deepEqual(kodaxHost.get(first.sessionId)?.partnerConnectors, [binding]);
  assert.notEqual(kodaxHost.get(first.sessionId)?.partnerConnectors?.[0], binding);
  assert.equal(kodaxHost.get(second.sessionId)?.partnerConnectors, undefined);
  await kodaxHost.persistRuntime(first.sessionId);
  assert.deepEqual((await store.read(first.sessionId))?.partnerConnectors, [binding]);
  persisted.seedTagged(first.sessionId, directory, 'partner');
  const fork = await kodaxHost.fork(first.sessionId, 0, {
    boundaryId: 'answer-one',
    sourceRevision: 'source-one',
  });
  assert.ok(fork);
  assert.deepEqual((await store.read(fork.newSessionId))?.partnerConnectors, [binding]);
  assert.equal(await kodaxHost.setPartnerConnectors(fork.newSessionId, []), 'ok');
  assert.deepEqual(kodaxHost.get(first.sessionId)?.partnerConnectors, [binding]);
});

test('restore preserves connector scope while deletion removes its runtime sidecar', async () => {
  persisted.seedTagged('restored-connectors', directory, 'partner');
  await store.set('restored-connectors', { provider: 'mock', partnerConnectors: [binding] });
  assert.equal(await kodaxHost.tryResume('restored-connectors'), true);
  assert.deepEqual(kodaxHost.get('restored-connectors')?.partnerConnectors, [binding]);
  await deleteSessionForIpc('restored-connectors', {
    deleteSession: (id) => kodaxHost.delete(id),
    deleteRuntime: (id) => store.delete(id),
    clearGoal: () => undefined,
    deleteLocalNotices: async () => undefined,
  });
  assert.equal(await store.read('restored-connectors'), null);
});

test('Coder and ephemeral sessions reject connector binding without changing state', async () => {
  for (const options of [
    { surface: 'code' as const },
    { surface: 'partner' as const, ephemeral: true },
  ]) {
    assert.throws(
      () =>
        kodaxHost.createSession({
          projectRoot: directory,
          provider: 'mock',
          ...options,
          partnerConnectors: [binding],
        }),
      /Partner|persistent/,
    );
    const session = kodaxHost.createSession({
      projectRoot: directory,
      provider: 'mock',
      ...options,
    });
    await assert.rejects(
      () => kodaxHost.setPartnerConnectors(session.sessionId, [binding]),
      /Partner|persistent/,
    );
    assert.equal(kodaxHost.get(session.sessionId)?.partnerConnectors, undefined);
  }
});

test('binding is published only after persistence and a failing write preserves old scope', async () => {
  const session = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
    partnerConnectors: [binding],
  });
  await kodaxHost.persistRuntime(session.sessionId);
  class FailingStore extends SessionRuntimeStore {
    override async set(): Promise<boolean> {
      return false;
    }
  }
  setSessionRuntimeStoreForTesting(new FailingStore(directory));
  assert.equal(await kodaxHost.setPartnerConnectors(session.sessionId, []), 'persist-failed');
  assert.deepEqual(kodaxHost.get(session.sessionId)?.partnerConnectors, [binding]);
  assert.deepEqual((await store.read(session.sessionId))?.partnerConnectors, [binding]);
  setSessionRuntimeStoreForTesting(store);
  assert.equal(await kodaxHost.setPartnerConnectors(session.sessionId, []), 'ok');
  assert.deepEqual(kodaxHost.get(session.sessionId)?.partnerConnectors, []);
});
