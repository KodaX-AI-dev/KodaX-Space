# Known Issues

Last Updated: 2026-11-14

> 2026-11-14：当前工作树依赖已发布的 Registry SDK `0.7.97-beta.9`（含 beta.8 的 Issues 245–247 原生 Job 启动修复与 Issue 250 的 SDK 侧修复），见 [beta.9 适配](releases/kodax-beta9-space-adaptation.md)、[beta.8 适配](releases/kodax-beta8-space-adaptation.md) 与 [beta.7 适配](releases/kodax-beta7-space-adaptation.md)；下方 alpha.5 发布准备记录保留原语境。

> 2026-11-08：工作树已安装 Registry SDK `0.7.97-beta.4`，见 [beta.4 接入记录](releases/kodax-beta4-space-adaptation.md)；beta.3 实测见 [适配与实测记录](releases/kodax-beta3-space-adaptation.md)。已发布 alpha.4 的 beta.1 构建记录用于追溯当次发布。SDK Issue 371 历史首读性能与客户环境验收继续单独记录。

> Historical issue details retain their dated evidence. Current source baseline is Space 0.1.47-alpha.5 / SDK 0.7.97-beta.9 from the Registry ([beta.9 adaptation](releases/kodax-beta9-space-adaptation.md), [beta.8 adaptation](releases/kodax-beta8-space-adaptation.md), [beta.7 adaptation](releases/kodax-beta7-space-adaptation.md)); the alpha.5 release used SDK 0.7.97-beta.4; stable remains v0.1.46. See [alpha.5 release status](releases/v0.1.47-alpha.5-release-readiness.md); the published alpha.4 beta.1 record stays for that release. Older publication-pending statements describe their original verification date; SDK/customer-only investigations are not closed by this release.

## Issue Index

| ID  | Priority | Status                                                                                                       | Title                                                                                                                                                                                                      | Introduced                                                                            | Created    |
| --- | -------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- |
| 022 | Medium   | In Progress                                                                                                  | KodaX Runtime lacks a general per-invocation execution service for Partner helper migration                                                                                                                | KodaX 0.7.66 adoption                                                                 | 2026-07-10 |
| 043 | High     | In Progress                                                                                                  | Unsigned macOS releases repeatedly request the login password for Provider Keychain access                                                                                                                 | v0.1.4                                                                                | 2026-07-14 |
| 083 | High     | In Progress                                                                                                  | Late accepted daemon interrupt can be terminalized without delivery when its Run finishes during finalization                                                                                              | v0.1.32 development                                                                   | 2026-07-22 |
| 118 | Medium   | In Progress                                                                                                  | Space rejects large source images before KodaX can normalize them                                                                                                                                          | v0.1.9                                                                                | 2026-07-27 |
| 133 | High     | In Progress                                                                                                  | macOS/Linux quit and failed Windows complete-exit could leave an invisible Coder daemon without a control surface                                                                                          | v0.1.32 daemon adoption                                                               | 2026-07-28 |
| 136 | High     | In Progress                                                                                                  | Restored transcript merging and legacy compaction reconciliation can relocate or physically duplicate conversation history                                                                                 | KodaX 0.7.50 / Space v0.1.27; exposed more broadly by 0.7.74                          | 2026-07-30 |
| 142 | Medium   | In Progress                                                                                                  | Full-effects history restoration mounts and animates an entire long transcript beneath a live backdrop surface                                                                                             | current ConversationStreamV2 / full-effects renderer                                  | 2026-07-30 |
| 143 | High     | In Progress                                                                                                  | Per-fragment Runtime stream events saturate persistence, IPC, and long-Session renderer updates                                                                                                            | KodaX typed Runtime streaming + current Space event bridge                            | 2026-07-30 |
| 146 | High     | In Progress                                                                                                  | Stop can cross a history writer boundary and Runtime cancellation can end as a credential failure                                                                                                          | v0.1.34 development / KodaX 0.7.79 integration                                        | 2026-08-01 |
| 165 | High     | Open                                                                                                         | Stop on a managed daemon Run left it stuck as stop_outcome_unconfirmed; spinner never cleared and sends failed with stale_run                                                                              | KodaX 0.7.79 managed-task Stop / Space run-phase projection                           | 2026-08-04 |
| 184 | High     | In Progress                                                                                                  | A continued Run could attach cumulative prior-turn output to the latest query while ambiguous compaction survived reload                                                                                   | v0.1.38 daemon live projection / KodaX 0.7.87 compaction                              | 2026-08-15 |
| 208 | High     | In Progress                                                                                                  | Assistant-side transcript disorder survived the Issue 207 hotfix: answer content painted above its own/previous query, whole turns swallowed, tool chips lost — cured only by manual reload                | <= v0.1.46-alpha.6 live/canonical dual-plane reconciliation                           | 2026-09-07 |
| 213 | Medium   | ready                                                                                                        | SDK Full RepoIntel routing can rebuild for 9–16 seconds before model work begins                                                                                                                           | Observed SDK 0.7.96-rc.3 / Space v0.1.46-beta.1                                       | 2026-09-13 |
| 216 | High     | Original fix released in rc.2; compaction telemetry follow-up fixed in source; customer verification pending | Windows credential restoration, Shell usability and packaged diagnostics                                                                                                                                   | Observed v0.1.46-beta.4-fix.1 / rc.1                                                  | 2026-09-21 |
| 217 | Medium   | Resolved in source; native macOS verification pending                                                        | Background Git queries repeatedly trigger the macOS developer-tools installer                                                                                                                              | Observed v0.1.46-rc.3 / SDK v0.7.96-rc.10; first affected version unknown             | 2026-09-23 |
| 218 | High     | Legacy fix superseded; intermittent switch case under investigation                                          | Queued inputs and whole answers duplicate after reload; recovered live history omits completed tools                                                                                                       | Observed v0.1.46-rc.5                                                                 | 2026-09-28 |
| 225 | Medium   | ready                                                                                                        | Intermittent packaged Runtime cold startup exceeds its readiness deadline                                                                                                                                  | Observed v0.1.47-alpha.3 / SDK 0.7.97-alpha.9                                         | 2026-10-25 |
| 230 | High     | Resolved in source                                                                                           | Linux hidden titlebar omits minimize/maximize/close controls                                                                                                                                               | Reported v0.1.46                                                                      | 2026-10-28 |
| 231 | Medium   | ready                                                                                                        | Linux CLI sandbox guidance omits the missing Node interpreter                                                                                                                                              | Reported 2026-10-23; CLI version unknown                                              | 2026-10-28 |
| 232 | High     | Resolved in source                                                                                           | Startup updater downloads automatically and lacks a stable-channel guard                                                                                                                                   | Existing F022 behavior                                                                | 2026-10-28 |
| 244 | Low      | ready                                                                                                        | Cold-open newest history read grows with Session file size                                                                                                                                                 | Observed Space 0.1.47-alpha.5 / SDK 0.7.97-beta.4                                     | 2026-11-10 |
| 245 | Medium   | Resolved (source; not released)                                                                              | Settings diagnostic export omits daemon startup evidence when Runtime cannot initialize                                                                                                                    | Observed Space 0.1.47-alpha.5 / SDK 0.7.97-beta.4; first affected version unknown     | 2026-11-12 |
| 246 | High     | Resolved (source; not released)                                                                              | Windows Job verification failure leaves Coder unavailable without an actionable recovery flow                                                                                                              | Observed Space 0.1.47-alpha.5 / SDK 0.7.97-beta.4; first affected version unknown     | 2026-11-12 |
| 247 | Medium   | Resolved (source; not released)                                                                              | New-conversation task summary says Ready while the Coder backend has failed to start                                                                                                                       | Observed Space 0.1.47-alpha.5; first affected version unknown                         | 2026-11-12 |
| 248 | High     | Resolved (source; not released)                                                                              | Linux upgrade from 0.1.46 blocks startup forever when the locked OS keyring cannot return the legacy Runtime client secret                                                                                 | Space 0.1.47-alpha.5 (secret moved from keychain to auth.json); reported on Kylin V10 | 2026-11-13 |
| 249 | Medium   | Resolved (source; not released)                                                                              | Sent prompt stays (fully or partly) in the composer when a line ends with a line break                                                                                                                     | Space 0.1.47-alpha.5 (Lexical composer, 2e8bbd7e); reported on Windows 11             | 2026-11-13 |
| 250 | Medium   | Resolved (source; not released)                                                                              | Quit with nothing running fails while a `kodax` CLI shares the Host                                                                                                                                        | Source after 0.1.47-alpha.5 (shared Host, 4a28edda); observed with SDK 0.7.97-beta.8  | 2026-11-13 |

## Issue 218 — Queue/history recovery (legacy fix superseded; intermittent switch case remains under investigation)

2026-10-15 current-candidate note: Space alpha.2 uses SDK current-view replacement and independent history instead of the journal/replay implementation below. New source/packaged queue and refresh regressions are recorded in the [alpha.2 readiness](releases/v0.1.47-alpha.2-release-readiness.md). The exact intermittent switch-away symptom remains unconfirmed; the following rc.5/rc.6 analysis and replay evidence are historical.

Reported against `out/win-unpacked` v0.1.46-rc.5 on 2026-09-28. Queued inputs
could appear twice after reload; an entire answer could also be duplicated, while
recovered live output omitted completed tool calls and used the Run start time.

The queued-input snapshot has entry/turn/run identity but need not carry a user
ordinal. Space did not resolve the missing ordinal from the matching canonical entry. Its live snapshot hydration also
restored text and active tools without completed tool receipts. Strict ordered
history matching then rejected the incomplete projection; parallel tool order and
durable-only todo tools made that rejection persist after terminal settlement.

Fix scope: resolve missing ordinals only from the exact canonical input entry; recover tool starts/results
and output-segment times using the public SDK journal replay API within the exact
snapshot cursor, and merge same-entry compatible content while preserving
canonical tools and a proven live suffix. Distinct user entries with identical
text must remain distinct. No SDK implementation/dependency changes or session
data rewrites are part of this fix.

Read-only replay of the reported sessions verified one answered turn with 14
tools for `s_11be2ee5-54f4-4740-84ce-b22f1577db73` and 29 recovered tools for
`20260928_163725_6b23af70b17b2`. Replay tests reconstruct selected journal/history
windows; they do not establish the exact historical disk-write timing.

Deferred with the user's agreement: the intermittent disappearance when switching
away while still queued and returning after delivery was not reproduced. Do not
claim this symptom resolved by the above fixes.

Regression guide: [Issue 218](test-guides/ISSUE_218_v0.1.46-rc.6_REGRESSION_GUIDE.md).

## Issue Details

## Issue 217: Background Git queries repeatedly trigger the macOS developer-tools installer

- Priority: Medium
- Status: Resolved in source; native macOS verification pending
- Introduced: Observed against Space v0.1.46-rc.3 / SDK v0.7.96-rc.10; first affected version unknown
- Fixed: SDK v0.7.96-rc.11 installed and pinned; Space application changes await release
- Created / Source Resolution Date: 2026-09-23

### Original Problem

On macOS without usable command-line developer tools, opening Space repeatedly
shows Apple's “The git command requires the command line developer tools” dialog.
Cancelling it does not stop later prompts. Reproduce by opening a workspace on such
a Mac, allowing background refreshes, and switching focus/projects. Expected:
background discovery does not request installation repeatedly, while an existing
usable Git installation continues working.

### Root Cause and Scope

The macOS system Git executable is a developer-tools launcher. Executing it can
show installation UI before ordinary failure handling runs. Space project queries,
workspace `git init`, and SDK-owned background Git calls can reach it. Windows and
Linux do not use this Apple installer mechanism; their original execution behavior
is preserved. Arbitrary user/model Bash or PTY commands are outside this repair.

### Source Resolution

- Space guards the existing project Git runner and settings workspace init before
  spawning Git, using the SDK's shared macOS check. The project runner keeps its
  existing 5-second timeout, 1 MB output cap and failed-result shape; settings keeps
  its nonfatal startup warning path. No shared Git runner migration is implemented.
- The SDK check applies only on Darwin when the selected executable resolves to
  `/usr/bin/git`. It runs `/usr/bin/xcode-select -p` with matching cwd/environment;
  only exit code 2 blocks execution. Uncertain probe failures preserve the original
  Git attempt. Independent Git, effective PATH ordering and DEVELOPER_DIR remain valid.
- Determinate checks use a 5-second cache and can recover on later refresh without
  restart. SDK repo-intelligence can recover from filesystem to Git-backed analysis,
  including unborn repositories; synchronous memory identity and worktree failure
  semantics remain unchanged.
- The adapter is lazy on macOS and does not load the SDK for Windows/Linux calls.
  It calls the new SDK API directly; the next Space release ships with the matching SDK.

### Delivery and Verification

- Space root/desktop manifests and lockfile now pin published SDK v0.7.96-rc.11.
  The local SDK link was replaced by a physical package installation. Space's
  application changes still need its own release; native macOS acceptance is pending.
- Space changes: `apps/desktop/electron/ipc/project.ts`,
  `apps/desktop/electron/settings/store.ts`, and
  `apps/desktop/electron/kodax/git-install-prompt.ts`.
- Validation on 2026-09-23: the final four-suite regression run passed 40 tests
  with one Windows symlink test skipped, including all five focused regressions.
  Full Space type checking, the main-process build and installed builtin-skill
  verification passed against the installed rc.11 package. The published
  SDK and Space adapter also passed a simulated-Darwin smoke check for blocked
  system Git and available independent/installed Git.
  The async/sync public exports and guards in runtime/semantic workers, CLI and
  bare resume are present. After Registry propagation completed, the unmodified
  release dependency gate downloaded the official tarball directly, verified its
  SHA-512 against the lockfile, and compared every installed package file and
  required native artifact successfully. No development link remains.
  The release test suite passed 86 tests with 7 platform/environment skips.
  Full renderer/main builds and release-mode Windows packaging passed at the
  current Space v0.1.46-rc.3 version. Packaged dependency/native/worker checks,
  Windows boot smoke, and two clean product exits with Session history recovery
  passed. No version bump, tag, or upload was performed. Native macOS acceptance
  remains separate and unexecuted on this Windows host.
  Standards and Spec reviews have no remaining findings.
- Tests: `git-install-prompt.test.ts` exercises actual project/settings entry points,
  blocked startup, recovery and non-macOS behavior. Native macOS
  zero-dialog testing remains pending; see the
  [Issue 217 regression guide](test-guides/ISSUE_217_v0.1.46-rc.3_REGRESSION_GUIDE.md).
- SDK tracking: Issue 339. Ordinary `runGit` / `runGitSync` consolidation is separately
  recorded as SDK FEATURE_300 / v0.7.99, **Planned**, with no implementation in this fix.

---

## Issue 216: Some Windows profiles cannot restore credentials or start their selected shell

- Priority: High
- Status: Original fix released in Space rc.2 with SDK rc.9; compaction telemetry follow-up fixed in source; customer verification pending
- Introduced: Observed in v0.1.46-beta.4-fix.1 and v0.1.46-rc.1
- Created: 2026-09-21

### Original Problem

Customer rc.1 logs show native keyring load failure followed by Runtime identity-open failure,
before any daemon connection. The earlier onsite build has an existing version-1 encrypted
credential vault and schema-3 Runtime identity, but also reports capability-upgrade failure.
PowerShell profile hydration fails, and packaged updater initialization fails independently.
The logs do not establish that all PowerShell execution is forbidden or identify the exact
Windows native loader failure. Existing credentials and authority must survive an upgrade.

Reproduction: make native keyring loading fail on Windows; start rc.1 with an existing vault
and Runtime identity. Separately make Auto-selected PowerShell fail a no-profile launch,
or inspect the rc.1 packaged app with its missing electron-updater production dependency.

### Approved Scope and Acceptance

1. Space uses Electron safeStorage/DPAPI and the existing v1 vault format on Windows. Restore
   onsite ciphertext on the original Windows user profile. Migrate known Provider accounts
   individually, including custom Providers and shared aliases; avoid global keyring enumeration.
2. Existing Runtime clientId, instanceId, account and secret stay stable. Persistent read/write
   errors must propagate. Never generate a replacement secret for an existing schema-3 identity.
   New/legacy identities publish only after persistent secret write/read succeeds. Preserve
   concurrent-first-start, file alias protections, macOS prompt behavior and Linux fallback.
3. The initially approved SDK additions are diagnostic only: classify the existing boot identity, Job containment,
   owner validation and missing-capability failures. Preserve all probes, timeouts, cache,
   return/throw behavior, authentication, lifecycle and compression implementations.
4. Windows Auto checks shell usability and may choose CMD. Agent shell contract, environment
   hydration and PTY agree on selection. Explicit choices and profile-only failure semantics
   remain intact. This does not remove PowerShell dependencies from SDK daemon lifecycle.
5. Include and correctly load electron-updater in packaged Space. Preserve structured,
   bounded, redacted error causes; do not log credentials, environments or command payloads.

The later SDK daemon-state repair was separately authorized after reproducing Windows
atomic-rename contention. Published rc.9 includes that repair alongside the diagnostic work;
the original diagnostic-only scope does not describe all changes in rc.9.

### Verification

Historical validation on 2026-09-21, before Space integrated rc.9: fault-injected public-boundary
regressions were observed failing before the fixes. The complete desktop suite passed: 3,772 passed, 0 failed, 13 platform/permission skips. Type checks,
full ESLint, renderer/main builds, real three-process Electron DPAPI verification, packaged
updater loading, packaged boot, two complete exits and Session restoration passed. Both review
axes have no remaining findings. SDK focused regressions and built-artifact credential and
manual/managed compaction tests passed in the sibling KodaX repository.

2026-09-22 rc.9 verification: exact Registry bytes and manifest/lock alignment passed. Release
checks passed (85 pass, 7 conditional skips), as did IPC schema (362 pass). The full desktop
run had 3,771 pass, 1 stale rc.8 manual assertion failure and 13 conditional skips; after updating
that assertion, all 7 manual tests passed. The entire desktop suite was not rerun after that
test-only correction. A static ESM import in the diagnostic test was also corrected before the
successful release-check run. Type checks, full ESLint, builds, real three-process Electron
DPAPI verification and both independent review axes passed. Standard Windows packaging passed
all dependency/native-hash/updater/Runtime/Worker smokes; renderer was ready in 7,436 ms and
Runtime in 30,768 ms (including the 20-second test hold), with 122 historical records intact.
Two complete product exits and Session restoration passed. These are new rc.9 results, not
reused rc.8 evidence. An additional observed complete-exit run confirmed real SDK events in
both Space (boot/process identity) and daemon (Job membership) logs. Healthy startup alone
need not emit the parent events; the initial observer's stronger assumption was corrected
without adding production probes. Space publication and customer-machine acceptance were still pending at that checkpoint.

Post-release follow-up on 2026-09-22: official Space rc.2 is now published; its release
verification reran the complete desktop suite successfully. Real-provider acceptance of that
official binary found a separate telemetry bug: legitimate fractional SDK compaction timings
failed Space's integer-only IPC schema, discarding `compact_stats` after successful compaction.
The source-only follow-up accepts finite, bounded, nonnegative durations; count/revision
constraints are unchanged. A rebuilt local package using the unmodified Registry SDK rc.9
passed real conversation, manual/automatic compaction with committed statistics, renderer
history reload, four overlapping sandbox Shell commands, and UI Stop/exact-child/successor
acceptance. It is not a new published binary. See the regression guide for RED/GREEN evidence.
Separate SDK maintenance ownership and MCP fixture fixes remain local to the sibling SDK;
independent memory-review shutdown ownership and customer-machine acceptance remain open.

### Resolution

- Fixed version: Original changes released in Space 0.1.46-rc.2; later compaction telemetry correction is unreleased source.
- Resolution Date: 2026-09-21; published SDK rc.9 integrated on 2026-09-22.
- Windows credentials now use the existing encrypted vault first, with per-account migration,
  durable Runtime reads/writes, stable identity preservation and deletion-race protection.
- Auto Shell resolution tests startup usability; updater packaging/import and structured error
  diagnostics are corrected. SDK probe diagnostics observe existing Windows probes; rc.9 also
  contains the separately authorized daemon-state atomic-rename contention repair.
- Files Changed: credential vault/keychain, Runtime identity, terminal shell/PTY/hydration,
  updater, diagnostics/main registration, production dependency manifests and package smoke.
- Tests Added: Windows migration/failure/restart/macOS cancellation, Runtime identity failure,
  shell fallback/contract, updater imports/package guard, structured causes and SDK bridge.

