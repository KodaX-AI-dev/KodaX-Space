import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function startLockedWriter(file: string, release: string) {
  return promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
    import { withCoreConfigWriteLock } from '@kodax-ai/kodax/repl';
    import { existsSync, readFileSync, writeFileSync } from 'node:fs';
    const file = ${JSON.stringify(file)}, release = ${JSON.stringify(release)};
    withCoreConfigWriteLock(file, () => {
      const original = readFileSync(file, 'utf8');
      try {
        writeFileSync(file, '{');
        process.stdout.write('configuration-locked');
        while (!existsSync(release)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      } finally { writeFileSync(file, original); }
    });
  `], { windowsHide: true, timeout: 15_000 });
}

test('provider configuration rejects a live partial writer and reads its complete result after release', async (t) => {
  const testId = `configuration-lock-${randomUUID()}`;
  const root = path.join(os.tmpdir(), `kodax-test-${testId}`);
  process.env.KODAX_TEST_ONBOARDING = testId;
  process.env.KODAX_HOME = root;
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(root, { recursive: true });
  const file = path.join(root, 'config.json'), release = path.join(root, 'release-writer');
  const connection = { name: 'coherent-read-fixture', protocol: 'openai',
    baseUrl: 'https://coherent.invalid/v1', apiKeyEnv: 'COHERENT_FIXTURE_KEY', model: 'fixture' };
  await writeFile(file, JSON.stringify({ customProviders: [connection] }));
  const storage = await import('./provider-storage.js');
  const writer = startLockedWriter(file, release);
  try {
    await new Promise<void>((resolve, reject) => {
      writer.child.stdout!.once('data', () => resolve());
      writer.then(() => reject(new Error('Writer exited before readiness')), reject);
    });
    await assert.rejects(storage.configuredConnection(connection.name), /configuration busy/);
  } finally {
    await writeFile(release, 'release');
    await writer;
  }
  assert.deepEqual(await storage.configuredConnection(connection.name), connection);
});
