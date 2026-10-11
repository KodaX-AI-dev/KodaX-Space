// Exercise the published SDK through the packaged Space UI and public IPC.
// Source and package builds share acceptance cases; no private SDK storage
// or Run lifecycle state is written to manufacture recovery evidence.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNodeOnIsolatedDesktop } from '../scripts/e2e-isolated-desktop.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.join(
  root,
  process.env.SPACE_PACK_OUT_DIR || 'out',
  'win-unpacked',
  'KodaX Space.exe',
);
if (!existsSync(executable)) throw new Error(`Packaged executable is missing: ${executable}`);
const cli = require.resolve('@playwright/test/cli');
const args = ['test', 'tests/e2e/sdk-unified-contract.spec.ts'];
const env = { ...process.env, SPACE_E2E_EXECUTABLE: executable };
delete env.ELECTRON_RUN_AS_NODE;
process.chdir(root);
if (process.platform === 'win32') {
  process.exitCode = await runNodeOnIsolatedDesktop(cli, args, { env });
} else {
  const result = spawnSync(process.execPath, [cli, ...args], {
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
