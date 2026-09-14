import { z } from 'zod';

const identity = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const feishuDocumentUrlSchema = z
  .string()
  .max(512)
  .regex(/^https:\/\/[a-z0-9-]+\.feishu\.cn\/docx\/[A-Za-z0-9]{1,128}$/);
export const feishuFolderUrlSchema = z
  .string()
  .max(512)
  .regex(/^https:\/\/[a-z0-9-]+\.feishu\.cn\/drive\/folder\/[A-Za-z0-9]{1,128}$/);
export const feishuBaseUrlSchema = z
  .string()
  .max(512)
  .regex(/^https:\/\/[a-z0-9-]+\.feishu\.cn\/base\/[A-Za-z0-9_-]{1,128}$/);
export const FEISHU_MY_LIBRARY_TARGET = 'feishu://my-library' as const;

export const partnerConnectorAdapterSchema = z.enum([
  'feishu-cli',
  'wecom-cli',
  'dingtalk-cli',
  'tencent-meeting-cli',
  'notion-mcp',
  'airtable-mcp',
  'atlassian-mcp',
  'slack-mcp',
  'zoom-mcp',
  'github-api',
  'tencent-docs-mcp',
  'netease-mail-imap',
  'qq-mail-imap',
]);
export type PartnerConnectorAdapterT = z.infer<typeof partnerConnectorAdapterSchema>;
export const wecomResourceSchema = z
  .string()
  .max(512)
  .regex(/^(?:wecom:\/\/document\/|https:\/\/doc\.weixin\.qq\.com\/doc\/)[A-Za-z0-9_-]{1,128}$/);
export const dingtalkResourceSchema = z
  .string()
  .max(512)
  .regex(
    /^(?:dingtalk:\/\/document\/|https:\/\/alidocs\.dingtalk\.com\/i\/nodes\/)[A-Za-z0-9_-]{1,128}$/,
  );
export const dingtalkDocumentUrlSchema = z
  .string()
  .max(512)
  .regex(/^https:\/\/alidocs\.dingtalk\.com\/i\/nodes\/[A-Za-z0-9_-]{1,128}$/);
export const tencentDocumentUrlSchema = z
  .string()
  .max(512)
  .regex(/^https:\/\/docs\.qq\.com\/doc\/[A-Za-z0-9_-]{1,128}$/);
export const tencentMeetingResourceSchema = z
  .string()
  .max(512)
  .regex(/^tmeet:\/\/meeting-code\/[0-9]{6,15}$/);
export const notionResourceSchema = z
  .string()
  .max(512)
  .regex(/^notion:\/\/page\/[0-9a-f]{32}$/);
export const airtableResourceSchema = z
  .string()
  .max(512)
  .regex(/^airtable:\/\/base\/app[A-Za-z0-9]{10,32}\/table\/tbl[A-Za-z0-9]{10,32}$/);
const atlassianCloudId = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const atlassianSite = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.atlassian\\.net';
export const atlassianResourceSchema: z.ZodType<string> = z.union([
  z
    .string()
    .max(512)
    .regex(
      new RegExp(`^atlassian://jira/${atlassianCloudId}/[A-Z][A-Z0-9]{0,31}-[1-9][0-9]{0,15}$`),
    ),
  z
    .string()
    .max(512)
    .regex(new RegExp(`^atlassian://confluence/${atlassianCloudId}/[1-9][0-9]{0,31}$`)),
  z
    .string()
    .max(512)
    .regex(new RegExp(`^https://${atlassianSite}/browse/[A-Z][A-Z0-9]{0,31}-[1-9][0-9]{0,15}$`)),
  z
    .string()
    .max(512)
    .regex(
      new RegExp(
        `^https://${atlassianSite}/wiki/spaces/[A-Za-z0-9_-]{1,128}/pages/[1-9][0-9]{0,31}(?:/[A-Za-z0-9%._~-]{1,200})?$`,
      ),
    ),
]);
export const slackResourceSchema = z
  .string()
  .max(512)
  .regex(
    /^(?:slack:\/\/channel\/[A-Z][A-Z0-9]{8,15}\/message\/[0-9]{10}\.[0-9]{6}|https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.slack\.com\/archives\/[A-Z][A-Z0-9]{8,15}\/p[0-9]{16})$/,
  );
export const zoomResourceSchema = z
  .string()
  .max(512)
  .regex(
    /^(?:zoom:\/\/meeting\/|https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)?zoom\.us\/j\/)[0-9]{9,11}$/,
  );
export const githubResourceSchema = z
  .string()
  .max(256)
  .regex(
    /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}(?:\/(?:issues|pull)\/[1-9][0-9]{0,9})?$/,
  )
  .refine((value) => {
    const name = value.split('/')[4];
    return name !== '.' && name !== '..';
  });