See the [regression guide](test-guides/ISSUE_216_0.1.46_REGRESSION_GUIDE.md) for exact boundaries
and customer checks. The original SDK changes are published in rc.9 and integrated into Space's exact
Registry dependency; the original Space changes shipped in rc.2. The new telemetry follow-up
and later SDK maintenance work are not released. The customer-specific
lifecycle failure remains unconfirmed; this fix does not remove the SDK's PowerShell dependency
or claim that failure is resolved.

## Issue 213: SDK Full RepoIntel routing can rebuild for 9–16 seconds before model work begins

- Priority: Medium
- Status: ready
- Introduced: Observed with SDK 0.7.96-rc.3 in Space v0.1.46-beta.1; regression introduction not established
- Fixed: Not fixed
- Created: 2026-09-13

### Original Problem

The user reported several seconds, sometimes about ten seconds, of first-query preparation in
each new Session. Independent SDK timing against this repository reproduced a long Full
RepoIntel routing computation before model output. Expected behavior is that repository context
preparation has a deliberate latency budget and does not obscure which phase is running.

Reproduce by measuring `getRepoRoutingSignals` with Full mode in a fresh Node process, then repeat
within the same process and compare Light mode against the same repository. Keep module import
and setup outside the operation timer.

### Context and Evidence

- Full routing in separate fresh processes took 15.837s and 9.143s. An immediate same-process
  repeated call took approximately 0ms; Light routing took 984ms and capability resolution 181ms.
- Full mode used a worker; measured parent event-loop delay peaked around 24ms. The measured
  routing operation therefore did not block its caller's JavaScript loop for the entire 9–16s.
- Forced worker rebuild samples took 9.721s / 9.675s, with CPU profiling identifying TypeScript
  program/type analysis as the main cost. After the persistent index stabilized, a fresh-process
  routing call took 1.252s. This does not establish that every new Session necessarily rebuilds.
- These measurements used local SDK calls, not a Provider response. They are distinct from the
  daemon strict-history read evidence in Issue 214; a common cause has not been established.

### Proposed Solution

SDK 0.7.96-rc.4 also fixes a confirmed cache omission: prewarming filled the Full bundle
cache but did not fill the routing cache. A later routing request could repeat the worker query
after the inner 1.5-second cache expired. Prewarming now fills both 60-second caches from the
same result. A test separated prewarm and routing by five seconds: the old code queried twice,
the fixed code once. This preserves the complete Full result and does not eliminate a genuinely
cold TypeScript rebuild.

The SDK already applies a two-second wait budget to preturn context enrichment, but the earlier
routing-signals read waits for the full build without that bound. Investigate applying a bounded
wait specifically to this optional routing enrichment while allowing its worker to finish and
populate the cache. Preserve explicit Full semantics for operations that require complete results,
and measure cold/rebuild behavior before choosing a budget. This is a candidate SDK change, not
an implemented Space fix or a guarantee that selecting Light fixes history reads.

### Verification

See [Issue 213 performance guide](test-guides/ISSUE_213_v0.1.46_REGRESSION_GUIDE.md).

## Issue 208: Assistant-side transcript disorder survived the Issue 207 hotfix — answer content above its own query, whole turns swallowed, tool chips lost

- Priority: High
- Status: In Progress
- Introduced: <= v0.1.46-alpha.6 live/canonical dual-plane reconciliation
- Created: 2026-09-07

### Problem

Two further customer disorder reports on v0.1.46-alpha.6 (Windows, session
`20260816_110200_432759c1554ee5`), each cured by Ctrl+R:

1. The tail question of turn N's answer appeared as a standalone assistant
   card above the PREVIOUS turn's query (carrying turn N's canonical
   timestamp), while turn N-1's entire answer (thinking + body) vanished —
   its query sat directly adjacent to the next query.
2. A multi-segment tool-use turn painted its whole answer as one continuous
   card above its own query, with every tool-run chip missing; the restored
   view shows five text segments interleaved with four chips.

The persistence plane was verified healthy entry-by-entry (lineage and
conversation cache clean, correct turnIds; the runtime journal stamps every
assistant delta with the correct turnId), so the corruption again exists only
in the live painted projection. The Issue 207 hotfix is scope-disjoint: it
gates user-bubble minting on replayed boundary events, and neither shape
mints a user row.

### Root Cause (pinned by code tracing + deterministic repro)

The renderer maintains one global invariant — user-slot sentAt order ==
events position-pairing order — and three paths break it:

- `reconcileRuntimeDeliveredInputs` (appStore.ts ~L5850): delivery boundaries
  are positioned by `deliverySeq`, but their owner rows are appended to the
  END of the users array with sentAt rewritten to the server clock.
- The canonical page install seam (appStore.ts ~L7334): canonical and live
  planes are each internally ordered, with no cross-seam global order across
  three mixed clocks (server restore sentAt / local Date.now / admission
  order).
- `stabilizeCanonicalPageHeadBeforeEarlierLiveTurns` (~L3598): its
  `turn.sentAt < canonical.sentAt` comparison mis-relocates live turns when
  the server clock runs ahead.

Once slots are misaligned, the certified canonical merge
(`mergeIdentityProvenTurnProjections`) zeroes live text/thinking suffixes and
drops live tool events in the misplaced slot — its only guard checks
"durable segment is EMPTY", not "non-empty but foreign". Separately, terminal
snapshot hydration deletes any delta carrying a providerRequestId without a
segment-start marker unconditionally, skips synthesis for pure
lastTerminalRun snapshots (`activeRun !== undefined` gate), and the fold
never reclaims orphaned closed-live segments — producing doubled tool chips,
lost bodies, and tail-fragment ghosts carrying canonical timestamps.
Ctrl+R rebuilds cold from canonical rows alone, which is why it always heals.

### Resolution (Space source fixed; confirmed SDK aliases integrated, broader guarantees pending)

FEATURE_275 now separates canonical page and live tail sources and renders explicit
input/output owners. L/M and the refresh-equivalence gates run without skips or an
allowlisted difference. The 2026-09-11 follow-up replaces Run-wide retirement with
covered-input retirement and guards replay, snapshot sidecars, paging, fork/rewind,
and delayed attachment updates. See the correction in `docs/features/v0.1.46.md`.

The new Session `20260911_100157_8gbfe22d504b2f` also had an SDK identity break:
delivery references `entry_fdb4f2769c49`, but the resolved canonical query is
`entry_c49fccdba757` without its delivery alias. SDK beta.8 now applies an explicit
confirmation record already registered by the SDK task for that Session; the
published package resolves the original delivery exactly once. Space consumes
these aliases and keeps invalid-repair diagnostics readable. A real SDK/storage
and Space projector/store/composer regression covers repaired reload and old
delivery replay. Unknown conflicting identities remain visible by design.
Keep the broader issue open: beta.8 does not automatically infer unconfirmed
legacy mappings, and bounded renderer receipts still cannot prove arbitrary
ancient replay coverage after their evidence expires.

### Files Changed

- `apps/desktop/electron/test/transcript-order-real-lineage-repro.test.ts` (cases L/M)
- `docs/features/v0.1.46.md` (FEATURE_275 mechanism baseline)

## 022: KodaX Runtime lacks a general per-invocation execution service for Partner helper migration

- Priority: Medium
- Status: In Progress
- Introduced: KodaX 0.7.66 adoption
- Fixed: N/A
- Created: 2026-07-10
- Resolution Date: N/A

### Original Problem

Current behavior:

- Space v0.1.30 resolves KodaX 0.7.67 and safely runs `run_partner_helper` in a Space-owned one-shot Worker, then applies the resulting bounded journal under Space path/policy controls. The relevant Runtime/constructed-handler isolation primitives were introduced in 0.7.66 and remain available in 0.7.67.
- KodaX 0.7.66 now provides a real `embedded + worker` Runtime with resource limits, hard close, and fail-closed `requirements.hardDispose`. Constructed handlers also run in dedicated Workers with reverse tool RPC and hard timeout termination. Space has compatibility coverage for the published Runtime Worker and packages all required sidecars.
- `KodaXRuntime` still has no general per-invocation `execution` service for arbitrary helper programs. Daemon/Worker run options are JSON-safe DTOs, so Space cannot send its process-local helper callback or VM bridge across that boundary. Moving the entire Runtime into a Worker is not equivalent to isolating and terminating one helper invocation inside a shared session owner.

Expected behavior:

- Embedded and daemon modes expose the same ID/DTO-based optional isolated-execution contract.
- Runtime/daemon host owns executor lifecycle, cancellation, hard termination, resource bounds, packaging, and run/session/tool-call attribution.
- Space continues to own Partner-specific workspace snapshots, path/credential policy, approvals, and final journal application.
- Worker isolation is described as fault/resource isolation; genuinely hostile third-party code uses a process/OS sandbox backend.

### Root Cause

The Runtime refactor now centralizes session/run orchestration and provides whole-Runtime Worker isolation. KodaX also has specialized Worker machinery for semantic processing and constructed handlers. What remains missing is a public, protocol-neutral, per-invocation execution plane that can host an arbitrary bounded helper by ID/DTO without moving the entire Runtime owner or serializing host callbacks.

### Proposed Solution

Add a runtime-owned `ExecutionManager` with serialized `create/start/await/abort/terminate` operations, executor/invocation IDs, `worker` and future `process` backends, capability RPC through runtime-scoped policy/permission brokers, hard deadlines, V8/resource/input/output limits, and awaited shutdown. The daemon protocol must advertise supported isolation modes and fail closed when a requested backend or sidecar is unavailable.

Migration order:

1. Keep the 0.7.67 Runtime/constructed-handler Worker capability and package-sidecar gates green in Space.
2. Publish a Runtime execution DTO/protocol with executor/invocation IDs, capability negotiation, and Worker/process backend semantics.
3. Prove invocation-local timeout, abort escalation, crash recovery, resource/output bounds, and daemon responsiveness without terminating unrelated sessions.
4. Migrate Space's helper onto that SDK service while retaining Space policy/journal application, then delete the duplicate Space Worker lifecycle.

### Acceptance Criteria

- A normal Partner helper behaves identically in embedded and daemon modes without serializing functions or host objects.
- Infinite CPU/microtask loops, worker crash, timeout, cancellation, heap/input/output limit, and daemon disconnect tests terminate only the invocation and leave Runtime/daemon responsive.
- Invocation abort escalates from cooperative abort to hard termination after a bounded grace period without requiring `runtime.close()` to kill the whole private Runtime.
- Runtime capabilities report isolation support and never silently downgrade `worker`/`process` requests to host execution.
- The Worker/process security boundary and remaining OS-level limitations are documented.

### Resolution

Partially addressed upstream in KodaX 0.7.66: whole-Runtime Worker isolation, hard-dispose negotiation, resource limits, constructed-handler Worker execution, reverse tool RPC, hard timeout termination, and sidecar packaging are implemented and verified. The general per-invocation execution service is not implemented yet. This does not reopen Issue 016 or weaken the current Space helper path; its concrete host escape and main-thread starvation paths are fixed. The remaining issue is an explicit migration and duplicate-lifecycle cleanup gate before Space adopts daemon-owned execution for Partner helpers.

## 043: Unsigned macOS releases repeatedly request the login password for Provider Keychain access

- Priority: High
- Status: In Progress
- Introduced: v0.1.4
- Created: 2026-07-14

### Original Problem

Customers using the current macOS release are repeatedly asked for their login Keychain password when KodaX Space needs a stored Provider API key. Choosing the system dialog's `Always Allow` action does not reliably stop later prompts, and a user with several stored Provider keys can be asked multiple times. Removing a stored key also asks for the login password.

Expected behavior:

- Normal Provider use is silent after the user has granted the installed app persistent Keychain access.
- `Always Allow` remains effective after a KodaX Space update from the same release channel.
- The number of configured Providers does not produce a burst of password dialogs during ordinary startup or settings refresh.
- Removing a Provider key completes without first asking to reveal that secret when the installed app is already trusted.

Reproduction steps:

1. Install an unsigned KodaX Space macOS DMG and save API keys for one or more Providers.
2. Restart or update KodaX Space, then use a Provider whose key must be loaded from Keychain.
3. Enter the macOS login Keychain password and choose `Always Allow`.
4. Repeat with another configured Provider or a later app build and observe additional password prompts.
5. Open Provider settings and remove a stored key; observe another Keychain authorization prompt.

### Context

Affected components:

- `electron-builder.yml`
- `.github/workflows/release.yml`
- `apps/desktop/electron/providers/keychain.ts`
- `apps/desktop/electron/ipc/provider.ts`
- `apps/desktop/electron/test/provider-keychain.test.ts`

Existing mitigation:

- The main process caches successfully read secrets and coalesces concurrent reads.
- macOS startup loads only the default Provider key instead of enumerating and revealing every stored credential.
- Provider-list status checks use non-secret existence probes for known accounts.

Those measures reduce redundant reads within one process but cannot create a stable Keychain trust identity for an unsigned release.

### Root Cause

There are three interacting causes:

1. `electron-builder.yml` explicitly builds macOS artifacts with `identity: null` and `hardenedRuntime: false`, and the release workflow describes those artifacts as unsigned. macOS therefore cannot use a stable Developer ID code requirement to recognize successive releases as the same trusted application. Keychain `Always Allow` decisions are not reliable across binaries whose application identity changes.
2. Space stores every Provider under a separate generic-password account in the `kodax-space` service. File-based macOS Keychain access control is attached to each item, so legacy or untrusted entries can each produce a separate authorization dialog.
3. `@napi-rs/keyring`'s macOS delete path locates the item through a generic-password read before deleting it. As a result, `provider.removeKey` can trigger the same secret-access authorization even though the user only asked to remove the key.

### Proposed Solution

Treat stable macOS application identity as the release-blocking fix, with credential-layout changes as prompt-count and migration work:

1. Sign macOS stable artifacts with one persistent Developer ID Application identity and notarize them. Enable hardened runtime with the required Electron entitlements, inject credentials only through release secrets, and fail stable release staging when signature/notarization verification is absent.
2. Introduce one versioned macOS credential-vault entry (or one OS-protected master key with an encrypted on-disk Provider map) so Provider count no longer maps to Keychain authorization count. Keep secrets out of renderer, logs, diagnostics, settings JSON, and plaintext disk.
3. Migrate legacy per-Provider `kodax-space` entries only after a successful read, record migration durably, and defer cleanup so one denied legacy entry does not block unrelated Providers. Never weaken ACLs to allow every application and never shell out to `security -w` for secret reads.
4. Make logical Provider-key removal delete only the encrypted Provider record. Keychain access should be required only when the vault must be decrypted or rewritten, not to reveal the individual key solely to locate it.
5. Retain the current in-process cache/read coalescing and add typed diagnostics that distinguish legacy-entry migration, locked Keychain, denied access, unsigned build identity, and unavailable backend without exposing secrets.

### Acceptance Criteria

- A signed/notarized macOS release upgraded to the next release signed by the same identity does not ask again for previously granted Keychain access.
- After migration, startup and Provider settings produce at most one vault authorization interaction regardless of the number of configured Providers, and no repeated prompt after `Always Allow`.
- Removing one stored Provider key does not perform a read of that legacy per-Provider secret and does not leave the Provider usable through a stale managed environment value.
- Denying or cancelling migration for one legacy key does not trigger a prompt loop or block Providers backed by environment variables or already-migrated credentials.
- Packaged macOS tests verify the Developer ID signature, hardened runtime, notarization result, migration behavior, prompt-count contract, deletion, and secret redaction; Windows and Linux key storage behavior remains unchanged.

### Unsigned-Build Mitigation Implemented

The issue remains Open because an unsigned app update still has no stable macOS code identity, but the non-signing prompt amplification paths have been removed:

- macOS now stores each Provider as a separately encrypted record in `~/.kodax/space/provider-credentials.v1.json`, using Electron `safeStorage` and its single OS-protected application key. The file contains ciphertext and account metadata only; plaintext API keys remain main-process-only.
- Provider catalog and settings refreshes list encrypted record metadata without decrypting any key. Only the Provider that is actually about to run is decrypted, then cached for the process lifetime.
- Existing per-Provider `kodax-space` Keychain items migrate lazily on first real use. A cancelled or denied read is suppressed for the rest of that process so concurrent/repeated callers cannot immediately reopen the same password dialog.
- Removing a migrated/new Provider deletes its encrypted record without decrypting it. Legacy cleanup uses a no-secret-output delete command; a durable revocation tombstone prevents a legacy item from being re-imported if physical cleanup is unavailable.
- Vault writes are atomic, serialized, permission-restricted, size-bounded, and fail closed on corrupt state. Windows and Linux continue using their existing native keyring implementations.

Files changed:

- `apps/desktop/electron/providers/encrypted-credential-vault.ts`
- `apps/desktop/electron/providers/keychain.ts`
- `apps/desktop/electron/test/encrypted-credential-vault.test.ts`
- `apps/desktop/renderer/src/i18n/messages.ts`
- `docs/KNOWN_ISSUES.md`

Tests added:

- Ciphertext-only persistence and secret restoration.
- Metadata listing and deletion without decryption.
- Durable legacy revocation and replacement behavior.
- Serialized concurrent writes and safe-storage key rotation.
- Fail-closed handling for corrupt vault state.

Verification:

- Targeted encrypted-vault, Provider keychain, and Provider environment-injection suites: 22 passed, 0 failed.
- Electron main and renderer TypeScript checks passed with an explicit 4 GB Node heap after the default heap exhausted on the full main project.
- Targeted ESLint, Prettier, `git diff --check`, and the production Electron main build passed.
- A packaged macOS password-dialog count test still requires a macOS host and remains part of the Open issue's release acceptance criteria.

## 083: Late accepted daemon interrupt can be terminalized without delivery when its Run finishes during finalization

- Priority: High
- Status: In Progress
- Introduced: v0.1.32 development
- Prior Fix: v0.1.32 (incomplete)
- Fixed: KodaX 0.7.77 (source) plus beta.9 `dropped` outcome; packaged regression pending
- Created: 2026-07-22
- Resolution Date: Pending
- Reopened: 2026-07-24, 2026-07-25

### Original Problem

Current behavior:

- Normal Enter submits a daemon follow-up with `delivery: interrupt` and the renderer shows it as
  “queued as interrupt input, waiting for a safe insertion point.”
- If the prompt arrives after the last Runner/LLM boundary but while the outer managed Run still
  reports `running`, Runtime accepts it and emits `run.input.queued`.
- The Run can then complete without emitting `run.input.delivered`. Runtime changes the accepted
  input from `queued` to `terminal` during terminal cleanup, removes its MessageQueue entry, and no
  continuation Run executes the content.
- Space projects only canonical delivery and the Run terminal event, so the yellow queue bubble
  remains indefinitely even though the underlying input can no longer be delivered.

Expected behavior:

- An interrupt acknowledged as accepted must not be silently discarded during normal Run
  completion.
- Runtime should either consume every accepted input at a final safe boundary or close interrupt
  admission before delivery is no longer possible and reject the submission factually.
- If a previously accepted input nevertheless becomes terminal without delivery, Runtime and
  Space must expose an explicit non-delivery outcome, remove the false pending state, and preserve
  the user's full prompt for retry. Space must not silently convert explicit interrupt intent into
  `after_turn` delivery.

Reproduction steps:

1. Start a daemon-backed Coder managed Run.
2. Wait until the assistant has emitted its final answer and the managed evaluator is completing,
   while the Run still appears active in Space.
3. Press normal Enter to submit an interrupt prompt.
4. Observe `run.input.queued`, followed by `run.completed` with the input state `terminal`, but no
   `run.input.delivered` and no model execution of the follow-up.
5. Observe that the renderer continues to show the yellow queued bubble after the Run completes.

### Session Evidence

The supplied screenshot corresponds to Session
`s_94da7709-e1b0-4c28-b71c-fbb8376398a4`, Run `run_mrvjmqbi_ab0d3ca1`, and interrupt
`input_mrvjszqo_4d829093`:

- `2026-07-22T03:53:59.891Z`: final assistant stream ended.
- `2026-07-22T03:54:07.334Z`: managed-task status reported `phase: completed`.
- `2026-07-22T03:54:10.073Z`: Runtime accepted “演示文稿看起来就是感觉字体有点小” as a queued
  interrupt.
- `2026-07-22T03:54:11.513Z`: the Run completed 1.44 seconds later with that input in
  `state: terminal`.
- The durable Run log contains `run.input.queued` but no `run.input.delivered`, confirming that the
  prompt was not inserted into an LLM request and was not executed.

### Context

