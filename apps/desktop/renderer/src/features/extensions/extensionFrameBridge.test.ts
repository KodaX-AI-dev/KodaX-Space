import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtensionFrameBridge, parseExtensionFrameRequest } from './extensionFrameBridge.js';

const request = {
  type: 'space-extension.request.v1',
  requestId: 'request-1',
  token: 'frame-epoch',
  method: 'expert.select',
  expertId: 'writing-mentor',
  revision: 1,
};

test('connector frame can browse declarations or open trusted configuration, never read secrets or apply writes', () => {
  const base = { type: request.type, requestId: request.requestId, token: request.token };
  assert.equal(
    parseExtensionFrameRequest({ ...base, method: 'connector.catalog' })?.method,
    'connector.catalog',
  );
  assert.equal(
    parseExtensionFrameRequest({
      ...base,
      method: 'connector.configure',
      connectorId: 'feishu-docs',
    })?.method,
    'connector.configure',
  );
  for (const extra of [
    { sessionId: 'foreign' },
    { profile: 'secret' },
    { extensionId: 'other' },
    { tokenSecret: 'secret' },
    { command: 'anything' },
  ])
    assert.equal(
      parseExtensionFrameRequest({
        ...base,
        method: 'connector.configure',
        connectorId: 'feishu-docs',
        ...extra,
      }),
      null,
    );
  assert.equal(
    parseExtensionFrameRequest({ ...base, method: 'connector.apply', connectorId: 'feishu-docs' }),
    null,
  );
});

test('only bounded extension methods are accepted', () => {
  assert.equal(parseExtensionFrameRequest(request)?.method, 'expert.select');
  assert.equal(parseExtensionFrameRequest({ ...request, method: 'ipc.invoke' }), null);
  assert.equal(parseExtensionFrameRequest({ ...request, requestId: 'x'.repeat(65) }), null);
  assert.equal(parseExtensionFrameRequest({ ...request, extensionId: 'foreign-package' }), null);
  assert.equal(parseExtensionFrameRequest({ ...request, revision: 0 }), null);
});

test('expert save accepts one bounded draft and rejects arbitrary fields or partial revision identity', () => {
  const save = {
    type: request.type,
    requestId: request.requestId,
    token: request.token,
    method: 'expert.save',
    values: {
      name: 'My editor',
      description: 'A reusable writing expert',
      prompt: 'Help me edit a document.',
      starterTasks: ['Check this outline'],
      skillRef: 'document-processing',
    },
  };
  assert.equal(parseExtensionFrameRequest(save)?.method, 'expert.save');
  assert.equal(
    parseExtensionFrameRequest({ ...save, expertId: 'user.editor', expectedRevision: 2 })?.method,
    'expert.save',
  );
  assert.equal(parseExtensionFrameRequest({ ...save, expertId: 'user.editor' }), null);
  assert.equal(parseExtensionFrameRequest({ ...save, expectedRevision: 2 }), null);
  assert.equal(parseExtensionFrameRequest({ ...save, extensionId: 'other' }), null);
  assert.equal(
    parseExtensionFrameRequest({ ...save, values: { ...save.values, skills: ['a', 'b'] } }),
    null,
  );
  for (const values of [
    { ...save.values, name: 'x'.repeat(81) },
    { ...save.values, description: 'x'.repeat(281) },
    { ...save.values, prompt: 'x'.repeat(8001) },
    { ...save.values, starterTasks: ['a', 'b', 'c', 'd', 'e'] },
    { ...save.values, starterTasks: ['x'.repeat(513)] },
    { ...save.values, skillRef: 'one two' },
  ])
    assert.equal(parseExtensionFrameRequest({ ...save, values }), null);
});

test('expert deletion accepts only a bounded identity and each method has its own fields', () => {
  const deleting = { ...request, method: 'expert.delete', expertId: 'user.editor' };
  assert.equal(parseExtensionFrameRequest(deleting)?.method, 'expert.delete');
  assert.equal(parseExtensionFrameRequest({ ...deleting, values: {} }), null);
  assert.equal(parseExtensionFrameRequest({ ...deleting, expectedRevision: 1 }), null);
  assert.equal(parseExtensionFrameRequest({ ...deleting, revision: 1_000_001 }), null);
  assert.equal(parseExtensionFrameRequest({ ...request, method: 'catalog.list' }), null);
  assert.equal(
    parseExtensionFrameRequest({ ...request, type: 'space-extension.request.v2' }),
    null,
  );
});

test('only expert selection can explicitly disable its configured Skill', () => {
  assert.equal(
    parseExtensionFrameRequest({ ...request, useSkill: false })?.method,
    'expert.select',
  );
  assert.equal(parseExtensionFrameRequest({ ...request, useSkill: true })?.method, 'expert.select');
  assert.equal(parseExtensionFrameRequest({ ...request, useSkill: 'false' }), null);
  assert.equal(
    parseExtensionFrameRequest({ ...request, method: 'expert.details', useSkill: false }),
    null,
  );
  assert.equal(
    parseExtensionFrameRequest({ ...request, method: 'expert.delete', useSkill: false }),
    null,
  );
});

test('forged sources, old tokens and duplicate request IDs cannot select an expert', async () => {
  const frame = {};
  const selected: string[] = [];
  const replies: unknown[] = [];
  const bridge = createExtensionFrameBridge({
    token: 'frame-epoch',
    source: () => frame,
    dispatch: async (input) => {
      selected.push(input.method);
      return { selected: true };
    },
    reply: (message) => replies.push(message),
  });
  await bridge.receive({ source: {}, data: request });
  await bridge.receive({ source: frame, data: { ...request, token: 'old-epoch' } });
  await bridge.receive({ source: frame, data: request });
  await bridge.receive({ source: frame, data: request });
  assert.deepEqual(selected, ['expert.select']);
  assert.equal(replies.length, 1);
});

test('closing or rebinding the frame suppresses late replies and all subsequent requests', async () => {
  const frame = {};
  const replies: unknown[] = [];
  let resolve!: (value: unknown) => void;
  const bridge = createExtensionFrameBridge({
    token: 'frame-epoch',
    source: () => frame,
    dispatch: () =>
      new Promise((next) => {
        resolve = next;
      }),
    reply: (message) => replies.push(message),
  });
  const pending = bridge.receive({ source: frame, data: request });
  bridge.dispose();
  resolve({ selected: true });
  await pending;
  await bridge.receive({ source: frame, data: { ...request, requestId: 'request-2' } });
  assert.deepEqual(replies, []);
});
