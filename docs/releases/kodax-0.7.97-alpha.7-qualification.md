# alpha.7 remaining qualification

Date: 2026-10-18. Space `0.1.47-alpha.3` remains unpublished. This continues the
[consumer audit](kodax-0.7.97-alpha.7-space-followup.md); it does not replace the
earlier Registry/native/package integrity evidence.

## Additional Space input-observation fix

Commits `7d29a365` through `886841e7` fix an additional public consumer race:
`submitInput` did not hold the same admission guard as `startManagedRun`, so an
idle snapshot could retire its Session observer while acceptance was pending.
An acceptance reply also need not wait for the canonical view notification.

The guard now bridges that notification gap. Matching canonical queue/user IDs
release demand only after the adapted product view has been published, including
asynchronous image capabilities. Batched after-turn inputs and undelivered steer
inputs require the SDK's `runs.getInput` identity query: the former need not have
a separate user item, and the latter never enters the retractable queue.
Explicit dropped/withdrawn facts and submitted inputs with a confirmed terminal
Run release demand. If the current view's terminal window no longer includes a
submitted input's Run, the adapter queries that exact `runId`; absence from the
window is not evidence of termination. Active work retains its ordinary observation protection.

A lost reply, null input record or failed metadata query does not establish
rejection and never authorizes replay. Unknown demand remains conservative on
that Host; a new owner first restores its canonical view and ends the old
owner's observation demand without declaring the old input rejected. The SDK
has no same-Host admission-settlement barrier for an unknown call with no later
facts; no timeout or fabricated exactly-once claim was added to conceal that
limit. Old observer jobs are fenced against the current Runtime and observation
both before and after successful or failed asynchronous metadata reads. The
late-rejection fence is defensive hardening, not a separately reproduced defect.

Deterministic public-adapter regressions failed before the fixes for concurrent
idle retirement, acceptance-before-view delivery, lost acknowledgement, batched
input identity, dropped steer and image-projection publication. The adapter
file passed 273 tests at `886841e7` (90.36% line coverage;
branch coverage 76.42%, function coverage 78.54% for this file, not whole-project
coverage). That regression repeats 20 idle Session reads, verifies **zero input
metadata RPCs**, and verifies all 20 observers retire. No startup/history loading RPC, arbitrary sleep, mutation retry, SDK
source patch or shared-owner bypass was introduced.

The intermediate `f29b0aee` packaged Windows consumer passed **20/20 in 4.4 minutes**
without retries. Production source `ee568fbb` was then packaged
separately; two fresh-profile observations (122 preserved historical child
records each, artificial delay disabled) measured Runtime readiness at
**6,204 ms and 4,035 ms**, with Renderer readiness at 5,298 ms and 3,129 ms.
These timings are observations under the local test load, not a universal latency
guarantee or a diagnosis of the user's earlier 20-second terminal observation.

The [current four-platform consumer run](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39095484685)
uses `f10de75f`, with the production tree at `ee568fbb`. It repeats the changed
unit tests and all 20 actual packaged-app cases without retries; full baseline
unit suites and installer construction were qualified separately. It is not a
new full installer qualification. Results must not be inferred from dispatch.
Its Linux job passed all 20 packaged-app cases in 3.4 minutes, with retries
disabled. Windows passed 12 cases and failed its first ordinary input in the
queue test: the Host was ready, a health poll reported
`session.settings.updateVersioned` in flight and the Provider received no
request. That log does not establish the full write duration. Neither queued delivery nor the
observation handoff had begun. The first failure remains undiagnosed.

The `886841e7` Windows executable subsequently passed **20/20 in 4.3 minutes**,
with retries disabled. This later result does not diagnose that first CI failure.

## Stop receipt and result-stream handoff

The [Windows phase diagnostic](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39096185393)
passed four independent samples, then failed sample five after Stop. Its first
settings write took 47 ms and its first admission 397 ms; there was no new
immediate admission for `AFTER_STOP`. The [macOS x64/arm64 follow-up](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39096054925)
failed the original Stop case on both targets after ten passing cases. arm64's
attached public snapshot showed a confirmed interrupted Run, no active/queued
Run and only `HOLD_CANCEL` in the Provider request log. These failures are
preserved separately from the earlier Windows settings-write stall.

