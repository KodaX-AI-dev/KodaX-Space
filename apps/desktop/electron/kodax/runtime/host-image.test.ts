import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ClientItemContent } from '@kodax-ai/kodax/client';
import { readHostImage } from './host-image.js';
import {
  issueHostImageAttachment,
  handleSessionAttachmentProtocolRequest,
  revokeSessionAttachmentPreviews,
} from '../../window/session-attachment-protocol.js';

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
    { ...item, image: { ...image, mediaType: 'image/gif' as const } },
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

for (const [mediaType, base64] of [
  [
    'image/jpeg',
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAC4AoAMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APznr/fA/wArwoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKAP/2Q==',
  ],
  [
    'image/webp',
    'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+771X/rgPzgPzgP5lv/zYEDND50AA',
  ],
  [
    'image/gif',
    'R0lGODlhAgACAPAAAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAACAoRRACH5BAAKAAAALAAAAAACAAIAgAAA/wAAAAIChFEAOw==',
  ],
] as const) {
  test(`Host image preserves ${mediaType} bytes and validates the actual media type`, async () => {
    const bytes = Buffer.from(base64, 'base64');
    const content = {
      ...item,
      image: {
        ...image,
        mediaType,
        dataBase64: base64,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        totalLength: bytes.length,
      },
    };
    const result = await readHostImage(async () => content, 'item', 0);
    assert.equal(result.mediaType, mediaType);
    assert.deepEqual(result.bytes, bytes);
    const preview = issueHostImageAttachment(
      'formats',
      'item',
      0,
      () => readHostImage(async () => content, 'item', 0),
      mediaType,
    );
    assert.equal(preview.status, 'available');
    if (preview.status !== 'available') throw new Error('missing Host preview');
    try {
      const response = await handleSessionAttachmentProtocolRequest(preview.previewUrl, 'GET');
      assert.equal(response?.headers.get('content-type'), mediaType);
      assert.deepEqual(Buffer.from(await response!.arrayBuffer()), bytes);
    } finally {
      revokeSessionAttachmentPreviews('formats');
    }
    await assert.rejects(
      readHostImage(
        async () => ({
          ...content,
          image: {
            ...content.image,
            mediaType: mediaType === 'image/jpeg' ? 'image/webp' : 'image/jpeg',
          },
        }),
        'item',
        0,
      ),
      /integrity/,
    );
  });
}

test('a Host image whose type Space cannot preview is reported unsupported without a capability', () => {
  const preview = issueHostImageAttachment(
    'formats',
    'item',
    0,
    async () => ({ bytes: png, mediaType: 'image/png' }),
    'image/svg+xml',
  );
  assert.equal(preview.status, 'unsupported');
  assert.equal('previewUrl' in preview, false);
});