const imapIdentifier = '[1-9][0-9]{0,9}';
const mailReference = (provider: string) =>
  z
    .string()
    .max(128)
    .regex(new RegExp(`^mail://${provider}/inbox/${imapIdentifier}/${imapIdentifier}$`))
    .refine((value) =>
      value
        .split('/')
        .slice(-2)
        .every((part) => Number(part) <= 4_294_967_295),
    );
export const neteaseMailResourceSchema = mailReference('netease');
export const qqMailResourceSchema = mailReference('qq');
export const isPartnerMailAdapter = (adapter: PartnerConnectorAdapterT): boolean =>
  adapter === 'netease-mail-imap' || adapter === 'qq-mail-imap';
export function partnerMailboxAllowsResource(
  adapter: PartnerConnectorAdapterT,
  mailbox: 'inbox' | undefined,
  ref: string,
): boolean {
  return (
    mailbox === 'inbox' && isPartnerMailAdapter(adapter) && isPartnerConnectorResource(adapter, ref)
  );
}
export const partnerReadResourceSchema: z.ZodType<string> = z.union([
  feishuDocumentUrlSchema,
  wecomResourceSchema,
  dingtalkResourceSchema,
  tencentMeetingResourceSchema,
  notionResourceSchema,
  airtableResourceSchema,
  atlassianResourceSchema,
  slackResourceSchema,
  zoomResourceSchema,
  githubResourceSchema,
  tencentDocumentUrlSchema,
  neteaseMailResourceSchema,
  qqMailResourceSchema,
]);
const resourceSchemas: Record<PartnerConnectorAdapterT, z.ZodType<string>> = {
  'feishu-cli': feishuDocumentUrlSchema,
  'wecom-cli': wecomResourceSchema,
  'dingtalk-cli': dingtalkResourceSchema,
  'tencent-meeting-cli': tencentMeetingResourceSchema,
  'notion-mcp': notionResourceSchema,
  'airtable-mcp': airtableResourceSchema,
  'atlassian-mcp': atlassianResourceSchema,
  'slack-mcp': slackResourceSchema,
  'zoom-mcp': zoomResourceSchema,
  'github-api': githubResourceSchema,
  'tencent-docs-mcp': tencentDocumentUrlSchema,
  'netease-mail-imap': neteaseMailResourceSchema,
  'qq-mail-imap': qqMailResourceSchema,
};
export function isPartnerConnectorResource(
  adapter: PartnerConnectorAdapterT,
  value: string,
): boolean {
  return resourceSchemas[adapter].safeParse(value).success;
}

/** Canonical provider-owned identity for comparing request scope with adapter results. */
export function partnerConnectorResourceKey(
  adapter: PartnerConnectorAdapterT,
  value: string,
): string | undefined {
  if (!isPartnerConnectorResource(adapter, value)) return undefined;
  if (isPartnerMailAdapter(adapter)) return value.split('/').slice(3).join('/');
  if (adapter === 'notion-mcp') return /^notion:\/\/page\/([0-9a-f]{32})$/u.exec(value)?.[1];
  if (adapter === 'airtable-mcp') {
    const match =
      /^airtable:\/\/base\/(app[A-Za-z0-9]{10,32})\/table\/(tbl[A-Za-z0-9]{10,32})$/u.exec(value);
    return match ? `${match[1]}/${match[2]}` : undefined;
  }
  if (adapter === 'atlassian-mcp') {
    const match = /^atlassian:\/\/(jira|confluence)\/([^/]+)\/([^/]+)$/u.exec(value);
    if (match) return `${match[2]}/${match[1]}/${match[3]}`;
    try {
      const url = new URL(value);
      const jira = /^\/browse\/([A-Z][A-Z0-9]{0,31}-[1-9][0-9]{0,15})$/u.exec(url.pathname);
      if (jira) return `${url.hostname}/jira/${jira[1]}`;
      const confluence =
        /^\/wiki\/spaces\/[A-Za-z0-9_-]{1,128}\/pages\/([1-9][0-9]{0,31})(?:\/[A-Za-z0-9%._~-]{1,200})?$/u.exec(
          url.pathname,
        );
      return confluence ? `${url.hostname}/confluence/${confluence[1]}` : undefined;
    } catch {
      return undefined;
    }
  }
  if (adapter === 'slack-mcp') {
    const match = /^slack:\/\/channel\/([^/]+)\/message\/([^/]+)$/u.exec(value);
    if (match) return `${match[1]}/${match[2]}`;
    const parts = new URL(value).pathname.split('/');
    const timestamp = parts[3]!.slice(1);
    return `${parts[2]}/${timestamp.slice(0, 10)}.${timestamp.slice(10)}`;
  }
  if (adapter === 'zoom-mcp') return value.split('/').at(-1);
  if (adapter === 'github-api') return new URL(value).pathname.slice(1);
  return value.split('/').at(-1);
}

