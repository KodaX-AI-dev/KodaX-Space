// Only installed Registry package public exports. No SDK source or private modules.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKodaXRuntime } from '@kodax-ai/kodax/runtime';
import { connectKodaXClient } from '@kodax-ai/kodax/client';
import { registerTool } from '@kodax-ai/kodax/coding';
import {
  KodaXBaseProvider,
  KodaXAnthropicCompatProvider,
  KodaXOpenAICompatProvider,
  clearRuntimeModelProviders,
  registerCustomProviders,
  registerModelProvider,
  runWithProviderRequestObserver,
  withProviderRequestCredential,
} from '@kodax-ai/kodax/llm';

const installed = JSON.parse(
  await readFile(
    new URL('../../node_modules/@kodax-ai/kodax/package.json', import.meta.url),
    'utf8',
  ),
);
assert.equal(installed.version, '0.7.97-alpha.2');
const evidence = {
  package: installed.name,
  version: installed.version,
  imports: 'public installed Registry package only',
  sdkRetries: [],
  publicClient: {},
  operationOnly: {},
  nativePending: {},
};
const sandboxSequence = [
  { version: 1, state: 'not_selected' },
  { version: 1, state: 'fallback', reason: 'not_ready', execution: 'normal_permission_policy' },
];
const temp = await mkdtemp(path.join(os.tmpdir(), 'kodax-alpha2-published-statistics-'));
async function removeVerifiedTemp(target) {
  const absolute = path.resolve(target);
  assert.ok(absolute.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(absolute).startsWith('kodax-alpha2-published-statistics-'));
  await rm(absolute, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
const originalFetch = globalThis.fetch;
const fixtureEnv = 'KODAX_ALPHA2_STATISTICS_FIXTURE';
const previousEnv = process.env[fixtureEnv];
let runtime;
let client;
let unregister;
let finishOperation = () => {};
let finishNative = () => {};
try {
  process.env[fixtureEnv] = 'offline-fixture';
  class NativeOpenAI extends KodaXOpenAICompatProvider {
    name = 'published-openai-retry';
    config = { model: 'fixture', baseUrl: 'https://fixture.invalid', supportsThinking: false };
    getApiKey() {
      return 'offline-fixture';
    }
  }
  class NativeAnthropic extends KodaXAnthropicCompatProvider {
    name = 'published-anthropic-retry';
    config = { model: 'fixture', baseUrl: 'https://fixture.invalid', supportsThinking: false };
    getApiKey() {
      return 'offline-fixture';
    }
  }
  for (const Provider of [NativeOpenAI, NativeAnthropic]) {
    const provider = new Provider();
    const observations = [];
    let fetches = 0;
    globalThis.fetch = async () => {
      if (++fetches === 1)
        return new Response(
          JSON.stringify({ error: { message: 'offline retry', type: 'overloaded_error' } }),
          { status: 503, headers: { 'content-type': 'application/json', 'retry-after-ms': '1' } },
        );
      const response =
        Provider === NativeAnthropic
          ? {
              id: 'fixture',
              type: 'message',
              role: 'assistant',
              model: 'fixture',
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: 'fixture' }],
              usage: { input_tokens: 7, output_tokens: 3, cache_read_input_tokens: 2 },
            }
          : {
              id: 'fixture',
              object: 'chat.completion',
              model: 'fixture',
              created: 1,
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'fixture' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 },
            };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const result = await runWithProviderRequestObserver(
      (fact) => observations.push(fact),
      () =>
        withProviderRequestCredential(provider.name, 'fallback', undefined, () =>
          provider.complete([{ role: 'user', content: 'fixture' }], [], 'fixture', false, {
            maxOutputTokensOverride: 16,
          }),
        ),
    );
    const requests = [...new Map(observations.map((fact) => [fact.requestId, fact])).values()];
    assert.equal(fetches, 2);
    assert.deepEqual(
      requests.map((row) => [row.attempt, row.boundary, row.wireObservation, row.state]),
      [
        [1, 'physical_attempt', 'observed', 'failed'],
        [2, 'physical_attempt', 'observed', 'succeeded'],
      ],
    );
    assert.equal(requests[0].requestId, observations[0].requestId);
    assert.equal(result.usage.totalTokens, 12);
    evidence.sdkRetries.push({ provider: provider.name, fetches, requests, usage: result.usage });
  }

  // Documented public externalAgents inline-host injection keeps fixture functions local.
  runtime = await createKodaXRuntime({
    mode: 'daemon',
    homeDir: temp,
    externalAgents: {
      factories: [],
      policy: () => ({ allowed: false }),
    },
  });
  assert.equal(runtime.identity.version, '0.7.97-alpha.2');
  evidence.runtimeIdentity = runtime.identity;
  const executions = [];
  unregister = registerTool({
    name: 'published_statistics_fixture',
    description: 'Offline published SDK fixture',
    sideEffect: 'readonly',
    input_schema: {
      type: 'object',
      properties: { label: { type: 'string' } },
      required: ['label'],
    },
    handler: async (input, ctx) => {
      const label = String(input.label);
      executions.push(label);
      const outputPath = path.join(temp, `${label}-output.txt`);
      await writeFile(outputPath, `result-${label}`);
      ctx.recordToolResultArtifact(ctx.toolCallId, outputPath);
      for (const observation of label === 'child'
        ? sandboxSequence
        : [label === 'two' ? sandboxSequence[1] : sandboxSequence[0]])
        ctx.reportToolSandboxObservation(observation);
      return `result-${label}`;
    },
  });
  registerCustomProviders([
    {
      name: 'published-rpc-native',
      protocol: 'openai',
      baseUrl: 'https://fixture.invalid/v1',
      apiKeyEnv: fixtureEnv,
      model: 'fixture',
      maxOutputTokens: 16,
    },
  ]);
  client = await connectKodaXClient({ homeDir: temp });
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init.body));
    const text = JSON.stringify(body.messages);
    const results = body.messages.filter((message) => message.role === 'tool');
    let calls = [];
    if (
      text.includes('ROOT_SPAWN_PROBE') &&
      !text.includes('CHILD_FACT_PROBE') &&
      results.length === 0
    ) {
      calls = [
        {
          name: 'spawn_agent',
          id: 'spawn',
          input: {
            task_name: 'audit-child',
            objective: 'CHILD_FACT_PROBE',
            fork_turns: 'none',
            read_only: false,
          },
        },
      ];
    } else if (
      results.length === 0 &&
      body.tools?.some((tool) => tool.function?.name === 'published_statistics_fixture') &&
      (text.includes('CHILD_FACT_PROBE') || text.includes('DUPLICATE_FACT_PROBE'))
    ) {
      calls = (text.includes('DUPLICATE_FACT_PROBE') ? ['one', 'two'] : ['child']).map((label) => ({
        name: 'published_statistics_fixture',
        id: 'reused-provider-id',
        input: { label },
      }));
    }
    const delta = calls.length
      ? {
          tool_calls: calls.map((call, index) => ({
            index,
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.input) },
          })),
        }
      : { content: 'Offline published SDK fixture completed.' };
    return new Response(
      `data: ${JSON.stringify({
        id: 'fixture',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'fixture',
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        choices: [{ index: 0, delta, finish_reason: calls.length ? 'tool_calls' : 'stop' }],
      })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
  };
  const ordinary = await client.sessions.create({ projectPath: temp });
  await client.sessions.updateSettings(ordinary.id, {
    provider: 'published-rpc-native',
    agentMode: 'ama',
    permissionMode: 'full-access',
  });
  const root = await client.inputs.submit({
    sessionId: ordinary.id,
    inputId: 'ordinary-root',
    text: 'ROOT_SPAWN_PROBE',
  });
  const rootResult = await client.runs.await(root.runId);
  assert.equal(rootResult.phase, 'completed', JSON.stringify(rootResult));
  const tree = await client.agents.tree(ordinary.id);
  const actor = tree.actors.find((row) => row.path === '/root/audit-child');
  assert.ok(actor);
  const target = {
    kind: 'actor_turn',
    actorPath: actor.path,
    turnId: actor.turnIds.at(-1),
    parentRunId: root.runId,
  };
  const statistics = await client.statistics.read(ordinary.id);
  const requests = (await client.statistics.readRequests(ordinary.id)).items;
  const tools = (await client.statistics.readTools(ordinary.id)).items;
  const actorRequests = requests.filter((row) => row.attribution?.kind === 'actor_turn');
  assert.equal(actorRequests.length, 2);
  for (const request of actorRequests) {
    assert.deepEqual(request.target, target);
    assert.equal(request.boundary, 'physical_attempt');
  }
  const tool = tools.find((row) => row.name === 'published_statistics_fixture');
  assert.ok(tool);
  assert.deepEqual(tool.target, target);
  assert.equal(tool.state, 'completed');
  assert.equal(tool.result, 'succeeded');
  assert.deepEqual(tool.sandbox, sandboxSequence);
  const budget = statistics.contexts.find(
    (row) => row.contextKind === 'child' && row.agentId === actor.path,
  );
  assert.ok(budget);
  assert.deepEqual(budget.target, target);
  assert.equal(budget.turnId, target.turnId);
  evidence.publicClient.ordinaryAmbientChild = {
    rootRunId: root.runId,
    target,
    executions: [...executions],
    statistics,
    requests,
    tools,
  };

  executions.length = 0;
  const duplicates = await client.sessions.create({ projectPath: temp });
  await client.sessions.updateSettings(duplicates.id, {
    provider: 'published-rpc-native',
    agentMode: 'sa',
    permissionMode: 'full-access',
  });
  const submitted = await client.inputs.submit({
    sessionId: duplicates.id,
    inputId: 'duplicate-batch',
    text: 'DUPLICATE_FACT_PROBE',
  });
  const result = await client.runs.await(submitted.runId);
  assert.equal(result.phase, 'completed');
  assert.deepEqual([...executions].sort(), ['one', 'two']);
  const facts = (await client.statistics.readTools(duplicates.id)).items.filter(
    (row) => row.name === 'published_statistics_fixture',
  );
  assert.equal(facts.length, 2);
  assert.equal(new Set(facts.map((row) => row.id)).size, 2);
  for (const fact of facts) {
    assert.equal(fact.toolId, 'reused-provider-id');
    assert.equal(fact.state, 'completed');
    assert.equal(fact.result, 'succeeded');
  }
  assert.deepEqual(
    facts.map((row) => row.sandbox.map((observation) => observation.state)),
    [['not_selected'], ['fallback']],
  );
  const canonical = result.result.messages.flatMap((message) =>
    Array.isArray(message.content)
      ? message.content.filter((block) => block.type === 'tool_result')
      : [],
  );
  assert.deepEqual(
    canonical.map((block) => block.content),
    ['result-one', 'result-two'],
  );
  assert.deepEqual(
    canonical.map((block) => block.metadata?.outputPath),
    [path.join(temp, 'one-output.txt'), path.join(temp, 'two-output.txt')],
  );
  evidence.publicClient.duplicates = {
    executions: [...executions],
    facts,
    canonicalResults: canonical,
  };

  let operationEntered = false;
  const operationWait = new Promise((resolve) => {
    finishOperation = resolve;
  });
  class OperationOnly extends KodaXBaseProvider {
    name = 'published-operation-only';
    supportsThinking = false;
    config = { apiKeyEnv: fixtureEnv, model: 'fixture', supportsThinking: false };
    async stream() {
      operationEntered = true;
      await operationWait;
      return {
        textBlocks: [{ type: 'text', text: 'Operation completed.' }],
        toolBlocks: [],
        thinkingBlocks: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      };
    }
  }
  registerModelProvider('published-operation-only', () => new OperationOnly());
  const operationSession = await client.sessions.create({ projectPath: temp });
  await client.sessions.updateSettings(operationSession.id, {
    provider: 'published-operation-only',
    agentMode: 'sa',
    permissionMode: 'full-access',
  });
  const operationRun = await client.inputs.submit({
    sessionId: operationSession.id,
    inputId: 'held-operation',
    text: 'HOLD_OPERATION_ONLY_PROBE',
  });
  const operationDeadline = Date.now() + 10000;
  while (!operationEntered && Date.now() < operationDeadline)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(operationEntered);
  const operationStarted = await client.statistics.read(operationSession.id);
  const operationRequests = (await client.statistics.readRequests(operationSession.id)).items;
  assert.equal(operationStarted.coverage, 'partial');
  assert.equal(operationStarted.operationCount, 1);
  assert.equal(operationStarted.physicalRequestCount, 0);
  assert.ok(operationStarted.issues.length);
  assert.equal(operationRequests[0].wireObservation, 'unavailable');
  finishOperation();
  assert.equal((await client.runs.await(operationRun.runId)).phase, 'completed');
  evidence.operationOnly = {
    started: operationStarted,
    startedRequests: operationRequests,
    completed: await client.statistics.read(operationSession.id),
  };

  let nativeEntered = false;
  const nativeWait = new Promise((resolve) => {
    finishNative = resolve;
  });
  class HeldNative extends KodaXOpenAICompatProvider {
    name = 'published-held-native';
    config = {
      apiKeyEnv: fixtureEnv,
      model: 'fixture',
      baseUrl: 'https://fixture.invalid/v1',
      supportsThinking: false,
      maxOutputTokens: 16,
    };
    async buildClient() {
      nativeEntered = true;
      await nativeWait;
      return super.buildClient();
    }
  }
  registerModelProvider('published-held-native', () => new HeldNative());
  const nativeSession = await client.sessions.create({ projectPath: temp });
  await client.sessions.updateSettings(nativeSession.id, {
    provider: 'published-held-native',
    agentMode: 'sa',
    permissionMode: 'full-access',
  });
  const nativeRun = await client.inputs.submit({
    sessionId: nativeSession.id,
    inputId: 'held-native',
    text: 'NATIVE_PENDING_PROBE',
  });
  const nativeDeadline = Date.now() + 10000;
  while (!nativeEntered && Date.now() < nativeDeadline)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(nativeEntered);
  const nativeStarted = await client.statistics.read(nativeSession.id);
  const nativeRequests = (await client.statistics.readRequests(nativeSession.id)).items;
  assert.equal(nativeStarted.coverage, 'complete');
  assert.equal(nativeRequests[0].wireObservation, 'pending');
  finishNative();
  assert.equal((await client.runs.await(nativeRun.runId)).phase, 'completed');
  const nativeCompleted = await client.statistics.read(nativeSession.id);
  const nativeFinalRequests = (await client.statistics.readRequests(nativeSession.id)).items;
  assert.equal(nativeCompleted.coverage, 'complete');
  assert.deepEqual(nativeCompleted.issues, []);
  assert.equal(nativeFinalRequests[0].wireObservation, 'observed');
  assert.equal(nativeFinalRequests[0].requestId, nativeRequests[0].requestId);
  evidence.nativePending = {
    started: nativeStarted,
    startedRequests: nativeRequests,
    completed: nativeCompleted,
    completedRequests: nativeFinalRequests,
  };
} finally {
  finishOperation();
  finishNative();
  if (client) await client.disconnect();
  if (runtime) await runtime.close();
  unregister?.();
  clearRuntimeModelProviders();
  globalThis.fetch = originalFetch;
  if (previousEnv === undefined) delete process.env[fixtureEnv];
  else process.env[fixtureEnv] = previousEnv;
  await removeVerifiedTemp(temp);
}
evidence.completedAt = new Date().toISOString();
await writeFile(
  new URL('./kodax-0.7.97-alpha.2-statistics-evidence.json', import.meta.url),
  JSON.stringify(evidence, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify({
    version: evidence.version,
    checks: 'passed',
    ordinaryActorPhysicalRequests: 2,
    sandboxStates: sandboxSequence.map((row) => row.state),
    duplicateExecutions: 2,
    duplicateCompleted: 2,
    operationOnlyCoverage: evidence.operationOnly.started.coverage,
    nativePendingCoverage: evidence.nativePending.started.coverage,
    nativeFinalCoverage: evidence.nativePending.completed.coverage,
    sdkRetryAdapters: evidence.sdkRetries.map((row) => row.provider),
  }) + '\n',
);
