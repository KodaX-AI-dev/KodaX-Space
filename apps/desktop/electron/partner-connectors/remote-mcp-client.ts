import path from 'node:path';

type SdkMcpModule = typeof import('@kodax-ai/kodax/mcp');
type McpCapabilityDescriptor = import('@kodax-ai/kodax/mcp').McpCapabilityDescriptor;
type McpServerConfig = import('@kodax-ai/kodax/mcp').McpServerConfig;

let sdkMcpModuleCache: SdkMcpModule | null = null;
async function loadSdkMcpModule(): Promise<SdkMcpModule> {
  if (sdkMcpModuleCache === null) sdkMcpModuleCache = await import('@kodax-ai/kodax/mcp');
  return sdkMcpModuleCache;
}

export const REMOTE_MCP_MAX_RESULT_BYTES = 128 * 1024;

type JsonObject = Readonly<Record<string, unknown>>;

export interface RemoteMcpToolDefinition {
  readonly inputSchema: JsonObject;
}

export type RemoteMcpReadTools = Readonly<Record<string, RemoteMcpToolDefinition>>;

export interface RemoteMcpProviderInput<TTools extends RemoteMcpReadTools> {
  readonly serverId: string;
  readonly endpoint: string;
  readonly allowedHosts: readonly string[];
  readonly readTools: TTools;
}

const remoteMcpProviderBrand: unique symbol = Symbol('RemoteMcpProviderDefinition');

export interface RemoteMcpProviderDefinition<
  TTools extends RemoteMcpReadTools,
> extends RemoteMcpProviderInput<TTools> {
  readonly [remoteMcpProviderBrand]: true;
}

interface RemoteMcpRawResult {
  readonly kind: 'tool' | 'resource' | 'prompt';
  readonly content?: unknown;
  readonly structuredContent?: unknown;
  readonly metadata?: unknown;
}

