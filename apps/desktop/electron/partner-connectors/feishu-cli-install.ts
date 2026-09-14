import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import yauzl from 'yauzl';
import { createFeishuCliRunner } from './feishu-cli-runner.js';
import {
  FEISHU_CLI_RELEASE,
  FEISHU_CLI_VERSION,
  isCompatibleFeishuCliVersion,
} from './feishu-cli-release.js';
import { FeishuOnboardingError } from './feishu-auth-process.js';

export { FEISHU_CLI_VERSION } from './feishu-cli-release.js';
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_BINARY = 128 * 1024 * 1024;
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;
const DOWNLOAD_IDLE_MS = 2 * 60 * 1000;
const METADATA = new Set(['README.md', 'LICENSE', 'CHANGELOG.md']);
// The checked-in lock is the single release source for runtime and packaging.
const ASSETS: Readonly<Record<string, { name: string; digest: string; bytes: number }>> =
  Object.fromEntries(
    Object.entries(FEISHU_CLI_RELEASE.assets).map(([target, asset]) => [
      target,
      { name: asset.name, digest: asset.sha256, bytes: asset.bytes },
    ]),
  );

export function managedFeishuCliPath(
  root: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  return path.join(
    root,
    'feishu-cli',
    FEISHU_CLI_VERSION,
    `${platform}-${arch}`,
    platform === 'win32' ? 'lark-cli.exe' : 'lark-cli',
  );
}

export function bundledFeishuCliArchivePath(
  root: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  return path.join(
    root,
    'feishu-cli',
    FEISHU_CLI_VERSION,
    `${platform}-${arch}`,
    platform === 'win32' ? 'lark-cli.zip' : 'lark-cli.tar.gz',
  );
}

export interface FeishuCliInstallerOptions {
  root: string;
  platform?: NodeJS.Platform;
  arch?: string;
  /** Trusted test/network seams, never renderer input. */
  fetch?: typeof globalThis.fetch;
  expectedDigest?: string;
  expectedBytes?: number;
  verifyBinary?: (file: string, signal: AbortSignal) => Promise<boolean>;
}

function active(signal: AbortSignal): void {
  if (signal.aborted) throw new FeishuOnboardingError('cancelled');
}

function extractTar(archive: Buffer): Buffer {
  const tar = gunzipSync(archive, { maxOutputLength: MAX_BINARY + 1024 * 1024 });
  let binary: Buffer | undefined;
  for (let offset = 0, entries = 0; offset + 512 <= tar.length; entries++) {
    if (entries > 64) throw new Error('archive entries');
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').split('\0')[0];
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim();
    const size = /^[0-7]+$/u.test(sizeText) ? parseInt(sizeText, 8) : NaN;
    const checksum = parseInt(header.subarray(148, 156).toString('ascii').trim(), 8);
    const actual = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > MAX_BINARY ||
      offset + 512 + size > tar.length ||
      checksum !== actual ||
      (name !== 'lark-cli' && !METADATA.has(name)) ||
      (header[156] !== 0 && header[156] !== 48) ||
      header.subarray(345, 500).some((byte) => byte !== 0) ||
      (name === 'lark-cli' && binary)
    ) {
      throw new Error('unsafe archive');
    }
    if (name === 'lark-cli') binary = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!binary?.length) throw new Error('missing binary');
  return binary;
}

function extractZip(archive: Buffer, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      archive,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new Error('invalid zip'));
          return;
        }
        let binary: Buffer | undefined;
        let settled = false;
        const fail = () => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', fail);
          zip.close();
          reject(new Error('unsafe zip'));
        };
        signal.addEventListener('abort', fail, { once: true });
        zip.on('error', fail);
        zip.on('entry', (entry: yauzl.Entry) => {
          const type = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (
            (binary && entry.fileName === 'lark-cli.exe') ||
            (entry.fileName !== 'lark-cli.exe' && !METADATA.has(entry.fileName)) ||
            !entry.uncompressedSize ||
            entry.uncompressedSize > MAX_BINARY ||
            (type !== 0 && type !== 0o100000) ||
            entry.generalPurposeBitFlag & 1
          ) {
            fail();
            return;
          }
          if (METADATA.has(entry.fileName)) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (readError, stream) => {
            if (readError || !stream) {
              fail();
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            stream.on('error', fail);
            stream.on('data', (chunk: Buffer) => {
              bytes += chunk.length;
              if (settled || signal.aborted || bytes > MAX_BINARY) {
                stream.destroy();
                fail();
                return;
              }
              chunks.push(chunk);
            });
            stream.on('end', () => {
              if (settled) return;
              binary = Buffer.concat(chunks);
              zip.readEntry();
            });
          });
        });
        zip.on('end', () => {
          if (settled) return;
          signal.removeEventListener('abort', fail);
          if (!binary?.length || signal.aborted) {
            fail();
            return;
          }
          settled = true;
          zip.close();
          resolve(binary);
        });
        if (signal.aborted) fail();
        else zip.readEntry();
      },
    );
  });
}

