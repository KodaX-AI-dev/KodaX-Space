import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

for (const platform of ['win32', 'darwin']) test(`${platform} legacy storage recovers on the next deliberate lookup without a relaunch`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-legacy-retry-'));
  try {
    const bundled = path.join(root, 'keychain.mjs'), electron = path.join(root, 'electron.mjs');
    const keyring = path.join(root, 'keyring.mjs'), loader = path.join(root, 'loader.mjs');
    await build({ entryPoints: [fileURLToPath(new URL('./keychain.ts', import.meta.url))],
      outfile: bundled, bundle: true, platform: 'node', format: 'esm', external: ['electron'] });
    await writeFile(electron, `export const safeStorage={isEncryptionAvailable:()=>process.env.FIXTURE_READY==='1',isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async value=>Buffer.from(value),decryptStringAsync:async value=>({result:value.toString(),shouldReEncrypt:false})};`);
    await writeFile(keyring, `export async function findCredentials(){return []}export async function getPassword(){if(process.env.FIXTURE_READY!=='1')throw new Error('temporarily locked');return 'legacy-fixture'};`);
    await writeFile(loader, `export async function resolve(name,context,next){const urls={electron:${JSON.stringify(pathToFileURL(electron).href)},'@napi-rs/keyring/keytar.js':${JSON.stringify(pathToFileURL(keyring).href)}};return urls[name]?{url:urls[name],shortCircuit:true}:next(name,context);}`);
    const script = `import assert from 'node:assert/strict';import {register} from 'node:module';register(${JSON.stringify(pathToFileURL(loader).href)});Object.defineProperty(process,'platform',{value:${JSON.stringify(platform)}});const {getPersistentKey}=await import(${JSON.stringify(pathToFileURL(bundled).href)});await assert.rejects(getPersistentKey('owned-fixture'));process.env.FIXTURE_READY='1';assert.equal(await getPersistentKey('owned-fixture'),'legacy-fixture');process.stdout.write('recovered');`;
    const env: NodeJS.ProcessEnv = { ...process.env, KODAX_HOME: root, FIXTURE_READY: '0' };
    delete env.KODAX_TEST_ONBOARDING;
    const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], { env, windowsHide: true, timeout: 15000 });
    assert.equal(result.stdout, 'recovered');
  } finally {
    assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('space-legacy-retry-'));
    await rm(root, { recursive: true, force: true });
  }
});
