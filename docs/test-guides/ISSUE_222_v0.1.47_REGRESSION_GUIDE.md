# Issue 222 — Shared Host recovery and historical conversation availability

All automated fixtures create a unique temporary profile. Never reproduce this
against the personal `~/.kodax` directory or remove an ownership lock by hand.

## Required behavior

1. A `default` daemon owns the canonical Session directory before Space starts.
   Space discovers that actual owner through the SDK instead of spawning a
   competing `coder` writer. A compatible owner can be reused.
2. An idle older owner, or an identical-build owner missing the explicitly
   requested orphan-exit policy, can be refreshed through authenticated managed
   shutdown, preflight and exact process-exit verification.
3. A real nonterminal Run blocks replacement. The same PID remains alive and
   the Run must complete successfully after the local provider is released.
   The waiting view identifies `default`, `daemonOrphanExit` and `active_runs`.
4. Keep the first saved history selected across the blocker and beyond the
   SDK's initial startup deadline. When the work finishes, user and assistant
   text must appear without clicking the row again or refreshing. Select a
   second history and verify both messages there too.
5. Passive reconnect and complete exit use the attached Host's actual profile.
   Offline exit recovery retains that profile across a Space restart; old
   recovery records without it retain their `coder` compatibility default.
6. A peer winning shared ownership between discovery and process startup is
   rechecked and retried within the original startup deadline. Unrelated
   bootstrap errors, newer incompatible Hosts and unverified owners must not
   become permission to stop a process.
7. While an owner holds the writer fence but initial A2A discovery is still
   pending, `ensureKodaXRuntime` must wait for descriptor publication. Releasing
   discovery permits attachment; exhausting the original deadline preserves
   the retryable ownership cause. No competing process is started while waiting.
8. After idle recovery, stop only the isolated fixture's verified `coder` Host.
   Keep the same saved history selected. Passive profile polling must observe
   a different ready Runtime ID, and its saved answer must remain available
   without another row click, input or refresh.
9. Cover structured readiness timeout, socket `ETIMEDOUT`, missing endpoint and
   the legacy unhealthy message with its real diagnostic suffix. Recoverable
   startup failures continue with SDK startup enabled; permanent incompatibility
   stops retries and preserves its diagnostic. Closing during a pending retry
   must not republish recovery or start another Host.

## Commands

```powershell
node --test --test-force-exit --import tsx apps/desktop/electron/test/runtime-host-adapter.test.ts apps/desktop/electron/test/runtime-client-identity.test.ts
npm run build:smoke
node scripts/e2e-run.mjs shared-host-history-recovery.spec.ts
```

For the packaged executable, set `SPACE_E2E_EXECUTABLE` to its absolute path and
run the same spec. Use `SPACE_PACK_OUT_DIR=out/issue-222` for the existing
dependency, boot and complete-exit packaged smoke scripts.

In the SDK checkout:

```powershell
npx vitest run src/sdk-runtime-daemon-upgrade.test.ts src/runtime-daemon/state.test.ts src/acp_server.daemon.test.ts
npx vitest run src/runtime-daemon/process.test.ts src/runtime-daemon/transport.test.ts src/runtime-daemon/transport.connection-timeout.test.ts
npm run build
node --test tests/bundled-shared-host-recovery.test.mjs
```

The bundled test is also part of `npm run test:bundle`. The policy and race
regressions were observed failing before their implementation and passing after.
The first desktop run verified both idle recovery and a real protected Run;
packaged verification and final artifact hashes are recorded in the linked
[candidate evidence](../releases/issue-222-recovery-verification.md).

## Data authority

Visible messages must come from SDK `observeView`/history items. No renderer or
Main fallback reads JSONL text to conceal an unavailable Runtime. Failed reads
remain visibly distinct from a confirmed empty conversation. Session deletion
error classification is covered by the separate Issue 221 regression guide.