Affected components:

- KodaX Runtime interrupt admission and terminal cleanup in `../KodaX/src/sdk-runtime.ts`
- Space daemon submission in `apps/desktop/electron/kodax/real-session.ts`
- Runtime event projection in `apps/desktop/electron/kodax/runtime-host-adapter.ts`
- Renderer queued-message lifecycle in `apps/desktop/renderer/src/store/appStore.ts`

### Root Cause

Runtime interrupt admission checks that the Run is active and has an Actor Session, but it does not
track whether that Actor can still reach another safe Runner boundary. During managed-task
finalization the outer Run remains `running` after the root Actor has produced its final output, so
`submitInput()` can return `accepted: true` for an interrupt with no remaining consumption point.

When the Run settles, `terminalizeQueuedInterruptInputs()` intentionally dequeues every unconsumed
message and changes its input record to `terminal` to prevent cross-Run leakage. The terminal status
does not carry a non-delivery reason or the full input, and Runtime emits no dedicated input-terminal
event. Space therefore cannot distinguish this terminalized interrupt through its current canonical
delivery bridge and leaves the renderer overlay pending.

Issue 082 does not resolve this path: that fix reconciles a queue overlay only after
`run.input.delivered` proves model consumption. This input has no delivery event to reconcile.

### Proposed Solution

- Add an explicit Runtime interrupt-admission window tied to the Actor Runner lifecycle. Close it
  atomically before the last consumable boundary; accepted inputs already inside the window must be
  drained before normal completion.
- Reject late submissions with a factual retryable reason instead of accepting work that cannot be
  consumed.
- Add a canonical terminal/non-delivery event containing the public `inputId`, terminal reason, and
  retry semantics for cancellation, failure, recovery, and any residual race.
- Have Space reconcile that event by queue ID, remove the false pending overlay, and restore the
  original full prompt or present an explicit retry action without changing interrupt delivery to
  `after_turn` behind the user's back.
- Add a deterministic regression where an interrupt arrives between the final Actor boundary and
  normal Run completion, asserting that it is either delivered exactly once or rejected/restored,
  never accepted and silently discarded.

### Detailed Fix Plan

| File                                                                                                                                                                                                                                         | Change Summary                                                                                                                                   | Expected Outcome                                                                                                  | Risks and Guardrails                                                                | Tests                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `../KodaX/src/sdk-runtime.ts`                                                                                                                                                                                                                | Close per-Run interrupt admission at the final managed/coding completion signal and return `interrupt_window_closed` before enqueue              | The reproduced late send fails synchronously and Space restores the composer through its existing send-error path | Never close on intermediate managed worker turns; never downgrade to `after_turn`   | KodaX managed/coding completion-window regressions   |
| `packages/space-ipc-schema/src/channels/session.ts`                                                                                                                                                                                          | Add a bounded queue-terminal event with public queue ID, preview, and terminal reason                                                            | Residual accepted races have a typed cross-process outcome                                                        | Bound identifiers/text; keep it distinct from delivered transcript boundaries       | Package schema tests                                 |
| `apps/desktop/electron/kodax/runtime-host-adapter.ts`                                                                                                                                                                                        | Project terminal interrupt records before the owning Run terminal event                                                                          | Every accepted-but-undelivered input reaches the renderer exactly by `inputId`                                    | Emit only `state: terminal`; do not treat delivered inputs as failures              | Runtime adapter ordering/dedup tests                 |
| `apps/desktop/renderer/src/store/appStore.ts`                                                                                                                                                                                                | Mark the matching queued item failed by ID, with content fallback only for pre-ACK races; preserve failure when ACK arrives late                 | No indefinite yellow queue and no false user transcript message                                                   | Do not clear unrelated identical prompts or overwrite failed state during ACK races | Store race and identical-content tests               |
| `apps/desktop/renderer/src/features/session/composeMessages.ts`, `apps/desktop/renderer/src/features/session/messages/bubbles.tsx`, `apps/desktop/renderer/src/shell/ConversationStreamV2.tsx`, `apps/desktop/renderer/src/i18n/messages.ts` | Render a retained, visibly failed prompt with a precise copy/retry instruction                                                                   | Full visible content remains recoverable without overwriting an unrelated composer draft                          | Keep ordinary pending/queued visuals unchanged                                      | Composition/type tests and build                     |
| Runtime/Space tests and issue docs                                                                                                                                                                                                           | Cover completion, cancellation/failure/interruption, event-before-ACK, ACK-before-event, identical prompts, schema bounds, and terminal ordering | Cross-layer behavior is deterministic and auditable                                                               | Preserve existing 069/082 regressions                                               | Focused suites, typecheck, lint, format, smoke build |

### Resolution

Implemented a two-layer delivery guarantee without changing the user's requested queue mode:

- KodaX Runtime now tracks whether an active Run can still reach an interrupt boundary. Ordinary
  completion/error callbacks and the final managed-task `completed` status close admission before
  outer Run settlement. Late submissions return `interrupt_window_closed` before normalization or
  queue mutation; Space reports that the message was not sent, removes the optimistic bubble, and
  restores the original composer content and attachments.
- Terminal cleanup remains as a final cancellation/failure/restart/race guard. Space reads only
  `state: terminal` interrupt records from `run.completed`, `run.failed`, `run.cancelled`, and
  `run.interrupted`, derives a bounded `queued_user_prompt_failed` event, and emits it before the
  owning session terminal event. Already delivered inputs are ignored.
- Renderer reconciliation uses the public Runtime `inputId` first and bounded content-preview
  matching only when the terminal event wins the ACK race. A late ACK cannot revive a failed item,
  identical accepted prompts are not conflated, and a following cancellation event retains the
  actionable failure bubble.
- Failed prompts render as a red “Not delivered / 未送达” bubble with the full local prompt still
  visible and copyable plus an explicit copy-and-retry instruction. Existing yellow pending/queued
  states and canonical delivered transcript boundaries are unchanged.

Validation:

- KodaX: 3 completion/error admission regressions and 11 related Runtime queue lifecycle tests
  passed; the complete KodaX build and declaration bundle passed.
- Space IPC schema: 270 tests passed and the package build passed.
- Space desktop: 110 directly affected tests passed; the complete desktop test command passed.
- Space TypeScript, targeted ESLint, Git whitespace validation, and production `build:smoke`
  passed. Vite reported only the existing Monaco import and large-chunk warnings.

### Reopened Regression Evidence

Session `s_b0569457-5ef4-4928-9c2c-451b77cbbe06`, Run
`run_mryp08yx_aa5e3c13`, and interrupt `input_mryp242m_38505cf8` exposed a deterministic
admission window that the prior fix did not cover:

- `2026-07-24T08:44:30.304Z`: the root assistant stream and iteration ended.
- `2026-07-24T08:44:30.324Z`: the managed task entered `verifying`.
- `2026-07-24T08:44:32.196Z`: Runtime accepted the interrupt and emitted
  `run.input.queued`.
- `2026-07-24T08:44:38.513Z`: the managed task finally emitted `phase: completed`, which is
  where the current Runtime closes `interruptInputOpen`.
- `2026-07-24T08:44:41.155Z`: `run.completed` terminalized the still-queued input without any
  `run.input.delivered` event.

The current Runtime guard closes interrupt admission only on managed-task `completed`, after the
last root Runner consumption boundary has already passed. The existing regression test submits
after the synthetic `completed` status and therefore misses the real `verifying`-phase window.
Runtime must bind admission to actual root Runner consumption availability, closing it while
verification/finalization has no root drain point and reopening it only when another root round
starts.

### Regression Resolution

- Space now reads the authoritative managed-task phase from its daemon observation before
  submitting an interrupt.
- `verifying` and `completed` close Space interrupt admission locally and return the Runtime's
  factual `interrupt_window_closed` reason without calling `runtime.runs.submitInput()`.
- The existing RealSession rejection path tells the user that the message was not sent and can be
  retried after the Run finishes; Space does not silently alter interrupt delivery into after-turn.
- Added an adapter regression that emits the exact `verifying` phase, submits an interrupt, and
  proves Runtime never receives it.

### Second Reopened Regression Evidence

Session `s_7f8b4e93-6e8b-477b-badb-d35ee174b61f`, Run
`run_ms0feppg_3030a1a4`, and interrupt `input_ms0ffc5r_85028678` proved that the
Space-side `verifying` fence was still not the owning fix:

- `2026-07-25T13:50:25.361Z`: Runtime accepted the interrupt while the final
  root no-tool LLM request was already in flight.
- `2026-07-25T13:50:34.253Z`: the Runner emitted `iteration_end` without
  another `beforeNextTurn` queue drain.
- `2026-07-25T13:50:40.109Z`: the managed task completed.
- `2026-07-25T13:50:40.821Z`: `run.completed` terminalized the queued input
  without a `run.input.delivered` event.

The managed Runner intentionally called `beforeNextTurn` only after tool-using
iterations. Its no-tool terminal branch returned before the queue drain. That
behavior is correct for the REPL, whose outer `runQueuedPromptSequence` owns a
fresh follow-up round, but incorrect for Runtime: Runtime had promised delivery
inside the active Run and has no REPL outer sequence. Ordinary coding had the
same ownership mismatch at its `hasQueuedFollowUp` terminal return.

### Upstream Source Fix

- Runtime now injects a run-owned interrupt admission controller into coding
  execution.
- Managed Runner terminal candidates close admission synchronously, drain every
  already-accepted FIFO prompt, reserve a continuation turn at the iteration
  ceiling, and continue the same Run before Sidecar verification. Admission
  reopens only when a next model turn is guaranteed; managed idle-yield is such
  a boundary.
- Ordinary coding applies the same rule at no-tool, terminal-signal, and
  post-tool follow-up boundaries. It rotates Live Turn attribution for the
  queued prompt and commits the preceding assistant response before continuing
  after COMPLETE.
- Failure, cancellation, and terminal cleanup close admission before
  asynchronous teardown, so no newly accepted input can enter after the last
  consumable boundary.
- REPL behavior is unchanged because it does not opt into Runtime terminal
  continuation; its outer fresh-round queue owner remains authoritative.
- Deterministic tests cover the final no-tool request window, configured
  iteration ceiling, terminal tools, idle-yield wakeup, failure cleanup,
  stop-hook reanimation, COMPLETE transcript ordering, queued Live Turn
  rotation, Runtime admission bridge, and multimodal interrupt artifacts. The
  focused KodaX suite passes 280 tests with two existing todos; the isolated
  TypeScript project and full publish build pass.
- Space validation against that isolated KodaX build passes 52 Runtime
  adapter/queue tests, the complete TypeScript check, and the Electron main
  process build.

The source fix must be published in the next KodaX npm package and then pinned
by Space before the packaged desktop application can be marked resolved.

### Package status (2026-11-14 SDK audit)

- The source fix (KodaX commit `659889342`) shipped in KodaX `0.7.77`; Space has
  pinned later packages since, now Registry `0.7.97-beta.9`.
- beta.9 adds the explicit non-delivery outcome: a `steer` input whose Run ends
  before delivery reads `dropped` instead of staying `queued`. Space shows
  "Not delivered" with the full message and its retry hint; see
  [beta.9 adaptation](releases/kodax-beta9-space-adaptation.md).
- Not yet done: the packaged regression of the original late-finalization race. Until
  it passes, the status stays open; the remaining gap is verification, not an SDK change.

## 118: Space rejects large source images before KodaX can normalize them

- Priority: Medium
- Status: In Progress
- Introduced: v0.1.9
- Created: 2026-07-27

### Original Problem

Space describes 6 MiB as an image upload limit even though it delegates image normalization to the
public KodaX media component. Both renderer validation and the main-process decoded-byte check reject
an original image above 6 MiB before `normalizePastedImage` runs.

Expected behavior:

- Space keeps a bounded source-file/IPC limit for local memory and denial-of-service protection.
- A source image within that bound is normalized by KodaX before the final provider-safe size is
  enforced.
- Only the normalized image must fit the durable/send limit; normalization failure never falls back
  to an oversized raw source.

### Context

- KodaX 0.7.77 exports `normalizePastedImage`, `MAX_DIMENSION = 2000`, and
  `TARGET_RAW_SIZE_BYTES = 3,932,160` (3.75 MiB).
- Its normalizer decodes the image, clamps dimensions, tries PNG, then JPEG quality 80/60/40, and
  throws stable `IMAGE_TOO_LARGE` when the target still cannot be met.
- The reported 5,171,342-byte PNG normalized successfully to 3,011,687 bytes in an isolated Space
  persistence probe.

### Root Cause

Space uses one 6 MiB constant for two different boundaries: untrusted source bytes crossing IPC and
normalized bytes written into the Session attachment sandbox. This reverses the intended processing
order and bypasses the SDK's existing conversion capability for larger originals.

### Interim Mitigation

- Space now exports separate 12 MiB source and 6 MiB normalized-image boundaries from its IPC
  schema and reuses those constants in the renderer and main process.
- Sources within 12 MiB reach KodaX normalization before the final 6 MiB durable/send limit is
  enforced. A source above 12 MiB is rejected before normalization.
- Normalization failure cannot fall back to raw bytes when the raw source is above the final limit,
  and an unexpectedly oversized normalizer result is rejected.
- Current in-app help and the user manual describe 12 MiB as a temporary source-processing guard
  for the base64 IPC/main-process path, not as KodaX's compression capability or final image limit.

### Review Findings and Remaining Work

- 12 MiB is intentionally finite but not a capability-derived threshold. A valid 12,588,868-byte
  PNG rejected by the temporary guard normalized successfully through KodaX to a 2,705,693-byte
  JPEG, proving that source size does not predict final size.
- KodaX 0.7.77 calls `Jimp.read` before resizing and exposes no `maxPixels`, decode-memory budget,
  abort signal, or terminable worker boundary. A highly compressed, high-pixel image below 12 MiB
  can still exhaust or block the Electron main process.
- Space retains original base64 data URLs for previews and copies base64 across IPC. Raising or
  removing the source guard before changing that transport would multiply renderer/main memory.
- KodaX should add pre-decode signature/container and dimension checks, explicit byte/pixel/memory
  budgets, WebP support, and serial decoding in a terminable Worker/utility process.
- Space should use a main-authorized file/stream channel without trusting arbitrary renderer paths,
  preview normalized files instead of original base64, and enforce a measured per-batch budget.
- Only after memory and latency benchmarks should the temporary source limit be raised; the exact
  replacement value is intentionally not committed yet. The final 6 MiB hard limit and KodaX
  3.75 MiB normalization target remain appropriate.

Files changed:

- `packages/space-ipc-schema/src/channels/clipboard.ts`
- `packages/space-ipc-schema/src/index.ts`
- `packages/space-ipc-schema/test/registry.test.ts`
- `apps/desktop/renderer/src/shell/BottomBar.tsx`
- `apps/desktop/electron/ipc/clipboard.ts`
- `apps/desktop/electron/test/clipboard-save-image.test.ts`
- `apps/desktop/electron/kodax/space-manual-topics.ts`
- `docs/USER_MANUAL.zh-CN.md`
- `docs/KNOWN_ISSUES.md`

Validation:

- The supplied 5,171,342-byte PNG normalizes successfully with the installed KodaX 0.7.77 media
  component.
- A valid 10,057,798-byte PNG generated from the supplied image passed the real
  `saveClipboardImage` → KodaX pipeline and persisted as a 2,900,396-byte PNG; the probe then
  removed its draft artifact.
- Tests cover the exact source limit, final-output limit, normalization failure, oversized
  normalizer output, and schema boundaries.
- No KodaX SDK source change was required for the reported 5.17 MiB image, but SDK hardening is
  required before Space can safely promise broad large-source normalization.
- The rebuilt `out/win-unpacked/resources/app.asar` contains both the new source-limit path and
  lazy-resume ownership path, and packaged-content/boot smoke checks pass.

## 133: macOS/Linux quit and failed Windows complete-exit could leave an invisible Coder daemon without a control surface

- Priority: High
- Status: In Progress
- Introduced: v0.1.32 daemon adoption
- Hardened: corrected v0.1.34 source + KodaX 0.7.78 `daemonOrphanExit:1`
- Created: 2026-07-28
- Last reviewed: 2026-07-30

### Original Problem

The detached Coder daemon intentionally outlived its launching Electron
process. Windows normally retained a visible tray owner, but macOS and Linux
had no tray. `Cmd+Q`, Linux last-window exit, tray-disabled fallback, or a
Windows complete-exit stop failure could therefore terminate Space while the
daemon remained alive with no product-visible way to stop it.

The older tray also exposed **Quit Space, keep Runtime**, explicitly creating
the same invisible-owner state. The complete-exit watchdog always called
`app.exit(0)` after a bounded delay even when the CLI safe-stop returned a
blocker, command failure, timeout, or malformed result.

Expected behavior:

- every real Windows, macOS, and Linux application exit stops the Space-owned
  daemon before Space disappears;
- active work and other clients are never force-killed;
- a blocked or failed stop keeps or restores a visible Space control surface;
- a Space crash/SIGKILL has a daemon-side recovery path; and
- ordinary CLI-started persistent daemons keep their existing semantics.

### Root Cause

F136/Issue 090 solved only the Windows window-close case by retaining Electron
main and a notification-area tray. It did not change macOS/Linux `app.quit`,
tray-disabled fallback, or the final stop-result decision. Runtime preflight
also ran before closing the Coder admission gate, so a new executable request
could race the stop attempt.

The daemon had no opt-in owner-loss policy. Its process was detached, and the
only parent-death watcher was a test-only environment variable. Consequently,
an abnormal Space termination could not distinguish a deliberately persistent
CLI daemon from a Space-launched daemon that had lost its only visible owner.

### Implemented Hardening

- All ordinary `before-quit` paths now enter one complete-exit coordinator.
  Internal mode restarts and the losing single-instance process are the only
  bypasses. A mode restart registers `app.relaunch()` synchronously before the
  bypass is enabled, so a concurrent OS quit cannot win before relaunch exists.
- The Coder admission gate closes synchronously and drains admitted operations
  before Runtime preflight. Drain is bounded to 10 seconds; timeout atomically
  reopens admission and restores the main window instead of hanging after a
  Linux last-window exit. A blocker also restores the window and cancels exit.
- The tray no longer offers **Quit Space, keep Runtime**. Close-to-tray remains
  safe because the visible tray and Electron Runtime client remain alive.
- Complete exit checks Space-local Partner/Workflow work, permissions,
  AskUser requests, queued prompts, and External Agent tasks in addition to
  daemon work. It keeps the visible control plane alive while the current
  Runtime connection performs the revision-fenced stop.
- A stop result is confirmed only by `stopped:true`, or by an independently
  verified unowned Runtime profile when daemon state is missing. Missing or
  unreadable state alone is never treated as proof that no owner process
  remains. Command failure, timeout, malformed output, a late blocker, or an
  occupied owner schedules one relaunch with a visible recovery warning.
- KodaX adds opt-in `daemonOrphanExitMs` and advertises the dedicated
  `daemonOrphanExit:1` capability only when the current host actually enabled
  it. Space supplies 30 seconds only when it auto-starts the
  `coder` daemon. The ready host arms bootstrap grace before the first client
  initialize, closing the launcher-crash gap. After the final logical client
  disconnects, the daemon waits for active/queued/workflow/Agent/interaction
  work to become idle, then stops. Any other connected client cancels the
  reaper, and attach/detach during preflight receives a fresh full grace.
- If Electron cannot even register the recovery relaunch after irreversible
  disposal, it force-shows a fail-closed window outside the normal startup
  reveal gate, keeps Coder admission closed, and offers a bounded restart retry.
- The user manual, `kodax_manual`, usage guide, architecture, feature design,
  and human test guide document macOS/Linux behavior and safe recovery for
  0.1.32/0.1.33 (`kodax daemon stop`, or PID identity verification followed by
  `SIGTERM`; never broad `killall`).
- The process-distinct compatibility probe now emits and validates an exact
  owner marker containing the host PID, generated `space-f121-*` profile, and
  bounded temporary home. Normal completion performs a graceful exact-profile
  stop and waits for the recorded daemon PID to exit before deleting that home.
  Timeout/error cleanup first repeats the exact-profile stop and only escalates
  after the remaining PID's command line proves the same daemon/profile/home
  identity. It never terminates a generic `node.exe` process by name.
- The probe passes its host PID through the Runtime's test-parent watchdog as a
  second bounded cleanup path. Both successful and exceptional test paths
  assert that the recorded daemon PID is gone.

### Additional Windows Evidence

