import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, afterEach, beforeEach, test } from 'node:test';
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron';
import type {
  ChannelInput,
  ChannelOutput,
  PartnerExpertSnapshotT,
  SpaceExpertRefT,
} from '@kodax-space/space-ipc-schema';
import type { SpaceExpertCatalog } from '../space-extensions/experts.js';

// Configure all singleton stores before loading the IPC module, never the user's profile.
process.env.KODAX_TEST_ONBOARDING = `expert-ipc-${randomUUID()}`;
const { applySdkHomeEnv, getKodaxDir } = await import('../kodax/data-paths.js');
applySdkHomeEnv();
const profileDirectory = getKodaxDir();
const sessionIpc = await import('./session.js');
const { kodaxHost } = await import('../kodax/host.js');
const { SessionRuntimeStore, setSessionRuntimeStoreForTesting } =
  await import('../kodax/session-runtime-store.js');
const { installSessionStoreMock } = await import('../test/_helpers/session-store-mock.js');
const { setUserConfigImpl } = await import('../kodax/user-config.js');
const { setRendererTarget } = await import('./push.js');

const expert: PartnerExpertSnapshotT = {
  extensionId: 'partner.library',
  extensionVersion: '1.0.0',
  expert: {
    id: 'writing-guide',
    revision: 1,
    name: 'Writing guide',
    description: 'Drafting',
    prompt: 'EXPERT-WRITING: Preserve the original meaning.',
    starterTasks: [],
  },
};
const ref: SpaceExpertRefT = {
  extensionId: expert.extensionId,
  expertId: expert.expert.id,
  revision: 1,
};
const catalog: Pick<SpaceExpertCatalog, 'resolve' | 'requireAvailable'> = {
  resolve: async (input) => {
    assert.deepEqual(input, ref);
    return structuredClone(expert);
  },
  requireAvailable: async () => undefined,
};
let directory = '';
let store: InstanceType<typeof SessionRuntimeStore>;
let persisted: ReturnType<typeof installSessionStoreMock>;
const pushes: Array<{ channel: string; payload: unknown }> = [];

beforeEach(async () => {
  await fs.mkdir(profileDirectory, { recursive: true });
  directory = await fs.mkdtemp(path.join(profileDirectory, 'session-'));
  store = new SessionRuntimeStore(directory);
  setSessionRuntimeStoreForTesting(store);
  persisted = installSessionStoreMock();
  setUserConfigImpl({
    loadConfig: (() => ({ provider: 'mock' })) as never,
    registerCustomProviders: (() => undefined) as never,
  });
  await kodaxHost.disposeAll();
  pushes.length = 0;
  setRendererTarget(
    () =>
      ({
        send: (channel: string, payload: unknown) => pushes.push({ channel, payload }),
        isDestroyed: () => false,
      }) as unknown as WebContents,
  );
});

afterEach(async () => {
  await kodaxHost.disposeAll();
  setSessionRuntimeStoreForTesting(null);
  setUserConfigImpl(null);
  persisted.reset();
  setRendererTarget(() => null);
});
after(() => fs.rm(profileDirectory, { recursive: true, force: true }));

test('session.create resolves the expert on main and only acknowledges after its snapshot is on disk', async () => {
  let entered!: () => void;
  let release!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  class SlowStore extends SessionRuntimeStore {
    override async set(
      ...args: Parameters<InstanceType<typeof SessionRuntimeStore>['set']>
    ): Promise<boolean> {
      entered();
      await gate;
      return super.set(...args);
    }
  }
  setSessionRuntimeStoreForTesting(new SlowStore(directory));
  let acknowledged = false;
  const creation = sessionIpc
    .createSessionForIpc(
      { projectRoot: directory, provider: 'mock', surface: 'partner', partnerExpert: ref },
      {},
      catalog,
    )
    .then((result) => {
      acknowledged = true;
      return result;
    });
  await writing;
  assert.equal(acknowledged, false);
  release();
  const result = await creation;
  assert.deepEqual(result.partnerExpert, expert);
  assert.deepEqual((await store.read(result.sessionId))?.partnerExpert, expert);
  assert.deepEqual(kodaxHost.get(result.sessionId)?.partnerExpert, expert);
});

