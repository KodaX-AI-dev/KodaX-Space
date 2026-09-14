import { createHash } from 'node:crypto';
import { ImapFlow, type ImapFlowOptions } from 'imapflow';
import { simpleParser } from 'mailparser';
import { htmlToText } from 'html-to-text';
import type { FeishuOnboardingInput } from './feishu-onboarding-cli.js';
import type { CredentialStore } from './remote-mcp-oauth.js';
import {
  ReadConnectorError,
  checkReadConnectorDocument,
  type ReadConnector,
  type ReadConnectorIdentity,
  type ReadConnectorInput,
  type ReadConnectorSearchInput,
  type ReadConnectorSearchResult,
  type ReadConnectorSearchMessage,
} from './read-connector.js';

export type MailConnectorId = 'netease-mail-imap' | 'qq-mail-imap';
export interface MailCredentials {
  email: string;
  authorizationCode: string;
}
export type MailSearchQuery = ReadConnectorSearchInput['query'];
export type MailSearchInput = ReadConnectorSearchInput;
export type MailSearchMessage = ReadConnectorSearchMessage;
export type MailSearchResult = ReadConnectorSearchResult;

interface Mailbox {
  uidValidity: bigint;
  uidNext: number;
  exists: number;
}
interface MailAddress {
  name?: string;
  address?: string;
}
interface MailMessage {
  uid: number;
  size?: number;
  source?: Buffer;
  envelope?: { subject?: string; from?: MailAddress[]; to?: MailAddress[]; date?: Date };
}
/** This port deliberately has no SMTP, flag mutation, append, deletion or arbitrary command. */
export interface MailClient {
  authenticated: string | boolean;
  mailbox: Mailbox | false;
  connect(): Promise<void>;
  close(): void;
  mailboxOpen(path: 'INBOX', options: { readOnly: true }): Promise<Mailbox>;
  search(
    query: Record<string, string | boolean>,
    options: { uid: true },
  ): Promise<number[] | false>;
  fetchOne(
    uid: string,
    query: { envelope?: true; size?: true; source?: { start: number; maxLength: number } },
    options: { uid: true },
  ): Promise<MailMessage | false>;
}
export interface MailConnectorOptions {
  id: MailConnectorId;
  credentials: CredentialStore;
  requestCredentials: (input: FeishuOnboardingInput) => Promise<MailCredentials>;
  clientFactory?: (options: ImapFlowOptions) => MailClient;
}
export interface MailConnector extends ReadConnector {
  search(input: MailSearchInput): Promise<MailSearchResult>;
  disconnect(profile: string, signal?: AbortSignal): Promise<void>;
}

const PROVIDERS = {
  'netease-mail-imap': { provider: 'netease', host: 'imap.163.com', domain: '163.com' },
  'qq-mail-imap': { provider: 'qq', host: 'imap.qq.com', domain: 'qq.com' },
} as const;
const PROFILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const MAX_UID = 4294967295;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const SEARCH_UID_WINDOW = 500;
const MAX_BODY_BYTES = 128 * 1024;

export function parseMailResource(
  value: string,
): { provider: 'netease' | 'qq'; mailbox: 'INBOX'; uidValidity: string; uid: number } | undefined {
  const match = /^mail:\/\/(netease|qq)\/inbox\/([1-9][0-9]{0,9})\/([1-9][0-9]{0,9})$/u.exec(value);
  if (!match || Number(match[2]) > MAX_UID || Number(match[3]) > MAX_UID) return undefined;
  return {
    provider: match[1] as 'netease' | 'qq',
    mailbox: 'INBOX',
    uidValidity: match[2]!,
    uid: Number(match[3]),
  };
}

function credentialsFor(id: MailConnectorId, value: unknown): MailCredentials {
  if (!value || typeof value !== 'object') throw new ReadConnectorError('authorization_failed');
  const { email, authorizationCode } = value as Partial<MailCredentials>;
  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}@[A-Za-z0-9.-]+$/u.test(email) ||
    email.split('@')[1]?.toLowerCase() !== PROVIDERS[id].domain ||
    typeof authorizationCode !== 'string' ||
    authorizationCode.length < 6 ||
    authorizationCode.length > 256 ||
    /[\s\u0000-\u001f\u007f]/u.test(authorizationCode)
  )
    throw new ReadConnectorError('authorization_failed');
  return { email: email.toLowerCase(), authorizationCode };
}