On 2026-07-30, process sampling found 15 detached
`kodax_cli.js daemon serve --profile space-f121-<pid>` processes created by
the process-distinct compatibility probe. Every recorded parent PID was gone,
the probe's temporary home directory no longer existed, and the observed
command lines did not include `--orphan-exit-ms`. Each process continuously
used approximately 4.4% of a 24-logical-processor machine (about one complete
logical core) and approximately 190 MB of private memory. Together they
consumed approximately 67% CPU and 2.85 GB of private memory before the active
packaged app did any work.

This confirms that the remaining cleanup gap is not only an invisible-process
problem. Repeated compatibility-test timeout/cleanup failures can accumulate
enough orphan daemons to make the entire desktop unresponsive. The exact
profile prefix originates in `kodax-runtime-compat.test.ts`; these processes
are not Coder workers spawned by the user's active query.

### Remaining Work

- Run packaged process-level acceptance on macOS and Linux, including ordinary
  quit, last-window exit, active-work blockers, another client attaching during
  exit, and actual PID/state/lock removal after orphan recovery.
- KodaX currently accepts an idle orphan stop request before asynchronous host
  cleanup has necessarily succeeded. If that cleanup fails after the socket and
  orphan controller close, the 0.7.78 host does not publish a bounded retry
  guarantee. This requires an upstream host-level close retry/verification
  contract; Space must not claim that `daemonOrphanExit:1` alone proves eventual
  process exit.
- An attached existing opt-in daemon may have been spawned with a different
  grace interval. Until Runtime publishes the effective grace value, Space
  documents 30 seconds only for a daemon it starts itself and does not infer
  the interval from the capability version.
- A daemon whose control directory disappears must not enter a one-core busy
  loop. Add a process-level regression that deletes or loses the test home
  during shutdown and proves bounded CPU use plus eventual exact-PID exit.

Files changed:

- `apps/desktop/electron/main.ts`
- `apps/desktop/electron/kodax/coder-runtime-mode-switch.ts`
- `apps/desktop/electron/kodax/runtime-host-adapter.ts`
- `apps/desktop/electron/window/complete-exit-policy.ts`
- `apps/desktop/electron/window/shutdown-window.ts`
- `apps/desktop/electron/window/background-tray-model.ts`
- `src/runtime-daemon/management.ts` (KodaX)
- `src/runtime-daemon/host.ts` (KodaX)
- `src/runtime-daemon/manager.ts` (KodaX)
- `src/runtime-daemon/process.ts` (KodaX)
- `src/sdk-runtime.ts` and `src/kodax_cli.ts` (KodaX)
- `apps/desktop/electron/test/kodax-runtime-compat.test.ts`

Verification:

- Space focused exit/admission/adapter/tray/manual tests cover local blockers,
  revision-fenced stop, missing-plus-owned fail-closed behavior, and recovery.
- KodaX focused daemon management/process/server/upgrade tests: 71 passed.
- Two real process-distinct smokes cover both final-client disconnect and the
  bootstrap case where the daemon becomes ready but no client ever initializes;
  both observe idle orphan self-stop, PID exit, and state/lock removal.
- The real Windows compatibility probe passed after the ownership cleanup
  change, and a post-test process/temp-directory audit found zero
  `space-f121-*` daemons and zero compatibility homes.
- A process-level abnormal-path regression deliberately hangs the probe after
  publishing its exact owner marker, lets the outer timeout fire, skips the
  graceful CLI stop, verifies the remaining PID's full CLI/profile/home
  identity, terminates that exact process tree, and proves both PID exit and
  temporary-home removal.
- KodaX production build, Space Electron typecheck, and Space main bundle pass.
- The issue remains In Progress until packaged macOS/Linux verification and
  the orphan cleanup retry/verification gap are closed.

## 136: Restored transcript merging and legacy compaction reconciliation can relocate or physically duplicate conversation history

- Priority: High
- Status: In Progress
- Introduced: KodaX 0.7.50 / Space v0.1.27; exposed more broadly by KodaX 0.7.74
- Created: 2026-07-30

### Original Problem

After reopening Session `s_60717080-1d27-42fd-ac6a-be27319d9503`, the P0/P1
query sent at `2026-07-29T13:41:32.593Z` no longer appeared between its
predecessor and answer near the visible `Conversation compacted` boundary.
The query-jump rail still exposed its preview as query `#1`, which made the
query look deleted from the expected location.

Expected behavior:

- genuine pre-compaction main-conversation queries, assistant output,
  thinking, tool cards, and visible workflow notices remain visible exactly
  once after compaction and application restart;
- internal/synthetic carriers, storage markers, and abandoned branch detail
  may remain durable without becoming ordinary main-chat bubbles;
- full-history recovery preserves the original visible append order across
  main JSONL and island-sidecar storage;
- compaction boundaries remain at their actual chronological/lineage position;
- a selected canonical pre-compaction history segment cannot be split across
  the transcript merely because one physical copy is active and another is in
  side storage; and
- query ordinals, assistant ownership, tool-result pairing, and workflow
  notices remain stable after reopen.

### Context

The query is not physically lost. Its complete body survives independently in:

- archived entry `entry_a1a31ba8b1d5` in the Session `.islands.jsonl`;
- compaction entry `entry_7f7789e601f7`'s exact user-query ledger as
  `query_9010b90a7d58adbb`; and
- archive marker `entry_6a8e521f7e65`'s summary in the main JSONL.

### Terminology and Visibility Boundary

`archived child` was an ambiguous shorthand and must not be read as
`child-Agent content that Space should display forever`. In this issue:

- `child` means only a lineage entry whose `parentId` points to another lineage
  entry;
- `.islands.jsonl` is compaction old-island side storage, not a user archive and
  not proof that an entry belongs to an abandoned branch; and
- KodaX `loadFullTranscript()` is the raw append-order host scrollback/audit
  source. It deliberately includes inactive and sidecar entries, while Space
  owns the decision to show, fold, branch, or hide them in the main chat.

Space adopted `loadFullTranscript()` in v0.1.27 specifically so real
pre-compaction turns would remain visible instead of disappearing when
compaction creates a new active root. It must not render every raw entry as an
ordinary bubble. The intended classification is:

- show once: genuine main-conversation user queries, assistant/thinking output,
  and tool cards that became inactive only because compaction re-rooted the
  context;
- branch UI or a compact boundary, not ordinary main-line bubbles: detail from
  a branch actually abandoned by rewind/fork;
- hide: synthetic user/system carriers and storage-only
  `archive_marker`/`label`/`goal` entries;
- attach rather than render as a user bubble: user-role tool-result carriers;
  and
- render as compact notices: `compaction` and `branch_summary`, without exposing
  their internal summary bodies.

The factual P0 query belongs to the first category. The Session rewound at
`13:35:29` to assistant entry `entry_1236c786ad96`; P0 was then newly sent at
`13:41:32` as that retained entry's child, followed by the visible
assistant/tool stream and the `14:41:32` compaction. It is not the abandoned
pre-rewind child and not child-Agent output. Its later inactive/sidecar status
is only a consequence of compaction, so it should remain in main scrollback at
its original 13:41 position.

The archived query keeps its original parent `entry_1236c786ad96` and original
timestamp. That parent and the `13:35:29` rewind marker remain in the main
JSONL even though the marker is physically stored after the parent.
Nevertheless, KodaX 0.7.78 `loadFullTranscript()` returns the query at raw
transcript index `0`; Space's inactive-island folding retains it at visible
history index `0`. In the latest inspected 426-entry snapshot, five sidecar
entries precede parents that are still present in main; the first compaction is
at raw index `230`. Space folding reduces the transcript to 147 entries and
moves that first compaction to folded index `113`.

The displacement also changes the visible query ordinals rather than merely
inserting an extra row. A projection using the same Space history filters
starts its real-user query rail in this order before the later follow-ups:

1. the archived P0/P1 query from `13:41:32` (`#1`);
2. the archived writing-great-skills constraint from `13:55:18` (`#2`);
3. the Session's original opening query from `13:10:45` (`#3`);
4. the original smart-context follow-up from `13:14:49` (`#4`); and
5. the next-day成果 query (`#5`).

The original opening query `entry_d4ba4936048d` is therefore still durable and
visible, but it has been pushed from `#1` to `#3`. This is why hovering `#1` in
the screenshot shows P0/P1 and can make both the P0/P1 query at its expected
location and the original opening query appear to have disappeared.

The disorder is not limited to user queries. The single archived batch for
this Session contains 44 message entries: 27 user carriers and 17 assistant
messages. Those assistant messages contain 17 thinking blocks, 17 text blocks,
64 tool-use blocks, and 64 matching tool-result blocks.

After applying the same inactive-island folding as Space:

- 11 assistant messages, their thinking/text, and 50 complete tool-use/result
  pairs are moved into the visible prefix ahead of the original opening query;
- the other 6 assistant messages, their thinking/text, and 14 complete tool
  pairs are retained only through later active physical clones and therefore
  appear after the compaction boundary even though their timestamps precede
  it; and
- task-result entries move with those fragments. The factual task results are
  child-task completions that Space intentionally hides, but a recognized
  workflow result would be restored at the same wrong data position.

All 64 tool calls still find their corresponding results: there is no missing
or orphan result in this Session, and the local order inside each surviving
fragment remains coherent. The defect is global chronology and branch
placement, not evidence that the model output was deleted or that a tool result
was attached to a different `tool_use_id`. The renderer's global tool-result
pre-scan masks the severity of the storage-order defect but does not repair it.

The existing timestamps are useful evidence but are not an authoritative total
order. This remains true even if every timestamp is unique: a retained message
can be re-materialized as the child of a newer compaction entry while preserving
its earlier message timestamp. For example, `entry_73fedf7f0caf` retains
timestamp `14:22:46.212Z`, while its newly created compaction parent
`entry_7f7789e601f7` is timestamped `14:41:32.645Z`. A timestamp sort therefore
puts the child before its parent. Shared milliseconds are expected for
single-message block groups and batch persistence; they are not an independent
root cause and do not justify a new timestamp or global sequence requirement.

The independent long Session
`s_11be2ee5-54f4-4740-84ce-b22f1577db73` isolates the Space-side amplifier.
Unlike `s_607...`, its raw 322-entry SDK transcript is in the correct append
order: old-island entries `0..145`, the persisted compaction at index `146`,
then the retained-tail clones. Its compaction occurred at
`2026-07-29T07:06:50.278Z`, after the `请移动过去` query at `07:05:30.740Z`.
Space's active-wins content folding deletes the earlier inactive originals and
keeps later active clones, moving the visible boundary to about folded index
`62`; the query then appears near the visible tail. This Session must not be
used as evidence that the SDK returned the wrong order.

The earlier reported Session
`s_ca10d118-fb1c-495c-b00b-5d26d3ac80e5` currently has 51 raw transcript
entries, no island sidecar, no compaction entry, and no child-before-parent
violation. Its present persisted order is correct. Because the file was
subsequently resumed and rewritten, the observed UI state cannot now be
reconstructed from disk; it may have been a transient history/live-store or
running-binary projection fault, but this Session is not evidence for the
sidecar merge defect. It remains a required pass-through fixture: already
correct SDK input must remain in byte order.

### Introduction and Exposure Timeline

- Space v0.1.31 (released `2026-07-12`) embeds KodaX 0.7.68 and already calls
  `loadFullTranscript()` for restored history.
- The sidecar-first full-transcript merge originated in KodaX commit
  `deb38d1d` (`2026-06-16`) and shipped from KodaX 0.7.50.
- KodaX 0.7.68 already reads `.islands.jsonl` and
  `mergeTranscriptLineageEntries()` appends all sidecar entries before all main
  entries. Its own test expects the simple all-old-sidecar/all-current-main
  case, but does not cover a sidecar entry whose `parentId` still points to an
  entry retained in main. `archiveOldIslands()` can retain a non-message entry
  and its ancestor while moving a message subtree to side storage, so the
  mixed-file parent/child trigger is already representable in that version.
- Space commit `408a226` (`2026-07-04`, before v0.1.31) introduced the
  content-hash inactive-island fold and the active-wins policy. The commit's
  assumption that equal inactive content is necessarily a clone is disproven;
  that implementation remained unchanged from v0.1.31 through the affected
  packaged build and is removed by the current Issue 136 fix.
- KodaX 0.7.74 commit `6debae56` (`2026-07-22`) moved full-lineage merging from
  the public API into storage and added durable exact pre-compaction archiving,
  but preserved the same sidecar-first merge. It did not create the ordering
  algorithm defect; it made the relevant compaction sidecars more complete and
  consistently durable, increasing the frequency and visibility of the defect
  after Space upgraded beyond v0.1.31.
- v0.1.31 therefore cannot be treated as a known-good control. The defect was
  latent on both sides before that release, while the current Sessions were
  written after the broader KodaX 0.7.74 recovery path was available.

### Root Cause

KodaX 0.7.78 `FileSessionStorage.loadFullLineage()` calls
`mergeFullLineageEntries(archivedEntries, mainEntries)`. The equivalent
sidecar-first helper was already present in KodaX 0.7.68's
`loadFullTranscript()` implementation. Both insert every archived sidecar
entry first, then main-file entries. Replacing an existing entry does not
restore its original position, and entries unique to the sidecar remain ahead
of every surviving main entry.

The merge therefore does not preserve the public API's documented raw
append-order contract when a sidecar island has a surviving parent or sibling
in the main lineage. This remains an SDK contract defect even if Space later
hides some raw entries from the main chat; visibility filtering cannot make a
child-before-parent raw transcript ordered.

A second, independent mechanism creates physical replay branches. KodaX
0.7.78 restores each compaction's native `postCompactAttachments` into the
flat model context and then passes that flat context through
`createSessionLineage()`. The reconciler persisted the restored
`compaction-context` attachment as an ordinary navigable message. That changed
the parent path, prevented the retained tail from matching its old branch, and
allocated a new physical entry plus a new `logicalId` for every replayed
message. Repeating restore/reconcile appended the attachment and tail again.

The factual `s_607...` transcript now contains 930 distinct physical entry
IDs. Comparing complete business payloads while excluding physical lineage
identity finds 113 repeated-payload groups containing 702 entries, or 589
extra physical occurrences; the largest group has 12 copies. It also contains
96 persisted `_synthetic` / `compaction-context` carrier messages. There are
no repeated entry IDs, so renderer reconciliation, paging, or React repaint
cannot by themselves explain these copies: they are distinct durable lineage
nodes.

KodaX 0.7.79 correctly skips post-compact attachments during reconciliation
and makes a clean compaction lineage idempotent. It does not yet make handoff
from an already polluted 0.7.78 lineage safe. Against the factual 682-entry
main lineage, reconciling the existing 85 active messages creates 61 new
physical entries, all copies of existing messages, all with a fresh
`logicalId` and no `sourceEntryId`. Reconciling those messages plus one real
new query creates 62 entries: the same 61 old copies plus the one genuine
query. A second reconciliation of the newly re-rooted in-memory lineage is
stable, but the first post-upgrade write can still enlarge persisted history.
Repeated `loadSession()` / `loadFullTranscript()` calls do not write or grow
the files. Any persistence path that invokes full lineage reconciliation can
grow the old lineage; compaction persistence is a confirmed caller. Ordinary
display-only restore is not the trigger, and not every normal next-turn
snapshot path has been dynamically proven to invoke the full reconciler.

The affected Space build then fell back to content hashes in
`dedupeTranscriptEntries()`. Because it suppressed an inactive copy whenever
a same-content active copy existed, it kept the active clone at its later
physical position instead of preserving the first canonical display position.
That amplified `s_607...`'s upstream disorder and was the first ordering
failure in `s_11be...`, whose raw SDK order is otherwise correct. The current
tree removes this content-based deletion path.

Runtime transcript paging and `readPagedRuntimeTranscript()` preserve the order
they receive; `prependSessionHistory()` then normalizes restored user
timestamps monotonically in that order. These layers make the wrong order
stable but are not the first source of it. This is upstream of the renderer
reconciliation fixed by Issue 135 and is not a regression of that
interrupt-turn ownership fix.

### Required Resolution

- KodaX must make `loadFullTranscript()` honor its existing documented raw
  append-order contract across main JSONL and archive sidecars. This request
  does not ask KodaX to force every archived/inactive entry into Space's main
  chat. It only requires every entry that the raw API returns to keep its
  canonical order. Space does not require a new public timestamp, sequence, or
  particular storage representation to achieve that observable behavior.
- When compaction or legacy handoff represents an existing logical message in
  a new physical record, KodaX must preserve enough exact structural identity
  for a host to distinguish that relation from a legitimate repeated message.
  The SDK owns the internal representation; equal content or timestamps alone
  cannot satisfy this requirement.
- Add a legacy-pollution reconciliation gate. With an existing transcript and
  no new messages, reconciliation must add **0** entry IDs. With exactly one
  new user message, it must add exactly **1** entry ID. Cover a clean sibling
  branch plus a physical `compaction-context` carrier branch, a suffix that
  extends only the polluted branch, JSON round-trip, and repeated resume.
- Existing KodaX 0.7.78 physical replay generations must not be silently
  deleted or merged merely because their payloads are equal. If an exact
  identity relation cannot be established, the data must remain available and
  ambiguous rather than be mislabeled as a clone.
- Add KodaX regressions where a sidecar entry's parent remains in the main file,
  including rewind plus compaction and multiple archive batches, identical
  timestamps, partial sidecar tails, and repeated compaction/resume cycles.
- Verify the paged Runtime transcript exposes the same corrected order as
  direct `loadFullTranscript()`.
- Space must apply an explicit pipeline in this order: classify raw entries for
  main-chat/branch/hidden presentation, preserve canonical order for the
  selected occurrence, fold only proven clones without moving the first slot,
  then project UI items. Storage location or `active: false` alone is not a
  visibility decision.
- Space must stop treating active same-content entries as permission to delete
  or relocate inactive entries. Dedupe must select authoritative payload
  independently from display position, retain the first canonical slot for a
  proven clone, and fail open for ambiguous legacy entries.
- Space must retain `entryId`, `parentId`, `turnId`, `logicalId`,
  `sourceEntryId`, and a canonical history position through Electron, IPC, and
  renderer projection. Assistant/thinking/tool items need the same turn
  envelope as their user entry. Canonical position controls display order;
  `sentAt` controls time presentation only.
- Clone proof in Space is limited to repeated physical `entryId`, repeated
  `logicalId`, or an explicit `sourceEntryId` relation. Equal role/content,
  timestamp, turn ID, parent-clone ancestry, or a nearby
  `compaction-context` carrier can identify a suspicious legacy replay but
  cannot prove identity. Ambiguous legacy rows remain visible.
- Space defensively validates parent-before-child order without a global
  timestamp sort. Timestamp remains presentation/evidence metadata and cannot
  override topology or authorize folding.
- Add a factual Space history-replay regression for both Sessions above,
  asserting query, assistant text, thinking, multi-tool/result pairing,
  task-result/workflow notice, rewind, and compaction-boundary order.
- Cover active/inactive clones, repeated identical legitimate content,
  synthetic hidden carriers, consecutive user prompts, multiple resume clones,
  and history paging. Fail open rather than delete or merge content when clone
  identity is ambiguous.

### Implementation Status (2026-07-31)

The non-destructive Space-owned portion is implemented on the current tree:

- restored entries first receive a stable parent-before-child repair without a
  global timestamp sort;
- storage markers, exact rewind-abandoned paths, placeholders, visible lineage,
  and ordinary transcript rows are classified before clone folding;
- repeated `entryId`, `logicalId`, and `sourceEntryId` are the only clone
  proofs. The earlier inactive/active content fallback and the experimental
  compaction-carrier path fallback were removed after adversarial examples
  showed that both can delete a legitimate retry or imported replay;
- the first canonical slot is retained while an independently selected exact
  body may become authoritative; children of a folded physical clone are
  remapped to the canonical parent;
- canonical and authoritative identity now reaches history IPC and renderer
  ownership reconciliation; composition preserves canonical order and unique
  render IDs, while fork/rewind turn selectors use the same full-history
  projection as the visible UI; and
- factual `s_607...`, `s_11be...`, and pass-through `s_ca...` models cover
  opening-query order, thinking/text, multi-tool/result pairing, workflow and
  compaction notices, rewind filtering, legal repeated content, ambiguous
  legacy data, placeholder restoration, and unique rendered IDs. Legacy rows
  without provenance deliberately fail open instead of moving or deleting an
  original query.

