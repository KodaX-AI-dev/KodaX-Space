import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  parseChildSetupOutput,
  resolveSandboxSetupModules,
  runSandboxSetupProcess,
} from '../kodax/sandbox-setup-process.js';

const AGENT = `
let sink = () => {};
export function setKodaXDiagnosticSink(next) { sink = next; }
export function formatKodaXDiagnostic(d) { return '[' + d.source + '] ' + d.message; }
export function emit(d) { sink(d); }
`;

async function withFakeSdk(
  sandboxSource: string,
  run: (modules: { sandbox: string; agent: string }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'space-sandbox-setup-'));
  try {
    const agent = path.join(directory, 'agent.mjs');
    const sandbox = path.join(directory, 'sandbox.mjs');
    await writeFile(agent, AGENT);
    await writeFile(sandbox, sandboxSource.replace('AGENT_URL', pathToFileURL(agent).href));
    await run({ sandbox: pathToFileURL(sandbox).href, agent: pathToFileURL(agent).href });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('setup runs in a child process and returns the outcome, code, phases and SDK warnings', async () => {
  await withFakeSdk(
    `import { emit } from 'AGENT_URL';
export async function activateKodaXSandbox(options) {
  console.log('noise before the result');
  options.onProgress('awaiting-elevation');
  emit({ level: 'info', source: 'runtime:sandbox-setup', message: 'ignored' });
  emit({ level: 'warn', source: 'runtime:sandbox-setup', message: 'idle probe timed out' });
  options.onProgress('elevated');
  return {
    status: 'unavailable',
    attempted: options.allowElevation === true,
    error: '[elevated_step_failed] step failed',
    code: 'elevated_step_failed',
  };
}`,
    async (modules) => {
      const phases: string[] = [];
      const result = await runSandboxSetupProcess({
        modules,
        onPhase: (phase) => phases.push(phase),
      });
      assert.deepEqual(phases, ['awaiting-elevation', 'elevated']);
      assert.deepEqual(result, {
        status: 'unavailable',
        attempted: true,
        error: '[elevated_step_failed] step failed',
        code: 'elevated_step_failed',
        diagnostics: ['[runtime:sandbox-setup] idle probe timed out'],
      });
    },
  );
});

test('a throwing activation is reported as thrown, not as a process failure', async () => {
  await withFakeSdk(
    `export async function activateKodaXSandbox() { throw new Error('native artifact missing'); }`,
    async (modules) => {
      const result = await runSandboxSetupProcess({ modules });
      assert.equal(result.thrown, 'native artifact missing');
    },
  );
});

test('a child that dies without a result rejects with its stderr', async () => {
  await withFakeSdk(
    `console.error('boom'); process.exit(3); export async function activateKodaXSandbox() {}`,
    async (modules) => {
      await assert.rejects(runSandboxSetupProcess({ modules }), /exited 3: boom/);
    },
  );
});

test('the last result line wins and malformed diagnostics are dropped', () => {
  const output = [
    'SANDBOX_SETUP_RESULT:{"status":"cancelled","diagnostics":[]}',
    'SANDBOX_SETUP_RESULT:{"status":"ready","attempted":true,"diagnostics":["a",1]}',
  ].join('\r\n');
  assert.deepEqual(parseChildSetupOutput(output), {
    status: 'ready',
    attempted: true,
    error: undefined,
    code: undefined,
    diagnostics: ['a'],
  });
  assert.throws(() => parseChildSetupOutput('nothing'), /no result/);
});

test('the child imports the SDK entries this Space build ships', async () => {
  const modules = resolveSandboxSetupModules();
  const sandbox = (await import(modules.sandbox)) as Record<string, unknown>;
  const agent = (await import(modules.agent)) as Record<string, unknown>;
  assert.equal(typeof sandbox.activateKodaXSandbox, 'function');
  assert.equal(typeof agent.setKodaXDiagnosticSink, 'function');
  assert.equal(typeof agent.formatKodaXDiagnostic, 'function');
});
