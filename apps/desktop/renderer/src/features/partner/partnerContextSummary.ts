export interface PartnerContextSummaryGroup {
  readonly count: number;
  readonly labels: readonly string[];
}

export interface PartnerContextSummary {
  readonly materials: PartnerContextSummaryGroup;
  readonly collaboration: PartnerContextSummaryGroup;
  readonly artifacts: PartnerContextSummaryGroup;
}

export interface PartnerContextSummaryInput {
  readonly sourceLabels: readonly string[];
  readonly pendingSourcePaths: readonly string[];
  readonly artifactLabels: readonly string[];
  readonly transientArtifactLabels: readonly string[];
  readonly deliveryPaths: readonly string[];
  readonly remoteSourceLabels?: readonly string[];
  readonly remoteReceiptLabels?: readonly string[];
  readonly expertLabels: readonly string[];
  readonly skillLabels: readonly string[];
}

export const EMPTY_PARTNER_CONTEXT_SUMMARY: PartnerContextSummary = {
  materials: { count: 0, labels: [] },
  collaboration: { count: 0, labels: [] },
  artifacts: { count: 0, labels: [] },
};

function filename(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).at(-1) ?? normalized;
}

function compactLabels(labels: readonly string[]): readonly string[] {
  const result: string[] = [];
  for (const rawLabel of labels) {
    const label = rawLabel.trim();
    if (!label || result.includes(label)) continue;
    result.push(label);
    if (result.length === 2) break;
  }
  return result;
}

export function projectPartnerContextSummary(
  input: PartnerContextSummaryInput,
): PartnerContextSummary {
  const pendingSourceLabels = input.pendingSourcePaths.map(filename);
  const deliveryLabels = input.deliveryPaths.map(filename);

  return {
    materials: {
      count:
        input.sourceLabels.length +
        input.pendingSourcePaths.length +
        (input.remoteSourceLabels?.length ?? 0),
      labels: compactLabels([
        ...input.sourceLabels,
        ...pendingSourceLabels,
        ...(input.remoteSourceLabels ?? []),
      ]),
    },
    collaboration: {
      count: input.expertLabels.length + input.skillLabels.length,
      labels: compactLabels([...input.expertLabels, ...input.skillLabels]),
    },
    artifacts: {
      count:
        input.artifactLabels.length +
        input.transientArtifactLabels.length +
        input.deliveryPaths.length +
        (input.remoteReceiptLabels?.length ?? 0),
      labels: compactLabels([
        ...input.artifactLabels,
        ...input.transientArtifactLabels,
        ...deliveryLabels,
        ...(input.remoteReceiptLabels ?? []),
      ]),
    },
  };
}
