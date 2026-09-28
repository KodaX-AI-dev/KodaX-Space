# Interrupted history recovery regression guide

## Required behavior

- Integrate `ea3c64f0` into Space main without removing the cleanup/queue/iteration fixes.
- Runtime-owned SDK managed runs persist each generated message before tools or another generation execute. Preserve compaction and queued-turn identities; do not repeatedly persist old input messages.
- After cancellation, failure or owner death, Space restores missing assistant text, thinking and tool receipts through the SDK public journal replay API, even without an active run.
- Recovery is a display projection. Never rewrite canonical lineage, promote partial thoughts into answers, inject recovered logs into model context, cross branches or fabricate absent output.
- Match a single logical canonical user turn (identical timestamp/content/attachment duplicates are one identity) before restoring. Subtract only an exact canonical prefix; repeated reads must not duplicate output. Keep completed/active runs unchanged.
- Tool receipts retain identity and uncompleted calls must not be labelled successful. Recovery errors preserve canonical history and sending remains usable.
- Keep paging, payload size and recovery time bounded. Verify two reported sessions read-only or from isolated copies.
- Verify source integration and actual packaged code. Clean only merged, unused temporary worktrees/branches; preserve other-thread edits.

## Tests

Space: `node --import tsx --test apps/desktop/electron/kodax/runtime/interrupted-history.test.ts`

SDK: `npx vitest run packages/coding/src/task-engine/runner-driven.test.ts packages/coding/src/task-engine/runner-driven.compaction-context.test.ts packages/agent/src/primitives/runner`

The first regressions failed before implementation: canonical history remained query-only at the next provider call; Space returned no recovered assistant output from an interrupted run's journal.

## Manual / packaged checks

Open the video session after restart: show its interrupted progress, including venv readiness and narration preparation, without changing the conversation JSONL. Reopen twice; no duplicated text or tools. Confirm sending is available. A thinking-only interrupted turn remains thinking; a run with no output adds no answer. Preserve and report compaction ambiguity rather than rewriting the active branch.

## Validation results

- SDK regressions: 244 passed, 2 todo across managed Runner, compaction and primitive Runner suites; package build passed.
- Space desktop baseline with recovery: 3,834 passed, 13 skipped before review refinements. Final rerun and packaged lifecycle result recorded below when complete.
- Real session copies: video restored 13 current text segments / 2,040 characters and 34 tools. The raw journal's 14th segment (47 characters) was explicitly replaced by a provider retry and is not shown as another answer.
- Cat: restored 119 prior thinking deltas / 12,703 characters, explicitly identified as unfinished thinking before an empty retry. Its duplicate persisted prompts have identical turn, timestamp and content. The later empty run yields no answer. Existing cat-edit text remains.
- Real canonical file SHA-256 hashes unchanged. Cat SDK diagnostics `lineage_path_incomplete` and `compaction_predecessor_missing` remain visible; this fix does not rewrite that lineage.
- Local projection timings using copied canonical history and captured journal replay: video 255 ms including lazy SDK import, cat 3 ms. This is not a remote daemon latency benchmark.
- Shared-deadline, incomplete-prefix notice, oversize receipts, exact duplicate prompt and interrupted-tool renderer regressions pass.
