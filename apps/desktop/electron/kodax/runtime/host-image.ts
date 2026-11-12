import { createHash } from 'node:crypto';
import type { ClientItemContent, ClientItemReadOptions } from '@kodax-ai/kodax/client';

export type HostItemReader = (
  itemId: string,
  options: ClientItemReadOptions,
) => Promise<ClientItemContent | null>;

export type HostImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface HostImage {
  readonly bytes: Uint8Array;
  readonly mediaType: HostImageMediaType;
}

/** Read only the Host-authorized item, never a renderer-supplied file path. */
export async function readHostImage(
  reader: HostItemReader,
  itemId: string,
  attachmentIndex: number,
): Promise<HostImage> {
  const chunks: Buffer[] = [];
  let offset = 0;
  let expected: NonNullable<ClientItemContent['image']> | undefined;
  for (let count = 0; count < 32; count++) {
    const result = await reader(itemId, {
      part: 'attachment',
      attachmentIndex,
      attachmentOffset: offset,
      ...(expected ? { expectedImageSha256: expected.sha256 } : {}),
    });
    const image = validateChunk(result, itemId, offset, expected);
    expected = image;
    const bytes = Buffer.from(image.dataBase64, 'base64');
    if (!bytes.length || bytes.length > 512 * 1024 || offset + bytes.length > image.totalLength)
      throw new Error('Invalid Host image length.');
    chunks.push(bytes);
    offset += bytes.length;
    if (image.nextOffset !== undefined) {
      if (image.nextOffset !== offset || offset >= image.totalLength)
        throw new Error('Invalid Host image continuation.');
      continue;
    }
    const whole = Buffer.concat(chunks);
    validateImage(whole, image);
    return { bytes: whole, mediaType: image.mediaType as HostImageMediaType };
  }
  throw new Error('Host image exceeded the chunk limit.');
}

function validateChunk(
  result: ClientItemContent | null,
  itemId: string,
  offset: number,
  expected?: NonNullable<ClientItemContent['image']>,
): NonNullable<ClientItemContent['image']> {
  const image = result?.image;
  if (
    !image ||
    result?.id !== itemId ||
    !HOST_IMAGE_MEDIA_TYPES.has(image.mediaType) ||
    image.offset !== offset ||
    !Number.isSafeInteger(image.totalLength) ||
    image.totalLength <= 0 ||
    image.totalLength > 10 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(image.sha256) ||
    image.dataBase64.length > 700_000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(image.dataBase64)
  )
    throw new Error('Invalid Host image chunk.');
  if (
    expected &&
    (image.sha256 !== expected.sha256 ||
      image.totalLength !== expected.totalLength ||
      image.width !== expected.width ||
      image.height !== expected.height)
  )
    throw new Error('Host image changed during reading.');
  return image;
}

// GIF is a Host-readable format, but Space previews only these three.
const HOST_IMAGE_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function hasImageSignature(bytes: Buffer, mediaType: string): boolean {
  if (mediaType === 'image/png') return bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (mediaType === 'image/jpeg') return bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
  return (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  );
}

function validateImage(bytes: Buffer, image: NonNullable<ClientItemContent['image']>): void {
  if (
    bytes.length !== image.totalLength ||
    createHash('sha256').update(bytes).digest('hex') !== image.sha256 ||
    bytes.length < 24 ||
    !hasImageSignature(bytes, image.mediaType) ||
    (image.mediaType === 'image/png' &&
      (bytes.readUInt32BE(16) !== image.width || bytes.readUInt32BE(20) !== image.height))
  )
    throw new Error('Host image integrity check failed.');
}
