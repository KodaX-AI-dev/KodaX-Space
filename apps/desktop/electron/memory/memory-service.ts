import type {
  ChannelInput,
  ChannelOutput,
  MemoryActionProposalT,
  MemoryApplyPreviewT,
  MemoryApplyResultT,
  MemoryBodySnapshotT,
  MemoryGovernanceReportT,
  MemoryItemRefT,
  MemoryPackT,
  MemoryRejectResultT,
  MemoryReviewPlanT,
} from '@kodax-space/space-ipc-schema';
import type {
  MemoryActionProposal,
  MemoryApplyPreview,
  MemoryApplyResult,
  MemoryBodySnapshot,
  MemoryController,
  MemoryGovernanceReport,
  MemoryItemRef,
  MemoryPack,
  MemoryRefFilter,
  MemoryRejectResult,
  MemoryReviewPlan,
} from '@kodax-ai/kodax/agent';
import { kodaxHost } from '../kodax/host.js';

type AgentSdkModule = typeof import('@kodax-ai/kodax/agent');

const BODY_MAX = 256 * 1024;
const DIFF_MAX = 256 * 1024;
const MSG_MAX = 8192;
const PATH_MAX = 4096;
const REF_MAX = 2048;

let agentSdkModule: Promise<AgentSdkModule> | null = null;

function loadAgentSdk(): Promise<AgentSdkModule> {
  agentSdkModule ??= import('@kodax-ai/kodax/agent');
  return agentSdkModule;
}

export interface MemorySessionContext {
  readonly sessionId: string;
  readonly projectRoot: string;
  readonly surface?: 'code' | 'partner';
}

type GovernanceController = Pick<
  MemoryController,
  'listInbox' | 'showProposal' | 'approveProposal' | 'rejectProposal' | 'listRefs' | 'readRef'
> &
  Partial<Pick<MemoryController, 'runCurator' | 'buildMemoryPack'>> & {
    readonly hostOwned?: boolean;
  };

export interface MemoryGovernanceServiceDeps {
  readonly resolveHostController?: (
    session: MemorySessionContext,
  ) => Promise<GovernanceController | undefined>;
  readonly loadSdk?: () => Promise<AgentSdkModule>;
  readonly resolveSession: (sessionId: string) => Promise<MemorySessionContext | null>;
  readonly resolvePaths?: (
    sdk: AgentSdkModule,
    session: MemorySessionContext,
  ) => {
    readonly learningStorePath: string;
    readonly memoryRoot: string;
  };
}

function truncateText(
  value: string,
  max: number,
): { readonly value: string; readonly truncated: boolean } {
  if (value.length <= max) return { value, truncated: false };
  return { value: `${value.slice(0, Math.max(0, max - 14))}\n... truncated`, truncated: true };
}

function optionalText(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  return truncateText(value, max).value;
}

function limitStrings(values: readonly string[], maxItems: number, maxChars: number): string[] {
  return values.slice(0, maxItems).map((value) => truncateText(value, maxChars).value);
}

function withOptional<K extends string, V>(target: object, key: K, value: V | undefined): void {
  if (value !== undefined) {
    (target as Record<string, unknown>)[key] = value;
  }
}

function normalizeRef(ref: MemoryItemRef): MemoryItemRefT {
  const out: MemoryItemRefT = {
    kind: ref.kind,
    id: truncateText(ref.id, 512).value,
    scope: ref.scope,
    owner: ref.owner,
    lifecycle: ref.lifecycle,
    authority: ref.authority,
    visibility: ref.visibility,
    sourceRefs: limitStrings(ref.sourceRefs, REF_MAX, 512),
    relatedRefs: limitStrings(ref.relatedRefs, REF_MAX, 512),
  };
  withOptional(out, 'title', optionalText(ref.title, 512));
  withOptional(out, 'version', optionalText(ref.version, 512));
  withOptional(out, 'bodyFingerprint', optionalText(ref.bodyFingerprint, 512));
  withOptional(out, 'storageUri', optionalText(ref.storageUri, PATH_MAX));
  withOptional(out, 'createdAt', optionalText(ref.createdAt, 512));
  withOptional(out, 'updatedAt', optionalText(ref.updatedAt, 512));
  withOptional(out, 'lastUsedAt', optionalText(ref.lastUsedAt, 512));
  withOptional(out, 'pinned', ref.pinned);
  return out;
}

function normalizeFingerprintMap(
  input: Readonly<Record<string, string>> | undefined,
): Record<string, string> | undefined {
  if (input === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      truncateText(key, 512).value,
      truncateText(value, 512).value,
    ]),
  );
}

