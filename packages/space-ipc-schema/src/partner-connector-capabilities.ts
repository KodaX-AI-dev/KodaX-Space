import {
  isPartnerConnectorResource,
  partnerConnectorAdapterSchema,
  partnerConnectorResourceKey,
  type PartnerConnectorAdapterT,
} from './channels/partner-connector.js';

export type PartnerConnectorOperation =
  | 'read'
  | 'append'
  | 'createDocument'
  | 'createBase'
  | 'search';

/** Fixed host implementations, not account grants or claims of live-provider verification. */
const operations: Readonly<Record<PartnerConnectorAdapterT, readonly PartnerConnectorOperation[]>> =
  {
    'feishu-cli': ['read', 'append', 'createDocument', 'createBase'],
    'wecom-cli': ['read'],
    'dingtalk-cli': ['read'],
    'tencent-meeting-cli': ['read'],
    'notion-mcp': ['read'],
    'airtable-mcp': ['read'],
    'atlassian-mcp': ['read'],
    'slack-mcp': ['read'],
    'zoom-mcp': ['read'],
    'github-api': ['read'],
    'tencent-docs-mcp': ['read', 'createDocument'],
    'netease-mail-imap': ['read', 'search'],
    'qq-mail-imap': ['read', 'search'],
  };

export function partnerConnectorSupports(
  adapter: PartnerConnectorAdapterT,
  operation: PartnerConnectorOperation,
): boolean {
  return operations[adapter].includes(operation);
}

export interface PartnerConnectorResource {
  readonly adapter: PartnerConnectorAdapterT;
  readonly kind: 'document' | 'table' | 'issue' | 'message' | 'meeting';
  readonly canonicalRef: string;
  readonly resourceKey: string;
  readonly webUrl?: string;
}

function resourceKind(
  adapter: PartnerConnectorAdapterT,
  reference: string,
): PartnerConnectorResource['kind'] {
  if (adapter === 'github-api' && /\/(issues|pull)\/[0-9]+$/.test(reference)) return 'issue';
  if (adapter === 'airtable-mcp') return 'table';
  if (adapter === 'tencent-meeting-cli' || adapter === 'zoom-mcp') return 'meeting';
  if (adapter === 'slack-mcp' || adapter === 'netease-mail-imap' || adapter === 'qq-mail-imap')
    return 'message';
  if (
    adapter === 'atlassian-mcp' &&
    (reference.startsWith('atlassian://jira/') ||
      new URL(reference).pathname.startsWith('/browse/'))
  )
    return 'issue';
  return 'document';
}

/**
 * Project existing strict read-resource references without granting an operation.
 * Without an adapter, identify historical snapshots from their validated reference.
 * Internal references never imply a browser URL or a configured provider account.
 */
export function projectPartnerConnectorResource(
  canonicalRef: string,
  adapter?: PartnerConnectorAdapterT,
): PartnerConnectorResource | null {
  const selected =
    adapter ??
    partnerConnectorAdapterSchema.options.find((candidate) =>
      isPartnerConnectorResource(candidate, canonicalRef),
    );
  if (!selected) return null;
  const key = partnerConnectorResourceKey(selected, canonicalRef);
  if (!key) return null;
  return {
    adapter: selected,
    kind: resourceKind(selected, canonicalRef),
    canonicalRef,
    resourceKey: `${selected}:${key}`,
    ...(canonicalRef.startsWith('https://') ? { webUrl: canonicalRef } : {}),
  };
}
