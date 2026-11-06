import assert from 'node:assert/strict';
import test from 'node:test';
import { projectFileReference, parseFileReferences } from './fileReferences.js';

test('simple completion keeps exactly the existing wire text', () => {
  assert.equal(projectFileReference('C:\\project', 'src/index.ts', 'win32'), '@src/index.ts');
});

test('special project paths retain their exact native identity', () => {
  for (const [root, relative, platform, expected] of [
    ['C:\\project', '资料/方案 (1)[x]#.md', 'win32', 'C:\\project\\资料\\方案 (1)[x]#.md'],
    ['/project', 'docs/a b.md', 'linux', '/project/docs/a b.md'],
    ['\\\\server\\share', 'docs/a b.md', 'win32', '\\\\server\\share\\docs\\a b.md'],
  ]) {
    const reference = projectFileReference(root!, relative!, platform!);
    const parsed = parseFileReferences(reference, platform);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.kind, 'file');
    if (parsed[0]?.kind === 'file') assert.equal(parsed[0].path, expected);
  }
});
