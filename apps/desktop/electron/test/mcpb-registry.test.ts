import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  migrateLegacyMcpbStorage,
  syncEntryToKodaxMcp,
  toKodaxMcpServerConfig,
  getMcpbStoragePaths,
  mcpConfigMatchesEntry,
  type InternalMcpbEntry,
  type KodaxMcpServerConfig,
  type McpbKodaxMcpSyncDeps,
} from '../mcpb/registry.js';

let tmpDir = '';
let legacyHome = '';
let kodaxDir = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kodax-mcpb-registry-'));
  legacyHome = path.join(tmpDir, '.kodax-space');
  kodaxDir = path.join(tmpDir, '.kodax');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

function makeEntry(installDir: string): InternalMcpbEntry {
  return {
    extensionId: 'filesystem@1.0.0',
    name: 'filesystem',
    displayName: 'Filesystem',
    version: '1.0.0',
    description: 'Local filesystem tools',
    author: 'KodaX',
    transport: 'stdio',
    toolCount: 2,
    installedAt: 123,
    installDir,
    server: {
      command: 'node',
      args: [path.join(installDir, 'index.js'), '--root', 'C:/workspace'],
      env: { MCP_ENTRY: path.join(installDir, 'index.js') },
    },
  };
}

function fakeSync(initial: Record<string, KodaxMcpServerConfig> = {}): {
  deps: McpbKodaxMcpSyncDeps;
  store: Record<string, KodaxMcpServerConfig>;
} {
  const store: Record<string, KodaxMcpServerConfig> = { ...initial };
  return {
    store,
    deps: {
      getMcpServerConfig: (name) => store[name],
      upsertMcpServer: (name, config) => {
        store[name] = config;
        return config;
      },
      removeMcpServer: (name) => {
        if (!(name in store)) return false;
        delete store[name];
        return true;
      },
    },
  };
}

test('bundle replacement never overwrites a same-name user server', async () => {
  const old = makeEntry(path.join(kodaxDir, 'old'));
  const next = makeEntry(path.join(kodaxDir, 'next'));
  const user = { type: 'stdio' as const, command: 'user-server' };
  const sync = fakeSync({ filesystem: user });
  const result = await syncEntryToKodaxMcp(next, {
    overwrite: true,
    previousEntry: old,
    deps: sync.deps,
  });
  assert.equal(result.kind, 'skipped-existing');
  assert.deepEqual(sync.store.filesystem, user);
});

test('bundle replacement upgrades only its matching previous server', async () => {
  const old = makeEntry(path.join(kodaxDir, 'old'));
  const next = makeEntry(path.join(kodaxDir, 'next'));
  const sync = fakeSync({ filesystem: toKodaxMcpServerConfig(old) });
  const result = await syncEntryToKodaxMcp(next, {
    overwrite: true,
    previousEntry: old,
    deps: sync.deps,
  });
  assert.equal(result.kind, 'registered');
  assert.ok(mcpConfigMatchesEntry(sync.store.filesystem, next));
});

test('test onboarding mode keeps legacy path inside the isolated KodaX dir', () => {
  const previous = process.env.KODAX_TEST_ONBOARDING;
  process.env.KODAX_TEST_ONBOARDING = 'fixture';
  try {
    const paths = getMcpbStoragePaths(kodaxDir, path.join(tmpDir, 'home'));
    assert.equal(paths.home, path.join(kodaxDir, 'mcpb'));
    assert.equal(paths.legacyHome, path.join(kodaxDir, 'legacy-kodax-space'));
  } finally {
    if (previous === undefined) delete process.env.KODAX_TEST_ONBOARDING;
    else process.env.KODAX_TEST_ONBOARDING = previous;
  }
});

test('migrates legacy ~/.kodax-space registry into ~/.kodax/mcpb and registers MCP server', async () => {
  const oldInstallDir = path.join(legacyHome, 'mcpb', 'filesystem@1.0.0');
  await fs.mkdir(oldInstallDir, { recursive: true });
  await fs.writeFile(path.join(oldInstallDir, 'index.js'), 'console.log("ok");');
  const entry = makeEntry(oldInstallDir);
  await fs.writeFile(
    path.join(legacyHome, 'mcpb-extensions.json'),
    JSON.stringify({ version: 1, extensions: [entry] }, null, 2),
  );

  const sync = fakeSync();
  const result = await migrateLegacyMcpbStorage({ legacyHome, kodaxDir, syncDeps: sync.deps });

  assert.equal(result.kind, 'migrated');
  if (result.kind === 'migrated') {
    assert.equal(result.migrated, 1);
    assert.equal(result.registered, 1);
    assert.equal(result.legacyCleanup, 'removed');
  }

  const newInstallDir = path.join(kodaxDir, 'mcpb', 'extensions', 'filesystem@1.0.0');
  assert.equal(
    await fs.readFile(path.join(newInstallDir, 'index.js'), 'utf8'),
    'console.log("ok");',
  );

  const registry = JSON.parse(
    await fs.readFile(path.join(kodaxDir, 'mcpb', 'registry.json'), 'utf8'),
  ) as { extensions: InternalMcpbEntry[] };
  assert.equal(registry.extensions[0].installDir, newInstallDir);
  assert.deepEqual(registry.extensions[0].server.args, [
    path.join(newInstallDir, 'index.js'),
    '--root',
    'C:/workspace',
  ]);
  assert.equal(registry.extensions[0].server.env?.MCP_ENTRY, path.join(newInstallDir, 'index.js'));
  assert.ok(mcpConfigMatchesEntry(sync.store.filesystem, registry.extensions[0]));

  const legacyExists = await fs
    .stat(legacyHome)
    .then(() => true)
    .catch(() => false);
  assert.equal(legacyExists, false);
});

