import type { KodaXDaemonRuntime, RuntimeHostToolLease } from '@kodax-ai/kodax/runtime';
import type {
  RuntimeExecutionProfileSource,
  RuntimeExecutionBindingSnapshot,
  RuntimeExecutionProfile,
  RuntimeBusinessBinding,
} from '@kodax-ai/kodax/client';
import {
  capturePartnerBusinessBinding,
  readPartnerBusinessBinding,
} from './partner-business-binding.js';
import { getSessionRuntimeStore } from '../session-runtime-store.js';
import { buildPartnerAgentProfile, buildPartnerSourceSummary } from '../partner-profile.js';
import { retrievePartnerEvidenceForTurn } from '../partner-context-broker.js';
import { partnerKnowledgeFeatures } from '../partner-knowledge-features.js';
import { partnerSourceStore } from '../partner-source-store.js';
import { getSpaceExpertCatalog } from '../../space-extensions/runtime.js';
import { createPartnerConnectorRunRuntime } from '../partner-connector-runtime.js';
import {
  registerSpaceHostTools,
  type SpaceToolDefinition,
  type SpaceToolHandler,
} from './space-host-tools.js';
import * as kb from '../partner-kb-tools.js';
import * as source from '../partner-source-tool.js';
import * as delivery from '../partner-delivery-tool.js';
import * as workspace from '../partner-workspace-file-tool.js';
import * as proposal from '../partner-file-proposal-tool.js';
import * as helper from '../partner-helper-runner-tool.js';
import { partnerKbStore } from '../partner-kb-store.js';
import { partnerDeliveryStore } from '../partner-delivery-store.js';
import { partnerCheckpointStore } from '../partner-checkpoint-store.js';
import { partnerFileProposalStore } from '../partner-file-proposal-store.js';

type Tool = SpaceToolDefinition & { readonly handler: SpaceToolHandler };

/** Reuse the product handlers; neither a second engine nor a local SDK registry. */
export function partnerHostToolDefinitions(): readonly Tool[] {
  return [
    {
      ...source.PARTNER_SOURCE_READ_TOOL,
      handler: source.makePartnerSourceReadHandler({ store: partnerSourceStore }),
    },
    { ...kb.PARTNER_KB_LIST_TOOL, handler: kb.makePartnerKbListHandler(partnerKbStore) },
    { ...kb.PARTNER_KB_READ_TOOL, handler: kb.makePartnerKbReadHandler(partnerKbStore) },
    { ...kb.PARTNER_KB_SEARCH_TOOL, handler: kb.makePartnerKbSearchHandler(partnerKbStore) },
    {
      ...kb.PARTNER_KB_MAINTENANCE_TOOL,
      handler: kb.makePartnerKbMaintenanceHandler(partnerKbStore),
    },
    { ...kb.PARTNER_KB_WRITE_TOOL, handler: kb.makePartnerKbWriteHandler(partnerKbStore) },
    {
      ...delivery.WRITE_PARTNER_DELIVERABLE_TOOL,
      handler: delivery.makeWritePartnerDeliverableHandler(partnerDeliveryStore),
    },
    {
      ...workspace.WRITE_PARTNER_WORKSPACE_FILE_TOOL,
      handler: workspace.makeWritePartnerWorkspaceFileHandler(
        partnerCheckpointStore,
        partnerDeliveryStore,
      ),
    },
    {
      ...workspace.ROLLBACK_PARTNER_CHECKPOINT_TOOL,
      handler: workspace.makeRollbackPartnerCheckpointHandler(
        partnerCheckpointStore,
        partnerDeliveryStore,
      ),
    },
    {
      ...proposal.CREATE_FILE_PROPOSAL_TOOL,
      handler: proposal.makeFileProposalHandler(partnerFileProposalStore, 'create'),
    },
    {
      ...proposal.UPDATE_FILE_PROPOSAL_TOOL,
      handler: proposal.makeFileProposalHandler(partnerFileProposalStore, 'update'),
    },
    {
      ...helper.RUN_PARTNER_HELPER_TOOL,
      handler: helper.makeRunPartnerHelperHandler(partnerDeliveryStore),
    },
  ];
}

interface PartnerExecutionInput {
  readonly explicitMethod?: boolean;
  readonly query?: string;
  readonly recovery?: {
    readonly agentProfile?: import('@kodax-ai/kodax/coding').KodaXAgentProfile;
    readonly binding?: RuntimeExecutionBindingSnapshot;
    readonly profile?: RuntimeExecutionProfile;
  };
}

async function trustedPartnerState(runtime: KodaXDaemonRuntime, sessionId: string) {
  const session = await runtime.sessions.load(sessionId);
  if (
    session.surface !== 'partner' &&
    session.profileId !== 'kodax-space.partner' &&
    session.tag !== 'partner'
  )
    throw new Error('Partner identity changed.');
  const projectRoot = session.workspaceRoot ?? session.gitRoot;
  if (!projectRoot) throw new Error('Partner Session has no workspace identity.');
  const { kodaxHost } = await import('../host.js');
  const readSelection = async () =>
    kodaxHost.get(sessionId) ?? (await getSessionRuntimeStore().read(sessionId));
  const local = await readSelection();
  return {
    sessionId,
    projectRoot,
    expert: local?.partnerExpert,
    bindings: structuredClone(local?.partnerConnectors ?? []),
    readSelection,
    kodaxHost,
  };
}

