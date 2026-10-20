import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  default as registerSpaceArtifacts,
  resolveArtifactNode,
  resolveSpaceArtifactImports,
} from '../../resources/space-artifacts.mjs';

test('Space Artifact extension resolves the installed public SDK and a real Node worker', async () => {
  assert.equal(await resolveArtifactNode(), process.execPath);
  const imports = resolveSpaceArtifactImports();
  assert.equal(imports.artifact, import.meta.resolve('@kodax-ai/kodax/artifacts/kodax'));
  assert.equal(imports.coding, import.meta.resolve('@kodax-ai/kodax/coding'));
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
