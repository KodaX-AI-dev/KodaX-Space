# alpha.7 remaining qualification

Date: 2026-10-18. Space `0.1.47-alpha.3` remains unpublished. This continues the
[consumer audit](kodax-0.7.97-alpha.7-space-followup.md); it does not replace the
earlier Registry/native/package integrity evidence.

## SDK Linux recovery and queue race

The SDK's [CI run 39046250003](https://github.com/icetomoyo/KodaX/actions/runs/39046250003)
and [release run 39047826560](https://github.com/icetomoyo/KodaX/actions/runs/39047826560)
are successful at release-tag commit `25fa6399ada6dae0493faa221eb82174eebb9ad6`.
The downloaded job logs establish the following, rather than merely showing a
green workflow badge:

| Check                                                                          | Linux Node 20                                      | Linux Node 22                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Crash after accepted input, after tool dispatch, after recorded tool result    | All original three pass; 8,582 / 9,655 / 36,443 ms | All original three pass; 5,482 / 5,318 / 5,473 ms                         |
| Process identity, PID reuse, unreadable identity/denied probe conservatism     | `lifecycle.process-identity.test.ts`: 19/19        | 19/19                                                                     |
| Actual unreaped zombie, shared storage and exit recovery                       | `process.owner-exit.test.ts`: 10/10, no skips      | 10/10, no skips                                                           |
| Temporary attachment close, owner revalidation, original deadline/cancellation | `sdk-runtime-daemon-upgrade.test.ts`: 81/81        | 81/81                                                                     |
| Shared-owner discovery semantics                                               | `state.test.ts`: 61 pass, one Windows-only skip    | Covered by the identity/owner suites above; no separate state-suite claim |

The zombie case is Linux-only and deliberately leaves its PID unreaped while
checking discovery, health and exit behavior. The attachment cases include
closing a stale connection, re-reading ownership, not extending the original
deadline, and cancellation after connection close. These are upstream SDK
regressions, not Space implementations of process probing.

The deterministic queue-publication cases are in
[`sdk-runtime.test.ts`](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/src/sdk-runtime.test.ts#L8402):
`start` and `after_turn` both finish the predecessor while goal binding holds
the next admission before publication. The Node 20 unit log reports 303 pass /
two skip for that file; the two conditional skips in this source are Windows
cases, not these queue cases. Space's separate packaged queue/reload/Stop test
passes through its ordinary public consumer path. That consumer test does not
pretend to force the SDK's private goal-binding interleaving.

These results establish the release source's CI coverage. npm metadata has no
`gitHead`; the Registry tarball's verified SRI and installed-byte checks remain
separate evidence, not a fabricated Registry-to-Git cryptographic attestation.

## Windows consumer and startup observations

The genuine installed alpha.7 SDK, with the existing packaged Space executable
under `out/sdk-alpha7`, passed **20/20 cases in one run, with retries disabled**.
The suite covers Renderer boot, all seven Product-output cases, both restored
history cases, six lifecycle cases and all four shared-Host recovery cases.
It includes active-work protection across the first startup deadline, retained
Host attachment, streaming crash recovery, distinct repeated input identities,
no accepted-input resubmission, and no saved-tool replay.

Two separate packaged boot observations disabled the fixture's deliberate
20-second daemon hold. Each used a fresh isolated profile containing 122
unresolved historical child records. The records remained byte-for-byte intact:

| Observation | Renderer ready | Runtime initialized |
| ----------- | -------------- | ------------------- |
| First       | 3,334 ms       | 4,142 ms            |
| Second      | 3,236 ms       | 4,141 ms            |

These are measured observations, not a new universal latency guarantee. The
original smoke's deterministic hold and its assertions remain unchanged.

A separate private installation exercised the published SDK with 3,002 saved
Sessions (including 50 large unrelated histories). One PowerShell process
stayed alive throughout, resolving the same private `kodax.ps1` before and
after `npm link`. Its first public client connection and two selected history
reads took 1,502 ms. While that owner was still alive, the private installation's
build fingerprint changed and `npm link` ran again. The next connection changed
Runtime/PID and restored both histories in 5,698 ms. A third connection reused
that replacement Runtime in 610 ms. The final private daemon stop succeeded.
Only private temporary files and a private npm prefix were changed.

This measures shim resolution and the public Host/history attachment path,
not full TUI render readiness or `npm run build` compilation time. It establishes
that this same-shell path does not need a terminal restart. An old terminal
can still select a different Node/npm prefix through its inherited PATH, and
an existing Host has code loaded in its own process. Without the user's old
PATH/owner evidence, neither is retroactively proven to be the sole cause of
the earlier observation.

An earlier two-ConPTY experiment reached apparent composer readiness in
8.5–9.2 seconds, but one child needed forced teardown and node-pty reported
`AttachConsole failed`. That experiment is retained as **not fully passed**;
its readiness heuristic/exit behavior is not substituted for the successful
public attachment and packaged UI checks above.

## Space platform gate

The installer workflow now launches the actual packaged binary on Windows,
Linux, macOS x64 and macOS arm64. The previous Linux Renderer step launched the
source fixture because it never supplied `SPACE_E2E_EXECUTABLE`.

The gate supplies each platform's real executable, a Linux D-Bus Secret Service
and Xvfb, and runs the same 20 cases with `--retries=0`. macOS fixtures now use
one physical temporary profile path; their SDK module path uses the app's
`Contents/Resources`. Credential cleanup resolves both sides of the temp path,
retaining its profile-prefix and account-ownership checks. A public cleanup
regression failed before that fix and passes after it (4/4 cleanup cases).

The [manual qualification run](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39090294249)
uses source `2bc01b0e` on `codex/alpha7-space-qualification`. Results are pending
until that run finishes. Two earlier runs were explicitly cancelled after
review found the macOS fixture path issues; they are not acceptance results.
Manual branch dispatch cannot enter the tag-only Release job, and the packer
continues using `-p never`.

This gate checks installer construction, packaged dependencies and the actual
packaged application. It does not exercise a human installer wizard, OS signing
or notarization prompts, every model, or every end-user machine configuration.

## Independent Artifact SDK

The public Registry still returns HTTP 404 for `@kodax-ai/artifacts`, including
the source-declared alpha.7 version. The installed root package has no Artifact
SDK export or implementation. See the
[delivery investigation](../research/kodax-alpha7-artifact-delivery-readiness-2026-10-18.md)
for exact API/source/Registry evidence and the required upstream delivery.

Space's existing Artifact tool, PNG preview and published SDK attachment checks
remain separate, exercised behavior. They do not prove the unavailable package's
nine operations or independent PPTX/PDF/DOCX/HTML/SMIL renderer backends.
No local SDK copy, invented capability, bypass of shared ownership or direct
Renderer access to Host evidence files was added to hide this blocker.
