# Issue 222 — Shared Host recovery and historical conversation availability

All automated fixtures create a unique temporary profile. Never reproduce this
against the personal `~/.kodax` directory or remove an ownership lock by hand.

## Required behavior

1. A `default` daemon owns the canonical Session directory before Space starts.
   Space discovers that actual owner through the SDK instead of spawning a
   competing `coder` writer. A compatible owner can be reused.
2. An idle older owner can be refreshed through authenticated managed shutdown,
   preflight and exact process-exit verification. The automated upgrade fixture
   uses actual alpha.6 candidate-4 SDK code with its bundled native bytes and the
   unchanged lockfile dependencies absent from that older tarball.
3. A real nonterminal Run blocks replacement. The same PID remains alive and
   the Run must complete successfully after the local provider is released.
   The waiting view identifies `default`, the required upgrade and `active_runs`.
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
   must not republish recovery or start another Host. Startup AbortSignal must
   cancel SDK readiness immediately, and closing while identity storage opens
   must prevent the SDK factory from being called later.
10. A persistent Host started by the same published SDK installation remains the
    same Runtime ID/PID while both saved histories display their answers. New
    Space Hosts request `daemonLifecycle: interactive`; existing retention is
    not a reason to impose `daemonOrphanExit:1`. Production complete exit still
    settles the Host through the SDK, and its public receipt uses profile `default`.
11. Kill only the verified isolated Coder Host while `STREAM_PRODUCT` is streaming.
    A different Runtime becomes ready automatically. The original user item must
    remain visible and appear exactly once through public SDK history. The local
    provider must have received that input exactly once; reconnection must never
    resubmit input or replay a tool/Run.

## Commands

```powershell
node --test --test-force-exit --import tsx apps/desktop/electron/test/runtime-host-adapter.test.ts apps/desktop/electron/test/runtime-client-identity.test.ts
npm run build:smoke
node scripts/e2e-run.mjs shared-host-history-recovery.spec.ts
node scripts/e2e-run.mjs sdk-restored-history.spec.ts sdk-product-output.spec.ts
```

For the packaged executable, set `SPACE_E2E_EXECUTABLE` to its absolute path and
run the same spec. Use `SPACE_PACK_OUT_DIR=out/sdk-alpha7` for the existing
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
[published alpha.7 integration evidence](../releases/kodax-0.7.97-alpha.7-integration.md).

## Data authority

The restored-history follow-up covers a 150-item current window beginning inside
a saved checkpoint turn, repeated query text with distinct input identities,
no tool replay, and pending-tool EOF/timestamps across reload. See the
[consumer follow-up](../releases/kodax-0.7.97-alpha.7-space-followup.md).

Visible messages must come from SDK `observeView`/history items. No renderer or
Main fallback reads JSONL text to conceal an unavailable Runtime. Failed reads
remain visibly distinct from a confirmed empty conversation. Session deletion
error classification is covered by the separate Issue 221 regression guide.

## Recovery boundaries

A newer/incompatible Host, an unverifiable owner or a same-version Host from a
conflicting installation remains subject to the SDK capability/build/ownership
guards. Do not weaken those guards to make recovery appear successful. Active
work blocks replacement until it completes; permanent incompatibility remains
visible. Linux zombie/process identity correctness is covered by the SDK release
CI; Windows packaged tests do not establish Linux installer qualification.

## Additional alpha.7 qualification

The installer workflow's manual branch dispatch now exercises the real packaged
binary on all four OS/architecture targets, with no Playwright retry. It supplies
`SPACE_E2E_EXECUTABLE`; Linux also starts an isolated Secret Service and Xvfb.
Manual branch dispatch does not satisfy the tag-only Release condition.

```powershell
node --test scripts/test/runtime-test-credential-cleanup.test.mjs
$env:SPACE_E2E_EXECUTABLE=(Resolve-Path 'out/sdk-alpha7/win-unpacked/KodaX Space.exe').Path
node scripts/e2e-run.mjs tests/e2e/renderer-boot.spec.ts tests/e2e/sdk-unified-contract.spec.ts tests/e2e/sdk-product-output.spec.ts tests/e2e/sdk-restored-history.spec.ts tests/e2e/shared-host-history-recovery.spec.ts --retries=0
Remove-Item Env:SPACE_E2E_EXECUTABLE
```

Use the [qualification record](../releases/kodax-0.7.97-alpha.7-qualification.md)
and [machine evidence](../releases/kodax-0.7.97-alpha.7-qualification.json) for
actual per-platform results and the boundary between a Host-attachment timing
observation and a complete TUI/rebuild performance claim. Keep any first-run
failure in that record; do not treat a later pass as its diagnosis.

The alpha.7 input handoff regressions additionally hold acceptance before its
canonical view, batch after-turn input IDs, delay image projection, and retain
unknown/lost replies without resubmission. Twenty ordinary idle reads must cause
zero `runs.getInput` calls and reclaim all twenty observers. An older submitted
Run outside the current view window must be checked by its exact Run identity.

For Stop, hold the old result promise open after a confirmed terminal receipt,
then send a new input. It must enter one new Run; settling the old promise or
replaying its exact Stop must not clear that successor. Unknown/nonterminal
receipts must retain admission protection. These checks use the public adapter
and RealSession seams:

```powershell
node --test --test-force-exit --import tsx apps/desktop/electron/test/runtime-host-adapter.test.ts apps/desktop/electron/test/real-session-runtime-queue.test.ts apps/desktop/electron/test/real-session-runtime-stop.test.ts
```

Run the original `sdk-unified-contract.spec.ts` against each actual packaged
target afterward. A unit pass or a later E2E pass cannot replace the first
failure's phase log. Do not increase admission deadlines or replay input to
make a failed case pass.
