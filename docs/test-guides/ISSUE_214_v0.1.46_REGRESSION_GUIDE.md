# Issue 214: Fresh Session strict-history latency investigation

Baseline: Space `0.1.46-beta.1`, SDK `0.7.96-rc.3`. **Fixed in published SDK `0.7.96-rc.4`.**
New event journals lacked an initial sequence, triggering synchronous recovery across all Run
logs. The error names the history read that timed out while that unrelated scan occupied the
daemon; it does not imply that the new Session itself contained a large conversation.

## Installed-package regression

```powershell
node --test scripts/test/kodax-fresh-session.test.mjs
```

This creates only temporary Sessions. It drives the installed SDK's real `sessions.create`
without a supplied ID, then `sessions.observe`, and rejects any read of an unrelated Run log.
The registry `0.7.96-rc.3` package fails with **4 reads instead of 0**. The installed SDK must pass;
passing a source-only SDK test is insufficient to establish that Space consumes the repair.
The installed Registry `0.7.96-rc.4` passes this regression and the standard integrity/content gate.

The large-history diagnostic is also committed:

```powershell
node scripts/diagnostics/session-startup-history.mjs
```

Its default assertions require zero unrelated event reads and a successful concurrent strict
read. Pass an older SDK Runtime entry and `--expect=regression` to compare a baseline. It maps
only reads of existing Run event files into the temporary Runtime. Do not run multiple baseline
copies concurrently, since each intentionally recreates the expensive synchronous scan.

## Published SDK integration

Space pins Registry `@kodax-ai/kodax@0.7.96-rc.4` in both root and desktop manifests and the
lockfile. SDK commit `5a702844` contains the fix and regression tests. Build through the normal
`npm run build` entry point; local-tarball mode is no longer required.

The installed published package measured create 361ms, zero unrelated event reads, concurrent
strict read 13ms, and observe 83ms. The complete-exit regression verifies that the product-created
identity is persisted and history is restored after restart, without trying to create it twice.

The same diagnostic against `out/win-unpacked/resources/app.asar` measured create 326ms,
zero unrelated event reads, concurrent strict read 12ms, and observe 76ms. Both TypeScript
checks and 401 focused regressions passed. The send/reply and same-Session retry Playwright
tests also passed (2/2).

Normal `npm run build` passed with the Registry pin, producing the Setup and Portable executables
under `out/`. Packaged dependency checks, boot smoke, and complete-exit smoke all passed;
the latter verified two clean product exits and restored Session history after restarting.

## Reproduced causal comparison

Read-only mapping of the affected machine's 924 event logs (1,887,316,469 bytes) into an isolated
Runtime produced the following paired results. All journal/Session writes stayed in a temporary
home. Both runs started a strict history read at the same new-journal commit boundary.

| Operation                  |             Registry baseline | Fixed SDK source |
| -------------------------- | ----------------------------: | ---------------: |
| Create new Session         |                      18,306ms |            362ms |
| Unrelated event reads      |                         3,123 |                0 |
| Unrelated event bytes read |                 4,436,993,608 |                0 |
| Concurrent strict read     | `read_timeout` after 17,959ms |    missing, 15ms |
| Observe created Session    |                          98ms |             97ms |

The baseline reproduced `Session history read timed out after 15000ms` exactly. Synchronous
parsing also delayed the timeout callback. Baseline repetitions took 18–20 seconds. The fix
initializes the new epoch's sequence instead of searching old logs that cannot contain it.
The cached sequence floor is epoch-aware; recovery of an existing epoch's lost sequence remains.

## Attach-only read probe

Run from the repository root while the Coder daemon is already running. This probe uses ordinary
diagnostic client identity and `autoStart: false`; it neither starts nor stops the daemon, creates
a Session, sends a query, nor accesses a Provider credential. `close()` disconnects this client.

```powershell
@'
import { performance } from 'node:perf_hooks';
import { connectKodaXRuntime } from '@kodax-ai/kodax/runtime';
const sessionId = '20260913_210229_mv5e9cd35a24bc';
let runtime;
try {
  runtime = await connectKodaXRuntime({
    profile: 'coder', autoStart: false, daemonConnectTimeoutMs: 3000,
  });
  for (let sample = 1; sample <= 2; sample += 1) {
    const started = performance.now();
    try {
      await runtime.sessions.load(sessionId, { timeoutMs: 15000 });
      process.stdout.write(JSON.stringify({
        sample, elapsedMs: Math.round(performance.now() - started), outcome: 'found',
      }) + '\n');
    } catch (error) {
      process.stdout.write(JSON.stringify({
        sample, elapsedMs: Math.round(performance.now() - started),
        code: error?.code, message: error instanceof Error ? error.message : 'Unknown error',
      }) + '\n');
    }
  }
} finally {
  await runtime?.close();
}
'@ | node --input-type=module -
```

If attach reports `ENOENT`, there is no reachable daemon for that profile; do not interpret it as
a history-read measurement. A separate diagnostic client must not reuse Space's instance identity
or its scoped credential broker identity.

## Recorded evidence — 2026-09-13

The reported ID had no persisted record. Its first measured daemon read took 12,751.7ms and
returned `Session not found`; the next took 223ms, and a later read 20ms. Independent SDK strict
reads returned missing in 7ms / 2ms. Concurrent daemon listing increased read latency, but did
not reproduce the full timeout. A 1ms diagnostic budget caused `read_timeout`; a subsequent
normal-budget read completed normally, so that test did not reproduce permanent daemon blockage.

## Acceptance

- The installed-package regression passes and the large-history diagnostic reads no unrelated
  event logs when creating a fresh Session.
- Existing valid epochs with missing/corrupt sequences recover monotonically from their logs.
- Replacing a journal epoch does not combine a different Runtime's old cached floor with the
  new epoch or skip new events.
- Space's real daemon Coder creation omits `sessionId`; Partner/embedded behavior and external
  ownership/retag checks remain covered by the adapter and IPC suites.
- Issue 211's same-Session retry regression passes independently. Do not raise the timeout,
  discard history, or treat a cosmetic spinner change as the latency repair.
