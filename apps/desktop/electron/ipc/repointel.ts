import fs from 'node:fs';
import path from 'node:path';
import { registerChannel } from './register.js';
import type { RepointelStatusItemT, RepointelStatusOutput } from '@kodax-space/space-ipc-schema';
import { loadSpaceSdkCoding } from '../kodax/sdk-extensions.js';
import { isRepoIntelEntitled } from '../kodax/repo-intel-gate.js';
import { runtimeHostAdapter } from '../kodax/runtime-host-adapter.js';

const WARM_SUPPORTED_REASON =
  'KodaX SDK exposes built-in best-effort repo-intelligence prewarm; use /repointel warm to start it for the current project.';

function canReadDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function findGitRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const marker = path.join(current, '.git');
    if (fs.existsSync(marker)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function item(
  id: string,
  status: RepointelStatusItemT['status'],
  detail: string,
): RepointelStatusItemT {
  return { id, status, detail };
}

function sdkStatus(status: string): RepointelStatusItemT['status'] {
  if (status === 'unavailable') return 'blocked';
  if (status === 'limited') return 'warn';
  return 'ok';
}

async function sdkDiagnostics(
  projectRoot: string | null,
  probe: boolean,
  sessionId?: string,
): Promise<{
  readonly warmSupported: boolean;
  readonly warmReason: string;
  readonly effectiveEngine: 'off' | 'light' | 'full' | null;
  readonly engineStatus: 'disabled' | 'ok' | 'limited' | 'unavailable' | 'warming' | null;
  readonly diagnostics: readonly RepointelStatusItemT[];
  readonly initialized?: boolean;
  readonly runtimeId?: string;
  readonly workspaceRoot?: string;
}> {
  try {
    if (runtimeHostAdapter.isRuntimeSelected()) {
      if (!sessionId) throw new Error('Select a Session to inspect its execution Host.');
      const status = await runtimeHostAdapter.inspectRepoIntelligence(sessionId);
      return {
        warmSupported: status.requestedMode !== 'off',
        warmReason:
          status.requestedMode === 'off'
            ? 'Repo intelligence is disabled by Host settings.'
            : WARM_SUPPORTED_REASON,
        effectiveEngine: status.effectiveEngine,
        engineStatus: status.status,
        initialized: status.initialized,
        runtimeId: status.runtimeId,
        workspaceRoot: status.workspaceRoot,
        diagnostics: [
          item(
            'repo-intelligence',
            status.initialized ? sdkStatus(status.status) : 'warn',
            `Host status=${status.status}, configured=${status.configuredMode}, requested=${status.requestedMode}, effective=${status.effectiveEngine}, initialized=${status.initialized}.`,
          ),
          ...status.warnings.map((warning) => item('warning', 'warn', warning)),
        ],
      };
    }
    const sdk = await loadSpaceSdkCoding();
    const inspection = await sdk.inspectRepoIntelligenceRuntime({
      probe,
      ...(projectRoot ? { workspaceRoot: projectRoot } : {}),
    });
    const diagnostics: RepointelStatusItemT[] = [
      item(
        'repo-intelligence',
        sdkStatus(inspection.status),
        `Built-in engine status=${inspection.status}, configured=${inspection.configuredMode}, requested=${inspection.requestedMode}, effective=${inspection.effectiveEngine}, trace=${inspection.traceEnabled ? 'on' : 'off'}.`,
      ),
    ];
    if (inspection.workerPath) {
      diagnostics.push(
        item(
          'worker',
          inspection.status === 'unavailable' ? 'blocked' : 'ok',
          `Worker sidecar: ${inspection.workerPath}`,
        ),
      );
    }
    if (inspection.storageRoot) {
      diagnostics.push(
        item(
          'storage',
          inspection.status === 'limited' ? 'warn' : 'ok',
          `Cache directory: ${inspection.storageRoot}`,
        ),
      );
    }
    for (const warning of inspection.warnings) {
      diagnostics.push(item('warning', 'warn', warning));
    }
    if (inspection.error) {
      diagnostics.push(item('error', sdkStatus(inspection.status), inspection.error));
    }
    return {
      warmSupported: inspection.requestedMode !== 'off',
      warmReason:
        inspection.requestedMode === 'off'
          ? 'Repo intelligence is disabled by KodaX config.'
          : WARM_SUPPORTED_REASON,
      effectiveEngine: inspection.effectiveEngine,
      engineStatus: inspection.status,
      diagnostics,
    };
  } catch (err) {
    return {
      warmSupported: false,
      warmReason: `KodaX repo-intelligence inspection is unavailable: ${err instanceof Error ? err.message : String(err)}`,
      effectiveEngine: null,
      engineStatus: null,
      diagnostics: [
        item(
          'repo-intelligence',
          'blocked',
          `KodaX repo-intelligence inspection failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      ],
    };
  }
}

async function buildStatus(
  projectRoot: string | undefined,
  probe: boolean,
  sessionId?: string,
): Promise<RepointelStatusOutput> {
  const requestedProjectRoot = projectRoot ? path.resolve(projectRoot) : null;
  const sdk = await sdkDiagnostics(requestedProjectRoot, probe, sessionId);
  const normalizedProjectRoot = sdk.workspaceRoot
    ? path.resolve(sdk.workspaceRoot)
    : requestedProjectRoot;
  const projectExists = normalizedProjectRoot !== null && canReadDirectory(normalizedProjectRoot);
  const gitRoot = projectExists ? findGitRoot(normalizedProjectRoot) : null;
  // Repo-intelligence is a licensed capability — any active license unlocks it.
  // Fail-closed (see repo-intel-gate.ts).
  const entitled = await isRepoIntelEntitled();

  const diagnostics: RepointelStatusItemT[] = [
    item(
      'license',
      entitled ? 'ok' : 'blocked',
      entitled
        ? 'Repo-intelligence is unlocked by an active license.'
        : 'Repo-intelligence is a licensed capability; activate a license to enable it.',
    ),
    normalizedProjectRoot
      ? item(
          'project',
          projectExists ? 'ok' : 'warn',
          projectExists
            ? `Project directory is readable: ${normalizedProjectRoot}`
            : `Project directory is not readable: ${normalizedProjectRoot}`,
        )
      : item('project', 'warn', 'No projectRoot was provided by the renderer.'),
    item(
      'git',
      gitRoot ? 'ok' : 'warn',
      gitRoot
        ? `Git root detected: ${gitRoot}`
        : 'No .git marker was found from projectRoot upward.',
    ),
    item(
      'trace',
      'ok',
      'Space consumes KodaX repo-intelligence trace events from active session events.',
    ),
    item('warm', sdk.warmSupported ? 'ok' : 'warn', sdk.warmReason),
    ...sdk.diagnostics,
  ];

  return {
    projectRoot: normalizedProjectRoot,
    projectExists,
    gitRoot,
    traceSource: 'session-events',
    warmSupported: sdk.warmSupported,
    warmReason: sdk.warmReason,
    entitled,
    effectiveEngine: entitled ? sdk.effectiveEngine : 'off',
    engineStatus: entitled ? sdk.engineStatus : 'disabled',
    initialized: sdk.initialized,
    runtimeId: sdk.runtimeId,
    diagnostics,
  };
}

/**
 * Best-effort prewarm of the repo-intelligence semantic index for a project. Fired by the
 * composer on the user's first keystroke (typing = imminent send → warm during the typing
 * window). Gated MAIN-side on license + git root (authoritative; the renderer trigger is a
 * hint). Fully fail-closed + fault-tolerant: any failure → { started: false }, never throws
 * — a prewarm must never disrupt the UI. The SDK detaches the worker, so this returns as
 * soon as the warm is kicked off.
 */
async function prewarmProject(
  projectRoot: string,
  sessionId?: string,
): Promise<{ readonly started: boolean; readonly runtimeId?: string }> {
  try {
    if (!(await isRepoIntelEntitled())) return { started: false };
    if (runtimeHostAdapter.isRuntimeSelected()) {
      if (!sessionId) return { started: false };
      const status = await runtimeHostAdapter.inspectRepoIntelligence(sessionId, true);
      return {
        started: status.requestedMode !== 'off' && status.initialized,
        runtimeId: status.runtimeId,
      };
    }
    const normalized = path.resolve(projectRoot);
    if (!canReadDirectory(normalized)) return { started: false };
    const gitRoot = findGitRoot(normalized);
    if (!gitRoot) return { started: false };
    const sdk = await loadSpaceSdkCoding();
    sdk.prewarmRepoIntelligenceCaches({ gitRoot, executionCwd: normalized });
    return { started: true };
  } catch (error) {
    console.warn(
      '[repointel] prewarm unavailable:',
      error instanceof Error ? error.message : String(error),
    );
    return { started: false };
  }
}

export function registerRepointelChannels(): void {
  registerChannel(
    'repointel.status',
    // probe defaults to true (doctor/popover full health check); the chip passes false
    // for its cheap always-on readiness fetch (no semantic-worker spawn on render).
    (input): Promise<RepointelStatusOutput> =>
      buildStatus(input.projectRoot, input.probe ?? true, input.sessionId),
  );
  registerChannel('repointel.prewarm', (input) =>
    prewarmProject(input.projectRoot, input.sessionId),
  );
}
