import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_PARTNER_REMOTE_TEXT_BYTES,
  partnerRemoteSourceSchema,
} from '@kodax-space/space-ipc-schema';
import { checkReadConnectorDocument, ReadConnectorError } from './read-connector.js';

test('read-only adapter results match the host UTF-8 and title bounds with a safe size error', () => {
  const document = {
    documentId: 'Doc1',
    url: 'wecom://document/Doc1',
    title: 'x'.repeat(280),
    revision: 0,
    content: 'x'.repeat(MAX_PARTNER_REMOTE_TEXT_BYTES),
  };
  const source = {
    ...checkReadConnectorDocument(document),
    id: '11111111-1111-4111-8111-111111111111',
    sessionId: 'session',
    projectRoot: '/project',
    extensionId: 'library',
    connectorId: 'wecom',
    connectionId: '22222222-2222-4222-8222-222222222222',
    contentHash: 'a'.repeat(64),
    readAt: new Date().toISOString(),
  };
  assert.equal(partnerRemoteSourceSchema.safeParse(source).success, true);
  for (const invalid of [
    { ...document, title: 'x'.repeat(281) },
    { ...document, content: 'x'.repeat(MAX_PARTNER_REMOTE_TEXT_BYTES + 1) },
    { ...document, content: '文'.repeat(Math.floor(MAX_PARTNER_REMOTE_TEXT_BYTES / 3) + 1) },
  ]) {
    assert.throws(
      () => checkReadConnectorDocument(invalid),
      (error: unknown) =>
        error instanceof ReadConnectorError && error.code === 'resource_too_large',
    );
  }
  assert.throws(
    () => checkReadConnectorDocument({ ...document, content: 'bad\0text' }),
    /无法验证/,
  );
});
