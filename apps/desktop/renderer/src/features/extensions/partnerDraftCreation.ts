import type {
  PartnerConnectorSnapshotT,
  PartnerExpertSnapshotT,
} from '@kodax-space/space-ipc-schema';
import type { PartnerExpertBinding, PartnerExpertDraftCapture } from './partnerExpertBinding.js';
import type {
  PartnerConnectorBinding,
  PartnerConnectorDraftCapture,
} from './partnerConnectorBinding.js';

/** Validate both captures before either binding consumes the ACK. No await between check and commit. */
export function acceptPartnerCreatedDraft(input: {
  readonly experts: PartnerExpertBinding;
  readonly expertCapture: PartnerExpertDraftCapture;
  readonly connectors?: PartnerConnectorBinding;
  readonly connectorCapture?: PartnerConnectorDraftCapture;
  readonly sessionId: string;
  readonly expert: PartnerExpertSnapshotT | null | undefined;
  readonly connectorSnapshots: readonly PartnerConnectorSnapshotT[];
}): boolean {
  if (!input.experts.isCaptureCurrent(input.expertCapture)) return false;
  if (input.connectorCapture && !input.connectors?.isCaptureCurrent(input.connectorCapture))
    return false;
  input.experts.acceptCreatedSession(input.expertCapture, input.sessionId, input.expert);
  if (input.connectorCapture)
    input.connectors!.acceptCreatedSession(
      input.connectorCapture,
      input.sessionId,
      input.connectorSnapshots,
    );
  return true;
}
