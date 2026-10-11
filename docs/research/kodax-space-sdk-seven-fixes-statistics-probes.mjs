// New positive verification. Historical expectViolation probes remain untouched.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildChildEvents } from '../../../KodaX/packages/coding/src/child-executor.ts';
import {
  createLiveTurnScope,
  withLiveTurnAttribution,
} from '../../../KodaX/packages/coding/src/agent-runtime/event-emitter.ts';
import { buildToolExecutionContext } from '../../../KodaX/packages/coding/src/agent-runtime/tool-execution-context.ts';
import { executeToolCall } from '../../../KodaX/packages/coding/src/agent-runtime/tool-dispatch.ts';
import { registerTool as registerSourceTool } from '../../../KodaX/packages/coding/src/tools/registry.ts';
import { KodaXAnthropicCompatProvider } from '../../../KodaX/packages/llm/src/providers/anthropic.ts';
import { KodaXOpenAICompatProvider } from '../../../KodaX/packages/llm/src/providers/openai.ts';
import { runWithProviderRequestObserver } from '../../../KodaX/packages/llm/src/provider-request-observation.ts';
import { withProviderRequestCredential } from '../../../KodaX/packages/llm/src/provider-credential-context.ts';
import { createExecutionFactsStore } from '../../../KodaX/src/execution-facts.ts';
import {
  registerCustomProviders,
  clearRuntimeModelProviders,
} from '../../../KodaX/packages/llm/dist/index.js';
import { registerTool } from '../../../KodaX/packages/coding/dist/index.js';
import { createKodaXRuntime } from '../../../KodaX/src/sdk-runtime.ts';
import { connectKodaXClient } from '../../../KodaX/src/sdk-client.ts';
import { startRuntimeDaemonHost } from '../../../KodaX/src/runtime-daemon/host.ts';
import {
  resolveRuntimeDaemonPaths,
  tryAcquireRuntimeDaemonLock,
} from '../../../KodaX/src/runtime-daemon/state.ts';

const evidence = {
  sourceSnapshot: 'a18e95d44864efb4db98f9d50bb30d6f6a6e32a37dd97dbbca9980c7dde122b8',
  rawChild: {},
  adapterCoverage: {},
  sdkRetries: [],
  publicClient: {},
};
const expectedSandbox = [
  { version: 1, state: 'not_selected' },
  { version: 1, state: 'fallback', reason: 'not_ready', execution: 'normal_permission_policy' },
];

// Same production source chain as child dispatch, including the actual per-call reporter.
const raw = { starts: [], executionStarts: [], results: [], sandbox: [] };
const rootScope = createLiveTurnScope({ sessionId: 'fixture-session', turnId: 'root-turn' });
const childScope = createLiveTurnScope({
  sessionId: 'fixture-session',
  turnId: 'child-turn',
  contextId: 'fixture-session/child/a',
  contextKind: 'child',
  agentId: '/root/a',
});
const parent = withLiveTurnAttribution(
  {
    onToolUseStart: (_tool, meta) => raw.starts.push(meta),
    onToolExecutionStart: (_tool, meta) => raw.executionStarts.push(meta),
    onToolResult: (_tool, meta) => raw.results.push(meta),
    onToolSandboxObservation: (update, meta) => raw.sandbox.push({ update, meta }),
    onContextBudgetSnapshot: (event) => {
      raw.context = event;
    },
  },
  rootScope,
);
const child = withLiveTurnAttribution(
  buildChildEvents('/root/a', undefined, undefined, undefined, parent),
  childScope,
);
const context = buildToolExecutionContext({
  options: { events: child, context: { executionCwd: os.tmpdir() } },
  runtime: undefined,
  sessionId: 'fixture-session',
  managedProtocolPayloadRef: { current: undefined },
});
let reporterPresent = false;
const unregisterSource = registerSourceTool({
  name: 'seven_fixes_raw_fixture',
  description: 'Offline observation fixture',
  sideEffect: 'readonly',
  input_schema: { type: 'object', properties: {} },
  handler: async (_input, ctx) => {
    reporterPresent = typeof ctx.reportToolSandboxObservation === 'function';
    for (const observation of expectedSandbox) ctx.reportToolSandboxObservation(observation);
    return 'raw fixture';
  },
});
try {
  await executeToolCall(
    child,
    { id: 'source-call', name: 'seven_fixes_raw_fixture', input: {} },
    context,
    {},
  );
  child.onToolResult({
    id: 'source-call',
    name: 'seven_fixes_raw_fixture',
    content: 'raw fixture',
    toolResult: { content: 'raw fixture', is_error: false },
  });
  child.onContextBudgetSnapshot({
    contextId: childScope.contextId,
    contextKind: 'child',
    contextRevision: 0,
    pressure: 'low',
  });
  assert.ok(reporterPresent);
  for (const meta of [
    ...raw.starts,
    ...raw.executionStarts,
    ...raw.results,
    ...raw.sandbox.map((row) => row.meta),
  ])
    assert.equal(meta.turnId, 'child-turn');
  assert.deepEqual(
    raw.sandbox.map((row) => row.update.observation),
    expectedSandbox,
  );
  assert.equal(raw.context.turnId, 'child-turn');
  evidence.rawChild = { reporterPresent, ...raw };
} finally {
  unregisterSource();
}