Commit `290c5fcb` fixes a deterministically reproduced Space boundary: a confirmed
terminal Stop could arrive before the old result stream settled, leaving both
RealSession's admission gate and the adapter's active-Run hint set. The public
`send` regression rejected the next input with "still accepting the current run";
the public adapter regression continued returning the old `activeRunId`.

Only a confirmed terminal receipt releases matching old admission hints. Unknown
or nonterminal receipts retain them; object/Run/Runtime comparisons protect a
successor from old Stop replies and late result completion. No input is replayed,
no SDK product item is synthesized, and no extra startup/history RPC is added.
The related adapter, queue and Stop tests pass **314/314**; Electron typecheck
and focused ESLint pass. Independent Standards and Spec reviews each report zero
findings. This proves the deterministic consumer defect, not every original CI
failure's cause.

The [new four-platform run](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39097232475)
uses diagnostic source `86d8439d` over production `290c5fcb`. It runs the original
20 packaged cases without retries, retains bounded Space-side phase logs, and
does not change the SDK or any deadlines. Linux, macOS arm64 and macOS x64 each
passed the 314 related unit cases and all 20 packaged cases without retries
(3.7, 5.4 and 5.6 minutes respectively for the application cases). The tag-only
Release job was skipped.

Windows passed nine application cases, then failed the unfinished-tool history
case before either original Stop case ran. Its first-page helper discarded the
non-ready response behind a generic "Saved history unexpectedly invalidated"
error. The original artifact is retained; its exact non-ready outcome cannot be
deduced from that generic error.

Commit `8a0de95b` corrects the test reader's explicit history contract: only an
initial page with `data_changed` may be re-read within one five-second budget,
with all result envelopes preserved. A continuation with an old revision is
never silently restarted, and a previous page without a continuation cursor is
rejected before RPC. Missing pages, `runtime_unavailable` and protocol errors
fail immediately. This is a test-fixture change, not a production recovery or
a diagnosis of the generic first failure. Eleven fixture-boundary cases pass
after a deterministic failed initial-page regression; both restored-history
cases pass against the existing `886841e7` Windows binary. Strict E2E types,
ESLint and independent Standards/Spec review pass.

The [Windows follow-up](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39098059757)
uses `75a5e75d` over `8a0de95b`, with unchanged production `290c5fcb`. It repeats
the actual packaged 20-case suite and the fixture-boundary cases without test
retries. It passed **314 related unit cases, 11 fixture-boundary cases and
20/20 actual packaged application cases** (8.8 minutes for the application
cases). The Release job was skipped. Together with the source-pinned Linux
and two macOS results above, current production `290c5fcb` has passed all four
targets. This does not erase the recorded intermittent first failures.

A new local `290c5fcb` Windows artifact passed seven of eight targeted lifecycle
and history cases, including both Stop paths. The tool/statistics case failed
with an SDK Provider network error. Its first trace and error context were
preserved. A separate diagnostic of that same case passed in 8.5 seconds; this
does not diagnose or repair the original network failure. The test Provider now
attaches its existing synthetic request/error arrays after server shutdown, so
a future first failure can distinguish missing requests from fixture errors.
No credential headers or real user conversations are recorded by that fixture.
Eight further independent tool-case diagnostic samples, each with a fresh
profile and retries disabled, passed without reproducing the network error.
They were capped at eight samples with stop-on-first-failure; their success is
not a diagnosis of the original failure.

The evidence follow-up `8c522283` also proved a reporting defect: attaching a
body to a successful test under the list reporter did not leave a file in the
upload directory. The new regression failed on the missing file. All three
existing evidence types now write separate UUID files inside the test's output
directory before attaching their paths. The 11 fixture-boundary cases, strict
types and ESLint pass, including a disk read of the complete first conflict and
later ready envelope. This changes test evidence only, not production behavior.

