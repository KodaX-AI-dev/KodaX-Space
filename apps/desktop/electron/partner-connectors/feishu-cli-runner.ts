import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface FeishuCliRequest {
  args: readonly string[];
  stdin?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface FeishuCliResponse {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}
export type FeishuCliRunner = (request: FeishuCliRequest) => Promise<FeishuCliResponse>;

const ERROR_MESSAGES = {
  cancelled: '飞书操作已取消。',
  invalid_input: '飞书连接器参数无效。',
  cli_missing: '飞书连接组件不可用，请更新或重新安装 KodaX Space。',
  unsupported_version: '飞书连接组件版本不兼容，请更新 KodaX Space。',
  not_connected: '飞书账号未连接或验证失败，请重新连接。',
  identity_changed: '飞书账户已改变，请重新连接后再操作。',
  missing_scope: '飞书账户缺少本次操作所需权限。',
  revision_changed: '飞书文档版本已改变，请重新读取并审核修改。',
  invalid_response: '飞书返回了无法验证的结果，请检查资源后再操作。',
  command_failed: '飞书操作失败，请检查连接状态。',
  timeout: '飞书操作超时，请先核对资源状态，不要重复提交。',
  output_limit: '飞书返回内容超过安全上限。',
} as const;

export type FeishuCliErrorCode = keyof typeof ERROR_MESSAGES;

/** Only fixed host messages cross the connector boundary; raw stderr may contain credentials. */
export class FeishuCliError extends Error {
  constructor(
    readonly code: FeishuCliErrorCode,
    readonly dispatched: boolean,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = 'FeishuCliError';
  }
}

export interface FeishuCliRunnerOptions {
  executable?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export function createSafeFeishuEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
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
      Object.entries(source).filter(
        ([key, value]) => allowed.has(key.toUpperCase()) && value !== undefined,
      ),
    ),
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
  };
}

/** Trusted host/test seam only: neither executable nor env can be supplied by a plugin frame. */
export function createFeishuCliRunner(options: FeishuCliRunnerOptions = {}): FeishuCliRunner {
  const source = options.env ?? process.env;
  const executable = options.executable ?? source.KODAX_SPACE_FEISHU_CLI ?? 'lark-cli';
  const env = createSafeFeishuEnvironment(source);
  return async (request) => {
    if (request.signal?.aborted) throw new FeishuCliError('cancelled', false);
    let directory: string;
    try {
      // Keep the host's final permission guard and spawn in the same turn.
      directory = mkdtempSync(join(tmpdir(), 'kodax-feishu-'));
    } catch {
      throw new FeishuCliError('command_failed', false);
    }
    let dispatched = false;
    return new Promise<FeishuCliResponse>((resolve, reject) => {
      if (request.signal?.aborted) {
        reject(new FeishuCliError('cancelled', false));
        return;
      }
      const timeoutMs = request.timeoutMs ?? options.timeoutMs ?? 45000;
      const maxOutputBytes = options.maxOutputBytes ?? 2 * 1024 * 1024;
      if (
        !executable ||
        executable.includes('\0') ||
        executable.length > 4096 ||
        request.args.length > 64 ||
        request.args.some(
          (arg) => typeof arg !== 'string' || arg.includes('\0') || arg.length > 8192,
        ) ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > 60000 ||
        !Number.isSafeInteger(maxOutputBytes) ||
        maxOutputBytes < 1 ||
        maxOutputBytes > 2 * 1024 * 1024 ||
        Buffer.byteLength(request.stdin ?? '', 'utf8') > 1024 * 1024
      ) {
        reject(new FeishuCliError('invalid_input', false));
        return;
      }
      const child = spawn(executable, [...request.args], {
        shell: false,
        cwd: directory,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let settled = false;
      let cancelled = false;
      let failure: FeishuCliError | undefined;
      const finish = (error?: FeishuCliError, exitCode: number | null = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', cancel);
        if (error) reject(error);
        else
          resolve({
            stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: Buffer.concat(stderr).toString('utf8'),
            exitCode,
          });
      };
      const stop = () => {
        if (process.platform !== 'win32' && child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        } else child.kill('SIGKILL');
      };
      const timer = setTimeout(() => {
        failure ??= new FeishuCliError('timeout', dispatched);
        stop();
      }, timeoutMs);
      const cancel = () => {
        if (settled) return;
        cancelled = true;
        clearTimeout(timer);
        stop();
      };
      request.signal?.addEventListener('abort', cancel, { once: true });
      if (request.signal?.aborted) cancel();
      child.on('spawn', () => {
        dispatched = true;
      });
      const collect = (target: Buffer[], chunk: Buffer) => {
        if (settled || failure || cancelled) return;
        outputBytes += chunk.length;
        if (outputBytes > maxOutputBytes) {
          failure = new FeishuCliError('output_limit', dispatched);
          clearTimeout(timer);
          stop();
        } else target.push(chunk);
      };
      child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk));
      child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk));
      child.on('error', (error: NodeJS.ErrnoException) => {
        failure ??= new FeishuCliError(
          cancelled ? 'cancelled' : error.code === 'ENOENT' ? 'cli_missing' : 'command_failed',
          dispatched,
        );
        clearTimeout(timer);
      });
      // Wait for process exit and pipe closure before the caller removes its private cwd.
      child.on('close', (exitCode) =>
        finish(
          failure ?? (cancelled ? new FeishuCliError('cancelled', dispatched) : undefined),
          exitCode,
        ),
      );
      child.stdin.on('error', () => {
        if (settled || failure) return;
        failure = new FeishuCliError(cancelled ? 'cancelled' : 'command_failed', dispatched);
        clearTimeout(timer);
        stop();
      });
      child.stdin.end(request.stdin ?? '');
    }).finally(async () => {
      try {
        await rm(directory, { recursive: true, force: true });
      } catch {
        throw new FeishuCliError('command_failed', dispatched);
      }
    });
  };
}

export const runFeishuCli: FeishuCliRunner = (request) => createFeishuCliRunner()(request);
