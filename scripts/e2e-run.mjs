import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runNodeOnIsolatedDesktop } from './e2e-isolated-desktop.mjs';

if (process.env.SPACE_E2E_PACKAGED_EXECUTABLE) {
  throw new Error(
    'Use SPACE_E2E_EXECUTABLE for packaged tests; SPACE_E2E_PACKAGED_EXECUTABLE is not supported.',
  );
}

process.stdout.write(
  `[e2e] ${process.env.SPACE_E2E_EXECUTABLE ? `packaged: ${process.env.SPACE_E2E_EXECUTABLE}` : 'source Electron'}\n`,
);
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
