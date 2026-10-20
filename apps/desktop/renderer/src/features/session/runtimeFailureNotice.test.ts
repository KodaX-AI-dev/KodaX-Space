import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  SpaceCoderConnectionProjectionT,
  SpaceRuntimeProfileProjectionT,
  SpaceSessionLiveProjectionT,
} from '@kodax-space/space-ipc-schema';

import type { ConversationMessage } from './composeMessages.js';
import {
  appendRuntimeFailureNotices,
  decorateProductFailureNotices,
  runtimeFailureProfileHasCurrentAuthority,
} from './runtimeFailureNotice.js';

const failureDetail = {
  failureKind: 'runtime_cleanup',
  stage: 'runtime_settlement',
  providerErrorCode: 'runtime_settlement_failed',
  safeMessage: 'The Runtime could not confirm settlement.',
  requestId: 'req_settlement',
} as const;

test('SDK errors keep their identity and text while receiving Runtime retry and diagnostic metadata', () => {
  const message: ConversationMessage = {
    kind: 'system_notice',
    id: 'sdk-error',
    variant: 'error',
    text: 'SDK error text',
    runtimeRunId: 'run_settlement',
  };
  const live = activeUnknownLive();
  const result = decorateProductFailureNotices(
    [message],
    {
      ...live,
      activeRun: {
        ...live.activeRun!,
        action: 'retry',
        retriable: true,
        retryAvailableAt: 10,
      },
    },
    undefined,
  );
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    ...message,
    failureDetail,
    failureKind: failureDetail.failureKind,
    action: 'retry',
    retriable: true,
    retryAvailableAt: 10,
  });
  const diagnostics = decorateProductFailureNotices([], live, undefined);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.id, 'runtime_failure_run_settlement');
});

function activeUnknownLive(): SpaceSessionLiveProjectionT {
  return {
    sessionId: 'session_runtime_failure',
    projectionRevision: 3,
    cursor: { runtimeId: 'runtime_1', sessionId: 'session_runtime_failure', seq: 12 },
    transcriptRevision: 'revision_1',
    activeRun: {
      runId: 'run_settlement',
      sessionId: 'session_runtime_failure',
      phase: 'unknown',
      failureKind: failureDetail.failureKind,
      failureDetail,
      retriable: false,
    },
    queuedRuns: [],
    activeTools: [],
    todos: [],
    queuedInputs: [],
    interactions: [],
  };
}

test('active unknown run exposes structured settlement diagnostics without fabricating a terminal event', () => {
  const notices = appendRuntimeFailureNotices([], activeUnknownLive(), undefined);

  assert.deepEqual(notices, [
    {
      kind: 'system_notice',
      id: 'runtime_failure_run_settlement',
      variant: 'error',
      text: failureDetail.safeMessage,
      failureKind: failureDetail.failureKind,
      failureDetail,
      runtimeRunId: 'run_settlement',
      retriable: false,
    },
  ]);
});

test('unknown terminal effects remain visible even when no Provider failure exists', () => {
  const terminal = {
    revision: 3,
    kind: 'interrupted',
    code: 'daemon_crashed',
    effectOutcome: 'unknown',
  } as const;
  const profileSession = {
    sessionId: 'session_unknown_effect',
    surface: 'code',
    createdAt: 1,
    lastActivityAt: 2,
    queuedRuns: [],
    lastTerminalRun: {
      runId: 'run_unknown_effect',
      sessionId: 'session_unknown_effect',
      phase: 'interrupted',
      terminal,
    },
  } satisfies SpaceRuntimeProfileProjectionT['sessions'][number];
  const notices = decorateProductFailureNotices([], undefined, profileSession);
  assert.equal(notices.length, 1);
  const notice = notices[0];
  assert.equal(notice?.kind, 'system_notice');
  if (notice?.kind !== 'system_notice') throw new Error('Expected terminal diagnostic');
  assert.deepEqual('terminal' in notice && notice.terminal, terminal);
  assert.equal(notice.action, undefined, 'unknown effects must not suggest a blind retry');
});

