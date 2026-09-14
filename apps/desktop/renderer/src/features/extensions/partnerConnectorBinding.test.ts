import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  PartnerConnectorSelectionT,
  PartnerConnectorStateT,
} from '@kodax-space/space-ipc-schema';
import { createPartnerConnectorBinding } from './partnerConnectorBinding.js';

const draft = { surface: 'partner' as const, projectRoot: '/project', sessionId: null };
const selection: PartnerConnectorSelectionT = {
  extensionId: 'kodax.partner-library',
  connectorId: 'feishu-docs',
  connectionId: '00000000-0000-4000-8000-000000000001',
  connectionRevision: 1,
  documents: [{ url: 'https://demo.feishu.cn/docx/Doc1', access: 'read' }],
};
const stateFor = (items: readonly PartnerConnectorSelectionT[]): PartnerConnectorStateT => ({
  connectors: items.map((binding) => ({
    binding: { ...binding, name: '飞书文档', accountLabel: 'Test' },
    available: true,
  })),
});
function fixture() {
  const calls: string[] = [];
  const api = {
    resolve: async (_project: string, items: PartnerConnectorSelectionT[]) => {
      calls.push('resolve');
      return stateFor(items);
    },
    get: async (id: string) => {
      calls.push(`get:${id}`);
      return stateFor([selection]);
    },
    set: async (id: string, items: PartnerConnectorSelectionT[]) => {
      calls.push(`set:${id}`);
      return stateFor(items);
    },
  };
  return { api, calls, binding: createPartnerConnectorBinding(api) };
}
test('selecting a connector only configures its exact draft scope, never creates or sends', async () => {
  const { binding, calls } = fixture();
  await binding.setContext(draft);
  await binding.select(selection);
  assert.deepEqual(binding.captureDraft(draft).connectors, [selection]);
  assert.deepEqual(calls, ['resolve']);
  await binding.remove(selection.connectionId);
  assert.deepEqual(binding.captureDraft(draft).connectors, []);
});
test('clear new conversation invalidates a captured draft and keeps old ACK from adopting it', async () => {
  const { binding } = fixture();
  await binding.setContext(draft);
  await binding.select(selection);
  const captured = binding.captureDraft(draft);
  assert.equal(binding.isCaptureCurrent(captured), true);
  binding.clearDraft();
  assert.equal(binding.acceptCreatedSession(captured, 'old', []), false);
  assert.equal(binding.getSnapshot().context.sessionId, null);
});
test('late configuration cannot cross projects, even when switching back', async () => {
  const { api, binding } = fixture();
  let resolve!: (state: PartnerConnectorStateT) => void;
  api.resolve = () =>
    new Promise((next) => {
      resolve = next;
    });
  await binding.setContext(draft);
  const pending = binding.select(selection);
  await binding.setContext({ ...draft, projectRoot: '/other' });
  await binding.setContext(draft);
  resolve(stateFor([selection]));
  await assert.rejects(pending, /scope/);
  assert.deepEqual(binding.getSnapshot().state.connectors, []);
});
test('session get/set is durable and unavailable selection blocks a new draft send', async () => {
  const { binding, api, calls } = fixture();
  await binding.setContext({ ...draft, sessionId: 's1' });
  await binding.remove(selection.connectionId);
  assert.deepEqual(calls, ['get:s1', 'set:s1']);
  await binding.setContext(draft);
  api.resolve = async () => ({
    connectors: [
      {
        binding: { ...selection, name: '飞书文档', accountLabel: 'Test' },
        available: false,
        unavailableReason: 'Disconnected',
      },
    ],
  });
  await binding.select(selection);
  assert.throws(() => binding.captureDraft(draft), /Disconnected/);
});

test('a deferred refresh does not hide a failed connector mutation', async () => {
  const { api, binding } = fixture();
  let reject!: (reason: Error) => void;
  await binding.setContext({ ...draft, sessionId: 's1' });
  api.set = () =>
    new Promise((_resolve, next) => {
      reject = next;
    });
  const pending = binding.remove(selection.connectionId);
  await binding.refresh();
  reject(new Error('Save failed'));
  await assert.rejects(pending, /Save failed/);
  assert.equal(binding.getSnapshot().error, 'Save failed');
  assert.equal(
    binding.getSnapshot().state.connectors[0]?.binding.connectionId,
    selection.connectionId,
  );
});