/** Only adapters implemented by the trusted host can be declared by a package. */
export const spaceConnectorDefinitionSchema = z
  .object({
    id: identity,
    adapter: partnerConnectorAdapterSchema,
    name: z.string().trim().min(1).max(80),
    description: z.string().max(280),
  })
  .strict();
export type SpaceConnectorDefinitionT = z.infer<typeof spaceConnectorDefinitionSchema>;

const selectionObject = z
  .object({
    extensionId: identity,
    connectorId: identity,
    connectionId: z.string().uuid(),
    connectionRevision: revision,
    /** Missing adapter is the legacy Feishu format, never an inferred new provider. */
    adapter: partnerConnectorAdapterSchema.optional(),
    documents: z
      .array(
        z.object({ url: partnerReadResourceSchema, access: z.enum(['read', 'append']) }).strict(),
      )
      .max(32),
    mailbox: z.literal('inbox').optional(),
    allowCreateDocument: z.boolean().optional(),
    createFolderUrl: feishuFolderUrlSchema.optional(),
    createBaseFolderUrl: feishuFolderUrlSchema.optional(),
  })
  .strict();
const uniqueDocuments = (value: z.infer<typeof selectionObject>): boolean => {
  const adapter = value.adapter ?? 'feishu-cli';
  const keys = value.documents.map((document) =>
    partnerConnectorResourceKey(adapter, document.url),
  );
  return keys.every((key) => key !== undefined) && new Set(keys).size === keys.length;
};
const validProviderScope = (value: z.infer<typeof selectionObject>): boolean => {
  const adapter = value.adapter ?? 'feishu-cli';
  return (
    (value.mailbox === undefined || isPartnerMailAdapter(adapter)) &&
    (value.allowCreateDocument === undefined || adapter === 'tencent-docs-mcp') &&
    value.documents.every((item) => isPartnerConnectorResource(adapter, item.url)) &&
    (adapter === 'feishu-cli' ||
      (!value.createFolderUrl &&
        !value.createBaseFolderUrl &&
        value.documents.every((item) => item.access === 'read')))
  );
};
export const partnerConnectorSelectionSchema = selectionObject
  .refine(uniqueDocuments, 'Duplicate document scope')
  .refine(validProviderScope, 'Resource does not match adapter or read-only capability');
export type PartnerConnectorSelectionT = z.infer<typeof partnerConnectorSelectionSchema>;

export const partnerConnectorSnapshotSchema = selectionObject
  .extend({
    name: z.string().min(1).max(80),
    accountLabel: z.string().min(1).max(160),
  })
  .refine(uniqueDocuments, 'Duplicate document scope')
  .refine(validProviderScope, 'Resource does not match adapter or read-only capability');
export type PartnerConnectorSnapshotT = z.infer<typeof partnerConnectorSnapshotSchema>;
export const partnerConnectorSelectionsSchema = z
  .array(partnerConnectorSelectionSchema)
  .max(8)
  .refine(
    (items) => new Set(items.map((item) => item.connectionId)).size === items.length,
    'Duplicate connection',
  );
