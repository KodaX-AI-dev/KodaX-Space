import { ReadConnectorError } from './read-connector.js';

const GENERAL_ENDPOINT = 'https://docs.qq.com/openapi/mcp';
const DOC_ENDPOINT = 'https://docs.qq.com/api/v6/doc/mcp';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
type JsonRecord = Record<string, unknown>;
type Tool = 'manage.query_file_info' | 'get_content' | 'create_with_markdown';
interface DispatchGuard {
  beforeDispatch: () => Promise<void>;
  assertDispatch: () => void;
}
const tools: Record<
  Tool,
  { endpoint: string; fields: readonly string[]; required: readonly string[] }
> = {
  'manage.query_file_info': {
    endpoint: GENERAL_ENDPOINT,
    fields: ['file_id'],
    required: ['file_id'],
  },
  get_content: { endpoint: GENERAL_ENDPOINT, fields: ['file_id'], required: ['file_id'] },
  create_with_markdown: {
    endpoint: DOC_ENDPOINT,
    fields: ['base64_markdown', 'title'],
    required: ['base64_markdown'],
  },
};

export function tencentDocsObject(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReadConnectorError('invalid_response');
  return value as JsonRecord;
}

export function tencentDocsText(value: unknown, maximum = 280): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new ReadConnectorError('invalid_response');
  return value;
}

export function tencentDocsToken(value: unknown): string {
  const token = tencentDocsText(value, 32768);
  if (/\s/u.test(token)) throw new ReadConnectorError('invalid_response');
  return token;
}

/** Bounded streaming prevents an untrusted server body from growing host memory without limit. */
export async function readTencentDocsJson(response: Response): Promise<JsonRecord> {
  if (!response.ok || response.redirected || !response.body)
    throw new ReadConnectorError('read_failed');
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_RESPONSE_BYTES) throw new ReadConnectorError('resource_too_large');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new ReadConnectorError('resource_too_large');
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return tencentDocsObject(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
  } catch {
    throw new ReadConnectorError('invalid_response');
  }
}

function checkCatalog(result: JsonRecord, names: readonly Tool[]): void {
  if (!Array.isArray(result.tools) || result.tools.length > 1000)
    throw new ReadConnectorError('invalid_response');
  for (const name of names) {
    const matches = result.tools.map(tencentDocsObject).filter((tool) => tool.name === name);
    if (matches.length !== 1) throw new ReadConnectorError('invalid_response');
    const schema = tencentDocsObject(matches[0]!.inputSchema);
    const properties = tencentDocsObject(schema.properties);
    const required = schema.required ?? [];
    if (
      schema.type !== 'object' ||
      !Array.isArray(required) ||
      required.some((field) => !tools[name].fields.includes(String(field))) ||
      tools[name].required.some((field) => !required.includes(field))
    )
      throw new ReadConnectorError('invalid_response');
    for (const field of tools[name].fields) {
      if (tencentDocsObject(properties[field]).type !== 'string')
        throw new ReadConnectorError('invalid_response');
    }
  }
}

function resultValue(result: JsonRecord): JsonRecord {
  if (result.isError === true) throw new ReadConnectorError('read_failed');
  let value: JsonRecord;
  if (result.structuredContent !== undefined) value = tencentDocsObject(result.structuredContent);
  else {
    if (!Array.isArray(result.content) || result.content.length !== 1)
      throw new ReadConnectorError('invalid_response');
    const block = tencentDocsObject(result.content[0]);
    if (block.type !== 'text' || typeof block.text !== 'string')
      throw new ReadConnectorError('invalid_response');
    try {
      value = tencentDocsObject(JSON.parse(block.text) as unknown);
    } catch {
      throw new ReadConnectorError('invalid_response');
    }
  }
  if (value.error || value.err_msg || (value.ret !== undefined && value.ret !== 0))
    throw new ReadConnectorError('read_failed');
  return value;
}

/** Uses the official C-end raw Authorization header, never a caller-selected endpoint/tool. */
export function createTencentDocsProtocol(fetchFn: typeof fetch = fetch) {
  const request = async (
    endpoint: string,
    token: string,
    method: string,
    params: JsonRecord,
    signal?: AbortSignal,
  ) => {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: requestSignal,
        headers: {
          Authorization: tencentDocsToken(token),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const envelope = await readTencentDocsJson(response);
      if (envelope.jsonrpc !== '2.0' || envelope.id !== 1 || envelope.error)
        throw new ReadConnectorError('invalid_response');
      return tencentDocsObject(envelope.result);
    } catch (error) {
      if (signal?.aborted) throw new ReadConnectorError('cancelled');
      if (error instanceof ReadConnectorError) throw error;
      throw new ReadConnectorError('read_failed');
    }
  };
  const verify = async (token: string, signal?: AbortSignal) => {
    checkCatalog(await request(GENERAL_ENDPOINT, token, 'tools/list', {}, signal), [
      'manage.query_file_info',
      'get_content',
    ]);
  };
  const invoke = async (
    name: Tool,
    token: string,
    args: JsonRecord,
    guard: DispatchGuard,
    dispatched?: () => void,
  ) => {
    checkCatalog(await request(tools[name].endpoint, token, 'tools/list', {}), [name]);
    await guard.beforeDispatch();
    guard.assertDispatch();
    dispatched?.();
    const result = await request(tools[name].endpoint, token, 'tools/call', {
      name,
      arguments: args,
    });
    guard.assertDispatch();
    return resultValue(result);
  };
  return {
    verify,
    metadata: (token: string, fileId: string, guard: DispatchGuard) =>
      invoke('manage.query_file_info', token, { file_id: fileId }, guard),
    content: (token: string, fileId: string, guard: DispatchGuard) =>
      invoke('get_content', token, { file_id: fileId }, guard),
    create: (
      token: string,
      title: string,
      content: string,
      guard: DispatchGuard,
      dispatched: () => void,
    ) =>
      invoke(
        'create_with_markdown',
        token,
        { title, base64_markdown: Buffer.from(content, 'utf8').toString('base64') },
        guard,
        dispatched,
      ),
  };
}