const temp = await mkdtemp(path.join(os.tmpdir(), 'kodax-seven-fixes-statistics-'));
async function cleanupTemp(target) {
  const absolute = path.resolve(target);
  const tempRoot = path.resolve(os.tmpdir());
  assert.ok(absolute.startsWith(tempRoot + path.sep));
  assert.ok(path.basename(absolute).startsWith('kodax-seven-fixes-statistics-'));
  await rm(absolute, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
const originalFetch = globalThis.fetch;
try {
  const owner = {
    ownerId: 'fixture-owner',
    runtimeId: 'fixture-runtime',
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  const store = createExecutionFactsStore(temp, owner);
  const target = { kind: 'run', runId: 'fixture-root' };
  store.created('custom-fixture');
  let releaseCustom;
  const waitCustom = new Promise((resolve) => {
    releaseCustom = resolve;
  });
  const custom = runWithProviderRequestObserver(
    (fact) => store.provider('custom-fixture', target, fact),
    () =>
      withProviderRequestCredential('custom-fixture', 'primary', undefined, async () => {
        await waitCustom;
        return { usage: { inputTokens: 2, outputTokens: 1 } };
      }),
  );
  const customStarted = await store.service.read('custom-fixture');
  assert.equal(customStarted.coverage, 'partial');
  assert.equal(customStarted.operationCount, 1);
  assert.equal(customStarted.physicalRequestCount, 0);
  assert.ok(customStarted.issues.length > 0);
  assert.equal(
    (await store.service.readRequests('custom-fixture')).items[0].wireObservation,
    'unavailable',
  );
  releaseCustom();
  await custom;
  evidence.adapterCoverage.customStarted = customStarted;
  evidence.adapterCoverage.customCompleted = await store.service.read('custom-fixture');

  let releaseNative;
  const waitNative = new Promise((resolve) => {
    releaseNative = resolve;
  });
  class NativeOpenAI extends KodaXOpenAICompatProvider {
    name = 'seven-fixes-native-openai';
    config = { model: 'fixture', baseUrl: 'https://fixture.invalid', supportsThinking: false };
    getApiKey() {
      return 'offline-fixture';
    }
    async buildClient() {
      await waitNative;
      return super.buildClient();
    }
  }
  class NativeAnthropic extends KodaXAnthropicCompatProvider {
    name = 'seven-fixes-native-anthropic';
    config = { model: 'fixture', baseUrl: 'https://fixture.invalid', supportsThinking: false };
    getApiKey() {
      return 'offline-fixture';
    }
  }
  for (const Provider of [NativeOpenAI, NativeAnthropic]) {
    const provider = new Provider();
    const sessionId = provider.name;
    store.created(sessionId);
    const observations = [];
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      if (fetchCount === 1)
        return new Response(
          JSON.stringify({ error: { message: 'offline retry', type: 'overloaded_error' } }),
          { status: 503, headers: { 'content-type': 'application/json', 'retry-after-ms': '1' } },
        );
      const data =
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
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const running = runWithProviderRequestObserver(
      (fact) => {
        observations.push(fact);
        store.provider(sessionId, target, fact);
      },
      () =>
        withProviderRequestCredential(provider.name, 'fallback', undefined, () =>
          provider.complete([{ role: 'user', content: 'fixture' }], [], 'fixture', false, {
            maxOutputTokensOverride: 16,
          }),
        ),
    );
    if (Provider === NativeOpenAI) {
      const pending = await store.service.read(sessionId);
      const pendingRows = await store.service.readRequests(sessionId);
      assert.equal(pending.coverage, 'complete');
      assert.equal(pendingRows.items[0].wireObservation, 'pending');
      assert.equal(fetchCount, 0);
      evidence.adapterCoverage.nativePending = { statistics: pending, requests: pendingRows.items };
      releaseNative();
    }
    await running;
    const final = await store.service.readRequests(sessionId);
    const statistics = await store.service.read(sessionId);
    assert.equal(fetchCount, 2);
    assert.deepEqual(
      final.items.map((row) => [row.attempt, row.boundary, row.wireObservation, row.state]),
      [
        [1, 'physical_attempt', 'observed', 'failed'],
        [2, 'physical_attempt', 'observed', 'succeeded'],
      ],
    );
    assert.equal(final.items[0].requestId, observations[0].requestId);
    assert.equal(statistics.coverage, 'complete');
    assert.deepEqual(statistics.issues, []);
    assert.equal(statistics.usage.totalTokens, 12);
    evidence.sdkRetries.push({
      provider: provider.name,
      fetchCount,
      requests: final.items,
      statistics,
    });
  }

  const executions = [];
  const unregister = registerTool({
    name: 'seven_fixes_statistics_fixture',
    description: 'Offline fixture evidence',
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
      const observations =
        label === 'child'
          ? expectedSandbox
          : [label === 'two' ? expectedSandbox[1] : expectedSandbox[0]];
      for (const observation of observations) ctx.reportToolSandboxObservation(observation);
      return `result-${label}`;
    },
  });
  const savedFixtureEnv = process.env.KODAX_SEVEN_FIXES_STATISTICS_FIXTURE;
  process.env.KODAX_SEVEN_FIXES_STATISTICS_FIXTURE = 'offline-fixture';
  const runtime = await createKodaXRuntime({
    homeDir: temp,
    sharedDaemonHost: true,
    defaultProvider: 'seven-fixes-rpc-native',
  });
  registerCustomProviders([
    {
      name: 'seven-fixes-rpc-native',
      protocol: 'openai',
      baseUrl: 'https://fixture.invalid/v1',
      apiKeyEnv: 'KODAX_SEVEN_FIXES_STATISTICS_FIXTURE',
      model: 'fixture',
      maxOutputTokens: 16,
    },
  ]);
  const daemonPaths = resolveRuntimeDaemonPaths(temp);
  const lock = tryAcquireRuntimeDaemonLock(daemonPaths, {
    runtimeId: runtime.identity.runtimeId,
    pid: process.pid,
    createdAt: runtime.identity.startedAt,
  });
  assert.ok(lock);
  const endpoint = {
    kind: process.platform === 'win32' ? 'pipe' : 'unix',
    path:
      process.platform === 'win32'
        ? `\\\\.\\pipe\\kodax-seven-fixes-statistics-${randomUUID()}`
        : path.join(temp, 'host.sock'),
  };
  const host = await startRuntimeDaemonHost({ runtime, paths: daemonPaths, lock, endpoint });
  const client = await connectKodaXClient({ homeDir: temp, endpoint: endpoint.path });
  try {
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
        body.tools?.some((tool) => tool.function?.name === 'seven_fixes_statistics_fixture') &&
        (text.includes('CHILD_FACT_PROBE') || text.includes('DUPLICATE_FACT_PROBE'))
      ) {
        calls = (text.includes('DUPLICATE_FACT_PROBE') ? ['one', 'two'] : ['child']).map(
          (label) => ({
            name: 'seven_fixes_statistics_fixture',
            id: 'reused-provider-id',
            input: { label },
          }),
        );
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
        : { content: 'Offline native fixture completed.' };
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
    const childSession = await client.sessions.create({ projectPath: temp });
    await client.sessions.updateSettings(childSession.id, {
      provider: 'seven-fixes-rpc-native',
      agentMode: 'ama',
      permissionMode: 'full-access',
    });
    const root = await client.inputs.submit({
      sessionId: childSession.id,
      inputId: 'ordinary-root',
      text: 'ROOT_SPAWN_PROBE',
    });
    const outcome = await client.runs.await(root.runId);
    assert.equal(outcome.phase, 'completed', JSON.stringify(outcome));
    const tree = await client.agents.tree(childSession.id);
    const actor = tree.actors.find((row) => row.path === '/root/audit-child');
    assert.ok(actor);
    const actorTarget = {
      kind: 'actor_turn',
      actorPath: actor.path,
      turnId: actor.turnIds.at(-1),
      parentRunId: root.runId,
    };
    const statistics = await client.statistics.read(childSession.id);
    const requests = (await client.statistics.readRequests(childSession.id)).items;
    const tools = (await client.statistics.readTools(childSession.id)).items;
    const childRequests = requests.filter((row) => row.attribution?.kind === 'actor_turn');
    assert.equal(childRequests.length, 2);
    for (const row of childRequests) {
      assert.deepEqual(row.target, actorTarget);
      assert.equal(row.boundary, 'physical_attempt');
    }
    const childTool = tools.find((row) => row.name === 'seven_fixes_statistics_fixture');
    assert.ok(childTool);
    assert.deepEqual(childTool.target, actorTarget);
    assert.equal(childTool.state, 'completed');
    assert.equal(childTool.result, 'succeeded');
    assert.deepEqual(childTool.sandbox, expectedSandbox);
    const budget = statistics.contexts.find(
      (row) => row.agentId === actor.path && row.contextKind === 'child',
    );
    assert.ok(budget);
    assert.deepEqual(budget.target, actorTarget);
    assert.equal(budget.turnId, actorTarget.turnId);
    evidence.publicClient.ordinaryAmbientChild = {
      rootRunId: root.runId,
      actorTarget,
      executions: [...executions],
      statistics,
      requests,
      tools,
    };

    executions.length = 0;
    const session = await client.sessions.create({ projectPath: temp });
    await client.sessions.updateSettings(session.id, {
      provider: 'seven-fixes-rpc-native',
      agentMode: 'sa',
      permissionMode: 'full-access',
    });
    const submitted = await client.inputs.submit({
      sessionId: session.id,
      inputId: 'duplicate-batch',
      text: 'DUPLICATE_FACT_PROBE',
    });
    const result = await client.runs.await(submitted.runId);
    assert.equal(result.phase, 'completed');
    assert.deepEqual([...executions].sort(), ['one', 'two']);
    const facts = (await client.statistics.readTools(session.id)).items.filter(
      (row) => row.name === 'seven_fixes_statistics_fixture',
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
    const blocks = result.result.messages.flatMap((message) =>
      Array.isArray(message.content)
        ? message.content.filter((block) => block.type === 'tool_result')
        : [],
    );
    assert.deepEqual(
      blocks.map((block) => block.content),
      ['result-one', 'result-two'],
    );
    assert.deepEqual(
      blocks.map((block) => block.metadata?.outputPath),
      [path.join(temp, 'one-output.txt'), path.join(temp, 'two-output.txt')],
    );
    const history = await client.sessions.readHistory(session.id);
    evidence.publicClient.duplicates = {
      executions: [...executions],
      facts,
      canonicalResults: blocks,
      history,
    };
  } finally {
    await client.disconnect();
    await host.close();
    await runtime.close();
    unregister();
    clearRuntimeModelProviders();
    if (savedFixtureEnv === undefined) delete process.env.KODAX_SEVEN_FIXES_STATISTICS_FIXTURE;
    else process.env.KODAX_SEVEN_FIXES_STATISTICS_FIXTURE = savedFixtureEnv;
  }
} finally {
  globalThis.fetch = originalFetch;
  await cleanupTemp(temp);
}

evidence.finishedAt = new Date().toISOString();
await writeFile(
  new URL('./kodax-space-sdk-seven-fixes-statistics-probe-evidence.json', import.meta.url),
  JSON.stringify(evidence, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify({
    checks: 'passed',
    rawChildTurn: 'child-turn',
    childSandboxStates: expectedSandbox.map((row) => row.state),
    ordinaryChildNativeRequests: evidence.publicClient.ordinaryAmbientChild.requests.filter(
      (row) => row.attribution?.kind === 'actor_turn',
    ).length,
    duplicateExecutions: evidence.publicClient.duplicates.executions.length,
    duplicateCompleted: evidence.publicClient.duplicates.facts.filter(
      (row) => row.state === 'completed',
    ).length,
    customCoverage: evidence.adapterCoverage.customStarted.coverage,
    nativePendingCoverage: evidence.adapterCoverage.nativePending.statistics.coverage,
  }) + '\n',
);
