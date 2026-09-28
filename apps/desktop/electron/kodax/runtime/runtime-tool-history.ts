import type { RuntimeEvent, RuntimeEventService, RuntimeTypedEvent } from '@kodax-ai/kodax/runtime';
import {
  spaceSessionLiveProjectionSchema,
  type SpaceSessionLiveProjectionT,
} from '@kodax-space/space-ipc-schema';
import { boundToolResult } from './interrupted-history.js';
import { isTransientChildRuntimeEvent } from './coder-daemon-projection.js';

type ToolEvent = NonNullable<SpaceSessionLiveProjectionT['toolEvents']>[number];
const PAGE_SIZE = 512;

function projectToolEvent(event: RuntimeTypedEvent): ToolEvent | undefined {
  if (event.turnId === undefined) return undefined;
  const origin = {
    seq: event.seq,
    sentAt: Date.parse(event.time),
    runId: event.runId,
    turnId: event.turnId,
  };
  const toolId = (meta: object | undefined, fallback: string) =>
    meta && 'toolCallId' in meta && typeof meta.toolCallId === 'string'
      ? meta.toolCallId
      : fallback;
  if (event.type === 'tool.started') {
    const { tool, meta } = event.payload;
    return {
      kind: 'tool_start',
      ...origin,
      toolId: toolId(meta, tool.id),
      toolName: tool.name,
      input: tool.input ?? {},
    };
  }
  if (event.type === 'tool.finished') {
    const { result, meta } = event.payload;
    return {
      kind: 'tool_result',
      ...origin,
      toolId: toolId(meta, result.id),
      toolName: result.name,
      content: boundToolResult(result.content),
    };
  }
  return undefined;
}

async function* replaySnapshotWindow(
  service: Pick<RuntimeEventService, 'replay'>,
  projection: SpaceSessionLiveProjectionT,
  runId: string,
  firstSeq: number,
): AsyncGenerator<RuntimeEvent> {
  const journalEpoch = projection.cursor.journalEpoch!;
  let after = { sessionId: projection.sessionId, journalEpoch, seq: Math.max(0, firstSeq - 1) };
  while (after.seq < projection.cursor.seq) {
    const page: readonly RuntimeEvent[] = await service.replay({
      sessionId: projection.sessionId,
      runId,
      type: ['tool.started', 'tool.finished', 'output.segment.started'],
      after,
      limit: PAGE_SIZE,
    });
    for (const event of page) {
      if (
        event.seq > after.seq &&
        event.seq <= projection.cursor.seq &&
        event.sessionId === projection.sessionId &&
        event.runId === runId &&
        event.cursor.journalEpoch === journalEpoch
      )
        yield event;
    }
    const last = page.at(-1);
    if (page.length < PAGE_SIZE || !last || last.seq >= projection.cursor.seq) break;
    if (last.seq <= after.seq || last.cursor.journalEpoch !== journalEpoch)
      throw new Error('Runtime tool recovery cursor did not advance.');
    after = last.cursor;
  }
}

/** Recover only the same immutable journal window as the cumulative output snapshot. */
export async function recoverRuntimeToolHistory(
  service: Pick<RuntimeEventService, 'replay'>,
  projection: SpaceSessionLiveProjectionT,
): Promise<SpaceSessionLiveProjectionT> {
  const run = projection.activeRun;
  const output = projection.outputSegment;
  const { journalEpoch } = projection.cursor;
  if (!run?.turnId || !output || !journalEpoch) return projection;
  const segments = [...output.retained, ...(output.active ? [output.active] : [])];
  const starts = segments.flatMap((segment) =>
    segment.startedAtSeq === undefined ? [] : [segment.startedAtSeq],
  );
  if (starts.length === 0) return projection;
  const { parseRuntimeEvent } = await import('@kodax-ai/kodax/runtime');
  const toolEvents: ToolEvent[] = [];
  const timestamps = new Map<string, number>();
  for await (const raw of replaySnapshotWindow(
    service,
    projection,
    run.runId,
    Math.min(...starts),
  )) {
    if (raw.turnId !== run.turnId) continue;
    const parsed = parseRuntimeEvent(raw);
    if (!parsed.ok) throw new Error(`Invalid tool recovery event: ${parsed.error}`);
    const event = parsed.event;
    if (isTransientChildRuntimeEvent(event)) continue;
    const tool = projectToolEvent(event);
    if (tool) toolEvents.push(tool);
    if (event.type === 'output.segment.started')
      timestamps.set(event.payload.providerRequestId, Date.parse(event.time));
    if (toolEvents.length > 10_000)
      throw new Error('Runtime tool recovery exceeds the snapshot event limit.');
  }
  const timed = (segment: (typeof segments)[number]) => ({
    ...segment,
    ...(timestamps.has(segment.providerRequestId)
      ? { startedAt: timestamps.get(segment.providerRequestId)! }
      : {}),
  });
  return spaceSessionLiveProjectionSchema.parse({
    ...projection,
    toolEvents,
    outputSegment: {
      retained: output.retained.map(timed),
      ...(output.active ? { active: timed(output.active) } : {}),
    },
  });
}