test('session.create rolls back on persistence failure and rejects Coder or ephemeral expert bindings', async () => {
  class FailingStore extends SessionRuntimeStore {
    override async set(): Promise<boolean> {
      return false;
    }
  }
  setSessionRuntimeStoreForTesting(new FailingStore(directory));
  await assert.rejects(
    () =>
      sessionIpc.createSessionForIpc(
        { projectRoot: directory, provider: 'mock', surface: 'partner', partnerExpert: ref },
        {},
        catalog,
      ),
    /could not be persisted/,
  );
  assert.equal(kodaxHost.listInFlight().length, 0);
  await assert.rejects(
    () =>
      sessionIpc.createSessionForIpc(
        { projectRoot: directory, provider: 'mock', surface: 'code', partnerExpert: ref },
        {},
        catalog,
      ),
    /only available in Partner/,
  );
  await assert.rejects(
    () =>
      sessionIpc.createSessionForIpc(
        {
          projectRoot: directory,
          provider: 'mock',
          surface: 'partner',
          ephemeral: true,
          partnerExpert: ref,
        },
        {},
        catalog,
      ),
    /persistent session/,
  );
  const temporary = await sessionIpc.createSessionForIpc(
    { projectRoot: directory, provider: 'mock', surface: 'partner', ephemeral: true },
    {},
    catalog,
  );
  assert.equal(temporary.partnerExpert, null);
  assert.equal(await store.read(temporary.sessionId), null);
});

test('get resumes a persisted-only Partner snapshot and reports unavailable without clearing its saved role', async () => {
  const sessionId = 'expert-persisted-ipc';
  persisted.seedTagged(sessionId, directory, 'partner');
  await store.set(sessionId, { provider: 'mock', partnerExpert: expert });
  const unavailableCatalog = {
    ...catalog,
    requireAvailable: async () => {
      throw new Error('Extension is disabled');
    },
  };
  const state = await sessionIpc.getPartnerExpertForIpc({ sessionId }, unavailableCatalog);
  assert.deepEqual(state, { expert, available: false, unavailableReason: 'Extension is disabled' });
  assert.deepEqual((await store.read(sessionId))?.partnerExpert, expert);
  assert.deepEqual(kodaxHost.get(sessionId)?.partnerExpert, expert);
  assert.deepEqual(pushes, []);
});

test('set keeps the old role and emits no changed event until a durable write succeeds', async () => {
  const { sessionId } = await sessionIpc.createSessionForIpc(
    { projectRoot: directory, provider: 'mock', surface: 'partner' },
    {},
    catalog,
  );
  let entered!: () => void;
  let release!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  class FailingStore extends SessionRuntimeStore {
    override async set(): Promise<boolean> {
      entered();
      await gate;
      return false;
    }
  }
  setSessionRuntimeStoreForTesting(new FailingStore(directory));
  const changing = sessionIpc.setPartnerExpertForIpc({ sessionId, expert: ref }, catalog);
  const failed = assert.rejects(changing, /could not be persisted/);
  await writing;
  assert.equal(kodaxHost.get(sessionId)?.partnerExpert, undefined);
  assert.deepEqual(pushes, []);
  release();
  await failed;
  assert.deepEqual(pushes, []);
  setSessionRuntimeStoreForTesting(store);
  assert.deepEqual(await sessionIpc.setPartnerExpertForIpc({ sessionId, expert: ref }, catalog), {
    expert,
    available: true,
  });
  assert.deepEqual((await store.read(sessionId))?.partnerExpert, expert);
  assert.deepEqual(pushes, [
    {
      channel: 'session.partnerExpert.changed',
      payload: { sessionId, state: { expert, available: true } },
    },
  ]);
  assert.deepEqual(await sessionIpc.setPartnerExpertForIpc({ sessionId, expert: null }, catalog), {
    expert: null,
    available: true,
  });
  assert.equal((await store.read(sessionId))?.partnerExpert, undefined);
});

test('get and set reject Coder and set rejects existing ephemeral Partner sessions', async () => {
  const coder = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'code',
  });
  await assert.rejects(
    () => sessionIpc.getPartnerExpertForIpc({ sessionId: coder.sessionId }, catalog),
    /only available in Partner/,
  );
  await assert.rejects(
    () => sessionIpc.setPartnerExpertForIpc({ sessionId: coder.sessionId, expert: ref }, catalog),
    /only available in Partner/,
  );
  const temporary = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
    ephemeral: true,
  });
  await assert.rejects(
    () =>
      sessionIpc.setPartnerExpertForIpc({ sessionId: temporary.sessionId, expert: ref }, catalog),
    /persistent session/,
  );
  assert.equal(await store.read(temporary.sessionId), null);
  assert.deepEqual(pushes, []);
});

