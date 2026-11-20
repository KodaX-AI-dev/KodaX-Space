import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { walkProjectFiles } from '../ipc/project-file-walk.js';

async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kodax-walk-'));
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), content);
  }
  return root;
}

async function withProject(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await makeProject(files);
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('build output and hidden folders are searched; dependencies and VCS are not', async () => {
  await withProject(
    {
      'dist/report.html': '',
      'build/out.txt': '',
      'out/a.md': '',
      '.agent/notes.md': '',
      '.vscode/settings.json': '',
      '.env': '',
      'node_modules/x/index.js': '',
      '.git/HEAD': '',
      'src/__pycache__/m.pyc': '',
    },
    async (root) => {
      const { paths, capped } = await walkProjectFiles(root, { hardCap: 100 });
      assert.deepEqual([...paths].sort(), [
        '.agent/notes.md',
        '.env',
        '.vscode/settings.json',
        'build/out.txt',
        'dist/report.html',
        'out/a.md',
      ]);
      assert.equal(capped, false);
    },
  );
});

test('the root .gitignore hides matching folders and files, honoring negation', async () => {
  await withProject(
    {
      '.gitignore': 'dist/\n*.log\n!keep.log\n',
      'dist/report.html': '',
      'src/dist.ts': '',
      'logs/a.log': '',
      'logs/keep.log': '',
    },
    async (root) => {
      const { paths } = await walkProjectFiles(root, { hardCap: 100 });
      assert.deepEqual([...paths].sort(), ['.gitignore', 'logs/keep.log', 'src/dist.ts']);
    },
  );
});

test('locate mode ignores .gitignore but still skips dependencies', async () => {
  await withProject(
    {
      '.gitignore': 'dist/\n',
      'dist/report.html': '',
      'node_modules/x/index.js': '',
    },
    async (root) => {
      const { paths } = await walkProjectFiles(root, { hardCap: 100, respectGitignore: false });
      assert.deepEqual([...paths].sort(), ['.gitignore', 'dist/report.html']);
    },
  );
});

test('hitting the cap is reported', async () => {
  await withProject({ 'a.txt': '', 'b.txt': '', 'c.txt': '' }, async (root) => {
    const { paths, capped } = await walkProjectFiles(root, { hardCap: 2 });
    assert.equal(paths.length, 2);
    assert.equal(capped, true);
  });
});
