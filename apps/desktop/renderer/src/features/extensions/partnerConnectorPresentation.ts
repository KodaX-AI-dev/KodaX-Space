import type { PartnerConnectorAdapterT } from '@kodax-space/space-ipc-schema';
import type { MessageKey } from '../../i18n/messages.js';

export type ConnectorSetupKind =
  | 'bundled'
  | 'private-cli'
  | 'remote-oauth'
  | 'mail-credentials'
  | 'api-credentials'
  | 'configuration-required';

type ConnectorPresentation = {
  placeholder: string;
  requirementsKey: MessageKey;
} & (
  | { setupKind: 'private-cli'; packageName: string; version: string }
  | {
      setupKind: Exclude<ConnectorSetupKind, 'private-cli'>;
      packageName?: never;
      version?: never;
    }
);

export const connectorPresentation: Record<PartnerConnectorAdapterT, ConnectorPresentation> = {
  'feishu-cli': {
    placeholder: 'https://example.feishu.cn/docx/…',
    setupKind: 'bundled',
    requirementsKey: 'connectors.scopeHint',
  },
  'tencent-docs-mcp': {
    placeholder: 'https://docs.qq.com/doc/…',
    setupKind: 'remote-oauth',
    requirementsKey: 'connectors.tencentDocsHint',
  },
  'netease-mail-imap': {
    placeholder: 'name@163.com',
    setupKind: 'mail-credentials',
    requirementsKey: 'connectors.neteaseMailHint',
  },
  'qq-mail-imap': {
    placeholder: 'name@qq.com',
    setupKind: 'mail-credentials',
    requirementsKey: 'connectors.qqMailHint',
  },
  'wecom-cli': {
    placeholder: 'https://doc.weixin.qq.com/doc/…',
    setupKind: 'private-cli',
    packageName: '@wecom/cli',
    version: '1.2.0',
    requirementsKey: 'connectors.wecomHint',
  },
  'dingtalk-cli': {
    placeholder: 'https://alidocs.dingtalk.com/i/nodes/…',
    setupKind: 'private-cli',
    packageName: 'dingtalk-workspace-cli',
    version: '1.0.61',
    requirementsKey: 'connectors.dingtalkHint',
  },
  'tencent-meeting-cli': {
    placeholder: 'tmeet://meeting-code/123456789',
    setupKind: 'private-cli',
    packageName: '@tencentcloud/tmeet',
    version: '1.0.15',
    requirementsKey: 'connectors.meetingHint',
  },
  'notion-mcp': {
    placeholder: 'notion://page/0123456789abcdef0123456789abcdef',
    setupKind: 'remote-oauth',
    requirementsKey: 'connectors.notionHint',
  },
  'airtable-mcp': {
    placeholder: 'airtable://base/app…/table/tbl…',
    setupKind: 'remote-oauth',
    requirementsKey: 'connectors.airtableHint',
  },
  'atlassian-mcp': {
    placeholder: 'https://your-site.atlassian.net/browse/PROJ-123',
    setupKind: 'remote-oauth',
    requirementsKey: 'connectors.atlassianHint',
  },
  'slack-mcp': {
    placeholder: 'https://your-workspace.slack.com/archives/C…/p…',
    setupKind: 'api-credentials',
    requirementsKey: 'connectors.slackSetupHint',
  },
  'github-api': {
    placeholder: 'https://github.com/owner/repo/issues/123',
    setupKind: 'api-credentials',
    requirementsKey: 'connectors.githubHint',
  },
  'zoom-mcp': {
    placeholder: 'https://zoom.us/j/12345678901',
    setupKind: 'api-credentials',
    requirementsKey: 'connectors.zoomSetupHint',
  },
};

export function isConfigurationRequiredConnector(adapter: string): boolean {
  return (
    connectorPresentation[adapter as PartnerConnectorAdapterT]?.setupKind ===
    'configuration-required'
  );
}
