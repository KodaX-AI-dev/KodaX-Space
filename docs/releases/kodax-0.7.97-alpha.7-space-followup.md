# Published alpha.7 Space consumer follow-up

Date: 2026-10-18. Space source baseline: `6ab30cd2` (`0.1.47-alpha.3`,
unpublished). SDK: exact Registry `@kodax-ai/kodax@0.7.97-alpha.7`.

## Package and completed recovery work

The Registry `alpha` tag, root/Desktop manifests, lockfile and physical installed
package agree on alpha.7. The installed package is not a development link.
`assertKodaxReleaseDependencyState` fetched the published tarball, verified its
lock integrity and compared installed/native bytes. The authority remains
`sha512-whrhfZDI7k6YH5FGwEuscyV2tE8XuFjM/LAkVV2tO9mizHqrAT7IidrqnZC21e5zsVUVtZBsvAj3rYBjdkQO7Q==`.
The Registry `latest` tag is still stable `0.7.96`; this integration intentionally
consumes `alpha`, not an inferred stable release.

Commit `abd17d42` already completed the necessary Space lifecycle adaptation:
new Hosts request `daemonLifecycle: interactive`, compatible retained Hosts keep
their lifecycle, startup is cancelled on close and late identity completion
cannot launch a Host. Startup recovery preserves the actual profile and restores
the selected view without replaying accepted input. Its packaged recovery 4/4,
lifecycle 6/6 and full 4,373-pass verification remain recorded in the
[original integration](kodax-0.7.97-alpha.7-integration.md). Those results are not
new runs or additional passes in this follow-up.

## Delta and adaptation decision

| Published SDK change                                                 | Space decision                                                                                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zombie/PID generation checks, owner changes during attachment        | SDK owns discovery and verified attachment. Keep Space's supported error handling and recovery; do not duplicate process probes or overwrite locks.                         |
| Windows targeted identity reads and bounded historical-child cleanup | Consumed through the Registry SDK. No additional Space scans, startup waits or enlarged deadlines.                                                                          |
| Interactive idle lifetime versus explicit daemon/A2A retention       | Already adapted in `abd17d42`; retain active-work and other-client protections.                                                                                             |
| Restored checkpoint view keeps the last 150 items                    | Existing Space projection accepts a window beginning with Thinking/tool. Preserve SDK order/IDs and full replacement; older query remains accessible through history pages. |
| Pending-tool EOF and canonical tool timestamps                       | Existing Product history/IPC preserves these facts. Add public consumer regressions rather than a local history reconstruction fallback.                                    |
| Queued Run publication wakes the guarded drain                       | Existing inputId/Run/queue contract is unchanged. Prior packaged queue acceptance remains applicable; Space adds no submission retry.                                       |
| Terminal Logo placement and terminal scroll handling                 | CLI/Ink implementation, not Electron UI behavior to copy. Space keeps its own frozen-history selection and scrolling.                                                       |

The installed `docs/CLIENT_CONTRACT.md` still specifies at most 150 current-view
items, 131,072 UTF-16 code units across text/tool inputs and 8,192 per field.
This is a bounded preview, not a complete transcript or a token count. A leading
Thinking/tool is therefore valid; Space must not move the start forward to the
next query or eagerly load all history to make the window look complete.

No additional production-code or capability-gate change was justified by these
checks. This follow-up changes the fixture, adds acceptance coverage and corrects
the stale alpha.6 migration/documentation entry points. Runtime, Renderer, IPC
schemas, dependency pins and the packaged application bytes are unchanged.

## Verification

The new `sdk-restored-history.spec.ts` uses the genuine installed SDK and an
isolated Windows Electron desktop with a local deterministic Provider:

- A saved turn with 55 tool checkpoints restores a 150-item window beginning
  inside the turn. After scrolling and submitting the same query text with a new
  identity, the previous answer remains in both the SDK view and the rendered
  conversation. Full history reaches the original query, contains two distinct
  inputIds and exactly 55 saved tools. The Provider receives one new request;
  public execution facts record no new tool execution.
- A final tool call with no result remains readable to EOF. Saved query,
  Thinking, cancelled tool status and original tool timestamp survive IPC and
  repeated Renderer reloads without a Provider request.

Run with:

```powershell
node scripts/e2e-run.mjs tests/e2e/sdk-restored-history.spec.ts tests/e2e/sdk-product-output.spec.ts
```

Final follow-up: **9/9 Electron cases passed** (the two new cases plus the seven
existing Product-output cases). Related migration/projection/store tests passed
**13/13**. Full `npm run typecheck`, full `npm run lint` and the focused strict
E2E TypeScript check passed. The Registry/native dependency gate also passed.
No production source changed, so this follow-up does not rebuild/repackage the
application or claim a new full `npm test` run. The original integration's
full-suite/package evidence remains separate. Test timings are acceptance
observations, not a startup performance benchmark.

## Standards

Independent read-only review of `6ab30cd2...ad99503d`: **0 hard-rule violations,
0 actionable smells**. All eight files were reviewed. The fixture forwards the
existing profile-preparation seam; the new tests use public contracts and isolated
profiles. Repository rules and the twelve smell-baseline checks were applied.

## Spec

Independent read-only review of the same range: **0 findings**. The regression
assertions preserve SDK output authority, distinct input identity and no replay.
Current results remain separate from earlier full-suite/package evidence, and
performance/cross-platform limits are explicit.

## Remaining scope

There is no additional mandatory alpha.7 API migration identified for the shared
Coder paths above. The separate optional `@kodax-ai/artifacts` package still
returns npm Registry E404 on 2026-10-18. Its standalone format backends cannot be
advertised as installed Space support; existing SDK tool/image delivery remains
separate. Model compliance with automatic visual review is also not established
by upgrading the package.

This Windows consumer qualification does not repeat SDK Linux Node 20/22 zombie
CI, qualify macOS/Linux Space installers, or establish the latency of the user's
complete rebuild/old-Host replacement path. No Space release is created here.

The [remaining qualification](kodax-0.7.97-alpha.7-qualification.md) continues
these items with exact SDK Linux CI logs, same-shell rebuild/Host-refresh
observations, a new four-platform packaged consumer gate and the independently
verified Artifact-package delivery blocker. Its results are recorded separately.
