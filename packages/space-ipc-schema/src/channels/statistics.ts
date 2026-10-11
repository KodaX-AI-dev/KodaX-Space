import { z } from 'zod';
import { spaceRuntimeToolSandboxSchema } from './runtime.js';

const id = z.string().min(1).max(256);
const count = z.number().int().nonnegative();
const MAX_STATISTICS_BYTES = 16 * 1024 * 1024;
function boundStatisticsPayload(value: unknown, context: z.RefinementCtx): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_STATISTICS_BYTES) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Statistics payload exceeds the IPC read limit.',
    });
  }
}
const usage = z
  .object({
    inputTokens: count,
    outputTokens: count,
    totalTokens: count,
    cacheReadTokens: count,
    cacheWriteTokens: count,
    thoughtTokens: count,
  })
  .strict();
const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('run'), runId: id }).strict(),
  z
    .object({
      kind: z.literal('actor_turn'),
      actorPath: id,
      turnId: id,
      parentRunId: id.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('operation'),
      operationId: id,
      operation: z.literal('session.compact'),
    })
    .strict(),
]);
const contextFact = z.object({
  runtimeId: id,
  revision: count,
  target,
  sessionId: id.optional(),
  runId: id.optional(),
  turnId: id.optional(),
  contextId: id.optional(),
  contextKind: z.enum(['root', 'child']).optional(),
  parentContextId: id.optional(),
  agentId: id.optional(),
  contextRevision: count.optional(),
  provider: id.optional(),
  model: z.string().max(512).optional(),
  profile: z.enum(['off', 'report_only', 'balanced', 'small_window', 'aggressive']),
  contextWindow: count,
  smallWindow: z.boolean(),
  pressure: z.enum(['low', 'medium', 'high', 'critical']),
  tokenBreakdown: z.object({
    systemPrompt: count,
    toolSchemas: count,
    skillCatalog: count,
    mcpCatalog: count,
    transcript: count,
    pendingInput: count,
    recentToolResults: count,
    reservedResponse: count,
    total: count,
  }),
  usedTokens: count,
  availableTokens: count,
  usedRatio: z.number().finite().nonnegative(),
  toolSchemaRatio: z.number().finite().nonnegative(),
  createdAt: z.string().max(64),
  recommendations: z
    .array(
      z.enum([
        'prefer_progressive_tool_exposure',
        'compact_or_summarize_history',
        'trim_recent_tool_results',
        'reserve_response_budget',
      ]),
    )
    .max(4),
  compactionBudget: z
    .object({
      triggerPercent: z.number().finite(),
      absoluteTriggerTokens: count.optional(),
      triggerTokens: count,
      physicalCapacityTokens: count,
      reservedResponseTokens: count,
      reservedMemoryTokens: count,
    })
    .optional(),
});
export const spaceSessionStatisticsSchema = z
  .object({
    runtimeId: id,
    sessionId: id,
    revision: count,
    coverage: z.enum(['complete', 'partial']),
    issues: z.array(z.string().max(4096)).max(512),
    usage,
    requestCount: count,
    requestsWithoutUsage: count,
    physicalRequestCount: count,
    operationCount: count,
    contexts: z.array(contextFact).max(10_000),
  })
  .strict()
  .superRefine(boundStatisticsPayload);
const requestFact = z.object({
  requestId: id,
  logicalRequestId: id,
  sessionId: id,
  runtimeId: id,
  revision: count,
  target,
  provider: id,
  model: z.string().max(512).optional(),
  purpose: id,
  attempt: count,
  boundary: z.enum(['physical_attempt', 'provider_operation']),
  dispatch: z.enum(['dispatched', 'unknown']),
  state: z.enum(['started', 'succeeded', 'failed', 'cancelled', 'unknown']),
  startedAt: z.string().max(64),
  endedAt: z.string().max(64).optional(),
  fallback: z.boolean(),
  previousRequestId: id.optional(),
  recovery: z.literal('outcome_unknown').optional(),
  wireObservation: z.enum(['pending', 'observed', 'unavailable']).optional(),
  route: z.object({ chainId: id, attempt: count, fromProvider: id.optional() }).optional(),
  attribution: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('actor_turn'), actorPath: id, turnId: id }),
      z.object({ kind: z.literal('workflow'), workflowRunId: id }),
    ])
    .optional(),
  usage: z
    .object({
      inputTokens: count,
      outputTokens: count,
      totalTokens: count,
      cachedReadTokens: count.optional(),
      cachedWriteTokens: count.optional(),
      thoughtTokens: count.optional(),
    })
    .optional(),
});
const toolFact = z
  .object({
    id,
    toolId: id,
    name: id,
    sessionId: id,
    runtimeId: id,
    revision: count,
    target,
    state: z.enum(['prepared', 'executing', 'completed', 'not_executed', 'unknown']),
    result: z.enum(['succeeded', 'failed', 'cancelled']).optional(),
    updatedAt: z.string().max(64),
    sandbox: z.array(spaceRuntimeToolSandboxSchema).max(512),
  })
  .strict();
export const sessionStatisticsChannel = {
  name: 'session.statistics',
  direction: 'invoke',
  input: z.object({ sessionId: id }).strict(),
  output: spaceSessionStatisticsSchema,
} as const;
export const sessionStatisticsChangedChannel = {
  name: 'session.statisticsChanged',
  direction: 'push',
  payload: spaceSessionStatisticsSchema,
} as const;
export const sessionExecutionFactsChannel = {
  name: 'session.executionFacts',
  direction: 'invoke',
  input: z
    .object({
      sessionId: id,
      kind: z.enum(['requests', 'tools']),
      cursor: id.optional(),
      limit: z.number().int().min(1).max(512).optional(),
    })
    .strict(),
  output: z
    .discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('requests'),
          runtimeId: id,
          sessionId: id,
          revision: count,
          items: z.array(requestFact).max(512),
          nextCursor: id.optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal('tools'),
          runtimeId: id,
          sessionId: id,
          revision: count,
          items: z.array(toolFact).max(512),
          nextCursor: id.optional(),
        })
        .strict(),
    ])
    .superRefine(boundStatisticsPayload),
} as const;
export type SpaceSessionStatisticsT = z.infer<typeof spaceSessionStatisticsSchema>;
