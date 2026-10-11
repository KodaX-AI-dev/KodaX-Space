import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RuntimeInputAuthorizationStore } from './runtime-input-authorization-store.js';

test('reattachment retains captured authority and isolates replacement Hosts and clients', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'space-authorization-'));
  const file = path.join(dir, 'authorizations');
  const store = new RuntimeInputAuthorizationStore(file);
  const authorization = {
    credential: { leaseId: 'lease', mode: 'scoped' as const, providers: ['primary', 'fallback'] },
    hostTools: { leaseId: 'tools' },
    workflowHostPolicy: { maxAgents: 3, tokenBudget: 100 },
  };
  await store.capture('host', 'client', { sessionId: 'session', inputId: 'input', authorization });
  const restored = new RuntimeInputAuthorizationStore(file);
  assert.deepEqual(await restored.read('host', 'client', 'session', 'input'), authorization);
  for (const [host, client, session] of [
    ['other-host', 'client', 'session'],
    ['host', 'other-client', 'session'],
    ['host', 'client', 'other-session'],
  ]) {
    assert.equal(await restored.read(host, client, session, 'input'), undefined);
  }
});

test('captured input authority is immutable and failed writes do not poison later inputs', async () => {
  const store = new RuntimeInputAuthorizationStore();
  const authorization = { workflowHostPolicy: { maxAgents: 3, tokenBudget: 0 } };
  await store.capture('host', 'client', { sessionId: 's', inputId: 'i', authorization });
  await assert.rejects(
    store.capture('host', 'client', {
      sessionId: 's',
      inputId: 'i',
      authorization: { workflowHostPolicy: { maxAgents: 4 } },
    }),
    /cannot be replaced/,
  );
  await store.capture('host', 'client', { sessionId: 's', inputId: 'next', authorization });
  assert.deepEqual(await store.read('host', 'client', 's', 'i'), authorization);
  assert.deepEqual(await store.read('host', 'client', 's', 'next'), authorization);
});
