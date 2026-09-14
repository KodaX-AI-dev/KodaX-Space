import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareFeishuCliAssets } from '../prepare-feishu-cli.mjs';

const archive = Buffer.from('verified bundled CLI archive');
const fixtureLock = {
  schemaVersion: 1,
  component: 'lark-cli',
  version: '1.0.92',
  source: 'https://github.com/larksuite/cli/releases/tag/v1.0.92',
  license: 'MIT',
  assets: {
    'darwin-arm64': {
      name: 'darwin-arm64.tar.gz',
      bytes: archive.byteLength,
      sha256: createHash('sha256').update(archive).digest('hex'),
      format: 'tar.gz',
    },
  },
};

test('build preparation downloads a pinned archive once and revalidates the cache', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-prepare-'));
  let requests = 0;
  const options = {
    root,
    targets: ['darwin-arm64'],
    lock: fixtureLock,
    fetcher: async () => {
      requests++;
      return new Response(new Uint8Array(archive));
    },
  };
  try {
    const [file] = await prepareFeishuCliAssets(options);
    assert.equal(file, path.join(root, 'feishu-cli', '1.0.92', 'darwin-arm64', 'lark-cli.tar.gz'));
    assert.deepEqual(await readFile(file), archive);
    await prepareFeishuCliAssets(options);
    assert.equal(requests, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('build preparation rejects an unknown target and a mismatched archive without publishing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'space-feishu-prepare-'));
  try {
    await assert.rejects(
      prepareFeishuCliAssets({
        root,
        targets: ['win32-x64'],
        lock: fixtureLock,
        fetcher: async () => new Response(new Uint8Array(archive)),
      }),
      /unsupported target/u,
    );
    await assert.rejects(
      prepareFeishuCliAssets({
        root,
        targets: ['darwin-arm64'],
        lock: {
          ...fixtureLock,
          assets: {
            'darwin-arm64': { ...fixtureLock.assets['darwin-arm64'], sha256: '0'.repeat(64) },
          },
        },
        fetcher: async () => new Response(new Uint8Array(archive)),
      }),
      /archive integrity/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
