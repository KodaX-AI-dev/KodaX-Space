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
    descriptor.profile !== 'default' ||
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
  const descriptorPath = path.join(testDataDir, 'runtime', 'daemon', 'default', 'daemon.json');
  const raw = await fs.readFile(descriptorPath, 'utf8').catch(() => null);
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