function normalizePreview(preview: MemoryApplyPreview): MemoryApplyPreviewT {
  const diff = optionalText(preview.diff, DIFF_MAX);
  const warnings = [...limitStrings(preview.warnings, 128, MSG_MAX)];
  if (preview.diff !== undefined && diff !== preview.diff) {
    warnings.push('diff truncated for IPC display');
  }
  const out: MemoryApplyPreviewT = {
    summary: truncateText(preview.summary, MSG_MAX).value,
    changedRefs: preview.changedRefs.slice(0, REF_MAX).map(normalizeRef),
    changedPaths: limitStrings(preview.changedPaths, 512, PATH_MAX),
    beforeFingerprints: normalizeFingerprintMap(preview.beforeFingerprints) ?? {},
    warnings,
  };
  withOptional(out, 'afterFingerprints', normalizeFingerprintMap(preview.afterFingerprints));
  withOptional(out, 'diff', diff);
  return out;
}

function normalizeProposal(
  proposal: MemoryActionProposal,
  revision: string,
): MemoryActionProposalT {
  return {
    id: truncateText(proposal.id, 512).value,
    revision,
    action: proposal.action,
    targetRefs: proposal.targetRefs.slice(0, REF_MAX).map(normalizeRef),
    sourceRefs: proposal.sourceRefs.slice(0, REF_MAX).map(normalizeRef),
    expectedFingerprints: normalizeFingerprintMap(proposal.expectedFingerprints) ?? {},
    rationale: truncateText(proposal.rationale, MSG_MAX).value,
    risk: proposal.risk,
    preview: normalizePreview(proposal.preview),
    requiresApproval: true,
    createdAt: truncateText(proposal.createdAt, 512).value,
  };
}

function normalizeReviewPlan(plan: MemoryReviewPlan): MemoryReviewPlanT {
  return {
    trigger: plan.trigger,
    createdAt: truncateText(plan.createdAt, 512).value,
    sourceRefs: limitStrings(plan.sourceRefs, REF_MAX, 512),
    candidateRefs: plan.candidateRefs.slice(0, REF_MAX).map((candidate) => ({
      ref: normalizeRef(candidate.ref),
      ...(candidate.bodySnippet !== undefined
        ? { bodySnippet: truncateText(candidate.bodySnippet, MSG_MAX).value }
        : {}),
      ...(candidate.bodyFingerprint !== undefined
        ? { bodyFingerprint: truncateText(candidate.bodyFingerprint, 512).value }
        : {}),
      warnings: limitStrings(candidate.warnings, 128, MSG_MAX),
    })),
    actions: plan.actions.slice(0, 128).map((action) => ({
      action: action.action,
      targetRefIds: limitStrings(action.targetRefIds, REF_MAX, 512),
      summary: truncateText(action.summary, MSG_MAX).value,
      rationale: truncateText(action.rationale, MSG_MAX).value,
      confidence: action.confidence,
      risk: action.risk,
      requiresApproval: true,
      ...(action.proposedBody !== undefined
        ? { proposedBody: truncateText(action.proposedBody, BODY_MAX).value }
        : {}),
    })),
    warnings: limitStrings(plan.warnings, 128, MSG_MAX),
  };
}

function normalizeApplyResult(result: MemoryApplyResult): MemoryApplyResultT {
  return {
    proposalId: truncateText(result.proposalId, 512).value,
    applied: result.applied,
    changedRefs: result.changedRefs.slice(0, REF_MAX).map(normalizeRef),
    changedPaths: limitStrings(result.changedPaths, 512, PATH_MAX),
    ...(result.skippedReason !== undefined
      ? { skippedReason: truncateText(result.skippedReason, MSG_MAX).value }
      : {}),
    warnings: limitStrings(result.warnings, 128, MSG_MAX),
  };
}

function normalizeRejectResult(result: MemoryRejectResult): MemoryRejectResultT {
  return {
    proposalId: truncateText(result.proposalId, 512).value,
    rejected: result.rejected,
    ...(result.skippedReason !== undefined
      ? { skippedReason: truncateText(result.skippedReason, MSG_MAX).value }
      : {}),
    ...(result.review !== undefined ? { review: normalizeReviewPlan(result.review) } : {}),
    warnings: limitStrings(result.warnings, 128, MSG_MAX),
  };
}

