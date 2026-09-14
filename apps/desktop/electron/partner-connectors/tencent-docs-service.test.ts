import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createTencentDocsConnector } from './tencent-docs-connector.js';
import { PartnerConnectorService, type PartnerConnectorContext } from './service.js';
import { FeishuCli } from './feishu-cli.js';

const documentUrl = 'https://docs.qq.com/doc/IntegrationDocument';
const token = 'test-transport-only-tencent-token';

test('real Tencent adapter reads and creates through shared service dispatch guards with a controlled HTTP boundary', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tencent-docs-service-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dispatched: string[] = [];
  const connector = createTencentDocsConnector({
    credentials: { get: async () => token, set: async () => {}, delete: async () => {} },
    fetchFn: async (url, init) => {
      assert.ok(
        String(url) === 'https://docs.qq.com/openapi/mcp' ||
          String(url) === 'https://docs.qq.com/api/v6/doc/mcp',
      );
      assert.equal(new Headers(init?.headers).get('Authorization'), token);
      const body = JSON.parse(String(init?.body)) as {
        id: number;
        method: string;
        params: { name?: string; arguments?: Record<string, unknown> };
      };
      if (body.method === 'tools/list') {
        const tools = String(url).includes('/api/v6/doc/')
          ? [
              {
                name: 'create_with_markdown',
                inputSchema: {
                  type: 'object',
                  properties: { title: { type: 'string' }, base64_markdown: { type: 'string' } },
                  required: ['base64_markdown'],
                },
              },
            ]
          : ['manage.query_file_info', 'get_content'].map((name) => ({
              name,
              inputSchema: {
                type: 'object',
                properties: { file_id: { type: 'string' } },
                required: ['file_id'],
              },
            }));
        return Response.json({ jsonrpc: '2.0', id: body.id, result: { tools } });
      }
      assert.equal(body.method, 'tools/call');
      dispatched.push(body.params.name!);
      const value =
        body.params.name === 'manage.query_file_info'
          ? {
              file_id: 'IntegrationDocument',
              url: documentUrl,
              title: 'Selected source',
              type: 'doc',
            }
          : body.params.name === 'get_content'
            ? { content: '# Complete source\n\nBody', error: '' }
            : {
                file_id: 'CreatedDocument',
                file_url: 'https://docs.qq.com/doc/CreatedDocument',
                title: 'Created document',
                last_index: 8,
              };
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: { content: [{ type: 'text', text: JSON.stringify(value) }] },
      });
    },
  });
  const service = new PartnerConnectorService(root, {
    cli: new FeishuCli(async () => {
      throw new Error('Feishu must not be called');
    }),
    readConnectors: { 'tencent-docs-mcp': connector },
    catalog: async () => [
      { id: 'tencent-docs', adapter: 'tencent-docs-mcp', name: 'Tencent Docs', description: '' },
    ],
    checkPolicy: async () => {},
  });
  const account = await service.connect({
    extensionId: 'partner.library',
    connectorId: 'tencent-docs',
    profile: 'integration-test',
  });
  const bindings = await service.resolveSelections([
    {
      extensionId: 'partner.library',
      connectorId: 'tencent-docs',
      connectionId: account.id,
      connectionRevision: account.revision,
      adapter: 'tencent-docs-mcp',
      documents: [{ url: documentUrl, access: 'read' }],
      allowCreateDocument: true,
    },
  ]);
  const context: PartnerConnectorContext = {
    surface: 'partner',
    sessionId: 'integration-session',
    projectRoot: '/project',
    permissionMode: 'accept-edits',
    bindings,
    getCurrentBindings: () => bindings,
  };
  const source = await service.read(context, { connectionId: account.id, documentUrl });
  assert.equal(source.content, '# Complete source\n\nBody');
  assert.equal(source.documentId, 'IntegrationDocument');
  const created = await service.createConnectorDocument(context, randomUUID(), {
    connectionId: account.id,
    title: 'Created document',
    content: '# Hello',
  });
  assert.equal(created.status, 'succeeded');
  assert.equal(created.provider, 'tencent-docs');
  assert.equal(created.canonicalUrl, 'https://docs.qq.com/doc/CreatedDocument');
  assert.equal(created.contentVerification, 'unverified');
  assert.deepEqual(dispatched, ['manage.query_file_info', 'get_content', 'create_with_markdown']);
  const records = await service.records(context);
  assert.equal(records.sources.length, 1);
  assert.equal(records.documentTasks.length, 1);
});
