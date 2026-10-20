# Published alpha.8 Space integration

Date: 2026-10-19. Space remains `0.1.47-alpha.3` on `main`, unpublished.
This update consumes the actual Registry package, not the adjacent SDK checkout.

Update 2026-10-20: the [alpha.9 integration](kodax-0.7.97-alpha.9-integration.md)
supersedes the current dependency, EIO publication limit and pending build-path
promotion described below. This alpha.8 record retains its original evidence.

## Dependency and delivered changes

Root/Desktop manifests, both workspace lock entries and the installed package pin
`@kodax-ai/kodax@0.7.97-alpha.8`. Official tarball SHA-512:

```text
sha512-ohn09PS/6BrV6DKdq06NtQX516wxp53j6zeo3JhOFC8Vav3xb2UL+PWEQn0wbGVz73BCoKsLTiDqM8H1MVdp8Q==
```

`assertKodaxReleaseDependencyState` verifies the SRI, all five native targets and
installed bytes against that tarball. There is no Registry `gitHead`; no source
commit equivalence is claimed. `npm ls` resolves one physical, deduplicated SDK.

Direct comparison of both published packages finds all **62 existing declaration
files byte-identical**. Windows native text/shell binaries and their manifest have
new bytes; the declared text protocol 5, shell protocol 10 and ASRT 0.0.65 remain
unchanged. All five native targets are retained and checksum-verified in the build.

