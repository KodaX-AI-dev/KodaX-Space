// SessionFlagStore tests — F149 任务置顶 / 归档在主进程持久化，重启后保持。

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createSessionFlagStore } from '../projects/session-flag-store.js';

let tmpDir = '';
let storeFile = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kodax-space-flags-'));
  storeFile = path.join(tmpDir, 'session-flags.json');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('pin and archive survive a restart', async () => {
  const store = createSessionFlagStore(storeFile, tmpDir);
  await store.set('a', { pinned: true });
  await store.set('b', { archived: true });

  const flags = await createSessionFlagStore(storeFile, tmpDir).list();
  assert.ok((flags.a?.pinnedAt ?? 0) > 0);
  assert.equal(flags.a?.archivedAt, undefined);
  assert.ok((flags.b?.archivedAt ?? 0) > 0);
});

test('archiving unpins, and unarchiving does not pin again', async () => {
  const store = createSessionFlagStore(storeFile, tmpDir);
  await store.set('a', { pinned: true });
  const archived = await store.set('a', { archived: true });
  assert.equal(archived.a?.pinnedAt, undefined);
  assert.ok((archived.a?.archivedAt ?? 0) > 0);

  const restored = await store.set('a', { archived: false });
  assert.equal(restored.a, undefined);
});

test('an archived task cannot be pinned', async () => {
  const store = createSessionFlagStore(storeFile, tmpDir);
  await store.set('a', { archived: true });
  const flags = await store.set('a', { pinned: true });
  assert.equal(flags.a?.pinnedAt, undefined);
  assert.ok((flags.a?.archivedAt ?? 0) > 0);
});

test('pinning again keeps the original pin time', async () => {
  const store = createSessionFlagStore(storeFile, tmpDir);
  const first = (await store.set('a', { pinned: true })).a?.pinnedAt;
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = (await store.set('a', { pinned: true })).a?.pinnedAt;
  assert.equal(second, first);
});

test('removing a deleted task drops its flags', async () => {
  const store = createSessionFlagStore(storeFile, tmpDir);
  await store.set('a', { pinned: true });
  await store.remove('a');
  assert.deepEqual(await createSessionFlagStore(storeFile, tmpDir).list(), {});
});

test('a corrupt file starts empty instead of throwing', async () => {
  await fs.writeFile(storeFile, '{not json');
  assert.deepEqual(await createSessionFlagStore(storeFile, tmpDir).list(), {});
});