test('migration replaces stale target install directory atomically', async () => {
  const oldInstallDir = path.join(legacyHome, 'mcpb', 'filesystem@1.0.0');
  await fs.mkdir(oldInstallDir, { recursive: true });
  await fs.writeFile(path.join(oldInstallDir, 'index.js'), 'console.log("ok");');
  const entry = makeEntry(oldInstallDir);
  await fs.writeFile(
    path.join(legacyHome, 'mcpb-extensions.json'),
    JSON.stringify({ version: 1, extensions: [entry] }, null, 2),
  );

  const newInstallDir = path.join(kodaxDir, 'mcpb', 'extensions', 'filesystem@1.0.0');
  await fs.mkdir(newInstallDir, { recursive: true });
  await fs.writeFile(path.join(newInstallDir, 'stale.txt'), 'old partial copy');

  const sync = fakeSync();
  const result = await migrateLegacyMcpbStorage({ legacyHome, kodaxDir, syncDeps: sync.deps });

  assert.equal(result.kind, 'migrated');
  assert.equal(
    await fs.readFile(path.join(newInstallDir, 'index.js'), 'utf8'),
    'console.log("ok");',
  );
  await assert.rejects(fs.stat(path.join(newInstallDir, 'stale.txt')));
});

test('migration does not overwrite an existing different KodaX MCP server', async () => {
  const oldInstallDir = path.join(legacyHome, 'mcpb', 'filesystem@1.0.0');
  await fs.mkdir(oldInstallDir, { recursive: true });
  const entry = makeEntry(oldInstallDir);
  await fs.writeFile(
    path.join(legacyHome, 'mcpb-extensions.json'),
    JSON.stringify({ version: 1, extensions: [entry] }, null, 2),
  );

  const existing = { type: 'stdio' as const, command: 'npx', args: ['custom-server'] };
  const sync = fakeSync({ filesystem: existing });
  const result = await migrateLegacyMcpbStorage({ legacyHome, kodaxDir, syncDeps: sync.deps });

  assert.equal(result.kind, 'migrated');
  if (result.kind === 'migrated') {
    assert.equal(result.migrated, 1);
    assert.equal(result.registered, 0);
    assert.equal(result.skippedRegistration, 1);
  }
  assert.deepEqual(sync.store.filesystem, existing);
});

test('migration keeps legacy storage when MCP registration errors', async () => {
  const oldInstallDir = path.join(legacyHome, 'mcpb', 'filesystem@1.0.0');
  await fs.mkdir(oldInstallDir, { recursive: true });
  await fs.writeFile(path.join(oldInstallDir, 'index.js'), 'console.log("ok");');
  const entry = makeEntry(oldInstallDir);
  await fs.writeFile(
    path.join(legacyHome, 'mcpb-extensions.json'),
    JSON.stringify({ version: 1, extensions: [entry] }, null, 2),
  );

  const sync = fakeSync();
  const failingDeps: McpbKodaxMcpSyncDeps = {
    ...sync.deps,
    upsertMcpServer: () => {
      throw new Error('disk full');
    },
  };
  const result = await migrateLegacyMcpbStorage({ legacyHome, kodaxDir, syncDeps: failingDeps });

  assert.equal(result.kind, 'migrated');
  if (result.kind === 'migrated') {
    assert.equal(result.migrated, 1);
    assert.equal(result.registered, 0);
    assert.equal(result.skippedRegistration, 1);
    assert.equal(result.legacyCleanup, 'kept-error');
  }
  assert.equal(
    await fs.readFile(path.join(oldInstallDir, 'index.js'), 'utf8'),
    'console.log("ok");',
  );
  assert.deepEqual(sync.store, {});
});

