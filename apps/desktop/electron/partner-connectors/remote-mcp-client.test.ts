import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRemoteMcpClient,
  defineRemoteMcpProvider,
  REMOTE_MCP_MAX_RESULT_BYTES,
  RemoteMcpClientError,
  type RemoteMcpManagerFactory,
} from './remote-mcp-client.js';

const { createMcpCapabilityId } = await import('@kodax-ai/kodax/mcp');

const provider = defineRemoteMcpProvider({
  serverId: 'notion',
  endpoint: 'https://mcp.notion.test/mcp',
  allowedHosts: ['mcp.notion.test'],
  readTools: {
    fetch_page: {
      inputSchema: {
        type: 'object',
        properties: { pageId: { type: 'string' } },
        required: ['pageId'],
        additionalProperties: false,
      },
    },
  },
});

const descriptor = (name = 'fetch_page') => ({
  id: createMcpCapabilityId('notion', 'tool', name),
  serverId: 'notion',
  kind: 'tool' as const,
  name,
  summary: 'Untrusted server description',
  cachedAt: '2026-09-02T00:00:00.000Z',
  inputSchema: {
    type: 'object',
    properties: { pageId: { type: 'string', description: 'Page id' } },
    required: ['pageId'],
    additionalProperties: false,
  },
});

const readyLogs = () => ({ serverId: 'notion', status: 'ready' as const });

test('reads SDK text content blocks without accepting binary content as document text', async () => {
  let withImage = false;
  const client = createRemoteMcpClient({
    provider,
    bearerToken: 'test-token',
    cacheDir: '/tmp/kodax-space/notion-text-blocks',
    managerFactory: () => ({
      getServerLogs: readyLogs,
      async listTools() {
        return { serverId: 'notion', tools: [descriptor()] };
      },
      async execute() {
        return {
          kind: 'tool',
          content: withImage
            ? [{ type: 'image', data: 'YQ==', mimeType: 'image/png' }]
            : [
                { type: 'text', text: 'First paragraph' },
                { type: 'text', text: 'Second paragraph' },
              ],
        };
      },
      async dispose() {},
    }),
  });
  assert.deepEqual(await client.executeFixed('fetch_page', { pageId: 'p1' }), {
    content: 'First paragraph\nSecond paragraph',
  });
  withImage = true;
  await assert.rejects(
    client.executeFixed('fetch_page', { pageId: 'p1' }),
    (error: unknown) => error instanceof RemoteMcpClientError && error.code === 'invalid_result',
  );
});

test('executes only the provider-declared tool with a fixed endpoint and isolated cache', async () => {
  const calls: Array<{ id: string; input: Record<string, unknown> }> = [];
  let factoryInput: Parameters<RemoteMcpManagerFactory> | undefined;
  let disposed = 0;
  const managerFactory: RemoteMcpManagerFactory = (servers, options) => {
    factoryInput = [servers, options];
    return {
      getServerLogs: readyLogs,
      async listTools() {
        return { serverId: 'notion', tools: [descriptor()] };
      },
      async execute(id, input) {
        calls.push({ id, input });
        return { kind: 'tool', content: 'page body', structuredContent: { id: 'p1' } };
      },
      async dispose() {
        disposed += 1;
      },
    };
  };

  const client = createRemoteMcpClient({
    provider,
    bearerToken: 'secret-token',
    cacheDir: '/tmp/kodax-space/notion-profile',
    managerFactory,
  });
  const result = await client.executeFixed('fetch_page', { pageId: 'p1' });

  assert.deepEqual(result, { content: 'page body', structuredContent: { id: 'p1' } });
  assert.deepEqual(calls, [
    { id: createMcpCapabilityId('notion', 'tool', 'fetch_page'), input: { pageId: 'p1' } },
  ]);
  assert.deepEqual(factoryInput, [
    {
      notion: {
        type: 'streamable-http',
        url: 'https://mcp.notion.test/mcp',
        headers: { Authorization: 'Bearer secret-token' },
        connect: 'lazy',
      },
    },
    { cacheDir: '/tmp/kodax-space/notion-profile' },
  ]);
  assert.equal(disposed, 1);
});

