# Published KodaX alpha.7 integration and Issue 222 recovery

Date: 2026-10-18. Local Windows x64 candidate: Space `0.1.47-alpha.3`,
with published Registry SDK `0.7.97-alpha.7`. Space has not been published.

## Dependency and ownership

Root and Desktop dependencies pin exactly `0.7.97-alpha.7`; the lockfile resolves
`https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.7.tgz` with
`sha512-whrhfZDI7k6YH5FGwEuscyV2tE8XuFjM/LAkVV2tO9mizHqrAT7IidrqnZC21e5zsVUVtZBsvAj3rYBjdkQO7Q==`.
The strict Registry release gate checks installed package bytes and native
authorities. Registry metadata supplies no `gitHead`; package integrity is the
publication authority. The SDK sibling checkout was not modified during this
integration. Historical local candidate-4 tarballs remain only as provenance and
real older-code upgrade fixtures.

## Space changes

SDK alpha.7 resolves the shared-owner zombie/identity race reported by Linux
release CI and bounds startup discovery. Space previously required dynamic
`daemonOrphanExit:1` from every attached Host. Alpha.7 deliberately retains
explicit persistent and A2A service Hosts, so that requirement would reject a
legitimate compatible owner and make all SDK history unavailable again.

Space now requests `daemonLifecycle: interactive` when SDK startup is allowed.
A newly created Host gets the SDK's 30-second idle grace; an existing compatible
same-installation retained Host keeps its lifecycle. The installed SDK orphan
capability gate and all other Host capability/build/ownership checks remain.
Passive reconnect preserves the actual Host profile and does not change policy.
Production complete exit still uses explicit SDK shutdown with its existing
active-work and other-client protections.

Every initialization attempt has its own AbortController. Closing Space cancels
SDK startup instead of waiting for its readiness deadline. If identity storage
returns after close, its aborted signal prevents a late Host launch. Existing
retryable failure recovery continues beyond one SDK attempt and restores the
selected SDK view. It never resubmits an input, starts a replacement Run or
replays tools to reconstruct output.

## Verification

The dependency-pin, retained-Host and startup-cancellation regressions were
observed failing before their implementation and passing after it. The final
adapter file passes 267 tests. V8 block coverage mapped through tsx source maps
covers 9/9 added executable adapter lines (100% patch coverage, not a whole-repo
coverage claim). Typechecks, lint and renderer/Main production builds passed.

Packaged dependency/native smoke and boot passed. Renderer readiness was
4,152 ms; Runtime readiness was 25,327 ms with a deliberate 20-second hold,
preserving 122 historical child records. These are acceptance observations.
Six packaged lifecycle scenarios passed: Stop/next input, canonical view/history
and Fork, queue/reload, complete exit, revision-fenced Rewind, and another-client
protection.

The recovery suite uses two genuine older SDK alpha.6 candidate-4 owner cases
(idle and active Run), an explicitly retained same-installation published owner,
and a Host crash during streaming. Missing older-tarball transitive dependencies
come from the unchanged lockfile installation without overwriting its bundled
files. Initial runs exposed missing fixture glob dependencies, a receipt reader
hardcoded to `coder`, and teardown waiting for Electron before the isolated
Host cleanup; those fixture errors were corrected without relaxing assertions. Public exit
receipt reading now uses the saved actual profile, with `coder` only as the
legacy-record default. All four packaged recovery scenarios then passed in one run (2.4 minutes),
including the real active Run held beyond the first SDK startup deadline.

The first full run passed release 93/7 skips, Desktop 3,910/13 skips with one
failure, and IPC 369. The sole failure was a loopback Provider transport failure
before the first delta in the real Product-input migration test; its public Run
outcome reported `network_error`. That entire test file passed 2/2 on focused
rerun. The transport failure's precise cause was not established; it is retained
here rather than attributed conclusively to scheduling or dismissed as a flake.
The final complete `npm test` command exited 0: release 93 passed / 7 skipped,
Desktop 3,911 passed / 13 skipped, and IPC 369 passed. Total: 4,373 passed,
20 skipped, zero failures. Full final lint and typechecks passed; no production
source changed after the verified Main build and packaged acceptance.

## Standards

Independent read-only Standards review: 0 remaining findings, including the
final fixture changes. Repository rules and all twelve smell-baseline checks
were applied to this diff.

## Spec

Independent read-only Spec review: 0 remaining findings, including retained-Host
complete-exit semantics and the saved-profile receipt correction.

## Artifacts and limits

Artifacts live under `out/sdk-alpha7`; Setup is 181,187,586 bytes and Portable is
180,977,627 bytes, both below 200 MiB. Packaging used the local Electron
distribution after confirming package/runtime version `42.5.0`, the pinned
version. Only output location and Electron distribution source differ from the
standard builder configuration; Registry, after-pack, native and product gates
remain enabled. The personal installation and prior packages were preserved.
[Machine evidence](kodax-0.7.97-alpha.7-evidence.json) seals hashes, source
fingerprints, coverage and packaged Main equality.

An active Run intentionally blocks replacement until it finishes. Newer or
incompatible Hosts, unverified ownership and conflicting same-version install
origins remain subject to SDK guards; this work does not claim all installations
can be replaced or attached automatically. Permanent incompatibility remains
visible. All historical body assertions use public SDK Product items. Windows
packaged acceptance does not qualify macOS/Linux installers or independently
repeat the SDK team's Linux release CI.

The online production dependency audit reports 20 findings (2 low, 7 moderate,
10 high, 1 critical). The critical shell-quote 1.9.0 advisory is
[GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv).
That dependency and the remaining transitive lock entries are unchanged by this
SDK upgrade; this recovery patch does not include a blanket audit fix.