function key(id: MailConnectorId, profile: string): string {
  if (!PROFILE.test(profile)) throw new ReadConnectorError('invalid_response');
  return `partner-connector-mail:${id}:${profile}`;
}
function identity(id: MailConnectorId, email: string): ReadConnectorIdentity {
  return { authorityId: PROVIDERS[id].host, subjectId: email, label: email };
}
function requireIdentity(expected: ReadConnectorIdentity, actual: ReadConnectorIdentity): void {
  if (expected.authorityId !== actual.authorityId || expected.subjectId !== actual.subjectId)
    throw new ReadConnectorError('identity_changed');
}
function requireActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReadConnectorError('cancelled');
}
function safeFailure(error: unknown, signal?: AbortSignal): never {
  requireActive(signal);
  if (error instanceof ReadConnectorError) throw error;
  throw new ReadConnectorError('read_failed');
}
export function createMailImapClient(options: ImapFlowOptions): MailClient {
  const client = new ImapFlow(options);
  // Socket errors close the connection; pending IMAP operations then reject with a sanitized error.
  client.on('error', () => client.close());
  return {
    get authenticated() {
      // ImapFlow 1.7.8 resets authenticated to true after LOGIN; PREAUTH is also true.
      // Only an actual successful auth mechanism verifies our supplied login identity.
      const methods = 'authCapabilities' in client ? client.authCapabilities : undefined;
      const verified =
        methods instanceof Map && [...methods.values()].some((value) => value === true);
      return verified && client.authenticated ? (options.auth?.user ?? false) : false;
    },
    get mailbox() {
      return client.mailbox;
    },
    connect: () => client.connect(),
    close: () => client.close(),
    mailboxOpen: (mailbox, settings) => client.mailboxOpen(mailbox, settings),
    search: (query, settings) => client.search(query, settings),
    fetchOne: (uid, query, settings) => client.fetchOne(uid, query, settings),
  };
}

async function withClient<T>(
  options: MailConnectorOptions,
  credential: MailCredentials,
  signal: AbortSignal | undefined,
  action: (client: MailClient, assertActive: () => void) => Promise<T>,
): Promise<T> {
  requireActive(signal);
  const client = (options.clientFactory ?? createMailImapClient)({
    host: PROVIDERS[options.id].host,
    port: 993,
    secure: true,
    auth: { user: credential.email, pass: credential.authorizationCode },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    logger: false,
    logRaw: false,
    emitLogs: false,
    clientInfo: { name: 'KodaX Space', version: '0.1.0', vendor: 'KodaX' },
    disableAutoIdle: true,
    disableCompression: true,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    maxLiteralSize: MAX_SOURCE_BYTES + 1,
    maxLineLength: 64 * 1024,
    maxResponseSize: MAX_SOURCE_BYTES + 64 * 1024,
  });
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const assertActive = () => {
    requireActive(signal);
    if (!active) throw new ReadConnectorError('expired');
  };
  const deadline = new Promise<never>((_resolve, reject) => {
    const stop = (code: 'cancelled' | 'expired') => {
      active = false;
      client.close();
      reject(new ReadConnectorError(code));
    };
    abort = () => stop('cancelled');
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => stop('expired'), 60000);
    timer.unref();
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        try {
          await client.connect();
        } catch {
          throw new ReadConnectorError('authorization_failed');
        }
        assertActive();
        if (client.authenticated !== credential.email)
          throw new ReadConnectorError('identity_changed');
        return action(client, assertActive);
      })(),
    ]);
  } catch (error) {
    return safeFailure(error, signal);
  } finally {
    active = false;
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
    client.close();
  }
}

