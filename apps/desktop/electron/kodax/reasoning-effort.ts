import { reasoningModeSchema, type ReasoningMode } from '@kodax-space/space-ipc-schema';

function parseReasoningMode(value: unknown): ReasoningMode | undefined {
  const parsed = reasoningModeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function isSpaceReasoningMode(value: unknown): value is ReasoningMode {
  return reasoningModeSchema.safeParse(value).success;
}

/** Convert Space's UI value (including persisted legacy aliases) to an SDK effort intent. */
export function reasoningModeToEffort(
  mode: ReasoningMode | string | undefined,
): string | undefined {
  switch (mode) {
    case 'off':
    case 'none':
      return 'none';
    case 'quick':
      return 'low';
    case 'balanced':
      return 'medium';
    case 'deep':
      return 'max';
    case 'auto':
    case 'minimal':
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
    case 'max':
      return mode;
    default:
      return parseReasoningMode(mode);
  }
}

export interface ReasoningProfileShape {
  readonly effortStrategy?: string;
  readonly supportedEfforts?: readonly {
    readonly value: string;
    readonly isDefault?: boolean;
    readonly isUserVisible?: boolean;
  }[];
  readonly defaultEffort?: string;
  readonly supportsDisabledThinking?: boolean;
  readonly localRejectEfforts?: readonly string[];
  readonly disabledEfforts?: readonly string[];
}

/** Project SDK reasoning metadata without confusing disabled thinking with an unsupported effort. */
export function projectReasoningProfile(profile: ReasoningProfileShape | undefined): {
  readonly supportedEfforts?: string[];
  readonly defaultEffort?: string;
  readonly canDisableThinking?: boolean;
} {
  const disabledEfforts = new Set(
    profile?.disabledEfforts
      ?.map((effort) => parseReasoningMode(effort))
      .filter((effort): effort is string => effort !== undefined) ?? [],
  );
  const supportedEfforts: string[] = [];
  const seen = new Set<string>();
  let hasDeclaredVisibleEffort = false;
  let hasDisabledEffort = false;
  for (const effort of profile?.supportedEfforts ?? []) {
    if (effort.isUserVisible === false) continue;
    const value = parseReasoningMode(effort.value);
    if (!value) continue;
    hasDeclaredVisibleEffort = true;
    if (value === 'none' || disabledEfforts.has(value)) {
      hasDisabledEffort = true;
      continue;
    }
    if (!seen.has(value)) {
      seen.add(value);
      supportedEfforts.push(value);
    }
  }
  const rawDefaultEffort = parseReasoningMode(
    profile?.defaultEffort ?? profile?.supportedEfforts?.find((effort) => effort.isDefault)?.value,
  );
  const explicitlyUnsupported = profile?.effortStrategy === 'none' || profile?.effortStrategy === 'prompt-only';
  const canDisableThinking =
    profile?.supportsDisabledThinking === false || profile?.localRejectEfforts?.includes('none') || explicitlyUnsupported
      ? false
      : profile?.supportsDisabledThinking === true || hasDisabledEffort
        ? true
        : undefined;
  const defaultEffort =
    rawDefaultEffort === 'none' || (rawDefaultEffort && disabledEfforts.has(rawDefaultEffort))
      ? canDisableThinking
        ? 'none'
        : undefined
      : rawDefaultEffort;
  const hasKnownEffortLadder =
    profile?.supportedEfforts !== undefined ||
    profile?.effortStrategy === 'none' ||
    profile?.effortStrategy === 'prompt-only';
  return {
    ...(hasDeclaredVisibleEffort || hasKnownEffortLadder ? { supportedEfforts } : {}),
    ...(defaultEffort ? { defaultEffort } : {}),
    ...(canDisableThinking !== undefined ? { canDisableThinking } : {}),
  };
}

/** Keep user intent in Runtime settings; the SDK owns negotiation and rejection caching. */
export function runtimeSettingEffort(
  reasoningMode: ReasoningMode | string | undefined,
): string | null {
  return reasoningModeToEffort(reasoningMode) ?? null;
}

/** Normalize SDK effort values and legacy Space aliases to the current UI selection. */
export function effortToReasoningMode(value: unknown): ReasoningMode | undefined {
  const normalized = parseReasoningMode(value);
  if (!normalized) return undefined;
  switch (normalized) {
    case 'off':
    case 'none':
      return 'off';
    case 'quick':
      return 'low';
    case 'balanced':
      return 'medium';
    case 'deep':
      return 'max';
    case 'auto':
    case 'minimal':
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
    case 'max':
      return normalized;
    default:
      return normalized;
  }
}