The same new artifact's fresh-profile boot, with the artificial daemon delay
disabled and 122 historical child records retained, measured Renderer readiness
at **3,235 ms** and Runtime readiness at **4,042 ms**. All records remained intact.
This is consistent with the earlier local 4,035 ms Runtime observation, and is
not a universal startup guarantee or a diagnosis of the intermittent CI input.

The product-view test reader now retries only the observed `HANDLER_ERROR`
whose message exactly identifies a `Session data changed during the read
boundary: <sha256>.lock` conflict, within its existing five-second read budget.
It preserves the first full error envelope. Schema/output errors, other handler
errors and successful null results fail immediately. Five boundary tests and
strict E2E typecheck pass; no input mutation or invalid history page is retried.

## SDK Linux recovery and queue race

The SDK's [CI run 39046250003](https://github.com/icetomoyo/KodaX/actions/runs/39046250003)
and [release run 39047826560](https://github.com/icetomoyo/KodaX/actions/runs/39047826560)
are successful at release-tag commit `25fa6399ada6dae0493faa221eb82174eebb9ad6`.
The downloaded job logs establish the following, rather than merely showing a
green workflow badge:

| Check                                                                          | Linux Node 20                                      | Linux Node 22                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Crash after accepted input, after tool dispatch, after recorded tool result    | All original three pass; 8,582 / 9,655 / 36,443 ms | All original three pass; 5,482 / 5,318 / 5,473 ms                         |
| Process identity, PID reuse, unreadable identity/denied probe conservatism     | `lifecycle.process-identity.test.ts`: 19/19        | 19/19                                                                     |
| Actual unreaped zombie, shared storage and exit recovery                       | `process.owner-exit.test.ts`: 10/10, no skips      | 10/10, no skips                                                           |
| Temporary attachment close, owner revalidation, original deadline/cancellation | `sdk-runtime-daemon-upgrade.test.ts`: 81/81        | 81/81                                                                     |
| Shared-owner discovery semantics                                               | `state.test.ts`: 61 pass, one Windows-only skip    | Covered by the identity/owner suites above; no separate state-suite claim |

The zombie case is Linux-only and deliberately leaves its PID unreaped while
checking discovery, health and exit behavior. The attachment cases include
closing a stale connection, re-reading ownership, not extending the original
deadline, and cancellation after connection close. These are upstream SDK
regressions, not Space implementations of process probing.

The deterministic queue-publication cases are in
[`sdk-runtime.test.ts`](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/src/sdk-runtime.test.ts#L8402):
`start` and `after_turn` both finish the predecessor while goal binding holds
the next admission before publication. The Node 20 unit log reports 303 pass /
two skip for that file; the two conditional skips in this source are Windows
cases, not these queue cases. Space's separate packaged queue/reload/Stop test
passes through its ordinary public consumer path. That consumer test does not
pretend to force the SDK's private goal-binding interleaving.

These results establish the release source's CI coverage. npm metadata has no
`gitHead`; the Registry tarball's verified SRI and installed-byte checks remain
separate evidence, not a fabricated Registry-to-Git cryptographic attestation.

## Windows consumer and startup observations

The genuine installed alpha.7 SDK, with the existing packaged Space executable
under `out/sdk-alpha7`, passed **20/20 cases in one run, with retries disabled**.
The suite covers Renderer boot, all seven Product-output cases, both restored
history cases, six lifecycle cases and all four shared-Host recovery cases.
It includes active-work protection across the first startup deadline, retained
Host attachment, streaming crash recovery, distinct repeated input identities,
no accepted-input resubmission, and no saved-tool replay.

Two separate packaged boot observations disabled the fixture's deliberate
20-second daemon hold. Each used a fresh isolated profile containing 122
unresolved historical child records. The records remained byte-for-byte intact:

| Observation | Renderer ready | Runtime initialized |
| ----------- | -------------- | ------------------- |
| First       | 3,334 ms       | 4,142 ms            |
| Second      | 3,236 ms       | 4,141 ms            |

These are measured observations, not a new universal latency guarantee. The
original smoke's deterministic hold and its assertions remain unchanged.

A separate private installation exercised the published SDK with 3,002 saved
Sessions (including 50 large unrelated histories). One PowerShell process
stayed alive throughout, resolving the same private `kodax.ps1` before and
after `npm link`. Its first public client connection and two selected history
reads took 1,502 ms. While that owner was still alive, the private installation's
build fingerprint changed and `npm link` ran again. The next connection changed
Runtime/PID and restored both histories in 5,698 ms. A third connection reused
that replacement Runtime in 610 ms. The final private daemon stop succeeded.
Only private temporary files and a private npm prefix were changed.

This measures shim resolution and the public Host/history attachment path,
not full TUI render readiness or `npm run build` compilation time. It establishes
that this same-shell path does not need a terminal restart. An old terminal
can still select a different Node/npm prefix through its inherited PATH, and
an existing Host has code loaded in its own process. Without the user's old
PATH/owner evidence, neither is retroactively proven to be the sole cause of
the earlier observation.

An earlier two-ConPTY experiment reached apparent composer readiness in
8.5–9.2 seconds, but one child needed forced teardown and node-pty reported
`AttachConsole failed`. That experiment is retained as **not fully passed**;
its readiness heuristic/exit behavior is not substituted for the successful
public attachment and packaged UI checks above.

## Space platform gate

The installer workflow now launches the actual packaged binary on Windows,
Linux, macOS x64 and macOS arm64. The previous Linux Renderer step launched the
source fixture because it never supplied `SPACE_E2E_EXECUTABLE`.

The gate supplies each platform's real executable, a Linux D-Bus Secret Service
and Xvfb, and runs the same 20 cases with `--retries=0`. macOS fixtures now use
one physical temporary profile path; their SDK module path uses the app's
`Contents/Resources`. Credential cleanup resolves both sides of the temp path,
retaining its profile-prefix and account-ownership checks. A public cleanup
regression failed before that fix and passes after it (4/4 cleanup cases).

The [manual qualification run](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39090294249)
uses source `2bc01b0e` on `codex/alpha7-space-qualification`. Linux passed the
full unit suite, installer construction and packaged dependency smoke, then
failed before executing an E2E case: D-Bus did not preserve the exported shell
function (`run_acceptance: command not found`). This is a failed wrapper run,
not a Linux Runtime test failure or a passed qualification.

Commit `a95cbc3f` replaces that function with explicit argument forwarding.
The [Linux-only follow-up](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39091399878)
uses `847f0392`, whose only difference from `a95cbc3f` is its Linux-only workflow
matrix. It repeats every gate, including the full unit suite. The production
workflow retains all four targets. This follow-up passed its full unit suite,
installer construction, packaged dependency smoke and **20/20 packaged E2E cases
in 4.1 minutes, with retries disabled**.
Two earlier runs were explicitly cancelled after review found the macOS fixture
path issues; they are not acceptance results.
Manual branch dispatch cannot enter the tag-only Release job, and the packer
continues using `-p never`.

The initial Windows CI job passed 16 cases and failed four. Three observed a
first input before a Run/reply existed; the fourth read an `unknown` cleanup
receipt after complete exit with a peer connected. These original failures and
their [traces](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39090294249/artifacts/12123009083)
remain evidence; local 20/20 does not erase them. Their causes are still under
investigation.

The [macOS first-failure diagnostic](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39092027331)
passed all Renderer/preload assertions and closed Electron by 17.5 seconds from
the trace origin, then timed out during fixture cleanup. A separate corrected
[cross-process probe](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39093045237)
created a credential in Electron in 1,888 ms; deleting it through Node's native
keyring call exceeded 15 seconds, while `/usr/bin/security delete-generic-password`
deleted that same item in 29 ms. The earlier probe run `39092912444` used an
incorrect Electron module import and is not credential-failure evidence.

Commit `91c9b006` changes only test cleanup: macOS deletes the exact validated
test service/account through the system command, bounded to five seconds.
Missing items are tolerated; permission/time-out errors propagate and preserve
the profile's ownership evidence. Six cleanup tests pass (92% line, 83.78%
branch, 100% function coverage). No production credential ACL, Host liveness
assertion or startup deadline changes. Subsequent macOS qualification advanced
past this cleanup hang.

The [same-binary follow-up](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39093226383)
also read the Electron-created credential after app exit in 154 ms by running
that same executable in Node mode. Commit `7685665b` uses this existing OS
authorization for the test's public offline exit-receipt reader. It neither
exports a credential through Renderer IPC nor expands the credential's ACL.
The [full macOS x64/arm64 qualification](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39093390590)
uses `4675b96b`, whose only difference from `7685665b` is its two-target workflow
matrix; it retains the complete unit/build/smoke/E2E gates. Commits `450675d4`
and `11cd75dd` additionally preserve original launch/Renderer errors together
with any cleanup failure through `AggregateError`; they do not alter success
paths. The temporary stage probes remain confined to the diagnostic branch.

That full macOS run subsequently failed on arm64's product-view read (6 cases
passed) and x64's restored-history read (9 cases passed). Their first failures
remain recorded. A later arm64 diagnostic passed the original product case but
found an independent test-only offline receipt-reader error: Playwright's
process dispatcher had already been released when `app.process()` was called.
Commit `0f491ab4` captures the creator executable while the app is alive and
uses that retained path after exit. This does not change production keychain
permissions, Host lifecycle or shutdown results. The corrected
[macOS targeted run](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39095816440)
passed both the original product case and complete-exit receipt read, without
retries. It does not explain the original Windows unknown cleanup receipt.

