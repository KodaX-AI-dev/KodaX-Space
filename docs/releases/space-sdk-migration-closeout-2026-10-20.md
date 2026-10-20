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

## Verification

Final test/build/package evidence will be recorded after the qualification run.
The focused recovery suite passed 357/357. Artifact extension coverage is
97.33% lines / 66.67% branches; builtin registration is 99.32% lines / 82.98%
branches. These are scoped results, not whole-repository coverage claims.
No changes are made to the adjacent SDK source, personal Session data or the
concurrent UI thread's files. This worktree's package qualifies this source,
not the UI thread's uncommitted work. Linux/macOS consumer acceptance remains
with the existing cross-platform CI/release gates.

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
