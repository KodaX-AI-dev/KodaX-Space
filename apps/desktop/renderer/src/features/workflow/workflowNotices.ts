import type { WorkflowEventPayload, WorkflowProcessItemT } from '@kodax-space/space-ipc-schema';

export interface WorkflowNoticeCandidate {
  readonly key: string;
  readonly text: string;
  readonly sentAt?: number;
}

const AGENT_SUMMARY_MAX = 900;

// NOTE: the per-agent digest (workflow.activity, kind:'digest') deliberately does NOT
// produce a transcript notice. It feeds the right-sidebar live activity strip only. The
// durable per-agent transcript summary comes solely from the snapshot item-summary path
// (formatItemSummaryNotice below, keyed + deduped) — the same source restore replays.
// Having BOTH emit produced byte-identical duplicate summaries (one keyed, one keyless),
// since the digest event and the snapshot item are two views of the SAME SDK event
// (agent_completed/…: item.id === childAgentId === taskId). See #dedup.

function workflowBlockText(value: string | undefined, max?: number): string {
  if (!value) return '';
  const text = value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (max === undefined) return text;
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 4)).trimEnd()}\n...`;
}

export function formatWorkflowEventNotices(
  payload: WorkflowEventPayload,
): WorkflowNoticeCandidate[] {
  const notices: WorkflowNoticeCandidate[] = [];

  // Live run progress (agent spawned / phase started / artifact written / …) is
  // NOT pushed to the transcript — it belongs to the right-sidebar Workflow live
  // ticker. Only per-agent summaries + the final result land in history below.

  if (payload.type === 'workflow_updated' || payload.type === 'workflow_finished') {
    const fallbackSentAt = timestampFromIso(payload.snapshot.updatedAt);
    for (const item of payload.snapshot.items) {
      const summaryNotice = formatItemSummaryNotice(payload.snapshot.runId, item, fallbackSentAt);
      if (summaryNotice) notices.push(summaryNotice);
    }
  }

  if (payload.type === 'workflow_finished' && payload.snapshot.resultSource !== 'session') {
    const finished = formatWorkflowFinishedNotice(payload);
    if (finished) notices.push(finished);
  }

  return notices;
}

function formatWorkflowFinishedNotice(
  payload: WorkflowEventPayload,
): WorkflowNoticeCandidate | null {
  const name = payload.snapshot.displayName ?? payload.snapshot.workflowName;
  const status = payload.snapshot.status;
  const detail = workflowBlockText(
    payload.snapshot.resultSummary ?? payload.snapshot.error ?? payload.message,
  );
  // Include the run id so a failed/completed notice is unambiguous when several runs
  // share the same workflow name. Users reported not being able to tell whether the
  // *currently running* workflow failed or a *previous* same-named run did (e.g. a
  // failed run fixed + rerun): the transcript notice now names the exact run.
  const runTag = payload.snapshot.runId;
  const text = `[workflow] ${status}: ${name} · ${runTag}${detail ? `\n${detail}` : ''}`;
  return {
    // Per-run+status key (no body fingerprint): a run finishes once, and if the terminal
    // notice is re-emitted (event replay / restore) it replaces in place instead of
    // duplicating. Distinct runIds keep distinct notices (same-name reruns stay separate).
    key: `finished:${payload.snapshot.runId}:${status}`,
    text,
    sentAt: timestampFromIso(payload.snapshot.updatedAt),
  };
}

function formatItemSummaryNotice(
  runId: string,
  item: WorkflowProcessItemT,
  fallbackSentAt?: number,
): WorkflowNoticeCandidate | null {
  if (item.kind !== 'agent') return null;

  const error = workflowBlockText(item.error, AGENT_SUMMARY_MAX);
  const summary =
    item.summaryStatus === 'result' || item.summaryStatus === 'notice'
      ? workflowBlockText(item.summary, AGENT_SUMMARY_MAX)
      : '';
  const body = error || summary;
  if (!body) return null;

  const title = item.title || item.agentId || item.childAgentId || item.id;
  const label = error || item.status === 'failed' ? 'agent failed' : 'agent summary';
  // Stable per-agent key: exactly ONE transcript notice per (run, item), replaced in
  // place as that agent's summary evolves (excerpt → result, status transitions). When
  // status/summaryStatus/body were part of the key, every evolution produced a NEW notice
  // — so the same agent's summary appeared multiple times (user report). appendWorkflowNotice
  // updates the existing keyed notice in place with the latest body instead of appending.
  return {
    key: `item:${runId}:${item.id}`,
    text: `[workflow] ${label}: ${title}\n${body}`,
    sentAt: timestampFromIso(item.endedAt ?? item.startedAt) ?? fallbackSentAt,
  };
}

function timestampFromIso(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
