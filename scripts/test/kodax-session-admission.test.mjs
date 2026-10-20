import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createKodaXRuntime } from '@kodax-ai/kodax/runtime';

function historicalMetadata(root, sessionId, phase) {
  return {
    _type: 'meta',
    id: sessionId,
    title: sessionId,
    gitRoot: root,
    createdAt: '2026-10-01T00:00:00.000Z',
    activeMessageCount: 1,
    runtimeInfo: { surface: 'cli' },
    ...(phase === 'running'
      ? {
          actorSnapshot: {
            schemaVersion: 1,
            revision: 1,
            maxConcurrentThreads: 4,
            actors: [{ path: '/root/worker', currentTurnId: 'active-turn', kind: 'native' }],
            turns: [],
            mailboxes: {},
            events: [],
          },
        }
      : {}),
  };
}

async function createHistoricalRun(t, phase) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'space-admission-')));
  const sessionId = 'body-eio';
  const sessionsDir = path.join(root, '.kodax', 'sessions');
  const sessionFile = path.join(sessionsDir, `${sessionId}.jsonl`);
  await fs.mkdir(sessionsDir, { recursive: true });
  const metadata = historicalMetadata(root, sessionId, phase);
  const content = `${JSON.stringify(metadata)}\n${JSON.stringify({ role: 'user', content: 'x'.repeat(600_000) })}\n`;
  await fs.writeFile(sessionFile, content);
  const runDir = path.join(
    root,
    '.kodax',
    'runtime',
    'profiles',
    'coder',
    'runs',
    'historical-run',
  );
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, 'status.json'),
    JSON.stringify({
      runId: 'historical-run',
      sessionId,
      phase,
      provider: 'fixture',
      startedAt: '2026-10-01T00:00:00.000Z',
      ...(phase === 'completed' ? { endedAt: '2026-10-01T00:01:00.000Z' } : {}),
    }),
  );
  t.after(async () => {
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('space-admission-'));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
  });
  return { root, sessionId, sessionFile, content };
}

function failBodyReads(t, sessionFile) {
  const originalRead = fs.readFile;
  return t.mock.method(fs, 'readFile', (...args) => {
    if (String(args[0]) === sessionFile) {
      return Promise.reject(Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }));
    }
    return originalRead(...args);
  });
}

for (const phase of ['completed', 'running']) {
  test(`published SDK inspects a ${phase} Run with unreadable history without losing exit protection`, async (t) => {
    const { root, sessionId, sessionFile, content } = await createHistoricalRun(t, phase);
    const runtime = await createKodaXRuntime({
      homeDir: root,
      profile: 'coder',
      sharedDaemonHost: true,
    });
    const bodyRead = failBodyReads(t, sessionFile);
    try {
      const runs = await runtime.runs.list();
      assert.equal(runs[0]?.runId, 'historical-run');
      assert.equal(runs[0]?.phase, phase === 'completed' ? 'completed' : 'unknown');
      const preflight = await runtime.status.preflight();
      assert.equal(preflight.canStop, phase === 'completed');
      if (phase === 'running') {
        assert.ok(preflight.blockers.includes('active_runs'));
        assert.ok(preflight.blockers.includes('active_agent_turns'));
        assert.equal(preflight.activeAgentTurns[0]?.turnId, 'active-turn');
      }
      assert.equal(
        bodyRead.mock.calls.filter(({ arguments: args }) => String(args[0]) === sessionFile).length,
        0,
      );
      await assert.rejects(runtime.sessions.load(sessionId), { code: 'EIO' });
      bodyRead.mock.restore();
      assert.equal(await fs.readFile(sessionFile, 'utf8'), content);
      await fs.writeFile(sessionFile, '{broken\n');
      await assert.rejects(runtime.runs.list(), { code: 'data_corrupt' });
    } finally {
      bodyRead.mock.restore();
      await runtime.close();
    }
  });
}
