import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('concurrent first credential reads preserve the environment account without CAS conflicts', async (t) => {
  const testId = `credential-first-reads-${randomUUID()}`;
  process.env.KODAX_TEST_ONBOARDING = testId;
  const root = path.join(os.tmpdir(), `kodax-test-${testId}`);
  process.env.KODAX_HOME = root;
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'original-environment-fixture';
  t.after(async () => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'config.json'), '{}');
  const [storage, credentials, sdk] = await Promise.all([
    import('./provider-storage.js'),
    import('./credentials.js'),
    import('@kodax-ai/kodax/llm'),
  ]);
  await import('@kodax-ai/kodax/repl');
  const configuration = path.join(root, 'config.json');
  const connection = { name: 'coherent-read-fixture', protocol: 'openai',
    baseUrl: 'https://coherent.invalid/v1', apiKeyEnv: 'COHERENT_FIXTURE_KEY', model: 'fixture' };
  await writeFile(configuration, JSON.stringify({ customProviders: [connection] }));
  for (const hold of [80, 400]) {
    const writer = promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
    import { withCoreConfigWriteLock } from '@kodax-ai/kodax/repl';
    import { readFileSync, writeFileSync } from 'node:fs';
    const file = ${JSON.stringify(configuration)};
    withCoreConfigWriteLock(file, () => {
      const original = readFileSync(file, 'utf8');
      try {
        writeFileSync(file, '{');
        process.stdout.write('configuration-locked');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${hold});
      } finally { writeFileSync(file, original); }
    });
    `], { windowsHide: true, timeout: 15_000 });
    await new Promise<void>((resolve, reject) => {
      writer.child.stdout!.once('data', () => resolve());
      writer.catch(reject);
    });
    try {
      if (hold === 80) assert.deepEqual(await storage.configuredConnection(connection.name), connection);
      else await assert.rejects(storage.configuredConnection(connection.name), /configuration busy/);
    } finally { await writer; }
    assert.deepEqual(await storage.configuredConnection(connection.name), connection);
  }
  const binding = await storage.providerStorageBinding('openai');
  const shared = sdk.createFileProviderCredentialStore(path.join(root, 'auth.json'));
  await shared.setApiKey(binding, 'different-cli-fixture', null);
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, () => storage.getKey('openai')),
  );
  assert.deepEqual(
    results.map((result) => result.status),
    Array(12).fill('fulfilled'),
  );
  assert.ok(results.every((result) => result.status === 'fulfilled' && result.value === undefined));
  assert.equal((await storage.describeProviderCredential('openai')).scope, 'space');
  assert.equal(await credentials.readProviderCredential('openai'), 'original-environment-fixture');
  assert.doesNotMatch(
    await readFile(path.join(root, 'auth.json'), 'utf8'),
    /original-environment-fixture/,
  );
  delete process.env.OPENAI_API_KEY;
  assert.equal(
    await credentials.readProviderCredential('openai'),
    undefined,
    'a vanished pinned environment must not fall back to the CLI account',
  );
});
