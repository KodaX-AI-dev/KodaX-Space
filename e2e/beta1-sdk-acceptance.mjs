// Registry SDK offline acceptance: node --test --test-force-exit --import tsx e2e/beta1-sdk-acceptance.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import JSZip from 'jszip';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertKodaxReleaseDependencyState } from '../scripts/kodax-runtime-release-gate.mjs';

test('installed Registry SDK Space adapter acceptance', { timeout: 180_000 }, async () => {
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
  let connectionOptions;
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
      connectionOptions = options;
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
    assert.equal(attached.capabilities.productInputRecovery.version, 1);
    assert.equal(attached.capabilities.productExecutionModeConstraint.version, 1);
    assert.equal(attached.capabilities.repoIntelligenceDiagnostics.version, 1);
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
      const requestStart = requests.length;
      const run = await ask(id, `Evidence for ${expert.id}`);
      assert.equal((await run.result).phase, 'completed');
      const status = await attached.runs.get(run.runId);
      assert.equal(status.workMode, 'agent');
      assert.equal(status.effectiveConfig.workMode, 'agent');
      const payloads = requests.slice(requestStart).map((body) => JSON.parse(body));
      const system = payloads
        .flatMap((body) => body.messages ?? [])
        .filter((message) => ['system', 'developer'].includes(message.role));
      assert.ok(
        system.some((message) => JSON.stringify(message.content).includes(expert.prompt)),
        'actual system instructions retain the chosen expert',
      );
      const wireTools = new Set(
        payloads
          .flatMap((body) => body.tools ?? [])
          .map((tool) => tool.function?.name ?? tool.name),
      );
      for (const tool of ['bash', 'write', 'spawn_agent']) {
        assert.ok(
          status.effectiveConfig.toolScope.includes(tool),
          `execution surface retains ${tool}`,
        );
        assert.ok(
          status.effectiveConfig.modelToolScope.includes(tool),
          `model surface retains ${tool}`,
        );
        assert.ok(wireTools.has(tool), `actual provider schema retains ${tool}`);
      }
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
    const observations = [];
    const existing = await attached.sessions.observeView(quick, (view) => observations.push(view));
    await adapter.promoteSession(quick, 'code');
    await until(() => observations.at(-1)?.session.tag === 'code');
    const promoted = await attached.sessions.load(quick);
    assert.equal(observations.at(-1).session.metadataRevision, promoted.metadataRevision);
    existing.close();
    const peer = await sdk.connectKodaXRuntime({
      ...connectionOptions,
      daemonLifecycle: undefined,
      autoStart: false,
      clientInfo: {
        name: 'beta2-read-peer',
        instanceId: randomUUID(),
        instanceSecret: randomUUID(),
      },
    });
    try {
      const fresh = [];
      const observation = await peer.sessions.observeView(quick, (view) => fresh.push(view));
      try {
        assert.equal(fresh.at(-1).session.tag, 'code');
        assert.equal(fresh.at(-1).session.metadataRevision, promoted.metadataRevision);
        assert.ok(fresh.at(-1).items.some((item) => item.text.includes('Fixture complete.')));
      } finally {
        observation.close();
      }
      const constrained = await create();
      const startWorkflow = attached.workflows.start.bind(attached.workflows);
      const beforeMismatch = requests.length;
      attached.workflows.start = async (input) => {
        assert.equal(input.authorization.profile.requiredWorkMode, 'agent');
        const selected = await peer.sessions.getSettingsVersioned(constrained);
        await peer.sessions.updateSettingsVersioned(
          constrained,
          { workMode: 'coding' },
          { expectedRevision: selected.revision },
        );
        return startWorkflow(input);
      };
      try {
        await assert.rejects(
          adapter.startWorkflow({
            sessionId: constrained,
            projectRoot: workspace,
            source: {
              kind: 'inline',
              manifest: {
                name: 'wrong-mode-denied',
                description: 'No wrong-mode execution',
                phases: ['check'],
                maxAgents: 1,
                maxConcurrency: 1,
                readOnly: true,
                patterns: ['fan-out-and-synthesize'],
              },
              source: 'async function run() { throw new Error("WRONG_MODE_BODY_EXECUTED"); }',
            },
          }),
          { code: 'execution_mode_mismatch' },
        );
        assert.equal(requests.length, beforeMismatch);
        assert.equal((await peer.sessions.getSettings(constrained)).workMode, 'coding');
        report.checks.push(
          'a second client changing Partner to Coding after Main authorization is refused by Host before Workflow execution',
        );
      } finally {
        attached.workflows.start = startWorkflow;
      }
    } finally {
      await peer.close();
    }
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
      'Quick Ask promotion refreshes existing/new/second-client views and preserves the same Session/history',
    );
    const repoSession = await create('code');
    await adapter.updateSessionSettings(repoSession, { repoIntelligenceMode: 'off' });
    const beforeRepo = requests.length;
    const repo = await adapter.inspectRepoIntelligence(repoSession);
    assert.equal(repo.runtimeId, attached.identity.runtimeId);
    assert.equal(repo.sessionId, repoSession);
    assert.equal(repo.initialized, false);
    assert.equal(repo.status, 'disabled');
    assert.equal(requests.length, beforeRepo);
    report.repo = repo;
    report.checks.push('Host repository inspection remains lazy and makes no Provider request');
    const { _setRepoIntelEntitlementForTesting } =
      await import('../apps/desktop/electron/kodax/repo-intel-gate.ts');
    _setRepoIntelEntitlementForTesting(async () => true);
    try {
      await attached.config.patch({ repoIntelligenceMode: 'light' });
      const warmed = await adapter.inspectRepoIntelligence(repoSession, true);
      assert.equal(warmed.initialized, true);
      assert.equal(warmed.effectiveEngine, 'light');
      assert.equal((await attached.catalog.inspectRepoIntelligence(repoSession)).initialized, true);
      assert.equal(requests.length, beforeRepo);
      report.checks.push(
        'explicit Host prewarm shares its cache with public inspection without Provider calls',
      );
    } finally {
      _setRepoIntelEntitlementForTesting(null);
    }

    const legacy = await create('code');
    const legacyGate = gate();
    holdNext = legacyGate;
    const beforeLegacy = requests.length;
    const heldRun = await ask(legacy, 'LEGACY_QUEUE_ORIGINAL');
    await until(() => requests.length > beforeLegacy);
    const originalInput = {
      sessionId: legacy,
      inputId: randomUUID(),
      text: 'Retained full old input. '.repeat(500),
      delivery: 'after_turn',
    };
    assert.equal((await attached.runs.acceptInput(originalInput)).state, 'queued');
    const withdraw = attached.runs.withdrawInput.bind(attached.runs);
    let lost = false;
    attached.runs.withdrawInput = async (...args) => {
      const value = await withdraw(...args);
      if (!lost) {
        lost = true;
        throw new Error('Lost durable withdrawal reply');
      }
      return value;
    };
    await assert.rejects(adapter.withdrawProductInput(originalInput), /Lost durable/);
    const recovered = await adapter.withdrawProductInput(originalInput);
    assert.equal(recovered.text, originalInput.text);
    attached.runs.withdrawInput = withdraw;
    assert.deepEqual(await withdraw(legacy, originalInput.inputId), originalInput);
    legacyGate.release();
    assert.equal((await heldRun.result).phase, 'completed');
    report.checks.push(
      'legacy input without Space material recovers the full durable withdrawal receipt after a lost response',
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
    await mkdir('artifacts/diagnostics/beta2', { recursive: true });
    await writeFile(
      'artifacts/diagnostics/beta2/real-sdk-host-report.json',
      JSON.stringify(report, null, 2),
    );
  }
  process.stdout.write(
    `Registry ${report.sdk}: ${report.checks.length} real shared-Host checks passed.\n`,
  );
});
