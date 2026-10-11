// Offline fixture audit. No provider network traffic or real user Session.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildChildEvents } from '../../../KodaX/packages/coding/src/child-executor.ts';
import {
  createLiveTurnScope,
  withLiveTurnAttribution,
} from '../../../KodaX/packages/coding/src/agent-runtime/event-emitter.ts';
import { KodaXAnthropicCompatProvider } from '../../../KodaX/packages/llm/src/providers/anthropic.ts';
import { KodaXOpenAICompatProvider } from '../../../KodaX/packages/llm/src/providers/openai.ts';
import { runWithProviderRequestObserver } from '../../../KodaX/packages/llm/src/provider-request-observation.ts';
import { withProviderRequestCredential } from '../../../KodaX/packages/llm/src/provider-credential-context.ts';
import { createExecutionFactsStore } from '../../../KodaX/src/execution-facts.ts';
import { buildToolExecutionContext } from '../../../KodaX/packages/coding/src/agent-runtime/tool-execution-context.ts';
import { executeToolCall } from '../../../KodaX/packages/coding/src/agent-runtime/tool-dispatch.ts';
import { registerTool } from '../../../KodaX/packages/coding/src/tools/registry.ts';
import { CodingActorSession } from '../../../KodaX/packages/coding/src/agent-runtime/actor-runtime.ts';
import {
  registerCustomProviders,
  clearRuntimeModelProviders,
  runWithProviderRequestObserver as packageObserver,
} from '../../../KodaX/packages/llm/dist/index.js';
import { randomUUID } from 'node:crypto';
import { createKodaXRuntime } from '../../../KodaX/src/sdk-runtime.ts';
import { connectKodaXClient } from '../../../KodaX/src/sdk-client.ts';
import { startRuntimeDaemonHost } from '../../../KodaX/src/runtime-daemon/host.ts';
import {
  resolveRuntimeDaemonPaths,
  tryAcquireRuntimeDaemonLock,
} from '../../../KodaX/src/runtime-daemon/state.ts';
import { registerTool as packageRegisterTool } from '../../../KodaX/packages/coding/dist/index.js';

const output = { childEvents: {}, nativeSdkRetry: [], activeOperation: {}, pagination: {} };
const childScope = createLiveTurnScope({
  sessionId: 'fixture-session',
  turnId: 'actual-child-turn',
  contextId: 'fixture-session/child/a',
  contextKind: 'child',
  agentId: '/root/a',
});
const sink = {};
const rawParent = {
  onToolUseStart: (_tool, meta) => {
    sink.prepared = meta;
  },
  onToolExecutionStart: (_tool, meta) => {
    sink.executing = meta;
  },
  onToolResult: (_tool, meta) => {
    sink.result = meta;
  },
  onToolSandboxObservation: () => {
    sink.sandboxObserved = true;
  },
  onContextBudgetSnapshot: (event) => {
    sink.context = event;
  },
};
const child = withLiveTurnAttribution(
  buildChildEvents('/root/a', undefined, undefined, undefined, rawParent),
  childScope,
);
child.onToolUseStart({ id: 'same-call', name: 'read' });
child.onToolExecutionStart({ id: 'same-call', name: 'read' });
child.onToolResult({
  id: 'same-call',
  name: 'read',
  content: 'ok',
  toolResult: { content: 'ok', is_error: false },
});
child.onToolSandboxObservation({
  id: 'same-call',
  observation: { version: 1, state: 'not_selected' },
});
assert.equal(sink.prepared.turnId, undefined);
assert.equal(sink.executing.turnId, 'actual-child-turn');
assert.equal(sink.result.turnId, undefined);
assert.equal(sink.sandboxObserved, undefined);
output.childEvents.rawParent = sink;

const projected = {};
const rootScope = createLiveTurnScope({ sessionId: 'fixture-session', turnId: 'root-turn' });
const attributedParent = withLiveTurnAttribution(
  {
    onToolExecutionStart: (_tool, meta) => {
      projected.tool = meta;
    },
    onContextBudgetSnapshot: (event) => {
      projected.context = event;
    },
  },
  rootScope,
);
const nested = withLiveTurnAttribution(
  buildChildEvents('/root/a', undefined, undefined, undefined, attributedParent),
  childScope,
);
nested.onToolExecutionStart({ id: 'a', name: 'read' });
nested.onContextBudgetSnapshot({
  contextId: childScope.contextId,
  contextKind: 'child',
  contextRevision: 0,
  pressure: 'low',
});
assert.equal(projected.tool.turnId, 'root-turn');
assert.equal(projected.context.turnId, 'root-turn');
assert.equal(projected.context.contextKind, 'child');
output.childEvents.attributedParent = projected;

