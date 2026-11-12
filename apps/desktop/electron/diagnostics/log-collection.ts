import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  redactDiagnosticText,
  redactDiagnosticValue,
  type DiagnosticRedactionOptions,
} from './redaction.js';

interface LogSource {
  readonly root: string;
  readonly relativePath: string;
  readonly path: string;
}

export interface DiagnosticLogSource {
  readonly path: string;
  readonly status: 'collected' | 'truncated' | 'missing' | 'unreadable' | 'omitted';
  readonly bytes?: number;
  readonly reason?: string;
}

export interface DiagnosticLogOptions extends DiagnosticRedactionOptions {
  readonly logDirectory: string;
  readonly runtimeDirectory?: string;
  readonly runtimeProfile?: string;
  readonly maxLogFileBytes?: number;
  readonly maxTotalLogBytes?: number;
}

function errorCode(error: unknown): string {
  const code = error instanceof Error && 'code' in error ? String(error.code) : 'read-failed';
  return /^(ENOENT|EACCES|EPERM|EIO|EBUSY|ELOOP)$/.test(code) ? code : 'read-failed';
}

async function runtimeLogSources(
  options: DiagnosticLogOptions,
  notices: string[],
): Promise<LogSource[]> {
  if (!options.runtimeDirectory) return [];
  const profiles = new Set([options.runtimeProfile ?? 'coder', 'coder', 'default']);
  try {
    const entries = await readdir(path.join(options.runtimeDirectory, 'runtime', 'daemon'), {
      withFileTypes: true,
    });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(entry.name))
        profiles.add(entry.name);
    }
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') notices.push('runtime-log-profiles-unavailable');
  }
  if (profiles.size > 16) notices.push('runtime-log-profile-limit-reached');
  return [...profiles]
    .filter((profile) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(profile))
    .slice(0, 16)
    .flatMap((profile) =>
      ['bootstrap.log', 'daemon.log'].map((name) => ({
        root: options.runtimeDirectory!,
        relativePath: path.join('runtime', 'daemon', profile, name),
        path: `logs/runtime/${profile}/${name}`,
      })),
    );
}

async function logSources(options: DiagnosticLogOptions, notices: string[]): Promise<LogSource[]> {
  let rotated: string[] = [];
  try {
    rotated = (await readdir(options.logDirectory))
      .filter((name) => /^space-main\.\d+\.jsonl$/.test(name))
      .sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1]));
  } catch {
    notices.push('logs-unavailable');
  }
  const spaceSource = (name: string): LogSource => ({
    root: options.logDirectory,
    relativePath: name,
    path: `logs/${name}`,
  });
  // Current evidence from every process precedes older Space rotations.
  return [
    spaceSource('space-main.jsonl'),
    ...(await runtimeLogSources(options, notices)),
    ...rotated.map(spaceSource),
  ];
}

async function readLogTail(
  source: LogSource,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const file = path.join(source.root, source.relativePath);
  const [root, resolved, before] = await Promise.all([
    realpath(source.root),
    realpath(file),
    lstat(file),
  ]);
  const relative = path.relative(root, resolved);
  if (
    path.isAbsolute(relative) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    !before.isFile() ||
    before.nlink !== 1
  ) {
    throw new Error('Log is not a standalone file within its log directory.');
  }
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const [info, after] = await Promise.all([handle.stat(), lstat(file)]);
    if (
      !after.isFile() ||
      !info.isFile() ||
      info.nlink !== 1 ||
      info.dev !== before.dev ||
      info.ino !== before.ino ||
      info.ino !== after.ino ||
      info.dev !== after.dev
    ) {
      throw new Error('Log identity changed during collection.');
    }
    const take = Math.min(info.size, maxBytes);
    const buffer = Buffer.alloc(take);
    let offset = 0;
    while (offset < take) {
      const result = await handle.read(buffer, offset, take - offset, info.size - take + offset);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    let text = buffer.subarray(0, offset).toString('utf8');
    const truncated = info.size > take;
    if (truncated) text = text.includes('\n') ? text.slice(text.indexOf('\n') + 1) : '';
    return { text, truncated };
  } finally {
    await handle.close();
  }
}

function sanitizeLine(
  line: string,
  options: DiagnosticRedactionOptions,
  jsonLines: boolean,
): string {
  const redaction = { ...options, maxStringLength: 16 * 1024 };
  try {
    return JSON.stringify(redactDiagnosticValue(JSON.parse(line) as unknown, redaction));
  } catch {
    // Bootstrap output mixes plain text with prefixed structured startup records.
    const objectStart = line.indexOf('{');
    if (objectStart > 0) {
      try {
        return (
          redactDiagnosticText(line.slice(0, objectStart), redaction) +
          JSON.stringify(
            redactDiagnosticValue(JSON.parse(line.slice(objectStart)) as unknown, redaction),
          )
        );
      } catch {
        /* Non-JSON output is redacted as text below. */
      }
    }
    const message = redactDiagnosticText(line, redaction);
    return jsonLines
      ? JSON.stringify({
          level: 'warn',
          component: 'diagnostics',
          event: 'corrupt-log-line',
          message,
        })
      : message;
  }
}

function sanitizeTail(
  text: string,
  options: DiagnosticRedactionOptions,
  maxBytes: number,
  jsonLines: boolean,
) {
  const lines: string[] = [];
  let bytes = 0;
  let truncated = false;
  for (const raw of text.split(/\r?\n/).reverse()) {
    if (!raw.trim()) continue;
    const line = sanitizeLine(raw, options, jsonLines);
    const size = Buffer.byteLength(line) + 1;
    if (bytes + size > maxBytes) {
      truncated = true;
      break;
    }
    if (raw.length > 16 * 1024) truncated = true;
    lines.push(line);
    bytes += size;
  }
  return { content: lines.length ? `${lines.reverse().join('\n')}\n` : '', bytes, truncated };
}

export async function collectDiagnosticLogs(options: DiagnosticLogOptions) {
  const notices: string[] = [];
  const sources: DiagnosticLogSource[] = [];
  const files: { path: string; content: string }[] = [];
  const maxFileBytes = Math.max(1024, options.maxLogFileBytes ?? 1024 * 1024);
  const maxTotalBytes = Math.max(maxFileBytes, options.maxTotalLogBytes ?? 5 * 1024 * 1024);
  let remaining = maxTotalBytes;
  for (const source of await logSources(options, notices)) {
    if (remaining <= 0) {
      sources.push({ path: source.path, status: 'omitted', reason: 'total-size-limit' });
      notices.push('logs-total-cap-reached');
      continue;
    }
    try {
      const limit = Math.min(maxFileBytes, remaining);
      const tail = await readLogTail(source, limit);
      const sanitized = sanitizeTail(tail.text, options, limit, source.path.endsWith('.jsonl'));
      const truncated = tail.truncated || sanitized.truncated;
      files.push({ path: source.path, content: sanitized.content });
      sources.push({
        path: source.path,
        status: truncated ? 'truncated' : 'collected',
        bytes: sanitized.bytes,
      });
      if (truncated) notices.push(`log-truncated:${source.path.slice(5)}`);
      remaining -= sanitized.bytes;
    } catch (error) {
      const code = errorCode(error);
      const status = code === 'ENOENT' ? 'missing' : 'unreadable';
      sources.push({ path: source.path, status, reason: code });
      notices.push(`log-${status}:${source.path.slice(5)}`);
    }
  }
  return { files, sources, notices: [...new Set(notices)] };
}
