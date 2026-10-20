import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { projectProductItems } from '../kodax/runtime/product-view.js';
import {
  handleSessionAttachmentProtocolRequest,
  revokeSessionAttachmentPreviews,
} from '../window/session-attachment-protocol.js';

test('Host tool images are read lazily by item identity and revoked with the Session', async () => {
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
        type: 'tool',
        text: 'image',
        attachments: [
          { kind: 'image', path: 'C:\\outside-clipboard\\evidence.png', mediaType: 'image/png' },
        ],
        tool: { callId: 'call', name: 'read', status: 'success' },
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
  assert.equal(reads, 1);
  revokeSessionAttachmentPreviews('host-image');
  assert.equal(
    (await handleSessionAttachmentProtocolRequest(image.previewUrl, 'GET'))?.status,
    404,
  );
});

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