export const partnerConnectorSnapshotsSchema = z.array(partnerConnectorSnapshotSchema).max(8);
export const partnerConnectorStateSchema = z
  .object({
    connectors: z
      .array(
        z
          .object({
            binding: partnerConnectorSnapshotSchema,
            available: z.boolean(),
            unavailableReason: z.string().max(280).optional(),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type PartnerConnectorStateT = z.infer<typeof partnerConnectorStateSchema>;

export const feishuProfileSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
export const partnerConnectorConnectionSchema = z
  .object({
    id: z.string().uuid(),
    extensionId: identity,
    connectorId: identity,
    revision,
    adapter: partnerConnectorAdapterSchema.optional(),
    profile: feishuProfileSchema,
    accountLabel: z.string().min(1).max(160),
    connected: z.boolean(),
    permissions: z
      .object({
        read: z.boolean(),
        create: z.boolean(),
        append: z.boolean(),
        createBase: z.boolean().default(false),
      })
      .strict(),
  })
  .strict();
export type PartnerConnectorConnectionT = z.infer<typeof partnerConnectorConnectionSchema>;
export const partnerConnectorInspectionSchema = z
  .object({
    installed: z.boolean(),
    version: z.string().max(80).optional(),
    reason: z.string().max(280).optional(),
    profiles: z
      .array(z.object({ name: feishuProfileSchema, label: z.string().max(160) }).strict())
      .max(64),
    connections: z.array(partnerConnectorConnectionSchema).max(64),
  })
  .strict();
export type PartnerConnectorInspectionT = z.infer<typeof partnerConnectorInspectionSchema>;

export const MAX_PARTNER_REMOTE_TEXT_BYTES = 128 * 1024;
const remoteText = z
  .string()
  .max(MAX_PARTNER_REMOTE_TEXT_BYTES)
  .refine(
    (text) =>
      !text.includes('\0') &&
      new TextEncoder().encode(text).length <= MAX_PARTNER_REMOTE_TEXT_BYTES,
    'Remote text exceeds the UTF-8 limit or contains NUL',
  );
export const partnerMailSearchQuerySchema = z
  .object({
    subject: z.string().trim().min(1).max(200).optional(),
    from: z.string().trim().min(1).max(200).optional(),
    since: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    before: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    unreadOnly: z.boolean().optional(),
  })
  .strict();
export const partnerConnectorSearchInputSchema = z
  .object({
    connectionId: z.string().uuid(),
    query: partnerMailSearchQuerySchema,
    cursor: z.string().min(1).max(256).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  })
  .strict();
export const partnerConnectorSearchResultSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            reference: z.union([neteaseMailResourceSchema, qqMailResourceSchema]),
            subject: z.string().max(280),
            from: z.string().max(1000),
            to: z.string().max(2000),
            date: z.string().datetime().optional(),
            size: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(25),
    nextCursor: z.string().max(256).optional(),
    uidValidity: z.string().regex(/^[1-9][0-9]{0,9}$/),
    scannedUidRange: z
      .object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative() })
      .strict(),
    hasMore: z.boolean(),
  })
  .strict();
export type PartnerConnectorSearchInputT = z.infer<typeof partnerConnectorSearchInputSchema>;
export type PartnerConnectorSearchResultT = z.infer<typeof partnerConnectorSearchResultSchema>;
export const partnerConnectorDocumentCreateInputSchema = z
  .object({
    connectionId: z.string().uuid(),
    title: z.string().trim().min(1).max(280),
    content: remoteText.refine((value) => value.trim().length > 0, '文档内容不能为空'),
  })
  .strict();
export type PartnerConnectorDocumentCreateInputT = z.infer<
  typeof partnerConnectorDocumentCreateInputSchema
>;
export const partnerFeishuDocumentCreateInputSchema = z
  .object({
    folderUrl: feishuFolderUrlSchema.optional(),
    title: z.string().trim().min(1).max(280),
    content: remoteText.refine((text) => text.trim().length > 0, 'Document content is required'),
  })
  .strict();
export type PartnerFeishuDocumentCreateInputT = z.infer<
  typeof partnerFeishuDocumentCreateInputSchema
>;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const sessionId = z.string().min(1).max(128);
const projectRoot = z.string().min(1).max(4096);
const context = z.object({ sessionId, projectRoot }).strict();
const owner = {
  id: z.string().uuid(),
  sessionId,
  projectRoot,
  extensionId: identity,
  connectorId: identity,
  connectionId: z.string().uuid(),
};

const MAX_FEISHU_BASE_LABEL_LENGTH = 100;
const MAX_FEISHU_BASE_FIELDS = 20;
const MAX_FEISHU_BASE_SELECT_OPTIONS = 100;
const FEISHU_BASE_DATETIME_FORMATS = [
  'yyyy/MM/dd',
  'yyyy/MM/dd HH:mm',
  'yyyy/MM/dd HH:mm Z',
  'yyyy-MM-dd',
  'yyyy-MM-dd HH:mm',
  'yyyy-MM-dd HH:mm Z',
  'MM-dd',
  'MM/dd/yyyy',
  'dd/MM/yyyy',
] as const;
const baseLabel = z
  .string()
  .trim()
  .min(1)
  .max(MAX_FEISHU_BASE_LABEL_LENGTH)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), 'Base label contains control text');
const baseSelectOptionSchema = z.object({ name: baseLabel }).strict();
const baseFieldSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), name: baseLabel }).strict(),
  z.object({ type: z.literal('number'), name: baseLabel }).strict(),
  z
    .object({
      type: z.literal('select'),
      name: baseLabel,
      multiple: z.boolean().default(false),
      options: z.array(baseSelectOptionSchema).min(1).max(MAX_FEISHU_BASE_SELECT_OPTIONS),
    })
    .strict(),
  z
    .object({
      type: z.literal('datetime'),
      name: baseLabel,
      style: z
        .object({
          format: z.enum(FEISHU_BASE_DATETIME_FORMATS),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal('checkbox'), name: baseLabel }).strict(),
]);
export const feishuBaseCreateFieldsSchema = z
  .array(baseFieldSchema)
  .min(1)
  .max(MAX_FEISHU_BASE_FIELDS)
  .superRefine((fields, ctx) => {
    if (fields[0]?.type !== 'text')
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'The first Base field must be text' });
    if (new Set(fields.map((field) => field.name)).size !== fields.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Base field names must be unique' });
    fields.forEach((field, index) => {
      if (
        field.type === 'select' &&
        new Set(field.options.map((option) => option.name)).size !== field.options.length
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'options'],
          message: 'Base select option names must be unique',
        });
    });
  });