function normalizeSnapshot(snapshot: MemoryBodySnapshot): MemoryBodySnapshotT {
  const body = truncateText(snapshot.body, BODY_MAX);
  const warnings = [...limitStrings(snapshot.warnings, 128, MSG_MAX)];
  if (body.truncated) warnings.push('body truncated for IPC display');
  return {
    ref: normalizeRef(snapshot.ref),
    body: body.value,
    bodyFingerprint: truncateText(snapshot.bodyFingerprint, 512).value,
    ...(snapshot.frontmatter !== undefined
      ? {
          frontmatter: Object.fromEntries(
            Object.entries(snapshot.frontmatter).map(([key, value]) => [
              truncateText(key, 512).value,
              truncateText(value, MSG_MAX).value,
            ]),
          ),
        }
      : {}),
    readAt: truncateText(snapshot.readAt, 512).value,
    warnings,
  };
}

function normalizeReport(report: MemoryGovernanceReport): MemoryGovernanceReportT {
  return {
    reportId: truncateText(report.reportId, 512).value,
    generatedAt: truncateText(report.generatedAt, 512).value,
    findings: report.findings.slice(0, 512).map((finding) => ({
      kind: finding.kind,
      severity: finding.severity,
      refIds: limitStrings(finding.refIds, REF_MAX, 512),
      summary: truncateText(finding.summary, MSG_MAX).value,
      suggestedAction: finding.suggestedAction,
    })),
    warnings: limitStrings(report.warnings, 128, MSG_MAX),
  };
}

function normalizePack(pack: MemoryPack): MemoryPackT {
  return {
    generatedAt: truncateText(pack.generatedAt, 512).value,
    taskFingerprint: truncateText(pack.taskFingerprint, 512).value,
    hints: pack.hints.slice(0, 128).map((hint) => ({
      ref: normalizeRef(hint.ref),
      hook: truncateText(hint.hook, MSG_MAX).value,
      reason: truncateText(hint.reason, MSG_MAX).value,
      ...(hint.bodySnippet !== undefined
        ? { bodySnippet: truncateText(hint.bodySnippet, MSG_MAX).value }
        : {}),
      ...(hint.bodyFingerprint !== undefined
        ? { bodyFingerprint: truncateText(hint.bodyFingerprint, 512).value }
        : {}),
    })),
    omitted: limitStrings(pack.omitted, REF_MAX, 512),
    traceMetadata: {
      selectedRefIds: limitStrings(pack.traceMetadata.selectedRefIds, REF_MAX, 512),
      omittedRefIds: limitStrings(pack.traceMetadata.omittedRefIds, REF_MAX, 512),
      taskFingerprint: truncateText(pack.traceMetadata.taskFingerprint, 512).value,
      suppressed: pack.traceMetadata.suppressed,
    },
  };
}

function isGovernanceInventoryRef(ref: MemoryItemRef): boolean {
  return (
    ref.kind === 'memdir' || ref.kind === 'learning_proposal' || ref.kind === 'reasoning_report'
  );
}

function filterFromInput(input: ChannelInput<'memory.list'>): MemoryRefFilter {
  return {
    ...(input.kinds !== undefined ? { kinds: input.kinds } : {}),
    ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
    ...(input.lifecycles !== undefined ? { lifecycles: input.lifecycles } : {}),
    ...(input.includePrivate !== undefined ? { includePrivate: input.includePrivate } : {}),
    ...(input.includeSensitive !== undefined ? { includeSensitive: input.includeSensitive } : {}),
    ...(input.query !== undefined ? { query: input.query } : {}),
  };
}

export class MemoryGovernanceService {
  private readonly resolveHostController: MemoryGovernanceServiceDeps['resolveHostController'];
  private readonly loadSdk: () => Promise<AgentSdkModule>;
  private readonly resolveSession: (sessionId: string) => Promise<MemorySessionContext | null>;
  private readonly resolvePaths: NonNullable<MemoryGovernanceServiceDeps['resolvePaths']>;

  constructor(deps: MemoryGovernanceServiceDeps) {
    this.loadSdk = deps.loadSdk ?? loadAgentSdk;
    this.resolveHostController = deps.resolveHostController;
    this.resolveSession = deps.resolveSession;
    this.resolvePaths =
      deps.resolvePaths ??
      ((sdk, session) => ({
        learningStorePath: sdk.resolveLearningProposalStore(session.projectRoot),
        memoryRoot: sdk.resolveMemoryRoot(session.projectRoot),
      }));
  }

  private async controller(sessionId: string): Promise<GovernanceController> {
    const session = await this.resolveSession(sessionId);
    if (!session) throw new Error(`session not found: ${sessionId}`);
    if (session.surface === 'partner') {
      throw new Error('Memory Governance is available from the Coder surface only');
    }
    const host = await this.resolveHostController?.(session);
    if (host) return { ...host, hostOwned: true };
    const sdk = await this.loadSdk();
    const paths = this.resolvePaths(sdk, session);
    return sdk.createMemoryControlPlane({
      cwd: session.projectRoot,
      learningStorePath: paths.learningStorePath,
      memoryRoot: paths.memoryRoot,
      sessionId: session.sessionId,
      discoverSkills: false,
    });
  }

