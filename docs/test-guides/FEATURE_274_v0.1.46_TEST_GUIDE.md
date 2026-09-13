# Space / KodaX 0.7.96-rc.3 alignment

Baseline: Space 0.1.46-alpha.11 source, exact Registry SDK 0.7.96-rc.3. Scope is the
beta.7–rc.3 increment applicable to Space, not every previously planned SDK UX.
The package SRI is
`sha512-0oQg2QtGwqpY82IOfckFPba9UdK1haV+/Y3Wpz2ED9OuZlNwdcnjUvFn8LEsnTt/GrgIlz5BABGXQbuFT4O53Q==`.

## Acceptance requirements

- A ready daemon must advertise `sessionCancellation:1` with a durable frontier
  and `toolInvocation:1`. SDK execution-connection fencing owns safe old-owner
  replacement. Space validates the connected capabilities and adds no private
  daemon recovery manager. The rc.2 Run-only Session Stop fallback is removed.
- Session Stop uses one
  `sessions.cancel({ sessionId, expectedRunId, requestId })` operation. The owner
  fixes its durable queue frontier; later submissions survive. Transport retries
  retain the same identity and Run binding. Accepted requests replay after their
  Run becomes terminal; a stale first request rejects with
  `conflict / stale_run / retryable:false`. Space recognizes both direct facts and
  daemon facts under `error.data`, settles that rejection as a no-op, and never
  substitutes a successor. Preserve every returned receipt; unknown is not stopped.
  No client acceptance ledger or new replay API is required. Narrow Run cleanup,
  redirection and forced-exit ownership still use `runs.abort`.
- Resolve managed extension commands from the owner catalog. Canonical names and
  aliases route to `extension_command__<name>` using `toolInvocation`; `!command`
  routes to `bash` with the original command text. Both use ordinary Run settings,
  credentials, permissions, events, history, cancellation and operation identity.
  `runLifecycleControl` is not a substitute for `toolInvocation:1`. Space requires
  an idle Session for explicit commands; the Runtime owns raced admission.
- `/repair-identity <source-entry> <target-entry> <revision> <run> <input> <event>
  <confirmation-ref>` is an explicit Coder repair operation. Forward original
  delivery proof and expected revision for SDK validation/audit. Never infer
  aliases or retry a changed revision. Clear history caches after success.
- Preserve permission authority v6, native text/image results, local-execution
  error facts, interrupt provenance and large-metadata paging from the SDK.

## Scope and earlier corrections

rc.2 fixed stale first-request cancellation inside the existing API; it did not
advertise Session cancellation or explicit tool invocation on the daemon. rc.3
makes those existing public contracts available there. The prior proposal for a
new replay-only or request-status API remains withdrawn. Space's incorrect
inference from lifecycle receipts to explicit-tool support was its own bug and
was corrected before this upgrade; it must not return.

Configuration-only extension commands remain excluded from Space's executable
catalog. They run in the extension host without a Session Run, and no concrete
new desktop requirement has been established. Trusted project Exec Policy is an
owner-bootstrap input with an existing SDK creation API, not a missing client
connection option. Neither is an additional SDK repair request.

## rc.3 verification (2026-09-13)

- Final `npm test`: 3385 passed, 5 skipped, 0 failed (62 release contracts,
  3005 Desktop tests passed, 318 IPC schema tests). Type checking, source lint,
  formatting of changed code and `build:smoke` pass. The 8 added store regressions
  use the real public history shape and cover explicit tool identity, replay,
  ambiguous/mixed ownership and preservation of late unmatched work.
- `node --test scripts/test/kodax-daemon-control.test.mjs` passes against the
  installed, published Registry package and a real isolated daemon. It verifies
  advertised capabilities, explicit write/bash execution, cancellation of the
  active and already queued Runs, original-request replay, rejection of a new
  stale request, and survival of a later successor. No real model is required for
  these deterministic tool/control checks.
- Space handles stale rejection nested in daemon `error.data`, requires both
  connected capabilities, and removes the rc.2 Session Stop downgrade. The SDK's
  existing connection fence handles execution-owner version compatibility.
- Upstream source tests (9 files, 141 tests) are separate source-level evidence;
  they do not replace the installed-package daemon test above.
- Windows packaging passes the exact Registry bytes/integrity gate, native/Worker
  probes, packaged boot and complete exit (two clean product exits and restored
  Session history).
- A real isolated rc.2 idle daemon was replaced by rc.3 through the existing SDK
  execution connection: new PID/Runtime identity, both capabilities available,
  old PID exited. No user profile or Space recovery code was involved.
- Packaged live DeepSeek checks pass real response, explicit shell execution,
  UI Stop, an actual pending-request retry while a successor survives, two native
  children reading PNG/writing their files, and history after renderer reload.
  Blue-PNG accuracy still fails: initial samples blue/red and blue/white; the
  final rebuilt package reports white/white. All six child turns completed;
  this is not the original agent crash.
  Preserve these samples in `artifacts/rc3-live-initial` and
  `artifacts/rc3-live-identity-repro`; do not report overall live acceptance passed.
