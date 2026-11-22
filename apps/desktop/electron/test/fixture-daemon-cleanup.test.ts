import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  forceCloseLaunch,
  parseOwnedTestDaemonPid,
  stopOwnedTestDaemon,
} from '../../../../tests/e2e/fixture-daemon-cleanup.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('test daemon cleanup accepts only a descriptor owned by the exact fixture directory', () => {
  const root = path.join(os.tmpdir(), 'kodax-owned-daemon');
  assert.equal(
    parseOwnedTestDaemonPid(
      JSON.stringify({ pid: 4242, profile: 'default', configHome: root }),
      root,
    ),
    4242,
  );
  assert.equal(
    parseOwnedTestDaemonPid(
      JSON.stringify({ pid: 4242, profile: 'default', configHome: `${root}-other` }),
      root,
    ),
    undefined,
  );
  assert.equal(
    parseOwnedTestDaemonPid(
      JSON.stringify({ pid: 4242, profile: 'partner', configHome: root }),
      root,
    ),
    undefined,
  );
  assert.equal(parseOwnedTestDaemonPid('{broken', root), undefined);
});

test('test daemon cleanup signals the validated isolated PID and ignores missing state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kodax-fixture-daemon-cleanup-'));
  roots.push(root);
  const descriptorDir = path.join(root, 'runtime', 'daemon', 'default');
  await mkdir(descriptorDir, { recursive: true });
  const daemonPid = process.pid + 1;
  await writeFile(
    path.join(descriptorDir, 'daemon.json'),
    JSON.stringify({ pid: daemonPid, profile: 'default', configHome: root }),
    'utf8',
  );

  const signals: Array<{ pid: number; signal?: NodeJS.Signals | number }> = [];
  assert.equal(
    await stopOwnedTestDaemon(root, (pid, signal) => {
      signals.push({ pid, signal });
      return true;
    }),
    true,
  );
  assert.deepEqual(signals, [{ pid: daemonPid, signal: 'SIGTERM' }]);
  assert.equal(await stopOwnedTestDaemon(`${root}-missing`, () => true), false);
});

test('test daemon cleanup supports the single-home SDK default slot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kodax-fixture-default-cleanup-'));
  roots.push(root);
  const directory = path.join(root, 'runtime', 'daemon', 'default');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'daemon.json'), JSON.stringify({
    pid: process.pid + 1, profile: 'default', configHome: root,
  }));
  const signalled: number[] = [];
  assert.equal(await stopOwnedTestDaemon(root, pid => { signalled.push(pid); return true; }), true);
  assert.deepEqual(signalled, [process.pid + 1]);
});

test('test daemon cleanup recognizes its physical profile through a temporary path alias', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'kodax-fixture-daemon-cleanup-'));
  roots.push(parent);
  const profile = path.join(parent, 'profile');
  const alias = path.join(parent, 'alias');
  const descriptorDir = path.join(profile, 'runtime', 'daemon', 'default');
  await mkdir(descriptorDir, { recursive: true });
  await symlink(profile, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const daemonPid = process.pid + 1;
  await writeFile(
    path.join(descriptorDir, 'daemon.json'),
    JSON.stringify({ pid: daemonPid, profile: 'default', configHome: await realpath(profile) }),
  );
  const signalled: number[] = [];
  assert.equal(
    await stopOwnedTestDaemon(alias, (pid) => {
      signalled.push(pid);
      return true;
    }),
    true,
  );
  assert.deepEqual(signalled, [daemonPid]);
});

async function launchWithPipeHoldingGrandchild(parentExits: boolean) {
  // Mirrors Playwright's Electron launch: a shell wrapper on Windows, a process group elsewhere,
  // and a descendant that inherits the launch pipes. Killing only the wrapper leaves them open.
  // When the parent exits first, a detached descendant (like a shared daemon) has left the tree.
  const root = await mkdtemp(path.join(os.tmpdir(), 'kodax-fixture-launch-tree-'));
  roots.push(root);
  const script = path.join(root, 'parent.cjs');
  const pidFile = path.join(root, 'grandchild.pid');
  await writeFile(
    script,
    "const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], " +
      `{ stdio: 'inherit', detached: ${parentExits} });\n` +
      `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));\n` +
      (parentExits
        ? 'setTimeout(() => process.exit(0), 300);\n'
        : 'setInterval(() => {}, 1000);\n'),
  );
  const child = spawn(`"${process.execPath}" "${script}"`, {
    shell: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const exited = once(child, 'exit');
  child.stdout.resume();
  child.stderr.resume();
  const grandchildPid = async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const raw = await readFile(pidFile, 'utf8').catch(() => '');
      if (raw !== '') return Number(raw);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('grandchild never started');
  };
  return { child, exited, grandchildPid: await grandchildPid() };
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  for (let elapsed = 0; elapsed < timeoutMs; elapsed += 25) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !isAlive(pid);
}

test('forced launch close kills a live wrapper together with its pipe-holding descendants', async () => {
  const { child, grandchildPid } = await launchWithPipeHoldingGrandchild(false);
  assert.equal(await forceCloseLaunch(child, 5_000), 'tree');
  // The wrapper closing only proves the group was signalled; an orphaned descendant can
  // answer kill(pid, 0) until init reaps it, so allow bounded time for the death to land.
  assert.equal(await waitForExit(grandchildPid, 5_000), true);
});

test('forced launch close releases pipes still held by a descendant outside the tree', async () => {
  const { child, exited, grandchildPid } = await launchWithPipeHoldingGrandchild(true);
  await exited;
  try {
    assert.equal(await forceCloseLaunch(child, 2_000), 'pipes');
  } finally {
    if (isAlive(grandchildPid)) process.kill(grandchildPid);
  }
});

test('forced launch close returns at once when the launch already closed', async () => {
  const child = spawn(process.execPath, ['-e', ''], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume();
  child.stderr.resume();
  await once(child, 'close');
  const started = Date.now();
  assert.equal(await forceCloseLaunch(child, 5_000), 'closed');
  assert.ok(Date.now() - started < 1_000);
});
