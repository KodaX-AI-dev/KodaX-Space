// Warm the KodaX Windows native artifact cache before unit suites.
//
// The protected write path (textTransaction) provisions its native binding on
// first use into %LOCALAPPDATA%\KodaXNativeArtifactsV3 through PowerShell
// helpers with hard 30s budgets. Fresh CI runners start with a cold cache, and
// mid-suite provisioning there has surfaced downstream as silent write-tool
// ENOENTs (kodax-permission-authority / kodax-runtime-control failures that
// never reproduced on warm dev machines). This script warms the cache the way
// the release workflow does — through the SDK's own sandbox setup entry — and
// then proves one real Runtime write lands, failing loudly with the actual
// tool error instead of a downstream ENOENT. It is a no-op off Windows.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setupKodaXSandbox } from '@kodax-ai/kodax/sandbox';
import { createOwnedTestRuntime, stopOwnedTestRuntime } from './owned-runtime-fixture.mjs';

async function warmOnce() {
  if (process.platform === 'win32') {
    const setup = await setupKodaXSandbox();
    if (!setup.ready) {
      throw new Error(`sandbox setup did not report ready: ${JSON.stringify(setup)}`);
    }
    console.log('sandbox setup ready');
  }
  const shortTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'space-native-warmup-'));
  // Windows protected-write targets reject 8.3-style segments, and CI runner
  // temp dirs are short paths (C:\Users\RUNNER~1\...). Hand the SDK long paths.
  const root = await fs.realpath(shortTemp);
  const workspace = path.join(root, 'workspace');
  const target = path.join(workspace, 'warmup.txt');
  await fs.mkdir(workspace);
  try {
    const runtime = await createOwnedTestRuntime({
      homeDir: path.join(root, 'home'),
      sessionsDir: path.join(root, 'sessions'),
      defaultProvider: 'anthropic',
      defaultModel: 'fixture',
    });
    let phase;
    let lastText;
    try {
      const session = await runtime.sessions.create({ projectPath: workspace });
      await runtime.sessions.updateSettings(session.id, { permissionMode: 'full-access' });
      const run = await runtime.runs.start({
        sessionId: session.id,
        prompt: 'Warm the native artifact cache.',
        options: {
          lsp: false,
          toolInvocation: { name: 'write', input: { path: target, content: 'warmup' } },
        },
      });
      const result = await run.result;
      phase = result.phase;
      lastText = result.result?.lastText;
      assert.equal(await fs.readFile(target, 'utf8'), 'warmup');
    } catch (error) {
      throw new Error(
        `warmup write failed (phase=${phase}, lastText=${JSON.stringify(lastText)}): ${error.message}`,
      );
    } finally {
      await stopOwnedTestRuntime(runtime);
    }
  } finally {
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('space-native-warmup-'));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}

if (process.platform === 'win32') {
  for (let attempt = 1; ; attempt += 1) {
    const started = performance.now();
    try {
      await warmOnce();
      console.log(`native artifact cache warm in ${(performance.now() - started).toFixed(0)}ms`);
      break;
    } catch (error) {
      console.error(`native artifact warmup attempt ${attempt} failed:`, error);
      if (attempt >= 2) throw error;
    }
  }
}