- The second live sample exposes a Space projection defect: the same exact tool
  UUID appears in canonical and live renderer rows. SDK history is resolved and
  correctly ordered; explicit execution is documented to skip a model turn, so
  absent `turnId` is valid. Space now uses the existing tool identity to match its
  unique canonical input boundary and reuse the existing display merge. It does
  not manufacture a retirement receipt or request a new SDK interface. The live harness now checks input/tool uniqueness and order both
  before and after reload.
- The final rebuilt Windows package passes that added ownership check: exactly
  one explicit input and one tool output in original order, before the successor,
  both before and after reload. The new screenshot also visibly confirms the fix.
  Final report: `artifacts/sdk-live-acceptance/report.json` (SDK rc.3,
  seven execution/display checks passed, no renderer errors, overall `passed:false`
  solely because the two blue-PNG color answers are white). The underlying image
  accuracy issue remains unassigned; these answers alone do not prove another SDK
  interface gap. Earlier wire-byte investigations remain below.

### Standards review

0 hard violations and 0 actionable smells against the `07bb75e8` baseline.
The change removes the rc.2 fallback and reuses capability checks and history
projection; it adds no recovery manager, configuration surface or private SDK state.

### Spec review

0 actionable findings against F274 and the identity-preserving FEATURE_275
requirements. The extra explicit-command display repair is justified by the real
packaged duplicate-row evidence and uses existing public identity. It does not
invent physical retirement authority. Both review axes completed with no open finding.

## Desktop acceptance procedure

Run `node --import tsx e2e/sdk-live-acceptance.mjs` after building the rc.3 Windows
package. Use its fresh isolated profile, real executable and existing credential
passed only in memory. Verify:

1. Real provider response and canonical history, followed by a successful explicit
   shell command with tool output and a completed Run.
2. UI Stop during execution, including the original pending Stop retry when
   available. A new requestId bound to an old terminal Run must settle as stale
   without stopping the successor; it is not accepted-request replay.
3. Two native children independently read the PNG and write their outputs; check
   Actor/tool facts and file contents, then reload and verify history restoration.
   Preserve incorrect color samples without attributing a model/transport defect
   solely from the child's prose.
4. Packaged native/Worker checks, boot and complete-exit smokes.
5. The explicit input and its tool output each appear once, before their
   successor, both before and after renderer reload.

## Verification result (2026-09-12)

- Registry `latest` is `0.7.96-rc.1`; the installed SDK passes the locked Registry
  release integrity gate.
- Full `npm test`: 3372 passed, 5 skipped, 0 failed (60 release contracts,
  2994 Desktop tests passed, 318 IPC schema tests).
- Type checking, source lint excluding existing `scratch/**` review copies,
  and `build:smoke` passed. The final pending-request UI also passed its focused
  tests, renderer type checking, lint and renderer build.
- Standards and Spec reviews completed; the Space findings were corrected.
  This historical review overstated two mandatory API gaps; the corrected scope
  and the separate daemon capability boundary are recorded above.
- Live DeepSeek and packaged-desktop acceptance were not executed in this run.

## rc.2 verification (2026-09-13)

- Before upgrade, the original isolated rc.1 probe failed: stopping terminal A
  with a previously unseen requestId aborted running successor B.
- With rc.2, the same scenario rejects with `conflict / stale_run / retryable:false`;
  B completes normally. The published-package regression now locks this behavior.
- Installed SDK controls and multimodal regressions: 10 passed, including accepted
  Stop replay, managed extension execution, child PNG delivery and local errors.
- Space regressions prove unconfirmed terminal retries reach the owner, stale
  rejection settles without retargeting, unrelated errors propagate, and daemon
  exact-Run retries return terminal receipts.
- Real isolated daemon connection confirms version rc.2 and the capability boundary
  above. At this stage live DeepSeek and packaged-desktop acceptance had not yet
  been executed; the subsequent live acceptance is recorded below.
- Full `npm test`: 3374 passed, 5 skipped, 0 failed (61 release contracts,
  2995 Desktop tests passed, 318 IPC schema tests).
- Final type checking, source lint, `build:smoke` and the final main-process build
  passed. Root and Desktop resolve one deduplicated rc.2 package; the installed
  bytes pass the locked Registry release integrity gate.
- Standards review: 0 remaining findings after shortening the Stop method and
  correcting the manual. Spec review: 0 actionable findings.

## Historical rc.2 packaged live acceptance (2026-09-13)

The rc.2 run used `node --import tsx e2e/rc2-live-acceptance.mjs` after building
the Windows package. The current harness is `e2e/sdk-live-acceptance.mjs`.
The opt-in harness launches the real executable with mock disabled,
a fresh isolated profile and the existing DeepSeek credential passed only in
memory. It checks the running daemon version, uses real `deepseek-flash` calls,
clicks UI Stop and the pending retry button when available, verifies canonical
Run/Actor state and files, and captures screenshots before profile cleanup.

