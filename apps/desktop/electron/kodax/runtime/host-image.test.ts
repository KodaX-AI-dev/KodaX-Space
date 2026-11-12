import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ClientItemContent } from '@kodax-ai/kodax/client';
import { readHostImage } from './host-image.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const image = {
  mediaType: 'image/png' as const,
  dataBase64: png.toString('base64'),
  sha256: createHash('sha256').update(png).digest('hex'),
  width: 1,
  height: 1,
  offset: 0,
  totalLength: png.length,
};
const item: ClientItemContent = { id: 'item', text: '', offset: 0, totalLength: 0, image };

test('image content rejects a different item, digest, dimensions, overflow and non-progressing chunks', async () => {
  for (const invalid of [
    { ...item, id: 'other-item' },
    { ...item, image: { ...image, sha256: '0'.repeat(64) } },
    { ...item, image: { ...image, width: 2 } },
    { ...item, image: { ...image, totalLength: 10 * 1024 * 1024 + 1 } },
    { ...item, image: { ...image, nextOffset: 0 } },
  ])
    await assert.rejects(readHostImage(async () => invalid, 'item', 0));
});

test('continuation pins the first hash and rejects replacement bytes', async () => {
  let calls = 0;
  await assert.rejects(
    readHostImage(
      async (_id, options) => {
        calls++;
        if (calls === 1)
          return {
            ...item,
            image: { ...image, dataBase64: png.subarray(0, 32).toString('base64'), nextOffset: 32 },
          };
        assert.equal(options.expectedImageSha256, image.sha256);
        return {
          ...item,
          image: {
            ...image,
            offset: 32,
            dataBase64: png.subarray(32).toString('base64'),
            sha256: '1'.repeat(64),
          },
        };
      },
      'item',
      0,
    ),
    /changed/,
  );
  assert.equal(calls, 2);
});

test('reads the actual format the Host returns (including GIF) and rejects bytes that contradict it', async () => {
  const frame = (head: Buffer) => Buffer.concat([head, Buffer.alloc(32, 7)]);
  const jpeg = frame(Buffer.from('ffd8ffe0', 'hex'));
  const webp = frame(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]));
  const content = (bytes: Buffer, mediaType: 'image/jpeg' | 'image/webp' | 'image/gif') => ({
    ...item,
    image: {
      ...image,
      mediaType,
      dataBase64: bytes.toString('base64'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      totalLength: bytes.length,
    },
  });
  const read = (bytes: Buffer, mediaType: 'image/jpeg' | 'image/webp' | 'image/gif') =>
    readHostImage(async () => content(bytes, mediaType), 'item', 0);
  assert.equal((await read(jpeg, 'image/jpeg')).mediaType, 'image/jpeg');
  assert.equal((await read(webp, 'image/webp')).mediaType, 'image/webp');
  await assert.rejects(read(jpeg, 'image/webp'), /integrity/);
  const gif = frame(Buffer.from('GIF89a'));
  assert.equal((await read(gif, 'image/gif')).mediaType, 'image/gif');
  await assert.rejects(read(jpeg, 'image/gif'), /integrity/);
});
