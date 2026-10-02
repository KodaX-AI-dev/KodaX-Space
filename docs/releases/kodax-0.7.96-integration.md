# KodaX 0.7.96 stable integration

Date: 2026-10-02. Space remains `0.1.46-rc.6`, on `main`.

## Scope and delta

Update root/Desktop to the exact published SDK `0.7.96`, synchronize current
manual and documentation baselines, and rebuild the directory app used locally
at `out/win-unpacked`. This is a dependency update, not a new Space release.

SDK source review: `cad8b658..c2c8fdc4`. The diff changes version manifests,
release documentation, and built-in self-knowledge text/tests. It does not
change Runtime execution or public contracts. The existing rc.14 recovery,
Stop/queue, history cache v9, authentication and native containment behavior
remains SDK-owned. No new capability gate, second history writer, or production
Session repair is introduced in Space.

The earlier [rc.14 integration](kodax-0.7.96-rc.14-integration.md) and released
Space artifacts remain dated historical evidence. Registry bytes, native
resources and the new unpacked app must be qualified separately below.

## Published dependency

- Exact Registry package: `@kodax-ai/kodax@0.7.96`.
- SRI: `sha512-7H/o0LhmlbeQsUnxGutSqMIb2Ms7UUS+kqNiPYChYT9G8Oni8RxB8ZxsDwiIlQ3ORPg4NwrDXQmKACab/uBVSA==`.
- Root/Desktop manifests and lockfile resolve one deduplicated package. The
  lockfile changes only SDK declarations, version, tarball URL and SRI.
- Installed exports, dependencies, engine requirements and
  `kodaxRuntimeContracts` equal rc.14. Registry metadata omits `gitHead`.
- The package is a fresh build, not a byte-identical archive: 137 files are
  unchanged, 19 same-path files change, and 21 generated JS chunks are replaced.
  Windows shell/text binaries and their manifest hashes also change despite no
  native source diff; qualify their actual bytes against the new manifest.

## Verification

The existing current-manual contract test detects the intermediate mismatch
between the stable manual and old rc.14 dependency (6 pass / 1 fail), then passes
after installing the stable package (7/7).

- `npm test`: 4,309 pass / 20 skip / 0 fail (release 92/7, Desktop 3,854/13,
  IPC 363/0). This includes the published-package managed/coding recovery,
  completed-output durability, Stop/queue and history-reconciliation regressions.
- `npm run typecheck`, `npm run lint`, and `npm run build:smoke`: passed. The
  existing Vite chunk-size warning remains.

- The exact Registry dependency gate passed; packaged universal native files
  match their manifest hashes, SQLite executes from ASAR, and Runtime plus
  constructed-handler Workers execute from the new package.
- Packaged boot passed: renderer ready in 6,136 ms, Runtime in 29,212 ms
  including the deliberate 20-second hold; 122 historical child records retained.
- The packaged SDK is `0.7.96`. Main and all 555 renderer files equal the local
  build. ASAR SHA-256:
  `023179796cf90414613af1eac3169a1f35cf94bcbb5283859a910a6799d9ea5e`.

- `node scripts/pack.mjs --dir`: passed, including the dependency/Worker,
  boot and lifecycle checks. Three clean exits, two restart recoveries,
  interrupted text/thinking/tools restored without duplicates, and subsequent
  tasks completed. Disposable profiles were used; production data was untouched.

## Standards

Independent Standards review: 0 findings. The update is limited to dependency
metadata and required current-baseline synchronization; historical release
records remain unchanged except an explicit correction of the rc.14 follow-up's
outdated “current baseline” wording.

## Spec

Independent Spec review: 0 findings. Existing Runtime ownership and capabilities
need no new Space wiring. The required directory-package verification is above.

Standards: 0 remaining findings. Spec: 0 remaining findings.

## Deployment boundary

This update rebuilds `out/win-unpacked`; it does not publish a new Space release
or relabel older NSIS/portable installers as stable-SDK builds. Restart the
directory app to load the new bytes. No production Session data is rewritten,
and no temporary branch is created.