The local KodaX `0.7.79` test package has now been installed with `--no-save`
and exercised through the same module path the desktop resolves. The current
`out/win-unpacked/resources/app.asar` also embeds 0.7.79, while the root,
desktop, and lockfile declarations still pin 0.7.78; the test build is therefore
not yet reproducible from the committed dependency graph. Package-level probes
confirm stable topology-aware island recovery, exact-main overlap authority,
bounded corrupt-cycle fallback, archive/unarchive collision protection, clean
retained-clone provenance, and direct/paged entry-ID order. Space also consumes a still-fresh
`sessions.observe()` transcript tail as the first history page, eliminating the
extra pre-observation `sessions.load()` and the duplicate initial transcript
materialization. Receipt of any later Runtime event permanently invalidates
that immutable seed; subsequent history reads start a fresh revision instead
of risking stale replay.

### Updated 0.7.79 Candidate Validation (2026-08-01)

The rebuilt local candidate
`C:\Works\GitProj\KodaX-AI\KodaX\kodax-ai-kodax-0.7.79.tgz` (SHA-256
`BE8F17C95AE1EBF794171F2C3BA25F391285290918D4CFBAD33F09BEF232F5C4`) closes
the factual legacy-handoff defect that kept this issue blocked:

- all 140 installed package files are byte-identical to the candidate tarball;
  the packaged `app.asar` declares KodaX 0.7.79 and its 82 packaged KodaX
  runtime files are byte-identical to the installed candidate;
- against the unchanged factual 682-entry main lineage and 85 active messages,
  zero-input reconciliation adds **0** entry IDs, one controlled new user
  message adds exactly **1**, and repeating either reconciliation adds **0**;
- a clean compaction fixture is also idempotent on first and repeated
  reconciliation, persists no synthetic attachment carrier as an ordinary
  lineage message, and keeps exact `logicalId`/`sourceEntryId` provenance on
  both retained-tail clones;
- the strict transcript contains 930 unique entry IDs with no
  parent-before-child violation. The opening query is canonical index 0 and
  the formerly displaced P0 query is index 35;
- Runtime direct history matches the strict direct transcript. Traversing all
  930 one-entry pages newest-to-oldest and prepending each page reconstructs
  the direct append order entry-for-entry, including the oversized descriptor;
- five rounds through legacy and strict Session/full-transcript reads leave the
  main and island files unchanged in size, modification time, and SHA-256;
- zero-input reconciliation also returns a byte-for-byte equivalent 682-entry
  active lineage. It prevents new pollution but does not rewrite or delete the
  already persisted 949-entry full lineage, so ambiguous historical copies
  remain a separate conservative recovery concern;
- the Space transcript/order/compose/fork/rewind/store suites pass 175/175,
  the Runtime adapter and compatibility suites pass all 96 functional checks,
  and full TypeScript typecheck passes.

The issue stays **In Progress** for two independent gates. The npm Registry
does not yet contain 0.7.79, while root/desktop manifests and the lockfile
intentionally remain pinned to 0.7.78; Space still needs a reproducible released
dependency build. Separately, 0.7.79 prevents new replay pollution but cannot
reconstruct canonical identities missing from already polluted 0.7.78 history.
Until a supported legacy classification/migration boundary exists, Space
continues to preserve ambiguous old physical copies rather than risk another
missing/relocated-query regression.

### Superseding Conversation-History Contract Validation (2026-08-01)

The later rebuilt local `0.7.79` package has SHA-256
`6EB5A2A475509E8523BB4FB054EC05E324CA7141E0772DA82D8F3D3F349C14DE` and
adds the SDK-owned ordinary-conversation projection that Space had been
missing. The standalone `readConversationHistory()` result and Runtime
`sessions.conversation()`, `conversationPage()`, and
`conversationEntryChunk()` paths were compared on the factual Session. Direct
and paged reads have identical bodies, order, revision, source revision,
status, and issues; newest-first pages prepend back to the direct order, and a
245,588-byte oversized entry reconstructs byte-for-byte from chunks. The
daemon advertises `conversationHistory: 1`, and fork/rewind accept an exact
returned boundary fenced by `sourceRevision`.

That transport result is a **GO**, but it does not prove that the factual
legacy duplicates were recovered. For
`s_60717080-1d27-42fd-ac6a-be27319d9503`, the SDK currently returns
`status: ambiguous`, 956 ordinary-conversation candidates, and the issues
`compaction_boundary_invalid` and `compaction_predecessor_missing`. Every
candidate has a one-element `auditEntryIds` list, so no legacy replay
generation was proven equivalent and folded. The known `/add-feature ...`
query still appears at 11 distinct returned boundaries. This is correct
fail-open behavior for uncertain evidence, but it means Issue 136 is not
resolved for this historical Session.

Space now consumes this conversation projection for the main chat and keeps
the full transcript as an audit/legacy-fallback surface only. It does not run
the old content/role/timestamp/turn dedupe over the SDK projection. The IPC
preserves `resolved` / `partial` / `ambiguous`, `sourceRevision`, and bounded
issue counts; the renderer explicitly warns for non-resolved histories.
Repeated equal-content candidates remain visible. Fork/rewind binds only the
exact visible candidate boundary plus `sourceRevision`; it never substitutes a
content match, and a stale or unknown boundary fails closed. Standalone and
Runtime paths follow the same rule.

The remaining KodaX question is factual rather than prescriptive: determine
whether the real compaction topology around `entry_93b8a7b49cef` can prove a
lossless canonical interpretation. If it can, the ordinary projection should
return the proven interaction once with all corresponding physical copies in
`auditEntryIds`; if it cannot, it must remain `ambiguous` and retain every
candidate. Space requests no timestamp, sequence, public sorting field, UI
policy, or internal storage algorithm. Registry publication and an exact
manifest/lock pin remain separate release gates.

### Factual Legacy Repair and Resume Validation (2026-08-01)

The later duplicate-content report is persisted-history pollution, not a React
double render. The `/add-feature ... /complete-feature` query occurs at 11
different physical transcript entries. Every occurrence has a unique
`entryId` and `logicalId`, no `sourceEntryId`, and the same factual turn,
timestamp, and content. At least seven following assistant/thinking/tool/result
chains are byte-identical. Space therefore has no authoritative identity with
which to fold them, and the current fail-open projection correctly exposes the
old physical copies instead of silently deleting a potentially real retry.

The legacy KodaX reconciler caused this pollution during resume. It cloned the
previous lineage but restarted reconciliation with no active parent, then
reprocessed the already-active flat message list as a new root chain. Existing
messages consequently received new physical and logical IDs, so each resume or
compaction handoff could persist another complete generation. KodaX 0.7.79's
active-prefix/suffix reconciliation prevents that new growth and preserves
provenance for newly re-materialized retained entries; it cannot reconstruct
identity that older files never stored.

The full 930-entry audit and the active model-resume context have different
repair boundaries. The active lineage has 82 entries and expands to 85 model
messages because the latest compaction's three `postCompactAttachments` also
exist as six standalone `_synthetic: true`, `_source: compaction-context`
messages. Those six are exact redundant context carriers. The 11 old query
generations are inactive audit history and cannot be permanently collapsed by
content, timestamp, or turn ID without guessing.

An earlier Space repair experiment used KodaX's native `forkSession()` and
incorrectly called the result a repaired Session. Native fork is an
active-context operation: it copied only the selected active path, not the full
append-order audit lineage. Consequently `s_repaired_60717080_20260801` has 76
transcript entries while the source then had 930. The roughly 867 omitted
inactive/audit entries explain the user's observation that the repair lost a
large amount of information. Stability across repeated reads proved only that
the smaller target was stable; it did **not** prove losslessness.

This target is therefore classified as an incomplete active-context recovery,
not a valid full-history repair. The original Session was never overwritten or
deleted, and its exact main/islands backup remains at
`C:\Users\ADMIN\.kodax\session-repair-backups\20260801T022802Z-s_60717080-1d27-42fd-ac6a-be27319d9503`.

The repair utility now fails closed before backup, fork, or target creation
whenever full-lineage and active-lineage counts differ. Against the later
factual state it refused 983 full-history entries versus 31 active-path entries
and created no target. It still never content-deduplicates ordinary
query/assistant/tool records. A genuinely lossless canonical repair of the
old 0.7.78 replay generations remains unavailable until an authoritative
legacy classification/migration boundary exists; Space must not guess it from
content, timestamp, `turnId`, or storage location.

## 142: Full-effects history restoration mounts and animates an entire long transcript beneath a live backdrop surface

- Priority: Medium
- Status: In Progress
- Introduced: current ConversationStreamV2 / full-effects renderer
- Hardened: corrected v0.1.34 source
- Created: 2026-07-30

### Problem

Opening Session `s_60717080-1d27-42fd-ac6a-be27319d9503` from the packaged
Windows build can freeze the desktop for several seconds in Full visual
quality, while the lower visual-quality modes avoid the severe stall. This
Session is a material outlier rather than an ordinary long conversation: its
durable JSONL is 9,083,571 bytes, approximately 4.85 times the next-largest
persisted Session inspected, and restores approximately 850 transcript
entries. Assistant thinking alone accounts for approximately 5.5 MB and more
than 71,000 newlines.

A warm in-process Runtime history load takes approximately 260 ms for this
Session. That parsing and allocation burst is significant, but it does not
explain the observed multi-second Full-only freeze. The remaining dominant
work occurs while the renderer constructs, lays out, paints, and composites
the restored conversation.

### Root Cause

- `ConversationStreamV2` composes the complete restored transcript, builds
  every render item, and mounts it through one `renderItems.map(...)`; it has
  no row virtualization or offscreen content containment.
- Restored assistant output runs through the Markdown/GFM/highlight pipeline,
  and every standard restored row is wrapped in the same `Reveal` path used
  for newly arriving content. Collapsed thinking and tool bodies do not all
  become visible DOM, but their large strings remain an allocation and garbage
  collection multiplier.
- Full quality keeps a viewport-sized `backdrop-filter: blur(24px)` on the
  center pane while three large aurora blobs animate beneath it. The existing
  interaction guard disables this work for wheel, scroll, drag, and resize,
  but Session hydration is not considered an interaction, so the most
  expensive visual path remains enabled during the largest DOM/Markdown mount.
- Overflow clipping limits what is finally visible; it does not eliminate
  React construction, Markdown parsing, style calculation, scroll-height
  layout, DOM memory, or compositor bookkeeping for offscreen descendants.
  Message length and Full effects therefore multiply each other's cost in the
  current architecture even though the final blurred pixels are
  viewport-local.

The startup diagnostic that reports software-disabled GPU features is not
reliable root-cause evidence: it is sampled before GPU readiness, while the
packaged app's GPU process is subsequently visible on the NVIDIA 3D engine.
The Session parses without corrupt-record errors, and disk/Runtime loading
alone is too short to account for the freeze.

Intermittent freezes after sending a new query in Balanced quality have a
separate primary cause and are tracked in Issue 143. Full-effects compositing
amplifies initial restoration work, but it is not required for the live
Runtime event storm.

### Required Resolution

- Treat history hydration separately from live output. While a large restored
  window mounts, temporarily pause aurora/spotlight and remove the center-pane
  backdrop; restore Full quality after layout settles. Do not replay entry
  animations for restored rows, while preserving animation for genuinely new
  messages.
- Virtualize variable-height `ConversationRenderItem` rows with pixel
  overscan, stable keys, measured-height caching, and a total-height spacer.
  Preserve the continuous scrollbar, bottom anchoring, live follow, query
  jumps, search, fork/rewind selectors, and expansion-driven height changes.
- Progressively hydrate Markdown and fetch large thinking/tool bodies only
  for the viewport, overscan, or explicit expansion. Keep searchable metadata
  and token counts in the lightweight initial projection.
- `content-visibility: auto` with measured intrinsic sizes is an acceptable
  bridge for native scrolling, but it is not the final fix because it retains
  every React component, DOM node, and payload in renderer memory.
- Add packaged performance coverage using the factual outlier Session (or an
  equivalent generated fixture), recording history-load time, renderer long
  tasks, first stable paint, peak renderer memory, and scroll-anchor
  correctness in all three visual-quality modes.

### Space Mitigation

- Restored conversation rows use the browser's native `content-visibility`
  occlusion with content-derived intrinsic-height estimates. The complete
  native scroll range, DOM order, anchors, browser search, query navigation,
  and expansion behavior remain intact while offscreen layout/paint work is
  skipped and scrollbar estimates are substantially closer than one fixed
  placeholder height.
- Continuous cumulative text/thinking updates patch only the open assistant
  tail when the event prefix and Runtime sequence remain continuous. Stable
  historical messages and render items retain object identity, and memoized
  rows therefore skip historical Markdown, grouping, and bubble work on each
  live fragment. Structural or non-tail changes fail back to the canonical
  full composer.
- Historical thinking token estimates use a bounded per-entry cache rather
  than rescanning multi-megabyte thinking strings on each delta. Render reads
  only the committed cache; misses are merged after layout commit so an
  abandoned concurrent render cannot clear or pollute another Session's cache.
- Intrinsic-height estimation samples at most 4,096 characters per text block,
  so cumulative live output does not repeatedly rescan its complete prefix.
  Expanded/force-expanded thinking and tool receipts use content-related
  estimates, bounded to the same capped presentation height.
- Scroll/query anchoring samples the row at the viewport point and reads one
  relevant geometry target instead of querying and measuring every transcript
  row on each scroll event. Scroll synchronization is animation-frame
  throttled.
- Only the newest 24 render items are eligible for entry animation. History
  restoration therefore does not replay hundreds of `Reveal` animations, while
  newly arriving messages retain their visual treatment.
- Collapsed assistant thinking is now lazy-mounted. Multi-megabyte thinking
  strings remain available in projection state, but the Markdown/text DOM is
  not created until the user expands the section.
- Space marks history hydration as render-busy until two animation frames after
  the store commit. During that interval Full quality pauses aurora animation,
  removes the center-pane backdrop blur, and disables reveal transitions.
  The same compositor guard remains active during live Runtime streaming,
  queued Runs, and compaction, then restores the configured visual quality
  automatically when all work settles.
- The live tail explicitly opts out of occlusion so streaming output and bottom
  follow remain immediately visible.

This is a bounded mitigation, not final closure. Issue 142 remains In Progress
until the factual outlier Session (or an equivalent fixture) has packaged
renderer long-task, first-stable-paint, peak-memory, and scroll-anchor metrics
in all quality modes, and until viewport virtualization/progressive hydration
is implemented if those measurements still exceed the interaction budget.

Files changed:

- `apps/desktop/renderer/src/components/Reveal.tsx`
- `apps/desktop/renderer/src/features/session/messages/bubbles.tsx`
- `apps/desktop/renderer/src/shell/ConversationStreamV2.tsx`
- `apps/desktop/renderer/src/shell/conversationStreamIncremental.ts`
- `apps/desktop/renderer/src/shell/GlassAurora.tsx`
- `apps/desktop/renderer/src/shell/Shell.tsx`
- `apps/desktop/renderer/src/shell/auroraActivity.ts`
- `apps/desktop/renderer/src/styles.css`
- `apps/desktop/electron/test/conversation-stream-incremental.test.ts`

Verification:

- Focused Runtime/render-policy tests pass.
- Electron and renderer TypeScript checks pass.
- The full desktop suite passes with 2,043 passing and 4 platform-conditional
  skipped tests.
- The production smoke build passes.
- An isolated packaged Windows build boots with KodaX 0.7.78, initializes the
  Runtime host, and reaches `app://space` renderer-ready without replacing the
  developer's running `out/win-unpacked` build.

## 143: Per-fragment Runtime stream events saturate persistence, IPC, and long-Session renderer updates

- Priority: High
- Status: In Progress
- Introduced: KodaX typed Runtime streaming + current Space event bridge
- Created: 2026-07-30

### Original Problem

While Session `s_60717080-1d27-42fd-ac6a-be27319d9503` was running in Balanced
visual quality, sending a new query could leave the whole Space window
unresponsive for more than 10 seconds. The same active Session then froze
intermittently for additional multi-second periods. This behavior does not
require Full visual effects and therefore is not explained by Issue 142 alone.

The factual Run `run_ms7m99gl_d9210f61` started at
`2026-07-30T14:36:02.561Z`. One retained event-log window inspected during the
Run contained 25,689 valid JSON records over 191 seconds, all
`thinking.delta`, carrying only 96,924 text characters in total. The average
payload was approximately 3.8 characters and the largest only 15 characters,
yet every fragment was a separate Runtime event. Earlier in the same Run,
consecutive `tool.progress` records for `write` tool-input fragments also
shared the exact same millisecond timestamp. The event file repeatedly grew
toward its 16 MB trim threshold.

At the same time, the active packaged renderer used more than one logical
core, the Coder daemon approached another core, and the renderer's private
memory exceeded 950 MB. The independent orphan-daemon load recorded under
Issue 133 magnified the wall-clock stalls, but it did not create this
Session-specific event stream.

### Root Cause

- KodaX emits one typed `assistant.delta`, `thinking.delta`, or
  `tool.progress` event for every provider/tool fragment. Creating each event
  synchronously allocates the global sequence through a file lock and atomic
  sequence-file rewrite. Event-line persistence is buffered, but sequence
  persistence is still paid per fragment.
- Space main bridges every Runtime fragment individually. Each event is
  projected, validated through the push schema, serialized, and sent through
  a separate `webContents.send` call; there is no main-process coalescing or
  renderer backpressure.
- The renderer batcher queues every raw IPC event and normally merges adjacent
  text/thinking fragments once per animation frame. A live-snapshot barrier,
  however, can drain a paused Session in original raw order without
  coalescing, so a delayed snapshot can turn a backlog into thousands of
  synchronous store writes.
- Even on the normal batched path, Runtime-tagged deltas are retained as
  separate event-bucket entries rather than one replaceable live draft. Every
  update immutably copies the growing bucket and invalidates the Session's
  transcript composition. The non-virtualized long conversation from Issue
  142 magnifies that update and garbage-collection cost.

The periodic nature follows from this pipeline: fragment bursts build queues
and short-lived arrays, snapshot reconciliation can release a large raw
backlog, and garbage collection or React/layout work then blocks the renderer
until it catches up.

### Required Resolution

- Separate transient stream transport from durable semantic Runtime events.
  Coalesce text/thinking/tool-input fragments by Session, Run, context, tool,
  and event kind on a short bounded interval or byte threshold. Persist a
  sequence range and periodic draft checkpoint rather than locking and
  atomically rewriting the global sequence cursor for every few characters.
- Batch the Runtime-to-renderer bridge into bounded IPC envelopes. Preserve
  structural event order, but merge adjacent stream fragments and retain only
  the latest replaceable progress update before schema validation and
  `webContents.send`.
- Store active assistant/thinking/tool-input drafts separately from the
  immutable transcript event list. Update each draft at a capped visual rate,
  commit one final semantic entry at its finish boundary, and prevent a
  per-frame event bucket from growing for the duration of a Run.
- Replace raw paused-queue drain with boundary-aware coalescing. Structural
  lifecycle/tool events remain ordered, while adjacent deltas on the same side
  of the accepted snapshot cursor carry an explicit first/last sequence range.
- Add backpressure and observability: queue depth, events and characters per
  second, IPC batch size, snapshot-drain size, renderer long tasks, event-file
  trim rate, and dropped/replaced progress counts. A pathological provider
  stream must remain bounded without losing final text or cursor correctness.
- Add a packaged Windows regression using a long restored Session and a
  generated one-to-five-character delta stream. Balanced and Full modes must
  stay interactive during send, stream, snapshot reconciliation, tool-input
  assembly, and completion.

### Space Mitigation

- The renderer batcher now coalesces continuous same-stream assistant text and
  thinking deltas, including paused queues released by snapshot hydration.
  Merging is capped at 256 KB and requires continuous Runtime sequences (or
  legacy events with no Runtime provenance), so a missing middle event remains
  recoverable.
- The accepted/incoming snapshot draft watermarks are passed into queue drain.
  Deltas on opposite sides of the snapshot boundary are never merged.
- Continuous tool-input JSON fragments are concatenated only when both events
  carry the same explicit `toolId`; optional/ambiguous IDs remain separate.
  Adjacent replaceable tool-progress events retain only the latest state.
  Structural events preserve their original order.
- Store-level cross-frame coalescing applies the same continuity, size, and
  snapshot-side checks, bounding event-bucket growth when the stream spans
  multiple animation frames.
- A 10,000-fragment regression collapses to one exact-text batch; snapshot
  boundary, missing-middle recovery, tool-input, progress, and cursor tests
  pass.

### KodaX 0.7.79 release-candidate validation