test('unknown effects remove a stale retry action while retaining the SDK error item', () => {
  const terminal = {
    revision: 3,
    kind: 'interrupted',
    code: 'daemon_crashed',
    effectOutcome: 'unknown',
  } as const;
  const message: ConversationMessage = {
    kind: 'system_notice',
    id: 'sdk-error',
    variant: 'error',
    text: 'Original SDK error',
    runtimeRunId: 'run_unknown_effect',
    action: 'retry',
    failureDetail,
  };
  const profileSession = {
    sessionId: 'session_unknown_effect',
    surface: 'code',
    createdAt: 1,
    lastActivityAt: 2,
    queuedRuns: [],
    lastTerminalRun: {
      runId: 'run_unknown_effect',
      sessionId: 'session_unknown_effect',
      phase: 'interrupted',
      terminal,
      failureDetail,
    },
  } satisfies SpaceRuntimeProfileProjectionT['sessions'][number];
  const notices = decorateProductFailureNotices([message], undefined, profileSession);
  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.id, 'sdk-error');
  if (notices[0]?.kind !== 'system_notice') throw new Error('Expected SDK error');
  assert.equal(notices[0].action, undefined);
});

test('cold-start profile terminal failure exposes its structured diagnostics', () => {
  const profileSession: SpaceRuntimeProfileProjectionT['sessions'][number] = {
    sessionId: 'session_runtime_failure',
    surface: 'code',
    createdAt: 1,
    lastActivityAt: 2,
    queuedRuns: [],
    lastTerminalRun: {
      runId: 'run_cold_terminal',
      sessionId: 'session_runtime_failure',
      phase: 'failed',
      failureKind: failureDetail.failureKind,
      failureDetail,
    },
  };

  const notices = appendRuntimeFailureNotices([], undefined, profileSession);

  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.kind, 'system_notice');
  if (notices[0]?.kind === 'system_notice') {
    assert.equal(notices[0].runtimeRunId, 'run_cold_terminal');
    assert.equal(notices[0].failureDetail, failureDetail);
  }
});

test('runtime projections do not duplicate a terminal failure already present in the transcript', () => {
  const existing: ConversationMessage = {
    kind: 'system_notice',
    id: 'event_failure',
    variant: 'error',
    text: failureDetail.safeMessage,
    failureKind: failureDetail.failureKind,
    failureDetail,
    runtimeRunId: 'run_settlement',
  };

  const messages = [existing];
  assert.equal(appendRuntimeFailureNotices(messages, activeUnknownLive(), undefined), messages);
});

test('a current healthy active run does not resurface stale terminal or profile failures', () => {
  const live: SpaceSessionLiveProjectionT = {
    ...activeUnknownLive(),
    activeRun: {
      runId: 'run_current',
      sessionId: 'session_runtime_failure',
      phase: 'running',
    },
    lastTerminalRun: {
      runId: 'run_old_failure',
      sessionId: 'session_runtime_failure',
      phase: 'failed',
      failureKind: failureDetail.failureKind,
      failureDetail,
    },
  };
  const staleProfile: SpaceRuntimeProfileProjectionT['sessions'][number] = {
    sessionId: 'session_runtime_failure',
    surface: 'code',
    createdAt: 1,
    lastActivityAt: 2,
    queuedRuns: [],
    lastTerminalRun: live.lastTerminalRun,
  };
  const messages: readonly ConversationMessage[] = [];

  assert.equal(appendRuntimeFailureNotices(messages, live, staleProfile), messages);
});

test('a queued successor run does not resurface the previous terminal failure', () => {
  const live: SpaceSessionLiveProjectionT = {
    ...activeUnknownLive(),
    activeRun: undefined,
    queuedRuns: [
      {
        runId: 'run_queued_successor',
        sessionId: 'session_runtime_failure',
        phase: 'queued',
      },
    ],
    lastTerminalRun: {
      runId: 'run_old_failure',
      sessionId: 'session_runtime_failure',
      phase: 'failed',
      failureKind: failureDetail.failureKind,
      failureDetail,
    },
  };
  const messages: readonly ConversationMessage[] = [];

  assert.equal(appendRuntimeFailureNotices(messages, live, undefined), messages);
});

