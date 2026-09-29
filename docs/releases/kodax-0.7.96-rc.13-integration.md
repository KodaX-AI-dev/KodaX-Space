# KodaX 0.7.96-rc.13 integration

Date: 2026-09-29. Space remains `0.1.46-rc.6`, on `main`.

## Scope and acceptance

Install the published rc.13 package, audit every rc.12-to-rc.13 change, and adapt
Space where required. Preserve Stop/queue recovery, bounded interrupted-history
projection, host-owned persistence, and normal subsequent use. Verify the actual
`out/win-unpacked` package as well as source; preserve unrelated concurrent edits.
Do not rewrite production Session data or add another persistence owner.

## Complete delta audit

SDK source range: `61e54a30..45771ec4`, including persistence fix `7c0bfd79`.
All 24 changed files fall into the following groups:

| SDK change                                                                                                                                | Space adoption                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Runner commit callback receives the authoritative current transcript at all commit sites                                            | No Space caller implements this callback. Keep the SDK as owner; no adapter signature to change.                                                                                                   |
| Managed Runner persists completed assistant and tool-result messages when `persistedByHost === false`, skipping initial replay identities | Adopt through the published dependency. Verify assistant persistence before actual tool execution and tool-result persistence before the next provider request, including failure of that request. |
| Host-owned persistence callback timing remains unchanged                                                                                  | Verify the same early boundaries do not write assistant output when `persistedByHost === true`. No duplicate Space writer.                                                                         |
| SDK durability and queued-input failure regressions                                                                                       | Retain Space queue delivery, interrupted-history and lifecycle regressions. No change to queue admission or cancellation semantics.                                                                |
| Self-knowledge registry and release/architecture/embedder documentation                                                                   | Update current baselines and the built-in Space manual. Preserve historical validation records.                                                                                                    |
| Root/workspace manifests and lockfile version bump                                                                                        | Pin root and Desktop to exact rc.13 and refresh npm lock integrity; no unrelated dependency upgrade.                                                                                               |

Runtime capabilities, DTOs, exports, engine requirements and dependency ranges
are unchanged. No new SemVer gate or Runtime capability is warranted. Space continues to call
the SDK connector, whose existing upgrade path replaces idle older daemons even
when their capabilities still satisfy the contract; active-owner safety remains
SDK-owned. Completed
message durability does not cover an unfinished provider stream, so Space must
retain journal recovery with its existing size/deadline limits, retry replacement
semantics and interrupted-tool status. Old missing canonical history is projected
from matching Run evidence; this upgrade does not repair ambiguous compaction
lineage or rewrite old canonical files.

## Published dependency

- Registry package: `@kodax-ai/kodax@0.7.96-rc.13`.
- SRI: `sha512-YKHzv9NayMyQE8m9O7S5yUTU4ujKKXU/2EzDO/pwGMLNezW4zpgWSwYvig+8Z+d8kLKqtaPNilmho7DehP2Yrw==`.
- Root and Desktop resolve one deduplicated package. Installed SDK bytes are not patched.

## Validation

- New offline public-package durability regression: rc.12 fails at the assistant-before-tool boundary; rc.13 passes both Runtime-owned and host-owned cases. The old package was extracted into an isolated scratch directory without replacing the installed SDK.
- `npm test`: 4,306 passed, 20 skipped, 0 failures (release 90/7, Desktop 3,854/13, IPC 362/0). This includes existing Stop/queue, cleanup recovery, canonical-prefix reconciliation and interrupted-history bounds.
- `npm run typecheck`, `npm run lint`, and `npm run build:smoke`: passed. Vite retains its existing chunk-size warning.
- Windows unpacked, NSIS setup and portable artifacts rebuilt. Registry/native dependency smoke and packaged Runtime/Worker execution passed.
- Packaged boot passed: renderer 6,738 ms, Runtime 30,171 ms including the deliberate 20-second daemon hold; 122 historical child records preserved.
- The first composite packaging command failed its final lifecycle smoke: the third launch read history after daemon readiness but before Space connection initialization. The existing test waited only for the daemon state file. The test now waits for the public connection projection to be ready, non-stale, and attached to that exact Runtime, with a 30-second bound and immediate IPC/incompatible failure. No product wait, retry, history assertion or recovery behavior changed.
- Lifecycle rerun passed against the same artifact: three clean product exits, two restarts, interrupted text/thinking/tools restored without duplicates, and subsequent tool tasks completed. The public connection was observed transitioning from connecting to ready on two launches, confirming the missing test precondition. Targeted ESLint passed after this test-only correction.
- Packaged SDK version is rc.13; main bundle and all 555 renderer files match the build byte-for-byte. ASAR SHA-256: `48c1028008ef668f923c05795663bea4bbf761f6e8e6943a70b3f977fd079a48`.
- The complete packaging command's initial nonzero exit is retained as evidence above; its failed lifecycle stage was corrected and independently rerun successfully without rebuilding identical product bytes.

## Standards

Independent Standards review: the dated feature record initially mixed the
09-29 upgrade into 09-28 history. Fixed by preserving the earlier entry and adding
a dated upgrade entry. Re-review: 0 remaining findings.

## Spec

Independent Spec review confirmed the 24-file SDK delta and existing history
compatibility. The same historical-record issue was corrected and re-reviewed.
Remaining findings: 0. The subsequent lifecycle readiness hunk also passed both independent reviews; unchanged history assertions still reject missing, duplicate or wrongly running output.

Standards: 0 remaining findings. Spec: 0 remaining findings.

## Cleanup

Automatic approval review rejected deletion of the isolated
`scratch/rc13-baseline-check` old-package fixture (`blocked by policy`). It remains
outside release inputs and tracked source. No production Session data was edited.
No temporary branch was created; unrelated pre-existing document edits remain
unstaged.
