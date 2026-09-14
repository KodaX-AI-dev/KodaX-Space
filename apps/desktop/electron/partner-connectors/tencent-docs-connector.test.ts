import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  createTencentDocsConnector,
  isTencentDocsAuthorizationUrl,
} from './tencent-docs-connector.js';
import { ReadConnectorError } from './read-connector.js';
import type { CredentialStore } from './remote-mcp-oauth.js';

const token = 'official-test-token-never-a-real-credential';
const profile = 'test-tencent';
const key = `partner-connector-tencent-docs:${profile}`;
const documentUrl = 'https://docs.qq.com/doc/DV2h5cWJ0R1lQb0lH';
const documentId = 'DV2h5cWJ0R1lQb0lH';
const expected = {
  authorityId: 'tencent-docs',
  subjectId: `credential-${createHash('sha256').update(token).digest('hex')}`,
  label: '腾讯文档授权连接',
};
const generalTools = [
  {
    name: 'get_content',
    inputSchema: {
      type: 'object',
      properties: { file_id: { type: 'string' } },
      required: ['file_id'],
    },
  },
  {
    name: 'manage.query_file_info',
    inputSchema: {
      type: 'object',
      properties: { file_id: { type: 'string' } },
      required: ['file_id'],
    },
  },
];
const createTools = [
  {
    name: 'create_with_markdown',
    inputSchema: {
      type: 'object',
      properties: { base64_markdown: { type: 'string' }, title: { type: 'string' } },
      required: ['base64_markdown'],
    },
  },
];
interface Call {
  url: string;
  body?: Record<string, unknown>;
  headers: Headers;
}
function fixture(
  overrides: {
    call?: (call: Call) => Response | Promise<Response> | undefined;
    initial?: boolean;
  } = {},
) {
  const values = new Map<string, string>(overrides.initial === false ? [] : [[key, token]]);
  const calls: Call[] = [];
  const credentials: CredentialStore = {
    get: async (candidate) => values.get(candidate),
    set: async (candidate, value) => {
      values.set(candidate, value);
    },
    delete: async (candidate) => {
      values.delete(candidate);
    },
  };
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    const call = { url, body, headers: new Headers(init?.headers) };
    calls.push(call);
    const custom = await overrides.call?.(call);
    if (custom) return custom;
    if (url.includes('/oauth/v2/mcp/token/get?code='))
      return Response.json({ ret: 0, data: { token } });
    assert.equal(call.headers.get('Authorization'), token);
    if (body?.method === 'tools/list')
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: { tools: url.includes('/api/v6/doc/') ? createTools : generalTools },
      });
    const params = body?.params as { name: string; arguments: Record<string, unknown> };
    const value =
      params.name === 'get_content'
        ? { content: '# Full document\n\nHello', error: '' }
        : params.name === 'manage.query_file_info'
          ? { file_id: documentId, title: 'Project', url: documentUrl, type: 'doc', error: '' }
          : { file_id: documentId, file_url: documentUrl, title: 'New document', last_index: 8 };
    return Response.json({
      jsonrpc: '2.0',
      id: body?.id,
      result: { content: [{ type: 'text', text: JSON.stringify(value) }] },
    });
  };
  return {
    connector: createTencentDocsConnector({ credentials, fetchFn }),
    calls,
    credentials,
    values,
  };
}
const readInput = () => ({
  profile,
  expected,
  documentUrl,
  beforeRead: async () => {},
  assertRead: () => {},
});
const createInput = () => ({
  ...readInput(),
  title: 'New document',
  content: '# Hello',
  beforeDispatch: async () => {},
  assertDispatch: () => {},
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

void test('Tencent Docs accepts only canonical supported document resources and strict auth pages', () => {
  const { connector } = fixture();
  assert.equal(connector.acceptsResource(documentUrl), true);
  for (const invalid of [
    documentUrl + '?token=secret',
    documentUrl + '#a',
    documentUrl.replace('docs.qq.com', 'evil.docs.qq.com'),
    documentUrl.replace('/doc/', '/sheet/'),
    'http://docs.qq.com/doc/x',
    'https://docs.qq.com/doc/a/../b',
  ])
    assert.equal(connector.acceptsResource(invalid), false);
  const url =
    'https://docs.qq.com/scenario/open-claw.html?nlc=1&authType=1&code=0123456789abcdef&mcp_source=desktop';
  assert.equal(isTencentDocsAuthorizationUrl(url), true);
  for (const invalid of [
    url + '&next=https://evil.test',
    url + '&code=0123456789abcdef',
    url.replace('https:', 'http:'),
    url.replace('docs.qq.com', 'docs.qq.com.evil.test'),
  ])
    assert.equal(isTencentDocsAuthorizationUrl(invalid), false);
});

void test('Tencent Docs waits for explicit completion then verifies protected catalog before saving token', async () => {
  const { connector, calls, values } = fixture({ initial: false });
  const confirmation = deferred<{ confirmed: true }>();
  const shown = deferred<string>();
  const controller = new AbortController();
  const run = connector.run({
    profile,
    installCli: false,
    signal: controller.signal,
    requestInput: async (kind) => {
      assert.equal(kind, 'authorization_complete');
      return confirmation.promise;
    },
    onProgress: (event) => {
      if (event.authorizationUrl) shown.resolve(event.authorizationUrl);
    },
  });
  assert.equal(isTencentDocsAuthorizationUrl(await shown.promise), true);
  assert.equal(calls.length, 0);
  assert.equal(values.size, 0);
  confirmation.resolve({ confirmed: true });
  await run;
  assert.equal(values.get(key), token);
  assert.equal(calls[0]?.url.startsWith('https://docs.qq.com/oauth/v2/mcp/token/get?code='), true);
  const status = await connector.inspect(profile);
  assert.deepEqual(status.identity, expected);
});

void test('Tencent Docs cancels while awaiting confirmation without fetching or persisting', async () => {
  const { connector, calls, values } = fixture({ initial: false });
  const shown = deferred<void>();
  const controller = new AbortController();
  const run = connector.run({
    profile,
    installCli: false,
    signal: controller.signal,
    requestInput: async () => new Promise(() => {}),
    onProgress: () => shown.resolve(),
  });
  await shown.promise;
  controller.abort();
  await assert.rejects(
    run,
    (error: unknown) => error instanceof ReadConnectorError && error.code === 'cancelled',
  );
  assert.equal(calls.length, 0);
  assert.equal(values.size, 0);
});

void test('Tencent Docs refuses onboarding without a trusted completion broker', async () => {
  const { connector, calls } = fixture({ initial: false });
  await assert.rejects(
    connector.run({
      profile,
      installCli: false,
      signal: new AbortController().signal,
      onProgress: () => {},
    }),
    ReadConnectorError,
  );
  assert.equal(calls.length, 0);
});

void test('Tencent Docs rejects unverifiable credentials instead of claiming connected', async () => {
  const { connector, values } = fixture({
    initial: false,
    call: (call) =>
      call.body?.method === 'tools/list'
        ? new Response('secret provider error', { status: 401 })
        : undefined,
  });
  await assert.rejects(
    connector.run({
      profile,
      installCli: false,
      signal: new AbortController().signal,
      requestInput: async () => ({ confirmed: true }),
      onProgress: () => {},
    }),
    (error: unknown) => error instanceof ReadConnectorError && !error.message.includes('secret'),
  );
  assert.equal(values.size, 0);
});

void test('Tencent Docs reads a complete typed snapshot through pinned metadata and content tools', async () => {
  const { connector, calls } = fixture();
  const result = await connector.read(readInput());
  assert.deepEqual(result, {
    documentId,
    url: documentUrl,
    title: 'Project',
    revision: 0,
    content: '# Full document\n\nHello',
  });
  const dispatched = calls.filter((call) => call.body?.method === 'tools/call');
  assert.deepEqual(
    dispatched.map((call) => (call.body?.params as { name: string }).name),
    ['manage.query_file_info', 'get_content'],
  );
  for (const call of dispatched)
    assert.deepEqual((call.body?.params as { arguments: unknown }).arguments, {
      file_id: documentId,
    });
});

void test('Tencent Docs stops before content access on identity replacement and beforeRead rejection', async () => {
  const first = fixture();
  await assert.rejects(
    first.connector.read({ ...readInput(), expected: { ...expected, subjectId: 'other' } }),
    (error: unknown) => error instanceof ReadConnectorError && error.code === 'identity_changed',
  );
  assert.equal(
    first.calls.some((call) => call.body?.method === 'tools/call'),
    false,
  );
  const second = fixture();
  await assert.rejects(
    second.connector.read({
      ...readInput(),
      beforeRead: async () => {
        throw new Error('scope revoked');
      },
    }),
    /scope revoked/,
  );
  assert.equal(
    second.calls.some((call) => call.body?.method === 'tools/call'),
    false,
  );
});

void test('Tencent Docs final dispatch guard blocks scope revocation during catalog loading', async () => {
  let allowed = true;
  const { connector, calls } = fixture({
    call: (call) => {
      if (call.body?.method === 'tools/list') allowed = false;
      return undefined;
    },
  });
  await assert.rejects(
    connector.read({
      ...readInput(),
      assertRead: () => {
        if (!allowed) throw new Error('revoked');
      },
    }),
    /revoked/,
  );
  assert.equal(
    calls.some((call) => call.body?.method === 'tools/call'),
    false,
  );
});

void test('Tencent Docs refuses a changed live tool schema before dispatch', async () => {
  const { connector, calls } = fixture({
    call: (call) =>
      call.body?.method === 'tools/list'
        ? Response.json({
            jsonrpc: '2.0',
            id: call.body.id,
            result: {
              tools: [
                {
                  name: 'get_content',
                  inputSchema: {
                    type: 'object',
                    properties: { file_id: { type: 'number' } },
                    required: ['file_id'],
                  },
                },
                generalTools[1],
              ],
            },
          })
        : undefined,
  });
  await assert.rejects(connector.read(readInput()), ReadConnectorError);
  assert.equal(
    calls.some((call) => call.body?.method === 'tools/call'),
    false,
  );
});

void test('Tencent Docs does not turn wrong-resource metadata or oversized content into a snapshot', async () => {
  for (const wrongMetadata of [true, false]) {
    const { connector } = fixture({
      call: (call) => {
        const name = (call.body?.params as { name?: string } | undefined)?.name;
        const value =
          wrongMetadata && name === 'manage.query_file_info'
            ? { file_id: 'different', url: documentUrl, title: 'Wrong', type: 'doc' }
            : !wrongMetadata && name === 'get_content'
              ? { content: 'x'.repeat(128 * 1024 + 1) }
              : undefined;
        return value
          ? Response.json({
              jsonrpc: '2.0',
              id: call.body?.id,
              result: { structuredContent: value },
            })
          : undefined;
      },
    });
    await assert.rejects(connector.read(readInput()), ReadConnectorError);
  }
});

void test('Tencent Docs creates once using in-memory base64 and returns the verified provider URL', async () => {
  const { connector, calls } = fixture();
  const result = await connector.createDocument(createInput());
  assert.deepEqual(result, { status: 'success', documentId, url: documentUrl, revision: 0 });
  const writes = calls.filter((call) => call.body?.method === 'tools/call');
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.url, 'https://docs.qq.com/api/v6/doc/mcp');
  assert.deepEqual(writes[0]?.body?.params, {
    name: 'create_with_markdown',
    arguments: {
      title: 'New document',
      base64_markdown: Buffer.from('# Hello').toString('base64'),
    },
  });
});

void test('Tencent Docs never dispatches a create after a rejected write guard', async () => {
  const { connector, calls } = fixture();
  await assert.rejects(
    connector.createDocument({
      ...createInput(),
      beforeDispatch: async () => {
        throw new Error('write revoked');
      },
    }),
    /write revoked/,
  );
  assert.equal(
    calls.some((call) => call.body?.method === 'tools/call'),
    false,
  );
});

void test('Tencent Docs treats dropped response or bad receipt after create dispatch as unknown, without retry', async () => {
  for (const badReceipt of [false, true]) {
    const { connector, calls } = fixture({
      call: (call) => {
        if (call.body?.method !== 'tools/call') return undefined;
        if (!badReceipt) throw new Error('network-secret');
        return Response.json({
          jsonrpc: '2.0',
          id: call.body.id,
          result: {
            structuredContent: {
              file_id: documentId,
              file_url: 'https://evil.test/stolen',
              title: 'New document',
            },
          },
        });
      },
    });
    assert.deepEqual(await connector.createDocument(createInput()), { status: 'unknown' });
    assert.equal(calls.filter((call) => call.body?.method === 'tools/call').length, 1);
  }
});

void test('Tencent Docs disconnect deletes credential and verifies deletion', async () => {
  const { connector, values, credentials } = fixture();
  await connector.disconnect(profile);
  assert.equal(values.size, 0);
  assert.equal((await connector.inspect(profile)).identity, undefined);
  const retained = createTencentDocsConnector({
    credentials: { ...credentials, get: async () => token, delete: async () => {} },
  });
  await assert.rejects(retained.disconnect(profile), ReadConnectorError);
});

void test('Tencent Docs ignores a token response arriving after cancellation', async () => {
  const response = deferred<Response>();
  const called = deferred<void>();
  const { connector, values, calls } = fixture({
    initial: false,
    call: (call) => {
      if (call.url.includes('/oauth/v2/')) {
        called.resolve();
        return response.promise;
      }
      return undefined;
    },
  });
  const controller = new AbortController();
  const run = connector.run({
    profile,
    installCli: false,
    signal: controller.signal,
    requestInput: async () => ({ confirmed: true }),
    onProgress: () => {},
  });
  await called.promise;
  controller.abort();
  response.resolve(Response.json({ ret: 0, data: { token } }));
  await assert.rejects(
    run,
    (error: unknown) => error instanceof ReadConnectorError && error.code === 'cancelled',
  );
  assert.equal(values.size, 0);
  assert.equal(calls.length, 1);
});

void test('Tencent Docs waits for another explicit completion if provider reports not authorized', async () => {
  let attempts = 0;
  let confirmations = 0;
  const { connector } = fixture({
    initial: false,
    call: (call) =>
      call.url.includes('/oauth/v2/') && ++attempts === 1
        ? Response.json({ ret: 11510 })
        : undefined,
  });
  await connector.run({
    profile,
    installCli: false,
    signal: new AbortController().signal,
    requestInput: async () => {
      confirmations += 1;
      return { confirmed: true };
    },
    onProgress: () => {},
  });
  assert.equal(attempts, 2);
  assert.equal(confirmations, 2);
});

void test('Tencent Docs removes newly persisted credentials when cancelled during keychain write', async () => {
  const { credentials, values } = fixture({ initial: false });
  const saving = deferred<void>();
  const saved = deferred<void>();
  const connector = createTencentDocsConnector({
    credentials: {
      ...credentials,
      set: async (candidate, value) => {
        saving.resolve();
        await saved.promise;
        await credentials.set(candidate, value);
      },
    },
    fetchFn: async (input, init) => {
      if (String(input).includes('/oauth/v2/')) return Response.json({ ret: 0, data: { token } });
      const body = JSON.parse(String(init?.body)) as { id: number };
      return Response.json({ jsonrpc: '2.0', id: body.id, result: { tools: generalTools } });
    },
  });
  const controller = new AbortController();
  const run = connector.run({
    profile,
    installCli: false,
    signal: controller.signal,
    requestInput: async () => ({ confirmed: true }),
    onProgress: () => {},
  });
  await saving.promise;
  controller.abort();
  saved.resolve();
  await assert.rejects(run, ReadConnectorError);
  assert.equal(values.size, 0);
});

void test('Tencent Docs caps undeclared streaming bodies and rejects partial content', async () => {
  for (const large of [false, true]) {
    const { connector } = fixture({
      call: (call) => {
        const name = (call.body?.params as { name?: string } | undefined)?.name;
        if (name !== 'get_content') return undefined;
        if (large)
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(1024 * 1024 + 1));
                controller.close();
              },
            }),
          );
        return Response.json({
          jsonrpc: '2.0',
          id: call.body?.id,
          result: { structuredContent: { content: 'Only a page', next_token: 'next' } },
        });
      },
    });
    await assert.rejects(connector.read(readInput()), ReadConnectorError);
  }
});