// Trace the actual per-tool reporter after the child creates its fresh runtime context.
let reporterPresent = false;
const childCtx = buildToolExecutionContext({
  options: { events: child, context: { executionCwd: os.tmpdir() } },
  runtime: undefined,
  sessionId: 'fixture-session',
  managedProtocolPayloadRef: { current: undefined },
});
assert.equal(childCtx.reportToolSandboxObservation, undefined);
const unregister = registerTool({
  name: 'audit_observation_fixture',
  description: 'Offline observation fixture',
  input_schema: { type: 'object', properties: {} },
  sideEffect: 'readonly',
  handler: async (_input, ctx) => {
    reporterPresent = typeof ctx.reportToolSandboxObservation === 'function';
    ctx.reportToolSandboxObservation?.({ version: 1, state: 'not_selected' });
    return 'fixture';
  },
});
try {
  await executeToolCall(
    child,
    { id: 'reporter-fixture', name: 'audit_observation_fixture', input: {} },
    childCtx,
    {},
  );
} finally {
  unregister();
}
assert.equal(reporterPresent, true);
assert.equal(sink.sandboxObserved, undefined);
output.childEvents.dispatchedReporterPresent = reporterPresent;
output.childEvents.dispatchedReporterReachedParent = false;

class AnthropicFixture extends KodaXAnthropicCompatProvider {
  name = 'anthropic-audit-fixture';
  config = { model: 'fixture', baseUrl: 'https://fixture.invalid', supportsThinking: false };
  getApiKey() {
    return 'not-a-real-key';
  }
}
class OpenAIFixture extends KodaXOpenAICompatProvider {
  name = 'openai-audit-fixture';
  config = { model: 'fixture', baseUrl: 'https://fixture.invalid', supportsThinking: false };
  getApiKey() {
    return 'not-a-real-key';
  }
}
const originalFetch = globalThis.fetch;
try {
  for (const Provider of [AnthropicFixture, OpenAIFixture]) {
    const provider = new Provider();
    let fetches = 0;
    const facts = [];
    globalThis.fetch = async () => {
      fetches += 1;
      if (fetches === 1)
        return new Response(
          JSON.stringify({ error: { message: 'fixture retry', type: 'overloaded_error' } }),
          { status: 503, headers: { 'content-type': 'application/json', 'retry-after-ms': '1' } },
        );
      const data =
        Provider === AnthropicFixture
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
    const result = await runWithProviderRequestObserver(
      (fact) => facts.push(fact),
      () =>
        withProviderRequestCredential(provider.name, 'fallback', undefined, () =>
          provider.complete([{ role: 'user', content: 'fixture' }], [], 'fixture', false, {
            maxOutputTokensOverride: 16,
          }),
        ),
    );
    const final = [...new Map(facts.map((fact) => [fact.requestId, fact])).values()];
    assert.equal(fetches, 2);
    assert.equal(final.length, 2);
    assert.deepEqual(
      final.map((fact) => [fact.attempt, fact.boundary, fact.state]),
      [
        [1, 'physical_attempt', 'failed'],
        [2, 'physical_attempt', 'succeeded'],
      ],
    );
    assert.equal(final[0].requestId, facts[0].requestId);
    assert.equal(final[1].usage.totalTokens, result.usage.totalTokens);
    output.nativeSdkRetry.push({
      provider: provider.name,
      fetches,
      facts: final,
      usage: result.usage,
    });
  }
} finally {
  globalThis.fetch = originalFetch;
}

const temp = await mkdtemp(path.join(os.tmpdir(), 'kodax-statistics-audit-'));
try {
  const owner = {
    ownerId: 'fixture-owner',
    runtimeId: 'fixture-runtime',
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  const store = createExecutionFactsStore(temp, owner);
  store.created('fixture-session');
  const fact = {
    requestId: 'fixture-operation',
    logicalRequestId: 'logical-fixture',
    provider: 'custom-fixture',
    purpose: 'primary',
    attempt: 1,
    boundary: 'provider_operation',
    dispatch: 'unknown',
    state: 'started',
    startedAt: new Date().toISOString(),
  };
  let releaseCustom;
  const customPending = new Promise((resolve) => {
    releaseCustom = resolve;
  });
  const customOperation = runWithProviderRequestObserver(
    (observation) =>
      store.provider('fixture-session', { kind: 'run', runId: 'fixture-run' }, observation),
    () =>
      withProviderRequestCredential('custom-fixture', 'primary', undefined, async () => {
        await customPending;
        return { usage: { inputTokens: 2, outputTokens: 1 } };
      }),
  );
  output.activeOperation = await store.service.read('fixture-session');
  assert.equal(output.activeOperation.coverage, 'complete');
  assert.equal(output.activeOperation.operationCount, 1);
  releaseCustom();
  await customOperation;
  output.completedCustomOperation = await store.service.read('fixture-session');
  assert.equal(output.completedCustomOperation.coverage, 'partial');
  for (let i = 0; i < 3; i++)
    store.provider(
      'fixture-session',
      { kind: 'run', runId: 'fixture-run' },
      {
        ...fact,
        requestId: `fact-${i}`,
        boundary: 'physical_attempt',
        dispatch: 'dispatched',
        state: 'succeeded',
        usage: { inputTokens: i, outputTokens: 1 },
      },
    );
  const first = await store.service.readRequests('fixture-session', { limit: 2 });
  store.provider(
    'fixture-session',
    { kind: 'run', runId: 'fixture-run' },
    { ...fact, requestId: 'later', state: 'succeeded' },
  );
  const second = await store.service.readRequests('fixture-session', {
    limit: 2,
    cursor: first.nextCursor,
  });
  assert.deepEqual(
    second.items.map((row) => row.requestId),
    ['fact-1', 'fact-2'],
  );
  assert.equal(second.nextCursor, undefined);
  output.pagination = {
    firstIds: first.items.map((row) => row.requestId),
    secondIds: second.items.map((row) => row.requestId),
    newEntryExcluded: true,
    totals: await store.service.read('fixture-session'),
  };

  const savedDummy = process.env.KODAX_STATISTICS_AUDIT_DUMMY_KEY;
  const actorFacts = [];
  const actor = new CodingActorSession({ sessionId: 'fixture-session' });
  const stubFetch = globalThis.fetch;
  try {
    process.env.KODAX_STATISTICS_AUDIT_DUMMY_KEY = 'not-a-real-key';
    await writeFile(path.join(temp, 'read-fixture.txt'), 'offline fixture');
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      const alreadyRead = body.messages.some((message) => message.role === 'tool');
      const delta = alreadyRead
        ? { content: 'Offline actor fixture completed.' }
        : {
            tool_calls: [
              {
                index: 0,
                id: 'actor-read',
                type: 'function',
                function: {
                  name: 'read',
                  arguments: JSON.stringify({ path: path.join(temp, 'read-fixture.txt') }),
                },
              },
            ],
          };
      return new Response(
        `data: ${JSON.stringify({
          id: 'fixture',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'fixture',
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
          choices: [{ index: 0, delta, finish_reason: alreadyRead ? 'stop' : 'tool_calls' }],
        })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    };
    registerCustomProviders([
      {
        name: 'actor-audit-fixture',
        protocol: 'openai',
        baseUrl: 'https://fixture.invalid/v1',
        apiKeyEnv: 'KODAX_STATISTICS_AUDIT_DUMMY_KEY',
        model: 'fixture',
        maxOutputTokens: 16,
      },
    ]);
    actor.attach(
      {
        gitRoot: temp,
        executionCwd: temp,
        sessionId: 'fixture-session',
        backups: new Map(),
        parentEvents: attributedParent,
        parentAgentConfig: { provider: 'actor-audit-fixture', model: 'fixture' },
      },
      { provider: 'actor-audit-fixture' },
    );
    const ref = await packageObserver(
      (fact) => actorFacts.push(fact),
      () =>
        actor.spawnRoot({
          taskName: 'audit-child',
          objective: 'Complete the offline fixture.',
          capabilities: {
            providers: ['actor-audit-fixture'],
            tools: ['read'],
            filesystem: 'write',
          },
        }),
    );
    const deadline = Date.now() + 10000;
    let state;
    do {
      await new Promise((resolve) => setTimeout(resolve, 20));
      state = actor.rootControl().output(ref.actorPath, ref.turnId).state;
    } while (state === 'running' && Date.now() < deadline);
    assert.equal(state, 'completed');
    const requests = [...new Map(actorFacts.map((fact) => [fact.requestId, fact])).values()];
    assert.ok(requests.length > 0);
    assert.ok(requests.every((fact) => fact.attribution === undefined));
    assert.equal(projected.tool.turnId, 'root-turn');
    assert.equal(projected.tool.childAgentId, ref.actorPath);
    assert.notEqual(projected.tool.turnId, ref.turnId);
    assert.equal(projected.context.contextKind, 'child');
    assert.equal(projected.context.turnId, 'root-turn');
    assert.equal(projected.context.childAgentId, undefined);
    output.actorWithoutLease = {
      ref,
      state,
      requests,
      eventProjection: structuredClone(projected),
    };
  } finally {
    await actor.close();
    clearRuntimeModelProviders();
    globalThis.fetch = stubFetch;
    if (savedDummy === undefined) delete process.env.KODAX_STATISTICS_AUDIT_DUMMY_KEY;
    else process.env.KODAX_STATISTICS_AUDIT_DUMMY_KEY = savedDummy;
  }

  // The public Product Client over a real local daemon; provider responses stay fully offline.
  const runtime = await createKodaXRuntime({
    homeDir: temp,
    sharedDaemonHost: true,
    defaultProvider: 'rpc-audit-fixture',
  });
  const daemonPaths = resolveRuntimeDaemonPaths(temp);
  const lock = tryAcquireRuntimeDaemonLock(daemonPaths, {
    runtimeId: runtime.identity.runtimeId,
    pid: process.pid,
    createdAt: runtime.identity.startedAt,
  });
  assert.ok(lock);
  const endpointPath =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\kodax-statistics-audit-${randomUUID()}`
      : path.join(temp, 'fixture.sock');
  const host = await startRuntimeDaemonHost({
    runtime,
    paths: daemonPaths,
    lock,
    endpoint: { kind: process.platform === 'win32' ? 'pipe' : 'unix', path: endpointPath },
  });
  let lease;
  const client = await connectKodaXClient({
    homeDir: temp,
    endpoint: endpointPath,
    async authorizeExecution(_request, services) {
      lease ??= await services.credentials.registerScoped(
        { providers: ['rpc-audit-fixture'] },
        async () => 'not-a-real-key',
      );
      return {
        credential: { mode: 'scoped', leaseId: lease.id, providers: ['rpc-audit-fixture'] },
        tools: ['read'],
      };
    },
  });
  const rpcOriginalFetch = globalThis.fetch;
  let requestedReads = 0;
  let actualExecutions = 0;
  const unregisterCountingTool = packageRegisterTool({
    name: 'audit_count_read',
    description: 'Offline fixture counter',
    input_schema: { type: 'object', properties: {} },
    sideEffect: 'readonly',
    handler: async () => {
      actualExecutions += 1;
      return `fixture invocation ${actualExecutions}`;
    },
  });
  try {
    await writeFile(path.join(temp, 'read-fixture.txt'), 'offline fixture');
    registerCustomProviders([
      {
        name: 'rpc-audit-fixture',
        protocol: 'openai',
        baseUrl: 'https://fixture.invalid/v1',
        apiKeyEnv: 'KODAX_NO_AMBIENT_STATISTICS_AUTHORIZATION',
        model: 'fixture',
        maxOutputTokens: 16,
      },
    ]);
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      const alreadyRead = body.messages.some((message) => message.role === 'tool');
      const actorRequest = JSON.stringify(body.messages).includes('INDEPENDENT-AUDIT-CHILD');
      const count = actorRequest ? 1 : 2;
      const delta = alreadyRead
        ? { content: 'Offline public client fixture completed.' }
        : {
            tool_calls: Array.from({ length: count }, (_, index) => ({
              index,
              id: 'reused-provider-id',
              type: 'function',
              function: {
                name: actorRequest ? 'read' : 'audit_count_read',
                arguments: JSON.stringify({ path: path.join(temp, 'read-fixture.txt') }),
              },
            })),
          };
      if (!alreadyRead) requestedReads += count;
      return new Response(
        `data: ${JSON.stringify({
          id: 'fixture',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'fixture',
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
          choices: [{ index: 0, delta, finish_reason: alreadyRead ? 'stop' : 'tool_calls' }],
        })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    };
    const session = await client.sessions.create({ projectPath: temp });
    await client.sessions.updateSettings(session.id, {
      provider: 'rpc-audit-fixture',
      agentMode: 'sa',
      permissionMode: 'full-access',
    });
    // The root path does not accept an Actor tools ceiling.
    const plain = await connectKodaXClient({
      homeDir: temp,
      endpoint: endpointPath,
      async authorizeExecution(_request, services) {
        const binding = await services.credentials.registerScoped(
          { providers: ['rpc-audit-fixture'] },
          async () => 'not-a-real-key',
        );
        return {
          credential: { mode: 'scoped', leaseId: binding.id, providers: ['rpc-audit-fixture'] },
        };
      },
    });
    try {
      const rootInput = await plain.inputs.submit({
        sessionId: session.id,
        inputId: 'duplicate-id-fixture',
        text: 'DUPLICATE-AUDIT-ROOT: Complete the fixture.',
      });
      const result = await plain.runs.await(rootInput.runId);
      assert.equal(result.phase, 'completed');
      const tools = (await plain.statistics.readTools(session.id)).items;
      assert.equal(actualExecutions, 2);
      assert.equal(tools.length, 2);
      assert.equal(tools.filter((tool) => tool.state === 'completed').length, 1);
      assert.equal(tools.filter((tool) => tool.state === 'prepared').length, 1);
      output.publicClientDuplicateTools = { requestedReads, actualExecutions, result, tools };
    } finally {
      await plain.disconnect();
    }
    const childSession = await client.sessions.create({ projectPath: temp });
    await client.sessions.updateSettings(childSession.id, {
      provider: 'rpc-audit-fixture',
      permissionMode: 'full-access',
    });
    const ref = await client.agents.spawn(childSession.id, {
      taskName: 'statistics-child',
      objective: 'INDEPENDENT-AUDIT-CHILD: Complete the fixture.',
      capabilities: { providers: ['rpc-audit-fixture'], tools: ['read'], filesystem: 'write' },
    });
    const deadline = Date.now() + 10000;
    let state;
    do {
      await new Promise((resolve) => setTimeout(resolve, 20));
      state = (await client.agents.output(childSession.id, ref.actorPath, ref.turnId)).state;
    } while (state === 'running' && Date.now() < deadline);
    assert.equal(state, 'completed');
    const tools = (await client.statistics.readTools(childSession.id)).items;
    assert.equal(tools.length, 1);
    assert.equal(tools[0].state, 'completed');
    assert.equal(tools[0].result, 'succeeded');
    output.publicClientChildTools = {
      ref,
      state,
      tools,
      requests: (await client.statistics.readRequests(childSession.id)).items,
      contexts: (await client.statistics.read(childSession.id)).contexts,
    };
  } finally {
    await client.disconnect();
    await host.close();
    await runtime.close();
    unregisterCountingTool();
    globalThis.fetch = rpcOriginalFetch;
    clearRuntimeModelProviders();
  }
} finally {
  const cleanupTarget = path.resolve(temp);
  assert.equal(path.dirname(cleanupTarget), path.resolve(os.tmpdir()));
  assert.ok(path.basename(cleanupTarget).startsWith('kodax-statistics-audit-'));
  await rm(cleanupTarget, { recursive: true, force: true });
}

await writeFile(
  new URL('./kodax-space-sdk-statistics-probe-evidence.json', import.meta.url),
  JSON.stringify(output, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify({
    checks: 'offline fixture assertions passed',
    retryAdapters: output.nativeSdkRetry.map((row) => row.provider),
    childSandboxForwarded: false,
    childPreparedAndResultTurnIds: 'missing',
    nestedToolTurnId: output.childEvents.attributedParent.tool.turnId,
    activeOperationCoverage: output.activeOperation.coverage,
  }) + '\n',
);
