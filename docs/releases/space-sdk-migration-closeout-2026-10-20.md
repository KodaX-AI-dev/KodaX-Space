# Space SDK migration closeout — 2026-10-20

Space `0.1.47-alpha.3`, exact Registry SDK `0.7.97-alpha.9`. This follow-up starts
at `21fd8431`, which includes `c83ca0f5`'s migration changes. Earlier alpha.9
qualification at `5cfb8a99` does not qualify those subsequent changes.

## Changes

- Restore the captured authorization of accepted queued inputs independently of
  the active Run. A queued input can have a different provider allowlist/lease
  and has no Run yet. The real published-SDK regression first failed with
  `credential_unavailable` after Main reconstruction, then completed after this
  repair. History contains exactly one user item with the original inputId.
- Isolate a revoked queued lease from unrelated active Run recovery. Only the
  SDK's explicit `credential_unavailable` causes an atomic withdrawal; delivery
  races remain SDK-owned conflicts. The original input is retained as a failed
  queued message with its exact identity and text, without replacement authority.
- Register nine Artifact tools and artifact-review through a separate trusted
  Host extension, preserving existing extension paths through the public CAS
  writer. Resolve the SDK shipped with Space, its public exports and physical
  unpacked workers. Electron resolves/probes real Node from the hydrated shell
  PATH; missing Node/resources remain extension diagnostics. A real Host test
  verifies failed Artifact loading still permits builtin Skills and readable
  tool history. No browser installation occurs during registration/startup.
- Builtin activation errors no longer reject ordinary input admission. Concurrent
  callers share the handled result; diagnostics retain the cause and failure
  clears the registration cache so a repaired resource can activate next time.
- Add the migration-gap suite to packaged release acceptance. This exercises
  production registration, not a test-created Artifact extension.

## Scope

| Migration seam  | Current consumer and verification                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Workflow        | Host start/rerun; a second Product Client sees the same execution                                                |
| Memory          | Host project controller, identity-based read and revision-guarded proposals                                      |
| MCP             | Shared Host status/config/tools/reload; per-server stop remains unsupported                                      |
| Skill           | Installed builtin extension visible in actual Host catalog                                                       |
| Commands/review | Host preparation/execution; prompt command body and arguments once                                               |
| Plan approval   | Full plan reaches single-review UI; approve, deny, Stop and late duplicate answers                               |
| Tool images     | Host item/attachment identity and digest checked; visible after reload without re-execution                      |
| Terminal        | SDK revision/kind/code/effectOutcome retained in typed projection                                                |
| Artifact        | Actual Electron Host registers nine tools; PNG round trip preserves exact bytes without another provider request |

The existing Issue 222 recovery contracts are qualified again against this
package: an older idle owner, protected active work beyond the first startup
deadline, an explicitly retained compatible owner, and a Host crash during
streaming. Recovery reads the selected Session through SDK product views; it
does not reconstruct local transcripts or resubmit an accepted input. Owner
identity, replacement eligibility and active-work guards remain SDK-owned.

## Verification

Qualified source commit: `32b2a4209a84ee1c02e0aba5de3a471862fd0979`, tree
`a1db52ab6f5d977b1bacd46afab2e69718b42bd2`. Subsequent closeout changes are
documentation/evidence only. See the [machine-readable evidence](space-sdk-migration-closeout-2026-10-20-evidence.json)
for exact dependency integrity, artifact hashes, build comparisons and log hashes.

| Gate                                   | Result                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Final single `npm test` run            | 4,432 tests: 4,412 passed, 20 skipped, 0 failed                                |
| Release / desktop / IPC-schema suites  | 103/110, 3,940/3,953, 369/369 passed; 7/13/0 skipped                           |
| Typecheck, lint, production build      | All passed                                                                     |
| Source migration E2E                   | 4/4 passed, no retries                                                         |
| Packaged E2E across six specs          | 24/24 passed, no retries                                                       |
| Standard `node scripts/pack.mjs --win` | Passed Registry/native/resource, Artifact worker, boot and complete-exit gates |
| Independent Standards / Spec review    | 0 / 0 residual findings                                                        |

The packaged E2E includes all four shared-Host recovery scenarios above. Its six
unified-contract/exit tests also ran during packaging and are not counted twice
in the 24-test result. E2E ran on an isolated Windows desktop using isolated
profiles and a local fixture Provider. The boot gate deliberately held startup
and preserved 122 saved child records; its held Runtime time is not an ordinary
startup performance measurement.

Artifact extension coverage is 97.33% lines / 66.67% branches / 100% functions;
builtin registration is 99.32% lines / 82.98% branches / 100% functions. These
are scoped results, not whole-repository coverage claims.

Candidate outputs are `out/KodaX-Space-Setup-0.1.47-alpha.3.exe` (205,684,979
bytes) and `out/KodaX-Space-Portable-0.1.47-alpha.3.exe` (205,475,066 bytes).
ASAR SHA-256 is `2cc8a5b10ce7d6de35eeee3e6582b5bd88f7b8dc3f8d7571ba2b97d68d2c3508`.
The Main/preload/renderer build and both physical Host extension resources
match the package in all 559 checked files. The JSON record includes SHA-256
for both executables. These are local candidates; no tag, publication or personal
installation was performed.

No changes are made to the adjacent SDK source, personal Session data or the
concurrent UI thread's files. This worktree's package qualifies this source,
not the UI thread's later changes. Linux/macOS consumer acceptance remains
with the existing cross-platform CI/release gates.

## Later UI integration

The UI thread committed `57f4286b` during qualification. The integration guard
stopped the original fast-forward attempt when it detected the changed Main
baseline. A separate merge at `5b7abc07` combined that commit with this work in
the isolated worktree, with no overlapping paths. All 31 UI-owned files remain
identical to the UI commit.

Against that combined source, typecheck, lint, production build, focused recovery
357/357 and migration E2E 4/4 passed (no E2E retries). These additional results
are recorded separately in the JSON. The full-suite and packaged results above
still qualify `32b2a420`; the candidate executables were not rebuilt with the
later UI commit. UI inclusion in a release package requires its own packaging
qualification.

## Standards

Final findings: 0. Queued recovery logs failures and continues independently;
withdrawal uses the public SDK operation, and builtin registration clears its
failed single-flight cache. No reportable repository-standard violation or
baseline smell remains.

## Spec

Final findings: 0. Review found one P2: a revoked queued lease could prevent
active Run binding recovery. The real-SDK counterexample now passes after
isolating recovery and withdrawing only explicitly unavailable authority.
Delivery races do not become successful withdrawal claims or resubmission.

Standards: 0 findings (highest: none). Spec: 0 findings (highest: none).
