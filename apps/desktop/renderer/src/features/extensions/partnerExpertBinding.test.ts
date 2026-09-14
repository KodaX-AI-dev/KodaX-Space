import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  PartnerExpertSnapshotT,
  PartnerExpertStateT,
  SpaceExpertRefT,
} from '@kodax-space/space-ipc-schema';
import { createPartnerExpertBinding, type PartnerExpertApi } from './partnerExpertBinding.js';

const ref: SpaceExpertRefT = {
  extensionId: 'partner-library',
  expertId: 'writing-mentor',
  revision: 1,
};
const expert: PartnerExpertSnapshotT = {
  extensionId: ref.extensionId,
  extensionVersion: '1.1.0',
  expert: {
    id: ref.expertId,
    revision: 1,
    name: 'Writing mentor',
    description: 'Help with writing',
    prompt: 'Be a writing mentor.',
    starterTasks: [],
  },
};
const state: PartnerExpertStateT = { expert, available: true };
const draft = { surface: 'partner' as const, projectRoot: '/project', sessionId: null };

function fixture() {
  const calls: string[] = [];
  const api: PartnerExpertApi = {
    resolve: async () => {
      calls.push('resolve');
      return expert;
    },
    get: async (id) => {
      calls.push(`get:${id}`);
      return state;
    },
    set: async (id, next) => {
      calls.push(`set:${id}:${next?.expertId ?? 'none'}`);
      return { expert: next ? expert : null, available: true };
    },
  };
  return { api, calls, binding: createPartnerExpertBinding(api) };
}

test('a draft expert is resolved without creating a session or invoking a Skill', async () => {
  const { binding, calls } = fixture();
  await binding.setContext(draft);
  await binding.select(ref);
  assert.deepEqual(calls, ['resolve']);
  assert.deepEqual(binding.getSnapshot().state, state);
  assert.deepEqual(binding.captureDraft(draft).expert, ref);
});

test('create ACK consumes only its matching draft and keeps the backend expert snapshot', async () => {
  const { binding } = fixture();
  await binding.setContext(draft);
  await binding.select(ref);
  const captured = binding.captureDraft(draft);
  assert.equal(binding.isCaptureCurrent(captured), true);
  assert.equal(binding.acceptCreatedSession(captured, 'session-1', expert), true);
  assert.equal(binding.getSnapshot().context.sessionId, 'session-1');
  assert.deepEqual(binding.getSnapshot().state.expert, expert);
  await binding.setContext(draft);
  assert.equal(binding.isCaptureCurrent(captured), false);
  assert.equal(binding.getSnapshot().state.expert, null);
});

test('switching project invalidates an in-flight draft selection', async () => {
  const { api, binding } = fixture();
  let resolve!: (value: PartnerExpertSnapshotT) => void;
  api.resolve = () =>
    new Promise((next) => {
      resolve = next;
    });
  await binding.setContext(draft);
  const selecting = binding.select(ref);
  await binding.setContext({ ...draft, projectRoot: '/other' });
  resolve(expert);
  await assert.rejects(selecting, /scope/i);
  assert.equal(binding.getSnapshot().state.expert, null);
  assert.equal(binding.getSnapshot().context.projectRoot, '/other');
});

test('existing session selection and removal use the durable session API', async () => {
  const { binding, calls } = fixture();
  await binding.setContext({ ...draft, sessionId: 'session-1' });
  await binding.select(ref);
  await binding.remove();
  assert.deepEqual(calls, ['get:session-1', 'set:session-1:writing-mentor', 'set:session-1:none']);
  assert.equal(binding.getSnapshot().state.expert, null);
});

test('session pushes win over an earlier get and unavailable bindings are not hidden', async () => {
  const { api, binding } = fixture();
  let resolve!: (value: PartnerExpertStateT) => void;
  api.get = () =>
    new Promise((next) => {
      resolve = next;
    });
  const restoring = binding.setContext({ ...draft, sessionId: 'session-1' });
  binding.receive('session-1', { expert, available: false, unavailableReason: 'Package disabled' });
  resolve(state);
  await restoring;
  assert.equal(binding.getSnapshot().state.available, false);
  assert.equal(binding.getSnapshot().state.expert?.expert.name, 'Writing mentor');
});

test('Coder does not get Partner expert configuration or issue expert requests', async () => {
  const { binding, calls } = fixture();
  await binding.setContext({ ...draft, surface: 'code', sessionId: 'coder-session' });
  await assert.rejects(binding.select(ref), /Partner/);
  assert.deepEqual(calls, []);
  assert.equal(binding.getSnapshot().state.expert, null);
});

