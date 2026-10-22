import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(new URL('./run-isolated-desktop.ps1', import.meta.url));
const quotePowerShell = (value) => `'${String(value).replaceAll("'", "''")}'`;

/** Run real Windows GUI tests without switching or changing the user's desktop. */
export async function runNodeOnIsolatedDesktop(script, args, options = {}) {
  const log = path.resolve(
    options.log ?? `artifacts/diagnostics/e2e/space-e2e-${process.pid}-${Date.now()}.log`,
  );
  mkdirSync(path.dirname(log), { recursive: true });
  const command =
    `& ${quotePowerShell(launcher)} -NodeScript ${quotePowerShell(script)} ` +
    `-ScriptArguments @(${args.map(quotePowerShell).join(',')}) -LogPath ${quotePowerShell(log)} -OwnerPid ${process.pid}`;
  const availableShell = spawnSync('where.exe', ['pwsh.exe'], {
    windowsHide: true,
    encoding: 'utf8',
  });
  const shell =
    availableShell.status === 0 ? availableShell.stdout.trim().split(/\r?\n/)[0] : 'powershell.exe';
  const child = spawn(
    shell,
    ['-NoProfile', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
    {
      windowsHide: true,
      stdio: 'inherit',
      env: options.env ?? process.env,
    },
  );
  let delivered = 0;
  const relay = () => {
    if (!existsSync(log)) return;
    const bytes = readFileSync(log);
    const content =
      bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.toString('utf16le') : bytes.toString('utf8');
    process.stdout.write(content.slice(delivered));
    delivered = content.length;
  };
  const timer = setInterval(relay, 1000);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (signal) reject(new Error(`Isolated test launcher exited with ${signal}.`));
        else resolve(code ?? 1);
      });
    });
  } finally {
    clearInterval(timer);
    relay();
  }
}
