import { isDeepStrictEqual } from 'node:util';
import type {
  RuntimeEvent,
  RuntimeEventService,
  RuntimeRunStatus,
  RuntimeTypedEvent,
} from '@kodax-ai/kodax/runtime';
import type { SessionHistoryItem } from '@kodax-space/space-ipc-schema';
import { isTransientChildRuntimeEvent } from './coder-daemon-projection.js';

type Run = Pick<RuntimeRunStatus, 'runId' | 'sessionId' | 'turnId' | 'phase' | 'interruptInputs'>;
type Assistant = Extract<SessionHistoryItem, { kind: 'assistant' }>;
type User = Extract<SessionHistoryItem, { kind: 'user' }>;
type Tool = Extract<SessionHistoryItem, { kind: 'tool_call' }>;
const toolIdFromMeta = (meta: object | undefined, fallback: string): string =>
  meta && 'toolCallId' in meta && typeof meta.toolCallId === 'string' ? meta.toolCallId : fallback;
const PAGE_SIZE = 512;
const MAX_BYTES = 16 * 1024 * 1024;

export function boundToolResult(result: string): string {
  return result.length > 524_288 ? result.slice(0, 524_250) + '\n[恢复的工具输出已截断]' : result;
}

export async function readWithinRecoveryDeadline<T>(
  read: () => Promise<T>,
  deadline: number,
): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Interrupted history recovery timed out.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Interrupted history recovery timed out.')),
          remaining,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function boundRecoveredRows(items: readonly SessionHistoryItem[]): SessionHistoryItem[] {
  return items.flatMap<SessionHistoryItem>((item) => {
    if (item.kind !== 'assistant')
      return [
        item.kind === 'tool_call' && item.result !== undefined
          ? {
              ...item,
              result: boundToolResult(item.result),
            }
          : item,
      ];
    const length = Math.max(item.text.length, item.thinking?.length ?? 0);
    return Array.from({ length: Math.max(1, Math.ceil(length / 262_144)) }, (_, index) => ({
      ...item,
      entryId: `${item.entryId}:${index}`,
      text: item.text.slice(index * 262_144, (index + 1) * 262_144),
      thinking: item.thinking?.slice(index * 262_144, (index + 1) * 262_144),
    }));
  });
}

async function replayRun(
  service: Pick<RuntimeEventService, 'replay'>,
  run: Run,
  deadline: number,
): Promise<RuntimeEvent[]> {
  const rows: RuntimeEvent[] = [];
  let after: RuntimeEvent['cursor'] | undefined;
  let bytes = 0;
  for (;;) {
    const page = await readWithinRecoveryDeadline(
      () =>
        service.replay({
          sessionId: run.sessionId,
          runId: run.runId,
          after,
          type: [
            'output.segment.started',
            'assistant.delta',
            'thinking.delta',
            'tool.started',
            'tool.finished',
            'run.input.delivered',
          ],
          limit: PAGE_SIZE,
        }),
      deadline,
    );
    for (const row of page) {
      if (row.sessionId !== run.sessionId || row.runId !== run.runId) continue;
      if (after && (row.cursor.journalEpoch !== after.journalEpoch || row.seq <= after.seq))
        throw new Error('Interrupted history journal cursor changed.');
      bytes += Buffer.byteLength(JSON.stringify(row));
      if (bytes > MAX_BYTES) throw new Error('Interrupted history exceeds the recovery window.');
      rows.push(row);
    }
    if (page.length < PAGE_SIZE) return rows;
    const next = page.at(-1)!.cursor;
    if (after && next.seq <= after.seq)
      throw new Error('Interrupted history cursor did not advance.');
    after = next;
  }
}

