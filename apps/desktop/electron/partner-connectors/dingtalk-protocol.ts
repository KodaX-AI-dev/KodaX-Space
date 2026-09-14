import { ReadConnectorError, type ReadConnectorIdentity } from './read-connector.js';

export function dingtalkNodeId(value: string): string {
  const match =
    /^(?:dingtalk:\/\/document\/|https:\/\/alidocs\.dingtalk\.com\/i\/nodes\/)([A-Za-z0-9]{1,128})$/u.exec(
      value,
    );
  if (!match || !/[A-Za-z]/u.test(match[1])) throw new ReadConnectorError('invalid_resource');
  return match[1];
}

export function dingtalkObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReadConnectorError('invalid_response');
  const data = value as Record<string, unknown>;
  const invalidCode = ['code', 'errorCode', 'error_code', 'errcode'].some(
    (key) =>
      data[key] !== undefined &&
      data[key] !== null &&
      !['', '0', 'ok', 'success', 'succeed'].includes(String(data[key]).toLowerCase()),
  );
  if (
    data.success === false ||
    data.success === 'false' ||
    data.isError === true ||
    data.error ||
    invalidCode ||
    data.outcome === 'failure' ||
    data.outcome === 'partial_failure' ||
    data.status === 'error'
  )
    throw new ReadConnectorError('invalid_response');
  return data;
}

export function dingtalkJSON(text: string): Record<string, unknown> {
  try {
    return dingtalkObject(JSON.parse(text) as unknown);
  } catch {
    throw new ReadConnectorError('invalid_response');
  }
}

export function dingtalkId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/u.test(value))
    throw new ReadConnectorError('invalid_response');
  return value;
}

/** This is a network get_current_user_profile result, never auth status cache. */
export function dingtalkOnlineIdentity(
  data: Record<string, unknown>,
  expected: ReadConnectorIdentity,
): ReadConnectorIdentity {
  if (!Array.isArray(data.result) || data.result.length < 1 || data.result.length > 100)
    throw new ReadConnectorError('invalid_response');
  const candidates = data.result.map((value) =>
    dingtalkObject(dingtalkObject(value).orgEmployeeModel),
  );
  const matches = candidates.filter((value) => value.corpId === expected.authorityId);
  if (matches.length !== 1) throw new ReadConnectorError('identity_changed');
  const match = matches[0];
  const user = dingtalkId(match.userId ?? match.userid ?? match.orgUserId);
  if (user !== expected.subjectId) throw new ReadConnectorError('identity_changed');
  const name = typeof match.orgUserName === 'string' ? match.orgUserName : match.name;
  const corp = match.orgName;
  const labels = [name, corp].filter(
    (value): value is string => typeof value === 'string' && !!value.trim(),
  );
  if (labels.some((value) => value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)))
    throw new ReadConnectorError('invalid_response');
  return {
    authorityId: dingtalkId(match.corpId),
    subjectId: user,
    label: labels.join(' · ') || user,
  };
}

/** Official v1.0.61 builds exactly this domestic loopback OAuth route. */
export function isDingtalkAuthorizationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192 || /[\s\\\u0000-\u001f\u007f]/u.test(value))
    return false;
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    const allowed = ['client_id', 'redirect_uri', 'response_type', 'scope', 'prompt', 'corpId'];
    const redirect = new URL(url.searchParams.get('redirect_uri') ?? '');
    return (
      url.origin === 'https://login.dingtalk.com' &&
      url.pathname === '/oauth2/auth' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      keys.length === new Set(keys).size &&
      keys.every((key) => allowed.includes(key)) &&
      /^[A-Za-z0-9_-]{1,256}$/u.test(url.searchParams.get('client_id') ?? '') &&
      (!url.searchParams.has('corpId') ||
        /^[A-Za-z0-9_-]{1,256}$/u.test(url.searchParams.get('corpId') ?? '')) &&
      url.searchParams.get('response_type') === 'code' &&
      url.searchParams.get('scope') === 'openid corpid' &&
      url.searchParams.get('prompt') === 'consent' &&
      redirect.protocol === 'http:' &&
      redirect.hostname === '127.0.0.1' &&
      Number(redirect.port) >= 1024 &&
      Number(redirect.port) <= 65535 &&
      redirect.pathname === '/callback' &&
      !redirect.username &&
      !redirect.password &&
      !redirect.search &&
      !redirect.hash
    );
  } catch {
    return false;
  }
}
