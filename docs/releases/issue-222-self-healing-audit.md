# Issue 222 — adjacent availability and recovery audit

Date: 2026-10-16. Follow-up to the shared Host recovery fix.

The recovery boundary is SDK startup/attachment. Space never removes a writer
lock, kills an unknown owner, repairs private conversation files or resubmits an
admitted input to make recovery appear successful.

## Findings fixed in candidate 4

- After a working Host exited, passive reconnect could keep waiting for its
  missing endpoint. Missing/refused/reset/timed-out connections now permit the
  SDK's guarded `ensureKodaXRuntime` path on the next bounded-backoff attempt.
- The old unhealthy-daemon check matched only the bare message, while the SDK's
  real message contains a state diagnostic suffix. Legacy diagnostics are
  accepted; current SDK startup failures carry `daemon_startup_failed`, a reason
  and `retryable`. Readiness timeout and unreachable live owner are retryable;
  cancellation, child bootstrap failure and identity mismatch are not.
- SDK socket connection timeout lacked a machine-readable code. It now reports
  `ETIMEDOUT` and closes its pending socket, so a temporary connection stall does
  not become permanent incompatibility.
- A permanent incompatibility during reconnection could keep an ineffective
  retry chain alive and replace its useful diagnostic with `disconnected`.
  Permanent failures now end the chain and settle pending Run-recovery waiters.
- A pending reconnect rejecting after application close could republish
  `reconnecting` over the closed projection. Closed/owner-transition fences now
  retire that late result before it can change the projection or schedule work.

Each new failure shape was reproduced by a failing regression before its fix.
The existing adapter suite exercises exact-run recovery, lifecycle settlement,
host-tool/credential restoration and selected SDK views alongside these cases.

## Recovery matrix

| Condition                                                                        | Automatic behavior                                                                                             | Guard / evidence                                                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Another profile owns shared storage                                              | Discover and authenticate the actual owner; reuse compatible Host                                              | SDK state/upgrade regressions; real bundled shared-Host test                                     |
| Verified idle older Host or same-build orphan policy mismatch                    | Managed replacement and exact old-process exit verification                                                    | Idle packaged recovery scenario                                                                  |
| Active Run or connected client blocks replacement                                | Wait and retry with backoff; preserve the owner and work                                                       | Packaged real Run held beyond the first SDK deadline                                             |
| Writer acquired before descriptor publication, or competing startup wins         | Await publication/recheck ownership within the SDK deadline, then continue retryable recovery in Space         | SDK startup-fence and ownership-race regressions                                                 |
| Host exits after Space is ready                                                  | First attempt passive reconnection; if endpoint is gone, use SDK guarded startup and restore the selected view | Missing-endpoint regression; packaged recovery scenario also restarts the isolated Host          |
| Temporary connect/readiness timeout or unhealthy probe                           | Keep an explicit recovery state, retry with capped backoff; SDK verifies authority before starting anything    | Real socket-timeout shape; SDK unhealthy-owner lock remains unchanged; adapter retry regressions |
| A read fails during an admitted Run's recovery                                   | Query/await the original `runId`; never replay start/input                                                     | Existing adapter Run-recovery regressions                                                        |
| Space closes or changes owner mode during retry                                  | Fence late results and stop retry admission                                                                    | Pending-reconnect close regression; packaged complete-exit suite                                 |
| Newer incompatible build, unknown/reused owner identity, unauthorized connection | Preserve diagnostics; refuse destructive recovery                                                              | Existing SDK upgrade/owner-identity regressions; permanent-error adapter regression              |
| Unreadable ownership, missing credentials, access denied, storage full           | Surface the actionable failure; require the underlying condition to be corrected                               | Deliberate fail-closed boundary; no lock/credential deletion fallback                            |

Backoff is capped at 30 seconds. Retrying a healthy attachment does not restart
its Host. A responsive Host with active work cannot be replaced, and an
unresponsive live process is not proof that its work is idle. Recovery can wait
for such a process to respond or exit; it cannot safely guarantee recovery from
every hung process, filesystem failure or incompatible installation.

## Verification references

- [Regression guide](../test-guides/ISSUE_222_v0.1.47_REGRESSION_GUIDE.md)
- [Candidate verification](issue-222-recovery-verification.md)
- [Exact source commits and artifact hashes](issue-222-recovery-evidence.json)

This audit covers the shared Coder startup, attachment, history and exit paths.
It is not a claim that every renderer, provider or operating-system failure can
be repaired automatically.