export interface RemoteMcpManagerPort {
  listTools(
    serverId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<{ readonly serverId: string; readonly tools: readonly McpCapabilityDescriptor[] }>;
  getServerLogs(serverId: string): {
    readonly serverId: string;
    readonly status: 'idle' | 'connecting' | 'ready' | 'error' | 'disabled';
    readonly lastError?: string;
    readonly cachedAt?: string;
  };
  execute(id: string, input: Record<string, unknown>): Promise<RemoteMcpRawResult>;
  dispose(): Promise<void>;
}

export type RemoteMcpManagerFactory = (
  servers: Record<string, McpServerConfig>,
  options: { cacheDir: string },
) => RemoteMcpManagerPort;

export interface RemoteMcpToolDescription<TName extends string = string> {
  readonly name: TName;
  readonly inputSchema: JsonObject;
}

export interface RemoteMcpResult {
  readonly content?: string;
  readonly structuredContent?: unknown;
}

export interface RemoteMcpExecutionGuard {
  readonly beforeDispatch?: () => void | Promise<void>;
  readonly assertAllowed?: () => void;
}

type ToolName<TTools extends RemoteMcpReadTools> = Extract<keyof TTools, string>;

export interface RemoteMcpClient<TTools extends RemoteMcpReadTools> {
  list(): Promise<readonly RemoteMcpToolDescription<ToolName<TTools>>[]>;
  describe(name: ToolName<TTools>): Promise<RemoteMcpToolDescription<ToolName<TTools>>>;
  executeFixed(
    name: ToolName<TTools>,
    input: Record<string, unknown>,
    guard?: RemoteMcpExecutionGuard,
  ): Promise<RemoteMcpResult>;
}

export function defineRemoteMcpProvider<const TTools extends RemoteMcpReadTools>(
  definition: RemoteMcpProviderInput<TTools>,
): RemoteMcpProviderDefinition<TTools> {
  checkProviderShape(definition);
  const readTools = Object.freeze(
    Object.fromEntries(
      Object.entries(definition.readTools).map(([name, tool]) => [
        name,
        Object.freeze({ inputSchema: cloneAndFreezeJsonObject(tool.inputSchema) }),
      ]),
    ),
  ) as TTools;
  return Object.freeze({
    serverId: definition.serverId,
    endpoint: definition.endpoint,
    allowedHosts: Object.freeze([...definition.allowedHosts]),
    readTools,
    [remoteMcpProviderBrand]: true as const,
  });
}

export function createRemoteMcpClient<const TTools extends RemoteMcpReadTools>(options: {
  readonly provider: RemoteMcpProviderDefinition<TTools>;
  readonly bearerToken: string;
  readonly cacheDir: string;
  readonly managerFactory?: RemoteMcpManagerFactory;
}): RemoteMcpClient<TTools> {
  if (options.provider[remoteMcpProviderBrand] !== true)
    throw new RemoteMcpClientError('invalid_configuration');
  checkProviderShape(options.provider);
  checkBearerToken(options.bearerToken);
  if (!path.isAbsolute(options.cacheDir)) throw new RemoteMcpClientError('invalid_configuration');

  const withManager = async <T>(
    run: (
      manager: RemoteMcpManagerPort,
      createCapabilityId: SdkMcpModule['createMcpCapabilityId'],
    ) => Promise<T>,
  ): Promise<T> => {
    const sdk = await loadSdkMcpModule();
    const servers = {
      [options.provider.serverId]: {
        type: 'streamable-http' as const,
        url: options.provider.endpoint,
        headers: { Authorization: `Bearer ${options.bearerToken}` },
        connect: 'lazy' as const,
      },
    };
    const manager = options.managerFactory
      ? options.managerFactory(servers, { cacheDir: options.cacheDir })
      : sdk.createMcpManager(servers, { cacheDir: options.cacheDir });
    try {
      return await run(manager, sdk.createMcpCapabilityId);
    } finally {
      await manager.dispose();
    }
  };

  const validatedTools = async (
    manager: RemoteMcpManagerPort,
    createCapabilityId: SdkMcpModule['createMcpCapabilityId'],
  ): Promise<readonly RemoteMcpToolDescription<ToolName<TTools>>[]> => {
    const listed = await manager.listTools(options.provider.serverId, { forceRefresh: true });
    const diagnostics = manager.getServerLogs(options.provider.serverId);
    if (
      listed.serverId !== options.provider.serverId ||
      diagnostics.serverId !== options.provider.serverId ||
      diagnostics.status !== 'ready'
    )
      throw new RemoteMcpClientError('catalog_mismatch');
    return Object.entries(options.provider.readTools).map(([name, expected]) => {
      const matches = listed.tools.filter(
        (tool) =>
          tool.serverId === options.provider.serverId &&
          tool.kind === 'tool' &&
          tool.name === name &&
          tool.id === createCapabilityId(options.provider.serverId, 'tool', name),
      );
      if (
        matches.length !== 1 ||
        !inputSchemasCompatible(matches[0]?.inputSchema, expected.inputSchema)
      )
        throw new RemoteMcpClientError('catalog_mismatch');
      return { name: name as ToolName<TTools>, inputSchema: expected.inputSchema };
    });
  };

  return {
    list: () => withManager(validatedTools),
    describe: (name) =>
      withManager(async (manager, createCapabilityId) => {
        const tools = await validatedTools(manager, createCapabilityId);
        const tool = tools.find((candidate) => candidate.name === name);
        if (!tool) throw new RemoteMcpClientError('tool_not_allowed');
        return tool;
      }),
    executeFixed: (name, input, guard) =>
      withManager(async (manager, createCapabilityId) => {
        const tools = await validatedTools(manager, createCapabilityId);
        const tool = tools.find((candidate) => candidate.name === name);
        if (!tool) throw new RemoteMcpClientError('tool_not_allowed');
        if (!inputMatchesSchema(input, tool.inputSchema))
          throw new RemoteMcpClientError('invalid_input');
        await guard?.beforeDispatch?.();
        guard?.assertAllowed?.();
        const result = await manager.execute(
          createCapabilityId(options.provider.serverId, 'tool', name),
          input,
        );
        guard?.assertAllowed?.();
        return checkResult(result);
      }),
  };
}

const annotationKeys = new Set([
  '$comment',
  '$schema',
  'default',
  'description',
  'examples',
  'title',
]);

function inputSchemasCompatible(remote: unknown, expected: JsonObject): boolean {
  if (!isRecord(remote) || remote.type !== 'object' || expected.type !== 'object') return false;
  if (!equalStringSets(remote.required, expected.required)) return false;
  if (stableJson(schemaEnvelope(remote)) !== stableJson(schemaEnvelope(expected))) return false;
  if (!isRecord(remote.properties) || !isRecord(expected.properties)) return false;
  for (const [name, expectedProperty] of Object.entries(expected.properties)) {
    if (!(name in remote.properties)) return false;
    if (
      stableJson(stripAnnotations(remote.properties[name])) !==
      stableJson(stripAnnotations(expectedProperty))
    )
      return false;
  }
  return true;
}

function schemaEnvelope(schema: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => key !== 'properties' && key !== 'required' && !annotationKeys.has(key))
      .map(([key, value]) => [key, stripAnnotations(value)]),
  );
}

