// Real Electron/DPAPI verification using synthetic secrets and a fresh temporary profile.
// Run manually on Windows: node scripts/smoke-windows-credential-vault.mjs
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const worker = String.raw`
const { app, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const stage = process.argv[2];
const account = 'smoke_sync_account';
const nextAccount = 'smoke_async_account';
const fakeSecret = 'synthetic-smoke-fixture-never-a-real-credential';
const nextSecret = 'synthetic-second-smoke-fixture-for-restart';
const vaultFile = path.join(__dirname, 'profile', 'space', 'provider-credentials.v1.json');
app.setPath('userData', path.join(__dirname, 'electron-profile'));
app.setPath('sessionData', path.join(__dirname, 'electron-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  if (process.platform !== 'win32') throw new Error('Windows-only smoke');
  if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('DPAPI unavailable');
  let nativeUnavailable = false;
  try { await import('@napi-rs/keyring/keytar.js'); }
  catch (error) { nativeUnavailable = error.code === 'ERR_MODULE_NOT_FOUND'; }
  if (!nativeUnavailable) throw new Error('Isolation failed: keyring is resolvable');
  if (stage === 'seed-sync') {
    const ciphertext = safeStorage.encryptString(fakeSecret);
    const decoded = await safeStorage.decryptStringAsync(ciphertext);
    if (decoded.result !== fakeSecret) throw new Error('Sync-to-async decrypt mismatch');
    await fs.mkdir(path.dirname(vaultFile), { recursive: true });
    await fs.writeFile(vaultFile, JSON.stringify({
      version: 1, records: { [account]: ciphertext.toString('base64') }, revokedLegacyAccounts: [],
    }));
  } else {
    const keychain = require('./keychain.cjs');
    if ((await keychain.getBackendStatus()) !== 'keychain') throw new Error('Vault unavailable');
    if ((await keychain.getPersistentKey(account)) !== fakeSecret) throw new Error('Legacy recovery failed');
    if (stage === 'write-async') {
      if ((await keychain.getPersistentKey(nextAccount)) !== undefined) throw new Error('Unexpected fixture');
      await keychain.setPersistentKey(nextAccount, nextSecret);
    }
    if ((await keychain.getPersistentKey(nextAccount)) !== nextSecret) throw new Error('Async recovery failed');
  }
  const disk = await fs.readFile(vaultFile, 'utf8');
  if (disk.includes(fakeSecret) || disk.includes(nextSecret)) throw new Error('Plaintext in vault');
  await fs.writeFile(path.join(__dirname, stage + '.json'), JSON.stringify({
    stage, ok: true, nativeUnavailable, ciphertextOnly: true, electron: process.versions.electron,
  }));
  app.exit(0);
}).catch(() => {
  // Do not let an assertion or native failure print secret material.
  process.stderr.write('Isolated credential smoke failed at ' + stage + '\n');
  app.exit(1);
});
`;

async function main() {
  if (process.platform !== 'win32') {
    process.stdout.write('Skipped: Windows Electron/DPAPI smoke.\n');
    return;
  }
  const tempBase = path.resolve(os.tmpdir());
  const root = await mkdtemp(path.join(tempBase, 'kodax-win-credential-smoke-'));
  // Verify the cleanup target before running stages that can fail.
  if (
    path.dirname(path.resolve(root)) !== tempBase ||
    !path.basename(root).startsWith('kodax-win-credential-smoke-')
  ) {
    throw new Error('Refusing to clean a directory outside the isolated smoke profile.');
  }
  try {
    await build({
      entryPoints: [path.join(workspace, 'apps/desktop/electron/providers/keychain.ts')],
      outfile: path.join(root, 'keychain.cjs'),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      external: ['electron'],
    });
    await mkdir(path.join(root, 'electron-profile'), { recursive: true });
    await writeFile(path.join(root, 'main.cjs'), worker);
    const env = { ...process.env, KODAX_PROFILE_DIR: path.join(root, 'profile') };
    delete env.KODAX_TEST_ONBOARDING;
    delete env.ELECTRON_RUN_AS_NODE;
    // Each stage is a fresh Electron process; no in-memory secret cache can pass this smoke.
    for (const stage of ['seed-sync', 'write-async', 'read-restart']) {
      await promisify(execFile)(
        path.join(workspace, 'node_modules/electron/dist/electron.exe'),
        [path.join(root, 'main.cjs'), stage],
        { env, windowsHide: true, timeout: 30_000, maxBuffer: 128 * 1024 },
      );
      process.stdout.write(`${await readFile(path.join(root, `${stage}.json`), 'utf8')}\n`);
    }
  } finally {
    // Only remove the freshly created, resolved direct child of the OS temp directory.
    await rm(root, { recursive: true, force: true });
  }
}

await main();
