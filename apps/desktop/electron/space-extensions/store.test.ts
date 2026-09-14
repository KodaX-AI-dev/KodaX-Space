import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { SPACE_EXTENSION_MAX_HTML_BYTES } from '@kodax-space/space-ipc-schema';
import { SpaceExtensionStore } from './store.js';

const HTML = '<!doctype html><html lang="zh-CN"><body><h1>插件库</h1></body></html>';

async function fixture(t: TestContext): Promise<{ directory: string; rootDir: string }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'space-extension-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, rootDir: path.join(directory, 'extensions') };
}

interface ArchiveOptions {
  readonly html?: string;
  readonly manifest?: Record<string, unknown>;
  readonly editZip?: (zip: JSZip) => void;
  readonly compression?: 'STORE' | 'DEFLATE';
}

async function archive(directory: string, options: ArchiveOptions = {}): Promise<string> {
  const zip = new JSZip();
  const html = options.html ?? HTML;
  zip.file(
    'manifest.json',
    JSON.stringify({
      formatVersion: 1,
      hostApiVersion: 1,
      id: 'partner-library',
      name: 'Partner 插件库',
      description: '专家与连接器',
      version: '0.1.0',
      ui: { entry: 'ui/index.html', sha256: createHash('sha256').update(html).digest('hex') },
      experts: [],
      connectors: [],
      ...options.manifest,
    }),
  );
  zip.file('ui/index.html', html);
  options.editZip?.(zip);
  const archivePath = path.join(directory, 'partner-library.space-extension');
  await fs.writeFile(
    archivePath,
    await zip.generateAsync({
      type: 'nodebuffer',
      platform: 'UNIX',
      compression: options.compression ?? 'STORE',
    }),
  );
  return archivePath;
}

test('an independent archive installs disabled, enables its view, persists and uninstalls', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  assert.deepEqual(await store.list(), []);

  const installed = await store.install(await archive(directory));
  assert.equal(installed.id, 'partner-library');
  assert.equal(installed.enabled, false);
  assert.equal(installed.expertCount, 0);
  assert.equal(installed.connectorCount, 0);
  await assert.rejects(store.getView(installed.id), /disabled/i);

  const enabled = await store.setEnabled(installed.id, true);
  assert.equal(enabled.enabled, true);
  assert.deepEqual(await store.getView(installed.id), { extension: enabled, html: HTML });

  const reopened = new SpaceExtensionStore(rootDir);
  assert.deepEqual(await reopened.list(), [enabled]);
  assert.equal((await reopened.getView(installed.id)).html, HTML);
  await reopened.setEnabled(installed.id, false);
  await assert.rejects(store.getView(installed.id), /disabled/i);

  assert.equal(await reopened.uninstall(installed.id), true);
  assert.deepEqual(await store.list(), []);
  await assert.rejects(store.getView(installed.id), /not installed/i);
  assert.equal(await reopened.uninstall(installed.id), false);
});

test('the application-bundled library is ready to use on the first launch', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const file = await archive(directory);

  await store.provisionBundled(file, 'partner-library');

  const [installed] = await store.list();
  assert.equal(installed?.id, 'partner-library');
  assert.equal(installed?.enabled, true);
  assert.equal((await store.getView('partner-library')).html, HTML);
});

test('restarting preserves the bundled library identity, disablement and removal', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const file = await archive(directory);
  const store = new SpaceExtensionStore(rootDir);
  await store.provisionBundled(file, 'partner-library');
  const original = await store.list();

  const restarted = new SpaceExtensionStore(rootDir);
  await restarted.provisionBundled(file, 'partner-library');
  assert.deepEqual(await restarted.list(), original);
  await restarted.setEnabled('partner-library', false);
  await new SpaceExtensionStore(rootDir).provisionBundled(file, 'partner-library');
  assert.equal((await restarted.list())[0]?.enabled, false);

  await restarted.uninstall('partner-library');
  await new SpaceExtensionStore(rootDir).provisionBundled(file, 'partner-library');
  assert.deepEqual(await restarted.list(), []);
});