test('push wins over stale get, failed refresh preserves an unavailable binding, and Coder has no requests', async () => {
  const { api, binding, calls } = fixture();
  let finish!: (state: PartnerConnectorStateT) => void;
  await binding.setContext({ surface: 'code', projectRoot: '/project', sessionId: 'coder' });
  assert.deepEqual(calls, []);
  assert.throws(() => binding.captureDraft(draft), /scope/);
  api.get = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const load = binding.setContext({ ...draft, sessionId: 's1' });
  binding.receive('foreign', stateFor([selection]));
  binding.receive('s1', { connectors: [] });
  finish(stateFor([selection]));
  await load;
  assert.deepEqual(binding.getSnapshot().state.connectors, []);
  api.get = async () => stateFor([selection]);
  await binding.refresh();
  api.get = async () => {
    throw new Error('Unavailable profile');
  };
  await binding.refresh();
  assert.equal(binding.getSnapshot().state.connectors[0]?.available, false);
  assert.equal(binding.getSnapshot().error, 'Unavailable profile');
});

test('multiple account selections are replaced by identity, bounded saves block draft capture and subscriptions stop cleanly', async () => {
  const { api, binding } = fixture();
  let published = 0;
  const stop = binding.subscribe(() => {
    published++;
  });
  await binding.setContext(draft);
  await binding.select(selection);
  const second = { ...selection, connectionId: '00000000-0000-4000-8000-000000000002' };
  await binding.select(second);
  assert.equal(binding.captureDraft(draft).connectors.length, 2);
  await binding.select({ ...selection, documents: [] });
  assert.equal(binding.captureDraft(draft).connectors.length, 2);
  let finish!: (state: PartnerConnectorStateT) => void;
  api.resolve = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = binding.select(second);
  assert.throws(() => binding.captureDraft(draft), /finish loading/);
  await assert.rejects(binding.remove(selection.connectionId), /still being saved/);
  finish(stateFor([second]));
  await pending;
  const before = published;
  stop();
  binding.clearDraft();
  assert.equal(published, before);
});

test('two unavailable draft connectors can be removed individually without resolving or reconnecting the remaining one', async () => {
  const { api, binding } = fixture();
  let resolves = 0;
  await binding.setContext(draft);
  await binding.select(selection);
  const second = { ...selection, connectionId: '00000000-0000-4000-8000-000000000002' };
  await binding.select(second);
  api.resolve = async () => {
    resolves++;
    throw new Error('Both accounts are disconnected');
  };
  await binding.refresh();
  assert.equal(resolves, 1);
  assert.equal(
    binding.getSnapshot().state.connectors.every((item) => !item.available),
    true,
  );
  await binding.remove(selection.connectionId);
  assert.equal(resolves, 1);
  assert.equal(
    binding.getSnapshot().state.connectors[0]?.binding.connectionId,
    second.connectionId,
  );
  assert.equal(binding.getSnapshot().state.connectors[0]?.available, false);
  await binding.remove(second.connectionId);
  assert.equal(resolves, 1);
  assert.deepEqual(binding.captureDraft(draft).connectors, []);
  await assert.rejects(binding.select(selection), /disconnected/);
  assert.equal(resolves, 2);
});

test('session selections cannot replace unresolved or failed scope and preserve other accounts after retry', async () => {
  const { api, binding, calls } = fixture();
  const second = { ...selection, connectionId: '00000000-0000-4000-8000-000000000002' };
  let rejectLoad!: (reason: Error) => void;
  api.get = () =>
    new Promise((_resolve, reject) => {
      rejectLoad = reject;
    });
  const loading = binding.setContext({ ...draft, sessionId: 's1' });
  await assert.rejects(binding.select({ ...selection, documents: [] }), /loading/);
  await assert.rejects(binding.remove(selection.connectionId), /loading/);
  assert.deepEqual(calls, []);
  rejectLoad(new Error('Cannot load saved scope'));
  await loading;
  await assert.rejects(binding.select(selection), /Cannot load saved scope/);
  assert.deepEqual(calls, []);
  api.get = async () => stateFor([selection, second]);
  await binding.refresh();
  await binding.select({ ...selection, documents: [] });
  assert.deepEqual(
    binding.getSnapshot().state,
    stateFor([second, { ...selection, documents: [] }]),
  );
  assert.deepEqual(calls, ['set:s1']);
});

test('refresh synchronously prevents saving stale selections before a subscriber renders', async () => {
  const { api, binding, calls } = fixture();
  await binding.setContext({ ...draft, sessionId: 's1' });
  let finish!: (state: PartnerConnectorStateT) => void;
  api.get = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const refreshing = binding.refresh();
  await assert.rejects(binding.select({ ...selection, documents: [] }), /loading/);
  assert.deepEqual(calls, ['get:s1']);
  finish(stateFor([selection]));
  await refreshing;
  assert.deepEqual(binding.getSnapshot().state, stateFor([selection]));
});