| Published change                                                            | Space adaptation                                                                                                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/artifacts`, `/artifacts/client`, `/artifacts/runtime`, `/artifacts/kodax` | Present and imported from the installed package and packaged application. There is no second `@kodax-ai/artifacts` installation.                         |
| Artifact worker, DOCX browser bundle, Skill and renderer dependencies       | Preserve the relative resource tree and dependencies outside ASAR for real Node workers; restore Skill Markdown removed by Space's documentation filter. |
| Node floor `>=20.16.0`                                                      | Space's existing `>=22.12.0` requirement already satisfies it.                                                                                           |
| Existing Product/Runtime capabilities                                       | Requirements and execution authority remain unchanged. No new startup wait, history scan or business retry is added.                                     |
| Metadata-only Session admission after a body read error                     | **Not in the published alpha.8 package.** See the explicit limit below.                                                                                  |

The Artifact packaging regression was reproduced against an alpha.8 unpacked
build before the fix: `verifyArtifactSdkPackage` failed with ENOENT for
`dist/artifacts/skills/artifact-review/SKILL.md`. The same probe passes after the
file filter/unpack change. The post-package smoke now runs it on every target,
including the real Node worker, exact PNG round-trip, stale evidence rejection
and pre-aborted requests. The four new facades join the existing ASAR import gate.

## Artifact activation and authority

The public SDK's trusted extension registration and shared-Host client port are
verified in an isolated profile: nine tools load once, two explicit operations
produce exactly two completed Runs, PNG bytes survive the Host attachment channel,
no Provider request is recorded and the same Host retains ownership. The probe
disconnects the Product Client, requests normal shutdown and verifies exact exit.

Installing the SDK does not register tools into an already running user's Host.
No user extension paths, global configuration or active owner are changed by this
update. Existing `create_artifact`/`create_office_artifact`, their store, versions,
administrator policy and export paths retain their responsibilities.

To enable the optional SDK tools, the trusted Host owner must register
`registerArtifactTools` through its existing extension lifecycle, using
`executeManagedProcess` and an absolute **real Node** executable. The installed
SDK [Host instructions](../../node_modules/@kodax-ai/kodax/docs/ARTIFACT_SDK.md)
describe default/configured extension paths and `catalog.extensions()` diagnostics.
Resolve the adapter from the same installed SDK rather than the source checkout;
a packaged worker uses the physical `app.asar.unpacked` Artifact tree. Electron's
executable is not a substitute for the required Node interpreter. Updating a busy
Host must retain the ordinary shutdown/owner protections. Browser preparation is
explicit, never performed during Space startup.

The optional registration is consumer-verified, **not automatically enabled in
the personal profile**. No new Renderer Artifact execution API or local fallback
renderer is introduced. Returned evidence still requires review of actual pixels;
Run `completed` and evidence `ready` do not certify visual quality.

## Published EIO limit and recovered profile

The Registry alpha.8 runtime still calls `storage.peek` in Session admission.
Adjacent SDK commit `0f0c8293` changes this to `readActorMetadata`, but is after the
release commit and its changelog entry remains Unreleased. The bytes in npm confirm
that installing alpha.8 alone does not make an unreadable historical body harmless
to unrelated Run listing/daemon inspection. This requires a later SDK publication;
Space does not patch `node_modules` or bypass admission checks.

The same-volume quarantine of the one proven CRC-damaged Session remains in
place. Its `.crc-20261019.bak` files and salvage/manifest are retained; they are not
reintroduced as executable history or replaced by fabricated empty records.
See [original failure and recovery](space-profile-eio-2026-10-19.json). This is
application/data isolation, not hardware repair or recovery of missing bytes.

## Verification

- Official dependency/SRI/native gate: passed.
- `npm run typecheck`, `npm run lint`, `npm run build:smoke`: passed.
- `scripts/test/kodax-artifacts.test.mjs`: 3/3 passed with the real published SDK,
  including a loader that rejects renderer backend imports during Client/root
  Artifact facade startup. A pure consumer with `types: []` also compiles.
- Packaged dependency smoke: passed, including Artifact worker/PNG, all public
  facades, existing constructed-handler/Runtime workers, native resources and SQLite.
- Existing Chromium was explicitly supplied to a separate physical-package probe:
  PPTX create/open/edit/export/render/readEvidence, PDF render/readEvidence and
  HTML loaded-viewport capture/readEvidence passed. DOCX produced three candidate
  pages and returned **unverified** with its fidelity diagnostics preserved.
  No browser was downloaded; native Word/WPS fidelity was not validated.
- Final `npm test`: **4,409 tests, 4,389 passed, 20 existing platform/condition
  skips, 0 failed**. The first full pass found two stale alpha.7 assertions: the
  exact Registry pin test and the manual's current-version boundary. Both were
  corrected, focused checks passed, and the complete suite was rerun successfully.
- Packaged acceptance: **20/20 passed**, retries disabled: 13 Product-output,
  restored-history and shared-Host recovery cases; six unified-contract/complete
  exit cases; one boot check. These cover distinct repeated input intents, queue
  drain once, crash without resubmission, active-owner protection and exact exit.
- Boot with the deliberate 20-second test hold: Renderer **3,441 ms**, Runtime
  **24,393 ms**. A separate temporary copy with only that hold set to zero measured
  Renderer **3,330 ms**, Runtime **4,236 ms**; 122 historical child records stayed
  byte-identical. The temporary script was removed. These are isolated-profile,
  warm-native-cache observations, not a guarantee for every personal profile,
  a fresh native cache or replacement of an active older Host.

Exact package/build fingerprints and format results are recorded in the
[qualification evidence](kodax-0.7.97-alpha.8-evidence.json). The candidate ASAR
SHA256 is `62208a9e00711688fa2eeb71a5ac4a75e4c2f65da1e364ecb45c2310989f28e2`.

## Standards

Final independent review: **0 hard-rule violations, 0 actionable baseline
smells**. The initial long-test-callback finding was resolved by extracting named
Host shutdown/cleanup; the final main callback is 45 lines. The frozen final patch
was checked independently against AGENTS and all twelve smell-baseline rules.

## Spec

Final independent review: **0 findings, no blocker**. Registry pins, physical
resources, public consumer behavior, lazy imports and truthful activation/EIO
limits match this update. Cancellation before admission and normal disconnect
are verified; executing Artifact cancellation/disconnection is not claimed by
these new probes. Existing core queue/crash/exit coverage remains separate.

The former alpha.7 [migration audit](../research/kodax-space-sdk-alignment-audit-2026-10-18.md)
also lists older Workflow/command/Skill/plan/Memory/MCP/image/terminal projection
gaps. They are separate from alpha.8's distribution changes and are not marked
resolved by a dependency upgrade or these Artifact probes.

No Space release, publication or push is performed. Implementation is committed
on `main` as `9091c7cd`. The usable, qualified build is currently
`out-alpha8-candidate/win-unpacked/KodaX Space.exe`, on the same C: drive.
The original `out/win-unpacked` alpha.7 application is still running. Promotion
to that original path is pending its normal exit (including the tray); no live
application files or active Host are forcibly overwritten or terminated.
