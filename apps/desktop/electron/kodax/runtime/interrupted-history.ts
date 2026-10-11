import { isDeepStrictEqual } from 'node:util';
import type { RuntimeRunStatus } from '@kodax-ai/kodax/runtime';
import {
  readRuntimeSessionView,
  readRuntimeViewText,
  type RuntimeViewReader,
} from './runtime-view-read.js';
import type { SessionHistoryItem } from '@kodax-space/space-ipc-schema';

type Run = Pick<RuntimeRunStatus, 'runId' | 'sessionId' | 'turnId' | 'phase' | 'interruptInputs'>;
type User = Extract<SessionHistoryItem, { kind: 'user' }>;
type Tool = Extract<SessionHistoryItem, { kind: 'tool_call' }>;
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

async function readRunItems(service: RuntimeViewReader, run: Run): Promise<SessionHistoryItem[]> {
  const view = await readRuntimeSessionView(service, run.sessionId);
  const items: SessionHistoryItem[] = [];
  for (const item of view.items) {
    if (item.sourceRunId !== run.runId || item.sourceTurnId !== run.turnId) continue;
    const common = { entryId: item.id, turnId: item.sourceTurnId, sentAt: item.timestamp };
    if (item.type === 'assistant' || item.type === 'thinking') {
      const text = await readRuntimeViewText(service, run.sessionId, item);
      items.push({
        kind: 'assistant',
        ...common,
        text: item.type === 'assistant' ? text : '',
        ...(item.type === 'thinking' ? { thinking: text } : {}),
      });
    } else if (item.type === 'tool' && item.tool) {
      const inputText = await readRuntimeViewText(service, run.sessionId, item, 'input');
      const input: unknown = inputText ? JSON.parse(inputText) : {};
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Invalid recovered tool input.');
      items.push({
        kind: 'tool_call',
        ...common,
        toolId: item.tool.callId,
        toolName: item.tool.name,
        input: input as Record<string, unknown>,
        ...(item.tool.resultRecorded
          ? { result: await readRuntimeViewText(service, run.sessionId, item) }
          : { interrupted: true }),
      });
    }
  }
  return items;
}

function consumeAssistantPrefix(
  row: Extract<SessionHistoryItem, { kind: 'assistant' }>,
  remaining: SessionHistoryItem[],
): boolean {
  const owed = { text: row.text, thinking: row.thinking ?? '' };
  while (owed.text || owed.thinking) {
    const next = remaining[0];
    if (next?.kind !== 'assistant') return false;
    for (const part of ['text', 'thinking'] as const) {
      const content = next[part] ?? '';
      if (!content) continue;
      if (!owed[part] || !content.startsWith(owed[part])) return false;
      next[part] = content.slice(owed[part].length);
      owed[part] = '';
    }
    if (!next.text && !next.thinking) remaining.shift();
    // A retained suffix before the other component is not a canonical prefix.
    else if (owed.text || owed.thinking) return false;
  }
  return true;
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
    } else if (!consumeAssistantPrefix(row, remaining)) return undefined;
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
  service: RuntimeViewReader,
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
            text: '本页未包含该中断轮次的完整历史，部分保留记录暂未恢复。已保存的历史仍可查看，可继续发送消息。',
          },
        ]);
      continue;
    }
    const journal = await readWithinRecoveryDeadline(() => readRunItems(service, run), deadline);
    const hasDeliveredInput = !!run.interruptInputs?.some(
      (input) => input.deliveredAt || input.entryId,
    );
    for (const user of users) {
      const turnId = user.turnId!;
      if (!hasSingleUserIdentity(users, turnId, hasDeliveredInput) || additions.has(turnId))
        continue;
      const canonical = items.filter((item) => 'turnId' in item && item.turnId === turnId);
      const sameTurn = journal.filter((item) => 'turnId' in item && item.turnId === turnId);
      const tail = missingTail(canonical, sameTurn);
      if (tail === undefined) continue;
      const provenTools = sameTurn.filter(
        (candidate): candidate is Tool => candidate.kind === 'tool_call',
      );
      let toolIndex = 0;
      for (const item of canonical) {
        if (item.kind !== 'tool_call') continue;
        // missingTail already proved the canonical prefix, including each
        // ordered tool input. Consume every occurrence, even saved receipts.
        const receipt = provenTools[toolIndex++];
        if (item.result !== undefined) continue;
        if (receipt?.result !== undefined) item.result = boundToolResult(receipt.result);
        else item.interrupted = true;
      }
      if (tail?.length)
        additions.set(turnId, [
          {
            kind: 'workflow_notice',
            turnId,
            text: '本轮已中断；以下内容由 Runtime 保留记录恢复，未完成内容不属于正式回答。继续任务时会按需补充恢复摘要。',
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
