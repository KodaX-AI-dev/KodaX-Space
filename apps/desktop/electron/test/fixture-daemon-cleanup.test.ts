import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
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
      JSON.stringify({ pid: 4242, profile: 'coder', configHome: root }),
      root,
    ),
    4242,
  );
  assert.equal(
    parseOwnedTestDaemonPid(
      JSON.stringify({ pid: 4242, profile: 'coder', configHome: `${root}-other` }),
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
  const descriptorDir = path.join(root, 'runtime', 'daemon', 'coder');
  await mkdir(descriptorDir, { recursive: true });
  const daemonPid = process.pid + 1;
  await writeFile(
    path.join(descriptorDir, 'daemon.json'),
    JSON.stringify({ pid: daemonPid, profile: 'coder', configHome: root }),
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

test('test daemon cleanup recognizes its physical profile through a temporary path alias', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'kodax-fixture-daemon-cleanup-'));
  roots.push(parent);
  const profile = path.join(parent, 'profile');
  const alias = path.join(parent, 'alias');
  const descriptorDir = path.join(profile, 'runtime', 'daemon', 'coder');
  await mkdir(descriptorDir, { recursive: true });
  await symlink(profile, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const daemonPid = process.pid + 1;
  await writeFile(
    path.join(descriptorDir, 'daemon.json'),
    JSON.stringify({ pid: daemonPid, profile: 'coder', configHome: await realpath(profile) }),
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