The first real run exposed an incorrect Space capability inference: daemon
`runLifecycleControl:1` was treated as sufficient for explicit `toolInvocation`.
The SDK rejects `!command` before admission. Space now requires the actual
`toolInvocation:1` capability. This does not make daemon explicit commands
available; normal model-directed tool use remains the supported path.

Evidence is written to `artifacts/rc2-live-acceptance/report.json` and PNGs in
that directory. Both native children must have completed `read` and `write`
activities, and each file must contain `PNG_READ_OK` and identify the blue PNG.
The checks do not accept a parent's claim or a user-message echo as completion.

Observed results:

- The packaged rc.2 executable completed real DeepSeek calls, UI Stop, and an
  actual pending-Stop retry button click while a successor was active. The button
  cleared and the successor completed. Two native children independently executed
  `read` then `write`, with completed Actor turns and output files.
- Visual interpretation is not consistently correct: in session
  `20260913_141339_pbe9b103b3ee61`, `image_a` identified the blue PNG correctly,
  while `image_b` wrote `green`. That run remains a failed visual acceptance,
  retained in `artifacts/rc2-live-acceptance/image-color-failure.json`. No child
  crashed. The evidence does not yet distinguish provider interpretation from
  image transport; do not infer reliable vision from completed tool calls.
- The harness still fails on an incorrect color, but checks renderer reload before
  reporting that failure so a vision error does not hide the persistence result.
- Full Windows packaging passed native/asar Worker checks, cold boot, two complete
  product exits and Session history restoration. The dedicated exit smoke covers
  production shutdown; the live fixture uses its existing isolated cleanup path.
- Adapter/manual regressions: 261 passed, 0 failed. Type checking and affected-file
  lint passed. The capability regression failed before the guard fix and passed
  afterward.
- Final run `20260913_141644_39378a6cd11d5c`: all five execution/persistence checks
  passed (real response, UI Stop, retry preserving the successor, two native child
  read/write turns, renderer reload); no renderer page errors. Explicit-command
  rejection before admission also passed. Visual acceptance failed again:
  `image_a` wrote purple and `image_b` wrote green. The retained `sample.png` is
  blue on independent inspection. Overall `report.passed` remains `false`.
- A fresh run of the seven installed-SDK multimodal contract tests passed. Those
  tests prove native image-block fidelity to the Provider interface, not the
  correctness of real provider wire delivery or visual interpretation. Further
  attribution of the live vision discrepancy remains open.

## Historical rc.2 follow-up attribution checks (2026-09-13)

The retained PNG is 165 bytes, SHA-256
`8fe50d4ede83760a7f7126f87ab94103b282417c2c660472d611865c9d706210`.
An isolated fetch-boundary probe inspected serialized requests without recording
credentials. Direct user images and images nested in `tool_result` both become
Anthropic base64 image blocks containing exactly these bytes.

Live checks against `https://api.deepseek.com/anthropic/v1/messages`:

- Three direct HTTP calls returned blue.
- SDK Provider, managed root `read`, and native child `read` returned blue, with
  matching image hashes in the actual outgoing requests.
- Repeating with AMA and `effort:minimal` retained the same image bytes. The SDK
  maps minimal to `thinking:disabled`; a raw HTTP `output_config.effort:minimal`
  is invalid and is not the request Space/SDK sends.
- The original two-child read/write objective through the SDK completed. Every
  outgoing image matched the PNG hash. The outputs said blue and light blue;
  the latter is an inaccurate shade description despite correct image bytes.
- A fresh packaged-desktop Session also completed both child read/write turns,
  both outputs said blue, and reload passed. The attempted preload observer was
  not loaded by that package, so this run does not prove packaged HTTP payloads.
  Wire-byte evidence above belongs to the isolated SDK runs.

These checks do not reproduce or explain the earlier green/purple outputs under
the same failing desktop history. Keep those failed samples; no Space image
transformation fix or SDK vision defect is established. Evidence remains in
`artifacts/rc2-live-acceptance/{wire-probe,wire-probe-minimal,vision-compare,vision-compare-minimal,vision-compare-fanout}.json`
and `artifacts/rc2-daemon-vision/report.json`.

A new isolated daemon independently reported rc.2, no `sessionCancellation` or
`toolInvocation`, and `runLifecycleControl:1`. Using a real created Session,
`runs.start({options:{toolInvocation:...}})` and `sessions.cancel(...)` both rejected
with `client_upgrade_required` before dispatch. Published code contains the
`session.cancel` schema/handler and the explicit invocation option; inline
`createKodaXRuntime` advertises both capabilities, while `runtimeDaemonCapabilities`
does not include them by default. This points to an existing daemon capability
exposure/alignment gap, not a need to design new APIs. The SDK fix must verify
actual daemon execution/cancellation before advertising support; adding flags
alone is not acceptance. Space must retain its honest capability gate meanwhile.