- The local 0.7.79 package advertises `runtimeEventCoalescing:1` as both a
  pre-start SDK fact and a connected Runtime capability. Space now requires
  both surfaces and includes the requirement in its daemon handshake; it no
  longer treats `daemonOrphanExit:1` as sufficient proof that the stream source
  is bounded.
- The upstream implementation coalesces before sequence allocation and checks
  the 8 KiB threshold before aggregation. The release-candidate tests cover
  25,000 tiny thinking fragments, 7 KiB + 7 KiB ordering, structural flushes,
  reconnect/replay, snapshot watermarks, cancellation and shutdown.
- Space exposes `runtime.events.coalescing` in its capability projection while
  retaining renderer-frame batching, sequence continuity and snapshot-side
  checks as an independent consumer safety layer.

The pathological source event amplification is fixed in the 0.7.79 release
candidate. Issue 143 remains In Progress only until the exact Registry package
is pinned in both Space manifests and packaged long-Session acceptance confirms
the end-to-end CPU/latency improvement. The contract and evidence are recorded
in `docs/research/kodax-runtime-stream-performance-handoff-2026-08.md`.

Files changed:

- `apps/desktop/renderer/src/App.tsx`
- `apps/desktop/renderer/src/store/appStore.ts`
- `apps/desktop/renderer/src/store/sessionEventBatcher.ts`
- `apps/desktop/electron/test/app-store-runtime-projection.test.ts`
- `apps/desktop/electron/test/session-event-batcher.test.ts`
- `docs/research/kodax-runtime-stream-performance-handoff-2026-08.md`

Verification:

- Focused event batching, store projection, hydration, and aurora policy tests
  pass.
- Against the local 0.7.79 release candidate, the SDK/adapter suite passes 96/97;
  the sole failure is the intentional exact-pin guard because the Registry and
  both Space manifests still name 0.7.78. TypeScript, focused lint/formatting,
  and the production smoke build pass.
- The formal full desktop suite and isolated packaged boot remain release gates
  after Registry 0.7.79 can be pinned atomically in both manifests and the lock,
  followed by a clean install.

## 146: Stop can cross a history writer boundary and Runtime cancellation can end as a credential failure

- Priority: High
- Status: In Progress
- Introduced: v0.1.34 development / KodaX 0.7.79 integration
- Created: 2026-08-01

### Problem

In Session `s_60717080-1d27-42fd-ac6a-be27319d9503`, pressing Stop could:

- fail with `Session data changed during the read boundary: ...lock`;
- leave the header/sidebar saying the Worker was active while the composer
  temporarily lost both spinner and Stop;
- reappear later as `Recovering...`;
- remain in automatic compaction for several minutes after Stop; and
- terminate as `Provider run failed while using a run-scoped credential`
  instead of a user cancellation.

### Root Cause

This is a chain of separate defects, not one UI race:

1. Space put `assertPersistedCoderOwnership()` in front of Runtime run-status
   lookup and `runs.abort()`. That assertion performs a history-grade persisted
   Session read. An active daemon Run legitimately owns and changes the same
   Session boundary, so Stop could fail before it ever reached the authoritative
   Run.
2. Space clears an invalid session-live projection before asynchronously
   reopening its observation. The composer used only that projection for
   spinner/Stop, while the header and sidebar used the independently durable
   Runtime profile. Observation recovery also repeated the full persisted
   ownership read and could fail against the same active writer. This produced
   the visible split-brain interval.
3. KodaX accepted Stop during provider-backed automatic compaction but did not
   promptly terminate the compaction request; the factual run continued for
   about 202 seconds and committed the compaction after the first Stop request.
4. KodaX `normalizeRuntimeRunError()` currently replaces every error from a
   run that had a run-scoped credential with a generic provider-credential
   failure. It does so even when the underlying terminal cause is the user's
   `AbortError`, erasing cancellation semantics.

The first two are Space regressions. The last two are SDK Runtime behavior and
cannot be repaired by renderer inference without contradicting the daemon's
own receipt/status/result contract.

### Space Resolution

- Run status and Stop no longer read persisted transcript ownership before
  `sessions.status`, `runs.list`, or `runs.abort`; the daemon Runtime/Session/
  Run identities fence those control calls. Space validates the returned
  Session identity, every listed Run identity, and the still-current Runtime
  before the first abort side effect; a cross-Session response fails closed.
- First-time observation still validates persisted Coder ownership. Recovery
  of an already validated observation on the same Runtime uses the fresh daemon
  Session snapshot instead of crossing the active writer boundary again.
- The composer compares the Runtime profile cursor with the detailed
  session-live cursor before choosing the Run boundary. An absent,
  non-comparable, equal, or older profile cannot override live state, so stale
  profile data cannot resurrect Stop after confirmed idle. A causally newer
  profile is authoritative for both newly active and newly terminal state,
  preventing an older live object from hiding or retaining spinner/Stop. A
  local pending send is preserved until Runtime admission, and a causal
  terminal event still fences its own Run. Profile state is accepted only from
  a fresh connection. Failed observation recovery reconciles the profile once
  from the Runtime: a successful read stays fresh and retains a factual active
  Stop (or clears a factual terminal Run); if that read also fails, the
  connection is marked degraded and rejects the old profile instead of
  retaining an orphaned Stop indefinitely. A validated Stop receipt also
  schedules profile refresh. Late reads from a replaced Runtime attachment are
  fenced before they can overwrite the new profile.
- Observation invalidation reason and sanitized message are logged before
  resync, replacing the prior silent gap with usable evidence.
- `session.cancel` returns the structured Runtime Stop receipt. The renderer
  distinguishes confirmed cancellation, already-terminal, no-active-run, and
  unknown outcome; it does not claim success from an IPC acknowledgement.
- A Runtime-selected Session whose daemon is unavailable now fails Stop
  explicitly (or reconnects through the Runtime authority); absence of a local
  connection object is no longer misreported as factual `no-active-run`.

### 2026-08-04 Follow-up: delivered interrupt inputs hid active controls

Session `20260803_083817_9b45db6ce73db5`, Run
`run_msdfdma4_61844089`, exposed a remaining form of the same UI split. The Run
was active after a model switch. Interrupt inputs queued at
`2026-08-03T16:11:35.959Z` and `2026-08-03T16:12:26.629Z` were delivered
together by `run.input.delivered` at `16:12:30.725Z`; the next root turn had
already started. While a local send was pending, spinner and Stop temporarily
reappeared. Once delivery cleared that optimistic marker, both disappeared even
though the daemon profile still reported the Run as active.

The selector previously suppressed profile fallback whenever any session-live
object existed, including a causally older idle object. In addition,
`mid_turn_user_prompt` was treated as a transcript boundary but not as an
activity lifecycle start. Space now:

- treats delivered mid-turn prompts as a new active event boundary after an
  older terminal event;
- uses same-Runtime cursor ordering to let a newer profile settle an older live
  Run boundary in either direction;
- preserves detailed live state whenever the profile is not provably newer;
- preserves optimistic pending state until admission, then clears it on the
  canonical delivered-input lifecycle boundary;
- prevents a newer-but-stale profile from resurrecting a Run already fenced by
  its causal terminal event; and
- serializes profile reads per Runtime attachment while tracking the causal
  cursor per Runtime identity, so an in-flight status read cannot borrow a
  later observation cursor and a replacement Runtime cannot inherit another
  authority's sequence.

Focused regression coverage now includes the reported active-profile/idle-live
race, its terminal inverse, older and non-authoritative profile protection,
pending admission and delivery handoff, terminal fencing, observation recovery,
serialized profile reads, Runtime-identity cursor isolation, and delivered
mid-turn activity. The five focused activity, store, adapter, and Runtime
projection suites pass 247/247. The complete Desktop suite executes 2,307 tests:
2,303 pass, four platform-conditional tests skip, and zero fail. TypeScript,
targeted ESLint, Prettier, and diff checks pass. An independent sub-Agent review
found no remaining P0-P2 issue.

### Remaining KodaX Requirement

KodaX must preserve one coherent user-cancellation outcome across
`runs.abort()`, Session status/events, and `RunHandle.result`, including while
automatic compaction is in a provider call. Stop must either promptly cancel
that work or return an explicit non-terminal/unknown stop state that remains
observable; a continued and later committed compaction must not be presented
as confirmed cancellation. A user-originated abort must retain its cancellation
or interruption classification even when a run-scoped credential was used;
credential redaction may sanitize provider errors but must not replace an
`AbortError` with an unrelated provider-failure terminal cause.

The refreshed local `kodax-ai-kodax-0.7.79.tgz` was reinstalled and inspected on
2026-08-01. Its packaged Runtime still applies the generic
`Provider run failed while using a run-scoped credential.` replacement whenever
the Run held a scoped credential, without first preserving an underlying
`AbortError`. The history/conversation API requirements are satisfied, but this
independent cancellation requirement therefore remains open in the exact test
package used by Space.

Space does not require new timestamps, sequence fields, or SDK-owned main-chat
visibility for this issue.

## 165: Stop on a managed daemon Run left it stuck as stop_outcome_unconfirmed; spinner never cleared and sends failed with stale_run

- Priority: High
- Status: Open
- Introduced: KodaX 0.7.79 managed-task Stop / Space run-phase projection
- Created: 2026-08-04

### Problem

Session `20260804_075304_d2d3820c29bebd`, Run `run_msdws10q_43b6e914` (a
managed task that had spawned three audit sub-agents):

- User pressed Stop at `2026-08-04T00:24:14.818Z`. The daemon immediately
  transitioned the Run to phase `unknown`, stage `unknown`, error
  `stop_outcome_unconfirmed`, and emitted the stop receipt with
  `state: unknown / outcome: unknown / reason: "runtime run aborted"`.
- The provider request aborted 0.3s later (`Request aborted`,
  `lastErrorTime` 00:24:15.109Z in the Session meta), but the managed worker
  kept executing: the Run streamed **2,733 more assistant deltas over
  ~9 minutes** until 00:33:26Z, then sat silent for 4 minutes, and finally
  settled at 00:37:23Z as `failed` with
  `Provider run failed while using a run-scoped credential.` — the SDK's
  credential redaction replaced the underlying user AbortError.
- During the whole 00:24:15–00:37:23 window the Session showed a permanent
  spinner while the agent appeared not to run; the interrupt button did
  nothing (re-Stop is a no-op on an already-stopping Run); and every queued
  send briefly showed a yellow queue bubble that then vanished with
  `HANDLER_ERROR: [session.send] handler threw: The daemon rejected the
interrupt input: stale_run`.
- Restarting Space restored the Session's canonical history, but the failed
  Run's final output was lost (the Run never completed).

### Root Cause

A chain of three independent defects, only the first two of which Space can
repair:

1. **KodaX SDK (Issue 146 remaining requirement):** Stop on a non-queued Run
   immediately flips it to phase `unknown` / `stop_outcome_unconfirmed` and
   aborts the abort signal, but the managed executor / spawned sub-agents keep
   working for minutes and only terminalize much later — here 793 seconds
   after Stop. During that window the Run is neither active nor terminal, and
   its eventual failure is masked by the run-scoped credential redaction, so
   cancellation semantics are erased.
2. **Space projected phase `unknown` as indefinitely active:** `ACTIVE_PHASES`
   in `apps/desktop/electron/kodax/runtime/coder-daemon-projection.ts`
   (L35-42) includes `'unknown'`, so the Session live projection kept
   `activeRun` set for the whole stuck window: spinner + Stop persisted, and
   nothing could converge until the daemon terminalized on its own. There is
   no recovery affordance (timeout, "stop unconfirmed" state, force-idle) for
   a Run that is provably stopping but not terminal.
3. **Admission rejection surfaced as a hard error:** while phase is `unknown`
   the SDK's `submitInput` admission returns
   `{ accepted: false, reason: 'stale_run' }`. The main build that ran during
   the incident (`dist-electron/main.js`, `RealKodaXSession.send()`) converted
   every `!accepted` result into a **throw** — `The daemon rejected the
interrupt input: stale_run` — which `registerChannel` wrapped into the
   `HANDLER_ERROR` the user saw and removed the optimistic queue bubble.

### Current State

Space now stops throwing for factual admission rejection:
`real-session.ts` returns `{ accepted: false, reason, queueMode }`,
`ipc/session.ts` forwards the rejection, and
`BottomBar.restoreUnacceptedSend()` removes the optimistic bubble, restores the
composer, and shows a per-reason message (`bottom.sendRejected.*`). Runtime
projection also preserves causal start/terminal ordering and presents an
unconfirmed Stop as such rather than inventing an idle terminal state. What
remains open is the executor-side cancellation outcome:

- The daemon-side stop-stuck window (SDK) and its 13-minute duration.
- Repeated Stop during that window must return a factual receipt or terminal
  outcome from the daemon. Space must not force-idle a Run that the Runtime
  still reports as nonterminal because doing so could admit overlapping work.
- A dedicated regression still needs to prove that the refreshed KodaX
  package propagates Stop through the managed executor and all child work to a
  bounded terminal outcome. Until then, this issue remains open.

A second captured Stop on Run `run_mse3lo21_75253af3` confirms that the
terminal classification is also inconsistent on a short failure path. Space
requested Stop at 03:28:17.900Z; KodaX reported `runtime run aborted` in the
turn failure, then terminalized the same Run as
`Provider run failed while using a run-scoped credential.` at 03:28:17.958Z.
Space must continue to display the authoritative outcome and cannot rewrite it
as cancellation; KodaX still needs one consistent terminal reason for a
user-initiated Stop.

### 2026-08-06 recurrence and upstream fix status

Session `20260806_200641_l181e74214d29d` exposed a second entry into the same
stuck boundary on KodaX `0.7.83`: fire-and-forget child progress snapshot writes
backlogged the Actor mutation queue, a completed child missed the five-second
terminal-persistence deadline, and the controller self-fenced with
`actor_settlement_not_persisted`. That Actor health projection changed the Run
to `unknown` before the user pressed Stop. `requestRunStop()` then rejected both
Stop attempts as `accepted: false`, so no abort signal or cooperative child
quiescence was delivered. Space kept the nonterminal Run visible and restored
follow-up drafts rejected as `stale_run`; those behaviors preserved facts and
input, but the SDK offered no transition that could restore the Session.

KodaX Issue 282 is fixed in the v0.7.84 development source across the complete
chain: bounded/coalesced progress projection that no longer waits indefinitely
at the terminal boundary, exact same-owner reconciliation of a late Actor
snapshot, first-Stop delivery for a live same-owner unknown Run, and idempotent
repair-effect redelivery when a repeated Stop finds the first repair still
unknown. Durable quiescence of remaining children and confirmed terminal
cleanup then release the Session for a later Run. If the executor Promise had
already returned while durability was unknown, its saved success or
credential-safe failure fact is applied only after repair and remains
authoritative over fallback callbacks. A stale durable unknown status also
cannot rewind an in-process terminal Run; no-op quiescence avoids an
unnecessary Session lock window. Foreign/ownerless ownership, missing terminal
evidence, and genuine persistence failure remain unknown rather than being
force-idled.

Space first consumed that fix through the exact npm Registry KodaX `0.7.84`
package. Current v0.1.40 source has advanced both manifests, every lock view,
and installed deduplicated bytes to exact Registry KodaX `0.7.86`, which retains
the fix and adds the explicit Actor-settlement and Session-journal contracts.
The exact-package Runtime Worker, shared-daemon,
host Stop-receipt, input-admission, external-Agent, typecheck, and release
dependency gates pass. This issue remains Open only for a packaged application
fault-injection rerun of the original progress-backlog/late-settlement incident
and the broader pre-existing Issue 146 cancellation-convergence boundary; the
published v0.1.37 artifact remains historical KodaX `0.7.83` evidence.

### Evidence

- Daemon Run status `runs/run_msdws10q_43b6e914/status.json`: phase `failed`,
  `stop.requestedAt` 00:24:14.818Z, `stop.outcome failed`, error
  `Provider run failed while using a run-scoped credential.`
- Daemon Run events: `run.updated` to `phase=unknown / error=stop_outcome_unconfirmed`
  at 00:24:14Z, 2,733 deltas after Stop until 00:33:26Z, `run.failed` at 00:37:23Z.
- Session meta `errorMetadata.lastError: "Request aborted"` at 00:24:15.109Z.

## Issue 184: A continued managed Run could attach cumulative prior-turn output to the latest query, while an ambiguous compaction survived reload

- Priority: High
- Status: In Progress (Space projection fix in source; KodaX canonical compaction boundary pending)
- Introduced: v0.1.38 daemon live projection / KodaX 0.7.87 compaction
- Created: 2026-08-15

### Original Problem

Session `20260815_094944_bo4d9a9bb19e31` continued one managed Runtime Run through two delivered
interrupt inputs and therefore three root turns. During the latest turn, a large answer from the
preceding turn appeared after the latest query. Unlike Issue 182, Ctrl+R did not reliably repair
the display.

The Runtime event journal itself remained ordered by root `turnId`. The same Session then completed,
but its canonical conversation cache remained `ambiguous`, reporting
`compaction_boundary_invalid` and `compaction_predecessor_missing` for the automatic full-prefix
compaction committed during the third root turn.

### Root Cause

Two independent boundaries failed:

- Space projected `assistantTextByRun` and `thinkingTextByRun` as one cumulative Run draft. A
  continued managed Run can contain several root turns, but initial observation hydration attached
  that cumulative draft to the newest `session_start`. The live reducer reset drafts when the Run
  changed or terminated, not when a new root `turn.started` began inside the same Run. Reloading
  recreated the same wrong projection, so Ctrl+R could not fix it while the Run stayed active.
- KodaX committed a successful full-prefix compaction whose new boundary had no topology-proven
  predecessor and whose retained suffix conflicted with every predecessor branch. The canonical
  conversation therefore remained ambiguous after the Run terminated. Space cannot invent that
  missing durable order or safely delete one of the candidates.

This is not a timestamp collision, global sort defect, or a reason to deduplicate equal text.

### Space Resolution

- Observation replay now includes root `turn.started` and `thinking.finished` boundaries. Initial
  hydration reconstructs assistant/thinking drafts only from the active root turn instead of
  assigning a whole Run's cumulative text to that turn.
- A new root turn resets drafts, recovery checkpoints, tools, task state, and interactions even if
  an earlier `run.updated` event has already advanced the Run's public `turnId`. The reducer tracks
  draft ownership separately from Run status for this reason.
- An explicit next root `turnId` in a newer same-Run snapshot advances renderer ownership instead
  of being overwritten by the previous root identity.
- Transient child turn starts remain excluded, including the SDK's top-level child-context payload
  shape. Replay can establish draft ownership only from the current root boundary inside the
  captured snapshot's Session, journal epoch, and sequence cursor. Missing identity (including an
  active Run without a current `turnId`), future, foreign-epoch, malformed, or unavailable
  boundaries keep the observation available but omit the causally unscoped cumulative draft rather
  than displaying prior-turn output after the current query.
- Existing canonical/live reconciliation remains identity-based and fail-open. No content equality
  deduplication, timestamp sort, or synthetic transcript entry was added.

### Remaining KodaX Requirement

A successfully committed automatic compaction inside a continued managed Run must preserve a
topology-proven canonical boundary for all preceding user/assistant turns. After the Run terminates,
direct and paged canonical conversation must resolve to the same authoritative order. If that
boundary cannot be established, compaction must not replace the last resolvable canonical history.
Space needs no new public timestamp, sequence, visibility, or UI contract for this requirement.

### Verification

- Unit regressions cover cumulative old/current answer and thinking text, observation replay,
  `run.updated` overtaking `turn.started`, explicit same-Run root advancement, root/child isolation,
  missing/future/foreign-epoch/anonymous replay boundaries, replay failure, and current-turn
  continuation after reset.
- Existing Provider recovery, canonical/live reconciliation, paging, and Runtime observation suites
  remain green.
- See
  [ISSUE_184_v0.1.42_REGRESSION_GUIDE.md](test-guides/ISSUE_184_v0.1.42_REGRESSION_GUIDE.md)
  for packaged-app acceptance coverage.

## Issue 225: Intermittent packaged Runtime cold startup exceeds its readiness deadline

- Priority: Medium
- Status: ready (SDK beta.5 shipped a partial fix; awaiting installed beta.9 evidence)
- Introduced: Observed v0.1.47-alpha.3 / SDK 0.7.97-alpha.9; first affected version unknown
- Created: 2026-10-25
- Information completed: 2026-11-09, from per-stage timing that the automatic recorder retained for four further slow launches

### Original Problem

