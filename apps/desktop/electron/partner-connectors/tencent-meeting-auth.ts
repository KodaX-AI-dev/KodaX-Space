import type { FeishuOnboardingInput } from './feishu-onboarding-cli.js';
import type { ProviderCliProcess } from './provider-cli-process.js';
import { ReadConnectorError } from './read-connector.js';

const AUTHORIZATION_PREFIX =
  'https://meeting.tencent.com/marketplace/tencentmeeting-cli-auth.html?';
const SUCCESS = 'Login successful. Start managing your meetings using tmeet.';

export function isTencentMeetingAuthorizationUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    !value.startsWith(AUTHORIZATION_PREFIX) ||
    /[\s\\\u0000-\u001f\u007f]/u.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    const code = url.searchParams.get('code');
    return (
      !url.hash &&
      keys.length === 1 &&
      keys[0] === 'code' &&
      !!code &&
      code.length <= 1024 &&
      !/[\s\u0000-\u001f\u007f]/u.test(code)
    );
  } catch {
    return false;
  }
}

/** Only a pinned CLI's explicit authorization line may reach the host browser. */
export async function authorizeTencentMeeting(
  run: ProviderCliProcess,
  input: FeishuOnboardingInput,
): Promise<void> {
  let buffered = '';
  let bytes = 0;
  let streamed = false;
  let url: string | undefined;
  let complete = false;
  const line = (value: string) => {
    if (input.signal.aborted) throw new ReadConnectorError('cancelled');
    if (value.startsWith('authorize url: ')) {
      const candidate = value.slice('authorize url: '.length);
      if (!isTencentMeetingAuthorizationUrl(candidate) || url || complete)
        throw new ReadConnectorError('invalid_response');
      url = candidate;
      input.onProgress({
        phase: 'waiting_authorization',
        authorizationUrl: url,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      });
    } else if (value === SUCCESS) {
      if (!url || complete) throw new ReadConnectorError('invalid_response');
      complete = true;
    }
  };
  const consume = (chunk: string) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 16384) throw new ReadConnectorError('invalid_response');
    buffered += chunk;
    const lines = buffered.split(/\r?\n/u);
    buffered = lines.pop() ?? '';
    lines.forEach(line);
  };
  const result = await run({
    args: ['auth', 'login', '--no-browser'],
    signal: input.signal,
    timeoutMs: 330000,
    onOutput: (stream, chunk) => {
      if (stream === 'stdout') {
        streamed = true;
        consume(chunk);
      }
    },
  });
  if (input.signal.aborted) throw new ReadConnectorError('cancelled');
  if (result.exitCode !== 0) {
    const expired = result.stderr
      .split(/\r?\n/u)
      .some(
        (value) => value === "Error: authorization timeout, please try 'tmeet auth login' again",
      );
    throw new ReadConnectorError(expired ? 'expired' : 'authorization_failed');
  }
  if (!streamed) consume(result.stdout);
  line(buffered);
  if (!url || !complete) throw new ReadConnectorError('invalid_response');
}
