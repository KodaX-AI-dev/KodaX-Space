// Registry SDK offline acceptance: node --test --test-force-exit --import tsx e2e/beta1-sdk-acceptance.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import JSZip from 'jszip';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertKodaxReleaseDependencyState } from '../scripts/kodax-runtime-release-gate.mjs';

test('Registry beta.1 Space adapter acceptance', { timeout: 180_000 }, async () => {
  const dependency = await assertKodaxReleaseDependencyState(
    process.cwd(),
    path.resolve('node_modules/@kodax-ai/kodax'),
  );

  process.env.KODAX_TEST_ONBOARDING = `beta1-host-${randomUUID()}`;
  const { applySdkHomeEnv, getKodaxRuntimeDir } =
    await import('../apps/desktop/electron/kodax/data-paths.ts');
  applySdkHomeEnv();
  const homeDir = getKodaxRuntimeDir();
  const profileRoot = path.join(homeDir, '.kodax');
  process.env.KODAX_HOME = profileRoot;
  const workspace = path.join(profileRoot, 'workspace');
  await mkdir(workspace, { recursive: true });
  const projectSkill = path.join(workspace, '.agents', 'skills', 'alpha12-project');
  await mkdir(projectSkill, { recursive: true });
  await writeFile(
    path.join(projectSkill, 'SKILL.md'),
    '---\nname: alpha12-project\ndescription: Isolated candidate discovery fixture.\n---\nRead the supplied source.\n',
  );
  const requests = [];
  let holdNext;
  const gates = [];
  function gate() {
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    const value = { promise, release };
    gates.push(value);
    return value;
  }
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(body);
    const held = holdNext;
    holdNext = undefined;
    if (held) await held.promise;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: `fixture-${requests.length}`,
        model: 'fixture',
        choices: [
          { finish_reason: 'stop', message: { role: 'assistant', content: 'Fixture complete.' } },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await writeFile(
    path.join(profileRoot, 'config.json'),
    JSON.stringify({
      provider: 'beta-fixture',
      model: 'fixture',
      agentMode: 'ama',
      customProviders: [
        {
          name: 'beta-fixture',
          protocol: 'openai',
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
          apiKeyEnv: 'UNUSED_BETA_FIXTURE_KEY',
          model: 'fixture',
        },
      ],
    }),
  );
  const sdk = await import('@kodax-ai/kodax/runtime');
  const { registerSpaceBuiltinSkills } =
    await import('../apps/desktop/electron/skill/space-builtins.ts');
  await registerSpaceBuiltinSkills(path.resolve('resources/builtin-skills'));
  const { RuntimeHostAdapter } =
    await import('../apps/desktop/electron/kodax/runtime-host-adapter.ts');
  const { RuntimeClientIdentityStore } =
    await import('../apps/desktop/electron/kodax/runtime/runtime-client-identity.ts');
  let attached;
  const report = {
    dependency,
    sdk: dependency.version,
    profileRoot,
    checks: [],
  };
  const adapter = new RuntimeHostAdapter({
    profileRoot,
    homeDir,
    identityStore: new RuntimeClientIdentityStore(path.join(profileRoot, 'space', 'identity.json')),
    runtimeFactory: async ({ autoStart, endpoint, transport, ...options }) => {
      attached = autoStart
        ? await sdk.ensureKodaXRuntime(options)
        : await sdk.connectKodaXRuntime({ ...options, endpoint, transport });
      return attached;
    },
    credentialResolver: async () => 'offline-unused-fixture-key',
    credentialProvidersResolver: async () => ['beta-fixture'],
    integrationHealthPollMs: 0,
  });
  try {
    await adapter.initialize();
    report.host = { ...attached.identity, capabilities: attached.capabilities };
    const skills = await adapter.listRuntimeSkills(workspace);
    assert.ok(skills.some((skill) => skill.name === 'draft-response'));
    assert.ok(skills.some((skill) => skill.name === 'alpha12-project'));
    assert.ok(
      await attached.catalog.describeSkill({ projectRoot: workspace, name: 'draft-response' }),
    );
    report.checks.push(
      'Space builtin Skill is discovered and rehydrated by the actual Host',
      'project .agents/skills is discovered by the actual Host',
    );
    assert.equal(attached.capabilities.productExecutionBinding.version, 1);
    assert.equal(attached.capabilities.sessionPromotion.version, 1);
    // Install the actual product expert library through the public extension boundary.
    const { getSpaceExtensionStore, getSpaceExpertCatalog } =
      await import('../apps/desktop/electron/space-extensions/runtime.ts');
    const extensionStore = getSpaceExtensionStore(),
      catalog = getSpaceExpertCatalog();
    const manifest = JSON.parse(await readFile('extensions/partner-library/manifest.json', 'utf8'));
    const html = await readFile('extensions/partner-library/ui/index.html');
    manifest.ui.sha256 = createHash('sha256').update(html).digest('hex');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest));
    zip.file('ui/index.html', html);
    const archive = path.join(profileRoot, 'library.space-extension');
    await writeFile(archive, await zip.generateAsync({ type: 'nodebuffer' }));
    await extensionStore.install(archive);
    await extensionStore.setEnabled(manifest.id, true);
    const experts = await catalog.list(manifest.id);
    const { getSessionRuntimeStore } =
      await import('../apps/desktop/electron/kodax/session-runtime-store.ts');
    const store = getSessionRuntimeStore();
    const create = async (surface = 'partner', ephemeral = false) => {
      const id = await adapter.createSession({ projectRoot: workspace, surface, ephemeral });
      await adapter.updateSessionSettings(id, {
        provider: 'beta-fixture',
        model: 'fixture',
        permissionMode: 'full-access',
        agentMode: 'ama',
      });
      return id;
    };
    const ask = (id, text) => adapter.startManagedRun({ sessionId: id, prompt: text });
    const role = (expert) =>
      catalog.resolve({ extensionId: manifest.id, expertId: expert.id, revision: expert.revision });
    const verifiedExperts = [];
    for (const expert of experts) {
      process.stdout.write(`Expert ${expert.id}...\n`);
      const id = await create();
      assert.equal(await store.set(id, { partnerExpert: await role(expert) }), true);
      const run = await ask(id, `Evidence for ${expert.id}`);
      assert.equal((await run.result).phase, 'completed');
      const status = await attached.runs.get(run.runId);
      assert.equal(status.workMode, 'agent');
      assert.equal(status.effectiveConfig.agentProfile.name, expert.name);
      assert.ok(status.effectiveConfig.toolScope.includes('bash'));
      assert.equal(status.executionBinding?.defaultSkill?.name, expert.skillRef);
      const history = await attached.sessions.readHistory(id);
      assert.ok(
        history.items.some(
          (item) => item.type === 'user' && item.text === `Evidence for ${expert.id}`,
        ),
      );
      verifiedExperts.push(expert.id);
    }
    report.experts = verifiedExperts;
    process.stdout.write('All experts passed. Queue consumption...\n');
    report.checks.push(
      `all ${experts.length} current experts retain persona, default method, original question and shell`,
    );
    const withMethod = experts.filter((expert) => expert.skillRef);
    assert.ok(withMethod.length >= 2);
    const id = await create();
    await store.set(id, { partnerExpert: await role(withMethod[0]) });
    const held = gate();
    holdNext = held;
    const count = requests.length;
    const active = await ask(id, 'Hold this active root');
    await until(() => requests.length > count);
    const inputId = `queued-${randomUUID()}`;
    const queued = await adapter.submitInput({
      sessionId: id,
      inputId,
      input: { type: 'text', text: 'Use the committed replacement' },
      delivery: 'after-turn',
      afterRunId: active.runId,
    });
    assert.equal(queued.accepted, true);
    await store.set(id, { partnerExpert: await role(withMethod[1]) });
    held.release();
    assert.equal((await active.result).phase, 'completed');
    await until(async () => (await attached.runs.getInput(id, inputId))?.state === 'submitted');
    const accepted = await attached.runs.getInput(id, inputId);
    assert.equal((await attached.runs.await(accepted.runId)).phase, 'completed');
    const consumed = await attached.runs.get(accepted.runId);
    assert.equal(consumed.effectiveConfig.agentProfile.name, withMethod[1].name);
    assert.equal(consumed.executionBinding.defaultSkill.name, withMethod[1].skillRef);
    report.checks.push('after-turn resolves the last committed expert at actual consumption');
    // Explicit method applies for one turn, without changing the saved persona/default.
    process.stdout.write('Queue passed. Explicit method...\n');
    const beforeExplicit = requests.length;
    const explicit = await ask(id, '/draft-response Explicit customer question');
    assert.equal((await explicit.result).phase, 'completed');
    assert.ok(requests.slice(beforeExplicit).some((body) => body.includes('客户回复草稿')));
    const next = await ask(id, 'Return to the saved default');
    assert.equal((await next.result).phase, 'completed');
    assert.equal(
      (await attached.runs.get(next.runId)).executionBinding.defaultSkill.name,
      withMethod[1].skillRef,
    );
    report.checks.push('explicit Skill remains one turn; the next turn restores the default');
    // Disable the package while a queued input waits; no model request may be emitted for that input.
    process.stdout.write('Explicit passed. Disabled expert...\n');
    const blockedGate = gate();
    holdNext = blockedGate;
    const before = requests.length;
    const running = await ask(id, 'Hold before disabling the expert');
    await until(() => requests.length > before);
    const blockedId = `blocked-${randomUUID()}`;
    await adapter.submitInput({
      sessionId: id,
      inputId: blockedId,
      input: { type: 'text', text: 'Original blocked question' },
      delivery: 'after-turn',
      afterRunId: running.runId,
    });
    await extensionStore.setEnabled(manifest.id, false);
    blockedGate.release();
    await running.result;
    await until(
      async () => (await attached.runs.getInput(id, blockedId))?.admissionError !== undefined,
    );
    const blocked = await attached.runs.getInput(id, blockedId);
    assert.equal(blocked.state, 'queued');
    assert.equal(blocked.runId, undefined);
    assert.equal(blocked.admissionError.code, 'execution_binding_rejected');
    const original = await adapter.withdrawProductInput({ sessionId: id, inputId: blockedId });
    assert.equal(original.text, 'Original blocked question');
    assert.deepEqual(
      await adapter.withdrawProductInput({ sessionId: id, inputId: blockedId }),
      original,
    );
    report.checks.push(
      'disabled queued expert is blocked before the model and original input can be taken back',
    );
    await extensionStore.setEnabled(manifest.id, true);
    process.stdout.write('Disabled expert passed. Promotion...\n');
    const quick = await create('code', true);
    const answer = await ask(quick, 'Quick Ask promotion proof');
    await answer.result;
    const originalHistory = (await attached.sessions.readHistory(quick)).items.map((item) => ({
      type: item.type,
      text: item.text,
    }));
    await adapter.promoteSession(quick, 'code');
    assert.equal((await attached.sessions.load(quick)).tag, 'code');
    assert.deepEqual(
      (await attached.sessions.readHistory(quick)).items.map((item) => ({
        type: item.type,
        text: item.text,
      })),
      originalHistory,
    );
    await adapter.promoteSession(quick, 'code');
    report.checks.push(
      'Quick Ask promotion preserves the same Session/history and its retry is idempotent',
    );
    report.requestCount = requests.length;
    async function until(predicate) {
      const deadline = Date.now() + 30_000;
      while (!(await predicate())) {
        if (Date.now() > deadline) throw new Error('Acceptance condition timed out');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
  } finally {
    for (const item of gates) item.release();
    process.stdout.write('Acceptance cleanup...\n');
    if (attached) {
      const inspection = await attached.daemon.inspect();
      const owner = inspection.owner;
      assert.equal(
        owner?.runtimeId,
        attached.identity.runtimeId,
        'Only this exact isolated Host can be stopped',
      );
      const preflight = await attached.status.preflight();
      assert.equal(preflight.canStop, true, JSON.stringify(preflight));
      await attached.daemon.shutdown();
      await adapter.close();
      const stopped = await sdk.waitForRuntimeDaemonShutdown({
        configHome: profileRoot,
        profile: attached.identity.profile,
        owner,
      });
      assert.equal(stopped.status, 'succeeded', JSON.stringify(stopped));
      report.shutdown = stopped.status;
    } else await adapter.close();
    await new Promise((resolve) => server.close(resolve));
    await mkdir('artifacts/diagnostics/beta1-release', { recursive: true });
    await writeFile(
      'artifacts/diagnostics/beta1-release/real-sdk-host-report.json',
      JSON.stringify(report, null, 2),
    );
  }
  process.stdout.write(
    `Registry ${report.sdk}: ${report.checks.length} real shared-Host checks passed.\n`,
  );
});
