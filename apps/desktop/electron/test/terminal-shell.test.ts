import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';

import {
  resetShellStartupProbesForTesting,
  resolveTerminalShell,
  resolveUsableTerminalShell,
} from '../terminal/shell.js';

afterEach(resetShellStartupProbesForTesting);

function existing(...paths: string[]): (candidate: string) => boolean {
  const normalized = new Set(paths.map((entry) => entry.toLowerCase()));
  return (candidate) => normalized.has(candidate.toLowerCase());
}

test('Windows auto shell prefers pwsh from PATH', () => {
  const shell = resolveTerminalShell('auto', {
    platform: 'win32',
    env: {
      PATH: 'C:\\Tools;C:\\Windows\\System32',
      PATHEXT: '.EXE;.CMD',
      SystemRoot: 'C:\\Windows',
    },
    exists: existing(
      'C:\\Tools\\pwsh.EXE',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Windows\\System32\\cmd.exe',
    ),
  });

  assert.equal(shell.kind, 'pwsh');
  assert.equal(shell.program.toLowerCase(), 'c:\\tools\\pwsh.exe');
  assert.deepEqual(shell.args, ['-NoLogo']);
});

test('Windows auto shell falls back to Windows PowerShell before cmd', () => {
  const shell = resolveTerminalShell('auto', {
    platform: 'win32',
    env: {
      PATH: 'C:\\Windows\\System32',
      PATHEXT: '.EXE;.CMD',
      SystemRoot: 'C:\\Windows',
      COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
    },
    exists: existing(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Windows\\System32\\cmd.exe',
    ),
  });

  assert.equal(shell.kind, 'powershell');
  assert.match(shell.program, /WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/i);
});

test('configured absolute SHELL wins in POSIX auto mode', () => {
  const shell = resolveTerminalShell('auto', {
    platform: 'darwin',
    env: {
      SHELL: '/opt/homebrew/bin/zsh',
      PATH: '',
    },
    exists: existing('/opt/homebrew/bin/zsh'),
  });

  assert.equal(shell.kind, 'zsh');
  assert.deepEqual(shell.args, ['-l']);
});

test('Windows auto shell does not let Git Bash preempt native PowerShell', () => {
  const shell = resolveTerminalShell('auto', {
    platform: 'win32',
    env: {
      SHELL: 'C:\\Program Files\\Git\\bin\\bash.exe',
      PATH: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
    },
    exists: existing(
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ),
  });

  assert.equal(shell.kind, 'powershell');
});

test('unavailable explicit shell falls back without executing an arbitrary path', () => {
  const shell = resolveTerminalShell('pwsh', {
    platform: 'win32',
    env: {
      PATH: 'C:\\Windows\\System32',
      PATHEXT: '.EXE;.CMD',
      SystemRoot: 'C:\\Windows',
    },
    exists: existing('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'),
  });

  assert.equal(shell.kind, 'powershell');
  assert.notEqual(shell.program.toLowerCase(), 'pwsh.exe');
});

test('Windows auto skips installed PowerShell executables that cannot start', async () => {
  const cmd = 'C:\\Windows\\System32\\cmd.exe';
  const probed: string[] = [];
  const shell = await resolveUsableTerminalShell('auto', {
    platform: 'win32',
    env: { PATH: 'C:\\Tools', SystemRoot: 'C:\\Windows' },
    exists: existing(
      'C:\\Tools\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      cmd,
    ),
    probeStartup: async (candidate) => {
      probed.push(candidate.kind);
      return candidate.kind === 'cmd';
    },
  });

  assert.equal(shell.program, cmd);
  assert.deepEqual(probed, ['pwsh', 'powershell', 'cmd']);
});

test('Windows auto shares startup probes and retries failed candidates after a short TTL', async () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  let powershellAvailable = false;
  const probed: string[] = [];
  const options = {
    platform: 'win32' as const,
    env: { SystemRoot: 'C:\\ProbeTest' },
    exists: existing(
      'C:\\ProbeTest\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\ProbeTest\\System32\\cmd.exe',
    ),
    probeStartup: async (shell: { kind: string }) => {
      probed.push(shell.kind);
      return shell.kind === 'cmd' || powershellAvailable;
    },
  };
  try {
    const first = await Promise.all([
      resolveUsableTerminalShell('auto', options),
      resolveUsableTerminalShell('auto', options),
    ]);
    assert.deepEqual(
      first.map((shell) => shell.kind),
      ['cmd', 'cmd'],
    );
    assert.deepEqual(probed, ['powershell', 'cmd']);
    powershellAvailable = true;
    mock.timers.tick(30_001);
    assert.equal((await resolveUsableTerminalShell('auto', options)).kind, 'powershell');
    assert.deepEqual(probed, ['powershell', 'cmd', 'powershell']);
  } finally {
    mock.timers.reset();
  }
});

test('Windows auto treats a rejected startup probe as unavailable and tries Windows PowerShell', async () => {
  const probed: string[] = [];
  const shell = await resolveUsableTerminalShell('auto', {
    platform: 'win32',
    env: { PATH: 'C:\\Tools', SystemRoot: 'C:\\Windows', SHELL: 'C:\\Explicit\\pwsh.exe' },
    exists: existing(
      'C:\\Explicit\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ),
    probeStartup: async (candidate) => {
      probed.push(candidate.kind);
      if (candidate.kind === 'pwsh')
        throw Object.assign(new Error('access denied'), { code: 'EACCES' });
      return true;
    },
  });
  assert.equal(shell.kind, 'powershell');
  assert.deepEqual(probed, ['pwsh', 'powershell']);
});

test('an explicitly selected installed PowerShell is not silently replaced with CMD', async () => {
  const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  let probed = false;
  const shell = await resolveUsableTerminalShell('powershell', {
    platform: 'win32',
    env: { SystemRoot: 'C:\\Windows' },
    exists: existing(powershell, 'C:\\Windows\\System32\\cmd.exe'),
    probeStartup: async () => {
      probed = true;
      return false;
    },
  });
  assert.equal(shell.program, powershell);
  assert.equal(probed, false);
});

test('Windows auto reports an unavailable shell when all startup probes fail', async () => {
  await assert.rejects(
    () =>
      resolveUsableTerminalShell('auto', {
        platform: 'win32',
        env: { SystemRoot: 'C:\\Windows' },
        exists: existing(
          'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
          'C:\\Windows\\System32\\cmd.exe',
        ),
        probeStartup: async () => false,
      }),
    /No usable Windows shell/,
  );
});