test('a slow availability check cannot publish an obsolete expert after a newer selection commits', async () => {
  const { sessionId } = await sessionIpc.createSessionForIpc(
    { projectRoot: directory, provider: 'mock', surface: 'partner' },
    {},
    catalog,
  );
  let entered!: () => void;
  let release!: () => void;
  const checking = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slowCatalog = {
    ...catalog,
    requireAvailable: async () => {
      entered();
      await gate;
    },
  };
  const older = sessionIpc.setPartnerExpertForIpc({ sessionId, expert: ref }, slowCatalog);
  await checking;
  const cleared = { expert: null, available: true };
  assert.deepEqual(
    await sessionIpc.setPartnerExpertForIpc({ sessionId, expert: null }, catalog),
    cleared,
  );
  release();
  assert.deepEqual(await older, cleared);
  assert.equal((await store.read(sessionId))?.partnerExpert, undefined);
  assert.ok(pushes.length > 0);
  for (const item of pushes) {
    assert.deepEqual(item, {
      channel: 'session.partnerExpert.changed',
      payload: { sessionId, state: cleared },
    });
  }
});

test('set orders validation and persistence per Session so a later removal stays final', async () => {
  const { sessionId } = await sessionIpc.createSessionForIpc(
    { projectRoot: directory, provider: 'mock', surface: 'partner', partnerExpert: ref },
    {},
    catalog,
  );
  const other = await sessionIpc.createSessionForIpc(
    { projectRoot: directory, provider: 'mock', surface: 'partner', partnerExpert: ref },
    {},
    catalog,
  );
  const replacement = {
    ...expert,
    expert: { ...expert.expert, id: 'research-guide', prompt: 'REPLACEMENT_RESEARCH_ROLE' },
  };
  const replacementRef = { ...ref, expertId: replacement.expert.id };
  let entered!: () => void;
  let release!: () => void;
  const checking = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slowCatalog = {
    ...catalog,
    resolve: async (input: SpaceExpertRefT) => {
      assert.deepEqual(input, replacementRef);
      entered();
      await gate;
      return structuredClone(replacement);
    },
  };
  const older = sessionIpc.setPartnerExpertForIpc(
    { sessionId, expert: replacementRef },
    slowCatalog,
  );
  await checking;
  const removal = sessionIpc.setPartnerExpertForIpc({ sessionId, expert: null }, catalog);
  const cleared = { expert: null, available: true };
  try {
    // Another Session remains usable while the earlier selection is still validating.
    assert.deepEqual(
      await sessionIpc.setPartnerExpertForIpc(
        { sessionId: other.sessionId, expert: null },
        catalog,
      ),
      cleared,
    );
  } finally {
    release();
  }
  await older;
  assert.deepEqual(await removal, cleared);
  assert.equal(kodaxHost.get(sessionId)?.partnerExpert, undefined);
  assert.equal((await store.read(sessionId))?.partnerExpert, undefined);
  assert.deepEqual(await sessionIpc.getPartnerExpertForIpc({ sessionId }, catalog), cleared);
  assert.deepEqual(pushes.at(-1), {
    channel: 'session.partnerExpert.changed',
    payload: { sessionId, state: cleared },
  });
});

test('a failed pending expert validation does not prevent a later removal', async () => {
  const { sessionId } = await sessionIpc.createSessionForIpc(
    { projectRoot: directory, provider: 'mock', surface: 'partner', partnerExpert: ref },
    {},
    catalog,
  );
  let entered!: () => void;
  let release!: () => void;
  const checking = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const unavailableCatalog = {
    ...catalog,
    resolve: async (): Promise<PartnerExpertSnapshotT> => {
      entered();
      await gate;
      throw new Error('Replacement expert is unavailable');
    },
  };
  const failed = assert.rejects(
    sessionIpc.setPartnerExpertForIpc(
      { sessionId, expert: { ...ref, expertId: 'missing-expert' } },
      unavailableCatalog,
    ),
    /Replacement expert is unavailable/,
  );
  await checking;
  const removal = sessionIpc.setPartnerExpertForIpc({ sessionId, expert: null }, catalog);
  release();
  await failed;
  assert.deepEqual(await removal, { expert: null, available: true });
  assert.equal(kodaxHost.get(sessionId)?.partnerExpert, undefined);
  assert.equal((await store.read(sessionId))?.partnerExpert, undefined);
  assert.deepEqual(await sessionIpc.setPartnerExpertForIpc({ sessionId, expert: ref }, catalog), {
    expert,
    available: true,
  });
});