On 2026-10-25 (Asia/Shanghai), main diagnostics began at 16:31:11, the renderer was visually ready
at 16:31:18, and Runtime initialization failed at 16:32:17 with `daemon_startup_failed`. The daemon
only reported ready at 16:32:36. This is an abnormal startup, rather than an expected animation
duration. Issue 224 addresses the associated exit and feedback defects, not this SDK latency.

### Investigation

- The same unpacked executable and real profile subsequently initialized in approximately 5.9 s;
  Runtime attachment and projection took 3.58 s, including 2.80 s in the SDK connection factory.
- An isolated packaged smoke rendered in 2.53 s and initialized Runtime in 23.37 s including an
  intentional 20 s hold. A separate run with 987 distinct absent historical PIDs initialized in
  3.64 s without that hold. Historical child-record count alone does not reproduce the delay.
- The readiness exception includes generic RunAsNode fuse advice; successful real and isolated
  daemon launches do not support diagnosing a disabled fuse from that message alone.
- No changes were made to user history, retained child evidence, SDK safety deadlines, or the
  installed SDK package to mask the first-launch failure.

The local maintenance build now automatically retains `runtime-startup/stage_timing` records when
startup fails or takes at least ten seconds, including the SDK launcher's waiting stages/reasons.
Fast successful starts stay quiet. Timelines are bounded to 32 timing events and 16 launcher
transitions; durations use the monotonic clock. Explicit `KODAX_SPACE_RUNTIME_STARTUP_DEBUG=1` still
records every startup immediately. Preserve these events plus the matching daemon bootstrap
timestamps for a recurrence. This improves evidence capture without changing the SDK deadline.

### Follow-up measurements (2026-10-25)

The reported 66-second deadline was not reproduced. Three complete starts of the actual unpacked
application with the real profile took 6.113, 5.900 and 6.212 seconds; each completed normal exit.
SDK connection took 2.16–2.27 seconds and the first profile refresh took 0.76–0.84 seconds. A separate
exploratory start took 11.213 seconds, including a 5.073-second profile refresh; this is a different
stage from the original daemon-readiness timeout.

The following probes exercised the installed Registry SDK 0.7.97-alpha.9, without editing that
package or the sibling KodaX checkout:

- Real-profile public `createKodaXRuntime` initialization under the packaged Electron executable:
  0.948 seconds. It read 200 Run status files (about 309 KB), about 1.2 MB of managed-child
  metadata, and **zero historical event bytes**. The roughly 2 GB of old event history was not
  scanned by this startup in its current indexed state.
- Isolated managed-child registries with about 988 retained records: 0.125 seconds when PIDs were
  absent; 1.751 seconds with the real PID distribution and deliberately impossible identities.
  The latter issued one 1.645-second PowerShell snapshot, with no process termination.
- Both configured MCP servers use lazy connections. Public catalog prewarm with a copied cache
  and an empty cache took 1 ms and less than 1 ms respectively, spawning no MCP process. Their
  network initialization therefore did not reproduce this startup stall.

These measurements characterize the present state; they do not reconstruct the state of the
original failed first launch. Existing logs locate that failure before daemon readiness, but do
not identify its internal blocking operation. Detailed daemon preload probes did not attach in
this packaged launch path and were discarded; no internal trace or root-cause claim is based on
them. The older journal-commit diagnostic also failed its own SDK-boundary assumption and is not
evidence of an application regression.

Local, untracked probe scripts and sanitized results remain under `artifacts/diagnostics/`.
The user confirmed that the problem is intermittent and the boot/wake context is unknown. The
useful remaining evidence is a timed capture while the daemon is actually stalled. No speculative
SDK change, timeout increase, history deletion, or ownership-marker cleanup was applied. The
automatic recorder regression is `tests/e2e/runtime-startup-diagnostics.spec.ts`: with the debug
switch disabled, a real delayed SDK startup must persist timing and launcher progress.

Verification of the automatic recorder: 306 related unit tests, Electron TypeScript, ESLint and
formatting passed. The rebuilt Windows unpacked package passed all packaging/boot checks and six
SDK acceptance cases. Both automatic-diagnostics and startup-exit tests passed against that exact
package (16.2 s and 22.9 s, including intentional startup delays). Issue 225 remains `needs-info`:
the recorder is verified; the intermittent original timeout is not claimed fixed.

### Recorder evidence and localisation (2026-11-09)

The real-profile `diagnostics/space-main.jsonl` now holds four automatically retained slow cold
starts. A second readiness timeout, `daemon_startup_failed`, was also recorded on 2026-10-22. In
every slow start, `runtime_factory_connect` dominates, and inside it the SDK launcher's
`initializing:recovery` phase dominates:

| Start (UTC)      | SDK      | Total   | `runtime_factory_connect` | `recovery` (launcher) |
| ---------------- | -------- | ------- | ------------------------- | --------------------- |
| 2026-10-28 03:13 | alpha.10 | 12.76 s | 11.59 s                   | 10.13 s               |
| 2026-11-03 09:46 | alpha.10 | 12.79 s | 11.62 s                   | 9.71 s                |
| 2026-11-06 14:55 | alpha.10 | 11.06 s | 10.02 s                   | 7.96 s                |
| 2026-11-07 05:09 | beta.2   | 12.90 s | 10.71 s                   | 7.64 s                |

All other launcher phases total about 1.5 s; Space-side stages after connection total about 1 s.
The 2026-11-07 daemon `bootstrap.log` has timestamps and splits that recovery: 6.44 s before the
`runtime` phase and 0.98 s of Session recovery after it. In SDK source (`src/sdk-runtime.ts`, shared
daemon Host path), the pre-`runtime` recovery phase is exactly `cleanupRegisteredManagedChildren()`
over the real `~/.kodax/runtime/processes/children` registry. It runs synchronously before the
Runtime is constructed, so its cost directly consumes the readiness deadline. The earlier real-profile
`createKodaXRuntime` probe (0.948 s) used embedded mode, which never runs this sweep, so it could not
see this cost.

Registry state on 2026-11-09:

- 1,356 top-level records from 278 owner PIDs. Every record still has `runCleanupRequired` set, and
  `processTreeComplete` is `false` on all of them. The registry has grown from about 988 records on
  2026-10-25. Records from September remain, so startup skips them rather than pruning them, and
  every daemon start pays for them again.
- About 53% (715) have cwds in KodaX test or eval temp workspaces, for example
  `kodax-child-command-recovery-*`, `kodax-eval-dumps-*` and `kodax-edit-runtime-*`. Another 33,918
  records were quarantined into `.unresolved` (66 MB). Startup does not read those, but more than
  half are also fixtures such as `/test/repo`. KodaX SDK tests and evals therefore register managed
  children into the real user registry, a test-isolation defect analogous to Issue 025.
- The existing safe replay `artifacts/diagnostics/managed-children-startup-probe.mjs` uses an
  isolated home and impossible identities, and asserts that nothing is killed. Against today's
  1,356 records it finished in 0.36–0.40 s with one 0.25–0.29 s PowerShell CIM snapshot; with absent
  PIDs it took 0.11 s. The in-daemon sweep took 6.4–10 s, so the slow part depends on real process
  identities, live-PID reuse and/or the system state during app launch. Those paths can spawn
  further per-record PowerShell captures or kill probes.
