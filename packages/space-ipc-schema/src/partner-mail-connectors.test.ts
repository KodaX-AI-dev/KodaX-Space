import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  partnerConnectorSelectionSchema,
  partnerReadResourceSchema,
  partnerConnectorResourceKey,
} from './channels/partner-connector.js';
import {
  projectPartnerConnectorResource,
  partnerConnectorSupports,
} from './partner-connector-capabilities.js';
const base = {
  extensionId: 'partner-library',
  connectorId: 'qq-mail',
  connectionId: '11111111-1111-4111-8111-111111111111',
  connectionRevision: 1,
  adapter: 'qq-mail-imap',
  documents: [],
  mailbox: 'inbox',
};
test('mail scope is provider-bound and message references cannot become web URLs', () => {
  assert.equal(partnerConnectorSelectionSchema.safeParse(base).success, true);
  const ref = 'mail://qq/inbox/99/42';
  assert.equal(partnerReadResourceSchema.safeParse(ref).success, true);
  assert.equal(partnerConnectorResourceKey('qq-mail-imap', ref), 'inbox/99/42');
  assert.equal(projectPartnerConnectorResource(ref)?.webUrl, undefined);
  assert.equal(projectPartnerConnectorResource(ref)?.kind, 'message');
  for (const url of [
    'mail://qq/inbox/0/42',
    'mail://qq/inbox/99/0',
    ref + '?x=1',
    'mail://qq/../inbox/99/42',
    'mail://netease/inbox/99/42',
  ]) {
    assert.equal(
      partnerConnectorSelectionSchema.safeParse({ ...base, documents: [{ url, access: 'read' }] })
        .success,
      false,
      url,
    );
  }
  assert.equal(
    partnerConnectorSelectionSchema.safeParse({ ...base, adapter: 'notion-mcp' }).success,
    false,
  );
  assert.equal(
    partnerConnectorSelectionSchema.safeParse({ ...base, allowCreateDocument: true }).success,
    false,
  );
});
test('Tencent selected document and explicit create scope are distinct from Feishu folders', () => {
  const selection = {
    ...base,
    connectorId: 'tencent-docs',
    adapter: 'tencent-docs-mcp',
    mailbox: undefined,
    allowCreateDocument: true,
    documents: [{ url: 'https://docs.qq.com/doc/Abcd_123', access: 'read' }],
  };
  assert.equal(partnerConnectorSelectionSchema.safeParse(selection).success, true);
  assert.equal(
    partnerConnectorSelectionSchema.safeParse({
      ...selection,
      createFolderUrl: 'https://a.feishu.cn/drive/folder/abc',
    }).success,
    false,
  );
  assert.equal(partnerConnectorSupports('tencent-docs-mcp', 'createDocument'), true);
  assert.equal(partnerConnectorSupports('qq-mail-imap', 'search'), true);
});