void test('Tencent Docs disconnect waits for an in-flight credential write to finish and be cleaned', async () => {
  const values = new Map<string, string>();
  const saving = deferred<void>();
  const saved = deferred<void>();
  const connector = createTencentDocsConnector({
    credentials: {
      get: async (candidate) => values.get(candidate),
      delete: async (candidate) => {
        values.delete(candidate);
      },
      set: async (candidate, value) => {
        saving.resolve();
        await saved.promise;
        values.set(candidate, value);
      },
    },
    fetchFn: async (input, init) =>
      String(input).includes('/oauth/v2/')
        ? Response.json({ ret: 0, data: { token } })
        : Response.json({
            jsonrpc: '2.0',
            id: (JSON.parse(String(init?.body)) as { id: number }).id,
            result: { tools: generalTools },
          }),
  });
  const run = connector.run({
    profile,
    installCli: false,
    signal: new AbortController().signal,
    requestInput: async () => ({ confirmed: true }),
    onProgress: () => {},
  });
  const failed = assert.rejects(run, ReadConnectorError);
  await saving.promise;
  const disconnected = connector.disconnect(profile);
  const outcome = await Promise.race([
    disconnected.then(() => 'resolved'),
    new Promise<string>((resolve) => setImmediate(() => resolve('pending'))),
  ]);
  saved.resolve();
  await disconnected;
  await failed;
  assert.equal(outcome, 'pending');
  assert.equal(values.size, 0);
});