- Windows boot events do not line up with the failures (2026-10-25 failed two days after the last
  boot; 2026-10-28 03:13 preceded that day's boot), so a post-boot cold WMI is not supported as the
  trigger. The sweep emits no internal timing, and the daemon log is silent between its start and
  `Runtime daemon starting`.

Not done: no records were deleted, no real-identity replay was run because it could terminate real
processes, and no Space timeout or SDK file was changed.

Proposed SDK follow-up:

1. Emit sweep timing (records, spawned probes and their durations, outcome counts).
2. Keep the historical sweep from blocking readiness, or bound it.
3. Prune or settle records whose owner is proven gone, instead of skipping them forever.
4. Isolate SDK tests and evals from the real `~/.kodax` registry.

### SDK follow-up shipped (2026-11-14 SDK audit)

KodaX `0.7.97-beta.5` (Issue 398) implements item 3: a cold shared Host start moves Run child
records whose owner and every recorded process are gone to `.unresolved/` unchanged instead of
rereading them, which removed about 6 s per cold start on a home with about 1,300 such records.
The idle Host also expires `.unresolved` records after 90 days. Items 1, 2 and 4 are not in the
changelog. Space pins beta.9 in source, but the installed application still runs alpha.5 / SDK
beta.4, and the real-profile recorder has retained no slow start since 2026-11-09. Next step: compare
the first cold starts of an installed beta.9 build against the table above. The issue stays open
until that evidence exists.

## Issues 230–232 — Kylin controls and explicit updates

- Created: 2026-10-28. Investigation and SDK handoff: [record](research/kylin-window-sandbox-and-manual-updates-2026-10-28.md). [Regression guide](test-guides/ISSUE_230_0.1.47-alpha.3_REGRESSION_GUIDE.md).
- **230 Original Problem**: Kylin/UKUI users on Space 0.1.46 have no window operation buttons. Main hides the native caption on Linux while renderer renders controls only on Windows. **Status**: Resolved in source, 2026-10-28; shared custom controls now include Linux. Three-platform rendering and real Windows operations passed; customer UKUI acceptance and Space publication remain pending.
- **231 Original Problem**: the independent CLI doctor reports a missing Node interpreter but SDK Linux setup guidance recommends only bubblewrap/socat/ripgrep. **Status**: ready, SDK-owned guidance defect; ordinary task fallback failure on Kylin is not established by that doctor result. User-confirmed design: preserve KodaX's automatic fallback through the current permission policy, without requiring users to install dependencies before continuing ordinary tasks. Published alpha.10 command tests cover preparation failure, non-selection, proven pre-start failure, denial and Stop (five pass); two SDK Auto boundary tests also pass. The earlier inference that doctor readiness necessarily blocks Agent Bash is withdrawn. CLI version/origin and Kylin task-level reproduction remain useful follow-up information. Electron interpreter discovery works without host Node in the isolated Windows probe; no claim of Kylin-wide readiness or a completed SDK guidance fix.
- **232 Original Problem**: startup checks automatically and sets autoDownload=true. The download/install boundary has no independent stable-to-prerelease guard. The updater previously already disabled install-on-quit; automatic installation was not independently reproduced. **Status**: Resolved in source, 2026-10-28; settings-only check plus separately confirmed version-bound download/install, disabled automatic flags and explicit channel gates are implemented. Installation waits for verified Runtime shutdown and local cleanup; active tasks/connected peers block it. Current GitHub latest returns stable v0.1.46; customer-time feed contents remain unknown. Space publication remains pending.
- **Validation**: full Node run passed 4,441 with 20 conditional/platform skips. Subsequent safe-install changes passed 37 focused tests, including all eight updater cases; typecheck/lint/build passed. Source UI passed 11 settings/window cases plus three real Runtime installation cases. The rebuilt Windows package passed Registry/native/worker/boot gates, six real SDK cases and all 15 additional UI/lifecycle cases. No actual installer replacement, SDK edits, customer-profile modifications or kernel sandbox weakening. Full evidence and installer hash are in the linked record.

## Issue 244 — Cold-open newest history read grows with Session file size

- **Priority / status**: Low; ready. Created 2026-11-10 from the F144 ticket 1 real-chain baseline.
- **Original problem**: cold opening the newest page costs 494 / 1377 / 2326 ms renderer-side for 1 / 8.6 / 25.5 MB Sessions; main view read is 178 / 618 / 1875 ms and SDK read 298 / 684 / 271 ms. Warm reopen is 173–224 ms. Expected: first paint of the newest page does not scale with total Session size.
- **Context**: cold-start / first-observation path only; since the Issue 242 fix the first newest read also includes the cold Actor-claim metadata rewrite (30k: ~3.9 s); per-page loads stay flat (~15 ms main side) and the F144 decision gate is unaffected.
- **Reproduction**: `npm run test:perf-baseline` (first-paint cold column).
- Source: [F144 ticket 1 baseline](perf-baselines/f144-ticket1-baseline.md#发现与决策门无关需要单独跟进).

## Issue 245 — Settings diagnostic export omits daemon startup evidence when Runtime cannot initialize

- **Priority**: Medium.
- **Status**: Resolved in source; Windows packaged regression passed. Not released.
- **Introduced**: Observed Space 0.1.47-alpha.5 / SDK 0.7.97-beta.4, Windows x64; first affected version unknown.
- **Created**: 2026-11-12.

### Original Problem

A customer used Settings to export diagnostics while Coder remained on “正在重新连接助手”.
The resulting bundle locates the failure at daemon startup but omits the daemon's own
`runtime/daemon/coder/bootstrap.log`, even though the exported exception explicitly asks the
reader to inspect that file. Support must ask the customer to find and send another file.
This is a product diagnostic-coverage defect, not an incomplete customer submission.

Expected: the Settings export captures the available evidence needed to investigate startup
failure without requiring a healthy Runtime or manual collection from hidden directories.
It cannot guarantee a root cause, but it must identify evidence that is missing or unreadable.

### Reproduction and Evidence

1. Start the affected packaged application with a Runtime that fails to become ready.
2. Export the default diagnostic bundle from Settings while startup is failing.
3. Inspect the ZIP: only `space-main.jsonl` is included under logs; there is no daemon bootstrap
   log or explicit notice that this source was not collected.

Customer bundle `kodax-space-diagnostics-20261112T065625Z(1)` was generated at
2026-11-12 06:56:31 UTC. Its main log contains 12 failed connection attempts of approximately
60 seconds each, all with last launcher progress `initializing:extensions`. One attempt records
`AggregateError` and failure to reclaim the child; nested failure details are not retained there.
`manifest.sdkVersion` is `unknown`, although main-log records identify SDK `0.7.97-beta.4`.
`integrationHealthInspection.status` is `not-required` while Runtime is unavailable, and manifest
`notices` is empty. After the customer cleared the Runtime directory, the UI changed to the generic
startup-failed banner. Subsequently supplied bootstrap and daemon logs identify a Windows Job
probe timeout on two starts (Issue 246); the original export did not contain either source.

### Confirmed Export Cause and Scope

- `apps/desktop/electron/diagnostics/export.ts` selects only `space-main(?:.N)?.jsonl` from the
  Space diagnostics directory. It has no daemon-log input or collection status for that source.
- `apps/desktop/electron/ipc/diagnostics.ts` obtains SDK version only from the connected Runtime
  identity and otherwise writes `unknown`. It skips integration inspection unless Runtime is
  ready, then labels the skipped inspection `not-required`.
- Existing export tests assert the Space-only archive shape; they do not cover a failed-startup
  bundle containing daemon evidence.

The export defect is independently actionable. The original 60-second startup failures are not
yet proven to share the later Job-probe cause; do not claim they are the recovery-stage latency
tracked in Issue 225, or that deleting Runtime data fixes either issue.

### Required Outcome and Acceptance

- Collect bounded, redacted `bootstrap.log` and `daemon.log` tails for the actual configured Runtime home
  and relevant profile, including during initialization/failure, without starting or restarting
  a Host to export diagnostics. Do not archive the entire Runtime directory.
- Report each expected source as collected, missing, unreadable, or truncated. Runtime-dependent
  inspections skipped because startup failed must say unavailable, not `not-required`.
- Preserve installed SDK version independently of successful attachment, distinguishing it from
  a connected Host version when available; retain startup attempt IDs, phases, timing and bounded,
  redacted structured causes, including nested startup/cleanup errors.
- Add regression coverage for failed-startup export, custom Runtime home, absent/deleted and
  unreadable logs, size limits and secret/path redaction. Verify the actual Settings export on a
  packaged failed-startup scenario; export must finish even when the Host is unavailable.

Follow-up evidence (2026-11-12): the customer supplied `bootstrap(1).log`, which identifies a
Windows Job verification failure. The more specific `runtime:windows` / `job-membership` probe
result is written to `daemon.log` by SDK beta.4, not bootstrap output. Include both sources in
the same Settings export; requesting successive hidden log files is the gap this issue addresses.

### Implementation and Verification (2026-11-12)

- `diagnostics/log-collection.ts` collects current Space logs and bounded bootstrap/daemon tails
  from the configured Runtime home and discovered profiles before older Space rotations.
  Export manifests report collected, truncated, missing, unreadable and omitted sources.
  Only the named logs are eligible; aliases escaping the configured home and non-regular files
  are rejected. Defaults remain 1 MiB per file and 5 MiB total, with redaction before export.
- The IPC export reads the installed SDK version without a connected Host, separately records
  the attached Host version, and labels skipped inspections `runtime-unavailable`. Optional
  live inspections have a ten-second deadline and do not run when Runtime is unavailable.
- Startup attempt telemetry now retains the original error for structured redaction.
  Aggregate startup/cleanup causes preserve bounded codes, reason and retryability while
  excluding arbitrary child-process arguments/environment and masking credentials.
- 16 diagnostics tests and six focused adapter startup/recovery tests pass. Electron and
  renderer type checks, changed-code ESLint, renderer/main builds pass.
- `node scripts/pack.mjs --win --dir` passes, including packaged dependency/boot checks
  and all seven real-SDK lifecycle/complete-exit smoke tests.
- The actual Settings export E2E passes in source Electron (11.7 s) and the newly built Windows
  unpacked application (7.8 s), with SDK beta.4. An isolated real daemon exits before readiness;
  export retains its bootstrap error and a seeded Windows probe record, masks the fixture
  credential, records the installed SDK version and marks live inspection unavailable.
  The seeded record is export coverage, not reproduction of the customer's OS timeout.
- Regression guide: `docs/test-guides/ISSUE_245_0.1.47_REGRESSION_GUIDE.md`.

This diagnostic change was followed by the startup and UI source fixes in Issues 246 and 247;
no customer recovery or release is claimed by these export tests.

## Issue 246 — Windows Job verification failure leaves Coder unavailable without an actionable recovery flow

- **Priority**: High.
- **Status**: Resolved in source, not released. Native membership verification and verified cleanup/retry replace the failing startup path. The reason the original PowerShell subprocess exceeded five seconds remains unknown.
- **Introduced**: Observed Space 0.1.47-alpha.5 / SDK 0.7.97-beta.4, Windows x64; first affected version unknown.
- **Created**: 2026-11-12.

### Original Problem and Customer Evidence

Coder repeatedly fails to start, then shows a generic instruction to restart Space. The initial
diagnostic export contains 12 approximately 60-second failures, with last reported phase
`extensions`; one failure is an `AggregateError` reporting that the startup child could not be
reclaimed. The user subsequently reported clearing `.kodax/runtime` and seeing a red startup
failure banner. The customer reports never installing SDK extensions and having no `extensions`
directory. Clearing Runtime state is not an established repair for this failure.

The subsequently supplied `bootstrap(1).log` records PID 29368, startup ID
`90a174f6-59db-45c2-a480-407b2af9e09f`, at 2026-11-12 07:01:45 UTC:
`extensions → mcp → extensions`, followed by
`Could not verify the Windows Job containment; refusing to publish an unverified Host.`
This proves the latest startup reached Windows Job verification and was rejected there.
It does not prove that all preceding timeouts had the same cause, or that deleting the directory
caused this OS verification failure. The fs.Stats deprecation warning is not the fatal error.

Latest `bootstrap.log` and `daemon.log` supplied after another restart confirm the same path twice:

| UTC time                | Bootstrap PID | Job probe duration | Deadline | Outcome                                         |
| ----------------------- | ------------- | ------------------ | -------- | ----------------------------------------------- |
| 2026-11-12 07:01:50.909 | 29368         | 5017 ms            | 5000 ms  | `ETIMEDOUT`, `exitCode=null`, `available=false` |
| 2026-11-12 07:21:23.707 | 12832         | 5020 ms            | 5000 ms  | `ETIMEDOUT`, `exitCode=null`, `available=false` |

Both probe records have `cached=false` and `stage=job-membership`. The second startup ID is
`a9a71bab-eab7-40d2-a3c2-df3f0cfba2e5`. A fresh restart therefore reproduces the failure;
this is not evidence of a missing extension or a proven negative Job-membership result.

### Release-Code Trace

Checked against SDK Git tag `v0.7.97-beta.4` and the installed published beta.4 bundle:

1. `src/kodax_cli.ts` invokes `createDaemonOwnedExtensionRuntime` before acquiring the daemon
   lease. Even with no extensions, startup emits the `extensions` phase. After integration setup,
   owner verification runs before the next Runtime phase; a last phase of `extensions` is not
   sufficient to attribute a failure to extension activation.
2. `src/runtime-daemon/manager.ts:acquireRuntimeDaemonLease` calls
   `readOwnerIdentityWithDiagnostics`. If startup advertises Windows Job containment but the
   probe cannot verify it, it throws the exact error in the customer log before publishing a Host.
3. `packages/agent/src/runtime/process-tree.ts:readCurrentProcessWindowsJobIdentity` runs
   `powershell.exe -NoProfile -NonInteractive`, compiles a C# Job query via `Add-Type`, checks
   membership and kill-on-close limits, and reads process identities. The subprocess has a
   5,000 ms deadline and no retry in this call. Timeout, nonzero exit, unexpected output, or
   negative membership evidence all produce an unavailable identity. Missing supervisor metadata
   is another explicitly diagnosed failure. These alternatives must not be conflated.
4. Before the Host is ready, the manager routes these probe diagnostics to
   `.kodax/runtime/daemon/coder/daemon.log`: `source=runtime:windows`, `stage=job-membership`,
   duration, availability, exit/error code or metadata reason. Issue 245 currently omits this log.
5. In `src/runtime-daemon/process.ts`, early child exit maps to `RuntimeDaemonStartupError`
   with `reason=child_exit`, which is not retryable. Timeout/unhealthy are retryable, but cleanup
   failure wraps the original error in an untyped `AggregateError`.
6. Space's adapter recognizes only selected top-level codes/flags; unrecognized initialization
   failures publish `incompatible` and do not schedule a retry. The banner hides the specific
   reason and offers no targeted verification/recovery action. Explicit later calls through
   `requireRuntime()` can start another attempt, so this is not a claim of an irreversible latch.

### Verification and Limits

Isolated probes retained under `artifacts/diagnostics/startup-recovery-20261112/`:

- `node --import tsx artifacts/diagnostics/startup-recovery-20261112/windows-job-probe.mjs`
  exercises the published SDK's real Job probe with injected subprocess results. Timeout,
  exit 1 and membership 0 each yield unavailable after one probe; a successful control yields
  an identity. No real customer processes or directories are touched. This reproduces the
  error-classification seam, not the customer's Windows failure.
- `node --import tsx artifacts/diagnostics/startup-recovery-20261112/probe.mjs` exercises
  Space's actual initialization catch/retry path: timeout retries; timeout plus cleanup failure
  and identity mismatch publish `incompatible` without automatic retry. Relevant adapter code
  was compared with the alpha.5 tag and is identical.
- Five existing adapter startup tests pass. They exercise recovery when the next factory call
  succeeds and stopping on incompatibility. Existing slow-start E2E uses an 11-second ready delay;
  it does not establish recovery from a failed Windows Job query. SDK containment tests explicitly
  check refusal to publish on failed attestation, but not this complete Space recovery experience.
- A separate published-SDK extension probe confirms `continueOnError` skips thrown activation
  errors but does not unblock a pending activation. This is an independent fault-containment
  concern, not an explanation of the customer's now-confirmed Job verification rejection.

### Required Follow-up

- The matching `daemon.log` is now available and establishes timeout. Determine which part of
  PowerShell startup, C# `Add-Type` compilation or Job/process querying exceeds the deadline.
  Do not attribute that latency to antivirus, permissions or customer configuration without evidence.
- Preserve the SDK's verified-ownership requirement while defining bounded fresh verification
  and safe recovery for transient probe failures. Do not blindly start another owner, mark
  incomplete cleanup successful, or bypass Job validation.
- Retain structured startup and cleanup causes across SDK/Space boundaries, distinguish
  recovery-needed failures from version incompatibility, and provide a specific explanation
  and supported recovery action when automatic recovery cannot proceed.
- Add fault-injected packaged acceptance for transient probe failure followed by recovery,
  persistent failure with actionable diagnostics, and startup plus cleanup failure. Include
  the Settings export and unified availability display in the same acceptance path.

### Implemented resolution and evidence (2026-11-12)

- SDK uses the hash-verified bundled native executable to read named Job membership,
  kill-on-close and both creation identities. The probe deadline is 10 seconds; a probe
  that could not run (timeout, spawn error) is retried once, while a native refusal
  (non-zero exit) is final. Failure stays fail-closed and is never cached.
- The Job owner that launches the daemon is the same bundled native executable (`__daemon-job-supervise`),
  replacing the PowerShell + `Add-Type` supervisor (15 s startup cap). Nothing is compiled at startup, so a
  scan or loaded machine no longer stalls the second PowerShell dependency on the start path. It creates the
  named kill-on-close Job, starts the daemon suspended, assigns it before resume, publishes the ready file, and
  exits only after the Job is empty; a failure before readiness is written to the ready file as `ERROR:`.
- Retryable child failures retain ownership checks. Cleanup failure retains exact
  handles, and concurrent admissions for the same slot wait for cleanup; supervisor
  readiness failures use the same fence. A retained committed owner is re-observed.
- After three consecutive retryable failures Space shows the failure with Retry startup and switches to slow background retries (30 s, 1, 2, 4 min, then every 5 min); foreground callers still cannot start a new attempt.
  Only the slow timer may start attempts past that point; manual retry resets the schedule and retries at once.
- Space's public SDK calls no longer pass the retired Host `profile` selector. Observed
  legacy identities remain available for diagnostics. The fix ships in the published SDK 0.7.97-beta.8
  (the published beta.7 does not contain it); Space depends on beta.8 from the Registry since 2026-11-13.
- Five real Windows Electron E2E cases pass (re-run after the native supervisor swap: the recovery spec passed 16 of 16 repeats, diagnostic export passed; the cleanup case now fails the probe 1.5 s after readiness because the faster supervisor otherwise lets the daemon exit before a busy Main polls readiness): failed-start export; offline/no-Provider
  cold start; first failure auto-recovery; persistent failure plus ZIP/manual retry and
  local model request; startup plus delayed cleanup without overlapping replacement.
  Application transports reject public network; customer OS-level air-gap acceptance
  remains part of the human regression guide.
- Native supervisor, verified 2026-11-12: a packaged `win-unpacked` candidate built with the local SDK tarball carries a byte-identical native executable and passed the recovery, diagnostic-export, startup-diagnostics and startup-exit E2E specs twice (7 of 7 each run). Eight parallel cold provisionings of the protected native artifact into a fresh `LOCALAPPDATA` succeeded in three rounds. Not measured: antivirus cold-start and CPU-stress timing; customer-machine acceptance.
- Registry beta.8, verified 2026-11-13: `pack.mjs --win --dir` without the local-SDK flag passes `smoke-pack`;
  boot-smoke reports the renderer ready in 5.6 s and the Runtime ready in 27.0 s with 122 historical child records
  preserved. The packaged `win-unpacked` build passes the recovery (3 cases), diagnostic-export, startup-diagnostics,
  startup-exit and file-attachments specs, plus the 7 sdk-unified-contract cases. Customer-machine and antivirus
  timing remain unverified. See `docs/releases/kodax-beta8-space-adaptation.md` (it also records a stale-renderer
  false alarm: `e2e:run` and `pack.mjs` do not rebuild `apps/desktop/dist`; run `npm run build:smoke` first).
- Guide: `docs/test-guides/ISSUE_246_0.1.47_REGRESSION_GUIDE.md`.

### Additional evidence and fixes (2026-11-12, follow-up review)

- Customer follow-up: a reboot cleared the failure, and restoring the cleared `.kodax`
  content afterwards did not bring it back; `Add-Type` measured 236 ms after the reboot.
  So the failure was a transient machine condition before the reboot, not `.kodax` content.
  What slowed PowerShell past five seconds is still unproven (no antivirus or load
  attribution without evidence).
- **Stale-lock masking (SDK launcher, reproduced).** `hasCompetingStartupOwner` treated any
  PID in the owner lock as a competing owner without checking it was alive. With a dead owner
  left in the lock, a startup child that exited immediately was not reported: the launcher
  waited the full deadline and reported a generic `timeout` instead of `child_exit`. Reproduced
  at the `waitForHealthyDaemonStartup` seam: 201 ms `child_exit` without a lock versus
  4002 ms `timeout` with a dead-PID lock. Fixed by requiring the owner to be not-`gone`
  (PID plus start identity); regression tests live in `src/runtime-daemon/process.test.ts`.
- The `child_exit` error now carries the child's last `[Error]` line from `bootstrap.log`
  (e.g. `Could not verify the Windows Job containment`), so Space's failure details name the
  real cause instead of only a log path.
- Boot-identity probing (PowerShell, `Get-CimInstance`) is not on the fail-closed path: the
  daemon tolerates its absence. It can only add up to five seconds of startup latency.

## Issue 247 — New-conversation task summary says Ready while the Coder backend has failed to start

- **Priority**: Medium.
- **Status**: Resolved in source, not released; confirmed by unit and real Electron failure/recovery regressions.
- **Introduced**: Observed Space 0.1.47-alpha.5; first affected version unknown.
- **Created**: 2026-11-12.
- **Original problem**: a selected project with a new conversation shows “就绪” directly above
  “助手启动失败”. Users cannot tell whether they can use Coder or what “助手” refers to.
- **Reproduction**: select a project without an active Session while Runtime initialization
  fails; the task summary and startup banner independently display contradictory statuses.
- **Root cause**: `PinnedTaskSummary` renders `useTaskDockRunView()`;
  `taskDockProjection.ts:buildTaskDockRunView` falls back to `taskDock.ready` when there is no
  active task/Session. Its input and hook do not consume Runtime connection availability.
  `RuntimeStartupStatus` separately reads `runtimeConnection.state`. `Shell.tsx` renders both.
  All three projection/hook/banner files match the alpha.5 tag.
- **Verification**: the isolated `windows-job-probe.mjs` above invokes the real Chinese task
  projection for an idle new conversation and gets “就绪”, without a Runtime-ready check.
- **Required outcome**: backend starting/reconnecting/unavailable state must take precedence
  over idle-task readiness. Explain the affected function as the local Coder conversation/tool
  service, expose the available recovery action, and do not imply a model/provider API error.
  Add composed UI coverage for starting, failed, disconnected and recovered Runtime states,
  including the new-conversation case, so contradictory availability labels cannot pass alone.

## Issue 248 — Linux upgrade from 0.1.46 blocks startup forever when the locked OS keyring cannot return the legacy Runtime client secret

- **Priority**: High.
- **Status**: Resolved in source, not released; unit-tested only, not yet verified on Linux/Kylin.
- **Introduced**: Space 0.1.47-alpha.5, which moved the Runtime client secret from the OS keychain
  to `auth.json` and imports the 0.1.46 secret on first use. Reported on Kylin V10 SP1
  (kernel 5.15.0-52) upgrading 0.1.46 → 0.1.47-alpha.5.
- **Created**: 2026-11-13.
- **Original problem**: after the upgrade Space stays on the boot page ("正在等待上次助手退出验证"),
  shows "Runtime 退出恢复被阻止 / cleanup_unverified", and "继续验证" repeats forever. Closing the
  window triggers complete exit, which fails with "Coder Runtime exit settlement failed after its
  mutation boundary; recovery relaunch required." and relaunches into the same state.
- **Customer analysis (incorrect)**: the bundled SDK 0.7.97-beta.4 lacks `settleKodaXRuntimeExit`.
  alpha.5 never calls it (only manual text and tests mention it); beta.4 does export
  `readKodaXClientExits` and `lifecycle.requestExit`, which `settleRuntimeClientExit` uses.
- **Root cause**: `settlePublishedRuntimeExit` opens the stable client identity before any daemon
  is inspected, and startup always scans for a pending exit. `loadOrCreate` reads the identity's
  secret; for a 0.1.46 identity the secret exists only in the OS keychain, so the legacy import
  calls `keychain.getPersistentKey`. With a locked Secret Service (`IsLocked: Cannot get secret of
a locked object`, autologin without keyring unlock) it throws "OS-protected storage is required
  for the Runtime client secret" by design (no ephemeral fallback). The failure is mapped to
  `cleanup_unverified` at startup and wrapped as the generic "mutation boundary" error on exit, so
  neither the dialog nor the log showed the cause. No daemon or exit receipt was involved: the
  customer had no `~/.kodax/runtime/daemon`.
- **Evidence**: customer `auth.json` had no `space-client-identity` binding (empty `apiKeys`);
  unlocking the login keyring in seahorse let Space start; the keychain probe failure and the exit
  failure carry identical timestamps in `space-main.jsonl`. Windows is unaffected (Credential
  Manager is readable). The identity file lives in `~/.kodax/space/`, not `~/.config/KodaX Space/`.
- **Resolution (2026-11-13)**: `getPersistentKey` failures for an unavailable keychain carry
  `code: 'persistent_key_unavailable'`. `RuntimeClientIdentityStore.loadOrCreate` replaces the
  unreadable identity (new `instanceId` and secret account, same `clientId`) when no
  `exitRecovery` depends on the old secret, so a failed keyring probe no longer blocks startup
  (other keyring failure modes: see the follow-up below). Startup
  recovery blockers log `reason`/`nextAction`/message to the structured diagnostics, and complete-exit
  failures print the wrapped causes.
- **Files changed**: `apps/desktop/electron/kodax/runtime/runtime-client-identity.ts`,
  `providers/keychain.ts`, `main.ts`, `test/runtime-client-identity.test.ts`; follow-up adds
  `providers/keychain-linux.test.ts`.
- **Tests added**: replacement of a legacy identity behind a locked keychain (red before the fix);
  a pending `exitRecovery` still blocks and is not discarded.
- **Follow-up (2026-11-13, independent review)**: the first fix covered only a failed backend
  probe. Three more paths still blocked startup the same way and are now fixed:
  1. the probe succeeds but reading the item fails (locked collection, D-Bus error): the Linux
     `getPassword` failure is now wrapped as `persistent_key_unavailable` with the native error as
     `cause`;
  2. the read never answers (Secret Service waiting on an unlock prompt nobody sees): Linux keyring
     reads are bounded at 10 s and then reported the same way; the bound also covers provider-key
     reads and legacy provider-key migration checks, which previously could hang the provider list;
  3. the keyring answers but no longer holds the 0.1.46 secret (reset login keyring): the
     "secret is missing" error now carries `client_secret_missing` and is replaced under the same
     rule. This deliberately relaxes the Issue 216 guard (which kept an identity whose secret was
     missing); a pending `exitRecovery` still blocks in every case, and no ephemeral secret is ever
     minted.
     Tests: `providers/keychain-linux.test.ts` (Linux bundle: read error, hang, absent item, migration
     check) and two identity tests for the missing secret.
- **Workaround for alpha.5 users until the fix ships**: unlock the login keyring (Seahorse
  "Passwords and Keys" → right-click "Login" → Unlock, or log in with the password instead of
  autologin), then relaunch Space. Once Space has started, the secret is in `auth.json` and the
  keyring is no longer needed for the Runtime identity.
- **Side effects of replacement**: the old `runtime_client_*` keychain item is left in place
  (harmless); work of a still-running 0.1.46 Host that was owned by the old identity cannot be
  settled by the new one. Legacy 0.1.46 **provider API keys** still live in the keyring: with it
  locked they show as unavailable until it is unlocked and the provider is retried.
- **Not covered**: no active unlock prompt (`@napi-rs/keyring` has no unlock API); a pending exit
  recovery created by 0.1.46 or earlier whose secret remains in a locked keyring still blocks;
  replacement does not check for a live Host; Linux/Kylin upgrade not verified end to end.
- **Coexistence review (no code change)**: Hosts from 0.7.96 (no build identity) are older than
  beta.4+, so `firstRequiredDaemonUpgrade` takes the `runtimeVersion` refresh path (idle → managed
  replacement via `daemonManagement`; busy → attach as compatible since SDK beta.6, Issue 405).
  Other installations' Hosts are never replaced. alpha.5 (beta.4) lacks the Issue 405 fix, so
  alpha.5 with a differently built CLI cannot be repaired retroactively.

## Issue 249 — Sent prompt stays (fully or partly) in the composer when a line ends with a line break

- **Priority**: Medium.
- **Status**: Resolved in source, not released.
- **Introduced**: Space 0.1.47-alpha.5, the first release with the Lexical composer (`2e8bbd7e`).
  Reported on Windows 11; not platform specific.
- **Created**: 2026-11-13.
- **Original problem**: after sending, the prompt text remains in the composer. In the customer
  screenshot the first part of the message was cleared and the later part ("然后这一段：…") stayed.
- **Reproduction**: type `abc`, press Shift+Enter, press Enter: React `prompt` becomes `''` but the
  editor still shows `abc`. Partial residue: put a multi-line draft into an empty composer
  externally (quote insert, prefill, history, failed-send restore — one paragraph per line), then
  Shift+Enter and paste text ending with a newline, press Enter: only the last paragraph remains,
  and it flows back into `prompt`. A leading empty line also survives a send.
- **Root cause**: sending sets `prompt` to `''`; `replaceDraft('', before)` in
  `useComposerEditor.ts` selects `[0, before.length]` with `selectOffsets` and removes it.
  `selectOffsets` (`composerEditorProjection.ts`) skips `LineBreakNode`s and, when the target
  is at or before a line break that ends the block, falls back to `(block, 0, 'element')` — the
  block start. The selection collapses (single paragraph: nothing removed, editor and `prompt`
  diverge) or ends at the start of the last paragraph (that paragraph survives). The same mapping
  serves `setSelectionRange`, `insertToken`, and `deleteAutoSeparator`.
- **Resolution (2026-11-13)**: `selectOffsets` addresses a line break (or any non-text child) by
  child index: a target at or before it becomes `(block, index, 'element')`, and a target at the
  block end becomes `(block, childrenSize, 'element')`. Rebuilding the root on clear was tried and
  rejected: it dropped the selection and broke later typing and paste.
- **Fixed**: source after 0.1.47-alpha.5 (not released).
- **Files changed**: `apps/desktop/renderer/src/shell/composerEditorProjection.ts`,
  `ComposerEditor.test.ts`.
- **Tests added**: browser test "composer clears every line on send and maps offsets at trailing
  line breaks" (trailing newline, leading newline, injected multi-paragraph draft plus a pasted
  quote ending in a newline, append after a trailing line break); red before the fix.

## Issue 250 — Quit with nothing running fails while a `kodax` CLI shares the Host

- **Priority**: Medium.
- **Status**: Resolved in source, not released.
- **Introduced**: source after 0.1.47-alpha.5, when Space and the CLI began sharing the `default`
  Host (`4a28edda`, KodaX ADR-075). Observed in a local `out/win-unpacked` build with SDK
  0.7.97-beta.8 on Windows 11.
- **Created**: 2026-11-13.
- **Original problem**: with no task running and a `kodax` CLI attached, Quit reports that the
  client exit needs recovery ("Client cleanup remains unverified.") and Space does not exit.
- **Root cause**: the CLI's connection makes the exit disposition `exit-preserve-runtime`, but
  the preserve path still requested `shutdownHost: true`. The SDK then ran its full stop
  preflight (4.6–17.5 s in `daemon.log`) before refusing with `connected_clients` (KodaX
  Issue 410). Space's 15-second settlement deadline expired first, so a clean cleanup was
  reported as unverified, and the real cause was replaced by a fixed message.
- **Resolution (2026-11-13)**: the preserve path calls
  `stopSpaceOwnedRuntimeWorkForForcedExit({ preserveHost: true })`, which requests only this
  client's exit (`shutdownHost: false`); no Host stop is attempted. A blocked settlement now
  returns its own message for the recovery error. The forced-exit path still asks to stop an
  idle Host. KodaX Issue 410 makes the SDK refuse such a stop at once when a peer is connected.
- **Fixed**: source after 0.1.47-alpha.5 (not released). The SDK half (KodaX Issue 410) ships in
  Registry SDK 0.7.97-beta.9, which Space pins since 2026-11-14.
- **Files changed**: `apps/desktop/electron/kodax/runtime-host-adapter.ts`,
  `apps/desktop/electron/main.ts`, `apps/desktop/electron/test/runtime-host-adapter.test.ts`.
- **Tests added**: "preserving a shared Host requests only personal client exit and keeps a
  blocked cause" (red before the fix); the forced-exit test now asserts `shutdownHost: true`.

## Summary

- Total: 27
- Open: 1
- Ready: 4
- In Progress: 11
- Resolved, awaiting release or verification: 9
- Other (partially fixed / under investigation): 2
- High: 15
- Medium: 11
- Low: 1
- Next ready to resolve: 222
- Archived (resolved and delivered): see [ISSUES_ARCHIVED.md](ISSUES_ARCHIVED.md)
