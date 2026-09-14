import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SPACE_ROOT = path.resolve(SCRIPT_DIR, '..');
const LOCK_PATH = path.join(SPACE_ROOT, 'resources', 'partner-connectors', 'feishu-cli.lock.json');
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const DEFAULT_TOTAL_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 1000;
const RELEASE_HOSTS = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
]);

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function assertLockAsset(lock, target) {
  if (!/^(?:darwin|linux|win32)-(?:arm64|riscv64|x64)$/u.test(target))
    throw new Error(`unsupported target: ${target}`);
  const asset = lock?.assets?.[target];
  if (!asset) throw new Error(`unsupported target: ${target}`);
  if (
    lock?.schemaVersion !== 1 ||
    lock?.component !== 'lark-cli' ||
    !/^\d+\.\d+\.\d+$/u.test(lock?.version ?? '') ||
    lock?.source !== `https://github.com/larksuite/cli/releases/tag/v${lock.version}` ||
    !Number.isSafeInteger(asset.bytes) ||
    asset.bytes < 1 ||
    asset.bytes > MAX_ARCHIVE_BYTES ||
    !/^[a-f0-9]{64}$/u.test(asset.sha256 ?? '') ||
    !/^[a-z0-9.-]+$/u.test(asset.name ?? '') ||
    !['tar.gz', 'zip'].includes(asset.format)
  )
    throw new Error(`invalid Feishu CLI lock entry: ${target}`);
  return asset;
}

async function cachedArchive(file, asset) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('unsafe component cache');
    if (stat.size !== asset.bytes) return false;
    return sha256(await readFile(file)) === asset.sha256;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function assertReleaseUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.port ||
    !RELEASE_HOSTS.has(url.hostname)
  )
    throw new Error('unsafe Feishu CLI release URL');
  return url;
}

async function downloadArchive(initialUrl, asset, fetcher, totalTimeoutMs, idleTimeoutMs) {
  const total = AbortSignal.timeout(totalTimeoutMs);
  const idle = new AbortController();
  const bounded = AbortSignal.any([total, idle.signal]);
  let idleTimer;
  const progressed = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => idle.abort(), idleTimeoutMs);
    idleTimer.unref?.();
  };
  const assertActive = () => {
    if (bounded.aborted) throw new Error('Feishu CLI archive download timed out');
  };
  let url = initialUrl;
  progressed();
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      assertActive();
      assertReleaseUrl(url);
      let response;
      try {
        response = await fetcher(url, { redirect: 'manual', signal: bounded });
      } catch (error) {
        assertActive();
        throw error;
      }
      assertActive();
      progressed();
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('missing Feishu CLI release redirect');
        url = new URL(location, url).href;
        continue;
      }
      if (!response.ok || !response.body) throw new Error('Feishu CLI archive download failed');
      const contentLength = response.headers.get('content-length');
      if (contentLength !== null) {
        const declaredBytes = Number(contentLength);
        if (!Number.isSafeInteger(declaredBytes) || declaredBytes !== asset.bytes)
          throw new Error('Feishu CLI archive integrity mismatch');
      }
      const reader = response.body.getReader();
      const cancelReader = () => void reader.cancel();
      bounded.addEventListener('abort', cancelReader, { once: true });
      const chunks = [];
      let bytes = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          assertActive();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > asset.bytes) {
            await reader.cancel();
            throw new Error('Feishu CLI archive integrity mismatch');
          }
          if (value.byteLength) progressed();
          chunks.push(Buffer.from(value));
        }
      } finally {
        bounded.removeEventListener('abort', cancelReader);
        await reader.cancel();
      }
      const data = Buffer.concat(chunks);
      if (data.byteLength !== asset.bytes || sha256(data) !== asset.sha256)
        throw new Error('Feishu CLI archive integrity mismatch');
      return data;
    }
    throw new Error('too many Feishu CLI release redirects');
  } finally {
    clearTimeout(idleTimer);
  }
}

async function safeDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe component directory');
}

async function prepareTarget({ root, target, lock, fetcher, totalTimeoutMs, idleTimeoutMs }) {
  const asset = assertLockAsset(lock, target);
  const directory = path.join(root, 'feishu-cli', lock.version, target);
  await safeDirectory(root);
  await safeDirectory(path.join(root, 'feishu-cli'));
  await safeDirectory(path.join(root, 'feishu-cli', lock.version));
  await safeDirectory(directory);
  const file = path.join(directory, asset.format === 'zip' ? 'lark-cli.zip' : 'lark-cli.tar.gz');
  if (await cachedArchive(file, asset)) return file;
  const source = `https://github.com/larksuite/cli/releases/download/v${lock.version}/lark-cli-${lock.version}-${asset.name}`;
  const data = await downloadArchive(source, asset, fetcher, totalTimeoutMs, idleTimeoutMs);
  const temporary = path.join(directory, `.download-${process.pid}-${Date.now()}`);
  try {
    await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
    await rm(file, { force: true });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return file;
}

export async function prepareFeishuCliAssets({
  root,
  targets,
  lock,
  fetcher = fetch,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}) {
  if (!path.isAbsolute(root) || root === path.parse(root).root)
    throw new Error('invalid Feishu CLI component root');
  if (!Array.isArray(targets) || targets.length < 1 || new Set(targets).size !== targets.length)
    throw new Error('invalid Feishu CLI targets');
  if (
    !Number.isSafeInteger(totalTimeoutMs) ||
    totalTimeoutMs < 1 ||
    totalTimeoutMs > 60 * 60 * 1000 ||
    !Number.isSafeInteger(idleTimeoutMs) ||
    idleTimeoutMs < 1 ||
    idleTimeoutMs > totalTimeoutMs
  )
    throw new Error('invalid Feishu CLI download timeouts');
  const files = [];
  for (const target of targets)
    files.push(
      await prepareTarget({
        root,
        target,
        lock,
        fetcher,
        totalTimeoutMs,
        idleTimeoutMs,
      }),
    );
  return files;
}

async function main() {
  const lock = JSON.parse(await readFile(LOCK_PATH, 'utf8'));
  const targets = process.argv.slice(2);
  const root = path.join(SPACE_ROOT, '.managed-components');
  const files = await prepareFeishuCliAssets({ root, targets, lock });
  for (const file of files) process.stdout.write(`[feishu-cli] prepared ${file}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
