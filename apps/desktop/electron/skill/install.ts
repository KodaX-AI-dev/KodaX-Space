import { randomBytes } from 'node:crypto';
import { promises as fsp, createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { getKodaxDir } from '../kodax/data-paths.js';

export type SkillInstallSource = 'directory' | 'archive';
export type SkillInstallTarget = 'user' | 'project';

export interface SkillInstallOptions {
  readonly target: SkillInstallTarget;
  readonly projectRoot?: string;
}

export interface InstalledSkillResult {
  readonly installed: true;
  readonly name: string;
  readonly installDir: string;
  readonly targetDir: string;
}

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const MAX_ENTRIES = 4096;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const MAX_SKILL_MD_BYTES = 64 * 1024;

export function getSkillTargetDir(
  target: SkillInstallTarget,
  projectRoot?: string,
): string {
  if (target === 'user') return path.join(getKodaxDir(), 'skills');
  if (!projectRoot || !path.isAbsolute(projectRoot)) {
    throw new Error('project skill install requires an absolute projectRoot');
  }
  return path.join(path.normalize(projectRoot), '.kodax', 'skills');
}

export async function installSkillFromPath(
  source: SkillInstallSource,
  sourcePath: string,
  options: SkillInstallOptions,
): Promise<InstalledSkillResult> {
  if (source === 'directory') return installSkillDirectory(sourcePath, options);
  return installSkillArchive(sourcePath, options);
}

async function installSkillDirectory(
  sourceDir: string,
  options: SkillInstallOptions,
): Promise<InstalledSkillResult> {
  const targetDir = getSkillTargetDir(options.target, options.projectRoot);
  await fsp.mkdir(targetDir, { recursive: true, mode: 0o700 });

  const absSource = path.resolve(sourceDir);
  const stat = await fsp.stat(absSource).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error('selected skill folder not found');

  const skillRoot = await findSkillRoot(absSource);
  await assertNoSymlinks(skillRoot);
  const name = await readSkillName(skillRoot);
  const installDir = path.join(targetDir, name);
  assertInsideBase(targetDir, installDir, 'skill install target');

  if (path.resolve(skillRoot) === path.resolve(installDir)) {
    return { installed: true, name, installDir, targetDir };
  }

  await copyDirectoryAtomic(skillRoot, installDir, targetDir);
  return { installed: true, name, installDir, targetDir };
}

async function installSkillArchive(
  sourcePath: string,
  options: SkillInstallOptions,
): Promise<InstalledSkillResult> {
  const targetDir = getSkillTargetDir(options.target, options.projectRoot);
  await fsp.mkdir(targetDir, { recursive: true, mode: 0o700 });

  const absSource = path.resolve(sourcePath);
  const stat = await fsp.stat(absSource).catch(() => null);
  if (!stat || !stat.isFile()) throw new Error('selected skill archive not found');
  if (stat.size > MAX_TOTAL_BYTES) {
    throw new Error(`skill archive too large (${stat.size} bytes)`);
  }

  const tmpBase = path.join(targetDir, '.install-tmp');
  await fsp.mkdir(tmpBase, { recursive: true, mode: 0o700 });
  const nonce = randomBytes(6).toString('hex');
  const tmpZip = path.join(tmpBase, `skill-${process.pid}-${Date.now()}-${nonce}.zip`);
  const extractRoot = path.join(tmpBase, `extract-${process.pid}-${Date.now()}-${nonce}`);
  assertInsideBase(targetDir, tmpZip, 'temporary skill archive');
  assertInsideBase(targetDir, extractRoot, 'temporary skill extract root');

  try {
    await fsp.copyFile(absSource, tmpZip);
    await fsp.mkdir(extractRoot, { recursive: true, mode: 0o700 });
    await extractZip(tmpZip, extractRoot);
    return await installSkillDirectory(extractRoot, options);
  } finally {
    await fsp.rm(tmpZip, { force: true }).catch(() => undefined);
    await fsp.rm(extractRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function findSkillRoot(baseDir: string): Promise<string> {
  if (await pathIsFile(path.join(baseDir, 'SKILL.md'))) return baseDir;

  const entries = await fsp.readdir(baseDir, { withFileTypes: true });
  const candidates: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '__MACOSX') continue;
    const child = path.join(baseDir, entry.name);
    if (await pathIsFile(path.join(child, 'SKILL.md'))) candidates.push(child);
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error('archive contains multiple skill folders; choose one skill at a time');
  }
  throw new Error('skill folder must contain SKILL.md');
}

async function readSkillName(skillRoot: string): Promise<string> {
  const skillPath = path.join(skillRoot, 'SKILL.md');
  const stat = await fsp.stat(skillPath);
  if (!stat.isFile()) throw new Error('SKILL.md is not a file');
  const handle = await fsp.open(skillPath, 'r');
  let text: string;
  try {
    const buffer = Buffer.alloc(Math.min(stat.size, MAX_SKILL_MD_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    text = buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
  const frontmatter = text.startsWith('---')
    ? /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
    : text.slice(0, MAX_SKILL_MD_BYTES);
  const match = /^name:\s*['"]?([^'"\r\n#]+)['"]?\s*(?:#.*)?$/m.exec(frontmatter);
  const name = match?.[1]?.trim();
  if (!name) throw new Error('SKILL.md must declare a frontmatter name');
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error('SKILL.md name must be lowercase and match [a-z0-9][a-z0-9._:-]{0,63}');
  }
  return name;
}

async function copyDirectoryAtomic(
  sourceRoot: string,
  installDir: string,
  targetDir: string,
): Promise<void> {
  assertInsideBase(targetDir, installDir, 'skill install target');
  if (path.resolve(installDir) === path.resolve(targetDir)) {
    throw new Error('refusing to replace the skills root directory');
  }

  const tmpBase = path.join(targetDir, '.install-tmp');
  await fsp.mkdir(tmpBase, { recursive: true, mode: 0o700 });
  const tmpDir = path.join(
    tmpBase,
    `copy-${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`,
  );
  const backupDir = path.join(
    tmpBase,
    `backup-${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`,
  );
  assertInsideBase(targetDir, tmpDir, 'temporary skill copy');
  assertInsideBase(targetDir, backupDir, 'temporary skill backup');

  try {
    await fsp.cp(sourceRoot, tmpDir, {
      recursive: true,
      force: true,
      errorOnExist: false,
    });
    await assertNoSymlinks(tmpDir);
    const existing = await fsp
      .lstat(installDir)
      .then(() => true)
      .catch((err) => {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ENOTDIR') return false;
        throw err;
      });
    if (existing) await fsp.rename(installDir, backupDir);
    try {
      await fsp.rename(tmpDir, installDir);
    } catch (err) {
      if (existing) await fsp.rename(backupDir, installDir).catch(() => undefined);
      throw err;
    }
    if (existing) await fsp.rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
  } catch (err) {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

async function assertNoSymlinks(root: string): Promise<void> {
  let seen = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      seen++;
      if (seen > MAX_ENTRIES) throw new Error(`skill contains more than ${MAX_ENTRIES} entries`);
      const full = path.join(dir, entry.name);
      const stat = await fsp.lstat(full);
      if (stat.isSymbolicLink()) throw new Error(`skill contains symlink: ${entry.name}`);
      if (stat.isDirectory()) await walk(full);
    }
  }
  await walk(root);
}

function openZipFile(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        reject(err ?? new Error('failed to open zip archive'));
        return;
      }
      resolve(zip);
    });
  });
}

