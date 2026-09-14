import {
  FeishuCliError,
  runFeishuCli,
  type FeishuCliRequest,
  type FeishuCliRunner,
} from './feishu-cli-runner.js';
import {
  feishuBaseCreateSpecSchema,
  feishuBaseUrlSchema,
  feishuDocumentUrlSchema,
  feishuFolderUrlSchema,
  feishuProfileSchema,
  MAX_PARTNER_REMOTE_TEXT_BYTES,
  type FeishuBaseCreateSpecT,
} from '@kodax-space/space-ipc-schema';
import { FEISHU_BASE_CREATE_SCOPES } from './feishu-scopes.js';
import { FEISHU_CLI_VERSION, isCompatibleFeishuCliVersion } from './feishu-cli-release.js';
export { FeishuCliError } from './feishu-cli-runner.js';
export type { FeishuCliRunner, FeishuCliErrorCode } from './feishu-cli-runner.js';

export interface FeishuIdentity {
  appId: string;
  openId: string;
  label: string;
  profile: string;
  scopes: readonly string[];
}

export interface FeishuStatus {
  installed: boolean;
  version?: string;
  identity?: FeishuIdentity;
  reason?: string;
}

export interface FeishuDocument {
  documentId: string;
  url: string;
  title: string;
  revision: number;
  content: string;
}
export interface FeishuAccountInput {
  profile: string;
  expected: { appId: string; openId: string };
}
export interface FeishuReadInput extends FeishuAccountInput {
  documentUrl: string;
  beforeRead?: () => Promise<void>;
  assertRead?: () => void;
}
export interface FeishuCreateInput extends FeishuAccountInput {
  folderUrl?: string;
  title: string;
  text: string;
  beforeDispatch?: () => Promise<void>;
  assertDispatch?: () => void;
}
export interface FeishuAppendInput extends FeishuReadInput {
  baseRevision: number;
  text: string;
  beforeDispatch?: () => Promise<void>;
  assertDispatch?: () => void;
}
export interface FeishuWriteResult {
  status: 'success' | 'partial' | 'unknown';
  documentId?: string;
  url?: string;
  revision?: number;
}
export type FeishuCreateBaseInput = FeishuAccountInput &
  FeishuBaseCreateSpecT & {
    beforeDispatch?: () => Promise<void>;
    assertDispatch?: () => void;
  };
export interface FeishuBaseWriteResult {
  status: 'success' | 'partial' | 'unknown';
  baseToken?: string;
  tableId?: string;
  url?: string;
}
const feishuToken = /^[A-Za-z0-9_-]{1,128}$/u;

function documentReference(
  value: string,
  kind: 'docx' | 'drive/folder' = 'docx',
): { id: string; url: string } {
  const schema = kind === 'docx' ? feishuDocumentUrlSchema : feishuFolderUrlSchema;
  if (!schema.safeParse(value).success) {
    throw new FeishuCliError('invalid_input', false);
  }
  return { id: value.split('/').at(-1)!, url: value };
}

function xmlText(text: string, maximum: number): string {
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > maximum ||
    Buffer.byteLength(text, 'utf8') > MAX_PARTNER_REMOTE_TEXT_BYTES ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)
  ) {
    throw new FeishuCliError('invalid_input', false);
  }
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/\r\n?|\n/gu, '<br/>');
}

function markdownDocumentText(text: string): string {
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > MAX_PARTNER_REMOTE_TEXT_BYTES ||
    Buffer.byteLength(text, 'utf8') > MAX_PARTNER_REMOTE_TEXT_BYTES ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text) ||
    /!\[/u.test(text) ||
    /<\s*(?:img|source|html5-block|whiteboard)\b/iu.test(text)
  ) {
    throw new FeishuCliError('invalid_input', false);
  }
  return text.normalize('NFC').replace(/\r\n?/gu, '\n');
}

function documentTitle(text: string): string {
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > 280 ||
    /[\r\n\u0000-\u001f\u007f]/u.test(text)
  ) {
    throw new FeishuCliError('invalid_input', false);
  }
  return text.normalize('NFC').trim();
}

