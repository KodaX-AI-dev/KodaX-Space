import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import type { PartnerExpertSnapshotT } from '@kodax-space/space-ipc-schema';
import { kodaxHost } from './host.js';
import { SessionRuntimeStore, setSessionRuntimeStoreForTesting } from './session-runtime-store.js';
import { setRendererTarget } from '../ipc/push.js';
import {
  installSessionStoreMock,
  type MockSessionState,
} from '../test/_helpers/session-store-mock.js';
import { setUserConfigImpl } from './user-config.js';

const expert: PartnerExpertSnapshotT = {
  extensionId: 'partner.library',
  extensionVersion: '1.0.0',
  expert: {
    id: 'writing-guide',
    revision: 1,
    name: 'Writing guide',
    description: 'Review drafts',
    prompt: 'Explain the evidence for each suggested revision.',
    starterTasks: [],
  },
};
let directory = '';
let store: SessionRuntimeStore;
let persisted: MockSessionState;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'space-expert-host-'));
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

test('a new Partner Session owns and persists its expert while a second Session stays unbound', async () => {
  const first = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
    partnerExpert: expert,
  });
  const second = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
  });
  assert.deepEqual(kodaxHost.get(first.sessionId)?.partnerExpert, expert);
  assert.equal(kodaxHost.get(second.sessionId)?.partnerExpert, undefined);
  assert.notEqual(kodaxHost.get(first.sessionId)?.partnerExpert, expert);
  assert.equal(await kodaxHost.persistRuntime(first.sessionId), true);
  assert.deepEqual((await store.read(first.sessionId))?.partnerExpert, expert);
  const listed = (await kodaxHost.listMerged()).find((item) => item.sessionId === first.sessionId);
  assert.equal(listed?.kind, 'in-flight');
  assert.deepEqual(listed?.kind === 'in-flight' ? listed.partnerExpert : undefined, expert);
});

test('restoring a persisted Partner Session keeps the exact expert snapshot', async () => {
  const sessionId = 'expert-restored';
  persisted.seedTagged(sessionId, directory, 'partner', 'Stored expert');
  await store.set(sessionId, { provider: 'mock', partnerExpert: expert });

  assert.equal(await kodaxHost.tryResume(sessionId), true);
  assert.deepEqual(kodaxHost.get(sessionId)?.partnerExpert, expert);
  assert.deepEqual((await store.read(sessionId))?.partnerExpert, expert);
});

test('an explicit fork copies the expert and persists an independent child snapshot', async () => {
  const { sessionId } = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
    partnerExpert: expert,
  });
  persisted.seedTagged(sessionId, directory, 'partner');
  const forked = await kodaxHost.fork(sessionId, 0, {
    boundaryId: 'answer-one',
    sourceRevision: 'source-one',
  });
  assert.ok(forked);
  const child = kodaxHost.get(forked.newSessionId);
  assert.deepEqual(child?.partnerExpert, expert);
  assert.notEqual(child?.partnerExpert, kodaxHost.get(sessionId)?.partnerExpert);
  assert.deepEqual((await store.read(forked.newSessionId))?.partnerExpert, expert);
});

test('an expert switch is published only after its write succeeds and a failed slow write preserves the old role', async () => {
  const { sessionId } = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
    partnerExpert: expert,
  });
  await kodaxHost.persistRuntime(sessionId);
  let entered!: () => void;
  let release!: () => void;
  const writeEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const writeGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  class ControlledStore extends SessionRuntimeStore {
    override async set(...args: Parameters<SessionRuntimeStore['set']>): Promise<boolean> {
      if (++writes === 1) {
        entered();
        await writeGate;
        return false;
      }
      return super.set(...args);
    }
  }
  setSessionRuntimeStoreForTesting(new ControlledStore(directory));
  const next = { ...expert, expert: { ...expert.expert, revision: 2, name: 'Research guide' } };
  const changing = kodaxHost.setPartnerExpert(sessionId, next);
  await writeEntered;
  assert.deepEqual(kodaxHost.get(sessionId)?.partnerExpert, expert);
  release();
  assert.equal(await changing, 'persist-failed');
  assert.deepEqual(kodaxHost.get(sessionId)?.partnerExpert, expert);
  assert.deepEqual((await store.read(sessionId))?.partnerExpert, expert);
  assert.equal(await kodaxHost.setPartnerExpert(sessionId, next), 'ok');
  assert.deepEqual(kodaxHost.get(sessionId)?.partnerExpert, next);
  assert.notEqual(kodaxHost.get(sessionId)?.partnerExpert, next);
  assert.equal(await kodaxHost.setPartnerExpert(sessionId, null), 'ok');
  assert.equal(kodaxHost.get(sessionId)?.partnerExpert, undefined);
  assert.equal((await store.read(sessionId))?.partnerExpert, undefined);
});

test('Coder rejects expert creation and later binding without modifying its runtime', async () => {
  assert.throws(
    () =>
      kodaxHost.createSession({
        projectRoot: directory,
        provider: 'mock',
        surface: 'code',
        partnerExpert: expert,
      }),
    /only available in Partner/,
  );
  const { sessionId } = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'code',
  });
  await assert.rejects(
    () => kodaxHost.setPartnerExpert(sessionId, expert),
    /only available in Partner/,
  );
  assert.equal(kodaxHost.get(sessionId)?.partnerExpert, undefined);
});

test('temporary sessions cannot acquire durable expert state before promotion', async () => {
  assert.throws(
    () =>
      kodaxHost.createSession({
        projectRoot: directory,
        provider: 'mock',
        surface: 'partner',
        ephemeral: true,
        partnerExpert: expert,
      }),
    /persistent session/,
  );
  const { sessionId } = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
    ephemeral: true,
  });
  await assert.rejects(() => kodaxHost.setPartnerExpert(sessionId, expert), /persistent session/);
  assert.equal(kodaxHost.get(sessionId)?.partnerExpert, undefined);
  assert.equal(await store.read(sessionId), null);
});
