import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  default as registerSpaceArtifacts,
  resolveArtifactNode,
  resolveLibreOffice,
  resolveSpaceArtifactImports,
} from '../../resources/space-artifacts.mjs';

test('Space Artifact extension resolves the installed public SDK and a real Node worker', async () => {
  assert.equal(await resolveArtifactNode(), process.execPath);
  const imports = resolveSpaceArtifactImports();
  assert.equal(
    await realpath(fileURLToPath(imports.artifact)),
    await realpath(fileURLToPath(import.meta.resolve('@kodax-ai/kodax/artifacts/kodax'))),
  );
  assert.equal(
    await realpath(fileURLToPath(imports.coding)),
    await realpath(fileURLToPath(import.meta.resolve('@kodax-ai/kodax/coding'))),
  );
  const names = [];
  const removed = [];
  const dispose = await registerSpaceArtifacts({
    registerSkillPath: (directory) => {
      assert.ok(path.isAbsolute(directory));
      return () => removed.push('skill');
    },
    registerTool: (tool) => {
      names.push(tool.name);
      return () => removed.push(tool.name);
    },
  });
  assert.equal(names.length, 9);
  assert.ok(names.includes('artifact_render'));
  dispose();
  assert.equal(removed.length, 10);
});

test('a Host outside Electron never resolves the SDK outside the packaged Space copy', async () => {
  // Real Node sees app.asar as a file: a Host the KodaX CLI started cannot load the SDK inside it.
  const resources = await mkdtemp(path.join(os.tmpdir(), 'space-artifacts-packaged-'));
  try {
    await writeFile(path.join(resources, 'app.asar'), 'archive');
    assert.throws(() => resolveSpaceArtifactImports(resources), /not started by KodaX Space/);
  } finally {
    await rm(resources, { recursive: true, force: true });
  }
});

test('Space injects LibreOffice only from fixed install locations', () => {
  const installed =
    (...files) =>
    (candidate) =>
      files.includes(candidate);
  const windows = {
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    PATH: 'C:\\project\\bin',
  };
  assert.equal(
    resolveLibreOffice(
      windows,
      'win32',
      installed('C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com'),
    ),
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
  );
  assert.equal(
    resolveLibreOffice(windows, 'win32', installed('C:\\project\\bin\\soffice.com')),
    undefined,
  );
  assert.equal(
    resolveLibreOffice({ ProgramFiles: 'relative' }, 'win32', () => true),
    undefined,
  );
  assert.equal(
    resolveLibreOffice(
      {},
      'darwin',
      installed('/Applications/LibreOffice.app/Contents/MacOS/soffice'),
    ),
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  );
  assert.equal(
    resolveLibreOffice({}, 'linux', installed('/usr/lib64/libreoffice/program/soffice')),
    '/usr/lib64/libreoffice/program/soffice',
  );
  assert.equal(
    resolveLibreOffice({}, 'linux', () => false),
    undefined,
  );
});

test('Electron Host rejects missing Node and probes shell PATH without Node injection variables', async () => {
  const electron = createRequire(import.meta.url)('electron');
  const source = `
import assert from 'node:assert/strict';
import {resolveArtifactNode} from ${JSON.stringify(new URL('../../resources/space-artifacts.mjs', import.meta.url).href)};
assert.ok(process.versions.electron);
await assert.rejects(resolveArtifactNode({PATH:'.'}), /real Node.js/);
const node = await resolveArtifactNode({
  Path: ${JSON.stringify(path.dirname(process.execPath))},
  NODE_OPTIONS:'--require nonexistent-space-injection',
  NODE_PATH:'nonexistent-space-injection',
  ELECTRON_RUN_AS_NODE:'1',
});
assert.equal(node, ${JSON.stringify(process.execPath)});
`;
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  await promisify(execFile)(electron, ['--input-type=module', '--eval', source], {
    env,
    timeout: 15_000,
    windowsHide: true,
  });
});
