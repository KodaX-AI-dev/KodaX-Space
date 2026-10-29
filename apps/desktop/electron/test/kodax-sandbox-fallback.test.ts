import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { toolBash, type KodaXToolExecutionContext } from '@kodax-ai/kodax/coding';

async function withIsolatedWorkspace(run: (root: string) => Promise<void>): Promise<void> {
  const prefix = 'space-sdk-sandbox-fallback-';
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    await run(root);
  } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith(prefix));
    await rm(root, { recursive: true, force: true });
  }
}

const command = 'echo KODAX_FALLBACK_OK >> fallback-witness.txt';

for (const failure of ['prepare-error', 'not-selected', 'wrapper-pre-start'] as const) {
  test(`published SDK automatically continues an authorized Bash call after ${failure}`, async () => {
    await withIsolatedWorkspace(async (root) => {
      let prepared = 0;
      let authorized = 0;
      const observations: unknown[] = [];
      const result = await toolBash(
        { command, timeout: 5 },
        {
          backups: new Map(),
          configHome: root,
          executionCwd: root,
          toolCallId: `space-fallback-${failure}`,
          resolveShellPermissionMode: () => 'auto',
          shellSandbox: {
            async prepare() {
              prepared++;
              if (failure === 'prepare-error')
                throw new Error('JavaScript Skill interpreter is unavailable: Node not found');
              if (failure === 'not-selected') return undefined;
              return {
                executable: process.execPath,
                args: ['-e', 'process.exit(1)'],
                env: process.env,
                cleanup: async () => ({ version: 1, state: 'pre_start_unavailable' }),
              };
            },
          },
          authorizeShellHostExecution: async (request) => {
            authorized++;
            assert.equal(request.permissionMode, 'auto');
            assert.equal(request.command, command);
            assert.equal(request.cwd, root);
            return true;
          },
          reportToolSandboxObservation: (observation) => observations.push(observation),
        },
      );
      assert.match(result, /Exit: 0/);
      assert.deepEqual(
        (await readFile(path.join(root, 'fallback-witness.txt'), 'utf8')).trim().split(/\r?\n/),
        ['KODAX_FALLBACK_OK'],
      );
      assert.equal(prepared, 1);
      assert.equal(authorized, 1);
      assert.ok(observations.some((value) => (value as { state?: string }).state === 'fallback'));
    });
  });
}

test('published SDK preserves host denial instead of treating fallback as Full Access', async () => {
  await withIsolatedWorkspace(async (root) => {
    const result = await toolBash(
      { command },
      {
        backups: new Map(),
        configHome: root,
        executionCwd: root,
        toolCallId: 'space-fallback-denied',
        resolveShellPermissionMode: () => 'auto',
        shellSandbox: {
          prepare: async () => {
            throw new Error('sandbox unavailable');
          },
        },
        authorizeShellHostExecution: async () => '[Denied] Existing policy rejected this command.',
      },
    );
    assert.match(result, /Existing policy rejected/);
    await assert.rejects(readFile(path.join(root, 'fallback-witness.txt')), { code: 'ENOENT' });
  });
});

test('published SDK does not fall back after Stop', async () => {
  await withIsolatedWorkspace(async (root) => {
    const stopped = new AbortController();
    let authorized = 0;
    await toolBash({ command }, {
      backups: new Map(),
      configHome: root,
      executionCwd: root,
      toolCallId: 'space-fallback-stopped',
      abortSignal: stopped.signal,
      resolveShellPermissionMode: () => 'auto',
      shellSandbox: {
        prepare: async () => {
          stopped.abort();
          throw new Error('stopped');
        },
      },
      authorizeShellHostExecution: async () => {
        authorized++;
        return true;
      },
    } satisfies KodaXToolExecutionContext);
    assert.equal(authorized, 0);
    await assert.rejects(readFile(path.join(root, 'fallback-witness.txt')), { code: 'ENOENT' });
  });
});