The [Windows focused diagnostic](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39095329899)
passed both its long-body input and peer-exit cases without retries. This does
not explain the earlier input stalls or unknown cleanup receipt; they remain
unresolved first-failure evidence. Diagnostic setup attempts that stopped at
an invalid interrupt fixture, missing platform packaging environment, or an
installer-only smoke check against an unpacked directory executed no relevant
acceptance cases and are not counted as product failures or passes.

This gate checks installer construction, packaged dependencies and the actual
packaged application. It does not exercise a human installer wizard, OS signing
or notarization prompts, every model, or every end-user machine configuration.

## Old Windows installation ownership conflict (2026-10-19)

The user's `out/win-unpacked/resources/app.asar` is still Space alpha.2 with
SDK alpha.6, written on October 16. Its October 19 15:30:20 +08:00 diagnostic
reports `Runtime daemon child exited before becoming healthy (code 1)`;
the coder bootstrap tail reports `Session storage already has a product Host`.
The original failing owner's identity/profile was not preserved and is not
inferred from a later, absent owner lock.

An isolated public-SDK comparison extracted alpha.6 code from that archive.
With a persistent default-profile Host still connected, alpha.6's coder ensure
reproduces the same code 1 and storage-owner error. Installed alpha.7 instead
attaches to the existing default Host in 579 ms, retaining its PID/runtimeId.
Both isolated owners were shut down successfully afterward. No input, tool or
Provider request was submitted, and no real user data or owner was changed.
The declared dependencies match across those SDK versions and were resolved
from the installed dependency tree for the extracted-code comparison.

