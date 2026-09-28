import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyLegacyRuntimeSecret } from '../kodax/runtime/runtime-credential-recovery.js';

test('legacy recovery requires an unambiguous fingerprint for the same Runtime instance', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'space-runtime-recovery-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const journal = path.join(dir, 'host-tool-invocations.json');
  const identity = { instanceId: 'space_instance_fixture' };
  const secret = 'space_secret_unchanged_fixture_for_recovery';
  const key = `stable:${identity.instanceId}:${createHash('sha256').update(secret).digest('hex')}`;
  const write = (keys: string[], version = 1) =>
    fs.writeFile(
      journal,
      JSON.stringify({
        version,
        clients: keys.map((key) => ({ key, invocations: [] })),
      }),
    );
  assert.equal(await verifyLegacyRuntimeSecret(identity, secret, journal), false);
  await write([key]);
  assert.equal(await verifyLegacyRuntimeSecret(identity, secret, journal), true);
  assert.equal(
    await verifyLegacyRuntimeSecret(identity, 'space_secret_stale_fixture_for_recovery', journal),
    false,
  );
  assert.equal(
    await verifyLegacyRuntimeSecret({ instanceId: 'another_instance' }, secret, journal),
    false,
  );
  await write([key, `stable:${identity.instanceId}:${'0'.repeat(64)}`]);
  assert.equal(await verifyLegacyRuntimeSecret(identity, secret, journal), false);
  await write([key], 2);
  assert.equal(await verifyLegacyRuntimeSecret(identity, secret, journal), false);
  await fs.writeFile(journal, '{corrupt');
  assert.equal(await verifyLegacyRuntimeSecret(identity, secret, journal), false);
});
