# Issue 222 recovery verification

Date: 2026-10-16. Local Windows candidate: Space
`0.1.47-alpha.2.issue222.3` / SDK `0.7.97-alpha.6.issue222.3`.

## Cause and recurrence

The Session directory has one product writer, while `default` and `coder` name
daemon connections. Previously startup inspected only the requested profile;
an already running `default` owner therefore made the new `coder` child fail.
Sidebar metadata remained readable, but all SDK-backed historical bodies were
unavailable. A same-build daemon without the requested orphan-exit startup
policy also failed the capability gate, even though restarting that verified
idle build with the policy would be sufficient.

Space treated those failures as permanent incompatibility. Issue 060's older
recovery only recognized one exact unhealthy-daemon message, so it did not
cover cross-profile ownership, policy mismatch or a concurrent startup winner.
This incident exposed those missing cases. The earlier diagnostic-only Host
restart also omitted Space's full policy requirements; this is why health alone
was an insufficient recovery check.

## Change

- The SDK discovers the canonical shared owner, authenticates its actual
  profile/runtime, and rechecks ownership after a startup loser exits. Supported
  diagnostics retain owner profile, runtime ID/PID, capability and blockers.
  An owner still publishing its descriptor is awaited within the original
  deadline and cancellation signal, at both discovery entry points.
- Existing managed shutdown remains the authority. Live work and connected
  clients block replacement; owner identity is rechecked at both fences before
  shutdown, and the old process must exit before another writer can start.
  Same-build restart is allowed only for the explicitly requested orphan policy.
- Space keeps retryable ownership failures in automatic recovery, including
  after the first SDK startup deadline. Existing ready reconciliation restores
  the selected SDK product view. Waiting/error views display the current cause.
- Actual attachment profile survives passive reconnect and persisted client-exit
  recovery. Issue 221 deletion errors are included in the candidate as well.
- The SDK tarball is committed under `vendor/issue-222/` and pinned by lockfile
  integrity in both Space manifests. It is a local candidate, not an npm release.

## Verification

Final candidate Space full tests passed: release 93 passed / 7 skipped, Desktop 3,900 passed /
13 skipped, IPC schema 369 passed; zero failures. Main/renderer typechecks,
full lint and production build passed. See the
[regression guide](../test-guides/ISSUE_222_v0.1.47_REGRESSION_GUIDE.md) for the
acceptance paths and isolation boundaries.

Source and packaged recovery scenarios passed 2/2 each. Packaged dependency
smoke and exact SDK/tarball/native gate passed. Boot smoke measured renderer
readiness at 5,344 ms and Runtime at 26,279 ms with a deliberate 20-second hold,
preserving 122 historical child records. Packaged lifecycle tests passed 6/6,
including Stop/next input, queue/reload, canonical history/Fork/Rewind, final
client exit and protection of another connected client.

The first packaged recovery attempt used a Node installation's Host, whose
fingerprint differs from the packaged SDK after platform-resource pruning.
The guard correctly refused same-version, different-build automatic replacement.
The same-build policy fixture was corrected to use the executable's own public
SDK. This did not weaken production build/owner checks; both final scenarios
then passed, including the visible blocker and successful protected Run.

SDK checks: related regression tests 110/110 and bundled real-process recovery
1/1 passed, with full source/test typechecks. Fast tier: 2,317 passed / 44 skipped;
unit tier: 11,982 passed / 3 skipped; contract tier: 950 passed / 19 todo.
V8 coverage from the related regressions covered 39 of 42 changed executable
SDK lines (92.86%); this measures the patch, not repository-wide coverage.
The broad system run covered 82 files: 77 passed; all five failing files were
rerun against the frozen final source and valid isolated home, passing 151/151.
Those files include the full 25-case daemon CLI suite, real concurrent launcher,
52-case upgrade suite, public Session API and MCP transport suite.

The first broad SDK harness forced `KODAX_HOME`, conflicting with tests that
mock `homedir`; another trial placed HOME inside system temp and changed the
permission boundary assumptions. The authoritative unit rerun used an isolated
home outside system temp with no forced `KODAX_HOME`. A stale-launcher rejection
also occurred while source was changing during the first system run. The final
five-file rerun used frozen source and the same valid isolation. The A2A startup
fence failure was a real regression: it was independently reproduced before the
bounded descriptor wait fix, then passed, including in the full daemon suite.
MCP's temporary-port `bad port` failure also passed the final file rerun without
changing transport code. These records do not claim the initial `test:full`
command itself exited successfully.

## Review

Standards and Spec were reviewed independently. Findings about missing bundled
test wiring, actual profile lifecycle, structured diagnostics, a real active Run,
the concurrent startup winner, unpublished startup descriptor and failure-path
fixture cleanup were corrected.
Final Standards findings: 0. Final Spec findings: 0.

## Final artifacts and provenance

SDK source commit: `d45938b90eafabf5764cab4de008b057a64092c4`.
The [vendored package provenance](../../vendor/issue-222/README.md) records its
exact SHA-256 and SRI. Windows Setup is 181,101,899 bytes and Portable is
180,891,887 bytes, both below the 200 MiB package gate. Artifact SHA-256 values,
source file fingerprints and the Space source commit are recorded in
[machine evidence](issue-222-recovery-evidence.json). Packaged Main is verified
byte-for-byte against the final built Main; package metadata confirms both
candidate versions. All new shared-Host fixture profiles were removed, and no
daemon profiles remained in the explicitly isolated SDK/Space test homes.

## Scope

This verification targets Windows x64. macOS/Linux installer acceptance and an
external model/account matrix are outside this local candidate. The existing
personal Space process and its history are not replaced by the build; installer
artifacts are written to `out/issue-222`.