This verifies the matching ownership-conflict mechanism, not every daemon
exit-code-1 cause or the identity of the original owner. It does not establish
a general startup latency or replace acceptance of the rebuilt Space installer.
Updating a repository/global CLI cannot update the old app.asar's embedded SDK.
See the [sanitized comparison evidence](space-alpha2-owner-conflict-2026-10-19.json).

## Independent Artifact SDK

The public Registry still returns HTTP 404 for `@kodax-ai/artifacts`, including
the source-declared alpha.7 version. The installed root package has no Artifact
SDK export or implementation. See the
[delivery investigation](../research/kodax-alpha7-artifact-delivery-readiness-2026-10-18.md)
for exact API/source/Registry evidence and the required upstream delivery.

Space's existing Artifact tool, PNG preview and published SDK attachment checks
remain separate, exercised behavior. They do not prove the unavailable package's
nine operations or independent PPTX/PDF/DOCX/HTML/SMIL renderer backends.
No local SDK copy, invented capability, bypass of shared ownership or direct
Renderer access to Host evidence files was added to hide this blocker.

## Remaining closure conditions

Current production passes the four packaged application targets, but this task
is not fully closed and no Space release has been made. The independent Artifact
SDK needs an actual public package/export from upstream. Earlier intermittent
Windows first-input and local Provider-network failures remain cause-unconfirmed;
their preserved first evidence must not be replaced by the later passing runs.
The qualification Registry recheck at 2026-10-18 05:00:50 UTC reports SDK alpha.7,
stable 0.7.96, and HTTP 404 for the independent Artifact package. A separate
[publication recheck](../research/kodax-sdk-public-delivery-recheck-2026-10-18.md)
at 09:26–09:31 UTC confirms the same public versions, verifies the installed
SDK/native files against the official tarball again, and finds no independent
Artifact package, main-package subpath or embedded implementation. The other
thread's installation remains alpha.7. No production or dependency change was
needed for this recheck; the first-failure closure conditions above remain open.

