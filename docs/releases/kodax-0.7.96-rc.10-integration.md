# KodaX 0.7.96-rc.10 integration

Date: 2026-09-23. Space source package remains `0.1.46-rc.2`.

## Published dependency

Root and Desktop pin `@kodax-ai/kodax@0.7.96-rc.10` and resolve one deduplicated
Registry package through `package-lock.json`:

- Tarball: `https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.96-rc.10.tgz`
- SRI: `sha512-ZiLYjsLDfiFaFbyvZUeKjYahudnuBbcOHfwA25Yn/tQHuudmVySLX8GlhZqwcRtdkq7B4AB7WkpB3fzPQkXxcg==`

The release dependency gate verifies the installed bytes against this Registry
tarball, including the universal native bundle. SDK files are not patched.
CI and release builds use npm; the legacy pnpm lockfile is not used for this upgrade.

## SDK changes and Space adoption

The published changelog and normalized public declaration diff against rc.9 show:

- Runtime close now drains owned terminal maintenance and memory IO/reviews
  before releasing ownership. Space already awaits `runtime.close()` in its
  host adapter, including startup/close races; it needs no separate drain loop.
- `MemoryReviewRunner`, `reviewMemoryFeedback` and episode-review draining accept
  optional cancellation signals. Space registers no custom memory reviewer or
  episode-review drain callback. SDK-owned reviewers handle the new signal.
- `KodaXEvents` adds optional internal `scheduleManagedTaskMaintenance` and
  `runMemoryWork` ownership callbacks. Space leaves their implementation with
  the SDK Runtime.
- Already-aborted direct execution retains a defined interrupted result and one
  terminal `onComplete`. The installed-package regression checks both facts and
  verifies that no Provider request occurs. This basic cancellation case also
  passes on rc.9; it protects Space's existing completion contract.
- Edits-mode text transactions protect the canonical target without rejecting
  ordinary project files merely because the workspace contains protected native
  state. Space consumes the fix through the SDK's existing text-tool path.

Exports, dependency ranges, engine requirements and public capability versions
are unchanged. Existing startup/daemon capability gates remain intact. The
compatibility version assertion, live acceptance expectation, current-source
documentation and built-in manual now identify rc.10. Historical rc.9 release
and customer-machine acceptance records remain historical.

## Validation

- Exact dependency assertion failed against rc.9 before installation.
- `npm ls @kodax-ai/kodax --all`: one deduplicated rc.10 package.
- `assertKodaxReleaseDependencyState`: Registry URL, SRI and installed bytes pass.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build:smoke`: passed (Vite reports its existing large-chunk warning).
- `npm test`: passed, 4,222 tests passed, 20 platform/permission skips, 0 failures:
  release gates 86 passed / 7 skipped; Desktop 3,774 passed / 13 skipped;
  IPC schema 362 passed. This includes the real SDK startup probes, embedded
  Worker/external-agent compatibility, shared-daemon ownership and cleanup,
  installed-package cancellation, and Runtime host shutdown tests.
- Changed test/integration-note formatting and `git diff --check`: passed.

This source integration does not publish a new Space release or establish
customer-machine acceptance. Windows packaged boot/exit evidence from rc.9 is
not evidence for a newly packaged rc.10 build.

## Standards

Independent review found one stale current-source version in the Chinese user
manual. It was corrected and the reviewer confirmed closure. No remaining
standards violations or actionable code smells.

## Spec

Independent review found no missing requirements, incorrect SDK adaptation or
scope expansion against the requested rc.10 upgrade and published SDK changes.

Review totals: Standards 0 unresolved findings; Spec 0 findings.
