import {
  partnerConnectorSupports,
  type PartnerConnectorOperation,
  type PartnerConnectorStateT,
} from '@kodax-space/space-ipc-schema';
import type { MessageKey } from '../../i18n/messages.js';
import type { PartnerExpertCapabilityGroup } from './partnerExpertCapabilityGuide.js';

const operations = ['read', 'append', 'createDocument', 'createBase', 'search'] as const;
export const partnerConnectorOperationLabels: Record<PartnerConnectorOperation, MessageKey> = {
  read: 'extensions.connectorActionRead',
  append: 'extensions.connectorActionAppend',
  createDocument: 'extensions.connectorActionCreateDocument',
  createBase: 'extensions.connectorActionCreateBase',
  search: 'extensions.connectorActionSearch',
};
const prompts: Record<PartnerConnectorOperation, MessageKey> = {
  read: 'extensions.connectorPromptRead',
  append: 'extensions.connectorPromptAppend',
  createDocument: 'extensions.connectorPromptCreateDocument',
  createBase: 'extensions.connectorPromptCreateBase',
  search: 'extensions.connectorPromptSearch',
};

/** Drafting only: registry support is not permission to execute a remote operation. */
export function projectPartnerConnectorGuidance(
  state: PartnerConnectorStateT,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): PartnerExpertCapabilityGroup[] {
  return state.connectors
    .filter((item) => item.available)
    .map(({ binding }) => ({
      id: JSON.stringify([binding.extensionId, binding.connectorId, binding.connectionId]),
      label: `${binding.name} · ${binding.accountLabel}`,
      actions: operations
        .filter((operation) => partnerConnectorSupports(binding.adapter ?? 'feishu-cli', operation))
        .map((operation) => ({
          id: operation,
          label: t(partnerConnectorOperationLabels[operation]),
          requiredConnectorIds: [binding.connectorId],
          promptTemplate: t(prompts[operation], {
            name: binding.name,
            account: binding.accountLabel,
          }),
        })),
    }));
}