test('fails closed when the live tool schema adds an undeclared input constraint', async () => {
  const managerFactory: RemoteMcpManagerFactory = () => ({
    getServerLogs: readyLogs,
    async listTools() {
      return {
        serverId: 'notion',
        tools: [
          { ...descriptor(), inputSchema: { ...descriptor().inputSchema, minProperties: 2 } },
        ],
      };
    },
    async execute() {
      throw new Error('must not execute');
    },
    async dispose() {},
  });
  const client = createRemoteMcpClient({
    provider,
    bearerToken: 'token',
    cacheDir: '/tmp/kodax-space/notion-profile',
    managerFactory,
  });

  await assert.rejects(
    client.list(),
    (error: unknown) => error instanceof RemoteMcpClientError && error.code === 'catalog_mismatch',
  );
});

test('fails closed when forced tool discovery falls back to a cached catalog', async () => {
  let executed = 0;
  const managerFactory: RemoteMcpManagerFactory = () => ({
    async listTools() {
      return { serverId: 'notion', tools: [descriptor()] };
    },
    getServerLogs() {
      return {
        serverId: 'notion',
        status: 'error',
        lastError: 'DO_NOT_LEAK_REFRESH_FAILURE',
      };
    },
    async execute() {
      executed += 1;
      return { kind: 'tool', content: 'must not execute' };
    },
    async dispose() {},
  });
  const client = createRemoteMcpClient({
    provider,
    bearerToken: 'token',
    cacheDir: '/tmp/kodax-space/notion-profile',
    managerFactory,
  });

  await assert.rejects(client.executeFixed('fetch_page', { pageId: 'p1' }), (error: unknown) => {
    assert.ok(error instanceof RemoteMcpClientError);
    assert.equal(error.code, 'catalog_mismatch');
    assert.doesNotMatch(error.message, /DO_NOT_LEAK/u);
    return true;
  });
  assert.equal(executed, 0);
});

test('rejects non-JSON structured results instead of silently dropping fields', async () => {
  const managerFactory: RemoteMcpManagerFactory = () => ({
    getServerLogs: readyLogs,
    async listTools() {
      return { serverId: 'notion', tools: [descriptor()] };
    },
    async execute() {
      return { kind: 'tool', structuredContent: { unsafe: undefined } };
    },
    async dispose() {},
  });
  const client = createRemoteMcpClient({
    provider,
    bearerToken: 'token',
    cacheDir: '/tmp/kodax-space/notion-profile',
    managerFactory,
  });

  await assert.rejects(
    client.executeFixed('fetch_page', { pageId: 'p1' }),
    (error: unknown) => error instanceof RemoteMcpClientError && error.code === 'invalid_result',
  );
});

test('rejects MCP tool errors without accepting or exposing provider content', async () => {
  const managerFactory: RemoteMcpManagerFactory = () => ({
    getServerLogs: readyLogs,
    async listTools() {
      return { serverId: 'notion', tools: [descriptor()] };
    },
    async execute() {
      return {
        kind: 'tool',
        content: 'DO_NOT_LEAK_PROVIDER_ERROR',
        metadata: { isError: true },
      };
    },
    async dispose() {},
  });
  const client = createRemoteMcpClient({
    provider,
    bearerToken: 'token',
    cacheDir: '/tmp/kodax-space/notion-profile',
    managerFactory,
  });

  await assert.rejects(client.executeFixed('fetch_page', { pageId: 'p1' }), (error: unknown) => {
    assert.ok(error instanceof RemoteMcpClientError);
    assert.equal(error.code, 'invalid_result');
    assert.doesNotMatch(error.message, /DO_NOT_LEAK/u);
    return true;
  });
});

