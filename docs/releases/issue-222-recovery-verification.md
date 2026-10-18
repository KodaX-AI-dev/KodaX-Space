# Issue 222 recovery verification

Historical candidate 4 record. The current published-SDK integration is recorded
[separately](kodax-0.7.97-alpha.7-integration.md); the results below describe candidate 4.

Date: 2026-10-16. Local Windows candidate: Space
`0.1.47-alpha.2.issue222.4` / SDK `0.7.97-alpha.6.issue222.4`.

## Cause and recurrence

The Session directory has one product writer, while `default` and `coder` name
daemon connections. Previously startup inspected only the requested profile;
an existing `default` owner therefore made the new `coder` child fail. Sidebar
metadata remained readable, but SDK-backed historical bodies were unavailable.
An identical-build Host without Space's requested orphan-exit policy also failed
the capability gate despite being eligible for safe idle policy refresh.

Issue 060's recovery recognized only one exact unhealthy-daemon message. It
missed cross-profile ownership, startup-policy mismatch, concurrent startup and
the real message's diagnostic suffix. The earlier diagnostic-only restart also
omitted Space's full startup requirements; health alone was insufficient.

## Change and follow-up audit

The SDK discovers/authenticates the actual shared owner, waits for descriptor
publication and rechecks a competing startup winner. Managed replacement retains
preflight, both owner fences and exact process-exit verification. Active work and
other connected clients remain protected. Space retries recoverable failures and
restores the selected SDK view, with the actual Host profile retained through
reconnect and durable exit recovery. Issue 221 deletion-error fixes remain included.

Candidate 4 also fixes missing-Host passive reconnect, temporary connection and
readiness timeout classification, permanent-error retry loops and late reconnect
results after close. SDK startup errors now carry typed retryability; socket
connect timeout carries `ETIMEDOUT`. See the
[adjacent recovery audit](issue-222-self-healing-audit.md) for all inspected
conditions, regression evidence and deliberate recovery boundaries.

## Verification

SDK related regressions passed **164/164** across six files, including actual
unreachable-owner preservation, pending-socket timeout, ownership, process exit
and capability upgrade. Bundled real-process shared-Host recovery passed **1/1**.
Full SDK source/test typechecks passed. V8 coverage covers **4/4 changed executable
lines** in this SDK follow-up since `d45938b9`; this is patch coverage, not a
repository-wide coverage claim.

The full Space test command completed with release **93 passed / 7 skipped**,
Desktop **3,904 passed / 13 skipped / 1 failed**, and IPC **369 passed**. Its only
failure was the built-in manual still naming candidate 3 after the candidate 4
version bump. That version text was corrected; the entire manual test file then
passed **10/10**, and Main was rebuilt. No functional code changed after the full
run. There are no unresolved test failures, but this record does not claim that
the initial `npm test` command itself exited successfully. Full lint, Main/renderer
typechecks and production build passed; the final manual correction also passed
focused lint.

The new packaged Host-exit regression failed against candidate 3: no replacement
ready Runtime appeared within 35 seconds. Candidate 4 passed that same scenario,
requiring a different ready Runtime ID and the same selected saved answer without
input, reclick or refresh. Both packaged recovery scenarios passed **2/2**;
the protected active Run survived beyond the first SDK startup deadline and
completed before automatic replacement and history restoration.
Packaged lifecycle tests passed **6/6**, including Stop/next input, queue/reload,
canonical history/Fork/Rewind, final-client exit and another-client protection.

Packaged dependency and exact SDK/tarball/native gates passed. Boot smoke measured
renderer readiness at **4,467 ms** and Runtime at **25,451 ms** with a deliberate
20-second hold, preserving 122 historical child records; these are acceptance
observations, not performance benchmarks. Fixtures use isolated profiles and the
executable's own public SDK. Production ownership/build guards were not relaxed.

## Standards

Independent read-only Standards review: **0 remaining findings**. Its pending
reconnect/close finding was reproduced, fixed and covered by a regression.

## Spec

Independent read-only Spec review: **0 remaining findings**. Its untyped socket
connection-timeout finding was reproduced and fixed in the SDK with a regression.

## Artifacts and provenance

SDK source commit: `bfe8f376236a55d9bff16e56c7eccab80d9cdb74`.
The [vendored package provenance](../../vendor/issue-222/README.md) records its
SHA-256/SRI. Setup is 181,185,599 bytes and Portable is 180,975,586 bytes, both
below 200 MiB. [Machine evidence](issue-222-recovery-evidence.json) records exact
source commits, source fingerprints, candidate versions and artifact hashes.
Packaged Main is checked byte-for-byte against the final built Main.

An Electron download failed with a TLS disconnect. Packaging then used the local
installed Electron distribution; both its package and runtime versions were
verified as the pinned `42.5.0`. Standard after-pack and product smoke gates ran
against the resulting package. Artifacts are under `out/issue-222`; the personal
Space installation was not replaced. These are local Windows x64 candidates,
not npm/GitHub releases or macOS/Linux installer qualification.
