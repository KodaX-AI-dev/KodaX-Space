import type { SpaceExpertDefinitionT } from '@kodax-space/space-ipc-schema';

export type PartnerExpertCapabilityGuide = NonNullable<SpaceExpertDefinitionT['capabilityGuide']>;
export type PartnerExpertCapabilityGroup = PartnerExpertCapabilityGuide['groups'][number];

export interface PartnerExpertCapabilitySelection {
  readonly scopeKey: string;
  readonly groupId: string;
}

export interface PartnerExpertCapabilityProjection {
  readonly groups: PartnerExpertCapabilityGuide['groups'];
  readonly selectedGroup: PartnerExpertCapabilityGroup | null;
}

/**
 * Projects host-validated capability metadata into a two-level composer view.
 * A selection belongs to exactly one project/conversation/expert scope, so stale
 * local UI state can never leak into a newly selected expert or conversation.
 */
export function projectPartnerExpertCapabilityGuide(
  expert: SpaceExpertDefinitionT | null | undefined,
  currentScopeKey: string,
  selection: PartnerExpertCapabilitySelection | null,
): PartnerExpertCapabilityProjection | null {
  const guide = expert?.capabilityGuide;
  if (!guide) return null;

  const selectedGroup =
    selection?.scopeKey === currentScopeKey
      ? (guide.groups.find((group) => group.id === selection.groupId) ?? null)
      : null;

  return { groups: guide.groups, selectedGroup };
}
