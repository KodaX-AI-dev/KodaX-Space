# Published alpha.9 Space integration

Date: 2026-10-20. Space remains `0.1.47-alpha.3` on `main`, unpublished.

## Delivered change and Space adaptation

Root/Desktop manifests, lock entries and the physical installation pin the
official npm Registry `@kodax-ai/kodax@0.7.97-alpha.9`, with integrity:

```text
sha512-cw/Eh2idVD381auW3JZVNMThO0OHICLnH0H7uQTUBL62PhjX0WpkOYtxstMIPhpNQXQemAaquil/Xthlr23ipA==
```

The release dependency gate verifies installed bytes, including the five native
targets, against that exact tarball. The adjacent SDK checkout is not used.
All 84 declaration files under the SDK's `dist` are byte-identical to alpha.8;
package exports and dependency declarations are unchanged. The three Windows
native binary/manifest files have new build bytes and pass the native gate.

Alpha.9 contains both parts of the CRC/EIO repair: Run admission reads canonical
identity metadata, and initialized Actor controllers may supply their existing
admission only while retaining the durable owner fence. Live writes and trailing
saves therefore preserve the other client's `protected` exit classification.
Unreadable identity metadata remains an error; active/unknown work still blocks
Host exit. Opening an affected Session still reports its original read error.

Space retains its existing public SDK preflight, lifecycle receipts, capability
gates and error projections. No business retry, startup wait, history scan,
identity bypass or forced replacement of an active Host is added. The in-app
manual now describes alpha.9. The Artifact SDK continues to ship through the
four main-package subpaths and the already integrated physical worker resources;
there is no second Artifact package to install or automatic personal-profile
tool registration. Earlier migration audit gaps are not closed by this update.

## Published-package regression

`scripts/test/kodax-session-admission.test.mjs` calls public Runtime Run listing,
preflight and Session load with a controlled historical-body EIO. The completed
and unknown-active cases both fail with EIO against the official alpha.8 runtime
and both pass against installed alpha.9. The baseline uses an isolated extracted
tarball with the same dependency installation; it does not downgrade Space.

The checks assert zero body reads during listing/preflight, preserve active Run
and Actor blockers, retain EIO on explicit open, verify original bytes were not
changed, and reject corrupted metadata after the fault is removed. These are
consumer fault-injection tests, not a claim that the physical disk is repaired.

## Verification

Local Windows, Node 22.23.1 / Electron 42.5.0:

- Official Registry integrity and installed-byte gate: passed; one physical,
  deduplicated SDK installation, with no source link.
- Typecheck, lint and `build:smoke`: passed. Final changed-source lint and the
  two consumer fault-injection cases also pass after the test-helper cleanup.
- Complete `npm test`: **4,411 tests, 4,391 passed, 20 existing skips, 0 failed**.
- Packaged dependency/native smoke: passed, including Artifact's real Node
  worker and exact PNG round-trip, SQLite, Runtime and constructed-handler
  Workers. All **100 packaged SDK JavaScript files** match the verified install.
- Packaged E2E: **19/19 passed**, no reruns: 13 Product-output/restored-history/
  shared-Host cases and six unified-contract/lifecycle cases. Distinct repeated
  inputs remain distinct, the queue drains once, an active old owner is retained
  until safe recovery, a real streaming Host crash does not resubmit input, and
  complete exit retains another Product Client's `protected` receipt.
- Packaged boot gate: Renderer **5,089 ms**, Runtime **25,888 ms**, with its
  deliberate **20,000 ms** test hold. A temporary script with only that hold
  changed to zero measured Renderer **3,339 ms**, Runtime **4,246 ms**. Both
  preserve 122 unresolved historical child records byte-for-byte. The temporary
  script was removed. The no-hold timing is an isolated-profile observation with
  a warm native cache, not a guarantee for every personal profile or cold cache.

The qualified application is now at
`out/win-unpacked/KodaX Space.exe`, using the published alpha.9 SDK. Its Space
version stays `0.1.47-alpha.3`; this is a local build, not a new Space release.
ASAR SHA256: `13d415561bfee3ba63f0faa49d56a36e05c08da8135cc2e0d996a2b79f3a0f45`.
The old alpha.7 SDK build is retained at
`out/win-unpacked.pre-alpha9-20261020`; no running app was overwritten.

Exact results are in [machine evidence](kodax-0.7.97-alpha.9-evidence.json).
The previous SDK source qualification is separate from these published-package
and desktop results. No new Linux/macOS acceptance is claimed.

The previously quarantined Session and its `.crc-20261019.bak` files remain
isolated. No salvage bytes are promoted to canonical history, and no user data
is moved to another physical disk. No Space publication, push or tag is made.

## Standards

The independent implementation review found a missing user-manual update; it
was added without changing the published-version statement. Final source review
reports zero hard-rule violations and zero baseline smells. Its link-target
note is resolved by committing this qualification document with the evidence.
Review was static; the main thread performed the execution recorded above.

## Spec

Independent final implementation review reports zero findings. The fixed diff
retains public SDK authority, active-owner protection and conservative unreadable
metadata behavior, without new waiting or retry policy. The manuals distinguish
the published release from this local candidate. Review was static; the packaged
acceptance above supplies the execution evidence.
