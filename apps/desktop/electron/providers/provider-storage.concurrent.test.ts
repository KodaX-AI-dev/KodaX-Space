import assert from 'node:assert/strict';
import test from 'node:test';
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
