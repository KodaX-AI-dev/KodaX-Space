import assert from 'node:assert/strict';
import test from 'node:test';
import type { PartnerRemoteRecordsT } from '@kodax-space/space-ipc-schema';
import {
  collectPartnerRemoteResultEntries,
  partnerDetailTargetForRemoteResult,
} from './partnerRemoteResults.js';

const records: PartnerRemoteRecordsT = {
  sources: [],
  proposals: [],
  receipts: [
    {
      id: '785fc824-c17a-48c2-a360-e515028869b5',
      sessionId: 'session-1',
      projectRoot: '/project',
      extensionId: 'kodax.partner-library',
      connectorId: 'feishu-docs',
      connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
      proposalId: '885fc824-c17a-48c2-a360-e515028869b5',
      operation: 'append',
      documentId: 'ExistingDocument',
      url: 'https://test.feishu.cn/docx/ExistingDocument',
      title: '已追加文档',
      revision: 3,
      completedAt: '2026-09-02T09:00:00.000Z',
    },
  ],
  baseTasks: [],
  documentTasks: [
    {
      id: '985fc824-c17a-48c2-a360-e515028869b5',
      sessionId: 'session-1',
      projectRoot: '/project',
      extensionId: 'kodax.partner-library',
      connectorId: 'feishu-docs',
      connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
      connectionRevision: 1,
      provider: 'feishu',
      target: { kind: 'personal-space' },
      requestedTitle: '新建文档',
      status: 'succeeded',
      resourceId: 'NewDocument',
      title: '新建文档',
      canonicalUrl: 'https://test.feishu.cn/docx/NewDocument',
      revision: 1,
      createdAt: '2026-09-02T09:01:00.000Z',
      updatedAt: '2026-09-02T09:02:00.000Z',
    },
    {
      id: 'a85fc824-c17a-48c2-a360-e515028869b5',
      sessionId: 'session-1',
      projectRoot: '/project',
      extensionId: 'kodax.partner-library',
      connectorId: 'feishu-docs',
      connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
      connectionRevision: 1,
      provider: 'feishu',
      target: { kind: 'personal-space' },
      requestedTitle: '失败任务',
      status: 'failed',
      createdAt: '2026-09-02T09:03:00.000Z',
      updatedAt: '2026-09-02T09:04:00.000Z',
      error: 'failed',
    },
  ],
  recordRevision: 4,
};

test('task output details include verified direct documents and historical append receipts', () => {
  const entries = collectPartnerRemoteResultEntries(records);

  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.title]),
    [
      ['documentTask', '新建文档'],
      ['receipt', '已追加文档'],
    ],
  );
  assert.deepEqual(partnerDetailTargetForRemoteResult(entries[0]!), {
    kind: 'browser',
    initialUrl: 'https://test.feishu.cn/docx/NewDocument',
    resourceKey: 'native-document-6:feishu:NewDocument',
    title: '新建文档',
  });
  assert.deepEqual(partnerDetailTargetForRemoteResult(entries[1]!), {
    kind: 'browser',
    initialUrl: 'https://test.feishu.cn/docx/ExistingDocument',
    resourceKey: 'native-document-6:feishu:ExistingDocument',
    title: '已追加文档',
  });
});
