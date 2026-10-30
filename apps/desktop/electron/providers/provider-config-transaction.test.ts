import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('partial provider rename write preserves the committed configuration and does not move credentials', async t => {
  const suffix = `space-rename-partial-${randomUUID()}`;
  const root = path.join(os.tmpdir(), `kodax-test-${suffix}`);
  process.env.KODAX_TEST_ONBOARDING = suffix;
  process.env.KODAX_HOME = root;
  const provider = { name: 'before', protocol: 'openai', baseUrl: 'https://same.invalid/v1', apiKeyEnv: 'FIXTURE', model: 'm' };
  const file = path.join(root, 'config.json'), original = JSON.stringify({ provider: 'before', customProviders: [provider] });
  try {
    await mkdir(root, { recursive: true }); await writeFile(file, original);
    const { updateKodaxConfigCustomProvider } = await import('../kodax/user-config.js');
    const write = fs.writeFileSync;
    t.mock.method(fs, 'writeFileSync', ((target: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions) => {
      if (String(data).includes('"name": "after"')) {
        write(target, '{', options); throw Object.assign(new Error('Fixture disk full'), { code: 'ENOSPC' });
      }
      write(target, data, options);
    }) as typeof fs.writeFileSync);
    syncBuiltinESMExports();
    let moved = false;
    await assert.rejects(updateKodaxConfigCustomProvider('before', { displayName: 'after', protocol: 'openai',
      baseUrl: provider.baseUrl, apiKeyEnv: 'FIXTURE', defaultModel: 'm' }, async () => { moved = true; }), /disk full/);
    assert.equal(await readFile(file, 'utf8'), original);
    assert.equal(moved, false);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('kodax-test-space-rename-partial-'));
    await rm(root, { recursive: true, force: true });
  }
});
