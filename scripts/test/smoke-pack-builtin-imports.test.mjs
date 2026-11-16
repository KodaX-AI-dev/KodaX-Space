import assert from 'node:assert/strict';
import test from 'node:test';
import { unresolvedBuiltinPackages } from '../smoke-pack.mjs';

test('builtin Skill script packages must be physically unpacked for a real node', () => {
  const unpacked = [
    'C:/r/app.asar.unpacked/node_modules/yaml/package.json',
    'C:/r/app.asar.unpacked/node_modules/@scope/pkg/package.json',
  ];
  const sources = [
    "import YAML from 'yaml';\nimport path from 'node:path';\nimport { a } from './utils.js';",
    "import { zipSync } from 'fflate';\nimport x from \"@scope/pkg/sub\";",
    "const m = await import('@kodax-ai/agent/capabilities/skills');",
  ];

  assert.deepEqual(unresolvedBuiltinPackages(sources, unpacked), ['fflate']);
});
