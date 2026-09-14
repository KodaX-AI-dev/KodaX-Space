import assert from 'node:assert/strict';
import test from 'node:test';
import { createPartnerExpertBinding } from './partnerExpertBinding.js';
import { createPartnerConnectorBinding } from './partnerConnectorBinding.js';
import { acceptPartnerCreatedDraft } from './partnerDraftCreation.js';
const scope = { surface: 'partner' as const, projectRoot: '/project', sessionId: null };
async function fixture() {
  const experts = createPartnerExpertBinding({
    resolve: async () => {
      throw new Error('Unused');
    },
    get: async () => ({ expert: null, available: true }),
    set: async () => ({ expert: null, available: true }),
  });
  const connectors = createPartnerConnectorBinding({
    resolve: async () => ({ connectors: [] }),
    get: async () => ({ connectors: [] }),
    set: async () => ({ connectors: [] }),
  });
  await experts.setContext(scope);
  await connectors.setContext(scope);
  return {
    experts,
    connectors,
    expertCapture: experts.captureDraft(scope),
    connectorCapture: connectors.captureDraft(scope),
  };
}
test('an obsolete connector draft cannot partially adopt the expert create ACK', async () => {
  const f = await fixture();
  f.connectors.clearDraft();
  assert.equal(
    acceptPartnerCreatedDraft({
      ...f,
      sessionId: 'new-session',
      expert: null,
      connectorSnapshots: [],
    }),
    false,
  );
  assert.equal(f.experts.getSnapshot().context.sessionId, null);
});
test('an obsolete expert draft cannot partially adopt connector state; matching ACK commits both', async () => {
  const f = await fixture();
  f.experts.clearDraft();
  assert.equal(
    acceptPartnerCreatedDraft({
      ...f,
      sessionId: 'new-session',
      expert: null,
      connectorSnapshots: [],
    }),
    false,
  );
  assert.equal(f.connectors.getSnapshot().context.sessionId, null);
  const fresh = await fixture();
  assert.equal(
    acceptPartnerCreatedDraft({
      ...fresh,
      sessionId: 'new-session',
      expert: null,
      connectorSnapshots: [],
    }),
    true,
  );
  assert.equal(fresh.experts.getSnapshot().context.sessionId, 'new-session');
  assert.equal(fresh.connectors.getSnapshot().context.sessionId, 'new-session');
});