export type FeishuBaseCreateFieldT = z.infer<typeof baseFieldSchema>;
/** `lark-cli +base-create` accepts fields as one argv value (runner maximum: 8192). */
export const MAX_FEISHU_BASE_FIELDS_JSON_BYTES = 8 * 1024;
const feishuBaseCreateSpecShape = {
  folderUrl: feishuFolderUrlSchema.optional(),
  baseName: baseLabel,
  tableName: baseLabel,
  fields: feishuBaseCreateFieldsSchema,
};
const boundedBaseSpec = (
  spec: { fields: readonly FeishuBaseCreateFieldT[] },
  ctx: z.RefinementCtx,
) => {
  if (
    new TextEncoder().encode(JSON.stringify(spec.fields)).length > MAX_FEISHU_BASE_FIELDS_JSON_BYTES
  )
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fields'],
      message: 'Base fields exceed the CLI argument limit',
    });
};
export const feishuBaseCreateSpecSchema = z
  .object(feishuBaseCreateSpecShape)
  .strict()
  .superRefine(boundedBaseSpec);
export type FeishuBaseCreateSpecT = z.infer<typeof feishuBaseCreateSpecSchema>;
export const partnerFeishuBaseCreateInputSchema = z
  .object({ ...feishuBaseCreateSpecShape, connectionId: z.string().uuid() })
  .strict()
  .superRefine(boundedBaseSpec);
export type PartnerFeishuBaseCreateInputT = z.infer<typeof partnerFeishuBaseCreateInputSchema>;

const baseLabelJsonSchema = {
  type: 'string',
  minLength: 1,
  maxLength: MAX_FEISHU_BASE_LABEL_LENGTH,
  pattern: '^(?=.*\\S)[^\\u0000-\\u001f\\u007f]+$',
} as const;
const baseFieldJsonSchemas = [
  {
    type: 'object',
    additionalProperties: false,
    properties: { type: { const: 'text' }, name: baseLabelJsonSchema },
    required: ['type', 'name'],
  },
  {
    type: 'object',
    additionalProperties: false,
    properties: { type: { const: 'number' }, name: baseLabelJsonSchema },
    required: ['type', 'name'],
  },
  {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { const: 'select' },
      name: baseLabelJsonSchema,
      multiple: { type: 'boolean' },
      options: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_FEISHU_BASE_SELECT_OPTIONS,
        description: 'Option names must be unique within this field.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { name: baseLabelJsonSchema },
          required: ['name'],
        },
      },
    },
    required: ['type', 'name', 'options'],
  },
  {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { const: 'datetime' },
      name: baseLabelJsonSchema,
      style: {
        type: 'object',
        additionalProperties: false,
        properties: { format: { type: 'string', enum: FEISHU_BASE_DATETIME_FORMATS } },
        required: ['format'],
      },
    },
    required: ['type', 'name'],
  },
  {
    type: 'object',
    additionalProperties: false,
    properties: { type: { const: 'checkbox' }, name: baseLabelJsonSchema },
    required: ['type', 'name'],
  },
] as const;

/** Model-visible schema for the Base tool; execution is still enforced by the Zod contract above. */
export const partnerFeishuBaseCreateToolInputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    connectionId: { type: 'string', format: 'uuid' },
    folderUrl: {
      type: 'string',
      maxLength: 512,
      pattern: '^https://[a-z0-9-]+\\.feishu\\.cn/drive/folder/[A-Za-z0-9]{1,128}$',
    },
    baseName: baseLabelJsonSchema,
    tableName: baseLabelJsonSchema,
    fields: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_FEISHU_BASE_FIELDS,
      description:
        'The first field must be text. Field names and select option names must be unique. The serialized fields value must stay within 8192 UTF-8 bytes.',
      items: { oneOf: baseFieldJsonSchemas },
    },
  },
  required: ['connectionId', 'baseName', 'tableName', 'fields'],
} as const;
const baseToken = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
export const partnerFeishuBaseCreateTaskSchema = z
  .object({
    ...owner,
    connectionRevision: revision,
    folderUrl: feishuFolderUrlSchema.optional(),
    baseName: baseLabel,
    tableName: baseLabel,
    fields: feishuBaseCreateFieldsSchema,
    timeZone: z.literal('Asia/Shanghai'),
    inputHash: hash,
    scopeHash: hash,
    status: z.enum(['preparing', 'submitting', 'succeeded', 'unknown', 'partial', 'failed']),
    baseToken: baseToken.optional(),
    tableId: baseToken.optional(),
    url: feishuBaseUrlSchema.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    error: z.string().max(280).optional(),
  })
  .strict()
  .superRefine((task, ctx) => {
    if (task.baseToken && task.url?.split('/').at(-1) !== task.baseToken)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: 'Base task URL must match its Base token',
      });
    if (task.status !== 'succeeded') return;
    for (const key of ['baseToken', 'tableId', 'url'] as const) {
      if (task[key] === undefined)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `Successful Base task requires ${key}`,
        });
    }
  });
