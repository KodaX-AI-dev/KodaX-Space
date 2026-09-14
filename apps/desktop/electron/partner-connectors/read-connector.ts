import type { FeishuOnboardingInput } from './feishu-onboarding-cli.js';
import { MAX_PARTNER_REMOTE_TEXT_BYTES } from '@kodax-space/space-ipc-schema';

/** Implemented, host-owned read adapters; never supplied by an extension or a model. */
export type ReadConnectorId =
  | 'wecom-cli'
  | 'dingtalk-cli'
  | 'tencent-meeting-cli'
  | 'notion-mcp'
  | 'airtable-mcp'
  | 'atlassian-mcp'
  | 'slack-mcp'
  | 'zoom-mcp'
  | 'github-api'
  | 'tencent-docs-mcp'
  | 'netease-mail-imap'
  | 'qq-mail-imap';
export interface ReadConnectorIdentity {
  authorityId: string;
  subjectId: string;
  label: string;
}
export interface ReadConnectorStatus {
  installed: boolean;
  version?: string;
  identity?: ReadConnectorIdentity;
  reason?: string;
}
export interface ReadConnectorInput {
  profile: string;
  expected: ReadConnectorIdentity;
  documentUrl: string;
  beforeRead: () => Promise<void>;
  assertRead: () => void;
}
export interface ReadConnectorDocument {
  documentId: string;
  url: string;
  title: string;
  /** Zero means no provider numeric revision; never claim optimistic write support. */
  revision: number;
  content: string;
}

export interface ReadConnectorSearchInput extends Omit<ReadConnectorInput, 'documentUrl'> {
  query: { subject?: string; from?: string; since?: string; before?: string; unreadOnly?: boolean };
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}
export type ReadConnectorSearchResult =
  import('@kodax-space/space-ipc-schema').PartnerConnectorSearchResultT;
export type ReadConnectorSearchMessage = ReadConnectorSearchResult['messages'][number];
export interface ReadConnectorCreateInput {
  profile: string;
  expected: ReadConnectorIdentity;
  title: string;
  content: string;
  beforeDispatch: () => Promise<void>;
  assertDispatch: () => void;
}
export interface ReadConnectorCreateResult {
  status: 'success' | 'unknown';
  documentId?: string;
  url?: string;
  revision?: number;
}
/** A bounded snapshot, never silently truncated or reported as the full oversized source. */
export function checkReadConnectorDocument(document: ReadConnectorDocument): ReadConnectorDocument {
  if (
    document.title.length > 280 ||
    Buffer.byteLength(document.content, 'utf8') > MAX_PARTNER_REMOTE_TEXT_BYTES
  )
    throw new ReadConnectorError('resource_too_large');
  if (document.content.includes('\0') || /[\u0000-\u001f\u007f]/u.test(document.title))
    throw new ReadConnectorError('invalid_response');
  return document;
}
export interface ReadConnector {
  readonly id: ReadConnectorId;
  inspect(profile: string, signal?: AbortSignal): Promise<ReadConnectorStatus>;
  run(input: FeishuOnboardingInput): Promise<void>;
  isAuthorizationUrl(value: unknown): value is string;
  /** Strict canonical reference validation. No arbitrary URL, command or JSON forwarding. */
  acceptsResource(value: string): boolean;
  read(input: ReadConnectorInput): Promise<ReadConnectorDocument>;
  search?(input: ReadConnectorSearchInput): Promise<ReadConnectorSearchResult>;
  createDocument?(input: ReadConnectorCreateInput): Promise<ReadConnectorCreateResult>;
  /** Remote OAuth adapters delete the profile credential; local CLIs may omit this hook. */
  disconnect?(profile: string, signal?: AbortSignal): Promise<void>;
}

const messages = {
  needs_install: '需要安装 Space 专用连接组件，确认后才会下载。',
  unsupported_platform: '当前系统暂不支持此连接组件。',
  installation_failed: '连接组件安装或校验失败，尚未进入网页授权。',
  authorization_failed: '连接未完成，请检查官方授权页面或重新连接。',
  invalid_response: '服务返回了无法验证的结果，请重新连接。',
  cancelled: '已取消连接；网页上已经授予的权限不会因此撤销。',
  expired: '本次连接已超时，请重新发起。',
  identity_changed: '账号身份已变化，请重新连接并确认资源范围。',
  invalid_resource: '资源引用无效或不属于此连接器。',
  read_failed: '读取失败，请确认账号对该资源具有查看权限。',
  resource_too_large:
    '资料超出当前读取上限（正文 128 KiB、标题 280 字符），请选择较小的资料；未保存截断内容。',
  mail_message_too_large: '原始邮件（含附件）超过 2 MiB，未读取正文；请选择较小的邮件。',
  permission_missing: '授权缺少读取权限，请在官方应用设置中补充所需的只读权限后重新连接。',
  rate_limited: '服务请求次数达到限制，请稍后再试。',
  configuration_required:
    '此连接器需要产品方预先配置并审核 Slack App 或 Zoom General App；当前构建未配置，尚未连接。',
} as const;

/** Only fixed safe messages cross the host boundary; never raw CLI output. */
export class ReadConnectorError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = 'ReadConnectorError';
  }
}
