import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Readable } from 'node:stream';
import yauzl from 'yauzl';
import {
  spaceExtensionManifestSchema,
  SPACE_EXTENSION_MAX_HTML_BYTES,
  type SpaceExtensionManifestT,
} from '@kodax-space/space-ipc-schema';
import { readRegularFile } from './files.js';

const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ARCHIVE_ENTRIES = 16;

export interface SpaceExtensionArchive {
  readonly manifest: SpaceExtensionManifestT;
  readonly html: string;
}

function openZip(bytes: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('Invalid Space Extension archive'));
      else resolve(zip);
    });
  });
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error('Cannot read extension archive entry'));
      else resolve(stream);
    });
  });
}

async function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  if (!['manifest.json', 'ui/', 'ui/index.html'].includes(entry.fileName)) {
    throw new Error('Unexpected archive entry: P1 permits only manifest.json and ui/index.html');
  }
  const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
  const expectedType = entry.fileName.endsWith('/') ? 0o040000 : 0o100000;
  if (fileType !== 0 && fileType !== expectedType) {
    throw new Error('Space Extension archive contains a symlink or non-regular entry');
  }
  const limit =
    entry.fileName === 'manifest.json'
      ? MAX_MANIFEST_BYTES
      : entry.fileName.endsWith('/')
        ? 0
        : SPACE_EXTENSION_MAX_HTML_BYTES;
  if (entry.uncompressedSize > limit)
    throw new Error(`Archive entry exceeds size limit ${limit} bytes`);
  if (entry.uncompressedSize / Math.max(1, entry.compressedSize) > 100) {
    throw new Error('Space Extension archive exceeds compression ratio 100:1');
  }
  const stream = await openEntry(zip, entry);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk as Uint8Array);
    total += bytes.length;
    if (total > limit) throw new Error(`Archive entry exceeds size limit ${limit} bytes`);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function readEntries(zip: yauzl.ZipFile): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, Buffer>();
    let failed = false;
    const fail = (error: unknown): void => {
      if (failed) return;
      failed = true;
      zip.close();
      reject(error);
    };
    zip.on('error', fail);
    zip.on('end', () => resolve(entries));
    zip.on('entry', (entry: yauzl.Entry) => {
      if (entries.has(entry.fileName)) {
        fail(new Error('Duplicate archive entry'));
        return;
      }
      void readEntry(zip, entry).then((bytes) => {
        entries.set(entry.fileName, bytes);
        if (!failed) zip.readEntry();
      }, fail);
    });
    zip.readEntry();
  });
}

export function verifyExtensionHtml(manifest: SpaceExtensionManifestT, bytes: Buffer): string {
  if (bytes.length > SPACE_EXTENSION_MAX_HTML_BYTES)
    throw new Error('Extension HTML exceeds size limit');
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.ui.sha256) {
    throw new Error('Space Extension UI integrity hash mismatch');
  }
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}

export async function readSpaceExtensionArchive(
  archivePath: string,
): Promise<SpaceExtensionArchive> {
  if (
    !path.isAbsolute(archivePath) ||
    path.extname(archivePath).toLowerCase() !== '.space-extension'
  ) {
    throw new Error('Select an absolute .space-extension archive path');
  }
  const zip = await openZip(await readRegularFile(archivePath, MAX_ARCHIVE_BYTES));
  if (zip.entryCount > MAX_ARCHIVE_ENTRIES) {
    zip.close();
    throw new Error(`Space Extension archive entry count exceeds limit ${MAX_ARCHIVE_ENTRIES}`);
  }
  const entries = await readEntries(zip);
  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes) throw new Error('Space Extension manifest.json is missing');
  const manifest = spaceExtensionManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')));
  const htmlBytes = entries.get(manifest.ui.entry);
  if (!htmlBytes) throw new Error('Space Extension ui/index.html is missing');
  return { manifest, html: verifyExtensionHtml(manifest, htmlBytes) };
}