test('a late create ACK cannot consume a newer expert choice or activate another scope', async () => {
  const { binding } = fixture();
  await binding.setContext(draft);
  await binding.select(ref);
  const captured = binding.captureDraft(draft);
  await binding.remove();
  assert.equal(binding.acceptCreatedSession(captured, 'late-session', expert), false);
  assert.equal(binding.getSnapshot().context.sessionId, null);
  assert.equal(binding.getSnapshot().state.expert, null);
});

test('failed expert resolution retains the old binding and blocks a pending create', async () => {
  const { api, binding } = fixture();
  await binding.setContext(draft);
  await binding.select(ref);
  api.resolve = async () => {
    throw new Error('Package disabled');
  };
  await binding.refresh();
  assert.equal(binding.getSnapshot().state.available, false);
  assert.throws(() => binding.captureDraft(draft), /Package disabled/);
});

test('new dialogue clears a draft expert without unbinding an existing session', async () => {
  const { binding, calls } = fixture();
  await binding.setContext(draft);
  await binding.select(ref);
  binding.clearDraft();
  assert.equal(binding.getSnapshot().state.expert, null);
  await binding.setContext({ ...draft, sessionId: 'session-1' });
  binding.clearDraft();
  assert.deepEqual(binding.getSnapshot().state, state);
  assert.deepEqual(calls, ['resolve', 'get:session-1']);
});

test('saving an expert blocks capture and a failed session mutation keeps its previous identity', async () => {
  const { binding, api } = fixture();
  let finish!: (value: PartnerExpertSnapshotT) => void;
  api.resolve = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await binding.setContext(draft);
  const selecting = binding.select(ref);
  assert.throws(() => binding.captureDraft(draft), /loading/);
  finish(expert);
  await selecting;
  await binding.setContext({ ...draft, sessionId: 'session-1' });
  api.set = async () => {
    throw new Error('Unable to persist');
  };
  await assert.rejects(binding.remove(), /Unable to persist/);
  assert.deepEqual(binding.getSnapshot().state, state);
  assert.equal(binding.getSnapshot().error, 'Unable to persist');
});

test('a catalog refresh during a draft selection revalidates the newly selected expert', async () => {
  const { binding, api } = fixture();
  const nextRef = { ...ref, expertId: 'editor' };
  const nextExpert = { ...expert, expert: { ...expert.expert, id: 'editor', name: 'Editor' } };
  await binding.setContext(draft);
  await binding.select(ref);
  let finish!: (value: PartnerExpertSnapshotT) => void;
  let pending = true;
  api.resolve = async (requested) => {
    if (requested.expertId !== 'editor') return expert;
    if (!pending) return nextExpert;
    pending = false;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const selecting = binding.select(nextRef);
  await binding.refresh();
  finish(nextExpert);
  await selecting;
  assert.deepEqual(binding.getSnapshot().state.expert, nextExpert);
  assert.deepEqual(binding.captureDraft(draft).expert, nextRef);
});

test('a deferred refresh cannot hide a failed expert selection', async () => {
  const { binding, api } = fixture();
  await binding.setContext(draft);
  await binding.select(ref);
  let fail!: (error: Error) => void;
  api.resolve = async (requested) => {
    if (requested.expertId === ref.expertId) return expert;
    return new Promise((_resolve, reject) => {
      fail = reject;
    });
  };
  const selecting = binding.select({ ...ref, expertId: 'missing' });
  await binding.refresh();
  fail(new Error('Expert missing'));
  await assert.rejects(selecting, /Expert missing/);
  assert.equal(binding.getSnapshot().error, 'Expert missing');
  assert.deepEqual(binding.getSnapshot().state.expert, expert);
});

test('the draft capture, refresh and create ACK keep prompt-only mode and the selected revision', async () => {
  const { api, binding } = fixture();
  const requests: SpaceExpertRefT[] = [];
  const configured = {
    ...expert,
    expert: { ...expert.expert, skillRef: 'document-processing' },
    useSkill: false,
  };
  api.resolve = async (next) => {
    requests.push(next);
    return configured;
  };
  await binding.setContext(draft);
  await binding.select({ ...ref, useSkill: false });
  await binding.refresh();
  const captured = binding.captureDraft(draft);
  assert.deepEqual(captured.expert, { ...ref, useSkill: false });
  assert.deepEqual(requests, [
    { ...ref, useSkill: false },
    { ...ref, useSkill: false },
  ]);
  assert.equal(binding.acceptCreatedSession(captured, 'created', configured), true);
  assert.equal(binding.getSnapshot().state.expert?.useSkill, false);
  assert.equal(binding.getSnapshot().state.expert?.expert.revision, 1);
});
