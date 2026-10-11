// Isolated offline acceptance of the three previous lifecycle counterexamples.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const product = await import('../../../KodaX/dist/sdk-client.js');
const runtimeSDK = await import('../../../KodaX/dist/sdk-runtime.js');
const sourceRuntime = await import('../../../KodaX/src/sdk-runtime.ts');
const sourceProduct = await import('../../../KodaX/src/sdk-client.ts');
const llm = await import('../../../KodaX/src/sdk-llm.ts');
const { startRuntimeDaemonHost } = await import('../../../KodaX/src/runtime-daemon/host.ts');
const { resolveRuntimeDaemonPaths, tryAcquireRuntimeDaemonLock } =
  await import('../../../KodaX/src/runtime-daemon/state.ts');

async function until(read, predicate, timeout = 6000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await delay(20);
  } while (Date.now() < deadline);
  throw new Error(`Fixture deadline exceeded: ${JSON.stringify(value)}`);
}

async function removeFixture(directory) {
  const target = path.resolve(directory);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith('kodax-seven-fixes-'));
  await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

async function peerProtection() {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'kodax-seven-fixes-peer-'));
  const clientInfo = {
    name: 'exiting-client',
    instanceId: randomUUID(),
    instanceSecret: randomUUID(),
  };
  let own;
  let peer;
  try {
    own = await product.ensureKodaXClient({ homeDir, clientInfo });
    peer = await product.connectKodaXClient({
      homeDir,
      clientInfo: {
        name: 'foreign-idle-peer',
        instanceId: randomUUID(),
        instanceSecret: randomUUID(),
      },
    });
    await peer.sessions.create({ projectPath: homeDir });
    assert.equal(
      (await own.lifecycle.requestExit({ requestId: 'immediate-disconnect', shutdownHost: true }))
        .accepted,
      true,
    );
    await own.disconnect();
    own = undefined;
    const receipt = await until(
      async () =>
        (await product.readKodaXClientExits({ homeDir, clientInfo })).find(
          (row) => row.requestId === 'immediate-disconnect',
        ),
      (row) => row?.host.state === 'protected',
    );
    assert.equal(receipt.cleanup.state, 'succeeded');
    const liveSession = await peer.sessions.create({
      projectPath: homeDir,
      title: 'Peer remains usable',
    });
    assert.ok(liveSession.id);
    return { source: 'rebuilt SDK and actual detached Host', receipt, peerStillUsable: true };
  } finally {
    await own?.disconnect();
    if (peer) {
      await peer.host.shutdown();
      await peer.disconnect();
    }
    await delay(150);
    await removeFixture(homeDir);
  }
}

