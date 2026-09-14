import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  PartnerNativeDocumentProviderT,
  PartnerNativeDocumentTaskSummaryT,
} from '@kodax-space/space-ipc-schema';
import {
  createPartnerNativeDocumentTracker,
  partnerDetailTargetForNativeDocument,
  partnerNativeDocumentResourceKey,
  projectPartnerNativeDocumentUpdate,
} from './partnerNativeDocumentAutoOpen.js';

function task(
  id: string,
  status: PartnerNativeDocumentTaskSummaryT['status'],
  provider: PartnerNativeDocumentProviderT = 'feishu',
  canonicalUrl = `https://documents.example/${provider}/${id}`,
): PartnerNativeDocumentTaskSummaryT {
  const outputs = { resourceId: id, canonicalUrl };
  return {
    id: '785fc824-c17a-48c2-a360-e515028869b5',
    sessionId: 'session-1',
    projectRoot: '/project',
    extensionId: 'kodax.partner-library',
    connectorId: 'documents',
    connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
    connectionRevision: 1,
    provider,
    target: { kind: 'personal-space' },
    requestedTitle: '周报',
    status,
    ...(status === 'succeeded' ? { ...outputs, title: '周报', revision: 2 } : {}),
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:01.000Z',
  };
}

test('historical native documents never reopen during initial hydration', () => {
  const result = projectPartnerNativeDocumentUpdate(
    createPartnerNativeDocumentTracker('project/session'),
    true,
    [task('OldDoc', 'succeeded')],
  );
  assert.equal(result.event, null);
  assert.equal(result.tracker.initialized, true);
});

test('only a newly signalled succeeded task opens its verified provider URL once', () => {
  let result = projectPartnerNativeDocumentUpdate(
    createPartnerNativeDocumentTracker('project/session'),
    true,
    [],
  );
  const preparing = task('NewDoc', 'preparing');
  result = projectPartnerNativeDocumentUpdate(result.tracker, true, [preparing], {
    id: preparing.id,
    revision: 1,
  });
  assert.equal(result.event, null);

  const succeeded = task('NewDoc', 'succeeded', 'feishu', 'https://test.feishu.cn/docx/NewDoc');
  result = projectPartnerNativeDocumentUpdate(result.tracker, true, [succeeded], {
    id: succeeded.id,
    revision: 2,
  });
  assert.deepEqual(result.event, { kind: 'native-document', task: succeeded });
  assert.deepEqual(partnerDetailTargetForNativeDocument(result.event!), {
    kind: 'browser',
    initialUrl: 'https://test.feishu.cn/docx/NewDoc',
    resourceKey: 'native-document-6:feishu:NewDoc',
    title: '周报',
  });

  result = projectPartnerNativeDocumentUpdate(result.tracker, true, [succeeded], {
    id: succeeded.id,
    revision: 3,
  });
  assert.equal(result.event, null);
});

test('the same opener contract accepts current and future provider canonical URLs', () => {
  for (const [provider, id, url] of [
    ['dingtalk', 'Node123', 'https://alidocs.dingtalk.com/i/nodes/Node123'],
    ['tencent-docs', 'DRExample123', 'https://docs.qq.com/doc/DRExample123'],
    ['future-office', 'Future123', 'https://docs.future-office.example/document/Future123'],
  ] as const) {
    const current = task(id, 'succeeded', provider, url);
    const result = projectPartnerNativeDocumentUpdate(
      createPartnerNativeDocumentTracker('project/session'),
      true,
      [current],
      { id: current.id, revision: 1 },
    );
    const target = partnerDetailTargetForNativeDocument(result.event!);
    assert.equal(target.kind, 'browser');
    assert.equal(target.kind === 'browser' ? target.initialUrl : undefined, url);
  }
});

test('a trusted create receipt still opens when content verification is non-blocking', () => {
  const created = {
    ...task('NeedsReview', 'succeeded', 'feishu', 'https://test.feishu.cn/docx/NeedsReview'),
    contentVerification: 'unverified' as const,
    verificationWarning: '文档已创建，内容回读暂未完成',
  };
  const result = projectPartnerNativeDocumentUpdate(
    createPartnerNativeDocumentTracker('project/session'),
    true,
    [created],
    { id: created.id, revision: 1 },
  );

  assert.deepEqual(result.event, { kind: 'native-document', task: created });
  assert.equal(partnerDetailTargetForNativeDocument(result.event!).kind, 'browser');
});

test('provider and resource boundaries cannot collide in a generic resource key', () => {
  assert.notEqual(
    partnerNativeDocumentResourceKey('future-office', 'document-1'),
    partnerNativeDocumentResourceKey('future', 'office-document-1'),
  );
});
