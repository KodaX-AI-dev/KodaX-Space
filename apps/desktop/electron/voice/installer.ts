import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { VoiceStatus } from '@kodax-space/space-ipc-schema';

export interface VoiceAsset {
  readonly name: string;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly native?: { readonly bytes: number; readonly sha256: string };
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// The entire archive is pinned before parsing. Never extract paths supplied by tar.
function nativeFromArchive(bytes: Buffer, asset: VoiceAsset): Buffer {
  const tar = gunzipSync(bytes, { maxOutputLength: 16 * 1024 * 1024 });
  let result: Buffer | undefined;
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    if (!name) break;
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim();
    if (!/^[0-7]+$/.test(sizeText)) throw new Error('integrity');
    const size = Number.parseInt(sizeText, 8);
    if (offset + 512 + size > tar.length) throw new Error('integrity');
    if (name === 'package/index.node') {
      if (result || ![0, 48].includes(header[156])) throw new Error('integrity');
      result = tar.subarray(offset + 512, offset + 512 + size);
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!result || result.length !== asset.native?.bytes || digest(result) !== asset.native.sha256) {
    throw new Error('integrity');
  }
  return result;
}

export class VoiceInstaller {
  private state: VoiceStatus;
  private initial: Promise<void> | null = null;
  private job: Promise<void> | null = null;
  private abort: AbortController | null = null;

  constructor(
    readonly directory: string,
    private readonly assets: readonly VoiceAsset[],
    private readonly probe: (signal: AbortSignal) => Promise<void>,
    private readonly download: typeof fetch = fetch,
  ) {
    this.state = {
      phase: assets.length ? 'checking' : 'unsupported',
      downloaded: 0,
      total: assets.reduce((total, asset) => total + asset.bytes, 0),
      error: null,
    };
  }

  async status(): Promise<VoiceStatus> {
    if (this.state.phase === 'checking') {
      this.initial ??= this.checkInstalled();
      await this.initial;
    }
    return { ...this.state };
  }

  private async checkInstalled(): Promise<void> {
    let phase: VoiceStatus['phase'] = 'missing';
    let error: VoiceStatus['error'] = null;
    try {
      for (const asset of this.assets)
        await rm(join(this.directory, `${asset.name}.part`), { force: true });
      if (await this.verify()) {
        try {
          await this.probe(AbortSignal.timeout(90_000));
          phase = 'ready';
        } catch {
          phase = 'failed';
          error = 'runtime';
        }
      }
    } catch {
      phase = 'failed';
      error = 'storage';
    }
    if (this.state.phase === 'checking') this.state = { ...this.state, phase, error };
  }

  private async valid(asset: VoiceAsset): Promise<boolean> {
    const file = join(this.directory, asset.name);
    try {
      const stat = await lstat(file);
      const expected = asset.native ?? asset;
      if (!stat.isFile() || stat.size !== expected.bytes) return false;
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      return hash.digest('hex') === expected.sha256;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async verify(): Promise<boolean> {
    if (!this.assets.length) return false;
    for (const asset of this.assets)
      if (!(await this.valid(asset))) {
        if (this.state.phase === 'ready')
          this.state = { ...this.state, phase: 'failed', error: 'integrity' };
        return false;
      }
    return true;
  }

  install(): Promise<void> {
    if (this.job) return this.job;
    if (!this.assets.length) return Promise.resolve();
    const abort = new AbortController();
    this.abort = abort;
    this.state = { ...this.state, phase: 'installing', downloaded: 0, error: null };
    this.job = this.runInstall(abort.signal).finally(() => {
      this.job = null;
      this.abort = null;
    });
    return this.job;
  }

  private async runInstall(signal: AbortSignal): Promise<void> {
    try {
      await this.initial;
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      for (const asset of this.assets) {
        signal.throwIfAborted();
        if (await this.valid(asset)) this.state.downloaded += asset.bytes;
        else await this.installAsset(asset, signal);
      }
      signal.throwIfAborted();
      try {
        await this.probe(signal);
      } catch {
        throw new Error('runtime');
      }
      signal.throwIfAborted();
      this.state.phase = 'ready';
    } catch (error) {
      this.state.phase = signal.aborted ? 'missing' : 'failed';
      const message = error instanceof Error ? error.message : '';
      this.state.error = signal.aborted
        ? null
        : message === 'integrity' || message === 'runtime'
          ? message
          : 'download';
    }
  }

  private async installAsset(asset: VoiceAsset, signal: AbortSignal): Promise<void> {
    const partial = join(this.directory, `${asset.name}.part`);
    try {
      await rm(partial, { force: true });
      const combined = AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)]);
      const response = await this.download(asset.url, { signal: combined });
      if (
        !response.ok ||
        !response.body ||
        (response.url && !response.url.startsWith('https://'))
      ) {
        throw new Error('download');
      }
      const file = await open(partial, 'wx', 0o600);
      const hash = createHash('sha256');
      let received = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value: bytes } = await reader.read();
          if (done) break;
          combined.throwIfAborted();
          received += bytes.length;
          if (received > asset.bytes) throw new Error('integrity');
          hash.update(bytes);
          await file.writeFile(bytes);
          this.state.downloaded += bytes.length;
        }
      } catch (error) {
        await reader.cancel(error);
        throw error;
      } finally {
        reader.releaseLock();
        await file.close();
      }
      if (received !== asset.bytes || hash.digest('hex') !== asset.sha256)
        throw new Error('integrity');
      if (asset.native)
        await writeFile(partial, nativeFromArchive(await readFile(partial), asset), {
          mode: 0o600,
        });
      signal.throwIfAborted();
      await rename(partial, join(this.directory, asset.name));
    } finally {
      await rm(partial, { force: true });
    }
  }

  async cancel(): Promise<void> {
    this.abort?.abort();
    await this.job;
  }

  async remove(): Promise<void> {
    await this.cancel();
    await this.initial;
    await rm(this.directory, { recursive: true, force: true });
    this.state = {
      ...this.state,
      phase: this.assets.length ? 'missing' : 'unsupported',
      downloaded: 0,
      error: null,
    };
  }
}
