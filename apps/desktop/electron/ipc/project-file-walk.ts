// project.fileSearch 的文件遍历。
//
// 规则（参考 codex / opencode / ZCode 的做法）:
//   - 项目根 .gitignore 决定哪些产物不进搜索 —— dist/build 是否忽略由项目自己说了算。
//   - 内置只跳依赖、版本库、缓存目录：它们体量大且永远不是用户要引用的文件。
//   - 隐藏目录（.agent / .kodax / .vscode …）照常遍历；不想要就写进 .gitignore。
//   - 点击链接定位（respectGitignore=false）不套 .gitignore：agent 刚写的文件常在产物目录里。
//   - symlink 一律不进，防环。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { debuglog } from 'node:util';
import ignore, { type Ignore } from 'ignore';

const log = debuglog('kodax:project-file-walk');

const SKIPPED_DIRS = new Set<string>([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'bower_components',
  'Pods',
  'site-packages',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.gradle',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.next',
  '.nuxt',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
]);

export type WalkOptions = { readonly hardCap: number; readonly respectGitignore?: boolean };
export type WalkResult = {
  readonly paths: string[];
  /** Folders passing the same exclusions, so `@` can reference a folder. */
  readonly directories: string[];
  readonly capped: boolean;
};

async function loadRootGitignore(root: string): Promise<Ignore | null> {
  try {
    return ignore().add(await fs.readFile(path.join(root, '.gitignore'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      log('read .gitignore failed: %O', error);
    return null;
  }
}

/** BFS 收集 posix 相对路径（文件 + 文件夹）；capped = 文件数达到 hardCap 后停止，结果不全。 */
export async function walkProjectFiles(root: string, options: WalkOptions): Promise<WalkResult> {
  const gitignore = options.respectGitignore === false ? null : await loadRootGitignore(root);
  const paths: string[] = [];
  const directories: string[] = [];
  const queue: string[] = ['']; // 相对路径，空串 = root
  while (queue.length > 0) {
    const rel = queue.shift()!;
    let entries;
    try {
      entries = await fs.readdir(rel === '' ? root : path.join(root, rel), { withFileTypes: true });
    } catch (error) {
      log('readdir %s failed: %O', rel, error);
      continue;
    }
    for (const ent of entries) {
      if (ent.isSymbolicLink()) continue;
      const childRel = rel === '' ? ent.name : `${rel}/${ent.name}`;
      if (ent.isDirectory()) {
        if (SKIPPED_DIRS.has(ent.name) || gitignore?.ignores(`${childRel}/`)) continue;
        directories.push(childRel);
        queue.push(childRel);
      } else if (ent.isFile() && !gitignore?.ignores(childRel)) {
        if (paths.length >= options.hardCap) return { paths, directories, capped: true };
        paths.push(childRel);
      }
    }
  }
  return { paths, directories, capped: false };
}

/** Search candidates, pre-sorted so a folder (trailing `/`) precedes its contents. */
export function projectSearchEntries(walked: WalkResult, includeDirectories: boolean): string[] {
  const entries = includeDirectories
    ? [...walked.paths, ...walked.directories.map((dir) => `${dir}/`)]
    : [...walked.paths];
  return entries.sort();
}

/** Case-insensitive substring match: name hits first, then path hits, each in sorted order. */
export function rankProjectPaths(
  entries: readonly string[],
  query: string,
  limit: number,
): { paths: string[]; truncated: boolean } {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0)
    return { paths: entries.slice(0, limit), truncated: entries.length > limit };
  const nameHits: string[] = [];
  const pathHits: string[] = [];
  // No early exit: a later entry can still outrank earlier ones.
  for (const entry of entries) {
    const bare = entry.endsWith('/') ? entry.slice(0, -1) : entry;
    if (bare.slice(bare.lastIndexOf('/') + 1).toLowerCase().includes(needle)) nameHits.push(entry);
    else if (entry.toLowerCase().includes(needle)) pathHits.push(entry);
  }
  const merged = [...nameHits, ...pathHits];
  return { paths: merged.slice(0, limit), truncated: merged.length > limit };
}
