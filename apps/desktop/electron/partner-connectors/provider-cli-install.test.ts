import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createProviderCliInstaller } from './provider-cli-install.js';
import { ReadConnectorError } from './read-connector.js';

function archive(contents: string, name = 'package/bin/cli', type = '0'): Buffer {
  const body = Buffer.from(contents);
  const header = Buffer.alloc(512);
  header.write(name);
  header.write('0000755\0', 100);
  header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
  header.fill(' ', 148, 156);
  header.write(type, 156);
  header.write('ustar\0', 257);
  header.write(
    header
      .reduce((sum, byte) => sum + byte, 0)
      .toString(8)
      .padStart(6, '0') + '\0 ',
    148,
  );
  return gzipSync(
    Buffer.concat([header, body, Buffer.alloc(((512 - (body.length % 512)) % 512) + 1024)]),
  );
}

function releaseArchive(directory: Buffer, additional: Buffer[] = []): Buffer {
  const entries = [
    directory,
    ...additional,
    archive('fixture native', './dws'),
    archive('readme', './README.md'),
    archive('notice', './NOTICE'),
    archive('license', './LICENSE'),
    archive('changes', './CHANGELOG.md'),
  ];
  return gzipSync(
    Buffer.concat([
      ...entries.map((entry) => gunzipSync(entry).subarray(0, -1024)),
      Buffer.alloc(1024),
    ]),
  );
}

