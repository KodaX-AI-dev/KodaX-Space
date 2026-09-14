import { FileText } from 'lucide-react';
import feishuLogo from '../../../../../../resources/brands/feishu.png';
import wecomLogo from '../../../../../../resources/brands/wecom.png';
import dingtalkLogo from '../../../../../../resources/brands/dingtalk.png';
import meetingLogo from '../../../../../../resources/brands/tencent-meeting.png';
import notionLogo from '../../../../../../resources/brands/notion.svg';
import airtableLogo from '../../../../../../resources/brands/airtable.svg';
import atlassianLogo from '../../../../../../resources/brands/atlassian.svg';
import githubLogo from '../../../../../../resources/brands/github.svg';
import zoomLogo from '../../../../../../resources/brands/zoom.svg';

import tencentDocsLogo from '../../../../../../resources/brands/tencent-docs.svg';
import neteaseMailLogo from '../../../../../../resources/brands/netease-mail.png';
import qqMailLogo from '../../../../../../resources/brands/qq-mail.png';

const connectorLogos: Record<string, string | undefined> = {
  'feishu-cli': feishuLogo,
  'tencent-docs-mcp': tencentDocsLogo,
  'netease-mail-imap': neteaseMailLogo,
  'qq-mail-imap': qqMailLogo,
  'wecom-cli': wecomLogo,
  'dingtalk-cli': dingtalkLogo,
  'tencent-meeting-cli': meetingLogo,
  'notion-mcp': notionLogo,
  'airtable-mcp': airtableLogo,
  'atlassian-mcp': atlassianLogo,
  'zoom-mcp': zoomLogo,
  'github-api': githubLogo,
};

const monochromeLogos = new Set([
  'notion-mcp',
  'airtable-mcp',
  'atlassian-mcp',
  'zoom-mcp',
  'github-api',
]);

/** Decorative connector identity; its adjacent label remains the catalog's display name. */
export function PartnerConnectorIcon({
  adapter,
  className,
}: {
  readonly adapter: string;
  readonly className: string;
}): JSX.Element {
  return connectorLogos[adapter] ? (
    <img
      src={connectorLogos[adapter]}
      width={24}
      height={24}
      alt=""
      aria-hidden
      data-testid="partner-connector-icon"
      className={`object-contain ${monochromeLogos.has(adapter) ? 'dark:invert' : ''} ${className}`}
    />
  ) : (
    <FileText className={className} aria-hidden data-testid="partner-connector-icon" />
  );
}
