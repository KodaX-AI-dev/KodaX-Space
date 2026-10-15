# Issue 219 — Sidebar Session activity and recency

## Registry alpha.6 update (2026-10-15)

SDK `lastMessageAt`, when present, now owns conversation recency even if it precedes
the Session creation time. Main preserves it for persisted and resumed Sessions;
the renderer accepts the same fact from a Runtime profile and retains it across
list refreshes. Metadata and recovery activity cannot advance it. Actual local
input time is retained independently for the same Session/project/surface.
The Runtime compensation described below remains the legacy fallback when the
SDK supplies no message-time fact. See [current qualification](../releases/kodax-0.7.97-alpha.6-integration.md).

The real-SDK `session-empty-records.spec.ts` test seeds an older continued Session
and a newer Session with older messages; both public IPC order and sidebar order
must follow message time across two reloads. Public store/IPC regressions also
cover resumed Sessions, profile-first arrival, and a send before the first canonical refresh.

## Required behavior

- A known Coder Session outside Runtime's default 50-summary page must use its
  available Run timestamps, including completed, failed and cancelled Runs.
- Correct both the sidebar time and recency ordering. A later list refresh must
  not replace a newer known activity timestamp with the creation timestamp.
- Activity evidence must not create Session rows, grant live authority, start
  observations, cross into Partner, or override project/surface metadata.
- Reuse the existing Runtime status response and summary cache. Do not add SDK
  calls, per-Session Run queries, transcript reads, filesystem scans or increase
  existing list/Run limits for this repair.

## Automated checks

Run from the repository root:

```powershell
npm run build -w @kodax-space/space-ipc-schema
node --test --test-force-exit --import tsx apps/desktop/electron/kodax/runtime/coder-daemon-projection.activity.test.ts apps/desktop/electron/ipc/session.activity.test.ts apps/desktop/renderer/src/store/runtimeSessionActivity.test.ts
```

The IPC regression warms the real Space summary cache with an injected SDK and
refreshes after activity changes. The SDK list call count must stay at one;
transcript reads and observation queries must remain zero. The projection test
uses a 50-summary page that omits the completed Session and verifies that it
stays outside the live profile while its sidebar timestamp is repaired.

## Desktop check

Use an isolated `KODAX_PROFILE_DIR`, never an automated test against user data.

1. Seed over 50 Sessions, including an old Coder Session with a recent terminal
   Run in the bounded Runtime window and a newer idle Session in the same project.
2. Open the project with recency sorting and no pinned rows. The old Session must
   show recent activity and appear above the newer idle Session.
3. Refresh/reload and restart with the same recent Run still available. Verify
   that the timestamp and ordering survive Runtime/list startup in either order.
4. Finish another Run on the old Session. Its activity must remain recent after
   completion without an active spinner or background observation bootstrap.
5. Switch projects and Coder/Partner. Titles, grouping, removal and surface
   ownership must behave as before. Opening a Session alone must not bump time.

## Scope

This change does not reconstruct all historical activity. If both the bounded
Runtime window and the current renderer have no activity evidence after a cold
start, the existing creation-time fallback remains. No durable activity index or
full-history backfill is introduced. Packaged-app checks remain a release gate.

## Source verification (2026-09-28)

- Activity and related Runtime/list/cache/renderer regressions: 158 passed.
- Complete IPC schema suite: 362 passed.
- Renderer and Electron TypeScript checks, full ESLint and `build:smoke`: passed.
- Independent Standards review: 0 actionable findings.
- Independent Spec review: 0 actionable findings.
- Packaged desktop validation: not run; this is a source fix, not an installed update.