export type PartnerFeishuBaseCreateTaskT = z.infer<typeof partnerFeishuBaseCreateTaskSchema>;

/**
 * Stable provider identifier supplied by a connector adapter. Partner deliberately
 * keeps this open so installing another office connector does not require a host
 * schema release.
 */
export const partnerNativeDocumentProviderSchema = identity;
export type PartnerNativeDocumentProviderT = z.infer<typeof partnerNativeDocumentProviderSchema>;
const partnerNativeDocumentCandidateSchema = z
  .object({
    provider: partnerNativeDocumentProviderSchema,
    connectionId: z.string().uuid(),
    connectionRevision: revision,
    accountLabel: z.string().trim().min(1).max(160),
  })
  .strict();
const uniqueDocumentCandidates = (
  candidates: readonly z.infer<typeof partnerNativeDocumentCandidateSchema>[],
): boolean =>
  new Set(candidates.map((candidate) => candidate.connectionId)).size === candidates.length;
export const partnerNativeDocumentEligibilitySchema = z.discriminatedUnion('status', [
  z
    .object({ status: z.literal('ready'), candidate: partnerNativeDocumentCandidateSchema })
    .strict(),
  z
    .object({
      status: z.literal('selection-required'),
      reason: z.literal('multiple-accounts'),
      recoveryAction: z.literal('choose-account'),
      candidates: z
        .array(partnerNativeDocumentCandidateSchema)
        .min(2)
        .max(8)
        .refine(uniqueDocumentCandidates, 'Document account candidates must be unique'),
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      reason: z.enum([
        'not-selected',
        'disconnected',
        'missing-scope',
        'extension-disabled',
        'host-upgrade-required',
        'plan-mode',
      ]),
      recoveryAction: z.enum(['open-connectors', 'reauthorize', 'upgrade-host', 'leave-plan']),
      candidates: z.array(partnerNativeDocumentCandidateSchema).max(8).default([]),
    })
    .strict(),
]);
export type PartnerNativeDocumentEligibilityT = z.infer<
  typeof partnerNativeDocumentEligibilitySchema
>;
/** A verified provider-owned web destination that the Partner browser may open. */
export const partnerNativeDocumentUrlSchema = z
  .string()
  .max(2_048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        url.username === '' &&
        url.password === '' &&
        Boolean(url.hostname)
      );
    } catch {
      return false;
    }
  }, 'Native document URL must be a credential-free HTTPS URL');
const partnerNativeDocumentTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('personal-space') }).strict(),
  z
    .object({
      kind: z.literal('scoped-resource'),
      canonicalRef: z
        .string()
        .min(1)
        .max(512)
        .refine((value) => !value.includes('\0'), 'Native document target contains NUL'),
    })
    .strict(),
]);

const partnerNativeDocumentTaskObject = z
  .object({
    ...owner,
    provider: partnerNativeDocumentProviderSchema,
    connectionRevision: revision,
    turnExecutionId: z.string().uuid(),
    invocationKey: hash,
    target: partnerNativeDocumentTargetSchema,
    requestedTitle: z.string().trim().min(1).max(280),
    content: remoteText,
    inputHash: hash,
    scopeHash: hash,
    status: z.enum(['preparing', 'submitting', 'succeeded', 'failed', 'unknown', 'partial']),
    resourceId: z.string().min(1).max(128).optional(),
    title: z.string().trim().min(1).max(280).optional(),
    canonicalUrl: partnerNativeDocumentUrlSchema.optional(),
    revision: z.number().int().nonnegative().optional(),
    contentVerification: z.enum(['verified', 'unverified']).optional(),
    verificationWarning: z.string().min(1).max(280).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    error: z.string().max(280).optional(),
  })
  .strict();