async function forEachEntrySequential(
  zip: yauzl.ZipFile,
  perEntry: (entry: yauzl.Entry) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let processed = 0;
    let stopped = false;
    const stop = (err: Error): void => {
      if (stopped) return;
      stopped = true;
      reject(err);
    };
    zip.on('entry', (entry: yauzl.Entry) => {
      processed++;
      if (processed > MAX_ENTRIES) {
        stop(new Error(`archive has more than ${MAX_ENTRIES} entries`));
        return;
      }
      perEntry(entry)
        .then(() => {
          if (!stopped) zip.readEntry();
        })
        .catch(stop);
    });
    zip.on('end', () => {
      if (!stopped) resolve();
    });
    zip.on('error', stop);
    zip.readEntry();
  });
}

async function extractZip(zipPath: string, extractRoot: string): Promise<void> {
  const zip = await openZipFile(zipPath);
  try {
    let totalBytes = 0;
    await forEachEntrySequential(zip, async (entry) => {
      const isDir = entry.fileName.endsWith('/');
      const probePath = isDir ? entry.fileName.slice(0, -1) : entry.fileName;
      const destPath = safeJoin(extractRoot, probePath);
      if (isSymlinkEntry(entry)) {
        throw new Error(`archive entry "${entry.fileName}" is a symlink`);
      }
      if (isDir) {
        await fsp.mkdir(destPath, { recursive: true });
        return;
      }

      const uncompressed = Number(entry.uncompressedSize ?? 0);
      const compressed = Number(entry.compressedSize ?? 0);
      if (compressed === 0 && uncompressed > 0) {
        throw new Error(`archive entry "${entry.fileName}" has invalid compressed size`);
      }
      if (compressed > 0 && uncompressed / compressed > MAX_COMPRESSION_RATIO) {
        throw new Error(`archive entry "${entry.fileName}" exceeds compression ratio guard`);
      }
      if (totalBytes + uncompressed > MAX_TOTAL_BYTES) {
        throw new Error(`archive exceeds total extracted size ${MAX_TOTAL_BYTES} bytes`);
      }

      await fsp.mkdir(path.dirname(destPath), { recursive: true });
      const stream = await new Promise<Readable>((resolve, reject) => {
        zip.openReadStream(entry, (err, s) => {
          if (err || !s) {
            reject(err ?? new Error('failed to read zip entry'));
            return;
          }
          resolve(s);
        });
      });
      let entryBytes = 0;
      stream.on('data', (chunk: Buffer) => {
        entryBytes += chunk.length;
        if (entryBytes > uncompressed + 1024 || totalBytes + entryBytes > MAX_TOTAL_BYTES) {
          stream.destroy(new Error(`archive entry "${entry.fileName}" exceeds declared size`));
        }
      });
      await pipeline(stream, createWriteStream(destPath));
      totalBytes += entryBytes;
      const written = await fsp.lstat(destPath);
      if (written.isSymbolicLink()) {
        throw new Error(`extracted entry "${entry.fileName}" became a symlink`);
      }
    });
  } finally {
    zip.close();
  }
}

