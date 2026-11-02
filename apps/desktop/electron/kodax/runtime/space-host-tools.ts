import type {
  KodaXRuntime,
  RuntimeHostToolDescriptor,
  RuntimeHostToolHandler,
  RuntimeHostToolLease,
} from '@kodax-ai/kodax/runtime';

import {
  CREATE_ARTIFACT_TOOL,
  makeCreateArtifactHandler,
} from '../../artifact/create-artifact-tool.js';
import {
  CREATE_OFFICE_ARTIFACT_TOOL,
  makeCreateOfficeArtifactHandler,
} from '../../artifact/office-artifact-tool.js';
import { artifactStore } from '../../artifact/store.js';
import { pushToRenderer } from '../../ipc/push.js';
import {
  SPACE_CONTROL_APPLY_TOOL,
  SPACE_CONTROL_INSPECT_TOOL,
  isSpaceControlToolExposureEnabled,
  makeSpaceControlApplyHandler,
  makeSpaceControlInspectHandler,
} from '../../space-control/tools.js';
import { withSessionRunContext, type SdkToolExecutionContextLike } from '../session-run-context.js';
import { buildSpaceManual } from '../space-manual-topics.js';

export type SpaceToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly sideEffect: 'readonly' | 'reads-network' | 'mutates-state';
  readonly planModeAllowed?: boolean;
  readonly input_schema: Readonly<Record<string, unknown>>;
};

export type SpaceToolHandler = (
  input: Record<string, unknown>,
  context?: SdkToolExecutionContextLike,
) => Promise<string>;

function descriptor(definition: SpaceToolDefinition): RuntimeHostToolDescriptor {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.input_schema,
    sideEffect:
      definition.sideEffect === 'readonly' ||
      (definition.sideEffect === 'reads-network' && definition.planModeAllowed === true)
        ? 'none'
        : 'non_idempotent',
  };
}

export function spaceHostToolDescriptors(): readonly RuntimeHostToolDescriptor[] {
  const definitions: SpaceToolDefinition[] = [
    CREATE_ARTIFACT_TOOL,
    CREATE_OFFICE_ARTIFACT_TOOL,
    {
      name: 'space_manual',
      sideEffect: 'readonly',
      description:
        'Read the KodaX Space product manual. Use this for Space UI, providers, shortcuts, settings, workflows, and product usage questions; kodax_manual covers the underlying SDK/CLI.',
      input_schema: {
        type: 'object',
        properties: { topic: { type: 'string' }, query: { type: 'string' } },
      },
    },
  ];
  if (isSpaceControlToolExposureEnabled()) {
    definitions.push(SPACE_CONTROL_INSPECT_TOOL, SPACE_CONTROL_APPLY_TOOL);
  }
  return definitions.map(descriptor);
}

function buildHandlers(): Readonly<Record<string, SpaceToolHandler>> {
  const handlers: Record<string, SpaceToolHandler> = {
    space_manual: async (input) => {
      const sdk = await import('@kodax-ai/kodax/coding');
      const manual = buildSpaceManual(sdk);
      const result = sdk.resolveKodaXManual(
        {
          topic: typeof input.topic === 'string' ? input.topic : undefined,
          query: typeof input.query === 'string' ? input.query : undefined,
        },
        {
          productName: manual.productName,
          baseTopics: manual.baseTopics,
          extraTopics: manual.topics,
        },
      );
      return [
        `# ${result.title}`,
        result.content,
        result.topics.length ? `Topics: ${JSON.stringify(result.topics)}` : '',
        result.nextTopics.length ? `Related topics: ${result.nextTopics.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    },
    [CREATE_ARTIFACT_TOOL.name]: makeCreateArtifactHandler({
      store: artifactStore,
      notifyChanged: (payload) => pushToRenderer('artifact.changed', payload),
    }),
    [CREATE_OFFICE_ARTIFACT_TOOL.name]: makeCreateOfficeArtifactHandler({
      store: artifactStore,
      notifyChanged: (payload) => pushToRenderer('artifact.changed', payload),
    }),
  };
  if (isSpaceControlToolExposureEnabled()) {
    handlers[SPACE_CONTROL_INSPECT_TOOL.name] = makeSpaceControlInspectHandler();
    handlers[SPACE_CONTROL_APPLY_TOOL.name] = makeSpaceControlApplyHandler();
  }
  return handlers;
}

/** Register or resume stable-client implementations; possession is still granted per run. */
export async function registerSpaceHostTools(
  runtime: Pick<KodaXRuntime, 'hostTools' | 'sessions' | 'runs'>,
  resumeLeaseId?: string,
  extra: readonly (SpaceToolDefinition & { readonly handler: SpaceToolHandler })[] = [],
): Promise<RuntimeHostToolLease> {
  const implementations = {
    ...buildHandlers(),
    ...Object.fromEntries(extra.map((tool) => [tool.name, tool.handler])),
  };
  const results = new Map<string, Promise<{ content: string }>>();
  let leaseId: string | undefined = resumeLeaseId;
  const handlers: Record<string, RuntimeHostToolHandler> = {};

  for (const [name, implementation] of Object.entries(implementations)) {
    handlers[name] = (invocation) => {
      const existing = results.get(invocation.invocationId);
      if (existing) return existing;
      const pending = (async () => {
        if (!leaseId || invocation.leaseId !== leaseId) {
          return { content: 'Error: invalid Space host-tool lease.' };
        }
        const [session, run, settings] = await Promise.all([
          runtime.sessions.load(invocation.sessionId),
          runtime.runs.get(invocation.runId),
          runtime.sessions.getSettings(invocation.sessionId),
        ]);
        if (run.sessionId !== invocation.sessionId) {
          return { content: 'Error: Space host tool is not authorized for this run.' };
        }
        const projectRoot = session.workspaceRoot ?? session.gitRoot;
        if (!projectRoot) return { content: 'Error: Coder session has no trusted project root.' };
        const surface =
          session.surface === 'partner' || session.profileId === 'kodax-space.partner'
            ? 'partner'
            : 'code';
        const context = {
          sessionId: invocation.sessionId,
          toolCallId: invocation.invocationId,
          taskSurface: settings.permissionMode === 'plan' ? ('plan' as const) : ('repl' as const),
          executionCwd: settings.executionCwd ?? projectRoot,
          gitRoot: session.gitRoot ?? projectRoot,
          agentProfile: { surface },
        } as SdkToolExecutionContextLike;
        return withSessionRunContext(
          {
            sessionId: invocation.sessionId,
            projectRoot,
            surface,
            permissionMode: settings.permissionMode,
            toolCallId: invocation.invocationId,
            taskSurface: context.taskSurface,
          },
          async () => ({ content: await implementation({ ...invocation.input }, context) }),
        );
      })();
      results.set(invocation.invocationId, pending);
      // Bound memory without compromising retry idempotency for recent calls.
      if (results.size > 1_000) results.delete(results.keys().next().value as string);
      return pending;
    };
  }

  const lease = resumeLeaseId
    ? await runtime.hostTools.resume(resumeLeaseId, handlers)
    : await runtime.hostTools.register(
        [...spaceHostToolDescriptors(), ...extra.map(descriptor)],
        handlers,
      );
  leaseId = lease.id;
  return lease;
}
