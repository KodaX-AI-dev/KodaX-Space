import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const product = await import('@kodax-ai/kodax/client');
const low = await import('@kodax-ai/kodax/runtime');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'space-seams-built-')));
const homeDir = path.join(root, 'home');
const workspace = path.join(root, 'workspace');
await mkdir(workspace);
const provider = 'space-seams-offline';
const profile = 'space-seams-built';
const facts = {
  source: 'installed Registry alpha.2 public SDK',
  steps: [],
  wireCalls: 0,
  credentialCalls: 0,
  hostToolCalls: 0,
  authorizationKinds: [],
  credentialTargets: [],
};
const wire = createServer(async (request, response) => {
  for await (const chunk of request) {
    void chunk;
  }
  facts.wireCalls++;
  assert.equal(request.headers.authorization, 'Bearer space-offline-fixture');
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end(
    'data: ' +
      JSON.stringify({
        id: 'fixture',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'fixture',
        choices: [
          {
            index: 0,
            delta: { content: 'Built SDK verified response ' + facts.wireCalls },
            finish_reason: 'stop',
          },
        ],
      }) +
      '\n\ndata: [DONE]\n\n',
  );
});
await new Promise((resolve) => wire.listen(0, '127.0.0.1', resolve));
let runtime, client, owner, credentialLease, toolLease;
const approvedSessions = new Set();
try {
  runtime = await low.ensureKodaXRuntime({
    homeDir,
    profile,
    defaultProvider: provider,
    daemonOrphanExitMs: 30000,
  });
  owner = (await runtime.daemon.inspect()).owner;
  await runtime.catalog.upsertCustomProvider({
    name: provider,
    protocol: 'openai',
    model: 'fixture',
    apiKeyEnv: 'SPACE_SEAMS_NO_AMBIENT_CREDENTIAL',
    baseUrl: 'http://127.0.0.1:' + wire.address().port + '/v1',
  });
  client = await product.connectKodaXClient({
    homeDir,
    profile,
    clientInfo: { name: 'space-seams-built-probe', version: '0.1.46' },
    async authorizeExecution(request, services) {
      assert.ok(approvedSessions.has(request.input.sessionId));
      facts.authorizationKinds.push(request.kind);
      credentialLease ??= await services.credentials.registerScoped(
        { providers: [provider] },
        async (request) => {
          assert.ok(approvedSessions.has(request.sessionId));
          assert.equal(request.provider, provider);
          assert.equal(request.purpose, 'primary');
          assert.ok(['run', 'actor_turn'].includes(request.target.kind));
          facts.credentialTargets.push(request.target);
          facts.credentialCalls++;
          return 'space-offline-fixture';
        },
      );
      toolLease ??= await services.hostTools.register(
        [
          {
            name: 'space_fixture_artifact',
            description: 'Offline Space artifact',
            inputSchema: { type: 'object', properties: {} },
            sideEffect: 'non_idempotent',
          },
        ],
        {
          async space_fixture_artifact(call) {
            assert.ok(approvedSessions.has(call.sessionId));
            facts.hostToolCalls++;
            return { content: 'Offline artifact confirmed' };
          },
        },
      );
      return {
        credential: { leaseId: credentialLease.id, mode: 'scoped', providers: [provider] },
        hostTools: { leaseId: toolLease.id },
        ...(['agent_spawn', 'agent_followup'].includes(request.kind) ? { tools: [] } : {}),
      };
    },
  });
  facts.steps.push('published_connector_authorization_capability_handshake');
  const session = await client.sessions.create({
    projectPath: workspace,
    surface: 'code',
    tag: 'code',
  });
  approvedSessions.add(session.id);
  await client.sessions.updateSettings(session.id, {
    provider,
    model: 'fixture',
    agentMode: 'sa',
    permissionMode: 'full-access',
  });
  const tool = await client.runs.startTool({
    sessionId: session.id,
    inputId: randomUUID(),
    name: 'space_fixture_artifact',
    input: {},
    rawInput: 'Explicit artifact fixture',
  });
  assert.equal((await client.runs.await(tool.runId)).phase, 'completed');
  assert.equal(facts.hostToolCalls, 1);
  facts.steps.push('published_host_tool_reverse_bridge');
  for (const text of ['first-query-seams', 'second-query-seams']) {
    const accepted = await client.inputs.submit({
      sessionId: session.id,
      inputId: randomUUID(),
      text,
    });
    assert.equal((await client.runs.await(accepted.runId)).phase, 'completed');
  }
  assert.equal(facts.credentialCalls, 2);
  assert.equal(facts.wireCalls, 2);
  facts.steps.push('published_scoped_credential_reverse_bridge');
  const page = await client.sessions.readHistory(session.id);
  assert.equal(page.status, 'resolved');
  assert.deepEqual(page.issues, []);
  assert.ok(page.sourceRevision);
  const query = page.items.find((item) => item.text === 'second-query-seams');
  assert.ok(query.historyBoundary);
  const retry = await client.sessions.forkSession(session.id, {
    historyBoundary: query.historyBoundary,
    before: true,
  });
  const retryPage = await client.sessions.readHistory(retry.id);
  assert.ok(retryPage.items.some((item) => item.text === 'first-query-seams'));
  assert.ok(!retryPage.items.some((item) => item.text === 'second-query-seams'));
  facts.steps.push('published_public_history_quality_boundary_retry_before');
  const lineage = await client.sessions.readLineage(session.id);
  await client.sessions.rewindSession(session.id, {
    historyBoundary: query.historyBoundary,
    expectedHead: lineage.activeEntryId,
  });
  await assert.rejects(
    client.sessions.forkSession(session.id, { historyBoundary: query.historyBoundary }),
    (error) => error.code === 'resync_required',
  );
  facts.steps.push('published_canonical_rewind_and_stale_boundary_rejection');
  const actor = await client.agents.spawn(session.id, {
    taskName: 'published-independent',
    objective: 'Reply with the offline fixture.',
    capabilities: { providers: [provider], tools: [] },
  });
  const awaitActor = async (turnId) => {
    const deadline = Date.now() + 10000;
    do {
      const output = await client.agents.output(session.id, actor.actorPath, turnId);
      if (output.state !== 'running') {
        assert.equal(output.state, 'completed');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    assert.fail('Independent Actor did not finish.');
  };
  await awaitActor(actor.turnId);
  await client.agents.followup(session.id, actor.actorPath, 'Reply with another offline fixture.');
  const actorDetail = (await client.agents.tree(session.id)).actors.find(
    (row) => row.path === actor.actorPath,
  );
  const nextTurn = actorDetail.turnIds.at(-1);
  assert.notEqual(nextTurn, actor.turnId);
  await awaitActor(nextTurn);
  assert.equal(facts.authorizationKinds.filter((kind) => kind === 'agent_spawn').length, 1);
  assert.equal(facts.authorizationKinds.filter((kind) => kind === 'agent_followup').length, 1);
  const actorTargets = facts.credentialTargets.filter((target) => target.kind === 'actor_turn');
  assert.equal(actorTargets.length, 2);
  assert.deepEqual(
    actorTargets.map((target) => target.turnId),
    [actor.turnId, nextTurn],
  );
  facts.steps.push('published_independent_actor_spawn_followup_main_authorization');
  await runtime.close();
  runtime = undefined;
  await client.host.shutdown();
  await client.disconnect();
  client = undefined;
  facts.shutdown = await low.waitForRuntimeDaemonShutdown({
    configHome: path.join(homeDir, '.kodax'),
    profile,
    owner,
    timeoutMs: 20000,
  });
  assert.equal(facts.shutdown.status, 'succeeded');
  delete facts.shutdown.outcome.pid;
  delete facts.shutdown.outcome.runtimeId;
  facts.success = true;
} catch (error) {
  facts.success = false;
  facts.error = { name: error.name, code: error.code, message: error.message };
} finally {
  await runtime?.close().catch((error) => {
    facts.cleanupError = error.message;
  });
  if (client) {
    await client.host.shutdown().catch((error) => {
      facts.cleanupError = error.message;
    });
    await client.disconnect();
  }
  await new Promise((resolve, reject) =>
    wire.close((error) => (error ? reject(error) : resolve())),
  );
}
await (
  await import('node:fs/promises')
).writeFile(
  new URL('./kodax-0.7.97-alpha.2-main-bridge-evidence.json', import.meta.url),
  JSON.stringify(facts, null, 2) + '\n',
);
process.stdout.write(JSON.stringify(facts, null, 2) + '\n');
process.exitCode = facts.success ? 0 : 1;