test('bundled provisioning preserves a manually installed package and serializes first launch', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const file = await archive(directory);
  const store = new SpaceExtensionStore(rootDir);
  const installed = await store.install(file);
  await store.provisionBundled(file, 'partner-library');
  assert.deepEqual(await store.list(), [installed]);

  const fresh = new SpaceExtensionStore(path.join(directory, 'fresh'));
  await Promise.all([
    fresh.provisionBundled(file, 'partner-library'),
    new SpaceExtensionStore(path.join(directory, 'fresh')).provisionBundled(
      file,
      'partner-library',
    ),
  ]);
  assert.equal((await fresh.list()).length, 1);
  assert.equal((await fresh.list())[0]?.enabled, true);
});

test('a wrong bundled identity and a failed registry commit leave provisioning retryable', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const file = await archive(directory);
  const store = new SpaceExtensionStore(rootDir);
  await assert.rejects(store.provisionBundled(file, 'wrong-library'), /identity mismatch/);
  assert.deepEqual(await store.list(), []);

  await fs.mkdir(path.join(rootDir, 'registry.json'), { recursive: true });
  await assert.rejects(store.provisionBundled(file, 'partner-library'), /regular/);
  await fs.rmdir(path.join(rootDir, 'registry.json'));
  await store.provisionBundled(file, 'partner-library');
  assert.equal((await store.list())[0]?.enabled, true);
});

test('the UI-only package rejects extra executable files without installing anything', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const file = await archive(directory, {
    editZip: (zip) => zip.file('install.js', 'throw new Error("never execute");'),
  });
  await assert.rejects(store.install(file), /unexpected archive entry/i);
  assert.deepEqual(await store.list(), []);
});

test('duplicate ZIP entry names are rejected instead of replacing validated content', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const file = await archive(directory, { editZip: (zip) => zip.file('ui/clone.html', HTML) });
  const bytes = await fs.readFile(file);
  const duplicateName = Buffer.from('ui/clone.html');
  for (
    let offset = bytes.indexOf(duplicateName);
    offset !== -1;
    offset = bytes.indexOf(duplicateName, offset + 1)
  ) {
    Buffer.from('ui/index.html').copy(bytes, offset);
  }
  await fs.writeFile(file, bytes);
  const store = new SpaceExtensionStore(rootDir);
  await assert.rejects(store.install(file), /duplicate archive entry/i);
  assert.deepEqual(await store.list(), []);
});

test('symbolic-link entries cannot provide the extension view', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const file = await archive(directory, {
    editZip: (zip) => zip.file('ui/index.html', HTML, { unixPermissions: 0o120777 }),
  });
  const store = new SpaceExtensionStore(rootDir);
  await assert.rejects(store.install(file), /symlink|non-regular/i);
  assert.deepEqual(await store.list(), []);
});

test('an oversized HTML view is rejected before extraction even with a correct hash', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const file = await archive(directory, { html: 'x'.repeat(SPACE_EXTENSION_MAX_HTML_BYTES + 1) });
  const store = new SpaceExtensionStore(rootDir);
  await assert.rejects(store.install(file), /size|bytes|limit/i);
  assert.deepEqual(await store.list(), []);
});

test('high compression-ratio ZIP payloads fail closed before decompression', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const file = await archive(directory, {
    html: `${HTML}${' '.repeat(1_000_000)}`,
    compression: 'DEFLATE',
  });
  const store = new SpaceExtensionStore(rootDir);
  await assert.rejects(store.install(file), /compression ratio/i);
  assert.deepEqual(await store.list(), []);
});

test('views and enablement reject a replaced on-disk HTML symlink', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const installed = await store.install(await archive(directory));
  await store.setEnabled(installed.id, true);
  const [packageDirectory] = await fs.readdir(path.join(rootDir, 'packages'));
  assert.ok(packageDirectory);
  const viewPath = path.join(rootDir, 'packages', packageDirectory, 'ui/index.html');
  const outside = path.join(directory, 'outside.html');
  await fs.writeFile(outside, HTML);
  await fs.unlink(viewPath);
  try {
    await fs.symlink(outside, viewPath, 'file');
  } catch (error) {
    if (process.platform !== 'win32' || (error as NodeJS.ErrnoException).code !== 'EPERM')
      throw error;
    t.skip('Windows file symlink creation requires Developer Mode or elevation');
    return;
  }

  await assert.rejects(store.getView(installed.id), /regular|symlink/i);
  await store.setEnabled(installed.id, false);
  await assert.rejects(store.setEnabled(installed.id, true), /regular|symlink/i);
  assert.equal((await store.list())[0]?.enabled, false);
  assert.equal(await fs.readFile(outside, 'utf8'), HTML);
});