test('list and describe expose only declared read tools while extra write tools remain unreachable', async () => {
  const executed: string[] = [];
  let created = 0;
  let disposed = 0;
  const managerFactory: RemoteMcpManagerFactory = () => {
    created += 1;
    return {
      getServerLogs: readyLogs,
      async listTools() {
        return {
          serverId: 'notion',
          tools: [descriptor(), descriptor('delete_everything')],
        };
      },
      async execute(id) {
        executed.push(id);
        return { kind: 'tool', content: 'ok' };
      },
      async dispose() {
        disposed += 1;
      },
    };
  };
  const client = createRemoteMcpClient({
    provider,
    bearerToken: 'token',
    cacheDir: '/tmp/kodax-space/notion-profile',
    managerFactory,
  });

  assert.deepEqual(await client.list(), [
    { name: 'fetch_page', inputSchema: provider.readTools.fetch_page.inputSchema },
  ]);
  assert.deepEqual(await client.describe('fetch_page'), {
    name: 'fetch_page',
    inputSchema: provider.readTools.fetch_page.inputSchema,
  });
  await assert.rejects(
    client.executeFixed('delete_everything' as 'fetch_page', {}),
    (error: unknown) => error instanceof RemoteMcpClientError && error.code === 'tool_not_allowed',
  );
  assert.deepEqual(executed, []);
  assert.equal(created, 3);
  assert.equal(disposed, 3);
});

test('missing, renamed, duplicate, and incompatible declared tools all fail closed', async () => {
  const catalogs = [
    [],
    [descriptor('renamed_fetch')],
    [descriptor(), descriptor()],
    [
      {
        ...descriptor(),
        inputSchema: {
          ...descriptor().inputSchema,
          properties: { pageId: { type: 'number' } },
        },
      },
    ],
  ];
  let disposed = 0;
  for (const tools of catalogs) {
    const managerFactory: RemoteMcpManagerFactory = () => ({
      getServerLogs: readyLogs,
      async listTools() {
        return { serverId: 'notion', tools };
      },
      async execute() {
        throw new Error('must not execute');
      },
      async dispose() {
        disposed += 1;
      },
    });
    const client = createRemoteMcpClient({
      provider,
      bearerToken: 'token',
      cacheDir: '/tmp/kodax-space/notion-profile',
      managerFactory,
    });
    await assert.rejects(
      client.list(),
      (error: unknown) =>
        error instanceof RemoteMcpClientError && error.code === 'catalog_mismatch',
    );
  }
  assert.equal(disposed, catalogs.length);
});

test('rejects wrong or undeclared inputs before provider execution', async () => {
  let executed = 0;
  const managerFactory: RemoteMcpManagerFactory = () => ({
    getServerLogs: readyLogs,
    async listTools() {
      return { serverId: 'notion', tools: [descriptor()] };
    },
    async execute() {
      executed += 1;
      return { kind: 'tool', content: 'must not happen' };
    },
    async dispose() {},
  });
  const client = createRemoteMcpClient({
    provider,
    bearerToken: 'token',
    cacheDir: '/tmp/kodax-space/notion-profile',
    managerFactory,
  });

  for (const input of [{}, { pageId: 42 }, { pageId: 'p1', command: 'delete' }])
    await assert.rejects(
      client.executeFixed('fetch_page', input),
      (error: unknown) => error instanceof RemoteMcpClientError && error.code === 'invalid_input',
    );
  assert.equal(executed, 0);
});

test('rejects combined content and structured results above the fixed byte bound', async () => {
  const results = [
    { kind: 'tool' as const, content: 'x'.repeat(REMOTE_MCP_MAX_RESULT_BYTES + 1) },
    {
      kind: 'tool' as const,
      structuredContent: { value: 'x'.repeat(REMOTE_MCP_MAX_RESULT_BYTES) },
    },
  ];
  let invocation = 0;
  let disposed = 0;
  const managerFactory: RemoteMcpManagerFactory = () => ({
    getServerLogs: readyLogs,
    async listTools() {
      return { serverId: 'notion', tools: [descriptor()] };
    },
    async execute() {
      return results[invocation++]!;
    },
    async dispose() {
      disposed += 1;
    },
  });
  const client = createRemoteMcpClient({
    provider,
    bearerToken: 'token',
    cacheDir: '/tmp/kodax-space/notion-profile',
    managerFactory,
  });

  for (const pageId of ['p1', 'p2'])
    await assert.rejects(
      client.executeFixed('fetch_page', { pageId }),
      (error: unknown) =>
        error instanceof RemoteMcpClientError && error.code === 'result_too_large',
    );
  assert.equal(disposed, 2);
});

