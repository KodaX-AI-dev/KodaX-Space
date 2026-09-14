import { adminPolicyAuditStore } from '../kodax/admin-policy-audit-store.js';
import { registerChannel } from './register.js';
import {
  getPartnerConnectorService,
  invalidateConnectorPolicy,
} from '../partner-connectors/runtime.js';

export function registerAdminPolicyAuditChannels(
  register = registerChannel,
  store = adminPolicyAuditStore,
  connectors = getPartnerConnectorService,
): void {
  register('admin.policy.get', async () => store.getPolicy());

  register('admin.policy.set', async (input) => {
    invalidateConnectorPolicy();
    try {
      return await connectors().deactivate(undefined, () => store.setPolicy(input));
    } finally {
      invalidateConnectorPolicy();
    }
  });

  register('admin.policy.export', async () => store.exportPolicy());

  register('admin.audit.list', async (input) => ({
    events: await store.listAudit(input ?? undefined),
  }));

  register('admin.audit.export', async (input) => store.exportAuditJsonl(input ?? undefined));
}
