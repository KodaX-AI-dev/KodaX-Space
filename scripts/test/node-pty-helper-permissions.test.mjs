import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, stat, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureNodePtyHelpers } from '../ensure-node-pty-helpers.mjs';

test(
  'freshly installed macOS helpers can execute before packaging',
  { skip: process.platform === 'win32' },
  async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'space-pty-helper-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    for (const arch of ['arm64', 'x64']) {
      const helper = path.join(root, 'prebuilds', `darwin-${arch}`, 'spawn-helper');
      await mkdir(path.dirname(helper), { recursive: true });
      await writeFile(helper, '#!/bin/sh\nexit 0\n');
      await chmod(helper, 0o644);
      assert.equal(spawnSync(helper).error?.code, 'EACCES');
    }
    await ensureNodePtyHelpers(root);
    for (const arch of ['arm64', 'x64']) {
      const helper = path.join(root, 'prebuilds', `darwin-${arch}`, 'spawn-helper');
      assert.equal((await stat(helper)).mode & 0o777, 0o755);
      assert.equal(spawnSync(helper).status, 0);
    }
  },
);
