import { runtimeExtensionHealthChannel } from '@kodax-space/space-ipc-schema';
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectExtensionHealth } from './runtime-extension-health.js';

test('missing Artifact tools remain degraded while builtin Skills and failure history stay distinct', () => {
  const result = projectExtensionHealth({
    active: true,
    extensions: [{ path: '/trusted/space-builtins.mjs', label: 'Skills', loadSource: 'config' }],
    diagnostics: {
      tools: [],
      failures: [
        {
          stage: 'load',
          target: '/secret/token/space-artifacts.mjs',
          message: 'secret',
          occurredAt: '2026-11-03T00:00:00Z',
          source: {},
        },
        {
          stage: 'load',
          target: 'https://host/extension.mjs?api_key=secret',
          message: 'private failure',
          occurredAt: '2026-11-03',
          source: {},
        },
      ],
    },
  } as never);
  assert.equal(result.state, 'degraded');
  assert.equal(result.builtins.skills, true);
  assert.equal(result.builtins.artifacts, false);
  assert.equal(result.failures[0]?.target, 'space-artifacts.mjs');
  assert.doesNotMatch(JSON.stringify(result), /secret|token/);
});

test('current loaded capabilities remain available alongside bounded historical diagnostics', () => {
  const diagnostics = {
    tools: [{ name: 'artifact_create', source: { kind: 'extension' } }],
    failures: [
      {
        stage: 'load',
        target: '/private/space-artifacts.mjs',
        message: 'Artifact tools require real Node.js >=20.16 on the shell PATH. private-secret',
        occurredAt: '2026-11-03',
      },
      {
        stage: 'load',
        target: '/private/missing.mjs',
        message: 'Cannot find module private-secret',
        occurredAt: '2026-11-03',
      },
      {
        stage: 'reload',
        target: '/private/denied.mjs',
        message: 'EACCES private-secret',
        occurredAt: '2026-11-03',
      },
    ],
  };
  const catalog = {
    active: true,
    extensions: ['space-builtins.mjs', 'space-artifacts.mjs'].map((path) => ({ path })),
    diagnostics,
  };
  const result = projectExtensionHealth(catalog as never);
  assert.equal(result.state, 'ready');
  assert.equal(result.builtins.artifacts, true);
  assert.match(result.failures[0]!.message, /Node.js/);
  assert.match(result.failures[1]!.message, /missing/);
  assert.match(result.failures[2]!.message, /permissions/);
  assert.doesNotMatch(JSON.stringify(result), /private|secret/);
  assert.equal(projectExtensionHealth({ active: false, extensions: [] }).state, 'unavailable');
});

test('long extension names still satisfy the actual bounded IPC health contract', () => {
  const result = projectExtensionHealth({
    active: false,
    extensions: [{ path: '/extension/' + 'x'.repeat(220) + '.mjs' }],
  } as never);
  assert.doesNotThrow(() => runtimeExtensionHealthChannel.output.parse(result));
});