async function releaseResponse(
  initial: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
  progressed: () => void,
): Promise<Response> {
  let url = initial;
  for (let count = 0; count <= 3; count++) {
    active(signal);
    const target = new URL(url);
    if (
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      target.hash ||
      target.port ||
      ![
        'github.com',
        'release-assets.githubusercontent.com',
        'objects.githubusercontent.com',
      ].includes(target.hostname)
    )
      throw new Error('unsafe redirect');
    const response = await fetcher(url, { signal, redirect: 'manual' }).catch(() => {
      throw new FeishuOnboardingError('download_failed');
    });
    active(signal);
    progressed();
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location) throw new Error('missing redirect');
    url = new URL(location, url).href;
  }
  throw new Error('redirect limit');
}

async function download(url: string, signal: AbortSignal, fetcher: typeof fetch): Promise<Buffer> {
  const idle = new AbortController();
  const bounded = AbortSignal.any([signal, idle.signal]);
  let timer: ReturnType<typeof setTimeout>;
  const progressed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(), DOWNLOAD_IDLE_MS);
    timer.unref();
  };
  progressed();
  try {
    const response = await releaseResponse(url, bounded, fetcher, progressed);
    if (!response.ok || !response.body) throw new FeishuOnboardingError('download_failed');
    active(bounded);
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for (;;) {
        active(bounded);
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_ARCHIVE) throw new Error('archive too large');
        if (value.byteLength) progressed();
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel();
    }
    active(bounded);
    return Buffer.concat(chunks);
  } catch (error) {
    if (idle.signal.aborted && !signal.aborted) throw new FeishuOnboardingError('download_timeout');
    throw error;
  } finally {
    clearTimeout(timer!);
  }
}

async function verifyNative(file: string, signal: AbortSignal): Promise<boolean> {
  const result = await createFeishuCliRunner({ executable: file, timeoutMs: 10000 })({
    args: ['--version'],
    signal,
  });
  return result.exitCode === 0 && isCompatibleFeishuCliVersion(result.stdout);
}

