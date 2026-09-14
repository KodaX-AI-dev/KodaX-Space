import assert from 'node:assert/strict';
import test from 'node:test';
import type { PartnerRemoteProposalT } from '@kodax-space/space-ipc-schema';
import { approveRemoteProposal } from './partnerRemoteActions.js';
const proposal = {
  id: 'proposal',
  contentHash: 'a'.repeat(64),
  status: 'pending',
  operation: 'append',
  targetUrl: 'https://example.feishu.cn/docx/doc',
} as PartnerRemoteProposalT;
test('only exact reviewed content can pass host confirmation; cancellation never applies', async () => {
  let applied = 0;
  const api = {
    get: async () => proposal,
    confirm: async () => false,
    apply: async () => {
      applied++;
      return proposal;
    },
    isActive: () => true,
  };
  assert.equal(await approveRemoteProposal(proposal, api), null);
  assert.equal(applied, 0);
  api.confirm = async () => true;
  await approveRemoteProposal(proposal, api);
  assert.equal(applied, 1);
});
test('changed content, unknown outcome and switched scope cannot be approved or retried', async () => {
  let applied = 0;
  let active = true;
  const api = {
    get: async () => proposal,
    confirm: async () => {
      active = false;
      return true;
    },
    apply: async () => {
      applied++;
      return proposal;
    },
    isActive: () => active,
  };
  assert.equal(await approveRemoteProposal(proposal, api), null);
  active = true;
  api.get = async () => ({ ...proposal, contentHash: 'b'.repeat(64) });
  await assert.rejects(approveRemoteProposal(proposal, api), /changed/i);
  api.get = async () => ({ ...proposal, status: 'unknown' });
  await assert.rejects(approveRemoteProposal(proposal, api), /pending/i);
  assert.equal(applied, 0);
});

test('the renderer cannot approve a historical create proposal', async () => {
  let confirmed = 0;
  let applied = 0;
  await assert.rejects(
    approveRemoteProposal({ ...proposal, operation: 'create' }, {
      get: async () => ({ ...proposal, operation: 'create' }),
      confirm: async () => {
        confirmed += 1;
        return true;
      },
      apply: async () => {
        applied += 1;
        return proposal;
      },
      isActive: () => true,
    }),
    /no longer supported/i,
  );
  assert.equal(confirmed, 0);
  assert.equal(applied, 0);
});
