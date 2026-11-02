import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireRuntimeOAuthCredential } from './runtime-credential-context.js';

test('a negotiated rejected OAuth token refreshes the same session and carries its stable identity', async () => {
  const calls: string[] = [];
  const session = {
    replayIdentity: 'a'.repeat(64),
    acquire: async () => {
      calls.push('acquire');
      return 'test-token';
    },
    recoverRejectedCredential: async (fingerprint: string) => {
      calls.push(fingerprint);
    },
  };
  const serialized = await acquireRuntimeOAuthCredential('provider', session, {
    credentialContextVersion: 1,
    rejectedCredentialFingerprint: 'b'.repeat(64),
  });
  assert.deepEqual(calls, ['b'.repeat(64), 'acquire']);
  assert.notEqual(serialized, 'test-token');
  calls.length = 0;
  assert.equal(await acquireRuntimeOAuthCredential('provider', session), 'test-token');
  await assert.rejects(
    acquireRuntimeOAuthCredential('provider', session, {
      rejectedCredentialFingerprint: 'b'.repeat(64),
    }),
    /negotiated/,
  );
  // This helper only supplies authority; it never replays a generation request.
});
