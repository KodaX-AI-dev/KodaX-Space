import feishuCliLock from '../../../../resources/partner-connectors/feishu-cli.lock.json';

export const FEISHU_CLI_RELEASE = feishuCliLock;
export const FEISHU_CLI_VERSION = FEISHU_CLI_RELEASE.version;

export function isCompatibleFeishuCliVersion(output: string): boolean {
  return output.trim() === `lark-cli version ${FEISHU_CLI_VERSION}`;
}
