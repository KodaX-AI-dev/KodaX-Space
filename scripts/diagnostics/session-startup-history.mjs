// Isolated installed-SDK shared-Host probe. No real account, session or owner is mutated.
// Host-ready, first history read and new-session observation are separate measurements.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { ensureKodaXRuntime, waitForRuntimeDaemonShutdown } from '@kodax-ai/kodax/runtime';
import { createSessionManager } from '@kodax-ai/kodax/session';

const fixture = await mkdtemp(path.join(os.tmpdir(), 'space-history-diagnostic-'));
const configHome = path.join(fixture, '.kodax');
const sessionsDir = path.join(configHome, 'sessions');
const previousHome = process.env.KODAX_HOME;
let runtime;
let owner;
const report = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
try {
  assert.equal(
    process.argv.length,
    2,
    'This probe uses only the installed SDK; historical repair/version gates are separate.',
  );
  await mkdir(configHome, { recursive: true });
  process.env.KODAX_HOME = configHome;
  // Fixture preparation ends before the Host becomes the sole Session writer.
  const storage = createSessionManager({ sessionsDir, configHome }).storage;
  await storage.save('diagnostic_history', {
    title: 'Synthetic history',
    gitRoot: fixture,
    scope: 'user',
    tag: 'code',
    messages: Array.from({ length: 400 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `Fixture ${index} ${'history '.repeat(400)}`,
    })),
  });
  const start = performance.now();
  runtime = await ensureKodaXRuntime({
    homeDir: fixture,
    sessionsDir,
  });
  owner = (await runtime.daemon.inspect()).owner;
  assert.equal(owner?.runtimeId, runtime.identity.runtimeId);
  report({
    stage: 'host-ready',
    elapsedMs: Math.round(performance.now() - start),
    identity: runtime.identity,
  });
  const historyStart = performance.now();
  const history = await runtime.sessions.readHistory('diagnostic_history');
  report({
    stage: 'first-history',
    elapsedMs: Math.round(performance.now() - historyStart),
    items: history.items.length,
    synthetic: true,
  });
  const createStart = performance.now();
  const fresh = await runtime.sessions.create({
    sessionId: 'diagnostic_new',
    projectPath: fixture,
    gitRoot: fixture,
    surface: 'space-desktop',
    tag: 'code',
  });
  const observation = await runtime.sessions.observe(fresh.id, () => {});
  observation.close();
  report({ stage: 'new-session-observed', elapsedMs: Math.round(performance.now() - createStart) });
} finally {
  try {
    if (runtime && owner) {
      assert.equal((await runtime.daemon.inspect()).owner?.runtimeId, owner.runtimeId);
      assert.equal((await runtime.status.preflight()).canStop, true);
      await runtime.daemon.shutdown();
      await runtime.close();
      const stopped = await waitForRuntimeDaemonShutdown({
        configHome,
        owner,
      });
      assert.equal(stopped.status, 'succeeded', JSON.stringify(stopped));
      report({ stage: 'shutdown', status: stopped.status });
    } else await runtime?.close();
  } finally {
    if (previousHome === undefined) delete process.env.KODAX_HOME;
    else process.env.KODAX_HOME = previousHome;
    assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
    await rm(fixture, { recursive: true, force: true });
  }
}