test('runs the guard immediately before dispatch and withholds a result revoked in flight', async () => {
  let finish: ((result: { kind: 'tool'; content: string }) => void) | undefined;
  let announceDispatch: (() => void) | undefined;
  const pendingResult = new Promise<{ kind: 'tool'; content: string }>((resolve) => {
    finish = resolve;
  });
  const dispatchStarted = new Promise<void>((resolve) => {
    announceDispatch = resolve;
  });
  let allowed = true;
  let guarded = 0;
  let asserted = 0;
  let disposed = 0;
  const managerFactory: RemoteMcpManagerFactory = () => ({
    getServerLogs: readyLogs,
    async listTools() {
      return { serverId: 'notion', tools: [descriptor()] };
    },
    async execute() {
      announceDispatch?.();
      return pendingResult;
    },
    async dispose() {
      disposed += 1;
    },
  });
  const client = createRemoteMcpClient({
    provider,
    bearerToken: 'token',
    cacheDir: '/tmp/kodax-space/notion-profile',
    managerFactory,
  });
  const request = client.executeFixed(
    'fetch_page',
    { pageId: 'p1' },
    {
      beforeDispatch: async () => {
        guarded += 1;
      },
      assertAllowed: () => {
        asserted += 1;
        if (!allowed) throw new Error('revoked');
      },
    },
  );

  await dispatchStarted;
  allowed = false;
  finish?.({ kind: 'tool', content: 'secret result' });
  await assert.rejects(request, /revoked/u);
  assert.equal(guarded, 1);
  assert.equal(asserted, 2);
  assert.equal(disposed, 1);
});

test('validates HTTPS host allowlists, bearer headers, and absolute cache paths before creating a manager', () => {
  const readTools = provider.readTools;
  for (const definition of [
    {
      serverId: 'notion',
      endpoint: 'http://mcp.notion.test/mcp',
      allowedHosts: ['mcp.notion.test'],
      readTools,
    },
    {
      serverId: 'notion',
      endpoint: 'https://mcp.notion.test.evil.example/mcp',
      allowedHosts: ['mcp.notion.test'],
      readTools,
    },
  ])
    assert.throws(
      () => defineRemoteMcpProvider(definition),
      (error: unknown) =>
        error instanceof RemoteMcpClientError && error.code === 'invalid_configuration',
    );

  for (const invalid of [
    { bearerToken: 'token\r\nInjected: yes', cacheDir: '/tmp/profile' },
    { bearerToken: 'token', cacheDir: 'relative/profile' },
  ])
    assert.throws(
      () => createRemoteMcpClient({ provider, ...invalid }),
      (error: unknown) =>
        error instanceof RemoteMcpClientError && error.code === 'invalid_configuration',
    );
});

test('disposes the isolated manager when live tool discovery itself fails', async () => {
  let disposed = 0;
  const client = createRemoteMcpClient({
    provider,
    bearerToken: 'token',
    cacheDir: '/tmp/kodax-space/notion-profile',
    managerFactory: () => ({
      getServerLogs: readyLogs,
      async listTools() {
        throw new Error('network failed');
      },
      async execute() {
        throw new Error('must not execute');
      },
      async dispose() {
        disposed += 1;
      },
    }),
  });

  await assert.rejects(client.list(), /network failed/u);
  assert.equal(disposed, 1);
});

test('provider definitions snapshot and freeze trusted endpoint and tool contracts', () => {
  const draft = {
    serverId: 'fixed-provider',
    endpoint: 'https://mcp.fixed.test/mcp',
    allowedHosts: ['mcp.fixed.test'],
    readTools: {
      read: {
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
  };
  const fixed = defineRemoteMcpProvider(draft);

  draft.endpoint = 'https://mcp.fixed.test/changed';
  draft.allowedHosts[0] = 'evil.example';
  draft.readTools.read.inputSchema.properties.id.type = 'number';

  assert.equal(fixed.endpoint, 'https://mcp.fixed.test/mcp');
  assert.deepEqual(fixed.allowedHosts, ['mcp.fixed.test']);
  assert.deepEqual(fixed.readTools.read.inputSchema, {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
    additionalProperties: false,
  });
  assert.equal(Object.isFrozen(fixed), true);
  assert.equal(Object.isFrozen(fixed.readTools.read.inputSchema), true);
});
