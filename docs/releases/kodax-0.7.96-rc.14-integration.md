# KodaX 0.7.96-rc.14 integration

Date: 2026-10-01. Space remains `0.1.46-rc.6`, on `main`.

## Scope

Install the published Registry package and rebuild `out/win-unpacked`. Close the
reported Stop/queue, interrupted output, and compacted-history integration gaps
without rewriting production Sessions, adding a second transcript writer, or
blocking later tasks because an interrupted Run has uncertain effects. Preserve
the unrelated documentation changes already present in the workspace.

## Full SDK delta audit

SDK source range: `45771ec4..cad8b658`. The release and subsequent Windows native
path fix are both reviewed. The exact Registry dependency gate passed, and the
published bundle contains both long-form native path comparisons.

| SDK change                                                                                                     | Space adoption                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool pairing across managed context and recovery from the original Runner transcript                           | Adopt through the dependency; retain the completed-output durability and Stop/queue tests. Space never persists Provider-normalized copies.                                                                           |
| Proven legacy tool-pairing restoration, copy-of-copy tracing, and page cache v9                                | Keep SDK-owned identities, ordering, paging, revisions and cache rebuilds. No text/time deduplication or repair writes in Space.                                                                                      |
| Unprovable compaction predecessors now truncate the projection with `partial` / `compaction_history_truncated` | Accept the new issue code in IPC. Explain that earlier history could not be verified and that users can continue; preserve the original records.                                                                      |
| Turn-matched, bounded, tool-first interrupted-Run recovery for managed and coding requests                     | Verify via an offline Provider registered against the public installed package: streamed but unsaved replies enter subsequent requests as unconfirmed notes once per request, and never enter persisted conversation. |
| Reply replacement, child-mirror exclusion, and transient excerpt bounds                                        | Retain Space's bounded journal display. Explain that the full log is display history and the next Run receives a recovery summary as needed, rather than claiming nothing can reach model context.                    |
| Anthropic-compatible authentication ignores inherited `ANTHROPIC_AUTH_TOKEN`                                   | Adopt SDK client isolation; retain Space's existing operation-scoped credential broker and Provider allowlist. No Space authentication fallback is added.                                                             |
| Ink REPL uses Runtime as its sole transcript writer                                                            | Space already uses Runtime-owned Coder persistence. Preserve that ownership; no new host save path is needed.                                                                                                         |
| Windows CLI-only NUL grant recovery and isolated native test caches                                            | Space daemon startup and ordinary admission remain read-only. Keep the existing Setup boundary and packaged native/lifecycle smoke tests.                                                                             |
| Windows 8.3 native provisioning path comparison                                                                | Adopt dependency fix; packaging still verifies manifest-pinned native artifacts.                                                                                                                                      |
| CI, documentation, eval pilot and release bookkeeping                                                          | No Space runtime wiring is required. Update the built-in manual and dependency evidence. SDK's reported 12/12 pilot is upstream evidence, not a Space experiment.                                                     |

The Runtime capability versions and existing DTO shapes remain unchanged except
for the additional conversation issue code. Recovery context stays SDK-owned;
Space does not manufacture it from its UI history. Journal display preserves
partial output that is not part of formal history. The SDK's read-only repair
only resolves histories supported by the retained evidence; genuinely unproven
boundaries can still return `partial`.

## Published dependency

- Registry package: `@kodax-ai/kodax@0.7.96-rc.14`.
- SRI: `sha512-QN4FCLkhL+InGXGnSqm0j14ghd+vbisMDH9hLoz8ukn8Q6aiV2ZFMQ8u5Hyb6nzr/EgGg6c5vJEt/tdMGXuZQA==`.
- Root/Desktop manifests, lockfile, installed package and packaged ASAR agree.
  Both workspaces resolve one physical, deduplicated Registry package; no dev
  link or patched SDK bytes. Registry metadata omits `gitHead`, so source review
  and published-byte verification are recorded separately.

## Verification

- The new IPC regression fails before adding `compaction_history_truncated`
  and passes afterward, preserving the partial result and usable history.
- The two new offline public-package tests fail against rc.13 and pass against
  rc.14. Both managed and coding/SA resumes put an unconfirmed reply excerpt in
  the next main Provider request exactly once, with the interrupted Run identity;
  the saved conversation contains neither the excerpt nor the recovery record.
  Auxiliary learning-review calls are outside that main-request assertion.
- `npm test`: 4,309 passed, 20 skipped, 0 failures (release 92/7, Desktop
  3,854/13, IPC 363/0). Existing Stop/queue, cleanup recovery, history
  reconciliation, retry replacement, child isolation and recovery-bound tests
  remain green. The refactored new fixture was rerun afterward: 2/2 passed.
- `npm run typecheck`, `npm run lint`, and `npm run build:smoke`: passed;
  targeted ESLint passed after fixture refactoring. Vite retains its existing
  chunk-size warning.
- Actual-session verification used isolated copies, never the production
  storage manager. The cat investigation snapshot resolves to 590 entries and
  366 tool calls/results; the current cat copy resolves to 604 entries and 371
  pairs; the current video copy resolves to 536 entries and 490 pairs. All return
  `resolved` with no issues. Fresh reads, cache reads and complete pagination
  have equal revisions/status/content, and caches use version 9. Copy hashes
  before/after are identical. Cold reads measured 45–71 ms and cached reads
  9–12 ms in these local samples; these are observations, not a benchmark gate.
- `node scripts/pack.mjs --dir`: passed. Rebuilt `out/win-unpacked` with the
  exact Registry/native dependency gate, physical universal native artifacts,
  packaged SQLite and real Runtime/constructed-handler Worker execution.
- Packaged boot: passed; renderer ready in 5,959 ms, Runtime in 28,821 ms
  including the deliberate 20-second hold; 122 historical child records retained.
- Packaged lifecycle: three clean product exits, cleanup recovery through two
  restarts, interrupted text/thinking/tools restored without duplicates, and
  subsequent tasks completed. These checks use disposable profiles.
- Packaged main bundle and all 555 renderer files match the build byte-for-byte.
  ASAR SHA-256: `cc8313d18f41704b09d9d4733379f46b27e95635f65216ee492d9d3c2ba5266b`.
  This follow-up rebuilds the Windows directory app; older NSIS/portable artifacts
  remain historical and are not represented as rc.14 builds.

## Standards

Independent Standards review requested smaller test-fixture functions and a
synchronized user manual. Both were corrected and re-reviewed. Remaining
findings: 0.

## Spec

Independent Spec review checked the full SDK delta, existing partial-history
rendering/admission, single-writer ownership and recovery injection boundaries.
No missing Space wiring or unrequested product behavior was found. The final
documentation review found an outdated current SDK stamp in `docs/USAGE.md`;
it was synchronized and re-reviewed. Remaining findings: 0. Required unpacked
build and product qualification completed above.

Standards: 0 remaining findings. Spec: 0 remaining findings.

## Cleanup and deployment

Temporary diagnostic helpers and disposable verification copies are removed.
No temporary branch was created. Pre-existing documentation edits are preserved
and kept out of this integration commit except where the current SDK stamp is
necessarily superseded by rc.14. Production Session records were not rewritten.
Restart the directory app to load the rebuilt bytes. Active older daemon
replacement remains owned by the SDK's existing safe upgrade path.