test('new profile activity outranks a stale live terminal failure', () => {
  const live: SpaceSessionLiveProjectionT = {
    ...activeUnknownLive(),
    activeRun: undefined,
    lastTerminalRun: {
      runId: 'run_old_failure',
      sessionId: 'session_runtime_failure',
      phase: 'failed',
      failureKind: failureDetail.failureKind,
      failureDetail,
    },
  };
  const queuedProfile: SpaceRuntimeProfileProjectionT['sessions'][number] = {
    sessionId: 'session_runtime_failure',
    surface: 'code',
    createdAt: 1,
    lastActivityAt: 3,
    queuedRuns: [
      {
        runId: 'run_queued_successor',
        sessionId: 'session_runtime_failure',
        phase: 'queued',
      },
    ],
  };
  const activeProfile: SpaceRuntimeProfileProjectionT['sessions'][number] = {
    ...queuedProfile,
    activeRun: {
      runId: 'run_active_successor',
      sessionId: 'session_runtime_failure',
      phase: 'running',
    },
    queuedRuns: [],
  };
  const staleActiveWithQueuedSuccessor: SpaceRuntimeProfileProjectionT['sessions'][number] = {
    ...queuedProfile,
    activeRun: live.lastTerminalRun,
  };
  const messages: readonly ConversationMessage[] = [];

  assert.equal(appendRuntimeFailureNotices(messages, live, queuedProfile), messages);
  assert.equal(appendRuntimeFailureNotices(messages, live, activeProfile), messages);
  assert.equal(
    appendRuntimeFailureNotices(messages, live, staleActiveWithQueuedSuccessor),
    messages,
  );
});

test('structured projection details enrich a generic notice for the same run', () => {
  const generic: ConversationMessage = {
    kind: 'system_notice',
    id: 'generic_runtime_error',
    variant: 'error',
    text: 'Runtime run failed',
    runtimeRunId: 'run_settlement',
    action: 'retry',
    retriable: true,
    retryAvailableAt: 123,
  };

  const notices = appendRuntimeFailureNotices([generic], activeUnknownLive(), undefined);

  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.kind, 'system_notice');
  if (notices[0]?.kind === 'system_notice') {
    assert.equal(notices[0].id, generic.id);
    assert.equal(notices[0].text, failureDetail.safeMessage);
    assert.equal(notices[0].failureDetail, failureDetail);
    assert.equal(notices[0].action, undefined);
    assert.equal(notices[0].retriable, false);
    assert.equal(notices[0].retryAvailableAt, undefined);
  }
});

test('cold-start rate-limit diagnostics preserve the projected delayed retry action', () => {
  const delayedRetryDetail = {
    failureKind: 'rate_limit',
    stage: 'transport',
    providerErrorCode: 'rate_limited',
    safeMessage: 'The provider rate limit was reached.',
    retryAfterMs: 2_500,
  } as const;
  const profileSession: SpaceRuntimeProfileProjectionT['sessions'][number] = {
    sessionId: 'session_runtime_failure',
    surface: 'code',
    createdAt: 1,
    lastActivityAt: 2_002_500,
    queuedRuns: [],
    lastTerminalRun: {
      runId: 'run_rate_limit',
      sessionId: 'session_runtime_failure',
      phase: 'failed',
      completedAt: 2_000_000,
      failureKind: delayedRetryDetail.failureKind,
      failureDetail: delayedRetryDetail,
      retriable: true,
      action: 'retry',
      retryAvailableAt: 2_002_500,
    },
  };

  const notices = appendRuntimeFailureNotices([], undefined, profileSession);

  assert.equal(notices[0]?.kind, 'system_notice');
  if (notices[0]?.kind === 'system_notice') {
    assert.equal(notices[0].retriable, true);
    assert.equal(notices[0].action, 'retry');
    assert.equal(notices[0].retryAvailableAt, 2_002_500);
  }
});

test('profile failure fallback requires fresh authority from the same Runtime lineage', () => {
  const ready: SpaceCoderConnectionProjectionT = {
    state: 'ready',
    changedAt: 1,
    stale: false,
    runtimeId: 'runtime_current',
    capabilities: [],
  };
  const cursor = { runtimeId: 'runtime_current', seq: 1 } as const;

  assert.equal(runtimeFailureProfileHasCurrentAuthority(ready, cursor), true);
  assert.equal(
    runtimeFailureProfileHasCurrentAuthority(
      { ...ready, state: 'reconnecting', stale: true },
      cursor,
    ),
    false,
  );
  assert.equal(
    runtimeFailureProfileHasCurrentAuthority(ready, { runtimeId: 'runtime_old', seq: 9 }),
    false,
  );
});
