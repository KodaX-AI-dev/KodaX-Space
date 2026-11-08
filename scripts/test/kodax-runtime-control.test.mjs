import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOwnedTestRuntime, stopOwnedTestRuntime } from './owned-runtime-fixture.mjs';

const gateExtension = `import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const marker = name => fileURLToPath(new URL(name, import.meta.url));
export default function activate(api) {
 api.registerTool({name:'space_control_gate',description:'Offline owner cancellation gate',
 sideEffect:'readonly',toClassifierInput:()=>'',input_schema:{type:'object',properties:{}},
 handler:async(_input,context)=>new Promise((resolve,reject)=>{
  if(!context.abortSignal) return reject(new Error('missing owner AbortSignal'));
  const finish=value=>{clearInterval(timer);context.abortSignal.removeEventListener('abort',onAbort);resolve(value);};
  const onAbort=()=>{fs.writeFileSync(marker('aborted'),'aborted');finish('[Cancelled] Operation cancelled by user');};
  const timer=setInterval(()=>{if(fs.existsSync(marker('release')))finish('done');},20);
  context.abortSignal.addEventListener('abort',onAbort,{once:true});
  fs.writeFileSync(marker('entered'),'entered');
  if(context.abortSignal.aborted)onAbort();
 })});
}`;

async function waitForGate(workspace) {
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      const marker = await readFile(path.join(workspace, 'entered'), 'utf8');
      if (marker === 'entered') return;
      // The other process can expose the newly created file before writing its bytes.
      assert.equal(marker, '', 'unexpected fixture gate marker');
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    assert.ok(Date.now() < deadline, 'actual Host did not enter fixture tool');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function fixture(t, extensionSource) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'space-sdk-control-'));
  // SDK protected writes reject 8.3-style segments and CI runner temp dirs are
  // short paths (C:\Users\RUNNER~1\...), so hand the SDK the resolved long path.
  const root = await realpath(temp);
  const workspace = path.join(root, 'workspace');
  await mkdir(workspace);
  if (extensionSource) {
    const extension = path.join(workspace, 'command.mjs');
    await writeFile(extension, extensionSource);
    await mkdir(path.join(root, 'home', '.kodax'), { recursive: true });
    await writeFile(
      path.join(root, 'home', '.kodax', 'config.json'),
      JSON.stringify({ extensions: [extension] }),
    );
  }
  const runtime = await createOwnedTestRuntime({
    homeDir: path.join(root, 'home'),
    sessionsDir: path.join(root, 'sessions'),
    defaultProvider: 'anthropic',
  });
  t.after(async () => {
    if (extensionSource === gateExtension) await writeFile(path.join(workspace, 'release'), 'release');
    await stopOwnedTestRuntime(runtime);
    assert.equal(path.dirname(root), await realpath(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('space-sdk-control-'));
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  });
  const session = await runtime.sessions.create({ projectPath: workspace });
  await runtime.sessions.updateSettings(session.id, { permissionMode: 'full-access' });
  return { runtime, sessionId: session.id, workspace };
}

test(
  'published owner cancels its queue frontier; replay does not cancel a later Run',
  { timeout: 20_000 },
  async (t) => {
    const { runtime, sessionId, workspace } = await fixture(t, gateExtension);
    assert.equal(runtime.capabilities.sessionCancellation.version, 1);
    assert.equal(runtime.capabilities.toolInvocation.version, 1);
    const start = (toolInvocation) =>
      runtime.runs.start({
        sessionId,
        prompt: 'Offline tool operation',
        options: { lsp: false, toolInvocation },
      });
    const active = await start({ name: 'space_control_gate', input: {} });
    await waitForGate(workspace);
    const forbidden = path.join(workspace, 'queued-must-not-run.txt');
    const queued = await start({
      name: 'write',
      input: { path: forbidden, content: 'must not exist' },
    });
    const request = { sessionId, expectedRunId: active.runId, requestId: 'stop-fixture' };
    const stopped = await runtime.sessions.cancel(request);
    assert.deepEqual(
      new Set(stopped.receipts.map((item) => item.runId)),
      new Set([active.runId, queued.runId]),
    );
    await Promise.all([active.result, queued.result]);
    await assert.rejects(readFile(forbidden), { code: 'ENOENT' });
    const later = path.join(workspace, 'later.txt');
    const next = await start({ name: 'write', input: { path: later, content: 'survives' } });
    const replay = await runtime.sessions.cancel(request);
    assert.equal(replay.frontier, stopped.frontier);
    assert.equal(
      replay.receipts.some((item) => item.runId === next.runId),
      false,
    );
    assert.equal((await next.result).phase, 'completed');
    assert.equal(await readFile(later, 'utf8'), 'survives');
  },
);

test('published managed extension command receives its Run scope and joins nested tool effects', async (t) => {
  const { runtime, sessionId, workspace } = await fixture(
    t,
    `export default function activate(api) {
    api.registerCommand({ name: 'space-inspect', description: 'Offline command',
      handler: async (args) => {
        const scope = api.getExecutionScope();
        if (!scope) throw new Error('missing execution scope');
        await scope.invokeTool('write', { path: args[0], content: scope.sessionId + ':' + scope.runId });
        return { success: true, message: 'effect completed' };
      }
    });
  }`,
  );
  const target = path.join(workspace, 'effect.txt');
  const run = await runtime.runs.start({
    sessionId,
    prompt: '/space-inspect effect.txt',
    options: {
      lsp: false,
      toolInvocation: { name: 'extension_command__space-inspect', input: { args: [target] } },
    },
  });
  const result = await run.result;
  assert.equal(result.phase, 'completed', result.result?.lastText);
  assert.equal(await readFile(target, 'utf8'), `${sessionId}:${run.runId}`);
});

test(
  'published owner rejects a fresh Stop bound to a terminal Run without cancelling its successor',
  { timeout: 20000 },
  async (t) => {
    const { runtime, sessionId, workspace } = await fixture(t, gateExtension);
    const first = await runtime.runs.start({
      sessionId,
      prompt: 'offline first',
      options: {
        lsp: false,
        toolInvocation: {
          name: 'write',
          input: { path: path.join(workspace, 'first.txt'), content: 'done' },
        },
      },
    });
    assert.equal((await first.result).phase, 'completed');
    const next = await runtime.runs.start({
      sessionId,
      prompt: 'offline successor',
      options: {
        lsp: false,
        toolInvocation: { name: 'space_control_gate', input: {} },
      },
    });
    await waitForGate(workspace);
    await assert.rejects(
      runtime.sessions.cancel({
        sessionId,
        expectedRunId: first.runId,
        requestId: 'never-accepted-before',
      }),
      { code: 'conflict', data: { denialSource: 'stale_run', retryable: false, operation: 'sessions.cancel' } },
    );
    await writeFile(path.join(workspace, 'release'), 'release');
    assert.equal((await next.result).phase, 'completed');
    await assert.rejects(readFile(path.join(workspace, 'aborted')), { code: 'ENOENT' });
  },
);
