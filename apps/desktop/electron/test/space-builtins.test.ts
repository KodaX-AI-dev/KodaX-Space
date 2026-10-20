import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  _resetSpaceBuiltinSkillsForTests,
  isSpaceBuiltinSkillPath,
  registerSpaceBuiltinSkills,
  ensureSpaceBuiltinSkillsOnHost,
  resolveSpaceBuiltinSkillsPath,
} from '../skill/space-builtins.js';
import { toSkillMeta } from '../skill/registry.js';
import { enforceSkillSafetyPolicy, type SafetyScannableRegistry } from '../kodax/skills-prompt.js';

let temporaryRoot: string;
let builtinRoot: string;

beforeEach(() => {
  _resetSpaceBuiltinSkillsForTests();
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kodax-space-builtins-'));
  builtinRoot = path.join(temporaryRoot, 'builtin-skills');
  const skillRoot = path.join(builtinRoot, 'space-test-skill');
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(
    path.join(skillRoot, 'SKILL.md'),
    '---\nname: space-test-skill\ndescription: test builtin\n---\nbody\n',
  );
});

afterEach(() => {
  _resetSpaceBuiltinSkillsForTests();
  if (temporaryRoot && fs.existsSync(temporaryRoot)) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('resolveSpaceBuiltinSkillsPath selects repository resources in dev and installed resources when packaged', () => {
  assert.equal(
    resolveSpaceBuiltinSkillsPath({
      isPackaged: false,
      mainDirectory: path.join(temporaryRoot, 'app', 'dist-electron'),
      resourcesPath: path.join(temporaryRoot, 'installed-resources'),
    }),
    path.join(temporaryRoot, 'app', 'resources', 'builtin-skills'),
  );
  assert.equal(
    resolveSpaceBuiltinSkillsPath({
      isPackaged: true,
      mainDirectory: path.join(temporaryRoot, 'installed-resources', 'app.asar'),
      resourcesPath: path.join(temporaryRoot, 'installed-resources'),
    }),
    path.join(temporaryRoot, 'installed-resources', 'builtin-skills'),
  );
});

test('registerSpaceBuiltinSkills is idempotent and makes the installer-owned path discoverable', async () => {
  const first = await registerSpaceBuiltinSkills(builtinRoot);
  const second = await registerSpaceBuiltinSkills(builtinRoot);
  assert.deepEqual(first.skillNames, ['space-test-skill']);
  assert.deepEqual(second, first);

  const sdk = await import('@kodax-ai/kodax/skills');
  assert.ok(sdk.listPluginSkillPaths().includes(path.resolve(builtinRoot)));
  assert.equal(isSpaceBuiltinSkillPath(path.join(builtinRoot, 'space-test-skill')), true);
  assert.equal(isSpaceBuiltinSkillPath(`${builtinRoot}-sibling/space-test-skill`), false);
});

test('Host registration preserves existing extensions and is idempotent per attachment', async () => {
  await registerSpaceBuiltinSkills(builtinRoot);
  fs.writeFileSync(
    path.join(temporaryRoot, 'space-builtins.mjs'),
    'export default function(api) { api.registerSkillPath("./builtin-skills"); }',
  );
  const sdk = await import('@kodax-ai/kodax/repl');
  sdk.writeIntegrationDocument({
    domain: 'extensions',
    configHome: temporaryRoot,
    document: { version: 1, paths: ['user-extension.mjs'] },
    validate: sdk.parseExtensionsIntegrationDocument,
    expectedRevision: null,
  });
  let reads = 0;
  const host = {
    catalog: {
      extensions: async () => {
        reads++;
        return { extensions: [{ path: path.join(temporaryRoot, 'space-builtins.mjs') }] };
      },
    },
  };
  await ensureSpaceBuiltinSkillsOnHost(host, temporaryRoot);
  await ensureSpaceBuiltinSkillsOnHost(host, temporaryRoot);
  assert.deepEqual(sdk.readExtensionsIntegration(temporaryRoot).document.paths, [
    'user-extension.mjs',
    path.join(temporaryRoot, 'space-builtins.mjs'),
    path.join(temporaryRoot, 'space-artifacts.mjs'),
  ]);
  assert.equal(reads, 1);
});

test('optional Artifact registration preserves user paths without gating builtin activation', async () => {
  await registerSpaceBuiltinSkills(builtinRoot);
  const builtinEntry = path.join(temporaryRoot, 'space-builtins.mjs');
  const artifactEntry = path.join(temporaryRoot, 'space-artifacts.mjs');
  fs.writeFileSync(
    builtinEntry,
    'export default api => api.registerSkillPath("./builtin-skills");',
  );
  fs.writeFileSync(artifactEntry, 'export default () => { throw new Error("Node unavailable"); };');
  const sdk = await import('@kodax-ai/kodax/repl');
  await ensureSpaceBuiltinSkillsOnHost(
    {
      catalog: { extensions: async () => ({ extensions: [{ path: builtinEntry }] }) },
    },
    temporaryRoot,
  );
  assert.deepEqual(sdk.readExtensionsIntegration(temporaryRoot).document.paths, [
    builtinEntry,
    artifactEntry,
  ]);
});

test('missing optional builtin extension does not reject admission and retries after repair', async () => {
  await registerSpaceBuiltinSkills(builtinRoot);
  const entry = path.join(temporaryRoot, 'space-builtins.mjs');
  let reads = 0;
  const host = {
    catalog: {
      extensions: async () => {
        reads++;
        return { extensions: [{ path: entry }] };
      },
    },
  };
  await Promise.all([
    ensureSpaceBuiltinSkillsOnHost(host, temporaryRoot),
    ensureSpaceBuiltinSkillsOnHost(host, temporaryRoot),
  ]);
  assert.equal(reads, 0);
  fs.writeFileSync(entry, 'export default api => api.registerSkillPath("./builtin-skills");');
  await ensureSpaceBuiltinSkillsOnHost(host, temporaryRoot);
  assert.equal(reads, 1);
});

test('an Artifact extension failure leaves actual Host Skills and Session history readable', async () => {
  await registerSpaceBuiltinSkills(builtinRoot);
  fs.writeFileSync(
    path.join(temporaryRoot, 'space-builtins.mjs'),
    'export default api => api.registerSkillPath("./builtin-skills");',
  );
  fs.writeFileSync(
    path.join(temporaryRoot, 'space-artifacts.mjs'),
    'export default () => { throw new Error("Artifact Node unavailable"); };',
  );
  const { ensureKodaXRuntime, waitForRuntimeDaemonShutdown } =
    await import('@kodax-ai/kodax/runtime');
  const runtime = await ensureKodaXRuntime({ homeDir: temporaryRoot, defaultProvider: 'openai' });
  const owner = (await runtime.daemon.inspect()).owner;
  const { connectKodaXClient } = await import('@kodax-ai/kodax/client');
  let client: Awaited<ReturnType<typeof connectKodaXClient>> | undefined;
  try {
    await ensureSpaceBuiltinSkillsOnHost(runtime, path.join(temporaryRoot, '.kodax'));
    client = await connectKodaXClient({ homeDir: temporaryRoot });
    const catalog = await client.catalog.extensions();
    assert.ok(
      catalog.diagnostics?.failures.some((failure) =>
        failure.message.includes('Artifact Node unavailable'),
      ),
    );
    assert.ok((await client.catalog.skills()).some((skill) => skill.name === 'space-test-skill'));
    const session = await client.sessions.create({ projectPath: temporaryRoot });
    await client.sessions.updateSettings(session.id, { permissionMode: 'full-access' });
    fs.writeFileSync(path.join(temporaryRoot, 'readable.txt'), 'History remains available.');
    const run = await client.runs.startTool({
      sessionId: session.id,
      inputId: 'read-after-optional-extension-failure',
      rawInput: 'Read readable.txt',
      name: 'read',
      input: { path: 'readable.txt' },
    });
    assert.equal((await client.runs.await(run.runId)).phase, 'completed');
    assert.ok(
      (await client.sessions.readHistory(session.id)).items.some((item) =>
        item.text.includes('History remains available.'),
      ),
    );
  } finally {
    await client?.disconnect();
    try {
      await runtime.daemon.shutdown();
    } finally {
      await runtime.close();
    }
    assert.equal(
      (
        await waitForRuntimeDaemonShutdown({
          configHome: path.join(temporaryRoot, '.kodax'),
          owner,
        })
      ).status,
      'succeeded',
    );
  }
});

test('repository builtin snapshot contains the formal Feishu expert skill and design skills', async () => {
  const repositoryBuiltinRoot = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '..',
    'resources',
    'builtin-skills',
  );
  const result = await registerSpaceBuiltinSkills(repositoryBuiltinRoot);

  assert.deepEqual(result.skillNames, [
    'call-prep',
    'copywriting',
    'customer-research',
    'draft-response',
    'feishu-office-suite',
    'frontend-slides',
    'huashu-design',
    'interview-prep',
    'knowledge-synthesis',
    'onboarding',
    'partner-business-communication',
    'partner-data-analysis',
    'partner-deep-research',
    'partner-meeting-minutes',
    'partner-product-management',
    'partner-project-management',
    'process-doc',
    'status-report',
  ]);

  const sdk = await import('@kodax-ai/kodax/skills');
  const registry = new sdk.SkillRegistry(temporaryRoot);
  await registry.discover();
  const discovered = registry
    .listUserInvocable()
    // A developer machine may already have a same-name user/project override.
    // KodaX precedence must keep that override; the installer root is verified above
    // through registration and result.skillNames rather than by defeating precedence.
    .filter((skill) => result.skillNames.includes(skill.name))
    .map((skill) => skill.name)
    .sort();
  assert.deepEqual(discovered, result.skillNames);
  await Promise.all(result.skillNames.map((name) => registry.loadFull(name)));
});

test('registerSpaceBuiltinSkills rejects an empty or damaged resource tree without trusting it', async () => {
  fs.rmSync(path.join(builtinRoot, 'space-test-skill', 'SKILL.md'));

  await assert.rejects(registerSpaceBuiltinSkills(builtinRoot), /no SKILL\.md found/);
  assert.equal(isSpaceBuiltinSkillPath(path.join(builtinRoot, 'space-test-skill')), false);
});

test('Space maps its registered SDK plugin path to builtin metadata', async () => {
  await registerSpaceBuiltinSkills(builtinRoot);
  const sdk = await import('@kodax-ai/kodax/skills');
  const registry = new sdk.SkillRegistry(temporaryRoot);
  await registry.discover();
  const discovered = registry.get('space-test-skill');
  assert.ok(discovered);
  assert.equal(discovered.source, 'plugin');
  assert.equal(discovered.path, path.join(builtinRoot, 'space-test-skill'));

  const mapped = toSkillMeta(discovered);
  assert.equal(mapped.source, 'builtin');
});

test('Space builtin plugin sources remain conservatively untrusted at the safety boundary', async () => {
  await registerSpaceBuiltinSkills(builtinRoot);
  const skillPath = path.join(builtinRoot, 'space-test-skill');
  const metadata = {
    name: 'space-test-skill',
    source: 'plugin',
    path: skillPath,
    disableModelInvocation: false,
  };
  const registry: SafetyScannableRegistry = {
    skills: new Map([[metadata.name, metadata]]),
    loadFull: async () => ({
      content: 'unsafe syntax is still disabled: !`git status`',
      rawContent: '',
      disableModelInvocation: false,
    }),
  };

  const result = await enforceSkillSafetyPolicy(registry);
  assert.deepEqual(result.untrustedUnsafeSkills, ['space-test-skill']);
  assert.equal(metadata.disableModelInvocation, true, 'dynamic context remains disabled');
});