async function exitedContinuation() {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'kodax-seven-fixes-continuation-'));
  const clientInfo = {
    name: 'exiting-client',
    instanceId: randomUUID(),
    instanceSecret: randomUUID(),
  };
  let release;
  let calls = 0;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const server = createServer(async (request, response) => {
    for await (const chunk of request) {
      assert.ok(chunk);
    }
    calls += 1;
    await held;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(
      'data: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"fixture","choices":[{"index":0,"delta":{"content":"fixture complete"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const keyName = 'KODAX_SEVEN_FIXES_CONTINUATION';
  const previous = process.env[keyName];
  process.env[keyName] = 'offline-fixture';
  let own;
  let peer;
  let low;
  try {
    await mkdir(path.join(homeDir, '.kodax'));
    await writeFile(
      path.join(homeDir, '.kodax/config.json'),
      JSON.stringify({
        provider: 'continuation-fixture',
        agentMode: 'sa',
        permissionMode: 'full-access',
        customProviders: [
          {
            name: 'continuation-fixture',
            protocol: 'openai',
            baseUrl: `http://127.0.0.1:${address.port}/v1`,
            apiKeyEnv: keyName,
            model: 'fixture',
          },
        ],
      }),
    );
    own = await product.ensureKodaXClient({ homeDir, clientInfo });
    peer = await product.connectKodaXClient({
      homeDir,
      clientInfo: {
        name: 'foreign-client',
        instanceId: randomUUID(),
        instanceSecret: randomUUID(),
      },
    });
    const session = await peer.sessions.create({ projectPath: homeDir });
    await peer.sessions.updateSettings(session.id, {
      provider: 'continuation-fixture',
      agentMode: 'sa',
      permissionMode: 'full-access',
    });
    const foreign = await peer.inputs.submit({
      sessionId: session.id,
      inputId: 'foreign',
      text: 'Wait for the fixture.',
    });
    await until(
      async () => calls,
      (value) => value > 0,
      10000,
    );
    await own.lifecycle.requestExit({ requestId: 'quit' });
    await until(
      () => own.lifecycle.readExit('quit'),
      (row) => row?.cleanup.state === 'succeeded',
    );
    await own.disconnect();
    own = undefined;
    low = await runtimeSDK.connectKodaXRuntime({ homeDir, autoStart: false, clientInfo });
    const refused = [];
    for (const delivery of ['after_turn', 'interrupt']) {
      await assert.rejects(
        low.runs.submitInput({
          sessionId: session.id,
          afterRunId: foreign.runId,
          delivery,
          input: { type: 'text', text: 'Late intent from an exited identity.' },
        }),
        (error) => error.code === 'conflict',
      );
      refused.push(delivery);
    }
    assert.equal((await peer.runs.read(foreign.runId)).phase, 'running');
    release();
    assert.equal((await peer.runs.await(foreign.runId)).phase, 'completed');
    return {
      source: 'rebuilt SDK and actual detached Host with localhost HTTP fixture',
      refused,
      errorCode: 'conflict',
      foreignRunCompleted: true,
    };
  } finally {
    release();
    await own?.disconnect();
    await low?.close();
    if (peer) {
      await peer.host.shutdown();
      await peer.disconnect();
    }
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env[keyName];
    else process.env[keyName] = previous;
    await delay(150);
    await removeFixture(homeDir);
  }
}

async function compactionRecovery() {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'kodax-seven-fixes-compaction-'));
  const keyName = 'KODAX_SEVEN_FIXES_COMPACTION';
  const previous = process.env[keyName];
  process.env[keyName] = 'offline-fixture';
  let mode = 'warm';
  let runEntered = false;
  let compactEntered = false;
  let releaseCompact;
  class Provider extends llm.KodaXBaseProvider {
    name = 'compaction-fixture';
    supportsThinking = false;
    config = { apiKeyEnv: keyName, model: 'fixture', supportsThinking: false };
    async stream(_messages, _tools, _system, _reasoning, _options, signal) {
      if (mode === 'run') {
        runEntered = true;
        await new Promise((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelled', 'AbortError')),
            { once: true },
          ),
        );
      } else if (mode === 'compact') {
        compactEntered = true;
        await new Promise((resolve) => {
          releaseCompact = resolve;
        });
      }
      return {
        textBlocks: [{ type: 'text', text: 'Offline context fixture.' }],
        thinkingBlocks: [],
        toolBlocks: [],
        stopReason: 'end_turn',
      };
    }
  }
  const unregister = llm.registerModelProvider('compaction-fixture', () => new Provider());
  let runtime;
  let host;
  let client;
  let compact;
  try {
    runtime = await sourceRuntime.createKodaXRuntime({
      homeDir,
      sharedDaemonHost: true,
      defaultProvider: 'compaction-fixture',
    });
    const paths = resolveRuntimeDaemonPaths(homeDir);
    const lock = tryAcquireRuntimeDaemonLock(paths, {
      runtimeId: runtime.identity.runtimeId,
      pid: process.pid,
      createdAt: runtime.identity.startedAt,
    });
    assert.ok(lock);
    const endpoint = {
      kind: process.platform === 'win32' ? 'pipe' : 'unix',
      path:
        process.platform === 'win32'
          ? `\\\\.\\pipe\\kodax-seven-fixes-${randomUUID()}`
          : path.join(homeDir, 'host.sock'),
    };
    host = await startRuntimeDaemonHost({ runtime, paths, lock, endpoint });
    client = await sourceProduct.connectKodaXClient({
      homeDir,
      endpoint: endpoint.path,
      clientInfo: {
        name: 'compaction-fixture',
        instanceId: randomUUID(),
        instanceSecret: randomUUID(),
      },
    });
    const session = await client.sessions.create({ projectPath: homeDir });
    const busy = await client.sessions.create({ projectPath: homeDir });
    for (const item of [session, busy])
      await client.sessions.updateSettings(item.id, {
        provider: 'compaction-fixture',
        agentMode: 'sa',
        permissionMode: 'full-access',
      });
    for (let index = 0; index < 3; index += 1) {
      const input = await client.inputs.submit({
        sessionId: session.id,
        inputId: `warm-${index}`,
        text: 'Preserve ownership evidence. '.repeat(700),
      });
      assert.equal((await client.runs.await(input.runId)).phase, 'completed');
    }
    await client.sessions.updateSettings(session.id, { compactionTriggerTokens: 5000 });
    const before = await client.sessions.readHistory(session.id);
    mode = 'run';
    const run = await client.inputs.submit({
      sessionId: busy.id,
      inputId: 'busy',
      text: 'Wait for cancellation.',
    });
    await until(async () => runEntered, Boolean);
    mode = 'compact';
    compact = client.sessions.compact(session.id).catch((error) => ({ error: error.message }));
    await until(async () => compactEntered, Boolean);
    await client.lifecycle.requestExit({ requestId: 'quit' });
    const stopped = await until(
      () => client.runs.read(run.runId),
      (row) => row.phase !== 'running',
      4000,
    );
    const uncertain = await until(
      () => client.lifecycle.readExit('quit'),
      (row) => row?.cleanup.state === 'unknown',
    );
    assert.equal(uncertain.cleanup.operationIds.length, 1);
    assert.ok(uncertain.cleanup.runIds.includes(run.runId));
    assert.ok((await client.lifecycle.listPendingExits()).some((row) => row.requestId === 'quit'));
    releaseCompact();
    await compact;
    assert.equal(
      (await client.sessions.readHistory(session.id)).sourceRevision,
      before.sourceRevision,
    );
    await client.lifecycle.requestExit({ requestId: 'quit' });
    const recovered = await until(
      () => client.lifecycle.readExit('quit'),
      (row) => row?.cleanup.state === 'succeeded',
    );
    assert.ok(recovered.cleanup.operationIds.includes(uncertain.cleanup.operationIds[0]));
    return {
      source: 'source SDK and actual socket Host, offline custom Provider',
      ownRunPhase: stopped.phase,
      uncertain,
      recovered,
      abortedCompactionDidNotRewriteHistory: true,
    };
  } finally {
    releaseCompact?.();
    await compact;
    await client?.disconnect();
    await host?.close();
    await runtime?.close();
    unregister();
    if (previous === undefined) delete process.env[keyName];
    else process.env[keyName] = previous;
    await removeFixture(homeDir);
  }
}

const evidence = {
  peerProtection: await peerProtection(),
  exitedContinuation: await exitedContinuation(),
  compactionRecovery: await compactionRecovery(),
};
await writeFile(
  new URL('./kodax-space-sdk-seven-fixes-lifecycle-evidence.json', import.meta.url),
  JSON.stringify(evidence, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify({
    status: 'passed',
    lifecycleCounterexamplesClosed: 3,
    continuationDeliveriesRefused: evidence.exitedContinuation.refused,
    compactionStateBeforeRelease: evidence.compactionRecovery.uncertain.cleanup.state,
    compactionStateAfterRetry: evidence.compactionRecovery.recovered.cleanup.state,
  }) + '\n',
);
