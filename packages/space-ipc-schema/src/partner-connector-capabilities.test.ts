import assert from 'node:assert/strict';
import test from 'node:test';
import {
  partnerConnectorSupports,
  projectPartnerConnectorResource,
} from './partner-connector-capabilities.js';

test('connector operations describe implemented handlers, not accepted resource shapes or account grants', () => {
  assert.equal(partnerConnectorSupports('feishu-cli', 'read'), true);
  assert.equal(partnerConnectorSupports('feishu-cli', 'append'), true);
  assert.equal(partnerConnectorSupports('feishu-cli', 'createDocument'), true);
  assert.equal(partnerConnectorSupports('feishu-cli', 'createBase'), true);
  for (const adapter of [
    'wecom-cli',
    'dingtalk-cli',
    'tencent-meeting-cli',
    'notion-mcp',
    'airtable-mcp',
    'atlassian-mcp',
  ] as const) {
    assert.equal(partnerConnectorSupports(adapter, 'read'), true);
    assert.equal(partnerConnectorSupports(adapter, 'append'), false);
    assert.equal(partnerConnectorSupports(adapter, 'createDocument'), false);
    assert.equal(partnerConnectorSupports(adapter, 'createBase'), false);
  }
  for (const adapter of ['slack-mcp', 'zoom-mcp', 'github-api'] as const) {
    assert.equal(partnerConnectorSupports(adapter, 'read'), true);
    assert.equal(partnerConnectorSupports(adapter, 'append'), false);
    assert.equal(partnerConnectorSupports(adapter, 'createDocument'), false);
    assert.equal(partnerConnectorSupports(adapter, 'createBase'), false);
  }
});

test('Feishu documents, Notion pages and Airtable tables keep scope references separate from browser URLs', () => {
  const feishu = 'https://example.feishu.cn/docx/Doc1';
  const notion = 'notion://page/0123456789abcdef0123456789abcdef';
  const airtable = 'airtable://base/app1234567890/table/tbl1234567890';
  assert.deepEqual(projectPartnerConnectorResource(feishu, 'feishu-cli'), {
    adapter: 'feishu-cli',
    kind: 'document',
    canonicalRef: feishu,
    resourceKey: 'feishu-cli:Doc1',
    webUrl: feishu,
  });
  assert.deepEqual(projectPartnerConnectorResource(notion, 'notion-mcp'), {
    adapter: 'notion-mcp',
    kind: 'document',
    canonicalRef: notion,
    resourceKey: 'notion-mcp:0123456789abcdef0123456789abcdef',
  });
  assert.deepEqual(projectPartnerConnectorResource(airtable, 'airtable-mcp'), {
    adapter: 'airtable-mcp',
    kind: 'table',
    canonicalRef: airtable,
    resourceKey: 'airtable-mcp:app1234567890/tbl1234567890',
  });
  for (const ref of [feishu, notion, airtable]) {
    assert.equal(projectPartnerConnectorResource(ref)?.canonicalRef, ref);
  }
});

test('resource projection rejects wrong adapters and never promotes unsupported references to web destinations', () => {
  const notion = 'notion://page/0123456789abcdef0123456789abcdef';
  assert.equal(projectPartnerConnectorResource(notion, 'feishu-cli'), null);
  assert.equal(
    projectPartnerConnectorResource('https://example.feishu.cn/docx/Doc1', 'notion-mcp'),
    null,
  );
  for (const ref of [
    'https://example.feishu.cn.evil.test/docx/Doc1',
    'https://user:password@example.feishu.cn/docx/Doc1',
    'https://example.feishu.cn:444/docx/Doc1',
    'https://example.feishu.cn/docx/Doc1?token=secret',
    'http://example.feishu.cn/docx/Doc1',
    'file:///tmp/document',
    'javascript:alert(1)',
    'https://notion.so/0123456789abcdef0123456789abcdef',
    `${notion}\n`,
    'airtable://base/app1234567890/table/tbl1234567890/records',
  ])
    assert.equal(projectPartnerConnectorResource(ref), null, ref);
});

test('other existing resource kinds remain displayable independently of operational readiness', () => {
  assert.equal(projectPartnerConnectorResource('tmeet://meeting-code/123456')?.kind, 'meeting');
  const slack = projectPartnerConnectorResource(
    'slack://channel/C12345678/message/1234567890.123456',
  );
  assert.equal(slack?.kind, 'message');
  assert.equal(slack?.webUrl, undefined);
  assert.equal(partnerConnectorSupports('slack-mcp', 'read'), true);
  const jira = projectPartnerConnectorResource('https://example.atlassian.net/browse/SPACE-1');
  assert.equal(jira?.kind, 'issue');
  assert.equal(jira?.webUrl, 'https://example.atlassian.net/browse/SPACE-1');
  assert.equal(
    projectPartnerConnectorResource('https://example.atlassian.net/wiki/spaces/SPACE/pages/1')
      ?.kind,
    'document',
  );
});

test('a Confluence space named browse remains a document rather than a Jira issue', () => {
  const page = projectPartnerConnectorResource(
    'https://example.atlassian.net/wiki/spaces/browse/pages/123',
    'atlassian-mcp',
  );
  const issue = projectPartnerConnectorResource(
    'https://example.atlassian.net/browse/PROJ-123',
    'atlassian-mcp',
  );
  assert.equal(page?.kind, 'document');
  assert.equal(issue?.kind, 'issue');
});