function validateNativeDocumentResult(
  task: Pick<
    z.infer<typeof partnerNativeDocumentTaskObject>,
    | 'provider'
    | 'status'
    | 'resourceId'
    | 'title'
    | 'canonicalUrl'
    | 'revision'
    | 'contentVerification'
    | 'verificationWarning'
  >,
  ctx: z.RefinementCtx,
): void {
  const outputKeys = ['resourceId', 'title', 'canonicalUrl', 'revision'] as const;
  if (task.status !== 'succeeded') {
    for (const key of [...outputKeys, 'contentVerification', 'verificationWarning'] as const) {
      if (task[key] !== undefined)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `Only a successful native document task may expose ${key}`,
        });
    }
    return;
  }
  for (const key of outputKeys) {
    if (task[key] === undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `Successful native document task requires ${key}`,
      });
  }
  if (task.contentVerification === 'unverified' && task.verificationWarning === undefined)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['verificationWarning'],
      message: 'Unverified native document content requires a warning',
    });
  if (task.contentVerification !== 'unverified' && task.verificationWarning !== undefined)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['verificationWarning'],
      message: 'Only unverified native document content may expose a verification warning',
    });
}
export const partnerNativeDocumentTaskSchema = partnerNativeDocumentTaskObject.superRefine(
  validateNativeDocumentResult,
);
export type PartnerNativeDocumentTaskT = z.infer<typeof partnerNativeDocumentTaskSchema>;
export const partnerNativeDocumentTaskSummarySchema = partnerNativeDocumentTaskObject
  .omit({
    turnExecutionId: true,
    invocationKey: true,
    content: true,
    inputHash: true,
    scopeHash: true,
  })
  .superRefine(validateNativeDocumentResult);
export type PartnerNativeDocumentTaskSummaryT = z.infer<
  typeof partnerNativeDocumentTaskSummarySchema
>;

export const partnerRemoteSourceSchema = z
  .object({
    ...owner,
    documentId: z.string().min(1).max(256),
    url: partnerReadResourceSchema,
    title: z.string().max(280),
    revision: z.number().int().nonnegative(),
    content: remoteText,
    contentHash: hash,
    readAt: z.string().datetime(),
  })
  .strict();
export type PartnerRemoteSourceT = z.infer<typeof partnerRemoteSourceSchema>;
export const partnerRemoteSourceSummarySchema = partnerRemoteSourceSchema.omit({ content: true });
export type PartnerRemoteSourceSummaryT = z.infer<typeof partnerRemoteSourceSummarySchema>;