test('busy deletion retains the snapshot and successful deletion removes it with the Session', async () => {
  const { sessionId } = await sessionIpc.createSessionForIpc(
    { projectRoot: directory, provider: 'mock', surface: 'partner', partnerExpert: ref },
    {},
    catalog,
  );
  persisted.seedTagged(sessionId, directory, 'partner');
  persisted.setDeleteBusy(true);
  assert.deepEqual(await sessionIpc.deleteSessionForIpc(sessionId), {
    deleted: false,
    reason: 'session_running',
  });
  assert.deepEqual((await store.read(sessionId))?.partnerExpert, expert);
  assert.deepEqual(
    (await sessionIpc.getPartnerExpertForIpc({ sessionId }, catalog)).expert,
    expert,
  );
  persisted.setDeleteBusy(false);
  assert.deepEqual(await sessionIpc.deleteSessionForIpc(sessionId), { deleted: true });
  assert.equal(await store.read(sessionId), null);
  assert.equal(kodaxHost.get(sessionId), undefined);
  await assert.rejects(
    () => sessionIpc.getPartnerExpertForIpc({ sessionId }, catalog),
    /not found/,
  );
});

test('both expert IPC handlers reject child frames and other windows before accessing a Session', async () => {
  type ExpertChannel = 'session.partnerExpert.get' | 'session.partnerExpert.set';
  type ExpertHandler = (
    input: ChannelInput<ExpertChannel>,
    event: IpcMainInvokeEvent,
  ) => ChannelOutput<ExpertChannel> | Promise<ChannelOutput<ExpertChannel>>;
  const handlers = new Map<ExpertChannel, ExpertHandler>();
  sessionIpc.registerPartnerExpertChannels((name, handler) => {
    handlers.set(name, handler as ExpertHandler);
  });
  assert.deepEqual([...handlers.keys()].sort(), [
    'session.partnerExpert.get',
    'session.partnerExpert.set',
  ]);
  const mainFrame = { url: 'app://space/index.html' } as WebFrameMain;
  const sender = {
    id: 901,
    mainFrame,
    isDestroyed: () => false,
    send: () => undefined,
  } as unknown as WebContents;
  setRendererTarget(() => sender);
  const { sessionId } = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
  });
  await kodaxHost.persistRuntime(sessionId);
  for (const [channel, handler] of handlers) {
    const input =
      channel === 'session.partnerExpert.get' ? { sessionId } : { sessionId, expert: null };
    for (const event of [
      { sender, senderFrame: { url: 'app://space/__space-extension-frame' } },
      { sender: { ...sender, id: 902 }, senderFrame: mainFrame },
    ]) {
      await assert.rejects(
        async () => handler(input, event as IpcMainInvokeEvent),
        /primary application main frame/,
      );
    }
    assert.deepEqual(
      await handler(input, { sender, senderFrame: mainFrame } as IpcMainInvokeEvent),
      { expert: null, available: true },
    );
  }
});

test('changing useSkill on the current expert preserves the bound prompt even after a package update', async () => {
  const oldExpert = {
    ...expert,
    extensionVersion: '0.9.0',
    expert: { ...expert.expert, prompt: 'ORIGINAL_BOUND_PROMPT' },
  };
  const { sessionId } = kodaxHost.createSession({
    projectRoot: directory,
    provider: 'mock',
    surface: 'partner',
    partnerExpert: oldExpert,
  });
  await kodaxHost.persistRuntime(sessionId);
  const upgradedCatalog = {
    resolve: async (): Promise<PartnerExpertSnapshotT> => {
      throw new Error('Must not resolve a new package prompt for a preference-only change');
    },
    requireAvailable: async () => undefined,
  };
  const disabled = await sessionIpc.setPartnerExpertForIpc(
    { sessionId, expert: { ...ref, useSkill: false } },
    upgradedCatalog,
  );
  assert.deepEqual(disabled.expert, { ...oldExpert, useSkill: false });
  assert.deepEqual((await store.read(sessionId))?.partnerExpert, disabled.expert);
  const enabled = await sessionIpc.setPartnerExpertForIpc(
    { sessionId, expert: { ...ref, useSkill: true } },
    upgradedCatalog,
  );
  assert.deepEqual(enabled.expert, { ...oldExpert, useSkill: true });
  const defaulted = await sessionIpc.setPartnerExpertForIpc(
    { sessionId, expert: ref },
    upgradedCatalog,
  );
  assert.deepEqual(defaulted.expert, oldExpert);
});