test('a substituted package-directory symlink cannot read or delete files outside the store', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const installed = await store.install(await archive(directory));
  await store.setEnabled(installed.id, true);
  const ownedPackages = path.join(rootDir, 'packages');
  const outsidePackages = path.join(directory, 'outside-packages');
  await fs.rename(ownedPackages, outsidePackages);
  await fs.symlink(
    outsidePackages,
    ownedPackages,
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  await assert.rejects(store.getView(installed.id), /directory|symlink/i);
  await assert.rejects(store.uninstall(installed.id), /directory|symlink/i);
  assert.equal((await store.list()).length, 1);
  assert.equal((await fs.readdir(outsidePackages)).length, 1);
});

test('an MCP bundle or other archive suffix cannot be installed as a Space Extension', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const renamed = path.join(directory, 'not-a-space-extension.mcpb');
  await fs.rename(await archive(directory), renamed);
  await assert.rejects(new SpaceExtensionStore(rootDir).install(renamed), /\.space-extension/i);
});

const invalidPackages: readonly { name: string; options: ArchiveOptions; error: RegExp }[] = [
  {
    name: 'missing manifest',
    options: { editZip: (zip) => zip.remove('manifest.json') },
    error: /manifest.*missing/i,
  },
  {
    name: 'missing view',
    options: { editZip: (zip) => zip.remove('ui/index.html') },
    error: /index.html.*missing/i,
  },
  {
    name: 'incompatible host API',
    options: { manifest: { hostApiVersion: 5 } },
    error: /hostApiVersion/i,
  },
  {
    name: 'unknown manifest fields',
    options: { manifest: { main: 'entry.js' } },
    error: /unrecognized|main/i,
  },
  {
    name: 'malformed expert definitions',
    options: { manifest: { experts: [{ id: 'fake' }] } },
    error: /experts/i,
  },
  {
    name: 'unsupported connectors',
    options: { manifest: { connectors: [{ id: 'fake' }] } },
    error: /connectors/i,
  },
  {
    name: 'invalid manifest JSON',
    options: { editZip: (zip) => zip.file('manifest.json', '{not valid}') },
    error: /JSON|Unexpected|property/i,
  },
  {
    name: 'wrong content hash',
    options: { editZip: (zip) => zip.file('ui/index.html', `${HTML}changed`) },
    error: /hash mismatch/i,
  },
  {
    name: 'oversized manifest',
    options: { manifest: { description: 'x'.repeat(70_000) } },
    error: /size limit/i,
  },
  {
    name: 'traversal entry',
    options: { editZip: (zip) => zip.file('../outside', 'no', { createFolders: false }) },
    error: /relative path|unexpected|invalid/i,
  },
  {
    name: 'absolute entry',
    options: { editZip: (zip) => zip.file('/outside', 'no', { createFolders: false }) },
    error: /absolute path|unexpected|invalid/i,
  },
];

for (const invalid of invalidPackages) {
  test(`rejects ${invalid.name} without publishing a partial installation`, async (t) => {
    const { directory, rootDir } = await fixture(t);
    const store = new SpaceExtensionStore(rootDir);
    await assert.rejects(store.install(await archive(directory, invalid.options)), invalid.error);
    assert.deepEqual(await store.list(), []);
  });
}

test('a rejected update leaves the old active package intact; a valid update resets activation', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const original = await store.install(await archive(directory));
  const active = await store.setEnabled(original.id, true);
  await assert.rejects(
    store.install(
      await archive(directory, {
        manifest: { version: '0.2.0' },
        editZip: (zip) => zip.file('ui/index.html', 'tampered'),
      }),
    ),
    /hash mismatch/,
  );
  assert.deepEqual(await store.list(), [active]);
  assert.equal((await store.getView(original.id)).html, HTML);

  const nextHtml = `${HTML}<p>Next version</p>`;
  const updated = await store.install(
    await archive(directory, {
      manifest: { version: '0.2.0' },
      html: nextHtml,
    }),
  );
  assert.equal(updated.enabled, false);
  assert.equal(updated.version, '0.2.0');
  assert.equal((await fs.readdir(path.join(rootDir, 'packages'))).length, 1);
  await store.setEnabled(updated.id, true);
  assert.equal((await store.getView(updated.id)).html, nextHtml);
});

