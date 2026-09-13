import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createKodaXRuntime } from '@kodax-ai/kodax/runtime';

test('installed SDK creates and observes new Sessions without scanning unrelated Run logs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'space-fresh-session-'));
  const options = { homeDir: root, sessionsDir: path.join(root, 'sessions') };
  let runtime;
  const originalOpen = fs.openSync;
  try {
    runtime = await createKodaXRuntime(options);
    const unrelated = await runtime.sessions.create();
    await runtime.sessions.appendNotice({
      sessionId: unrelated.id,
      source: 'regression-test',
      content: 'x'.repeat(256 * 1024),
    });
    await runtime.close();
    runtime = await createKodaXRuntime(options);
    const unrelatedLog = path.join(root, '.kodax', 'runtime', 'runs', unrelated.id, 'events.jsonl');
    let unrelatedReads = 0;
    fs.openSync = (file, flags, mode) => {
      if (String(file) === unrelatedLog && flags === 'r') unrelatedReads += 1;
      return originalOpen(file, flags, mode);
    };
    syncBuiltinESMExports();

    const session = await runtime.sessions.create({
      projectPath: root,
      gitRoot: root,
      surface: 'space-desktop',
      tag: 'code',
    });
    const observation = await runtime.sessions.observe(session.id, () => undefined);
    assert.equal(observation.snapshot.cursor.seq, 1);
    observation.close();
    assert.equal(
      unrelatedReads,
      0,
      'new Session creation must not recover unrelated event history',
    );
  } finally {
    fs.openSync = originalOpen;
    syncBuiltinESMExports();
    await runtime?.close();
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'space-fresh-session-')));
    await rm(root, { recursive: true, force: true });
  }
});
