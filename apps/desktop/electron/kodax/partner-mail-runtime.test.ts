import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  createPartnerConnectorRunRuntime,
  type PartnerConnectorRunService,
} from './partner-connector-runtime.js';
import type { PartnerConnectorSnapshotT } from '@kodax-space/space-ipc-schema';
const id = randomUUID();
const binding: PartnerConnectorSnapshotT = {
  extensionId: 'partner.library',
  connectorId: 'qq-mail',
  connectionId: id,
  connectionRevision: 1,
  name: 'QQ',
  accountLabel: 'Test',
  adapter: 'qq-mail-imap',
  documents: [],
  mailbox: 'inbox',
};
const context = {
  sessionId: 'session',
  projectRoot: '/project',
  surface: 'partner' as const,
  permissionMode: 'accept-edits' as const,
  bindings: [binding],
};
const unused = async (): Promise<never> => {
  throw Error('unused');
};
const service: PartnerConnectorRunService = {
  describeBindings: async (bindings) => ({
    connectors: bindings.map((binding) => ({ binding, available: true })),
  }),
  read: unused,
  propose: unused,
  createBase: unused,
};
test('mail search appears only for scoped inbox and invokes narrow search; reads allow canonical inbox messages', async () => {
  let searches = 0;
  let reads = 0;
  const runtime = await createPartnerConnectorRunRuntime(undefined, context, {
    ...service,
    search: async () => {
      searches++;
      return {
        messages: [],
        uidValidity: '99',
        scannedUidRange: { from: 1, to: 5 },
        hasMore: false,
      };
    },
    read: async () => {
      reads++;
      return {
        id: randomUUID(),
        sessionId: 'session',
        projectRoot: '/project',
        extensionId: 'partner.library',
        connectorId: 'qq-mail',
        connectionId: id,
        documentId: 'inbox/99/42',
        url: 'mail://qq/inbox/99/42',
        title: 'Mail',
        content: 'Body',
        contentHash: 'a'.repeat(64),
        revision: 0,
        readAt: new Date().toISOString(),
      };
    },
  });
  assert.ok(runtime!.listRunTools!('mcp').some((t) => t.name === 'partner_connector_search'));
  await runtime!.executeCapability('mcp', 'partner-connectors/search', {
    connectionId: id,
    query: { unreadOnly: true },
  });
  assert.equal(searches, 1);
  await runtime!.executeCapability('mcp', 'partner-connectors/read', {
    connectionId: id,
    documentUrl: 'mail://qq/inbox/99/42',
  });
  assert.equal(reads, 1);
  await assert.rejects(() =>
    runtime!.executeCapability('mcp', 'partner-connectors/read', {
      connectionId: id,
      documentUrl: 'mail://netease/inbox/99/42',
    }),
  );
  assert.equal(reads, 1);
});
test('Tencent creation is per-run capability with selected account and create grant', async () => {
  const docBinding = {
    ...binding,
    adapter: 'tencent-docs-mcp' as const,
    mailbox: undefined,
    allowCreateDocument: true,
  };
  const runtime = await createPartnerConnectorRunRuntime(
    undefined,
    {
      ...context,
      bindings: [docBinding],
      nativeDocumentDelivery: { turnExecutionId: randomUUID() },
    },
    { ...service, createConnectorDocument: unused },
  );
  assert.ok(
    runtime!.listRunTools!('mcp').some((t) => t.name === 'partner_connector_document_create'),
  );
  const plan = await createPartnerConnectorRunRuntime(
    undefined,
    {
      ...context,
      permissionMode: 'plan',
      bindings: [docBinding],
      nativeDocumentDelivery: { turnExecutionId: randomUUID() },
    },
    { ...service, createConnectorDocument: unused },
  );
  assert.equal(
    plan!.listRunTools!('mcp').some((t) => t.name === 'partner_connector_document_create'),
    false,
  );
});