function appendEvent(items: SessionHistoryItem[], event: RuntimeTypedEvent): void {
  const turnId = event.turnId;
  if (!turnId || isTransientChildRuntimeEvent(event)) return;
  const entryId = `journal:${event.runId}:${event.seq}`;
  if (event.type === 'assistant.delta' || event.type === 'thinking.delta') {
    const last = items.at(-1);
    const item: Assistant =
      last?.kind === 'assistant' && last.turnId === turnId
        ? last
        : {
            kind: 'assistant',
            entryId,
            turnId,
            text: '',
            thinking: '',
            sentAt: Date.parse(event.time),
          };
    if (item !== last) items.push(item);
    if (event.type === 'assistant.delta') item.text += event.payload.text;
    else item.thinking = (item.thinking ?? '') + event.payload.text;
  } else if (event.type === 'tool.started') {
    const { tool, meta } = event.payload;
    items.push({
      kind: 'tool_call',
      entryId,
      turnId,
      toolId: toolIdFromMeta(meta, tool.id),
      toolName: tool.name,
      input: tool.input ?? {},
    });
  } else if (event.type === 'tool.finished') {
    const { result, meta } = event.payload;
    const toolId = toolIdFromMeta(meta, result.id);
    const tool = [...items]
      .reverse()
      .find(
        (item): item is Tool =>
          item.kind === 'tool_call' && item.turnId === turnId && item.toolId === toolId,
      );
    if (tool) tool.result = result.content;
  }
}

async function projectRun(events: readonly RuntimeEvent[]): Promise<SessionHistoryItem[]> {
  const { parseRuntimeEvent } = await import('@kodax-ai/kodax/runtime');
  const items: SessionHistoryItem[] = [];
  let segment: SessionHistoryItem[] = [];
  let replacedThinking: Assistant[] = [];
  for (const raw of events) {
    const parsed = parseRuntimeEvent(raw);
    if (!parsed.ok) throw new Error('Invalid interrupted history event.');
    if (isTransientChildRuntimeEvent(parsed.event)) continue;
    if (parsed.event.type === 'output.segment.started') {
      if (parsed.event.payload.mode !== 'replace') items.push(...segment);
      else if (segment.length > 0)
        replacedThinking = segment
          .filter((item): item is Assistant => item.kind === 'assistant' && !!item.thinking)
          .map((item) => ({ ...item, text: '' }));
      segment = [];
    } else appendEvent(segment, parsed.event);
  }
  if (items.length === 0 && segment.length === 0 && replacedThinking.length > 0)
    return [
      {
        kind: 'workflow_notice',
        turnId: replacedThinking[0].turnId,
        text: '以下为重试前未完成的思考，仅供查看；重试没有生成新内容，这些记录不是最终回答。',
      },
      ...replacedThinking,
    ];
  return [...items, ...segment].map((item) =>
    item.kind === 'tool_call' && item.result === undefined ? { ...item, interrupted: true } : item,
  );
}

/** Only subtract an exact prefix within an already proven turn. Never match across branches. */
function missingTail(
  canonical: readonly SessionHistoryItem[],
  journal: readonly SessionHistoryItem[],
): SessionHistoryItem[] | undefined {
  const remaining = structuredClone(journal) as SessionHistoryItem[];
  for (const row of canonical) {
    if (row.kind !== 'assistant' && row.kind !== 'tool_call') continue;
    const next = remaining[0];
    if (row.kind === 'tool_call') {
      if (
        next?.kind !== 'tool_call' ||
        row.toolId !== next.toolId ||
        row.toolName !== next.toolName ||
        !isDeepStrictEqual(row.input ?? {}, next.input ?? {})
      )
        return undefined;
      remaining.shift();
    } else {
      if (
        next?.kind !== 'assistant' ||
        !next.text.startsWith(row.text) ||
        !(next.thinking ?? '').startsWith(row.thinking ?? '')
      )
        return undefined;
      next.text = next.text.slice(row.text.length);
      next.thinking = (next.thinking ?? '').slice((row.thinking ?? '').length);
      if (!next.text && !next.thinking) remaining.shift();
    }
  }
  return remaining;
}

