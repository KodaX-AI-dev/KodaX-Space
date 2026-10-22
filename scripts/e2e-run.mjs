import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runNodeOnIsolatedDesktop } from './e2e-isolated-desktop.mjs';

const require = createRequire(import.meta.url);
const native = spawnSync(process.execPath, ['scripts/ensure-sqlite-native.mjs', 'electron'], {
  stdio: 'inherit',
  windowsHide: true,
});
if (native.error) throw native.error;
if (native.status !== 0) process.exit(native.status ?? 1);
const cli = require.resolve('@playwright/test/cli');
const args = ['test', ...process.argv.slice(2)];
if (process.platform === 'win32') {
  process.exitCode = await runNodeOnIsolatedDesktop(cli, args);
} else {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