export const partnerRemoteProposalSchema = z
  .object({
    ...owner,
    connectionRevision: revision,
    operation: z.enum(['create', 'append']),
    targetUrl: z.union([
      feishuDocumentUrlSchema,
      feishuFolderUrlSchema,
      z.literal(FEISHU_MY_LIBRARY_TARGET),
    ]),
    title: z.string().trim().min(1).max(280),
    content: remoteText,
    rationale: z.string().max(1000),
    contentHash: hash,
    scopeHash: hash,
    baseRevision: z.number().int().nonnegative().optional(),
    baseContentHash: hash.optional(),
    status: z.enum([
      'pending',
      'submitting',
      'succeeded',
      'rejected',
      'conflict',
      'unknown',
      'partial',
      'failed',
    ]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    error: z.string().max(280).optional(),
  })
  .strict();
export type PartnerRemoteProposalT = z.infer<typeof partnerRemoteProposalSchema>;
export const partnerRemoteProposalSummarySchema = partnerRemoteProposalSchema.omit({
  content: true,
});
export type PartnerRemoteProposalSummaryT = z.infer<typeof partnerRemoteProposalSummarySchema>;
export const partnerRemoteReceiptSchema = z
  .object({
    ...owner,
    proposalId: z.string().uuid(),
    operation: z.enum(['create', 'append']),
    documentId: z.string().min(1).max(128),
    url: feishuDocumentUrlSchema,
    title: z.string().max(280),
    revision: z.number().int().nonnegative(),
    completedAt: z.string().datetime(),
  })
  .strict();
export type PartnerRemoteReceiptT = z.infer<typeof partnerRemoteReceiptSchema>;
export const partnerRemoteRecordsSchema = z
  .object({
    sources: z.array(partnerRemoteSourceSummarySchema).max(200),
    proposals: z.array(partnerRemoteProposalSummarySchema).max(200),
    receipts: z.array(partnerRemoteReceiptSchema).max(200),
    baseTasks: z.array(partnerFeishuBaseCreateTaskSchema).max(200).default([]),
    documentTasks: z.array(partnerNativeDocumentTaskSummarySchema).max(200).default([]),
    recordRevision: z.number().int().nonnegative().default(0),
  })
  .strict();
export type PartnerRemoteRecordsT = z.infer<typeof partnerRemoteRecordsSchema>;
const remoteProposalInputShape = {
  connectionId: z.string().uuid(),
  title: z.string().trim().min(1).max(280),
  content: remoteText,
  rationale: z.string().max(1000).default(''),
};
const remoteProposalAppendInputShape = {
  ...remoteProposalInputShape,
  operation: z.literal('append'),
  targetUrl: feishuDocumentUrlSchema,
};
export const partnerRemoteProposalInputSchema = z.object(remoteProposalAppendInputShape).strict();
export type PartnerRemoteProposalInputT = z.infer<typeof partnerRemoteProposalInputSchema>;

const definitionInput = z.object({ extensionId: identity, connectorId: identity }).strict();
const ok = z.object({ ok: z.literal(true) }).strict();
export const connectorInvokeChannels = {
  'space.extensions.connectors.catalog': {
    name: 'space.extensions.connectors.catalog',
    direction: 'invoke',
    input: z.object({ extensionId: identity }).strict(),
    output: z.object({ connectors: z.array(spaceConnectorDefinitionSchema).max(64) }).strict(),
  },
  'partner.connectors.search': {
    name: 'partner.connectors.search',
    direction: 'invoke',
    input: partnerConnectorSearchInputSchema.extend({ sessionId, projectRoot }),
    output: partnerConnectorSearchResultSchema,
  },
  'partner.connectors.inspect': {
    name: 'partner.connectors.inspect',
    direction: 'invoke',
    input: definitionInput,
    output: partnerConnectorInspectionSchema,
  },
  'partner.connectors.connect': {
    name: 'partner.connectors.connect',
    direction: 'invoke',
    input: definitionInput.extend({ profile: feishuProfileSchema }),
    output: z.object({ connection: partnerConnectorConnectionSchema }).strict(),
  },
  'partner.connectors.disconnect': {
    name: 'partner.connectors.disconnect',
    direction: 'invoke',
    input: definitionInput.extend({ connectionId: z.string().uuid() }),
    output: ok,
  },
  'partner.connectors.forget': {
    name: 'partner.connectors.forget',
    direction: 'invoke',
    input: definitionInput.extend({
      connectionId: z.string().uuid(),
      connectionRevision: z.number().int().positive(),
    }),
    output: ok,
  },
  'partner.connectors.resolve': {
    name: 'partner.connectors.resolve',
    direction: 'invoke',
    input: z.object({ projectRoot, connectors: partnerConnectorSelectionsSchema }).strict(),
    output: partnerConnectorStateSchema,
  },
  'session.partnerConnectors.get': {
    name: 'session.partnerConnectors.get',
    direction: 'invoke',
    input: z.object({ sessionId }).strict(),
    output: partnerConnectorStateSchema,
  },
  'session.partnerConnectors.set': {
    name: 'session.partnerConnectors.set',
    direction: 'invoke',
    input: z.object({ sessionId, connectors: partnerConnectorSelectionsSchema }).strict(),
    output: partnerConnectorStateSchema,
  },
  'partner.connectors.read': {
    name: 'partner.connectors.read',
    direction: 'invoke',
    input: context.extend({
      connectionId: z.string().uuid(),
      documentUrl: partnerReadResourceSchema,
    }),
    output: z.object({ source: partnerRemoteSourceSchema }).strict(),
  },
  'partner.connectors.records': {
    name: 'partner.connectors.records',
    direction: 'invoke',
    input: context,
    output: partnerRemoteRecordsSchema,
  },
  'partner.connectors.sources.get': {
    name: 'partner.connectors.sources.get',
    direction: 'invoke',
    input: context.extend({ id: z.string().uuid() }),
    output: z.object({ source: partnerRemoteSourceSchema.nullable() }).strict(),
  },
  'partner.connectors.proposals.create': {
    name: 'partner.connectors.proposals.create',
    direction: 'invoke',
    input: context.extend(remoteProposalAppendInputShape),
    output: z.object({ proposal: partnerRemoteProposalSchema }).strict(),
  },
  'partner.connectors.proposals.get': {
    name: 'partner.connectors.proposals.get',
    direction: 'invoke',
    input: context.extend({ id: z.string().uuid() }),
    output: z.object({ proposal: partnerRemoteProposalSchema.nullable() }).strict(),
  },
  'partner.connectors.proposals.apply': {
    name: 'partner.connectors.proposals.apply',
    direction: 'invoke',
    input: context.extend({ id: z.string().uuid(), expectedContentHash: hash }),
    output: z.object({ proposal: partnerRemoteProposalSchema }).strict(),
  },
  'partner.connectors.proposals.reject': {
    name: 'partner.connectors.proposals.reject',
    direction: 'invoke',
    input: context.extend({ id: z.string().uuid() }),
    output: z.object({ proposal: partnerRemoteProposalSchema }).strict(),
  },
} as const;
export const connectorPushChannels = {
  'session.partnerConnectors.changed': {
    name: 'session.partnerConnectors.changed',
    direction: 'push',
    payload: z.object({ sessionId, state: partnerConnectorStateSchema }).strict(),
  },
  'partner.connectors.changed': {
    name: 'partner.connectors.changed',
    direction: 'push',
    payload: z
      .object({
        extensionId: identity.optional(),
        sessionId: sessionId.optional(),
        projectRoot: projectRoot.optional(),
        baseTaskId: z.string().uuid().optional(),
        documentTaskId: z.string().uuid().optional(),
        recordRevision: z.number().int().nonnegative().optional(),
      })
      .strict(),
  },
} as const;
