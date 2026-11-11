import path from 'node:path';
import { registerChannel } from './register.js';
import { getKodaxRuntimeDir } from '../kodax/data-paths.js';
import { workflowController } from '../kodax/workflow-controller.js';
import { workflowPolicyStore } from '../kodax/workflow-policy.js';
import { kodaxHost } from '../kodax/host.js';
import { runtimeHostAdapter } from '../kodax/runtime-host-adapter.js';
import {
  runWithCoderAdmission,
  type CoderAdmissionOptions,
} from '../kodax/coder-runtime-mode-switch.js';

function isSafeWorkflowPath(filePath: string, projectRoot: string): boolean {
  const resolved = path.resolve(filePath);
  const allowed = [
    path.resolve(getKodaxRuntimeDir(), 'workflows'),
    path.resolve(projectRoot, '.kodax', 'workflows'),
  ];
  return allowed.some((prefix) => resolved === prefix || resolved.startsWith(prefix + path.sep));
}

const SINGLE_USE_REASON =
  'Workflow is a single-use operation in Space. Start it explicitly and read the final response in its Session; saving and managing runs is unavailable.';

export function registerWorkflowChannels(options: CoderAdmissionOptions = {}): void {
  registerChannel('workflow.list', (input) =>
    runWithCoderAdmission(options, async () => {
      const localRuns = workflowController.list(input?.sessionId);
      if (!runtimeHostAdapter.isRuntimeSelected()) return { runs: localRuns };
      try {
        const hostRuns = await runtimeHostAdapter.listWorkflows(input);
        const seen = new Set(hostRuns.map((run) => run.runId));
        return {
          runs: [...hostRuns, ...localRuns.filter((run) => !seen.has(run.runId))].slice(0, 500),
        };
      } catch (error) {
        console.warn(
          '[workflow.list] Host unavailable:',
          error instanceof Error ? error.message : String(error),
        );
        return { runs: localRuns, stale: true };
      }
    }),
  );
  registerChannel('workflow.get', (input) =>
    runWithCoderAdmission(options, async () => {
      const run = runtimeHostAdapter.isRuntimeSelected()
        ? await runtimeHostAdapter.getWorkflow(input.runId)
        : undefined;
      return { run: run ?? workflowController.get(input.runId) };
    }),
  );
  for (const action of ['stop', 'pause', 'resume'] as const) {
    registerChannel(`workflow.${action}`, (input) =>
      runWithCoderAdmission(options, async () => {
        if (
          runtimeHostAdapter.isRuntimeSelected() &&
          (await runtimeHostAdapter.getWorkflow(input.runId))
        )
          return { ok: await runtimeHostAdapter.controlWorkflow(action, input.runId) };
        return { ok: await workflowController[action](input.runId) };
      }),
    );
  }
  // Retired IPC names fail explicitly for old windows; never mutate retained definitions/history.
  for (const channel of ['workflow.rename', 'workflow.delete'] as const)
    registerChannel(channel, () => ({
      ok: false,
      unavailableReason: 'host-management-unavailable' as const,
    }));
  for (const channel of [
    'workflow.save',
    'workflow.rerun',
    'workflow.saved.rename',
    'workflow.saved.delete',
  ] as const)
    registerChannel(channel, () => ({ error: SINGLE_USE_REASON }));
  registerChannel('workflow.prune', () => {
    throw new Error(SINGLE_USE_REASON);
  });
  registerChannel('workflow.library', (input) =>
    workflowController.listLibrary(input?.projectRoot),
  );
  registerChannel('workflow.preflight', (input) => {
    const session = kodaxHost.get(input.sessionId);
    if (!session || !isSafeWorkflowPath(input.path, session.projectRoot))
      return {
        ok: false,
        issues: [
          {
            severity: 'error' as const,
            message: 'Path is outside the allowed workflow directories.',
          },
        ],
      };
    return workflowController.preflightSaved(input.path);
  });
  registerChannel('workflow.start', (input) =>
    runWithCoderAdmission(options, async () => {
      const session = kodaxHost.get(input.sessionId);
      if (!session) return { error: 'Session not found' };
      if (input.source === 'saved' && !isSafeWorkflowPath(input.target, session.projectRoot))
        return { error: 'Path is outside the allowed workflow directories.' };
      return workflowController.start({
        target: input.target,
        source: input.source,
        args: input.args,
        agentTarget: input.agentTarget,
        session: {
          sessionId: session.sessionId,
          surface: session.surface,
          provider: session.provider,
          model: session.model,
          reasoningMode: session.reasoningMode,
          agentMode: session.agentMode,
          projectRoot: session.projectRoot,
        },
      });
    }),
  );
  registerChannel('workflow.policy.get', () => workflowPolicyStore.get());
  registerChannel('workflow.policy.set', (input) => workflowPolicyStore.set(input));
  registerChannel('workflow.result', async (input) => {
    const result =
      runtimeHostAdapter.isRuntimeSelected() && (await runtimeHostAdapter.getWorkflow(input.runId))
        ? await runtimeHostAdapter.readWorkflowResult(input.runId)
        : await workflowController.readResult(input.runId);
    return result !== undefined ? { result } : {};
  });
}