test('migration syncs already-migrated registry entries before legacy cleanup', async () => {
  const oldInstallDir = path.join(legacyHome, 'mcpb', 'filesystem@1.0.0');
  await fs.mkdir(oldInstallDir, { recursive: true });
  const legacyEntry = makeEntry(oldInstallDir);
  await fs.writeFile(
    path.join(legacyHome, 'mcpb-extensions.json'),
    JSON.stringify({ version: 1, extensions: [legacyEntry] }, null, 2),
  );

  const newInstallDir = path.join(kodaxDir, 'mcpb', 'extensions', 'filesystem@1.0.0');
  await fs.mkdir(path.dirname(path.join(kodaxDir, 'mcpb', 'registry.json')), { recursive: true });
  await fs.mkdir(newInstallDir, { recursive: true });
  const currentEntry = makeEntry(newInstallDir);
  await fs.writeFile(
    path.join(kodaxDir, 'mcpb', 'registry.json'),
    JSON.stringify({ version: 1, extensions: [currentEntry] }, null, 2),
  );

  const sync = fakeSync();
  const result = await migrateLegacyMcpbStorage({ legacyHome, kodaxDir, syncDeps: sync.deps });

  assert.equal(result.kind, 'already-migrated');
  assert.ok(mcpConfigMatchesEntry(sync.store.filesystem, currentEntry));
  await assert.rejects(fs.stat(legacyHome));
});

test('missing legacy registry does not remove non-empty legacy storage', async () => {
  const orphanDir = path.join(legacyHome, 'mcpb', 'orphan@1.0.0');
  await fs.mkdir(orphanDir, { recursive: true });
  await fs.writeFile(path.join(orphanDir, 'index.js'), 'console.log("orphan");');

  const sync = fakeSync();
  const result = await migrateLegacyMcpbStorage({ legacyHome, kodaxDir, syncDeps: sync.deps });

  assert.equal(result.kind, 'not-found');
  assert.equal(
    await fs.readFile(path.join(orphanDir, 'index.js'), 'utf8'),
    'console.log("orphan");',
  );
  assert.deepEqual(sync.store, {});
});

test('migration skips entries whose legacy install directory is missing', async () => {
  const missingInstallDir = path.join(legacyHome, 'mcpb', 'missing@1.0.0');
  const entry = makeEntry(missingInstallDir);
  await fs.mkdir(legacyHome, { recursive: true });
  await fs.writeFile(
    path.join(legacyHome, 'mcpb-extensions.json'),
    JSON.stringify({ version: 1, extensions: [entry] }, null, 2),
  );

  const sync = fakeSync();
  const result = await migrateLegacyMcpbStorage({ legacyHome, kodaxDir, syncDeps: sync.deps });

  assert.equal(result.kind, 'migrated');
  if (result.kind === 'migrated') {
    assert.equal(result.migrated, 0);
    assert.equal(result.skippedMissingInstallDir, 1);
    assert.equal(result.legacyCleanup, 'kept-error');
  }
  assert.deepEqual(sync.store, {});
  await assert.rejects(fs.stat(path.join(kodaxDir, 'mcpb', 'registry.json')));
  assert.equal(
    await fs.readFile(path.join(legacyHome, 'mcpb-extensions.json'), 'utf8'),
    JSON.stringify({ version: 1, extensions: [entry] }, null, 2),
  );
});

test('migration keeps legacy storage when any legacy registry entry is dropped', async () => {
  const oldInstallDir = path.join(legacyHome, 'mcpb', 'filesystem@1.0.0');
  await fs.mkdir(oldInstallDir, { recursive: true });
  await fs.writeFile(path.join(oldInstallDir, 'index.js'), 'console.log("ok");');
  const valid = makeEntry(oldInstallDir);
  const invalid: InternalMcpbEntry = {
    ...makeEntry(path.join(tmpDir, 'outside', 'bad@1.0.0')),
    extensionId: 'outside@1.0.0',
    name: 'outside',
    displayName: 'Outside',
  };
  await fs.writeFile(
    path.join(legacyHome, 'mcpb-extensions.json'),
    JSON.stringify({ version: 1, extensions: [valid, invalid] }, null, 2),
  );

  const sync = fakeSync();
  const result = await migrateLegacyMcpbStorage({ legacyHome, kodaxDir, syncDeps: sync.deps });

  assert.equal(result.kind, 'migrated');
  if (result.kind === 'migrated') {
    assert.equal(result.migrated, 1);
    assert.equal(result.droppedInvalid, 1);
    assert.equal(result.legacyCleanup, 'kept-error');
  }
  assert.equal(
    await fs.readFile(path.join(oldInstallDir, 'index.js'), 'utf8'),
    'console.log("ok");',
  );
  assert.ok(sync.store.filesystem);
});
