import type { PartnerRemoteProposalT } from '@kodax-space/space-ipc-schema';

export async function approveRemoteProposal(
  reviewed: PartnerRemoteProposalT,
  api: {
    get(): Promise<PartnerRemoteProposalT | null>;
    confirm(proposal: PartnerRemoteProposalT): Promise<boolean>;
    apply(): Promise<PartnerRemoteProposalT>;
    isActive(): boolean;
  },
): Promise<PartnerRemoteProposalT | null> {
  if (!api.isActive()) return null;
  if (reviewed.operation !== 'append')
    throw new Error('Remote create proposals are no longer supported');
  const current = await api.get();
  if (!api.isActive()) return null;
  if (!current || current.status !== 'pending')
    throw new Error('Only a pending proposal may be approved; uncertain writes cannot be retried');
  if (current.operation !== 'append')
    throw new Error('Remote create proposals are no longer supported');
  if (current.id !== reviewed.id || current.contentHash !== reviewed.contentHash)
    throw new Error('The proposal changed. Review the new content first');
  if (!(await api.confirm(current)) || !api.isActive()) return null;
  return api.apply();
}
