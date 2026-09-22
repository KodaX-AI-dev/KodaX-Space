import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { VoiceInstaller, type VoiceAsset } from './installer.js';

test('voice installation rejects corrupt downloads, repairs, survives restart and removes files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'space-voice-test-'));
  const bytes = Buffer.from('verified voice model');
  const asset: VoiceAsset = {
    name: 'model.bin',
    url: 'https://example.invalid/model',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  let corrupt = true;
  let requests = 0;
  const download: typeof fetch = async () => {
    requests++;
    return new Response(corrupt ? Buffer.alloc(bytes.length) : bytes);
  };
  const installer = new VoiceInstaller(root, [asset], async () => {}, download);
  try {
    assert.equal((await installer.status()).phase, 'missing');
    await installer.install();
    assert.equal((await installer.status()).phase, 'failed');
    assert.deepEqual(await readdir(root), []);
    corrupt = false;
    await installer.install();
    assert.equal((await installer.status()).phase, 'ready');
    assert.deepEqual(await readFile(join(root, 'model.bin')), bytes);
    const restarted = new VoiceInstaller(root, [asset], async () => {}, download);
    assert.equal((await restarted.status()).phase, 'ready');
    await writeFile(join(root, 'model.bin'), Buffer.alloc(bytes.length));
    assert.equal(await restarted.verify(), false);
    assert.equal((await restarted.status()).phase, 'failed');
    assert.equal((await restarted.status()).error, 'integrity');
    await restarted.install();
    assert.equal((await restarted.status()).phase, 'ready');
    assert.equal(requests, 3);
    await restarted.remove();
    assert.equal((await restarted.status()).phase, 'missing');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cancelled installation cannot publish ready and can be retried', async () => {
  const root = await mkdtemp(join(tmpdir(), 'space-voice-cancel-'));
  const bytes = Buffer.from('voice model');
  const asset: VoiceAsset = {
    name: 'model.bin',
    url: 'https://example.invalid/model',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  const installer = new VoiceInstaller(
    root,
    [asset],
    async () => {},
    async (_url, options) => {
      started();
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), {
          once: true,
        });
      });
    },
  );
  try {
    const job = installer.install();
    await pending;
    assert.equal((await installer.status()).phase, 'installing');
    await installer.cancel();
    await job;
    assert.equal((await installer.status()).phase, 'missing');
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('existing files do not become ready if the native runtime cannot load', async () => {
  const root = await mkdtemp(join(tmpdir(), 'space-voice-probe-'));
  const bytes = Buffer.from('voice model');
  const asset: VoiceAsset = {
    name: 'model.bin',
    url: 'https://example.invalid/model',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  await writeFile(join(root, asset.name), bytes);
  const installer = new VoiceInstaller(root, [asset], async () => {
    throw new Error('incompatible binary');
  });
  try {
    assert.equal((await installer.status()).phase, 'failed');
    assert.equal((await installer.status()).error, 'runtime');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('native installation extracts only the pinned regular binary and rejects wrong native bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'space-voice-native-'));
  const native = Buffer.from('verified native runtime');
  const header = Buffer.alloc(512);
  header.write('package/index.node');
  header.write(native.length.toString(8).padStart(11, '0'), 124);
  header[156] = 48;
  const tar = Buffer.concat([
    header,
    native,
    Buffer.alloc(512 - native.length),
    Buffer.alloc(1024),
  ]);
  const archive = gzipSync(tar);
  const asset: VoiceAsset = {
    name: 'whisper.node',
    url: 'https://example.invalid/native.tgz',
    bytes: archive.length,
    sha256: createHash('sha256').update(archive).digest('hex'),
    native: { bytes: native.length, sha256: createHash('sha256').update(native).digest('hex') },
  };
  try {
    await writeFile(join(root, 'whisper.node.part'), 'interrupted download');
    const installer = new VoiceInstaller(
      root,
      [asset],
      async () => {},
      async () => new Response(archive),
    );
    await installer.status();
    assert.deepEqual(await readdir(root), []);
    await installer.install();
    assert.equal((await installer.status()).phase, 'ready');
    assert.deepEqual(await readFile(join(root, asset.name)), native);
    assert.deepEqual(await readdir(root), ['whisper.node']);
    await installer.remove();
    const wrong = { ...asset, native: { ...asset.native!, sha256: '0'.repeat(64) } };
    const rejected = new VoiceInstaller(
      root,
      [wrong],
      async () => {},
      async () => new Response(archive),
    );
    await rejected.install();
    assert.equal((await rejected.status()).error, 'integrity');
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
