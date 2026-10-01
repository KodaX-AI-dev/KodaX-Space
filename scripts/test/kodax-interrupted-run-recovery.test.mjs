import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createKodaXRuntime } from '@kodax-ai/kodax/runtime';
import { KodaXBaseProvider, registerModelProvider } from '@kodax-ai/kodax/llm';

function registerInterruptedProvider(providerName, keyName, requests) {
  class Provider extends KodaXBaseProvider {
    name = providerName;
    supportsThinking = false;
    config = { apiKeyEnv: keyName, model: 'fixture', supportsThinking: false };
    async stream(messages, _tools, _system, _reasoning, streamOptions) {
      requests.push(structuredClone(messages));
      if (requests.length === 1) {
        streamOptions.onTextDelta('UNSAVED_PROGRESS: script drafted, render still pending.');
        throw Object.assign(new TypeError('offline interrupted stream'), {
          code: 'ERR_INVALID_ARG_TYPE',
        });
      }
      return {
        textBlocks: [{ type: 'text', text: 'Resumed normally.' }],
        thinkingBlocks: [],
        toolBlocks: [],
      };
    }
  }
  return registerModelProvider(providerName, () => new Provider());
}

async function createRecoveryFixture(t, mode) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'space-sdk-recovery-'));
  const providerName = `space-recovery-${mode}`;
  const keyName = 'SPACE_RECOVERY_FIXTURE_KEY';
  const previous = new Map(['KODAX_HOME', keyName].map((key) => [key, process.env[key]]));
  process.env.KODAX_HOME = path.join(root, 'home');
  process.env[keyName] = 'offline-fixture';
  const requests = [];
  const unregister = registerInterruptedProvider(providerName, keyName, requests);
  let runtime;
  t.after(async () => {
    try {
      await runtime?.close();
    } finally {
      unregister();
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
      assert.ok(path.basename(root).startsWith('space-sdk-recovery-'));
      await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  });
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  runtime = await createKodaXRuntime({
    homeDir: path.join(root, 'home'),
    sessionsDir: path.join(root, 'sessions'),
    defaultProvider: providerName,
    defaultModel: 'fixture',
  });
  const session = await runtime.sessions.create({ projectPath: workspace });
  return { runtime, session, requests };
}

for (const mode of ['managed_task', 'coding']) {
  test(`published ${mode} resumes journal replies in requests without rewriting history`, async (t) => {
    const { runtime, session, requests } = await createRecoveryFixture(t, mode);
    const start = (prompt) =>
      runtime.runs.start({
        sessionId: session.id,
        mode,
        prompt,
        options: {
          agentMode: mode === 'coding' ? 'sa' : 'ama',
          lsp: false,
          repoIntelligenceMode: 'off',
        },
      });
    const interrupted = await start('Draft the script');
    assert.equal((await interrupted.result).phase, 'failed');
    const resumeIndex = requests.length;
    const resumed = await start('Continue');
    assert.equal((await resumed.result).phase, 'completed');
    assert.ok(requests.length > resumeIndex);
    const request = JSON.stringify(requests[resumeIndex]);
    assert.equal(request.split('=== Interrupted Run Recovery ===').length - 1, 1);
    assert.match(request, /UNSAVED_PROGRESS/);
    assert.match(request, /unconfirmed/);
    assert.match(request, /not a request from the user/);
    assert.match(request, new RegExp(interrupted.runId));
    const history = await runtime.sessions.conversation(session.id);
    assert.equal(history.status, 'resolved');
    assert.doesNotMatch(JSON.stringify(history), /UNSAVED_PROGRESS|Interrupted Run Recovery/);
  });
}
