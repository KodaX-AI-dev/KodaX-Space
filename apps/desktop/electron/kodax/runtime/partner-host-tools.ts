import type { KodaXDaemonRuntime, RuntimeHostToolLease } from '@kodax-ai/kodax/runtime';
import type { RuntimeExecutionProfileSource } from '@kodax-ai/kodax/client';
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

/** Only trusted Main state supplies persona and bindings, never Product input fields. */
export async function registerPartnerHostExecution(
  runtime: KodaXDaemonRuntime,
  sessionId: string,
  resumeLeaseId?: string,
  input: { readonly explicitMethod?: boolean; readonly query?: string } = {},
): Promise<{
  readonly lease: RuntimeHostToolLease;
  readonly context: RuntimeExecutionProfileSource;
}> {
  const session = await runtime.sessions.load(sessionId);
  if (session.surface !== 'partner' && session.profileId !== 'kodax-space.partner')
    throw new Error('Partner identity changed.');
  const projectRoot = session.workspaceRoot ?? session.gitRoot;
  if (!projectRoot) throw new Error('Partner Session has no workspace identity.');
  const { kodaxHost } = await import('../host.js');
  const local = kodaxHost.get(sessionId) ?? (await getSessionRuntimeStore().read(sessionId));
  const expert = local?.partnerExpert;
  if (expert) await getSpaceExpertCatalog().requireAvailable(expert);
  if (
    !input.explicitMethod &&
    !resumeLeaseId &&
    expert?.useSkill !== false &&
    expert?.expert.skillRef
  )
    throw new Error(
      'The shared Host does not yet expose trusted expert default-Skill admission. Disable this expert method or use an explicit Skill command.',
    );
  const bindings = structuredClone(local?.partnerConnectors ?? []);
  let latestBindings = bindings;
  const connectorRuntime = await createPartnerConnectorRunRuntime(undefined, {
    sessionId,
    projectRoot,
    surface: 'partner',
    bindings,
    permissionMode:
      (await runtime.sessions.getSettings(sessionId)).permissionMode ?? 'accept-edits',
    getCurrentBindings: () => kodaxHost.get(sessionId)?.partnerConnectors ?? latestBindings,
  });
  const connectorTools: Tool[] = (connectorRuntime?.listRunTools?.('mcp') ?? []).map((tool) => ({
    ...tool,
    input_schema: tool.inputSchema,
    sideEffect: tool.sideEffect === 'readonly' ? 'readonly' : 'mutates-state',
    handler: async (toolInput) => {
      latestBindings = [
        ...((kodaxHost.get(sessionId) ?? (await getSessionRuntimeStore().read(sessionId)))
          ?.partnerConnectors ?? []),
      ];
      const result = await connectorRuntime!.executeCapability!(
        'mcp',
        tool.capabilityId,
        toolInput,
      );
      return typeof result === 'string' ? result : JSON.stringify(result);
    },
  }));
  const lease = await registerSpaceHostTools(runtime, resumeLeaseId, [
    ...partnerHostToolDefinitions(),
    ...connectorTools,
  ]);
  const profile = buildPartnerAgentProfile(expert);
  const sources = await partnerSourceStore.list(sessionId);
  const evidence = input.query
    ? await retrievePartnerEvidenceForTurn({
        surface: 'partner',
        automaticRecall: partnerKnowledgeFeatures.automaticRecall,
        sessionId,
        projectRoot,
        query: input.query,
      })
    : null;
  return {
    lease,
    context: {
      agentProfile: {
        ...profile,
        instructions: [
          profile.instructions,
          buildPartnerSourceSummary(sources),
          evidence?.overlay,
          `Additional Space product tools: ${lease.tools.map((tool) => tool.name).join(', ')}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    },
  };
}