test('provider installer accepts the exact DingTalk release inventory without extracting its empty root directory', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-dingtalk-')));
  const data = releaseArchive(archive('', './', '5'));
  const installer = createProviderCliInstaller({
    root,
    provider: 'dingtalk',
    version: '1.0.61',
    platform: 'darwin',
    arch: 'arm64',
    executableName: 'dws',
    asset: {
      ...pinned(data),
      binaryPath: './dws',
      allowedDirectories: ['./'],
      allowedFiles: ['./dws', './README.md', './NOTICE', './LICENSE', './CHANGELOG.md'],
    },
    fetch: async () => new Response(new Uint8Array(data)),
    verifyBinary: async (file) => (await readFile(file, 'utf8')) === 'fixture native',
  });
  try {
    assert.equal(await installer.install(new AbortController().signal), installer.executable);
    assert.equal(await readFile(installer.executable, 'utf8'), 'fixture native');
    assert.deepEqual(await readdir(path.dirname(installer.executable)), ['dws']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('provider installer rejects nonempty, unlisted, duplicated or linked directory headers without normalizing paths', async () => {
  const validDirectory = archive('', './', '5');
  const cases = [
    { data: releaseArchive(archive('not empty', './', '5')), directories: ['./'] },
    { data: releaseArchive(validDirectory), directories: [] },
    { data: releaseArchive(validDirectory), directories: ['.'] },
    { data: releaseArchive(archive('', './other/', '5')), directories: ['./'] },
    { data: releaseArchive(archive('', './', '1')), directories: ['./'] },
    { data: releaseArchive(archive('', './', '2')), directories: ['./'] },
    { data: releaseArchive(archive('', './', '0')), directories: ['./'] },
    { data: releaseArchive(validDirectory, [validDirectory]), directories: ['./'] },
  ];
  for (const { data, directories } of cases) {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-bad-dir-')));
    let verified = false;
    const installer = createProviderCliInstaller({
      root,
      provider: 'dingtalk',
      version: '1.0.61',
      executableName: 'dws',
      asset: {
        ...pinned(data),
        binaryPath: './dws',
        allowedDirectories: directories,
        allowedFiles: ['./dws', './README.md', './NOTICE', './LICENSE', './CHANGELOG.md'],
      },
      fetch: async () => new Response(new Uint8Array(data)),
      verifyBinary: async () => {
        verified = true;
        return true;
      },
    });
    try {
      await assert.rejects(
        installer.install(new AbortController().signal),
        code('installation_failed'),
      );
      assert.equal(verified, false);
      await assert.rejects(lstat(installer.executable), { code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('provider installer verifies pinned archive before atomically publishing its one native executable', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-install-')));
  const data = archive('fixture executable');
  let requests = 0;
  const installer = createProviderCliInstaller({
    root,
    provider: 'test-cli',
    version: '1.0.0',
    platform: 'darwin',
    arch: 'arm64',
    executableName: 'cli',
    asset: {
      url: 'https://registry.npmjs.org/test/-/test-1.0.0.tgz',
      sha512: createHash('sha512').update(data).digest('base64'),
      binaryPath: 'package/bin/cli',
      allowedFiles: ['package/bin/cli'],
    },
    fetch: async () => {
      requests++;
      return new Response(new Uint8Array(data));
    },
    verifyBinary: async (file) => (await readFile(file, 'utf8')) === 'fixture executable',
  });
  try {
    assert.equal(await installer.install(new AbortController().signal), installer.executable);
    assert.deepEqual(await readdir(path.dirname(installer.executable)), ['cli']);
    await installer.install(new AbortController().signal);
    assert.equal(requests, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const code = (expected: string) => (error: unknown) =>
  error instanceof ReadConnectorError && error.code === expected;
const pinned = (data: Buffer) => ({
  url: 'https://registry.npmjs.org/test/-/test-1.0.0.tgz',
  sha256: createHash('sha256').update(data).digest('hex'),
  binaryPath: 'package/bin/cli',
  allowedFiles: ['package/bin/cli'],
});

test('provider installer rejects unpinned bytes, unsafe tar members and truncated archives before native execution', async () => {
  const valid = archive('fixture');
  const tar = gunzipSync(valid);
  const duplicate = gzipSync(Buffer.concat([tar.subarray(0, 1024), tar]));
  const truncated = gzipSync(tar.subarray(0, tar.length - 800));
  const badChecksum = Buffer.from(tar);
  badChecksum[0] = 88;
  for (const [index, data] of [
    valid,
    archive('fixture', '../cli'),
    archive('fixture', 'package/bin/cli', '2'),
    archive('fixture', 'package/bin/cli', '1'),
    duplicate,
    truncated,
    gzipSync(badChecksum),
    Buffer.from('not gzip'),
  ].entries()) {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-bad-tar-')));
    let executions = 0;
    const installer = createProviderCliInstaller({
      root,
      provider: 'test',
      version: '1',
      asset: { ...pinned(data), ...(index === 0 ? { sha256: '0'.repeat(64) } : {}) },
      fetch: async () => new Response(new Uint8Array(data)),
      verifyBinary: async () => {
        executions++;
        return true;
      },
    });
    try {
      await assert.rejects(
        installer.install(new AbortController().signal),
        code('installation_failed'),
      );
      await assert.rejects(lstat(installer.executable), { code: 'ENOENT' });
      assert.equal(executions, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('provider installer permits only official bounded redirects and fails unsupported or cancelled requests', async () => {
  const data = archive('fixture');
  for (const location of [
    'https://evil.test/archive.tgz',
    'http://registry.npmjs.org/archive.tgz',
    'https://user:secret@registry.npmjs.org/a',
    'https://registry.npmjs.org/a#fragment',
  ]) {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-redirect-')));
    let calls = 0;
    const installer = createProviderCliInstaller({
      root,
      provider: 'test',
      version: '1',
      asset: pinned(data),
      fetch: async () => {
        calls++;
        return new Response(null, { status: 302, headers: { location } });
      },
      verifyBinary: async () => true,
    });
    try {
      await assert.rejects(
        installer.install(new AbortController().signal),
        code('installation_failed'),
      );
      assert.equal(calls, 1);
      await assert.rejects(installer.install(AbortSignal.abort()), code('cancelled'));
      const unsupported = createProviderCliInstaller({
        root,
        provider: 'test',
        version: '1',
        verifyBinary: async () => true,
      });
      await assert.rejects(
        unsupported.install(new AbortController().signal),
        code('unsupported_platform'),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('provider installer clears staging after rejected native bytes or cancellation and rejects replaced install ancestors', async () => {
  const data = archive('fixture');
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-stage-')));
  const controller = new AbortController();
  let cancel = false;
  const installer = createProviderCliInstaller({
    root,
    provider: 'test',
    version: '1',
    asset: pinned(data),
    fetch: async () => new Response(new Uint8Array(data)),
    verifyBinary: async () => {
      if (cancel) controller.abort();
      return cancel;
    },
  });
  try {
    await assert.rejects(installer.install(controller.signal), code('installation_failed'));
    assert.deepEqual(await readdir(path.dirname(path.dirname(installer.executable))), []);
    cancel = true;
    await assert.rejects(installer.install(controller.signal), code('cancelled'));
    assert.deepEqual(await readdir(path.dirname(path.dirname(installer.executable))), []);
    const linked = path.join(root, 'linked');
    await mkdir(path.join(root, 'outside'));
    await symlink(path.join(root, 'outside'), linked);
    const unsafe = createProviderCliInstaller({
      root: linked,
      provider: 'test',
      version: '1',
      asset: pinned(data),
      fetch: async () => new Response(new Uint8Array(data)),
      verifyBinary: async () => true,
    });
    await assert.rejects(unsafe.install(new AbortController().signal), code('installation_failed'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('provider installer follows an official redirect and rejects a tampered installed native on reuse', async () => {
  const data = archive('fixture');
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'space-provider-official-')));
  let calls = 0;
  let valid = true;
  const installer = createProviderCliInstaller({
    root,
    provider: 'test',
    version: '1',
    asset: pinned(data),
    fetch: async () =>
      ++calls === 1
        ? new Response(null, {
            status: 302,
            headers: { location: 'https://release-assets.githubusercontent.com/fixed.tgz' },
          })
        : new Response(new Uint8Array(data)),
    verifyBinary: async () => valid,
  });
  try {
    await installer.install(new AbortController().signal);
    assert.equal(calls, 2);
    valid = false;
    await assert.rejects(
      installer.install(new AbortController().signal),
      code('installation_failed'),
    );
    assert.equal(calls, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
