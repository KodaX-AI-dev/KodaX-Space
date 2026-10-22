import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runNodeOnIsolatedDesktop } from './e2e-isolated-desktop.mjs';

// Some CI images set TEMP to the 8.3 short form (C:\Users\RUNNER~1\...).
// Path-derived identifiers (SDK workflow run directories, session slugs) are
// built from these paths and mangle on the tilde form; real user
// environments carry the long form, so normalize before spawning anything.
for (const key of ['TMP', 'TEMP']) {
  const value = process.env[key];
  if (value && value.includes('~') && existsSync(value)) {
    process.env[key] = realpathSync(value);
  }
}

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