async function existingBinary(file: string): Promise<boolean> {
  try {
    const parent = await lstat(path.dirname(file));
    if (!parent.isDirectory() || parent.isSymbolicLink())
      throw new Error('unsafe platform directory');
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('unsafe binary');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function resetManagedPlatformDirectory(file: string): Promise<void> {
  const directory = path.dirname(file);
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe platform directory');
    const entries = await readdir(directory);
    if (entries.some((entry) => entry !== path.basename(file)))
      throw new Error('foreign managed component file');
    await rm(directory, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function privateParent(root: string): Promise<string> {
  let directory = root;
  for (const part of ['', 'feishu-cli', FEISHU_CLI_VERSION]) {
    directory = path.join(directory, part);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe directory');
  }
  return directory;
}

async function cleanupStaging(directory: string): Promise<void> {
  try {
    await rm(directory, { recursive: true, force: true });
  } catch {
    throw new FeishuOnboardingError('installation_failed');
  }
}

async function bundledArchive(file: string, signal: AbortSignal): Promise<Buffer> {
  active(signal);
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_ARCHIVE)
    throw new Error('unsafe bundled archive');
  const data = await readFile(file);
  active(signal);
  return data;
}

async function verifiedArchiveBinary(input: {
  data: Buffer;
  digest: string;
  bytes?: number;
  platform: NodeJS.Platform;
  signal: AbortSignal;
}): Promise<Buffer> {
  if (input.bytes !== undefined && input.data.byteLength !== input.bytes)
    throw new Error('archive size mismatch');
  if (createHash('sha256').update(input.data).digest('hex') !== input.digest)
    throw new Error('checksum mismatch');
  active(input.signal);
  return input.platform === 'win32'
    ? await extractZip(input.data, input.signal)
    : extractTar(input.data);
}

async function publishBinary(input: {
  binary: Buffer;
  executable: string;
  parent: string;
  signal: AbortSignal;
  verify: (file: string, signal: AbortSignal) => Promise<boolean>;
}): Promise<string> {
  active(input.signal);
  let staging: string | undefined = await mkdtemp(path.join(input.parent, '.install-'));
  try {
    const candidate = path.join(staging, path.basename(input.executable));
    await writeFile(candidate, input.binary, { mode: 0o700, flag: 'wx' });
    await chmod(candidate, 0o700);
    active(input.signal);
    if (!(await input.verify(candidate, input.signal))) throw new Error('version mismatch');
    active(input.signal);
    await rename(staging, path.dirname(input.executable));
    staging = undefined;
    return input.executable;
  } finally {
    if (staging) await cleanupStaging(staging);
  }
}

async function publishArchive(input: {
  data: Buffer;
  digest: string;
  bytes?: number;
  executable: string;
  parent: string;
  platform: NodeJS.Platform;
  signal: AbortSignal;
  verify: (file: string, signal: AbortSignal) => Promise<boolean>;
}): Promise<string> {
  const binary = await verifiedArchiveBinary(input);
  return publishBinary({
    binary,
    executable: input.executable,
    parent: input.parent,
    signal: input.signal,
    verify: input.verify,
  });
}

async function existingMatchesBinary(file: string, binary: Buffer): Promise<boolean> {
  if (!(await existingBinary(file))) return false;
  const stat = await lstat(file);
  if (stat.size !== binary.byteLength) return false;
  return (await readFile(file)).equals(binary);
}

async function bundledBinary(input: {
  archive: string;
  digest: string;
  bytes?: number;
  platform: NodeJS.Platform;
  signal: AbortSignal;
}): Promise<Buffer> {
  const data = await bundledArchive(input.archive, input.signal);
  return verifiedArchiveBinary({
    data,
    digest: input.digest,
    bytes: input.bytes,
    platform: input.platform,
    signal: input.signal,
  });
}

export function createFeishuCliInstaller(options: FeishuCliInstallerOptions): {
  executable: string;
  install: (signal: AbortSignal) => Promise<string>;
  installBundled: (archive: string, signal: AbortSignal) => Promise<string>;
} {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const executable = managedFeishuCliPath(options.root, platform, arch);
  const asset = ASSETS[`${platform}-${arch}`];
  const prepareParent = async (): Promise<string> => {
    if (!asset) throw new FeishuOnboardingError('unsupported_platform');
    if (!path.isAbsolute(options.root) || options.root === path.parse(options.root).root)
      throw new Error('invalid root');
    return privateParent(options.root);
  };
  const prepare = async (signal: AbortSignal): Promise<string | undefined> => {
    const parent = await prepareParent();
    if (await existingBinary(executable)) {
      if (await (options.verifyBinary ?? verifyNative)(executable, signal)) {
        active(signal);
        return undefined;
      }
    }
    await resetManagedPlatformDirectory(executable);
    return parent;
  };
  const publish = (data: Buffer, parent: string, signal: AbortSignal) =>
    publishArchive({
      data,
      digest: options.expectedDigest ?? asset!.digest,
      bytes:
        options.expectedBytes ?? (options.expectedDigest === undefined ? asset!.bytes : undefined),
      executable,
      parent,
      platform,
      signal,
      verify: options.verifyBinary ?? verifyNative,
    });
  return {
    executable,
    install: async (signal) => {
      active(signal);
      const timeout = AbortSignal.timeout(INSTALL_TIMEOUT_MS);
      const bounded = AbortSignal.any([signal, timeout]);
      try {
        const parent = await prepare(bounded);
        if (!parent) return executable;
        const data = await download(
          `https://github.com/larksuite/cli/releases/download/v${FEISHU_CLI_VERSION}/lark-cli-${FEISHU_CLI_VERSION}-${asset.name}`,
          bounded,
          options.fetch ?? fetch,
        );
        return await publish(data, parent, bounded);
      } catch (error) {
        if (signal.aborted) throw new FeishuOnboardingError('cancelled');
        if (timeout.aborted) throw new FeishuOnboardingError('download_timeout');
        if (error instanceof FeishuOnboardingError) throw error;
        throw new FeishuOnboardingError('installation_failed');
      }
    },
    installBundled: async (archive, signal) => {
      active(signal);
      try {
        if (!asset) throw new FeishuOnboardingError('unsupported_platform');
        const binary = await bundledBinary({
          archive,
          digest: options.expectedDigest ?? asset.digest,
          bytes:
            options.expectedBytes ??
            (options.expectedDigest === undefined ? asset.bytes : undefined),
          platform,
          signal,
        });
        const parent = await prepareParent();
        if (
          (await existingMatchesBinary(executable, binary)) &&
          (await (options.verifyBinary ?? verifyNative)(executable, signal))
        ) {
          active(signal);
          return executable;
        }
        await resetManagedPlatformDirectory(executable);
        return await publishBinary({
          binary,
          executable,
          parent,
          signal,
          verify: options.verifyBinary ?? verifyNative,
        });
      } catch (error) {
        if (signal.aborted) throw new FeishuOnboardingError('cancelled');
        if (error instanceof FeishuOnboardingError && error.code === 'unsupported_platform')
          throw error;
        throw new FeishuOnboardingError('component_unavailable');
      }
    },
  };
}
