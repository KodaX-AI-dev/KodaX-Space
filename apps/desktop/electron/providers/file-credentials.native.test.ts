import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

// Run the production, non-onboarding paths on the host OS. A forbidden backend
// access is recorded even if a legacy adapter catches its import failure.
test(`fresh credentials and a restarted client need no OS vault on ${process.platform}/${process.arch}`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-file-native-'));
  try {
    const driver = path.join(root, 'consumer.mjs');
    await writeFile(driver, nativeConsumer());
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      KODAX_HOME: root,
    };
    delete env.KODAX_TEST_ONBOARDING;
    // Keep the parent suite's preload from re-enabling onboarding in this child.
    delete env.NODE_OPTIONS;
    const launch = async (phase: string) => {
      const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', driver], {
        env: { ...env, SPACE_CREDENTIAL_PHASE: phase },
        windowsHide: true,
        timeout: 30_000,
      });
      return JSON.parse(result.stdout) as Record<string, string>;
    };
    const first = await launch('save');
    const restarted = await launch('read');
    assert.deepEqual(restarted, first, 'a new process must retain the original authority');
    assert.equal(first.backend, 'file');
    await assert.rejects(readFile(path.join(root, 'forbidden-backends.txt')), { code: 'ENOENT' });
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('space-file-native-'));
    await rm(root, { recursive: true, force: true });
  }
});

function nativeConsumer(): string {
  const storage = new URL('./provider-storage.ts', import.meta.url).href;
  const identity = new URL('../kodax/runtime/runtime-client-identity.ts', import.meta.url).href;
  return `
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import { appendFileSync } from 'node:fs';
    import { stat } from 'node:fs/promises';
    import { registerHooks } from 'node:module';
    import path from 'node:path';
    assert.equal(process.env.KODAX_TEST_ONBOARDING, undefined);
    const root = process.env.KODAX_HOME;
    registerHooks({ resolve(name, context, next) {
      if (name === 'electron' || name === 'keytar' || name.startsWith('@napi-rs/keyring')) {
        appendFileSync(path.join(root, 'forbidden-backends.txt'), name + '\\n');
        throw new Error('OS credential backend must not be loaded');
      }
      return next(name, context);
    }});
    const { KODAX_PROVIDER_SNAPSHOTS } = await import(${JSON.stringify(import.meta.resolve('@kodax-ai/kodax/llm'))});
    for (const item of Object.values(KODAX_PROVIDER_SNAPSHOTS)) delete process.env[item.apiKeyEnv];
    const storage = await import(${JSON.stringify(storage)});
    await storage.initializeProviderCredentialStorage();
    if (process.env.SPACE_CREDENTIAL_PHASE === 'save') {
      const expected = await storage.describeProviderCredential('anthropic');
      assert.equal(expected.configured, false);
      await storage.setKey('anthropic', 'native-file-fixture', expected);
    }
    const state = await storage.describeProviderCredential('anthropic');
    assert.equal(state.origin, 'file');
    assert.equal(state.migration, 'none');
    assert.equal(await storage.getKey('anthropic'), 'native-file-fixture');
    const { RuntimeClientIdentityStore } = await import(${JSON.stringify(identity)});
    const client = await new RuntimeClientIdentityStore(path.join(root, 'space', 'runtime-client-identity.json'),
      path.join(root, 'space')).openInstance({ name: 'native-acceptance', version: 'fixture' });
    if (process.platform !== 'win32') assert.equal((await stat(path.join(root, 'auth.json'))).mode & 0o077, 0);
    process.stdout.write(JSON.stringify({ backend: await storage.getBackendStatus(),
      clientId: client.clientId, instanceId: client.instanceId,
      secretDigest: createHash('sha256').update(client.instanceSecret).digest('hex') }));
  `;
}
