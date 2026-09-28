import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKodaXRuntime } from '@kodax-ai/kodax/runtime';
import {
  initializeCoderDaemonProjectionSdk,
  projectRuntimeSessionSnapshot,
} from '../kodax/runtime/coder-daemon-projection.js';
import {
  selectActivitySnapshot,
  selectEffectiveRuntimeActiveRun,
  selectRuntimeDisplayPhase,
} from '../../renderer/src/shell/ActivitySpinner.js';
import { buildTaskDockRunView } from '../../renderer/src/shell/taskDockProjection.js';
import { composerRunControls } from '../../renderer/src/shell/composerInvoke.js';

test(
  'installed SDK recovery reaches Space terminal UI and admits the next message',
  { timeout: 30_000 },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'space-cleanup-recovery-'));
    const oldHome = process.env.KODAX_HOME;
    process.env.KODAX_HOME = path.join(root, '.kodax');
    const options = {
      homeDir: root,
      sharedDaemonHost: true,
      defaultProvider: 'unconfigured-provider',
    };
    let runtime: Awaited<ReturnType<typeof createKodaXRuntime>> | undefined;
    try {
      await initializeCoderDaemonProjectionSdk();
      runtime = await createKodaXRuntime(options);
      const session = await runtime.sessions.create({ projectPath: root });
      await runtime.sessions.updateSettings(session.id, { permissionMode: 'full-access' });
      const file = path.join(root, 'fixture.txt');
      await writeFile(file, 'safe recovery fixture');
      const run = await runtime.runs.start({
        sessionId: session.id,
        prompt: 'read fixture',
        options: {
          lsp: false,
          toolInvocation: { name: 'read', input: { path: file } },
        },
      });
      assert.equal((await run.result).phase, 'completed');
      await runtime.close();
      const statusFile = path.join(
        root,
        '.kodax/runtime/profiles/default/runs',
        run.runId,
        'status.json',
      );
      const persisted = JSON.parse(await readFile(statusFile, 'utf8')) as {
        [key: string]: unknown;
        _runtime: { shellCleanups?: unknown[] };
      };
      persisted.phase = 'unknown';
      persisted.stage = 'unknown';
      delete persisted.terminal;
      delete persisted.endedAt;
      persisted.stop = {
        requestedAt: new Date().toISOString(),
        state: 'unknown',
        outcome: 'unknown',
        reason: 'stop',
      };
      persisted._runtime.shellCleanups = [
        {
          runtimeRunId: run.runId,
          pid: 12345,
          registrationId: '11111111-1111-4111-8111-111111111111',
        },
      ];
      await writeFile(statusFile, JSON.stringify(persisted));
      for (let restart = 0; restart < 2; restart++) {
        runtime = await createKodaXRuntime(options);
        const observation = await runtime.sessions.observe(session.id, () => undefined);
        const projection = projectRuntimeSessionSnapshot(observation.snapshot);
        observation.close();
        assert.equal(projection.activeRun, undefined);
        assert.equal(projection.lastTerminalRun?.phase, 'interrupted');
        const activity = selectActivitySnapshot(projection, [], false, undefined);
        const phase = selectRuntimeDisplayPhase(
          selectEffectiveRuntimeActiveRun(projection, [], undefined, true),
          activity.streaming,
          projection,
          undefined,
          true,
        );
        assert.equal(phase, 'interrupted');
        assert.equal(activity.streaming, false);
        assert.equal(
          composerRunControls(activity.streaming, false, phase).canSendDuringActivity,
          true,
        );
        const dock = buildTaskDockRunView({
          hasProject: true,
          hasSession: true,
          pendingSend: false,
          isStreaming: activity.streaming,
          runtimePhase: phase,
          todos: [{ id: 'old', content: 'Old unfinished plan', status: 'in_progress' }],
        });
        assert.equal(dock.mode, 'idle');
        await runtime.close();
      }
      runtime = await createKodaXRuntime(options);
      const next = await runtime.runs.start({
        sessionId: session.id,
        prompt: 'continue',
        options: {
          lsp: false,
          toolInvocation: { name: 'read', input: { path: file } },
        },
      });
      assert.equal((await next.result).phase, 'completed');
    } finally {
      await runtime?.close();
      if (oldHome === undefined) delete process.env.KODAX_HOME;
      else process.env.KODAX_HOME = oldHome;
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