export async function hasExplicitHostSkill(
  runtime: KodaXDaemonRuntime,
  projectRoot: string,
  query: string,
): Promise<boolean> {
  const coding = await import('@kodax-ai/kodax/coding');
  const names = new Set((await runtime.catalog.skills({ projectRoot })).map((skill) => skill.name));
  return [
    ...coding.parseInlineSkillReferences(query),
    ...coding.parseBareInlineSlashReferences(query),
  ].some((reference) => names.has(reference.name));
}

async function connectorHostTools(
  runtime: KodaXDaemonRuntime,
  state: Awaited<ReturnType<typeof trustedPartnerState>>,
): Promise<readonly Tool[]> {
  let latestBindings = state.bindings;
  const connectorRuntime = await createPartnerConnectorRunRuntime(undefined, {
    sessionId: state.sessionId,
    projectRoot: state.projectRoot,
    surface: 'partner',
    bindings: state.bindings,
    permissionMode:
      (await runtime.sessions.getSettings(state.sessionId)).permissionMode ?? 'accept-edits',
    getCurrentBindings: () =>
      state.kodaxHost.get(state.sessionId)?.partnerConnectors ?? latestBindings,
  });
  return (connectorRuntime?.listRunTools?.('mcp') ?? []).map((tool) => ({
    ...tool,
    input_schema: tool.inputSchema,
    sideEffect:
      tool.sideEffect === 'readonly' || tool.sideEffect === 'reads-network'
        ? tool.sideEffect
        : 'mutates-state',
    handler: async (toolInput) => {
      latestBindings = [...((await state.readSelection())?.partnerConnectors ?? [])];
      const result = await connectorRuntime!.executeCapability!(
        'mcp',
        tool.capabilityId,
        toolInput,
      );
      return typeof result === 'string' ? result : JSON.stringify(result);
    },
  }));
}

async function partnerExecutionContext(
  state: Awaited<ReturnType<typeof trustedPartnerState>>,
  input: PartnerExecutionInput,
): Promise<RuntimeExecutionProfileSource> {
  if (state.expert) await getSpaceExpertCatalog().requireAvailable(state.expert);
  if (input.recovery)
    return {
      ...(input.recovery.binding?.defaultSkill
        ? { defaultSkill: input.recovery.binding.defaultSkill }
        : {}),
      ...(input.recovery.agentProfile ? { agentProfile: input.recovery.agentProfile } : {}),
    };
  const profile = buildPartnerAgentProfile(state.expert);
  const sources = await partnerSourceStore.list(state.sessionId);
  const evidence = input.query
    ? await retrievePartnerEvidenceForTurn({
        surface: 'partner',
        automaticRecall: partnerKnowledgeFeatures.automaticRecall,
        sessionId: state.sessionId,
        projectRoot: state.projectRoot,
        query: input.query,
      })
    : null;
  return {
    ...(!input.explicitMethod && state.expert?.useSkill !== false && state.expert?.expert.skillRef
      ? { defaultSkill: { name: state.expert.expert.skillRef } }
      : {}),
    agentProfile: {
      ...profile,
      instructions: [profile.instructions, buildPartnerSourceSummary(sources), evidence?.overlay]
        .filter(Boolean)
        .join('\n\n'),
    },
  };
}

/** Only trusted Main state supplies persona and bindings, never Product input authority. */
export async function registerPartnerHostExecution(
  runtime: KodaXDaemonRuntime,
  sessionId: string,
  resumeLeaseId?: string,
  input: PartnerExecutionInput = {},
): Promise<{
  readonly lease: RuntimeHostToolLease;
  readonly context: RuntimeExecutionProfileSource;
  readonly businessBinding: RuntimeBusinessBinding;
}> {
  if ((input.recovery || resumeLeaseId) && !input.recovery?.binding)
    throw Object.assign(
      new Error(
        'The original Partner business scope cannot be verified. Start a new input after reviewing the selection.',
      ),
      { code: 'execution_binding_unavailable' },
    );
  let state = await trustedPartnerState(runtime, sessionId);
  if (input.recovery?.binding) {
    const original = await readPartnerBusinessBinding(
      input.recovery.binding.businessBinding,
      sessionId,
      state.projectRoot,
    );
    state = { ...state, expert: original.expert, bindings: original.bindings };
  }
  const businessBinding = await capturePartnerBusinessBinding({
    sessionId,
    projectRoot: state.projectRoot,
    expert: state.expert,
    bindings: [...state.bindings],
  });
  const context = await partnerExecutionContext(state, {
    ...input,
    ...(resumeLeaseId ? { recovery: input.recovery ?? {} } : {}),
  });
  const lease = await registerSpaceHostTools(runtime, resumeLeaseId, [
    ...partnerHostToolDefinitions(),
    ...(await connectorHostTools(runtime, state)),
  ]);
  return { lease, context, businessBinding };
}