test('concurrent store instances serialize installations and activation without lost updates', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const ids = ['library-one', 'library-two', 'library-three'];
  const files = await Promise.all(
    ids.map(async (id) => {
      const source = path.join(directory, id);
      await fs.mkdir(source);
      return archive(source, { manifest: { id } });
    }),
  );
  await Promise.all(files.map((file) => new SpaceExtensionStore(rootDir).install(file)));
  await Promise.all(ids.map((id) => new SpaceExtensionStore(rootDir).setEnabled(id, true)));
  const entries = await new SpaceExtensionStore(rootDir).list();
  assert.deepEqual(entries.map((entry) => entry.id).sort(), [...ids].sort());
  assert.ok(entries.every((entry) => entry.enabled));
});

test('uninstall removes only its bundle and retains user data and unrelated installations', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const one = await store.install(await archive(directory));
  const two = await store.install(await archive(directory, { manifest: { id: 'other-library' } }));
  const retainedData = path.join(rootDir, 'conversation-history.json');
  const sharedSkill = path.join(directory, 'shared-skill.md');
  await fs.writeFile(retainedData, '{"history":"keep"}');
  await fs.writeFile(sharedSkill, 'user skill');
  await store.uninstall(one.id);
  assert.deepEqual(
    (await store.list()).map((entry) => entry.id),
    [two.id],
  );
  assert.equal(await fs.readFile(retainedData, 'utf8'), '{"history":"keep"}');
  assert.equal(await fs.readFile(sharedSkill, 'utf8'), 'user skill');
});

test('tampered installed content fails at both view time and subsequent enablement', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const installed = await store.install(await archive(directory));
  await store.setEnabled(installed.id, true);
  const [packageDirectory] = await fs.readdir(path.join(rootDir, 'packages'));
  assert.ok(packageDirectory);
  await fs.writeFile(path.join(rootDir, 'packages', packageDirectory, 'ui/index.html'), 'changed');
  await assert.rejects(store.getView(installed.id), /hash mismatch/i);
  await store.setEnabled(installed.id, false);
  await assert.rejects(store.setEnabled(installed.id, true), /hash mismatch/i);
  assert.equal((await store.list())[0]?.enabled, false);
});

test('malformed and oversized archive files leave the queue available for a later valid install', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const file = path.join(directory, 'invalid.space-extension');
  await fs.writeFile(file, 'not a ZIP archive');
  await assert.rejects(store.install(file));
  await fs.writeFile(file, Buffer.alloc(4 * 1024 * 1024 + 1));
  await assert.rejects(store.install(file), /size limit/i);
  assert.equal((await store.install(await archive(directory))).enabled, false);
});

test('a symlinked extension root is never used for installation or deletion', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const outside = path.join(directory, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, rootDir, process.platform === 'win32' ? 'junction' : 'dir');
  const store = new SpaceExtensionStore(rootDir);
  await assert.rejects(store.install(await archive(directory)), /directory|symlink/i);
  await assert.rejects(store.uninstall('partner-library'), /directory|symlink/i);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('archives with excessive central-directory entries are rejected before reading files', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const file = await archive(directory, {
    editZip: (zip) => {
      for (let index = 0; index < 30; index++) zip.file(`extra-${index}`, '');
    },
  });
  await assert.rejects(new SpaceExtensionStore(rootDir).install(file), /entry count.*limit/i);
});

test('valid UTF-8 HTML retains its byte-order mark so saved content keeps the verified hash', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const html = `\uFEFF${HTML}`;
  const installed = await store.install(await archive(directory, { html }));
  await store.setEnabled(installed.id, true);
  assert.equal((await store.getView(installed.id)).html, html);
});

test('the independent build artifact installs and renders through the same public store contract', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const buildScript = fileURLToPath(
    new URL('../../../../scripts/build-partner-extension.mjs', import.meta.url),
  );
  const { stdout } = await promisify(execFile)(process.execPath, [
    buildScript,
    '--out-dir',
    path.join(directory, 'build'),
  ]);
  const store = new SpaceExtensionStore(rootDir);
  const installed = await store.install(stdout.trim());
  assert.equal(installed.id, 'kodax.partner-library');
  assert.equal(installed.enabled, false);
  await store.setEnabled(installed.id, true);
  const view = await store.getView(installed.id);
  assert.match(view.html, /专家/);
  assert.match(view.html, /连接器/);
  // Includes five retired definitions retained for historical conversations.
  assert.equal(installed.expertCount, 21);
  await store.uninstall(installed.id);
  assert.deepEqual(await store.list(), []);
});