test('binding a missing default Skill is rejected, prompt-only is explicit, and re-enable failure preserves that choice', async () => {
  const withMissingSkill = {
    ...expert,
    expert: { ...expert.expert, skillRef: 'expert-missing-fixture' },
  };
  const missingSkillCatalog = {
    resolve: async (input: SpaceExpertRefT): Promise<PartnerExpertSnapshotT> => ({
      ...withMissingSkill,
      ...(input.useSkill !== undefined ? { useSkill: input.useSkill } : {}),
    }),
    requireAvailable: async () => undefined,
  };
  await assert.rejects(
    () =>
      sessionIpc.createSessionForIpc(
        { projectRoot: directory, provider: 'mock', surface: 'partner', partnerExpert: ref },
        {},
        missingSkillCatalog,
      ),
    /Skill.*unavailable/,
  );
  assert.equal(kodaxHost.listInFlight().length, 0);
  const created = await sessionIpc.createSessionForIpc(
    {
      projectRoot: directory,
      provider: 'mock',
      surface: 'partner',
      partnerExpert: { ...ref, useSkill: false },
    },
    {},
    missingSkillCatalog,
  );
  assert.deepEqual(created.partnerExpert, { ...withMissingSkill, useSkill: false });
  const { sessionId } = created;
  await assert.rejects(
    () =>
      sessionIpc.setPartnerExpertForIpc(
        { sessionId, expert: { ...ref, useSkill: true } },
        missingSkillCatalog,
      ),
    /Skill.*unavailable/,
  );
  assert.deepEqual((await store.read(sessionId))?.partnerExpert, {
    ...withMissingSkill,
    useSkill: false,
  });
  assert.deepEqual(await sessionIpc.getPartnerExpertForIpc({ sessionId }, missingSkillCatalog), {
    expert: { ...withMissingSkill, useSkill: false },
    available: true,
  });
  assert.deepEqual(pushes, []);
});

test('selection reads only Skill metadata and re-enable refreshes a Skill removed since the previous binding', async () => {
  const name = 'expert-toggle-fixture';
  const skillDirectory = path.join(directory, '.kodax', 'skills', name);
  const file = path.join(skillDirectory, 'SKILL.md');
  const marker = path.join(directory, 'selection-must-not-execute');
  const command = `touch "${marker}"`;
  await fs.mkdir(skillDirectory, { recursive: true });
  await fs.writeFile(
    file,
    `---\nname: ${name}\ndescription: Metadata only\nhooks:\n  SessionStart:\n    - command: ${JSON.stringify(command)}\n---\n!\`${command}\`\n`,
  );
  const withSkill = { ...expert, expert: { ...expert.expert, skillRef: name } };
  const configuredCatalog = {
    resolve: async (): Promise<PartnerExpertSnapshotT> => structuredClone(withSkill),
    requireAvailable: async () => undefined,
  };
  const { sessionId } = await sessionIpc.createSessionForIpc(
    { projectRoot: directory, provider: 'mock', surface: 'partner', partnerExpert: ref },
    {},
    configuredCatalog,
  );
  assert.deepEqual((await store.read(sessionId))?.partnerExpert, withSkill);
  await assert.rejects(fs.access(marker), { code: 'ENOENT' });
  await sessionIpc.setPartnerExpertForIpc(
    { sessionId, expert: { ...ref, useSkill: false } },
    configuredCatalog,
  );
  await fs.unlink(file);
  await assert.rejects(
    () =>
      sessionIpc.setPartnerExpertForIpc(
        { sessionId, expert: { ...ref, useSkill: true } },
        configuredCatalog,
      ),
    /Skill.*unavailable/,
  );
  assert.equal((await store.read(sessionId))?.partnerExpert?.useSkill, false);
  await assert.rejects(fs.access(marker), { code: 'ENOENT' });
});

test('binding a fork-only Skill fails before saving the expert or executing its context', async () => {
  const name = 'expert-fork-fixture';
  const skillDirectory = path.join(directory, '.kodax', 'skills', name);
  const marker = path.join(directory, 'fork-must-not-execute');
  await fs.mkdir(skillDirectory, { recursive: true });
  await fs.writeFile(
    path.join(skillDirectory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Fork only\ncontext: fork\n---\n!\`touch "${marker}"\`\n`,
  );
  const configuredCatalog = {
    resolve: async (): Promise<PartnerExpertSnapshotT> => ({
      ...expert,
      expert: { ...expert.expert, skillRef: name },
    }),
    requireAvailable: async () => undefined,
  };
  await assert.rejects(
    () =>
      sessionIpc.createSessionForIpc(
        { projectRoot: directory, provider: 'mock', surface: 'partner', partnerExpert: ref },
        {},
        configuredCatalog,
      ),
    /unsupported fork/,
  );
  assert.equal(kodaxHost.listInFlight().length, 0);
  await assert.rejects(fs.access(marker), { code: 'ENOENT' });
});
