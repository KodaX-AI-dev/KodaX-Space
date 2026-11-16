import { spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';

interface TestDaemonDescriptor {
  readonly pid?: unknown;
  readonly profile?: unknown;
  readonly configHome?: unknown;
}

export type KillProcess = (pid: number, signal?: NodeJS.Signals | number) => boolean;

function comparablePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Accept only the Host descriptor owned by this exact isolated E2E data directory.
 * One Host serves each data root from the canonical `default` slot (ADR-075).
 * The ownership check prevents a corrupt or stale fixture file from targeting a user daemon.
 */
export function parseOwnedTestDaemonPid(raw: string, testDataDir: string): number | undefined {
  let descriptor: TestDaemonDescriptor;
  try {
    descriptor = JSON.parse(raw) as TestDaemonDescriptor;
  } catch {
    return undefined;
  }
  if (
    !['coder', 'default'].includes(String(descriptor.profile)) ||
    typeof descriptor.configHome !== 'string' ||
    comparablePath(descriptor.configHome) !== comparablePath(testDataDir) ||
    typeof descriptor.pid !== 'number' ||
    !Number.isSafeInteger(descriptor.pid) ||
    descriptor.pid <= 0 ||
    descriptor.pid === process.pid
  ) {
    return undefined;
  }
  return descriptor.pid;
}

/**
 * Shared daemons intentionally survive production Space restarts. E2E fixtures are different:
 * each owns an isolated daemon whose inherited launch pipes would otherwise keep Playwright's
 * Electron close action open until the test timeout.
 */
export async function stopOwnedTestDaemon(
  testDataDir: string,
  killProcess: KillProcess = process.kill,
): Promise<boolean> {
  const descriptorPaths = ['default', 'coder'].map((slot) =>
    path.join(testDataDir, 'runtime', 'daemon', slot, 'daemon.json'),
  );
  const contents = await Promise.all(
    descriptorPaths.map((file) => fs.readFile(file, 'utf8').catch(() => null)),
  );
  const raw = contents.find((value) => value !== null) ?? null;
  if (raw === null) return false;
  // The child uses the physical macOS temp path while the fixture may retain
  // /var's alias. Accept only that same directory's canonical identity as well.
  const pid =
    parseOwnedTestDaemonPid(raw, testDataDir) ??
    parseOwnedTestDaemonPid(raw, await fs.realpath(testDataDir));
  if (pid === undefined) return false;
  try {
    killProcess(pid, 'SIGTERM');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

/**
 * Force-close a Playwright launch whose graceful close stalled; reports which step released it.
 * On Windows Playwright starts Electron through `cmd.exe /c`, so ChildProcess.kill() would end only
 * that wrapper, mark the handle killed and thereby skip Playwright's own `taskkill /T` fallback; the
 * orphaned tree keeps the launch pipes open and stalls worker teardown. Kill the whole tree instead
 * (elsewhere the launch is detached, so its process group holds the same tree). A descendant whose
 * parent already exited has left that tree, so finally release our pipe ends to let the close land.
 */
export async function forceCloseLaunch(
  child: ChildProcess,
  graceMs: number,
): Promise<'closed' | 'tree' | 'pipes' | 'open'> {
  const exited = child.exitCode !== null || child.signalCode !== null;
  if (exited && child.stdio.slice(1).every((stream) => !stream || stream.destroyed)) {
    return 'closed';
  }
  const closed = once(child, 'close').then(() => true);
  killLaunchTree(child.pid);
  if (await closesWithin(closed, graceMs)) return 'tree';
  for (const stream of child.stdio) stream?.destroy();
  return (await closesWithin(closed, graceMs)) ? 'pipes' : 'open';
}

function killLaunchTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    // A non-zero status only means the wrapper already exited; the pipe release covers that.
    const result = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    if (result.error) throw result.error;
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

async function closesWithin(closed: Promise<boolean>, ms: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timeout = setTimeout(() => resolve(false), ms);
  });
  const outcome = await Promise.race([closed, timedOut]);
  clearTimeout(timeout);
  return outcome;
}