function mailboxDetails(mailbox: Mailbox): { uidValidity: string; lastUid: number } {
  const validity = mailbox.uidValidity.toString();
  if (
    !/^[1-9][0-9]{0,9}$/u.test(validity) ||
    Number(validity) > MAX_UID ||
    !Number.isSafeInteger(mailbox.uidNext) ||
    mailbox.uidNext < 1 ||
    mailbox.uidNext > MAX_UID + 1 ||
    !Number.isSafeInteger(mailbox.exists) ||
    mailbox.exists < 0
  )
    throw new ReadConnectorError('invalid_response');
  return { uidValidity: validity, lastUid: mailbox.uidNext - 1 };
}
function header(value: string | undefined, maximum: number): string {
  const result = value?.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim() ?? '';
  if (result.length > maximum) throw new ReadConnectorError('resource_too_large');
  return result;
}
function addresses(values: MailAddress[] | undefined, maximum: number): string {
  if (!values) return '';
  if (values.length > 100) throw new ReadConnectorError('resource_too_large');
  return header(values.map((item) => item.address ?? item.name ?? '').join(', '), maximum);
}
function messageMetadata(
  provider: 'netease' | 'qq',
  uidValidity: string,
  message: MailMessage,
): MailSearchMessage {
  if (
    !Number.isSafeInteger(message.uid) ||
    message.uid < 1 ||
    message.uid > MAX_UID ||
    !Number.isSafeInteger(message.size) ||
    message.size! < 0
  )
    throw new ReadConnectorError('invalid_response');
  const date = message.envelope?.date;
  if (date && !Number.isFinite(date.getTime())) throw new ReadConnectorError('invalid_response');
  return {
    reference: `mail://${provider}/inbox/${uidValidity}/${message.uid}`,
    subject: header(message.envelope?.subject, 280) || '（无主题）',
    from: addresses(message.envelope?.from, 1000),
    to: addresses(message.envelope?.to, 2000),
    ...(date ? { date: date.toISOString() } : {}),
    size: message.size!,
  };
}