test('reinstall and uninstall recover safely if a bundle directory was already removed', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const installed = await store.install(await archive(directory));
  const packageRoot = path.join(rootDir, 'packages');
  const [firstDirectory] = await fs.readdir(packageRoot);
  assert.ok(firstDirectory);
  await fs.rm(path.join(packageRoot, firstDirectory), { recursive: true });
  const updated = await store.install(await archive(directory, { manifest: { version: '0.2.0' } }));
  assert.equal(updated.version, '0.2.0');
  const [nextDirectory] = await fs.readdir(packageRoot);
  assert.ok(nextDirectory);
  await fs.rm(path.join(packageRoot, nextDirectory), { recursive: true });
  assert.equal(await store.uninstall(installed.id), true);
  assert.deepEqual(await store.list(), []);
});

test('an unsafe displaced bundle rejects an update before its registry entry changes', async (t) => {
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const original = await store.install(await archive(directory));
  const packageRoot = path.join(rootDir, 'packages');
  const [packageDirectory] = await fs.readdir(packageRoot);
  assert.ok(packageDirectory);
  const packagePath = path.join(packageRoot, packageDirectory);
  const outside = path.join(directory, 'outside-package');
  await fs.rename(packagePath, outside);
  await fs.symlink(outside, packagePath, process.platform === 'win32' ? 'junction' : 'dir');

  const update = await archive(directory, { manifest: { version: '0.2.0' } });
  await assert.rejects(store.install(update), /directory|symlink/i);
  assert.deepEqual(await store.list(), [original]);
  assert.deepEqual(await fs.readdir(packageRoot), [packageDirectory]);
  assert.equal(await fs.readFile(path.join(outside, 'ui/index.html'), 'utf8'), HTML);
});

test('a committed update stays successful and diagnoses a bundle it could not clean up', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('Requires ordinary POSIX directory permissions');
    return;
  }
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  await store.install(await archive(directory));
  const packageRoot = path.join(rootDir, 'packages');
  const [oldDirectory] = await fs.readdir(packageRoot);
  assert.ok(oldDirectory);
  const protectedUi = path.join(packageRoot, oldDirectory, 'ui');
  await fs.chmod(protectedUi, 0o500);
  const warnings: Error[] = [];
  const observeWarning = (warning: Error) => warnings.push(warning);
  process.on('warning', observeWarning);
  try {
    const updated = await store.install(
      await archive(directory, { manifest: { version: '0.2.0' } }),
    );
    assert.equal(updated.version, '0.2.0');
    assert.deepEqual(await store.list(), [updated]);
    await store.setEnabled(updated.id, true);
    assert.equal((await store.getView(updated.id)).html, HTML);
    assert.equal(await fs.readFile(path.join(protectedUi, 'index.html'), 'utf8'), HTML);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.ok(warnings.some((warning) => /unregistered bundle/i.test(warning.message)));
  } finally {
    process.off('warning', observeWarning);
    await fs.chmod(protectedUi, 0o700);
  }
});

test('a committed uninstall removes availability even when obsolete files need later cleanup', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('Requires ordinary POSIX directory permissions');
    return;
  }
  const { directory, rootDir } = await fixture(t);
  const store = new SpaceExtensionStore(rootDir);
  const installed = await store.install(await archive(directory));
  await store.setEnabled(installed.id, true);
  const packageRoot = path.join(rootDir, 'packages');
  const [packageDirectory] = await fs.readdir(packageRoot);
  assert.ok(packageDirectory);
  const protectedUi = path.join(packageRoot, packageDirectory, 'ui');
  await fs.chmod(protectedUi, 0o500);
  const warnings: Error[] = [];
  const observeWarning = (warning: Error) => warnings.push(warning);
  process.on('warning', observeWarning);
  try {
    assert.equal(await store.uninstall(installed.id), true);
    assert.deepEqual(await store.list(), []);
    await assert.rejects(store.getView(installed.id), /not installed/i);
    assert.equal(await store.uninstall(installed.id), false);
    assert.equal(await fs.readFile(path.join(protectedUi, 'index.html'), 'utf8'), HTML);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.ok(warnings.some((warning) => /unregistered bundle/i.test(warning.message)));
  } finally {
    process.off('warning', observeWarning);
    await fs.chmod(protectedUi, 0o700);
  }
});