void test('Tencent Docs never exposes credential-backend failures as provider details', async () => {
  const connector = createTencentDocsConnector({
    credentials: {
      get: async () => {
        throw new Error('private backend detail');
      },
      set: async () => {},
      delete: async () => {},
    },
  });
  await assert.rejects(
    connector.read(readInput()),
    (error: unknown) => error instanceof ReadConnectorError && !error.message.includes('private'),
  );
  await assert.rejects(
    connector.disconnect(profile),
    (error: unknown) => error instanceof ReadConnectorError && !error.message.includes('private'),
  );
});

void test('Tencent Docs does not trust an error result, foreign JSON-RPC id or redirected response', async () => {
  for (const mode of ['error', 'id', 'redirect']) {
    const { connector } = fixture({
      call: (call) => {
        if (call.body?.method !== 'tools/call') return undefined;
        const response =
          mode === 'error'
            ? Response.json({
                jsonrpc: '2.0',
                id: 1,
                result: {
                  isError: true,
                  content: [{ type: 'text', text: 'private provider failure' }],
                },
              })
            : Response.json({
                jsonrpc: '2.0',
                id: mode === 'id' ? 2 : 1,
                result: {
                  structuredContent: {
                    file_id: documentId,
                    url: documentUrl,
                    type: 'doc',
                    title: 'Private',
                  },
                },
              });
        if (mode === 'redirect') Object.defineProperty(response, 'redirected', { value: true });
        return response;
      },
    });
    await assert.rejects(
      connector.read(readInput()),
      (error: unknown) => error instanceof ReadConnectorError && !error.message.includes('private'),
    );
  }
});
