import { spawn } from 'node:child_process';
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ReadConnectorError } from './read-connector.js';

export interface ProviderCliRequest {
  args: readonly string[];
  stdin?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
  /** Trusted host session gates, evaluated after asynchronous process preparation. */
  beforeSpawn?: () => Promise<void>;
  assertSpawn?: () => void;
}
export interface ProviderCliResponse {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}
export type ProviderCliProcess = (input: ProviderCliRequest) => Promise<ProviderCliResponse>;
export interface ProviderCliProcessOptions {
  executable: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Host-owned provider settings only; never renderer or model input. */
  overrides?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
}

/** Refuse symlink ancestors, including replaced profile directories. Never chmod ancestors. */
export async function ensureProviderDirectory(directory: string): Promise<void> {
  if (
    !path.isAbsolute(directory) ||
    path.normalize(directory) !== directory ||
    directory.includes('\0')
  )
    throw new ReadConnectorError('invalid_response');
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    await mkdir(current, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw new ReadConnectorError('invalid_response');
    });
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new ReadConnectorError('invalid_response');
    if (current === directory && process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
      throw new ReadConnectorError('invalid_response');
  }
}

async function prepareCwd(directory: string): Promise<void> {
  await ensureProviderDirectory(directory);
  const envFile = path.join(directory, '.env');
  await writeFile(envFile, '', { mode: 0o600, flag: 'wx' }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw new ReadConnectorError('invalid_response');
    },
  );
  const stat = await lstat(envFile);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 0)
    throw new ReadConnectorError('invalid_response');
}

function environment(options: ProviderCliProcessOptions): NodeJS.ProcessEnv {
  const allowed = new Set([
    'PATH',
    'HOME',
    'USERPROFILE',
    'USER',
    'LOGNAME',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'SYSTEMROOT',
    'WINDIR',
    'PATHEXT',
  ]);
  return {
    ...Object.fromEntries(
      Object.entries(options.env ?? process.env).filter(
        ([key, value]) => allowed.has(key.toUpperCase()) && value !== undefined,
      ),
    ),
    ...options.overrides,
  };
}

/** Bounded private process; cancellation resolves only after the child has closed. */
export function createProviderCliProcess(options: ProviderCliProcessOptions): ProviderCliProcess {
  return async (input) => {
    if (input.signal?.aborted) throw new ReadConnectorError('cancelled');
    const timeoutMs = input.timeoutMs ?? 45000;
    const maxOutput = options.maxOutputBytes ?? 2 * 1024 * 1024;
    if (
      !path.isAbsolute(options.executable) ||
      options.executable.includes('\0') ||
      input.args.length > 64 ||
      input.args.some(
        (arg) => typeof arg !== 'string' || arg.includes('\0') || arg.length > 8192,
      ) ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 660000 ||
      !Number.isSafeInteger(maxOutput) ||
      maxOutput < 1 ||
      maxOutput > 2 * 1024 * 1024 ||
      Buffer.byteLength(input.stdin ?? '') > 1024 * 1024
    )
      throw new ReadConnectorError('invalid_response');
    try {
      await prepareCwd(options.cwd);
    } catch {
      throw new ReadConnectorError('invalid_response');
    }
    await input.beforeSpawn?.();
    if (input.signal?.aborted) throw new ReadConnectorError('cancelled');
    return new Promise((resolve, reject) => {
      input.assertSpawn?.();
      const child = spawn(options.executable, [...input.args], {
        shell: false,
        cwd: options.cwd,
        env: environment(options),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
      let failure: ReadConnectorError | undefined;
      let stdout = '';
      let stderr = '';
      let bytes = 0;
      const stop = (code: ReadConnectorError['code']) => {
        failure ??= new ReadConnectorError(code);
        if (process.platform !== 'win32' && child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        } else child.kill('SIGKILL');
      };
      const cancel = () => stop('cancelled');
      const timer = setTimeout(() => stop('expired'), timeoutMs);
      input.signal?.addEventListener('abort', cancel, { once: true });
      const collect = (stream: 'stdout' | 'stderr', chunk: string) => {
        if (failure) return;
        bytes += Buffer.byteLength(chunk);
        if (bytes > maxOutput) {
          stop('invalid_response');
          return;
        }
        if (stream === 'stdout') stdout += chunk;
        else stderr += chunk;
        try {
          input.onOutput?.(stream, chunk);
        } catch (error) {
          stop(error instanceof ReadConnectorError ? error.code : 'invalid_response');
        }
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => collect('stdout', chunk));
      child.stderr.on('data', (chunk: string) => collect('stderr', chunk));
      child.on('error', () => {
        failure ??= new ReadConnectorError('read_failed');
      });
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        input.signal?.removeEventListener('abort', cancel);
        if (failure) reject(failure);
        else resolve({ stdout, stderr, exitCode });
      });
      child.stdin.on('error', () => stop('read_failed'));
      child.stdin.end(input.stdin ?? '');
      if (input.signal?.aborted) cancel();
    });
  };
}
