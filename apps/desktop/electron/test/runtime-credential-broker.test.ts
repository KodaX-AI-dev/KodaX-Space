import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createScopedRuntimeCredentialBroker } from '../providers/runtime-credential-broker.js';

test('physical proof is forwarded and invalidation fences both pending and future replies', async () => {
  let epoch = 0, release!: () => void, started!: () => void, reads = 0;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const broker = createScopedRuntimeCredentialBroker({ leaseBinding: { leaseId: 'l' }, providers: ['p'], sessionId: 's',
    authorize: () => true, requireConnectionProof: true, credentialEpoch: () => epoch,
    readCredential: async (_provider, proof) => { assert.equal(proof, 'a'.repeat(64)); reads++; started(); await new Promise<void>(resolve => { release = resolve; }); return 'secret'; } });
  const request = { requestId: 'r', leaseId: 'l', provider: 'p', sessionId: 's', purpose: 'primary' as const, target: { kind: 'run' as const, runId: 'run' } };
  assert.equal(await broker(request), undefined); assert.equal(reads, 0);
  const pending = broker({ ...request, connectionFingerprint: 'a'.repeat(64) }); await ready;
  epoch++; release(); assert.equal(await pending, undefined);
  assert.equal(await broker({ ...request, connectionFingerprint: 'a'.repeat(64) }), undefined);
  assert.equal(reads, 1);
});

test('scoped Runtime credential broker applies shared lease, Session, Provider, and policy fences', async () => {
  const reads: string[] = [];
  const leaseBinding: { leaseId?: string } = { leaseId: 'lease-1' };
  const broker = createScopedRuntimeCredentialBroker({
    leaseBinding,
    providers: ['anthropic'],
    sessionId: 'session-1',
    authorize: (request) => request.purpose === 'compaction',
    readCredential: async (provider) => {
      reads.push(provider);
      return 'secret';
    },
  });
  const request = {
    requestId: 'request-1',
    leaseId: 'lease-1',
    provider: 'anthropic',
    sessionId: 'session-1',
    purpose: 'compaction' as const,
    target: {
      kind: 'operation' as const,
      operationId: 'operation-1',
      operation: 'session.compact' as const,
    },
  };

  assert.equal(await broker(request), 'secret');
  assert.equal(await broker({ ...request, leaseId: 'other' }), undefined);
  assert.equal(await broker({ ...request, sessionId: 'other' }), undefined);
  assert.equal(await broker({ ...request, provider: 'openai' }), undefined);
  assert.equal(await broker({ ...request, purpose: 'sidecar' }), undefined);
  assert.deepEqual(reads, ['anthropic']);
});
