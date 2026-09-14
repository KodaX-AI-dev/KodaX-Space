import { createHash, randomBytes } from 'node:crypto';
import type { FeishuOnboardingInput } from './feishu-onboarding-cli.js';
import {
  checkReadConnectorDocument,
  ReadConnectorError,
  type ReadConnector,
  type ReadConnectorCreateInput,
  type ReadConnectorCreateResult,
  type ReadConnectorIdentity,
  type ReadConnectorInput,
} from './read-connector.js';
import type { CredentialStore } from './remote-mcp-oauth.js';
import {
  createTencentDocsProtocol,
  readTencentDocsJson,
  tencentDocsObject,
  tencentDocsText,
  tencentDocsToken,
} from './tencent-docs-protocol.js';

const PROFILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const DOCUMENT = /^https:\/\/docs\.qq\.com\/doc\/([A-Za-z0-9_-]{1,128})$/u;
const AUTH_TIMEOUT_MS = 5 * 60_000;
export type TencentDocsConnector = ReadConnector & {
  createDocument(input: ReadConnectorCreateInput): Promise<ReadConnectorCreateResult>;
  disconnect(profile: string, signal?: AbortSignal): Promise<void>;
};

export function isTencentDocsAuthorizationUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 512) return false;
  const match =
    /^https:\/\/docs\.qq\.com\/scenario\/open-claw\.html\?nlc=1&authType=1&code=[a-f0-9]{16}&mcp_source=desktop$/u;
  return match.test(value);
}
function credentialKey(profile: string): string {
  if (!PROFILE.test(profile)) throw new ReadConnectorError('invalid_response');
  return `partner-connector-tencent-docs:${profile}`;
}
function identity(token: string): ReadConnectorIdentity {
  return {
    authorityId: 'tencent-docs',
    subjectId: `credential-${createHash('sha256').update(token).digest('hex')}`,
    // The public helper authenticates a credential; it does not supply a verified QQ/WeChat user name.
    label: '腾讯文档授权连接',
  };
}
function requireIdentity(token: string, expected: ReadConnectorIdentity): void {
  const actual = identity(token);
  if (actual.authorityId !== expected.authorityId || actual.subjectId !== expected.subjectId)
    throw new ReadConnectorError('identity_changed');
}
function active(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new ReadConnectorError(signal.reason?.name === 'TimeoutError' ? 'expired' : 'cancelled');
}
async function confirmed(input: FeishuOnboardingInput, signal: AbortSignal): Promise<void> {
  if (!input.requestInput) throw new ReadConnectorError('authorization_failed');
  active(signal);
  await new Promise<void>((resolve, reject) => {
    const cancel = () => {
      try {
        active(signal);
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener('abort', cancel, { once: true });
    void Promise.resolve()
      .then(() => input.requestInput!('authorization_complete'))
      .then(
        (result) => {
          signal.removeEventListener('abort', cancel);
          try {
            active(signal);
            if (!('confirmed' in result) || result.confirmed !== true)
              throw new ReadConnectorError('authorization_failed');
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        () => {
          signal.removeEventListener('abort', cancel);
          reject(new ReadConnectorError(signal.aborted ? 'cancelled' : 'authorization_failed'));
        },
      );
  });
}

export function createTencentDocsConnector(options: {
  credentials: CredentialStore;
  fetchFn?: typeof fetch;
}): TencentDocsConnector {
  const fetchFn = options.fetchFn ?? fetch;
  const protocol = createTencentDocsProtocol(fetchFn);
  const pending = new Map<string, { controller: AbortController; done: Promise<void> }>();
  const removeCredential = async (key: string) => {
    try {
      await options.credentials.get(key);
      await options.credentials.delete(key);
      if ((await options.credentials.get(key)) !== undefined)
        throw new ReadConnectorError('authorization_failed');
    } catch {
      throw new ReadConnectorError('authorization_failed');
    }
  };
  const tokenFor = async (profile: string, signal?: AbortSignal) => {
    try {
      active(signal);
      const token = tencentDocsToken(await options.credentials.get(credentialKey(profile)));
      active(signal);
      return token;
    } catch (error) {
      if (error instanceof ReadConnectorError) throw error;
      throw new ReadConnectorError('authorization_failed');
    }
  };
  const inspect = async (profile: string, signal?: AbortSignal) => {
    try {
      const token = await tokenFor(profile, signal);
      await protocol.verify(token, signal);
      active(signal);
      return { installed: true, version: 'official-mcp-1.0.41', identity: identity(token) };
    } catch {
      active(signal);
      return {
        installed: true,
        version: 'official-mcp-1.0.41',
        reason: '腾讯文档授权连接尚未完成在线验证，请在官方网页授权后确认完成。',
      };
    }
  };
  const verifiedToken = async (input: Pick<ReadConnectorInput, 'profile' | 'expected'>) => {
    const token = await tokenFor(input.profile);
    requireIdentity(token, input.expected);
    await protocol.verify(token);
    return token;
  };
  const read = async (input: ReadConnectorInput) => {
    const documentId = DOCUMENT.exec(input.documentUrl)?.[1];
    if (!documentId) throw new ReadConnectorError('invalid_resource');
    const token = await verifiedToken(input);
    const guard = {
      beforeDispatch: async () => {
        await input.beforeRead();
        requireIdentity(await tokenFor(input.profile), input.expected);
      },
      assertDispatch: input.assertRead,
    };
    const metadata = await protocol.metadata(token, documentId, guard);
    if (
      metadata.file_id !== documentId ||
      metadata.url !== input.documentUrl ||
      !['doc', 'tencentdoc'].includes(String(metadata.type))
    )
      throw new ReadConnectorError('invalid_response');
    const content = await protocol.content(token, documentId, guard);
    if (typeof content.content !== 'string' || content.next_token)
      throw new ReadConnectorError('invalid_response');
    input.assertRead();
    return checkReadConnectorDocument({
      documentId,
      url: input.documentUrl,
      title: tencentDocsText(metadata.title),
      revision: 0,
      content: content.content,
    });
  };
  const createDocument = async (input: ReadConnectorCreateInput) => {
    checkReadConnectorDocument({
      documentId: 'pending',
      url: '',
      revision: 0,
      title: input.title,
      content: input.content,
    });
    if (!input.title.trim() || [...input.title].length > 36 || !input.content.trim())
      throw new ReadConnectorError('invalid_resource');
    const token = await verifiedToken(input);
    let dispatched = false;
    try {
      const receipt = await protocol.create(
        token,
        input.title,
        input.content,
        {
          beforeDispatch: async () => {
            await input.beforeDispatch();
            requireIdentity(await tokenFor(input.profile), input.expected);
          },
          assertDispatch: input.assertDispatch,
        },
        () => {
          dispatched = true;
        },
      );
      const url = tencentDocsText(receipt.file_url, 512);
      const documentId = DOCUMENT.exec(url)?.[1];
      if (!documentId || receipt.file_id !== documentId || receipt.title !== input.title)
        throw new ReadConnectorError('invalid_response');
      return { status: 'success' as const, documentId, url, revision: 0 };
    } catch (error) {
      if (dispatched) return { status: 'unknown' as const };
      throw error;
    }
  };
  const run = async (input: FeishuOnboardingInput) => {
    const key = credentialKey(input.profile);
    if (pending.has(key)) throw new ReadConnectorError('authorization_failed');
    const controller = new AbortController();
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    pending.set(key, { controller, done });
    const signal = AbortSignal.any([
      input.signal,
      controller.signal,
      AbortSignal.timeout(AUTH_TIMEOUT_MS),
    ]);
    const code = randomBytes(8).toString('hex');
    let persisted = false;
    try {
      active(signal);
      if (await options.credentials.get(key)) throw new ReadConnectorError('authorization_failed');
      const authorizationUrl = `https://docs.qq.com/scenario/open-claw.html?nlc=1&authType=1&code=${code}&mcp_source=desktop`;
      input.onProgress({
        phase: 'waiting_authorization',
        authorizationUrl,
        expiresAt: new Date(Date.now() + AUTH_TIMEOUT_MS).toISOString(),
      });
      for (;;) {
        await confirmed(input, signal);
        const response = await fetchFn(`https://docs.qq.com/oauth/v2/mcp/token/get?code=${code}`, {
          redirect: 'error',
          signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        });
        const result = await readTencentDocsJson(response);
        active(signal);
        if (result.ret === 11510) continue;
        const data = tencentDocsObject(result.data);
        if (data.expired === true) throw new ReadConnectorError('expired');
        if (result.ret !== 0 && result.ret !== undefined)
          throw new ReadConnectorError('authorization_failed');
        const token = tencentDocsToken(data.token);
        input.onProgress({ phase: 'verifying' });
        await protocol.verify(token, signal);
        active(signal);
        persisted = true;
        await options.credentials.set(key, token);
        active(signal);
        break;
      }
    } catch (error) {
      if (persisted) await removeCredential(key);
      active(signal);
      if (error instanceof ReadConnectorError) throw error;
      throw new ReadConnectorError('authorization_failed');
    } finally {
      pending.delete(key);
      finish();
    }
  };
  return {
    id: 'tencent-docs-mcp',
    inspect,
    run,
    read,
    createDocument,
    isAuthorizationUrl: isTencentDocsAuthorizationUrl,
    acceptsResource: (value) => DOCUMENT.test(value),
    disconnect: async (profile, signal) => {
      active(signal);
      const key = credentialKey(profile);
      const authorization = pending.get(key);
      authorization?.controller.abort();
      await authorization?.done;
      await removeCredential(key);
    },
  };
}