function queryFor(query: MailSearchQuery): Record<string, string | boolean> {
  if (
    !query ||
    typeof query !== 'object' ||
    Array.isArray(query) ||
    Object.keys(query).some(
      (name) => !['subject', 'from', 'since', 'before', 'unreadOnly'].includes(name),
    )
  )
    throw new ReadConnectorError('invalid_resource');
  const parsed: Record<string, string | boolean> = {};
  for (const name of ['subject', 'from', 'since', 'before'] as const) {
    const value = query[name];
    if (value === undefined) continue;
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > 200 ||
      /[\u0000-\u001f\u007f]/u.test(value)
    )
      throw new ReadConnectorError('invalid_resource');
    if (
      (name === 'since' || name === 'before') &&
      (!/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      throw new ReadConnectorError('invalid_resource');
    parsed[name] = value;
  }
  if (query.unreadOnly !== undefined && typeof query.unreadOnly !== 'boolean')
    throw new ReadConnectorError('invalid_resource');
  if (query.unreadOnly) parsed.seen = false;
  return parsed;
}

function queryKey(
  provider: string,
  subject: string,
  query: Record<string, string | boolean>,
): string {
  return createHash('sha256')
    .update(JSON.stringify([provider, subject, query]))
    .digest('hex')
    .slice(0, 24);
}
function cursorUpper(
  cursor: string | undefined,
  uidValidity: string,
  hash: string,
  lastUid: number,
): number {
  if (cursor === undefined) return lastUid;
  const match = /^([1-9][0-9]{0,9}):([1-9][0-9]{0,9}):([a-f0-9]{24})$/u.exec(cursor);
  if (!match || match[1] !== uidValidity || match[3] !== hash || Number(match[2]) > lastUid)
    throw new ReadConnectorError('invalid_resource');
  return Number(match[2]);
}

/** Two official, TLS-only inbox providers share the same small read-only IMAP implementation. */
export function createMailConnector(options: MailConnectorOptions): MailConnector {
  const provider = PROVIDERS[options.id];
  const stored = async (profile: string): Promise<MailCredentials> => {
    try {
      const raw = await options.credentials.get(key(options.id, profile));
      if (!raw || raw.length > 2048) throw new ReadConnectorError('authorization_failed');
      return credentialsFor(options.id, JSON.parse(raw) as unknown);
    } catch (error) {
      safeFailure(error);
    }
  };
  const disconnect = async (profile: string, signal?: AbortSignal) => {
    requireActive(signal);
    const credentialKey = key(options.id, profile);
    try {
      await options.credentials.get(credentialKey);
      await options.credentials.delete(credentialKey);
      if ((await options.credentials.get(credentialKey)) !== undefined)
        throw new ReadConnectorError('authorization_failed');
    } catch {
      throw new ReadConnectorError('authorization_failed');
    }
  };
  const guard = async (
    input: Omit<ReadConnectorInput, 'documentUrl'>,
    credential: MailCredentials,
    assertActive: () => void,
  ) => {
    assertActive();
    input.assertRead();
    await input.beforeRead();
    assertActive();
    input.assertRead();
    const current = await stored(input.profile);
    if (
      current.email !== credential.email ||
      current.authorizationCode !== credential.authorizationCode
    )
      throw new ReadConnectorError('identity_changed');
    assertActive();
    input.assertRead();
  };
  return {
    id: options.id,
    isAuthorizationUrl: (_value): _value is string => false,
    acceptsResource: (value) => parseMailResource(value)?.provider === provider.provider,
    inspect: async (profile, signal) => {
      try {
        const credential = await stored(profile);
        const verified = await withClient(options, credential, signal, async () =>
          identity(options.id, credential.email),
        );
        return { installed: true, version: 'imapflow-1.7.8', identity: verified };
      } catch {
        requireActive(signal);
        return {
          installed: true,
          version: 'imapflow-1.7.8',
          reason: '请开启邮箱 IMAP 服务，并使用客户端授权码连接。',
        };
      }
    },
    run: async (input) => {
      try {
        const credentialKey = key(options.id, input.profile);
        requireActive(input.signal);
        if ((await options.credentials.get(credentialKey)) !== undefined)
          throw new ReadConnectorError('identity_changed');
        input.onProgress({ phase: 'waiting_authorization' });
        const credential = credentialsFor(options.id, await options.requestCredentials(input));
        input.onProgress({ phase: 'verifying' });
        await withClient(options, credential, input.signal, async () => undefined);
        requireActive(input.signal);
        try {
          await options.credentials.set(credentialKey, JSON.stringify(credential));
          requireActive(input.signal);
          const persisted = await stored(input.profile);
          if (
            persisted.email !== credential.email ||
            persisted.authorizationCode !== credential.authorizationCode
          )
            throw new ReadConnectorError('authorization_failed');
        } catch (error) {
          await disconnect(input.profile);
          safeFailure(error, input.signal);
        }
      } catch (error) {
        safeFailure(error, input.signal);
      }
    },
    read: async (input) => {
      const resource = parseMailResource(input.documentUrl);
      if (!resource || resource.provider !== provider.provider)
        throw new ReadConnectorError('invalid_resource');
      await input.beforeRead();
      input.assertRead();
      const credential = await stored(input.profile);
      requireIdentity(input.expected, identity(options.id, credential.email));
      return withClient(options, credential, undefined, async (client, assertActive) => {
        await guard(input, credential, assertActive);
        const mailbox = mailboxDetails(await client.mailboxOpen('INBOX', { readOnly: true }));
        if (mailbox.uidValidity !== resource.uidValidity)
          throw new ReadConnectorError('invalid_resource');
        assertActive();
        input.assertRead();
        const metadata = await client.fetchOne(
          String(resource.uid),
          { envelope: true, size: true },
          { uid: true },
        );
        if (!metadata || metadata.uid !== resource.uid)
          throw new ReadConnectorError('invalid_resource');
        const details = messageMetadata(provider.provider, resource.uidValidity, metadata);
        if (details.size > MAX_SOURCE_BYTES) throw new ReadConnectorError('mail_message_too_large');
        await guard(input, credential, assertActive);
        // ImapFlow maps source to BODY.PEEK[], and EXAMINE protects message flags independently.
        const message = await client.fetchOne(
          String(resource.uid),
          { source: { start: 0, maxLength: MAX_SOURCE_BYTES + 1 } },
          { uid: true },
        );
        assertActive();
        input.assertRead();
        if (
          !message ||
          message.uid !== resource.uid ||
          !message.source ||
          message.source.length !== details.size
        )
          throw new ReadConnectorError('invalid_response');
        if (message.source.length > MAX_SOURCE_BYTES)
          throw new ReadConnectorError('mail_message_too_large');
        const parsed = await simpleParser(message.source, {
          skipTextToHtml: true,
          skipImageLinks: true,
          skipTextLinks: true,
          maxHtmlLengthToParse: MAX_BODY_BYTES,
        });
        assertActive();
        input.assertRead();
        if (parsed.text === undefined && typeof parsed.html === 'string') {
          if (Buffer.byteLength(parsed.html, 'utf8') > MAX_BODY_BYTES)
            throw new ReadConnectorError('resource_too_large');
          parsed.text = htmlToText(parsed.html, { limits: { maxInputLength: MAX_BODY_BYTES } });
        }
        if (parsed.attachments.length > 100) throw new ReadConnectorError('resource_too_large');
        const attachments = parsed.attachments.map(
          (attachment) =>
            `${header(attachment.filename, 280) || '（未命名附件）'} · ${header(attachment.contentType, 160)} · ${attachment.size} bytes`,
        );
        return checkReadConnectorDocument({
          documentId: `inbox/${resource.uidValidity}/${resource.uid}`,
          url: input.documentUrl,
          title: details.subject,
          revision: 0,
          content: [
            `主题: ${details.subject}`,
            `发件人: ${details.from}`,
            `收件人: ${details.to}`,
            ...(details.date ? [`日期: ${details.date}`] : []),
            `附件: ${attachments.length ? attachments.join('\n') : '无'}`,
            '',
            parsed.text ?? '（无纯文本正文）',
          ].join('\n'),
        });
      });
    },
    search: async (input) => {
      const query = queryFor(input.query);
      const limit = input.limit ?? 25;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25)
        throw new ReadConnectorError('invalid_resource');
      requireActive(input.signal);
      await input.beforeRead();
      input.assertRead();
      const credential = await stored(input.profile);
      requireIdentity(input.expected, identity(options.id, credential.email));
      const hash = queryKey(provider.provider, credential.email, query);
      return withClient(options, credential, input.signal, async (client, assertActive) => {
        await guard(input, credential, assertActive);
        const mailbox = mailboxDetails(await client.mailboxOpen('INBOX', { readOnly: true }));
        const to = cursorUpper(input.cursor, mailbox.uidValidity, hash, mailbox.lastUid);
        const from = Math.max(1, to - SEARCH_UID_WINDOW + 1);
        if (to === 0)
          return {
            messages: [],
            uidValidity: mailbox.uidValidity,
            scannedUidRange: { from: 0, to: 0 },
            hasMore: false,
          };
        await guard(input, credential, assertActive);
        const matches = await client.search({ uid: `${from}:${to}`, ...query }, { uid: true });
        assertActive();
        input.assertRead();
        if (
          !Array.isArray(matches) ||
          matches.length > SEARCH_UID_WINDOW ||
          matches.some((uid) => !Number.isSafeInteger(uid) || uid < from || uid > to) ||
          new Set(matches).size !== matches.length
        )
          throw new ReadConnectorError('invalid_response');
        const selected = matches.sort((left, right) => right - left).slice(0, limit);
        const messages: MailSearchMessage[] = [];
        for (const uid of selected) {
          await guard(input, credential, assertActive);
          const message = await client.fetchOne(
            String(uid),
            { envelope: true, size: true },
            { uid: true },
          );
          assertActive();
          input.assertRead();
          if (!message || message.uid !== uid) throw new ReadConnectorError('invalid_response');
          messages.push(messageMetadata(provider.provider, mailbox.uidValidity, message));
        }
        const next = matches.length > selected.length ? selected.at(-1)! - 1 : from - 1;
        return {
          messages,
          uidValidity: mailbox.uidValidity,
          scannedUidRange: { from, to },
          hasMore: next > 0,
          ...(next > 0 ? { nextCursor: `${mailbox.uidValidity}:${next}:${hash}` } : {}),
        };
      });
    },
    disconnect,
  };
}
