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
- Space desktop rerun: 3,843 passed, 13 skipped. Final recovery/renderer/receipt subset: 34 passed after real-fixture refinements. Integrated main plus the preserved sidebar-activity changes: typecheck and 110 related tests passed.
- Real session copies: video restored 13 current text segments / 2,040 characters and 34 tools. The raw journal's 14th segment (47 characters) was explicitly replaced by a provider retry and is not shown as another answer.
- Cat: restored 119 prior thinking deltas / 12,703 characters, explicitly identified as unfinished thinking before an empty retry. Its duplicate persisted prompts have identical turn, timestamp and content. The later empty run yields no answer. Existing cat-edit text remains.
- Real canonical file SHA-256 hashes unchanged. Cat SDK diagnostics `lineage_path_incomplete` and `compaction_predecessor_missing` remain visible; this fix does not rewrite that lineage.
- Local projection timings using copied canonical history and captured journal replay: video 255 ms including lazy SDK import, cat 3 ms. This is not a remote daemon latency benchmark.
- Shared-deadline, incomplete-prefix notice, oversize receipts, exact duplicate prompt and interrupted-tool renderer regressions pass.

## Packaged validation (2026-09-29)

- Space `main` contains merge `3a9b04fe` (including `ea3c64f0`) and recovery `6cd2dad5`.
- Rebuilt `out/win-unpacked`, NSIS setup and portable artifacts against the registry-verified SDK `0.7.96-rc.12`.
- Native/dependency smoke checks passed. Boot smoke passed (renderer 6,022 ms; Runtime 28,966 ms including its deterministic test hold).
- Lifecycle smoke passed after correcting the isolated fixture to append to the active canonical branch and the Run journal with a matching sequence: three clean product exits, recovery across two restarts, repeated history reads without duplicate assistant/thinking/tool rows, interrupted unfinished tool, and subsequent tool tasks completed.
- Packaged `dist-electron/main.js` matches the built file byte-for-byte. `app.asar` SHA-256: `5e76e14f7a56a87aa84b52ffa0cb38f2111614b9ebe036c13b25b50f735f0706`.
- The packaged build also preserves the other thread's uncommitted sidebar activity fix. Those edits remain uncommitted; the colliding sidebar issue number was moved to 219 while queue recovery remains 218.
- SDK source persistence fix is committed on its primary `KodaX` branch as `7c0bfd79`. It is not in published rc.12; releasing a new SDK and updating the dependency remains pending user authorization.

## Standards

Final review: no remaining blocking findings. Projection rows pass through existing IPC pagination; all recovered receipts respect payload limits. SDK writes skip the old input replay. Whole-request recovery uses one deadline.

## Spec

Final review: no remaining blocking findings. Real duplicate-prompt compatibility excludes independent delivered inputs. Empty retries retain only explicitly labelled unfinished thinking; a nonempty replacement supersedes it. Existing stop/queue admission remains separate from read-only history recovery.

Standards: 0 remaining blocking findings. Spec: 0 remaining blocking findings.

## Cleanup

The integrated `codex/interrupted-history` worktree was archived and its branch deleted. The other chat's `codex/queue-history-recovery` worktree remains attached to that chat and was not removed. Six failed-verification temporary copies remain under the Windows temp directory because automatic approval review rejected their batch deletion (`blocked by policy`). Production session files were never rewritten by these checks.

## Published SDK rc.13 follow-up

The pending SDK publication above is now resolved: `0.7.96-rc.13` includes `7c0bfd79` and is pinned by Space. See the [full delta audit and current validation](../releases/kodax-0.7.96-rc.13-integration.md). The rc.12 package/hash above remains a historical result.