## Standards

Independent read-only review found **0 hard-rule violations and 0 actionable
smells** in the final input-observation and offline-reader changes. The review
applied repository rules and the twelve smell-baseline checks. Earlier function
length findings were corrected by extracting focused test fixtures.

## Spec

Independent read-only review found **0 residual findings** in those changes.
The review closed the acceptance/view handoff, input terminal reconciliation and
asynchronous publication issues. These conclusions concern the patch's contract
implementation; they do not substitute for pending platform acceptance or explain
the previously recorded intermittent Windows first failures.

## Real-profile Windows EIO after the preview build (2026-10-19)

The local alpha.3/SDK alpha.7 unpacked preview passed the isolated packaged
checks, then failed on the user's real profile at 08:47:57 UTC with
`RuntimeDaemonTransportError`, `internal_error`, `EIO: i/o error, read`.
The Host was already ready. Passive connection, catalog, limited Session
listing and Workflow/interaction reads succeeded; `runs.list` and
`daemon.inspect` failed reproducibly. Those earlier packaged passes do not
close this incident or establish readiness of the real profile.

The failure is a full-body read of historical VideoWorks Session
`20260914_084034_oz884c2d160c23`. Independent Node and native Windows reads
fail after 512 KiB; Windows reports `0x80070017` (CRC). Its 76,170-byte
metadata line is readable. New `disk` Event 7 records name Disk 0 during
these reads. Current C: maps to the KINGSTON NVMe on Disk 0, whose general
health reports `Healthy`; the user confirms whole-disk cloning from the
previous faulty disk. The replacement SSD's physical failure is **not**
established: cloned bad-cluster state, media and storage-stack faults still
need distinguishing, and low-level health/bad-cluster inspection was denied
to the current process. No repair, destructive scan or Session deletion ran.

The SDK failure propagation is separately fixed in KodaX branch `KodaX`,
commit `0f0c8293`: Run-list admission reads stable canonical identity
metadata, rather than whole historical transcripts. Unreadable metadata
still fails closed, active/unknown Runs and Actor turns remain blockers,
and explicitly loading the affected Session still reports body EIO. The
whole-body admission path predates alpha.7 (`5f482f6e`, 2026-08-01).
The new public-interface regression failed before the fix; 41 focused Windows
tests, both typechecks, bundle/declaration builds and independent Standards
and Spec reviews passed. No Linux or new packaged qualification is claimed
for this patch.

The SDK fix is **not installed in the current Space unpacked preview or its
running Host**. Keep release blocked and preserve the original Session and
current build while backup/storage status is unresolved. See the
[sanitized incident evidence](space-profile-eio-2026-10-19.json). No inputs
or tools were submitted and no live owner was stopped during diagnosis.