function inputMatchesSchema(value: unknown, schema: JsonObject): boolean {
  const type = schema.type;
  if (type === 'object') {
    if (!isRecord(value) || !isRecord(schema.properties)) return false;
    const properties = schema.properties;
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (!required.every((key) => typeof key === 'string' && key in value)) return false;
    if (Object.keys(value).some((key) => !(key in properties))) return false;
    return Object.entries(value).every(([key, entry]) => {
      const propertySchema = properties[key];
      return isRecord(propertySchema) && inputMatchesSchema(entry, propertySchema);
    });
  }
  if (type === 'array')
    return (
      Array.isArray(value) &&
      isRecord(schema.items) &&
      value.every((item) => inputMatchesSchema(item, schema.items as JsonObject))
    );
  if (type === 'string' && typeof value !== 'string') return false;
  if (type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return false;
  if (type === 'integer' && (typeof value !== 'number' || !Number.isSafeInteger(value)))
    return false;
  if (type === 'boolean' && typeof value !== 'boolean') return false;
  if (!['string', 'number', 'integer', 'boolean'].includes(String(type))) return false;
  return !Array.isArray(schema.enum) || schema.enum.some((candidate) => candidate === value);
}

function readTextContent(content: unknown): string | undefined {
  if (content === undefined || typeof content === 'string') return content;
  if (!Array.isArray(content)) throw new RemoteMcpClientError('invalid_result');
  const texts: string[] = [];
  let size = 0;
  for (const item of content) {
    if (!isRecord(item) || item.type !== 'text' || typeof item.text !== 'string')
      throw new RemoteMcpClientError('invalid_result');
    size += Buffer.byteLength(item.text, 'utf8') + (texts.length > 0 ? 1 : 0);
    if (size > REMOTE_MCP_MAX_RESULT_BYTES) throw new RemoteMcpClientError('result_too_large');
    texts.push(item.text);
  }
  return texts.join('\n');
}

function checkResult(result: RemoteMcpRawResult): RemoteMcpResult {
  if (result.kind !== 'tool') throw new RemoteMcpClientError('invalid_result');
  if (
    result.metadata !== undefined &&
    (!isRecord(result.metadata) ||
      ('isError' in result.metadata && typeof result.metadata.isError !== 'boolean'))
  )
    throw new RemoteMcpClientError('invalid_result');
  if (isRecord(result.metadata) && result.metadata.isError === true)
    throw new RemoteMcpClientError('invalid_result');
  const content = readTextContent(result.content);
  if (content !== undefined && typeof content !== 'string')
    throw new RemoteMcpClientError('invalid_result');
  let structuredContent: unknown;
  let structuredJson = '';
  if (result.structuredContent !== undefined) {
    if (!isJsonValue(result.structuredContent)) throw new RemoteMcpClientError('invalid_result');
    try {
      structuredJson = JSON.stringify(result.structuredContent);
      if (structuredJson === undefined) throw new Error('not JSON');
      structuredContent = JSON.parse(structuredJson) as unknown;
    } catch {
      throw new RemoteMcpClientError('invalid_result');
    }
  }
  const size = Buffer.byteLength(content ?? '', 'utf8') + Buffer.byteLength(structuredJson, 'utf8');
  if (size > REMOTE_MCP_MAX_RESULT_BYTES) throw new RemoteMcpClientError('result_too_large');
  return {
    ...(content === undefined ? {} : { content }),
    ...(structuredContent === undefined ? {} : { structuredContent }),
  };
}

function isJsonValue(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((entry) => isJsonValue(entry, seen));
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every((entry) => isJsonValue(entry, seen));
}

function checkProviderShape(definition: RemoteMcpProviderInput<RemoteMcpReadTools>): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(definition.serverId))
    throw new RemoteMcpClientError('invalid_configuration');
  let endpoint: URL;
  try {
    endpoint = new URL(definition.endpoint);
  } catch {
    throw new RemoteMcpClientError('invalid_configuration');
  }
  const hosts = definition.allowedHosts.map((host) => host.toLowerCase());
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.port !== '' ||
    endpoint.hash !== '' ||
    endpoint.search !== '' ||
    hosts.length === 0 ||
    !hosts.includes(endpoint.hostname.toLowerCase()) ||
    hosts.some((host) => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(host)) ||
    Object.keys(definition.readTools).length === 0 ||
    Object.entries(definition.readTools).some(
      ([name, tool]) =>
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(name) ||
        !isJsonValue(tool.inputSchema) ||
        tool.inputSchema.type !== 'object' ||
        !isRecord(tool.inputSchema.properties),
    )
  )
    throw new RemoteMcpClientError('invalid_configuration');
}

function cloneAndFreezeJsonObject(value: JsonObject): JsonObject {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('not JSON');
    const cloned = JSON.parse(serialized) as unknown;
    if (!isRecord(cloned)) throw new Error('not an object');
    return deepFreezeJson(cloned) as JsonObject;
  } catch {
    throw new RemoteMcpClientError('invalid_configuration');
  }
}

function deepFreezeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    value.forEach(deepFreezeJson);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    Object.values(value).forEach(deepFreezeJson);
    return Object.freeze(value);
  }
  return value;
}

function checkBearerToken(token: string): void {
  if (token.length === 0 || token.trim() !== token || /[\r\n]/u.test(token))
    throw new RemoteMcpClientError('invalid_configuration');
}

function equalStringSets(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): string[] | undefined => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return undefined;
    return [...value].sort();
  };
  const a = normalize(left);
  const b = normalize(right);
  return a !== undefined && b !== undefined && stableJson(a) === stableJson(b);
}

function stripAnnotations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripAnnotations);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !annotationKeys.has(key))
      .map(([key, entry]) => [key, stripAnnotations(entry)]),
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class RemoteMcpClientError extends Error {
  constructor(
    readonly code:
      | 'invalid_configuration'
      | 'catalog_mismatch'
      | 'tool_not_allowed'
      | 'invalid_input'
      | 'invalid_result'
      | 'result_too_large',
  ) {
    super(code);
    this.name = 'RemoteMcpClientError';
  }
}
