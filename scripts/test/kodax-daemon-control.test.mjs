import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, realpath, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { connectKodaXRuntime } from '@kodax-ai/kodax/runtime';

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-daemon-control-')));
  const profile = 'control-regression';
  const packageRoot = path.dirname(
    createRequire(import.meta.url).resolve('@kodax-ai/kodax/package.json'),
  );
  const runtime = await connectKodaXRuntime({
    homeDir: root,
    profile,
    autoStart: true,
    defaultProvider: 'anthropic',
    daemonOrphanExitMs: 30000,
  });
  t.after(async () => {
    await runtime.close();
    await promisify(execFile)(
      process.execPath,
      [
        path.join(packageRoot, 'dist/kodax_cli.js'),
        'daemon',
        'stop',
        '--home',
        root,
        '--profile',
        profile,
        '--timeout-ms',
        '10000',
        '--force',
        '--json',
      ],
      { windowsHide: true, timeout: 20000 },
    );
    assert.equal(path.dirname(root), await realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('space-daemon-control-'));
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  });
  assert.equal(runtime.capabilities.sessionCancellation?.version, 1);
  assert.equal(runtime.capabilities.sessionCancellation?.durableFrontier, true);
  assert.equal(runtime.capabilities.toolInvocation?.version, 1);
  const session = await runtime.sessions.create({ projectPath: root });
  await runtime.sessions.updateSettings(session.id, { permissionMode: 'full-access' });
  const start = (toolInvocation) =>
    runtime.runs.start({
      sessionId: session.id,
      prompt: 'Explicit offline acceptance',
      options: { lsp: false, toolInvocation },
    });
  return { runtime, root, sessionId: session.id, start };
}

async function waitForFile(file) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      return await readFile(file, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for tool execution: ${path.basename(file)}`);
}

test(
  'published daemon executes explicit tools and cancels only the accepted Session frontier',
  { timeout: 90000 },
  async (t) => {
    const { runtime, root, sessionId, start } = await fixture(t);
    const firstFile = path.join(root, 'first.txt');
    const first = await start({
      name: 'write',
      input: { path: firstFile, content: 'explicit tool completed' },
    });
    const firstResult = await first.result;
    assert.equal(firstResult.phase, 'completed', firstResult.result?.lastText);
    assert.equal(await readFile(firstFile, 'utf8'), 'explicit tool completed');

    const gateScript = path.join(root, 'gate.cjs');
    await writeFile(
      gateScript,
      "require('node:fs').writeFileSync(process.argv[2], 'running'); setTimeout(() => {}, Number(process.argv[3]));\n",
    );
    const launchGate = (marker, delay) =>
      start({
        name: 'bash',
        input: { command: `"${process.execPath}" "${gateScript}" "${marker}" ${delay}` },
      });
    const marker = path.join(root, 'active.txt');
    const active = await launchGate(marker, 30000);
    await waitForFile(marker);
    const forbidden = path.join(root, 'queued-must-not-run.txt');
    const queued = await start({
      name: 'write',
      input: { path: forbidden, content: 'must not exist' },
    });
    const request = { sessionId, expectedRunId: active.runId, requestId: 'accepted-frontier' };
    const stopped = await runtime.sessions.cancel(request);
    assert.deepEqual(
      new Set(stopped.receipts.map((item) => item.runId)),
      new Set([active.runId, queued.runId]),
    );
    const outcomes = await Promise.all([active.result, queued.result]);
    assert.ok(
      outcomes.every((outcome) => ['interrupted', 'cancelled'].includes(outcome.phase)),
      JSON.stringify(
        outcomes.map((outcome) => ({ phase: outcome.phase, lastText: outcome.result?.lastText })),
      ),
    );
    await assert.rejects(readFile(forbidden), { code: 'ENOENT' });

    const successorMarker = path.join(root, 'successor.txt');
    const successor = await launchGate(successorMarker, 2000);
    await waitForFile(successorMarker);
    const replay = await runtime.sessions.cancel(request);
    assert.equal(replay.frontier, stopped.frontier);
    assert.equal(
      replay.receipts.some((item) => item.runId === successor.runId),
      false,
    );
    await assert.rejects(
      runtime.sessions.cancel({ ...request, requestId: 'never-accepted' }),
      (error) => {
        assert.equal(error.code, 'conflict');
        assert.equal(error.data?.denialSource, 'stale_run');
        assert.equal(error.data?.retryable, false);
        return true;
      },
    );
    assert.equal((await successor.result).phase, 'completed');
  },
);
