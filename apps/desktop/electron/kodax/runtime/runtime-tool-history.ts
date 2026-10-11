import {
  spaceSessionLiveProjectionSchema,
  type SpaceSessionLiveProjectionT,
} from '@kodax-space/space-ipc-schema';
import { boundToolResult } from './interrupted-history.js';
import {
  readRuntimeSessionView,
  readRuntimeViewText,
  type RuntimeViewReader,
} from './runtime-view-read.js';

/** Recover Host-retained tool facts from its complete current view. seq is the snapshot boundary. */
export async function recoverRuntimeToolHistory(
  service: RuntimeViewReader,
  projection: SpaceSessionLiveProjectionT,
): Promise<SpaceSessionLiveProjectionT> {
  const run = projection.activeRun;
  if (!run?.turnId) return projection;
  const view = await readRuntimeSessionView(service, projection.sessionId);
  const toolEvents: NonNullable<SpaceSessionLiveProjectionT['toolEvents']> = [];
  for (const item of view.items) {
    if (
      item.type !== 'tool' ||
      !item.tool ||
      item.sourceRunId !== run.runId ||
      item.sourceTurnId !== run.turnId
    )
      continue;
    const inputText = await readRuntimeViewText(service, projection.sessionId, item, 'input');
    const input: unknown = inputText ? JSON.parse(inputText) : {};
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Invalid retained tool input.');
    const origin = {
      runId: run.runId,
      turnId: run.turnId,
      seq: projection.cursor.seq,
      sentAt: item.tool.startedAt ?? item.timestamp ?? run.startedAt ?? 0,
      toolId: item.tool.callId,
      toolName: item.tool.name,
      sourceItemId: item.id,
    };
    toolEvents.push({ ...origin, kind: 'tool_start', input: input as Record<string, unknown> });
    if (item.tool.resultRecorded) {
      toolEvents.push({
        ...origin,
        kind: 'tool_result',
        sentAt: item.tool.endedAt ?? origin.sentAt,
        content: boundToolResult(await readRuntimeViewText(service, projection.sessionId, item)),
      });
    }
    if (toolEvents.length > 10_000)
      throw new Error('Runtime tool recovery exceeds the view read limit.');
  }
  return spaceSessionLiveProjectionSchema.parse({ ...projection, toolEvents });
}