// Older SDK snapshots can append the exact same admitted prompt twice. Identity
// requires its timestamp and full content, not merely matching query text.
function hasSingleUserIdentity(
  users: readonly User[],
  turnId: string,
  hasDeliveredInput: boolean,
): boolean {
  const matches = users.filter((user) => user.turnId === turnId);
  const first = matches[0];
  return (
    matches.length === 1 ||
    (!hasDeliveredInput &&
      first?.sentAt !== undefined &&
      matches.every(
        (user) =>
          user.sentAt === first.sentAt &&
          user.content === first.content &&
          isDeepStrictEqual(user.attachments, first.attachments),
      ))
  );
}

export async function recoverInterruptedHistory(
  events: Pick<RuntimeEventService, 'replay'>,
  runs: readonly Run[],
  sessionId: string,
  items: readonly SessionHistoryItem[],
  completeTurnIds?: readonly string[],
  deadline = Date.now() + 15_000,
): Promise<SessionHistoryItem[]> {
  const additions = new Map<string, SessionHistoryItem[]>();
  items = structuredClone(items);
  const users = items.filter(
    (item): item is User =>
      item.kind === 'user' &&
      !!item.turnId &&
      !!item.entryId &&
      (completeTurnIds === undefined || completeTurnIds.includes(item.turnId)),
  );
  for (const run of runs) {
    if (run.sessionId !== sessionId || !['interrupted', 'cancelled', 'failed'].includes(run.phase))
      continue;
    if (!users.some((user) => user.turnId === run.turnId)) {
      if (completeTurnIds && items.some((item) => 'turnId' in item && item.turnId === run.turnId))
        additions.set(run.turnId!, [
          {
            kind: 'workflow_notice',
            turnId: run.turnId,
            text: '本页未包含该中断轮次的完整历史，部分运行日志暂未恢复。已保存的历史仍可查看，可继续发送消息。',
          },
        ]);
      continue;
    }
    const raw = await replayRun(events, run, deadline);
    const hasDeliveredInput =
      !!run.interruptInputs?.some((input) => input.deliveredAt || input.entryId) ||
      raw.some((event) => event.type === 'run.input.delivered');
    const journal = await projectRun(raw);
    for (const user of users) {
      const turnId = user.turnId!;
      if (!hasSingleUserIdentity(users, turnId, hasDeliveredInput) || additions.has(turnId))
        continue;
      const canonical = items.filter((item) => 'turnId' in item && item.turnId === turnId);
      const sameTurn = journal.filter((item) => 'turnId' in item && item.turnId === turnId);
      const tail = missingTail(canonical, sameTurn);
      if (tail === undefined) continue;
      for (const item of canonical) {
        if (item.kind !== 'tool_call' || item.result !== undefined) continue;
        const receipt = sameTurn.find(
          (candidate): candidate is Tool =>
            candidate.kind === 'tool_call' &&
            candidate.toolId === item.toolId &&
            candidate.toolName === item.toolName,
        );
        if (receipt?.result !== undefined) item.result = boundToolResult(receipt.result);
        else item.interrupted = true;
      }
      if (tail?.length)
        additions.set(turnId, [
          {
            kind: 'workflow_notice',
            turnId,
            text: '本轮已中断；以下内容从运行日志恢复，完整日志未写入正式对话。继续任务时会按需补充恢复摘要。',
          },
          ...boundRecoveredRows(tail),
        ]);
    }
  }
  const output: SessionHistoryItem[] = [];
  const lastIndexByTurn = new Map(
    items.flatMap((item, index) =>
      'turnId' in item && item.turnId ? [[item.turnId, index] as const] : [],
    ),
  );
  for (const [index, item] of items.entries()) {
    output.push(item);
    const turnId = 'turnId' in item ? item.turnId : undefined;
    if (turnId && lastIndexByTurn.get(turnId) === index)
      output.push(...(additions.get(turnId) ?? []));
  }
  return output;
}
