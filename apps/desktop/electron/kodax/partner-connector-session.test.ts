import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { PartnerConnectorSnapshotT } from '@kodax-space/space-ipc-schema';
import { SessionRuntimeStore } from './session-runtime-store.js';

export function connectorFixture(): PartnerConnectorSnapshotT {
  return {
    extensionId: 'kodax.partner-library',
    connectorId: 'feishu',
    connectionId: randomUUID(),
    connectionRevision: 1,
    name: '飞书文档',
    accountLabel: 'Test account',
    documents: [{ url: 'https://example.feishu.cn/docx/AllowedDocument', access: 'read' }],
  };
}

test('runtime sidecar persists, merges and clears scoped connector bindings across restart', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-connectors-runtime-'));
  try {
    const store = new SessionRuntimeStore(directory);
    const connectors = [connectorFixture()];
    assert.equal(await store.set('partner-one', { partnerConnectors: connectors }), true);
    assert.deepEqual(
      (await new SessionRuntimeStore(directory).read('partner-one'))?.partnerConnectors,
      connectors,
    );
    await store.set('partner-one', { model: 'next-model' });
    assert.deepEqual((await store.read('partner-one'))?.partnerConnectors, connectors);
    assert.equal(await store.set('partner-one', { partnerConnectors: [] }), true);
    assert.deepEqual((await store.read('partner-one'))?.partnerConnectors, []);
    assert.equal(await store.read('other-session'), null);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('runtime sidecar accommodates eight bounded scopes together with a maximal expert', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-connectors-cap-'));
  try {
    const store = new SessionRuntimeStore(directory);
    const partnerConnectors = Array.from({ length: 8 }, () => ({
      ...connectorFixture(),
      documents: Array.from({ length: 32 }, (_, i) => ({
        url: `https://${'a'.repeat(240)}.feishu.cn/docx/${String(i).padStart(128, 'b')}`,
        access: 'append' as const,
      })),
    }));
    const partnerExpert = {
      extensionId: 'library',
      extensionVersion: '1.0.0',
      expert: {
        id: 'expert',
        revision: 1,
        name: 'Expert',
        description: '',
        prompt: '知'.repeat(8000),
        starterTasks: Array.from({ length: 4 }, () => '句'.repeat(512)),
      },
    };
    assert.equal(
      await store.set('large-scoped-session', { partnerConnectors, partnerExpert }),
      true,
    );
    const restored = await new SessionRuntimeStore(directory).read('large-scoped-session');
    assert.deepEqual(restored?.partnerConnectors, partnerConnectors);
    assert.deepEqual(restored?.partnerExpert, partnerExpert);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
