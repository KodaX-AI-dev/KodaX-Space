import type { SessionEvent } from '@kodax-space/space-ipc-schema';

export type LiveTodoStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface LiveTodoItem {
  readonly status: LiveTodoStatus;
}

export interface TodoProgressSummary {
  readonly total: number;
  readonly completed: number;
  readonly settled: number;
  readonly active: number;
  readonly progressed: number;
}

export interface WorkBudget {
  readonly used: number;
  readonly cap: number;
}

export function summarizeTodoProgress(todos: readonly LiveTodoItem[]): TodoProgressSummary {
  let completed = 0;
  let settled = 0;
  let active = 0;

  for (const todo of todos) {
    if (todo.status === 'completed') completed++;
    if (isSettledTodoStatus(todo.status)) settled++;
    if (todo.status === 'in_progress') active++;
  }

  return {
    total: todos.length,
    completed,
    settled,
    active,
    progressed: Math.min(todos.length, settled + active),
  };
}

export function isSettledTodoStatus(status: LiveTodoStatus): boolean {
  return status === 'completed' || status === 'skipped' || status === 'cancelled';
}

export function isOpenTodoStatus(status: LiveTodoStatus): boolean {
  return status === 'pending' || status === 'in_progress' || status === 'failed';
}

export function applyLiveBudgetFallback(
  current: WorkBudget | undefined,
  event: SessionEvent,
): WorkBudget | undefined {
  if (!current || current.cap <= 0) return current;
  const estimatedUsed = estimateLiveBudgetUsed(current, event);
  if (estimatedUsed === undefined) return current;

  const used = clamp(Math.max(current.used, estimatedUsed), 0, current.cap);
  return used === current.used ? current : { ...current, used };
}

function estimateLiveBudgetUsed(current: WorkBudget, event: SessionEvent): number | undefined {
  switch (event.kind) {
    case 'tool_start':
    case 'tool_result':
      return current.used + 1;
    case 'tool_progress':
      return Math.max(current.used, 1);
    case 'todo_update': {
      const progress = summarizeTodoProgress(event.items);
      return progress.progressed > 0 ? Math.max(current.used, 1) : undefined;
    }
    case 'managed_task_status':
      return estimateManagedStatusBudgetUsed(current, event.status);
    default:
      return undefined;
  }
}

function estimateManagedStatusBudgetUsed(
  current: WorkBudget,
  status: Extract<SessionEvent, { kind: 'managed_task_status' }>['status'],
): number | undefined {
  const estimates: number[] = [];

  if (status.currentRound !== undefined && status.maxRounds !== undefined && status.maxRounds > 0) {
    estimates.push(Math.ceil((status.currentRound / status.maxRounds) * current.cap));
  }
  if (status.events && status.events.length > 0) {
    estimates.push(Math.min(current.cap, status.events.length));
  }
  if (status.activeWorkerId || status.phase || status.idleWaiting || status.childFanoutCount) {
    estimates.push(1);
  }

  return estimates.length > 0 ? Math.max(...estimates) : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
