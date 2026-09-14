import { ReadConnectorError } from './read-connector.js';

export type ApiObject = Record<string, unknown>;
export const apiObject = (value: unknown): ApiObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReadConnectorError('invalid_response');
  return value as ApiObject;
};
export function apiText(value: unknown, maximum = 280): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new ReadConnectorError('invalid_response');
  return value;
}
export function apiBody(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new ReadConnectorError('invalid_response');
  return value;
}
export function apiNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new ReadConnectorError('invalid_response');
  return value;
}
export interface ApiGuard {
  beforeRead(): Promise<void>;
  assertRead(): void;
}
const MAX_RESPONSE_BYTES = 1024 * 1024;
const ORIGINS = new Set([
  'https://slack.com',
  'https://zoom.us',
  'https://api.zoom.us',
  'https://api.github.com',
]);

async function boundedJson(response: Response): Promise<ApiObject> {
  if (!response.body) throw new ReadConnectorError('invalid_response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES)
      throw new ReadConnectorError('resource_too_large');
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
  return apiObject(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
}

/** Host-only transport; providers choose fixed routes. No caller-supplied endpoints or retries. */
export function createApiHttp(fetchFn: typeof fetch = fetch) {
  return async (
    url: string,
    init: RequestInit,
    options: { signal?: AbortSignal; guard?: ApiGuard; allowNotFound?: boolean } = {},
  ) => {
    const target = new URL(url);
    if (!ORIGINS.has(target.origin) || target.username || target.password || target.hash)
      throw new ReadConnectorError('invalid_resource');
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000);
    try {
      await options.guard?.beforeRead();
      if (signal.aborted) throw new ReadConnectorError('cancelled');
      options.guard?.assertRead();
      const response = await fetchFn(url, { ...init, signal, redirect: 'error' });
      if (response.redirected) throw new ReadConnectorError('invalid_response');
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404 && options.allowNotFound)
          return { body: null, headers: response.headers };
        throw new ReadConnectorError(
          response.status === 429 ||
            (response.status === 403 &&
              (response.headers.get('x-ratelimit-remaining') === '0' ||
                response.headers.has('retry-after')))
            ? 'rate_limited'
            : response.status === 401
              ? 'authorization_failed'
              : response.status === 403
                ? 'permission_missing'
                : 'read_failed',
        );
      }
      return { body: await boundedJson(response), headers: response.headers };
    } catch (error) {
      if (options.signal?.aborted) throw new ReadConnectorError('cancelled');
      if (error instanceof ReadConnectorError) throw error;
      throw new ReadConnectorError('read_failed');
    }
  };
}
