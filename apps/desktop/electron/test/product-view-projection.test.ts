import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { projectProductItems } from '../kodax/runtime/product-view.js';
import {
  handleSessionAttachmentProtocolRequest,
  revokeSessionAttachmentPreviews,
} from '../window/session-attachment-protocol.js';

for (const itemType of ['tool', 'user'] as const) {
  test(`Host ${itemType} images are read lazily by item identity and revoked with the Session`, async () => {
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    );
    let reads = 0;
    const items = await projectProductItems(
      'host-image',
      [
        {
          id: 'opaque-tool',
          type: itemType,
          text: 'image',
          attachments: [
            { kind: 'image', path: 'C:\\outside-clipboard\\evidence.png', mediaType: 'image/png' },
          ],
          ...(itemType === 'tool'
            ? { tool: { callId: 'call', name: 'read', status: 'success' as const } }
            : {}),
        },
      ],
      [],
      async (itemId, options) => {
        reads++;
        assert.equal(itemId, 'opaque-tool');
        assert.equal(options.part, 'attachment');
        assert.equal(options.attachmentIndex, 0);
        return {
          id: itemId,
          text: '',
          offset: 0,
          totalLength: 0,
          image: {
            mediaType: 'image/png',
            dataBase64: bytes.toString('base64'),
            sha256: createHash('sha256').update(bytes).digest('hex'),
            width: 1,
            height: 1,
            offset: 0,
            totalLength: bytes.length,
          },
        };
      },
    );
    assert.equal(reads, 0, 'opening history must not fetch image bodies');
    const image = items[0]!.imageAttachments![0]!;
    assert.equal(image.status, 'available');
    if (image.status !== 'available') throw new Error('missing preview');
    const response = await handleSessionAttachmentProtocolRequest(image.previewUrl, 'GET');
    assert.equal(response?.status, 200);
    assert.deepEqual(Buffer.from(await response!.arrayBuffer()), bytes);
    assert.equal(response?.headers.get('content-type'), 'image/png');
    assert.equal(reads, 1);
    revokeSessionAttachmentPreviews('host-image');
    assert.equal(
      (await handleSessionAttachmentProtocolRequest(image.previewUrl, 'GET'))?.status,
      404,
    );
  });
}

test('Main preserves the official input and output blocks without requiring turn IDs', async () => {
  const items = [
    {
      id: 'input-item',
      type: 'user' as const,
      inputId: 'input',
      text: 'prompt with attachment instructions',
    },
    { id: 'thinking-item', type: 'thinking' as const, outputId: 'output', text: 'reasoning' },
    {
      id: 'text-item',
      type: 'assistant' as const,
      outputId: 'output',
      outputState: 'committed' as const,
      text: 'answer',
    },
  ];
  assert.deepEqual(await projectProductItems('session', items), items);
});

test('SDK image references get safe preview status and reuse capabilities without changing item identity', async () => {
  const items = [
    {
      id: 'image-item',
      type: 'user' as const,
      text: 'inspect',
      attachments: [
        {
          kind: 'image' as const,
          path: 'C:\\missing-sdk-fixture\\image.png',
          mediaType: 'image/png',
        },
      ],
    },
  ];
  const first = await projectProductItems('image-session', items);
  assert.equal(first[0]?.id, 'image-item');
  assert.deepEqual(first[0]?.attachments, items[0]?.attachments);
  assert.equal(first[0]?.imageAttachments?.length, 1);
  assert.notEqual(first[0]?.imageAttachments?.[0]?.status, 'available');
  assert.equal('previewUrl' in first[0]!.imageAttachments![0]!, false);
  const second = await projectProductItems('image-session', items, first);
  assert.deepEqual(second, first);
});

test('beta.7 image observation fields do not re-issue previews on every view update', async () => {
  const items = [
    {
      id: 'observed-image',
      type: 'tool' as const,
      text: 'image',
      tool: { callId: 'call', name: 'read', status: 'success' as const },
      attachments: [
        {
          kind: 'image' as const,
          path: 'C:\\host-media\\observed.png',
          mediaType: 'image/png',
          observationId: 'observation-1',
          width: 1,
          height: 1,
          sha256: 'a'.repeat(64),
        },
      ],
    },
  ];
  const reader = async () => {
    throw new Error('Previews are read lazily.');
  };
  const first = await projectProductItems('observed-session', items, [], reader);
  const second = await projectProductItems('observed-session', items, first, reader);
  assert.deepEqual(second[0]?.imageAttachments, first[0]?.imageAttachments);
});

// Real decodable files: the Host image check decodes with the SDK, so fake bytes are refused.
const JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAC4AoAMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APznr/fA/wArwoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKACgAoAKAP/2Q==';
const GIF_BASE64 =
  'R0lGODlhAgACAPAAAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAACAoRRACH5BAAKAAAALAAAAAACAAIAgAAA/wAAAAIChFEAOw==';

for (const [itemType, mediaType, base64] of [
  ['user', 'image/jpeg', JPEG_BASE64],
  ['tool', 'image/gif', GIF_BASE64],
] as const) {
  test(`a Host ${itemType} ${mediaType} image is previewed in its real format`, async () => {
    const bytes = Buffer.from(base64, 'base64');
    const items = await projectProductItems(
      `format-${itemType}`,
      [
        {
          id: 'format-item',
          type: itemType,
          text: 'image',
          attachments: [{ kind: 'image', path: '/host-only/.media/owner/pinned', mediaType }],
          ...(itemType === 'tool'
            ? { tool: { callId: 'call', name: 'read', status: 'success' as const } }
            : {}),
        },
      ],
      [],
      async (itemId) => ({
        id: itemId,
        text: '',
        offset: 0,
        totalLength: 0,
        image: {
          mediaType,
          dataBase64: base64,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          width: 1,
          height: 1,
          offset: 0,
          totalLength: bytes.length,
        },
      }),
    );
    try {
      const image = items[0]!.imageAttachments![0]!;
      assert.equal(image.status, 'available');
      if (image.status !== 'available') throw new Error('missing preview');
      assert.equal(image.mediaType, mediaType);
      const response = await handleSessionAttachmentProtocolRequest(image.previewUrl, 'GET');
      assert.equal(response?.headers.get('content-type'), mediaType);
      assert.deepEqual(Buffer.from(await response!.arrayBuffer()), bytes);
    } finally {
      revokeSessionAttachmentPreviews(`format-${itemType}`);
    }
  });
}