function decodeMarkdownExportTitle(text: string): string {
  return text
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function markdownExportTitle(content: string, fallback: string): string {
  const firstLine = content
    .split('\n')
    .find((line) => line.trim())
    ?.trim();
  if (!firstLine) return fallback;
  const tagged = /^<title>(.*?)<\/title>$/u.exec(firstLine);
  const heading = /^#+\s+(.+?)\s*$/u.exec(firstLine);
  const title = decodeMarkdownExportTitle(tagged?.[1] ?? heading?.[1] ?? firstLine).trim();
  return title.slice(0, 280) || fallback;
}

function writeReceipt(envelope: Record<string, unknown>): FeishuWriteResult {
  const data = record(envelope.data);
  const doc = record(data.document);
  if (data.result !== undefined && data.result !== 'success' && data.result !== 'partial_success')
    return { status: 'unknown' };
  if (data.warnings !== undefined && !Array.isArray(data.warnings)) return { status: 'unknown' };
  if (envelope.ok !== true || envelope.identity !== 'user' || typeof doc.url !== 'string')
    return { status: 'unknown' };
  let ref: { id: string; url: string };
  try {
    ref = documentReference(doc.url);
  } catch {
    return { status: 'unknown' };
  }
  if (
    doc.document_id !== ref.id ||
    !Number.isSafeInteger(doc.revision_id) ||
    Number(doc.revision_id) < 1
  )
    return { status: 'unknown' };
  return {
    status:
      data.result === 'partial_success' ||
      (Array.isArray(data.warnings) && data.warnings.length > 0)
        ? 'partial'
        : 'success',
    documentId: ref.id,
    url: ref.url,
    revision: Number(doc.revision_id),
  };
}

function baseWriteReceipt(
  envelope: Record<string, unknown>,
  spec: FeishuBaseCreateSpecT,
): FeishuBaseWriteResult {
  const data = record(envelope.data);
  if (envelope.ok !== true || envelope.identity !== 'user' || data.created !== true)
    return { status: 'unknown' };
  if (data.result !== undefined && data.result !== 'success' && data.result !== 'partial_success')
    return { status: 'unknown' };
  const header = baseReceiptHeader(data, spec);
  if (!header) return { status: 'unknown' };
  const resource = baseReceiptResource(data, spec, header.base, header.token);
  const warningsExact =
    data.warnings === undefined || (Array.isArray(data.warnings) && data.warnings.length === 0);
  const exact =
    data.result !== 'partial_success' &&
    resource.exact &&
    baseReceiptBodyMatches(data, spec, resource.tableId) &&
    warningsExact;
  return {
    status: exact ? 'success' : 'partial',
    baseToken: header.token,
    ...(resource.tableId ? { tableId: resource.tableId } : {}),
    ...(resource.url ? { url: resource.url } : {}),
  };
}

function baseReceiptHeader(data: Record<string, unknown>, spec: FeishuBaseCreateSpecT) {
  const base = record(data.base);
  const appToken = base.app_token;
  const legacyToken = base.base_token;
  const token = appToken ?? legacyToken;
  if (
    typeof token !== 'string' ||
    !feishuToken.test(token) ||
    (typeof appToken === 'string' && typeof legacyToken === 'string' && appToken !== legacyToken) ||
    base.name !== spec.baseName
  )
    return undefined;
  return { base, token };
}

function baseReceiptResource(
  data: Record<string, unknown>,
  spec: FeishuBaseCreateSpecT,
  base: Record<string, unknown>,
  token: string,
) {
  let exact = true;
  const table = record(data.table);
  const primaryTableId = table.id;
  const legacyTableId = table.table_id;
  const tableId = primaryTableId ?? legacyTableId;
  if (
    typeof tableId !== 'string' ||
    !feishuToken.test(tableId) ||
    (typeof primaryTableId === 'string' &&
      typeof legacyTableId === 'string' &&
      primaryTableId !== legacyTableId) ||
    table.name !== spec.tableName
  )
    exact = false;

  let url: string | undefined;
  if (base.url === undefined) url = `https://www.feishu.cn/base/${token}`;
  else if (
    typeof base.url === 'string' &&
    feishuBaseUrlSchema.safeParse(base.url).success &&
    base.url.split('/').at(-1) === token
  )
    url = base.url;
  else exact = false;
  return {
    exact,
    tableId: typeof tableId === 'string' && feishuToken.test(tableId) ? tableId : undefined,
    url,
  };
}

function baseReceiptBodyMatches(
  data: Record<string, unknown>,
  spec: FeishuBaseCreateSpecT,
  tableId?: string,
): boolean {
  const receiptFields = data.fields;
  if (!Array.isArray(receiptFields) || receiptFields.length !== spec.fields.length) return false;
  if (!spec.fields.every((expected, index) => baseFieldMatches(receiptFields[index], expected)))
    return false;
  const deletedDefaultId = data.deleted_default_table_id;
  return !(
    data.default_table_deleted !== true ||
    typeof deletedDefaultId !== 'string' ||
    !feishuToken.test(deletedDefaultId) ||
    deletedDefaultId === tableId
  );
}

function baseFieldMatches(
  value: unknown,
  expected: FeishuBaseCreateSpecT['fields'][number],
): boolean {
  const actual = record(value);
  if (
    typeof actual.id !== 'string' ||
    !feishuToken.test(actual.id) ||
    actual.name !== expected.name ||
    actual.type !== expected.type
  )
    return false;
  if (expected.type === 'select') return baseSelectMatches(actual, expected);
  if (expected.type !== 'datetime') return true;
  const actualStyle = record(actual.style);
  return expected.style ? actualStyle.format === expected.style.format : actual.style === undefined;
}

function baseSelectMatches(
  actual: Record<string, unknown>,
  expected: Extract<FeishuBaseCreateSpecT['fields'][number], { type: 'select' }>,
): boolean {
  const options = actual.options;
  if (actual.multiple !== expected.multiple || !Array.isArray(options)) return false;
  if (options.length !== expected.options.length) return false;
  return expected.options.every((option, index) => record(options[index]).name === option.name);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJSON(text: string, dispatched = false): Record<string, unknown> {
  try {
    return record(JSON.parse(text) as unknown);
  } catch {
    throw new FeishuCliError('invalid_response', dispatched);
  }
}

function requireProfile(profile: string): void {
  if (!feishuProfileSchema.safeParse(profile).success) {
    throw new FeishuCliError('invalid_input', false);
  }
}

function verifiedIdentity(data: Record<string, unknown>, profile: string): FeishuIdentity {
  const user = record(record(data.identities).user);
  if (
    data.brand !== 'feishu' ||
    typeof data.appId !== 'string' ||
    !/^cli_[\w-]{1,128}$/u.test(data.appId) ||
    user.available !== true ||
    user.verified !== true ||
    typeof user.openId !== 'string' ||
    !/^ou_[\w-]{1,128}$/u.test(user.openId) ||
    typeof user.scope !== 'string' ||
    user.scope.length > 16384
  ) {
    throw new FeishuCliError('not_connected', false);
  }
  const label =
    typeof user.userName === 'string'
      ? user.userName
          .replace(/[\u0000-\u001f\u007f]/gu, '')
          .trim()
          .slice(0, 120) || profile
      : profile;
  return {
    appId: data.appId,
    openId: user.openId,
    label,
    profile,
    scopes: user.scope.split(/\s+/u).filter(Boolean),
  };
}

export class FeishuCli {
  constructor(private readonly runner: FeishuCliRunner = runFeishuCli) {}

  async listProfiles(): Promise<Array<{ name: string; label: string }>> {
    try {
      const probe = await this.runner({ args: ['--version'] });
      if (probe.exitCode !== 0 || !isCompatibleFeishuCliVersion(probe.stdout))
        throw new FeishuCliError('unsupported_version', false);
      const response = await this.runner({ args: ['profile', 'list'] });
      if (response.exitCode !== 0) throw new FeishuCliError('not_connected', false);
      const values: unknown = JSON.parse(response.stdout);
      if (!Array.isArray(values) || values.length > 256)
        throw new FeishuCliError('invalid_response', false);
      const profiles = new Map<string, { name: string; label: string }>();
      for (const value of values) {
        const item = record(value);
        if (item.brand !== 'feishu' || !feishuProfileSchema.safeParse(item.name).success) continue;
        const name = String(item.name);
        if (profiles.has(name)) continue;
        const label =
          typeof item.user === 'string'
            ? item.user.replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 160)
            : name;
        profiles.set(name, { name, label });
      }
      return [...profiles.values()].slice(0, 64);
    } catch (error) {
      if (error instanceof FeishuCliError) throw error;
      throw new FeishuCliError('invalid_response', false);
    }
  }

  private async dispatch(
    request: FeishuCliRequest,
    write = false,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.runner(request);
      if (response.exitCode !== 0) throw new FeishuCliError('command_failed', write);
      return parseJSON(response.stdout, write);
    } catch (error) {
      if (error instanceof FeishuCliError)
        throw new FeishuCliError(error.code, write && error.dispatched);
      throw new FeishuCliError('command_failed', write);
    }
  }

  private async authorize(input: FeishuAccountInput, scopes: readonly string[]): Promise<void> {
    const status = await this.inspect(input.profile);
    if (!status.installed) throw new FeishuCliError('cli_missing', false);
    if (status.version !== FEISHU_CLI_VERSION)
      throw new FeishuCliError('unsupported_version', false);
    if (!status.identity) throw new FeishuCliError('not_connected', false);
    if (
      status.identity.appId !== input.expected.appId ||
      status.identity.openId !== input.expected.openId
    ) {
      throw new FeishuCliError('identity_changed', false);
    }
    if (scopes.some((scope) => !status.identity?.scopes.includes(scope)))
      throw new FeishuCliError('missing_scope', false);
  }

  async read(input: FeishuReadInput): Promise<FeishuDocument> {
    const ref = documentReference(input.documentUrl);
    await this.authorize(input, ['docx:document:readonly']);
    await input.beforeRead?.();
    input.assertRead?.();
    const envelope = await this.dispatch({
      args: [
        `--profile=${input.profile}`,
        'docs',
        '+fetch',
        '--as',
        'user',
        '--format',
        'json',
        '--doc',
        ref.id,
        '--doc-format',
        'markdown',
        '--detail',
        'simple',
      ],
    });
    const doc = record(record(envelope.data).document);
    if (
      envelope.ok !== true ||
      envelope.identity !== 'user' ||
      doc.document_id !== ref.id ||
      !Number.isSafeInteger(doc.revision_id) ||
      Number(doc.revision_id) < 1 ||
      typeof doc.content !== 'string' ||
      doc.content.includes('\0') ||
      Buffer.byteLength(doc.content, 'utf8') > MAX_PARTNER_REMOTE_TEXT_BYTES
    ) {
      throw new FeishuCliError('invalid_response', false);
    }
    return {
      documentId: ref.id,
      url: ref.url,
      title: markdownExportTitle(doc.content, ref.id),
      revision: Number(doc.revision_id),
      content: doc.content,
    };
  }

  async create(input: FeishuCreateInput): Promise<FeishuWriteResult> {
    const parentArgs = input.folderUrl
      ? ['--parent-token', documentReference(input.folderUrl, 'drive/folder').id]
      : ['--parent-position', 'my_library'];
    const title = documentTitle(input.title);
    const content = markdownDocumentText(input.text);
    await this.authorize(input, ['docx:document:create']);
    await input.beforeDispatch?.();
    input.assertDispatch?.();
    const envelope = await this.dispatch(
      {
        args: [
          `--profile=${input.profile}`,
          'docs',
          '+create',
          '--as',
          'user',
          '--format',
          'json',
          '--doc-format',
          'markdown',
          '--title',
          title,
          ...parentArgs,
          '--content',
          '-',
        ],
        stdin: content,
      },
      true,
    );
    return writeReceipt(envelope);
  }

  async createBase(input: FeishuCreateBaseInput): Promise<FeishuBaseWriteResult> {
    const parsed = feishuBaseCreateSpecSchema.safeParse({
      folderUrl: input.folderUrl,
      baseName: input.baseName,
      tableName: input.tableName,
      fields: input.fields,
    });
    if (!parsed.success) throw new FeishuCliError('invalid_input', false);
    const spec = parsed.data;
    const folderArgs = spec.folderUrl
      ? ['--folder-token', documentReference(spec.folderUrl, 'drive/folder').id]
      : [];
    const fields = JSON.stringify(spec.fields);
    await this.authorize(input, FEISHU_BASE_CREATE_SCOPES);
    await input.beforeDispatch?.();
    await this.authorize(input, FEISHU_BASE_CREATE_SCOPES);
    input.assertDispatch?.();
    const envelope = await this.dispatch(
      {
        args: [
          `--profile=${input.profile}`,
          'base',
          '+base-create',
          '--as',
          'user',
          '--format',
          'json',
          '--name',
          spec.baseName,
          ...folderArgs,
          '--time-zone',
          'Asia/Shanghai',
          '--table-name',
          spec.tableName,
          '--fields',
          fields,
        ],
      },
      true,
    );
    return baseWriteReceipt(envelope, spec);
  }

  async append(input: FeishuAppendInput): Promise<FeishuWriteResult> {
    const ref = documentReference(input.documentUrl);
    const content = `<p>${xmlText(input.text, MAX_PARTNER_REMOTE_TEXT_BYTES)}</p>`;
    if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 1)
      throw new FeishuCliError('invalid_input', false);
    const current = await this.read(input);
    if (current.revision !== input.baseRevision)
      throw new FeishuCliError('revision_changed', false);
    await this.authorize(input, ['docx:document:readonly', 'docx:document:write_only']);
    await input.beforeDispatch?.();
    // CLI forwards this baseline; it does not promise atomic CAS or account pinning.
    input.assertDispatch?.();
    const envelope = await this.dispatch(
      {
        args: [
          `--profile=${input.profile}`,
          'docs',
          '+update',
          '--as',
          'user',
          '--format',
          'json',
          '--doc',
          ref.id,
          '--command',
          'append',
          '--revision-id',
          String(input.baseRevision),
          '--doc-format',
          'xml',
          '--content',
          '-',
        ],
        stdin: content,
      },
      true,
    );
    const data = record(envelope.data);
    const doc = record(data.document);
    if (
      (data.result !== 'success' && data.result !== 'partial_success') ||
      (doc.document_id !== undefined && doc.document_id !== ref.id) ||
      (doc.url !== undefined && doc.url !== ref.url) ||
      Number(doc.revision_id) <= input.baseRevision ||
      !Number.isSafeInteger(data.updated_blocks_count) ||
      Number(data.updated_blocks_count) < 1
    )
      return { status: 'unknown' };
    return writeReceipt({
      ...envelope,
      data: { ...data, document: { document_id: ref.id, url: ref.url, ...doc } },
    });
  }

  async inspect(profile: string, signal?: AbortSignal): Promise<FeishuStatus> {
    requireProfile(profile);
    let version: string | undefined;
    try {
      const probe = await this.runner({ args: ['--version'], ...(signal ? { signal } : {}) });
      version = /^lark-cli version (\d+\.\d+\.\d+)\s*$/u.exec(probe.stdout)?.[1];
      if (probe.exitCode !== 0 || version !== FEISHU_CLI_VERSION)
        throw new FeishuCliError('unsupported_version', false);
      const result = await this.runner({
        args: [`--profile=${profile}`, 'auth', 'status', '--json', '--verify'],
        ...(signal ? { signal } : {}),
      });
      if (result.exitCode !== 0) throw new FeishuCliError('not_connected', false);
      return {
        installed: true,
        version,
        identity: verifiedIdentity(parseJSON(result.stdout), profile),
      };
    } catch (error) {
      const safe =
        error instanceof FeishuCliError ? error : new FeishuCliError('not_connected', false);
      return {
        installed: safe.code !== 'cli_missing',
        ...(version ? { version } : {}),
        reason: safe.message,
      };
    }
  }
}
