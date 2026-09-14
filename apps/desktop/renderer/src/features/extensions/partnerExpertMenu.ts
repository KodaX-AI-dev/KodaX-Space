import type { SpaceExpertDefinitionT } from '@kodax-space/space-ipc-schema';

export const PARTNER_EXPERT_RECENCY_KEY = 'kodax-space.partnerExpertRecency.v1';

export interface PartnerExpertMenuItem {
  readonly extensionId: string;
  readonly extensionName: string;
  readonly expert: SpaceExpertDefinitionT;
}

export function partnerExpertMenuKey(item: PartnerExpertMenuItem): string {
  return `${item.extensionId}:${item.expert.id}`;
}

export function readPartnerExpertRecency(storage: Pick<Storage, 'getItem'>): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(PARTNER_EXPERT_RECENCY_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, 32)
      : [];
  } catch {
    return [];
  }
}

export function recordPartnerExpertUsage(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  item: PartnerExpertMenuItem,
): string[] {
  const key = partnerExpertMenuKey(item);
  const next = [key, ...readPartnerExpertRecency(storage).filter((entry) => entry !== key)].slice(
    0,
    32,
  );
  try {
    storage.setItem(PARTNER_EXPERT_RECENCY_KEY, JSON.stringify(next));
  } catch {
    // Recency is a presentation preference; a blocked quota must not undo expert selection.
  }
  return next;
}

/** Used experts lead by recency; untouched experts retain the package catalog order. */
export function visiblePartnerExperts(
  catalog: readonly PartnerExpertMenuItem[],
  recency: readonly string[],
  limit = 5,
): PartnerExpertMenuItem[] {
  const rank = new Map(recency.map((key, index) => [key, index]));
  return catalog
    .map((item, catalogIndex) => ({
      item,
      catalogIndex,
      rank: rank.get(partnerExpertMenuKey(item)),
    }))
    .sort((left, right) => {
      if (left.rank !== undefined && right.rank !== undefined) return left.rank - right.rank;
      if (left.rank !== undefined) return -1;
      if (right.rank !== undefined) return 1;
      return left.catalogIndex - right.catalogIndex;
    })
    .slice(0, limit)
    .map(({ item }) => item);
}