  async list(input: ChannelInput<'memory.list'>): Promise<ChannelOutput<'memory.list'>> {
    const controller = await this.controller(input.sessionId);
    const [inbox, refs] = await Promise.all([
      controller.listInbox(),
      controller.listRefs(filterFromInput(input)),
    ]);
    const sdk = await loadAgentSdk();
    return {
      inbox: inbox.map((proposal) =>
        normalizeProposal(proposal, sdk.memoryProposalRevision(proposal)),
      ),
      refs: refs.filter(isGovernanceInventoryRef).map(normalizeRef),
      warnings: [],
      capabilities: { curate: !!controller.runCurator, pack: !!controller.buildMemoryPack },
    };
  }

  async proposal(
    input: ChannelInput<'memory.proposal'>,
  ): Promise<ChannelOutput<'memory.proposal'>> {
    const controller = await this.controller(input.sessionId);
    const proposal = await controller.showProposal(input.proposalId);
    const sdk = await loadAgentSdk();
    return {
      proposal: proposal ? normalizeProposal(proposal, sdk.memoryProposalRevision(proposal)) : null,
    };
  }

  async approve(input: ChannelInput<'memory.approve'>): Promise<ChannelOutput<'memory.approve'>> {
    const controller = await this.controller(input.sessionId);
    if (controller.hostOwned && !input.expectedRevision)
      throw new Error('A reviewed proposal revision is required.');
    const result = await controller.approveProposal(
      input.proposalId,
      input.expectedFingerprints,
      input.expectedRevision,
    );
    return { result: normalizeApplyResult(result) };
  }

  async reject(input: ChannelInput<'memory.reject'>): Promise<ChannelOutput<'memory.reject'>> {
    const controller = await this.controller(input.sessionId);
    if (controller.hostOwned && !input.expectedRevision)
      throw new Error('A reviewed proposal revision is required.');
    const result = await controller.rejectProposal(
      input.proposalId,
      input.reason,
      input.expectedRevision,
    );
    return { result: normalizeRejectResult(result) };
  }

  async readRef(input: ChannelInput<'memory.readRef'>): Promise<ChannelOutput<'memory.readRef'>> {
    const controller = await this.controller(input.sessionId);
    const snapshot = await controller.readRef(input.ref);
    return { snapshot: normalizeSnapshot(snapshot) };
  }

  async curate(input: ChannelInput<'memory.curate'>): Promise<ChannelOutput<'memory.curate'>> {
    const controller = await this.controller(input.sessionId);
    if (!controller.runCurator)
      throw new Error('The shared Host does not expose manual Memory curation.');
    const report = await controller.runCurator({
      ...(input.includePrivate !== undefined ? { includePrivate: input.includePrivate } : {}),
      ...(input.includeSensitive !== undefined ? { includeSensitive: input.includeSensitive } : {}),
    });
    return { report: normalizeReport(report) };
  }

  async pack(input: ChannelInput<'memory.pack'>): Promise<ChannelOutput<'memory.pack'>> {
    const controller = await this.controller(input.sessionId);
    if (!controller.buildMemoryPack)
      throw new Error('The shared Host does not expose Memory pack previews.');
    const pack = await controller.buildMemoryPack({
      task: input.task,
      ...(input.maxHints !== undefined ? { maxHints: input.maxHints } : {}),
      ...(input.includePrivate !== undefined ? { includePrivate: input.includePrivate } : {}),
      ...(input.includeSensitive !== undefined ? { includeSensitive: input.includeSensitive } : {}),
      ...(input.includeSnippets !== undefined ? { includeSnippets: input.includeSnippets } : {}),
      ...(input.ignoreMemory !== undefined ? { ignoreMemory: input.ignoreMemory } : {}),
    });
    return { pack: normalizePack(pack) };
  }
}

export const memoryGovernanceService = new MemoryGovernanceService({
  resolveHostController: async (session) => {
    const { runtimeHostAdapter } = await import('../kodax/runtime-host-adapter.js');
    if (!runtimeHostAdapter.isRuntimeSelected()) return undefined;
    return (await runtimeHostAdapter.memoryForProject(session.projectRoot)).controller;
  },
  resolveSession: async (sessionId) => {
    let session = kodaxHost.get(sessionId);
    if (!session && (await kodaxHost.tryResume(sessionId))) {
      session = kodaxHost.get(sessionId);
    }
    if (!session) return null;
    return {
      sessionId: session.sessionId,
      projectRoot: session.projectRoot,
      surface: session.surface,
    };
  },
});
