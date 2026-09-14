import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import JSZip from 'jszip';
import { createFeishuCliInstaller } from './feishu-cli-install.js';
import { FeishuOnboardingError } from './feishu-auth-process.js';

function archive(contents: string, name = 'lark-cli', type = '0'): Buffer {
  const body = Buffer.from(contents);
  const header = Buffer.alloc(512);
  header.write(name);
  header.write('0000755\0', 100);
  header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
  header.fill(' ', 148, 156);
  header.write(type, 156);
  header.write('ustar\0', 257);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return gzipSync(
    Buffer.concat([header, body, Buffer.alloc(((512 - (body.length % 512)) % 512) + 1024)]),
  );
}

test('installer verifies and atomically publishes only the pinned native binary to its private directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-install-test-'));
  const data = archive('fixture native executable');
  const urls: string[] = [];
  const installer = createFeishuCliInstaller({
    root,
    platform: 'darwin',
    arch: 'arm64',
    expectedDigest: createHash('sha256').update(data).digest('hex'),
    fetch: async (url) => {
      urls.push(String(url));
      return new Response(new Uint8Array(data));
    },
    verifyBinary: async (file) => (await readFile(file, 'utf8')) === 'fixture native executable',
  });
  try {
    const binary = await installer.install(new AbortController().signal);
    assert.equal(binary, installer.executable);
    assert.equal(await readFile(binary, 'utf8'), 'fixture native executable');
    assert.equal(
      urls[0],
      'https://github.com/larksuite/cli/releases/download/v1.0.92/lark-cli-1.0.92-darwin-arm64.tar.gz',
    );
    assert.ok(binary.startsWith(root + path.sep));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a bundled official archive installs locally without touching the network', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-bundled-test-'));
  const data = archive('bundled native executable');
  const bundledArchive = path.join(root, 'lark-cli.tar.gz');
  await writeFile(bundledArchive, data);
  let networkCalls = 0;
  const installer = createFeishuCliInstaller({
    root: path.join(root, 'private'),
    platform: 'darwin',
    arch: 'arm64',
    expectedDigest: createHash('sha256').update(data).digest('hex'),
    fetch: async () => {
      networkCalls++;
      throw new Error('network must remain unused');
    },
    verifyBinary: async (file) => (await readFile(file, 'utf8')) === 'bundled native executable',
  });
  try {
    const binary = await installer.installBundled(bundledArchive, new AbortController().signal);
    assert.equal(binary, installer.executable);
    assert.equal(await readFile(binary, 'utf8'), 'bundled native executable');
    assert.equal(networkCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a bundled official archive repairs a corrupted Space-managed executable', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-bundled-test-'));
  const data = archive('repaired native executable');
  const bundledArchive = path.join(root, 'lark-cli.tar.gz');
  await writeFile(bundledArchive, data);
  const installer = createFeishuCliInstaller({
    root: path.join(root, 'private'),
    platform: 'darwin',
    arch: 'arm64',
    expectedDigest: createHash('sha256').update(data).digest('hex'),
    verifyBinary: async (file) => {
      const contents = await readFile(file, 'utf8');
      assert.notEqual(
        contents,
        'corrupted Space-managed executable',
        'a checksum-mismatched managed executable must never be run for version verification',
      );
      return contents === 'repaired native executable';
    },
  });
  try {
    await mkdir(path.dirname(installer.executable), { recursive: true });
    await writeFile(installer.executable, 'corrupted Space-managed executable');
    await installer.installBundled(bundledArchive, new AbortController().signal);
    assert.equal(await readFile(installer.executable, 'utf8'), 'repaired native executable');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a damaged bundled archive fails without falling back to a network download', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-bundled-test-'));
  const bundledArchive = path.join(root, 'lark-cli.tar.gz');
  await writeFile(bundledArchive, archive('damaged archive'));
  let networkCalls = 0;
  const installer = createFeishuCliInstaller({
    root: path.join(root, 'private'),
    platform: 'darwin',
    arch: 'arm64',
    expectedDigest: '0'.repeat(64),
    fetch: async () => {
      networkCalls++;
      return new Response();
    },
    verifyBinary: async () => true,
  });
  try {
    await assert.rejects(installer.installBundled(bundledArchive, new AbortController().signal), {
      code: 'component_unavailable',
    });
    assert.equal(networkCalls, 0);
    await assert.rejects(readFile(installer.executable), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the official release archive metadata is accepted but only the native binary is published', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-install-test-'));
  const data = gzipSync(
    Buffer.concat([
      ...['README.md', 'LICENSE', 'CHANGELOG.md'].map((name) =>
        gunzipSync(archive('official metadata', name)).subarray(0, -1024),
      ),
      gunzipSync(archive('native executable')),
    ]),
  );
  const installer = createFeishuCliInstaller({
    root,
    expectedDigest: createHash('sha256').update(data).digest('hex'),
    fetch: async () => new Response(new Uint8Array(data)),
    verifyBinary: async () => true,
  });
  try {
    const binary = await installer.install(new AbortController().signal);
    assert.deepEqual(await readdir(path.dirname(binary)), ['lark-cli']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('installer follows only official release redirects and reuses a verified private installation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-install-test-'));
  const data = archive('fixture binary');
  let requests = 0;
  const installer = createFeishuCliInstaller({
    root,
    platform: 'darwin',
    arch: 'x64',
    expectedDigest: createHash('sha256').update(data).digest('hex'),
    fetch: async () => {
      requests++;
      return requests === 1
        ? new Response(null, {
            status: 302,
            headers: {
              Location:
                'https://release-assets.githubusercontent.com/github-production-release-asset/123/abc?signature=PRIVATE',
            },
          })
        : new Response(new Uint8Array(data));
    },
    verifyBinary: async (file) => (await readFile(file, 'utf8')) === 'fixture binary',
  });
  try {
    await installer.install(new AbortController().signal);
    await installer.install(new AbortController().signal);
    assert.equal(requests, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a progressing eight-minute official download completes instead of failing at three minutes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // Node's native AbortSignal clock is not covered by MockTimers.
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
    return controller.signal;
  });
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-slow-test-'));
  const data = archive('slow but valid native executable');
  let part = 0;
  const installer = createFeishuCliInstaller({
    root,
    expectedDigest: createHash('sha256').update(data).digest('hex'),
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              if (part === 8) return controller.close();
              t.mock.timers.tick(60000);
              controller.enqueue(
                data.subarray(
                  Math.floor((part * data.length) / 8),
                  Math.floor((++part * data.length) / 8),
                ),
              );
            },
          },
          { highWaterMark: 0 },
        ),
      ),
    verifyBinary: async () => true,
  });
  try {
    const binary = await installer.install(new AbortController().signal);
    assert.equal(await readFile(binary, 'utf8'), 'slow but valid native executable');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a valid official redirect counts as download progress before the next response arrives', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-redirect-test-'));
  const data = archive('native executable');
  let requests = 0;
  const installer = createFeishuCliInstaller({
    root,
    expectedDigest: createHash('sha256').update(data).digest('hex'),
    fetch: async (_url, options) => {
      requests++;
      t.mock.timers.tick(requests === 1 ? 90000 : 40000);
      options?.signal?.throwIfAborted();
      return requests === 1
        ? new Response(null, {
            status: 302,
            headers: { Location: 'https://release-assets.githubusercontent.com/official-asset' },
          })
        : new Response(new Uint8Array(data));
    },
    verifyBinary: async () => true,
  });
  try {
    await installer.install(new AbortController().signal);
    assert.equal(requests, 2);
    assert.equal(await readFile(installer.executable, 'utf8'), 'native executable');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const scenario of ['headers-stalled', 'body-stalled', 'total-deadline'] as const) {
  test(`installer bounds ${scenario} and reports a safe download timeout without publishing`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(AbortSignal, 'timeout', (ms: number) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('SECRET URL', 'TimeoutError')), ms);
      return controller.signal;
    });
    const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-timeout-test-'));
    const data = archive('download must not be installed');
    let offset = 0;
    const installer = createFeishuCliInstaller({
      root,
      expectedDigest: createHash('sha256').update(data).digest('hex'),
      fetch: async (_url, options) => {
        if (scenario === 'headers-stalled') {
          t.mock.timers.tick(120001);
          options?.signal?.throwIfAborted();
          return new Response(new Uint8Array(data));
        }
        return new Response(
          new ReadableStream<Uint8Array>(
            {
              pull(controller) {
                if (offset === data.length) return controller.close();
                t.mock.timers.tick(scenario === 'body-stalled' ? 120001 : 60000);
                options?.signal?.throwIfAborted();
                controller.enqueue(data.subarray(offset, ++offset));
              },
            },
            { highWaterMark: 0 },
          ),
        );
      },
      verifyBinary: async () => true,
    });
    try {
      await assert.rejects(
        installer.install(new AbortController().signal),
        (error: unknown) =>
          error instanceof FeishuOnboardingError &&
          error.code === 'download_timeout' &&
          error.message.includes('尚未进入网页授权') &&
          !error.message.includes('SECRET'),
      );
      await assert.rejects(readFile(installer.executable), { code: 'ENOENT' });
      assert.deepEqual(await readdir(path.join(root, 'feishu-cli', '1.0.92')), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('network errors are actionable without disclosing URLs or losing user cancellation', async () => {
  for (const scenario of ['network', 'http', 'cancel'] as const) {
    const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-network-test-'));
    const controller = new AbortController();
    const installer = createFeishuCliInstaller({
      root,
      fetch: async () => {
        if (scenario === 'http') return new Response('SECRET', { status: 503 });
        if (scenario === 'cancel') controller.abort();
        throw new TypeError('fetch failed: https://example.test/SECRET');
      },
    });
    try {
      await assert.rejects(
        installer.install(controller.signal),
        (error: unknown) =>
          error instanceof FeishuOnboardingError &&
          error.code === (scenario === 'cancel' ? 'cancelled' : 'download_failed') &&
          !error.message.includes('SECRET'),
      );
      assert.deepEqual(await readdir(path.join(root, 'feishu-cli', '1.0.92')), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('Windows installations extract only the expected native exe from the verified official zip shape', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-install-test-'));
  const zip = new JSZip();
  zip.file('LICENSE', 'official license');
  zip.file('README.md', 'official readme');
  zip.file('CHANGELOG.md', 'official changelog');
  zip.file('lark-cli.exe', 'fixture windows executable');
  const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const installer = createFeishuCliInstaller({
    root,
    platform: 'win32',
    arch: 'arm64',
    expectedDigest: createHash('sha256').update(data).digest('hex'),
    fetch: async () => new Response(new Uint8Array(data)),
    verifyBinary: async (file) => (await readFile(file, 'utf8')) === 'fixture windows executable',
  });
  try {
    const file = await installer.install(new AbortController().signal);
    assert.equal(path.basename(file), 'lark-cli.exe');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('checksum, path traversal, links, foreign redirects, cancelled downloads and failed probes never publish a binary', async () => {
  for (const scenario of [
    'checksum',
    'traversal',
    'link',
    'redirect',
    'cancel',
    'version',
  ] as const) {
    const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-install-test-'));
    const data = archive(
      'fixture',
      scenario === 'traversal' ? '../escape' : 'lark-cli',
      scenario === 'link' ? '2' : '0',
    );
    const controller = new AbortController();
    const installer = createFeishuCliInstaller({
      root,
      platform: 'darwin',
      arch: 'arm64',
      expectedDigest:
        scenario === 'checksum' ? '0'.repeat(64) : createHash('sha256').update(data).digest('hex'),
      fetch: async () => {
        if (scenario === 'cancel') controller.abort();
        return scenario === 'redirect'
          ? new Response(null, {
              status: 302,
              headers: { Location: 'https://evil.example/SECRET' },
            })
          : new Response(new Uint8Array(data));
      },
      verifyBinary: async () => scenario !== 'version',
    });
    try {
      await assert.rejects(
        installer.install(controller.signal),
        (error: unknown) =>
          error instanceof FeishuOnboardingError &&
          error.code === (scenario === 'cancel' ? 'cancelled' : 'installation_failed') &&
          !String(error).includes('SECRET'),
      );
      await assert.rejects(readFile(installer.executable), { code: 'ENOENT' });
      assert.deepEqual(await readdir(path.join(root, 'feishu-cli', '1.0.92')), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('private installation rejects a symlinked tool directory instead of modifying its target', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-install-test-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'space-feishu-outside-test-'));
  await symlink(outside, path.join(root, 'feishu-cli'));
  const installer = createFeishuCliInstaller({
    root,
    platform: 'linux',
    arch: 'x64',
    fetch: async () => {
      throw new Error('must not download');
    },
  });
  try {
    await assert.rejects(installer.install(new AbortController().signal), {
      code: 'installation_failed',
    });
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('an existing binary behind a symlinked platform directory is not executed for verification', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-install-test-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'space-feishu-outside-test-'));
  await mkdir(path.join(root, 'feishu-cli', '1.0.92'), { recursive: true });
  await writeFile(path.join(outside, 'lark-cli'), 'untrusted executable');
  await symlink(outside, path.join(root, 'feishu-cli', '1.0.92', 'darwin-arm64'));
  let probes = 0;
  const installer = createFeishuCliInstaller({
    root,
    platform: 'darwin',
    arch: 'arm64',
    verifyBinary: async () => {
      probes++;
      return true;
    },
  });
  try {
    await assert.rejects(installer.install(new AbortController().signal), {
      code: 'installation_failed',
    });
    assert.equal(probes, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
