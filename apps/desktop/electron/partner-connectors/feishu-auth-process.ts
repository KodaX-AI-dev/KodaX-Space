import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createSafeFeishuEnvironment } from './feishu-cli-runner.js';

const MESSAGES = {
  needs_install: '飞书连接组件不可用，请更新或重新安装 KodaX Space。',
  cancelled: '已取消连接；在飞书网页完成的授权不会因此撤销。',
  expired: '本次飞书连接已超时，请重新发起。',
  missing_permissions: '飞书授权未包含所需文档权限，请检查授权结果。',
  unsupported_platform: '当前系统暂不支持飞书连接，请更新 KodaX Space 后重试。',
  component_unavailable: '飞书连接组件不可用，请更新或重新安装 KodaX Space。',
  installation_failed: '飞书连接组件安装或校验失败，尚未进入网页授权。请重新连接。',
  download_failed: '飞书连接组件下载失败，尚未进入网页授权。请检查网络后重新连接。',
  download_timeout: '飞书连接组件下载超时，尚未进入网页授权。请检查网络后重新连接。',
  authorization_failed: '飞书连接未完成，请检查官方网页上的结果。',
  invalid_response: '飞书连接返回了无法验证的结果，请重新检查。',
} as const;

export class FeishuOnboardingError extends Error {
  constructor(readonly code: keyof typeof MESSAGES) {
    super(MESSAGES[code]);
    this.name = 'FeishuOnboardingError';
  }
}

export interface FeishuAuthProcessInput {
  args: readonly string[];
  signal: AbortSignal;
  timeoutMs: number;
  onOutput: (stream: 'stdout' | 'stderr', chunk: string) => void;
}
export type FeishuAuthProcess = (
  input: FeishuAuthProcessInput,
) => Promise<{ exitCode: number | null }>;

/** Private host seam: callers receive text only to parse it, never to forward raw output. */
export function createFeishuAuthProcess(options: {
  executable: string;
  env?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
}): FeishuAuthProcess {
  return (input) =>
    new Promise((resolve, reject) => {
      if (input.signal.aborted) {
        reject(new FeishuOnboardingError('cancelled'));
        return;
      }
      const limit = options.maxOutputBytes ?? 256 * 1024;
      if (
        !Number.isSafeInteger(input.timeoutMs) ||
        input.timeoutMs < 1 ||
        input.timeoutMs > 660000 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 256 * 1024 ||
        !options.executable ||
        options.executable.includes('\0') ||
        input.args.length > 32 ||
        input.args.some((arg) => typeof arg !== 'string' || arg.includes('\0') || arg.length > 8192)
      ) {
        reject(new FeishuOnboardingError('invalid_response'));
        return;
      }
      const child = spawn(options.executable, [...input.args], {
        shell: false,
        cwd: tmpdir(),
        env: createSafeFeishuEnvironment(options.env ?? process.env),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
      let failure: FeishuOnboardingError | undefined;
      let bytes = 0;
      const stop = (code: FeishuOnboardingError['code']) => {
        failure ??= new FeishuOnboardingError(code);
        if (process.platform !== 'win32' && child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        } else child.kill('SIGKILL');
      };
      const cancel = () => stop('cancelled');
      const timer = setTimeout(() => stop('expired'), input.timeoutMs);
      input.signal.addEventListener('abort', cancel, { once: true });
      const collect = (stream: 'stdout' | 'stderr', chunk: string) => {
        if (failure) return;
        bytes += Buffer.byteLength(chunk);
        if (bytes > limit) {
          stop('invalid_response');
          return;
        }
        try {
          input.onOutput(stream, chunk);
        } catch (error) {
          stop(error instanceof FeishuOnboardingError ? error.code : 'invalid_response');
        }
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => collect('stdout', chunk));
      child.stderr.on('data', (chunk: string) => collect('stderr', chunk));
      child.on('error', () => {
        failure ??= new FeishuOnboardingError('authorization_failed');
      });
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        input.signal.removeEventListener('abort', cancel);
        if (failure) reject(failure);
        else resolve({ exitCode });
      });
      if (input.signal.aborted) cancel();
    });
}
