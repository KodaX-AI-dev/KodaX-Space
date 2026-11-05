import type { RuntimeSessionService } from '@kodax-ai/kodax/runtime';
import { readRuntimeViewText } from './runtime-view-read.js';
import { readWithinRecoveryDeadline } from './interrupted-history.js';

/** The Host persists the final Workflow response in its owning Session before terminal. */
export async function readHostWorkflowResult(
  sessions: Pick<RuntimeSessionService, 'readHistory' | 'readHistoryEntry'>,
  sessionId: string,
  runId: string,
): Promise<string | undefined> {
  let cursor: string | undefined;
  const seen = new Set<string>();
  const deadline = Date.now() + 10_000;
  for (let page = 0; page < 500 && Date.now() < deadline; page++) {
    const history = await readWithinRecoveryDeadline(
      () => sessions.readHistory(sessionId, { cursor, limit: 150 }),
      deadline,
    );
    const result = history?.items.find(
      (item) =>
        item.taskResult?.source === 'workflow' &&
        (item.taskResult.taskId === runId ||
          (item.taskResult.taskId === undefined && item.taskResult.runId === runId)),
    );
    if (result)
      return readWithinRecoveryDeadline(
        () =>
          readRuntimeViewText(
            {
              readViewItem: (id, itemId, options) => sessions.readHistoryEntry(id, itemId, options),
            },
            sessionId,
            result,
          ),
        deadline,
      );
    if (!history?.nextCursor) return undefined;
    if (seen.has(history.nextCursor)) throw new Error('Workflow history cursor did not advance.');
    cursor = history.nextCursor;
    seen.add(cursor);
  }
  throw new Error('Workflow result lookup exceeded its read limit.');
}
