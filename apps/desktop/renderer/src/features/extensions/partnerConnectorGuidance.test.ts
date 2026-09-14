import assert from 'node:assert/strict';
import test from 'node:test';
import type { PartnerConnectorSnapshotT } from '@kodax-space/space-ipc-schema';
import { projectPartnerConnectorGuidance } from './partnerConnectorGuidance.js';
import { messages, type MessageKey } from '../../i18n/messages.js';

const binding: PartnerConnectorSnapshotT = {
  extensionId: 'library',
  connectorId: 'feishu-docs',
  connectionId: 'account-a',
  connectionRevision: 1,
  documents: [],
  name: '飞书',
  accountLabel: '测试账号',
};
const t = (key: MessageKey, vars?: Record<string, string | number>): string =>
  Object.entries(vars ?? {}).reduce<string>(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    messages['zh-CN'][key],
  );

test('connector shortcuts work without an expert and reflect each implemented service operation', () => {
  const groups = projectPartnerConnectorGuidance(
    {
      connectors: [
        { binding, available: true },
        {
          binding: {
            ...binding,
            connectionId: 'account-b',
            connectorId: 'tencent-docs',
            adapter: 'tencent-docs-mcp',
            name: '腾讯文档',
          },
          available: true,
        },
        {
          binding: {
            ...binding,
            connectionId: 'account-c',
            connectorId: 'qq-mail',
            adapter: 'qq-mail-imap',
            name: 'QQ邮箱',
          },
          available: true,
        },
        {
          binding: {
            ...binding,
            connectionId: 'account-d',
            connectorId: 'github',
            adapter: 'github-api',
            name: 'GitHub',
          },
          available: true,
        },
      ],
    },
    t,
  );
  assert.deepEqual(
    groups.map((group) => group.actions.map((action) => action.id)),
    [
      ['read', 'append', 'createDocument', 'createBase'],
      ['read', 'createDocument'],
      ['read', 'search'],
      ['read'],
    ],
  );
  assert.match(groups[1]!.actions[1]!.promptTemplate, /腾讯文档/);
  assert.match(groups[0]!.actions[1]!.promptTemplate, /审核/);
});

test('unavailable bindings cannot contribute shortcuts and accounts stay distinct', () => {
  assert.deepEqual(projectPartnerConnectorGuidance({ connectors: [] }, t), []);
  assert.deepEqual(
    projectPartnerConnectorGuidance({ connectors: [{ binding, available: false }] }, t),
    [],
  );
  const groups = projectPartnerConnectorGuidance(
    {
      connectors: [
        { binding, available: true },
        {
          binding: { ...binding, connectionId: 'account-b', accountLabel: '另一个账号' },
          available: true,
        },
      ],
    },
    t,
  );
  assert.notEqual(groups[0]!.id, groups[1]!.id);
  assert.match(groups[1]!.label, /另一个账号/);
});
