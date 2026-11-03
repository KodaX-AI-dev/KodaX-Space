// An isolated Main authority process for the cross-process queued-input acceptance.
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const input = JSON.parse(process.argv[2]);
process.env.KODAX_HOME = input.profileRoot;
const sdk = await import('@kodax-ai/kodax/runtime');
const { RuntimeHostAdapter } =
  await import('../apps/desktop/electron/kodax/runtime-host-adapter.ts');
const { RuntimeClientIdentityStore } =
  await import('../apps/desktop/electron/kodax/runtime/runtime-client-identity.ts');
const { registerSpaceBuiltinSkills } =
  await import('../apps/desktop/electron/skill/space-builtins.ts');
await registerSpaceBuiltinSkills(path.resolve('resources/builtin-skills'));
let runtime;
const options = {
  profileRoot: input.profileRoot,
  homeDir: input.homeDir,
  integrationHealthPollMs: 0,
  runtimeFactory: async ({ autoStart, endpoint, transport, ...value }) => {
    runtime = autoStart
      ? await sdk.ensureKodaXRuntime(value)
      : await sdk.connectKodaXRuntime({ ...value, endpoint, transport });
    return runtime;
  },
  credentialResolver: async () => 'offline-fixture',
  credentialProvidersResolver: async () => ['cold-fixture'],
};
const create = () =>
  new RuntimeHostAdapter({
    ...options,
    identityStore: new RuntimeClientIdentityStore(
      path.join(input.profileRoot, 'space', 'identity.json'),
    ),
  });
let adapter = create();
const report = { mainPid: process.pid };
const original = 'ORIGINAL_COLD_INPUT_' + 'q'.repeat(7000) + '_END';
try {
  if (input.action === 'create') {
    const sessionId = await adapter.createSession({
      projectRoot: input.workspace,
      surface: 'partner',
      ephemeral: false,
    });
    await adapter.updateSessionSettings(sessionId, {
      provider: 'cold-fixture',
      model: 'fixture',
      permissionMode: 'full-access',
      agentMode: 'ama',
    });
    const active = await adapter.startManagedRun({
      sessionId,
      prompt: 'ACTIVE_BEFORE_MAIN_RESTART',
    });
    void active.result.catch(() => {});
    const inputId = `cold-${randomUUID()}`;
    await adapter.submitInput({
      sessionId,
      inputId,
      input: { type: 'text', text: original },
      delivery: 'after-turn',
      afterRunId: active.runId,
    });
    process.send({
      stage: 'queued',
      sessionId,
      inputId,
      activeRunId: active.runId,
      runtimeId: runtime.identity.runtimeId,
      mainPid: process.pid,
    });
    await new Promise((resolve) => process.once('message', resolve));
    await adapter.close();
  } else {
    const { sessionId, inputId, activeRunId } = input;
    await adapter.initialize();
    report.runtimeId = runtime.identity.runtimeId;
    assert.equal(report.runtimeId, input.runtimeId);
    await adapter.readSessionProductView(sessionId);
    process.send({ stage: 'attached', mainPid: process.pid });
    await runtime.runs.await(activeRunId);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const liveFact = await runtime.runs.getInput(sessionId, inputId);
    report.liveHostRebound = liveFact?.state === 'submitted';
    if (liveFact?.state === 'queued') {
      report.liveHostPending = { state: liveFact.state, admissionError: liveFact.admissionError };
      await shutdown();
      adapter = create();
      await adapter.initialize();
      report.replacementRuntimeId = runtime.identity.runtimeId;
      assert.notEqual(report.replacementRuntimeId, report.runtimeId);
      await adapter.readSessionProductView(sessionId);
    }
    await until(
      async () => (await runtime.runs.getInput(sessionId, inputId))?.state === 'submitted',
    );
    const consumed = await runtime.runs.getInput(sessionId, inputId);
    assert.equal((await runtime.runs.await(consumed.runId)).phase, 'completed');
    const run = await runtime.runs.get(consumed.runId);
    assert.equal(run.effectiveConfig.workMode, 'agent');
    assert.ok(run.effectiveConfig.toolScope.includes('bash'));
    assert.equal(
      (await runtime.runs.list({ sessionId })).filter(
        (run) => run.productInput?.inputId === inputId,
      ).length,
      1,
    );
    const history = await runtime.sessions.readHistory(sessionId);
    assert.equal(
      history.items.filter((item) => item.type === 'user' && item.text === original).length,
      1,
    );
    const before = history.items.map((item) => ({ type: item.type, text: item.text }));
    const fork = await adapter.forkSession({ sessionId, newSessionId: `fork-${randomUUID()}` });
    assert.equal((await runtime.sessions.load(fork.id)).surface, 'partner');
    assert.deepEqual(
      (await runtime.sessions.readHistory(fork.id)).items.map((item) => ({
        type: item.type,
        text: item.text,
      })),
      before,
    );
    await adapter.updateSessionSettings(fork.id, { model: 'fixture-switched' });
    const next = await adapter.startManagedRun({
      sessionId: fork.id,
      prompt: 'PARTNER_FORK_MODEL_SWITCH',
    });
    assert.equal((await next.result).phase, 'completed');
    assert.equal((await runtime.runs.get(next.runId)).effectiveConfig.workMode, 'agent');
    assert.deepEqual(
      (await runtime.sessions.readHistory(sessionId)).items.map((item) => ({
        type: item.type,
        text: item.text,
      })),
      before,
    );
    Object.assign(report, {
      sdk: runtime.identity.version,
      originalCharacters: original.length,
      inputExecutions: 1,
      runId: consumed.runId,
      forkAndModelSwitch: true,
    });
    await shutdown();
    report.shutdown = 'succeeded';
    process.send({ stage: 'result', report });
  }
} catch (error) {
  try {
    if (runtime && input.action !== 'create') await shutdown();
    else await adapter.close();
  } catch (cleanupError) {
    process.stderr.write(`Fixture cleanup: ${cleanupError.message}\n`);
  }
  process.send({ stage: 'failed', error: error.stack });
  process.exitCode = 1;
}
process.disconnect();
process.exit(process.exitCode ?? 0);
async function shutdown() {
  const owner = (await runtime.daemon.inspect()).owner;
  assert.equal(owner?.runtimeId, runtime.identity.runtimeId);
  assert.equal((await runtime.status.preflight()).canStop, true);
  await runtime.daemon.shutdown();
  await adapter.close();
  const stopped = await sdk.waitForRuntimeDaemonShutdown({
    configHome: input.profileRoot,
    profile: runtime.identity.profile,
    owner,
  });
  assert.equal(stopped.status, 'succeeded', JSON.stringify(stopped));
}
async function until(predicate) {
  const deadline = Date.now() + 30_000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Cold queue acceptance timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
