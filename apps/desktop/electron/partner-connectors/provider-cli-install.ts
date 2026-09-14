import { createHash } from 'node:crypto';
import { lstat, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ReadConnectorError } from './read-connector.js';
import { ensureProviderDirectory } from './provider-cli-process.js';

export interface ProviderCliAsset {
  url: string;
  sha256?: string;
  /** npm integrity digest, base64 without the sha512- prefix. */
  sha512?: string;
  binaryPath: string;
  allowedFiles: readonly string[];
  /** Exact empty directory headers present in this pinned archive; never extracted. */
  allowedDirectories?: readonly string[];
}
export interface ProviderCliInstaller {
  executable: string;
  install: (signal: AbortSignal) => Promise<string>;
}
export interface ProviderCliInstallerOptions {
  root: string;
  provider: string;
  version: string;
  platform?: NodeJS.Platform;
  arch?: string;
  asset?: ProviderCliAsset;
  executableName?: string;
  fetch?: typeof globalThis.fetch;
  verifyBinary: (file: string, signal: AbortSignal) => Promise<boolean>;
}

const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_EXPANDED = 128 * 1024 * 1024;
const MAX_METADATA = 1024 * 1024;
const ALLOWED_HOSTS = new Set([
  'registry.npmjs.org',
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
]);

function active(signal: AbortSignal): void {
  if (signal.aborted) throw new ReadConnectorError('cancelled');
}

function extract(archive: Buffer, asset: ProviderCliAsset): Buffer {
  const tar = gunzipSync(archive, { maxOutputLength: MAX_EXPANDED });
  const seen = new Set<string>();
  let binary: Buffer | undefined;
  let offset = 0;
  for (; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').split('\0')[0];
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0/gu, '').trim();
    const sumText = header.subarray(148, 156).toString('ascii').replace(/\0/gu, '').trim();
    const size = /^[0-7]+$/u.test(sizeText) ? parseInt(sizeText, 8) : NaN;
    const checksum = /^[0-7]+$/u.test(sumText) ? parseInt(sumText, 8) : NaN;
    const actual = header.reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0);
    const directory = header[156] === 53;
    const allowedEntry = directory
      ? size === 0 && asset.allowedDirectories?.includes(name)
      : (header[156] === 0 || header[156] === 48) && asset.allowedFiles.includes(name);
    if (
      seen.size >= 64 ||
      seen.has(name) ||
      !allowedEntry ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > MAX_EXPANDED ||
      offset + 512 + Math.ceil(size / 512) * 512 > tar.length ||
      actual !== checksum ||
      header.subarray(157, 257).some((byte) => byte !== 0) ||
      header.subarray(345, 500).some((byte) => byte !== 0)
    )
      throw new ReadConnectorError('installation_failed');
    // Non-selected native binaries are allowed only through the pinned exact inventory.
    if (!directory && name === asset.binaryPath)
      binary = tar.subarray(offset + 512, offset + 512 + size);
    else if (!/\/(?:dist|bin)\//u.test(name) && size > MAX_METADATA)
      throw new ReadConnectorError('installation_failed');
    seen.add(name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (
    !binary?.length ||
    offset + 1024 > tar.length ||
    tar.subarray(offset).some((byte) => byte !== 0)
  )
    throw new ReadConnectorError('installation_failed');
  return binary;
}

async function response(
  url: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
  progress: () => void,
): Promise<Response> {
  for (let redirects = 0; redirects <= 3; redirects++) {
    const target = new URL(url);
    if (
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      target.port ||
      target.hash ||
      !ALLOWED_HOSTS.has(target.hostname)
    )
      throw new ReadConnectorError('installation_failed');
    active(signal);
    const result = await fetcher(url, { signal, redirect: 'manual' });
    active(signal);
    progress();
    if (![301, 302, 303, 307, 308].includes(result.status)) return result;
    await result.body?.cancel();
    const next = result.headers.get('location');
    if (!next) throw new ReadConnectorError('installation_failed');
    url = new URL(next, url).href;
  }
  throw new ReadConnectorError('installation_failed');
}

async function download(
  asset: ProviderCliAsset,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<Buffer> {
  const idle = new AbortController();
  const combined = AbortSignal.any([signal, idle.signal]);
  let timer: ReturnType<typeof setTimeout>;
  const progress = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(), 120000);
    timer.unref();
  };
  progress();
  try {
    const result = await response(asset.url, combined, fetcher, progress);
    if (!result.ok || !result.body) throw new ReadConnectorError('installation_failed');
    const reader = result.body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for (;;) {
        active(combined);
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_ARCHIVE) throw new ReadConnectorError('installation_failed');
        if (value.byteLength) progress();
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel();
    }
    active(combined);
    const data = Buffer.concat(chunks);
    const valid = asset.sha512
      ? createHash('sha512').update(data).digest('base64') === asset.sha512
      : !!asset.sha256 && createHash('sha256').update(data).digest('hex') === asset.sha256;
    if (!valid) throw new ReadConnectorError('installation_failed');
    return data;
  } finally {
    clearTimeout(timer!);
  }
}

async function existing(file: string): Promise<boolean> {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new ReadConnectorError('installation_failed');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Pinned host assets only. Extracts bytes in memory; never runs npm/scripts or archives. */
export function createProviderCliInstaller(
  options: ProviderCliInstallerOptions,
): ProviderCliInstaller {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const executableName = options.executableName ?? options.provider;
  const names = [options.provider, options.version, platform, arch, executableName];
  if (
    !path.isAbsolute(options.root) ||
    names.some((value) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/u.test(value))
  )
    throw new ReadConnectorError('installation_failed');
  const parent = path.join(options.root, options.provider, 'cli', options.version);
  const directory = path.join(parent, `${platform}-${arch}`);
  const executable = path.join(directory, executableName);
  return {
    executable,
    install: async (signal) => {
      active(signal);
      if (!options.asset) throw new ReadConnectorError('unsupported_platform');
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(), 15 * 60 * 1000);
      timer.unref();
      const bounded = AbortSignal.any([signal, deadline.signal]);
      let staging: string | undefined;
      try {
        await ensureProviderDirectory(parent);
        if (await existing(executable)) {
          await ensureProviderDirectory(directory);
          if (!(await options.verifyBinary(executable, bounded)))
            throw new ReadConnectorError('installation_failed');
          active(bounded);
          return executable;
        }
        const archive = await download(options.asset, bounded, options.fetch ?? globalThis.fetch);
        const binary = extract(archive, options.asset);
        active(bounded);
        staging = await mkdtemp(path.join(parent, '.install-'));
        const temporary = path.join(staging, executableName);
        await writeFile(temporary, binary, { mode: 0o700, flag: 'wx' });
        if (!(await options.verifyBinary(temporary, bounded)))
          throw new ReadConnectorError('installation_failed');
        active(bounded);
        await rename(staging, directory);
        staging = undefined;
        active(bounded);
        return executable;
      } catch {
        throw new ReadConnectorError(signal.aborted ? 'cancelled' : 'installation_failed');
      } finally {
        clearTimeout(timer);
        if (staging)
          await rm(staging, { recursive: true, force: true }).catch(() => {
            throw new ReadConnectorError('installation_failed');
          });
      }
    },
  };
}