function safeJoin(base: string, entryName: string): string {
  if (!entryName || entryName.startsWith('/') || entryName.startsWith('\\')) {
    throw new Error(`unsafe archive entry "${entryName || '<empty>'}"`);
  }
  if (/^[A-Za-z]:[\\/]/.test(entryName)) {
    throw new Error(`unsafe archive entry "${entryName}"`);
  }
  const segments = entryName.split(/[\\/]/);
  if (segments.some((segment) => segment === '' || segment === '..')) {
    throw new Error(`unsafe archive entry "${entryName}"`);
  }
  const dest = path.resolve(base, entryName);
  assertInsideBase(base, dest, 'archive entry');
  return dest;
}

function isSymlinkEntry(entry: yauzl.Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const S_IFLNK = 0o120000;
  const S_IFMT = 0o170000;
  return (mode & S_IFMT) === S_IFLNK;
}

async function pathIsFile(filePath: string): Promise<boolean> {
  return fsp
    .stat(filePath)
    .then((stat) => stat.isFile())
    .catch(() => false);
}

function assertInsideBase(base: string, candidate: string, label: string): void {
  if (!isInsideBase(base, candidate)) {
    throw new Error(`${label} escapes skills directory`);
  }
}

function isInsideBase(base: string, candidate: string): boolean {
  const resolvedBase = normalizeForPrefix(base);
  const resolved = normalizeForPrefix(candidate);
  const withSep = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
  return resolved === resolvedBase || resolved.startsWith(withSep);
}

function normalizeForPrefix(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
