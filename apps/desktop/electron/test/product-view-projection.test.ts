import assert from 'node:assert/strict';
import test from 'node:test';
import { projectProductItems } from '../kodax/runtime/product-view.js';

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
