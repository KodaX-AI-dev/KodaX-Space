# Issue 218: queue/history recovery

## Scope and acceptance

- A queued input submitted once appears once after Ctrl+R, including snapshots
  with entry/turn IDs but no user ordinal; history-first and snapshot-first both work.
- An answer shared by live and canonical history appears once. Parallel tool
  ordering and durable-only todo tools must not create another answer. Preserve
  canonical tool cards and any new live answer suffix.
- Cold recovery of an active turn includes completed tool calls between output
  segments, with event times instead of the Run start time. Reapplying the same
  snapshot is idempotent; other turns/runs and post-cursor events are excluded.
- Equal text submitted as distinct user entries remains distinct.
- Only Space changes; use the existing public SDK replay API. Do not modify SDK
  persistence or user session records.
- Intermittent disappearance after switching away while queued is deferred unless
  a reproducible cause is found. It is not an acceptance claim for this patch.

## Automated checks

Run `node --import tsx --test` on the adjacent
`runtimeHistoryRecovery.test.ts` and `runtime-tool-history.test.ts` tests.
Run the existing session-history-live-replace, session-history-paging,
app-store-runtime-projection, runtime-projection-state, coder-daemon-projection
and runtime-host-adapter test suites. Run TypeScript checks and renderer/main builds.

Source validation on 2026-09-28: 562 focused history/runtime/transcript tests pass,
including all `transcript*.test.ts` cases. TypeScript, whole-repository lint and
`build:smoke` pass. Both reported session journals were replayed read-only.
The initial full `npm test` run had one failure among 4,281 cases (20 skipped):
the existing lineage L/variantB case. It exposed unsafe partial-turn ownership;
the final patch only resolves an ordinal through the exact canonical entry.
That failure and the complete transcript regression group pass in the 562-case
rerun; the entire full suite was not rerun after this correction.
Six isolated Electron E2E cases also pass: receipt expansion and scroll stability
for completed/active output, renderer boot, send/reply, and user-query collapse.
These validate a source build, not the user's existing unpacked executable.

## Standards review

Independent review: no remaining findings. The initial missing user-manual and
in-app help updates were added. No new abstraction or configuration was required.

## Spec review

Independent review: no remaining findings. Two discovered gaps were reproduced
with failing tests and fixed: a bounded tail followed by new text or another
snapshot, and a new tool invocation after that recovered tail. Both preserve one
input and retain the new output. Conflicting content remains visible.

## Packaged regression

Use a rebuilt package containing this commit. The previously running
`out/win-unpacked` executable is not updated by a source commit.

1. Start a task with several tool calls and queue a follow-up once while running.
2. After delivery, reload. Verify one follow-up and one answer with tool cards.
3. Reload during a later active turn before it has checkpointed its answer.
   Verify completed tool cards remain between output segments and times remain plausible.
4. Let the task finish, switch sessions and return, then reload again. Verify
   canonical history converges without adding a second answer or losing tools.
5. Submit the same text twice intentionally; verify both input entries remain.
6. Separately observe the deferred switching symptom. If it occurs, record the
   session/run/input IDs and whether history or snapshot loaded first; do not
   rewrite the persisted conversation to hide the problem.
