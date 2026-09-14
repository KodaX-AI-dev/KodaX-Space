import { createHash } from 'node:crypto';
import { constants, lstatSync } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { ensureProviderDirectory } from './provider-cli-process.js';
import { ReadConnectorError } from './read-connector.js';

// Computed from the authenticated official @wecom/cli-darwin-arm64 1.2.0 archive.
const BINARY_SHA256 = '6c8d6b7e9fd8c23d39f24cf954e2e96cd26ed2eb01aa3375ba33d2ecbc207ebd';
const BINARY_SIZE = 7221312;

function active(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReadConnectorError('cancelled');
}

/** Rechecked synchronously after host guards and immediately before process dispatch. */
export function wecomExecutableStamp(file: string): string {
  try {
    const stat = lstatSync(file, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n)
      throw new ReadConnectorError('installation_failed');
    return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mode}:${stat.mtimeNs}:${stat.ctimeNs}`;
  } catch {
    throw new ReadConnectorError('installation_failed');
  }
}

/** Authenticate bounded native bytes without executing them or following links. */
export async function verifyWecomBinary(file: string, signal?: AbortSignal): Promise<boolean> {
  active(signal);
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== BINARY_SIZE)
      return false;
    await ensureProviderDirectory(path.dirname(file));
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== BINARY_SIZE)
        return false;
      const hash = createHash('sha256');
      const buffer = Buffer.alloc(1024 * 1024);
      for (let offset = 0; offset < BINARY_SIZE;) {
        active(signal);
        const { bytesRead } = await handle.read(
          buffer,
          0,
          Math.min(buffer.length, BINARY_SIZE - offset),
          offset,
        );
        if (!bytesRead) return false;
        hash.update(buffer.subarray(0, bytesRead));
        offset += bytesRead;
      }
      const final = await handle.stat();
      active(signal);
      return (
        final.size === BINARY_SIZE &&
        final.mtimeMs === opened.mtimeMs &&
        final.ctimeMs === opened.ctimeMs &&
        hash.digest('hex') === BINARY_SHA256
      );
    } finally {
      await handle.close();
    }
  } catch {
    active(signal);
    return false;
  }
}
