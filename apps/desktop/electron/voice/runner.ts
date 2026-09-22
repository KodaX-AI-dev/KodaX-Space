import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UtilityProcess } from 'electron';
import type { ChannelInput } from '@kodax-space/space-ipc-schema';

let cached: { child: UtilityProcess; directory: string } | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let running = false;
const stopping = new Set<Promise<void>>();

export async function stopWhisper(): Promise<void> {
  clearTimeout(idleTimer);
  const child = cached?.child;
  cached = null;
  if (child) {
    const kill = (): void => {
      child.kill();
    };
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => {
        child.removeListener('spawn', kill);
        resolve();
      });
    });
    stopping.add(exited);
    void exited.then(() => stopping.delete(exited));
    // Electron cannot kill a utility process before it has a PID. Retain the
    // handle until exit and stop it as soon as a pending spawn completes.
    if (!child.kill()) child.once('spawn', kill);
  }
  await Promise.all(stopping);
}

function acquireWorker(directory: string): { child: UtilityProcess; fresh: boolean } {
  clearTimeout(idleTimer);
  if (cached?.directory === directory) return { child: cached.child, fresh: false };
  void stopWhisper();
  const req = typeof require === 'undefined' ? createRequire(import.meta.url) : require;
  const { utilityProcess } = req('electron') as typeof import('electron');
  const entry =
    typeof __dirname === 'string'
      ? join(__dirname, 'whisper-worker.js')
      : fileURLToPath(new URL('../../../../dist-electron/whisper-worker.js', import.meta.url));
  // Only OS runtime paths/locale are inherited. Undefined env values make Electron fork fail.
  const env = Object.fromEntries(
    ['PATH', 'SystemRoot', 'HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR', 'TEMP', 'TMP'].flatMap(
      (key) => (typeof process.env[key] === 'string' ? [[key, process.env[key]!]] : []),
    ),
  );
  const child = utilityProcess.fork(entry, [], {
    stdio: 'ignore',
    serviceName: 'Space local voice',
    env,
  });
  cached = { child, directory };
  child.on('exit', () => {
    if (cached?.child === child) cached = null;
  });
  child.on('error', () => {
    if (cached?.child === child) void stopWhisper();
  });
  return { child, fresh: true };
}

export function runWhisper(
  directory: string,
  signal: AbortSignal,
  request?: ChannelInput<'voice.transcribe'>,
): Promise<string> {
  signal.throwIfAborted();
  if (running) throw new Error('Voice recognition is already running');
  const { child, fresh } = acquireWorker(directory);
  running = true;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, text = ''): void => {
      if (settled) return;
      settled = true;
      running = false;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      child.removeListener('message', message);
      child.removeListener('exit', exit);
      child.removeListener('spawn', send);
      if (error) {
        void stopWhisper();
        reject(error);
      } else {
        // Keep the model warm briefly for dictation; release memory when unused.
        idleTimer = setTimeout(() => {
          void stopWhisper();
        }, 60_000);
        resolve(text);
      }
    };
    const abort = (): void => finish(new Error('Voice recognition cancelled'));
    const exit = (): void => finish(new Error('Voice runtime exited unexpectedly'));
    const send = (): void => {
      if (settled) return;
      try {
        child.postMessage({ directory, request });
      } catch {
        finish(new Error('Voice runtime failed'));
      }
    };
    const message = (value: unknown): void => {
      const result = value as { ok?: unknown; text?: unknown } | null;
      if (result?.ok === true && typeof result.text === 'string' && result.text.length <= 8000)
        finish(undefined, result.text);
      else finish(new Error('Voice runtime failed; try repairing the component'));
    };
    const timer = setTimeout(() => finish(new Error('Voice recognition timed out')), 90_000);
    signal.addEventListener('abort', abort, { once: true });
    child.once('message', message);
    child.once('exit', exit);
    if (fresh) child.once('spawn', send);
    else send();
    if (signal.aborted) abort();
  });
}
