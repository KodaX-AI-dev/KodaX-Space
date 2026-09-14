# Windows Runtime startup with historical child records

## Regression

On 2026-09-14, the beta.4 `out/win-unpacked` application using SDK
`0.7.96-rc.5` repeatedly failed to initialize Coder Runtime. Sessions stayed on
“正在等待 Runtime 恢复历史内容…”. The real profile contained 122 unresolved
Run child-process records with incomplete tree evidence. Startup cleanup issued
repeated synchronous PowerShell queries before daemon readiness and exceeded the
SDK startup deadline. An empty isolated profile passed the packaged boot smoke.

This is a shared Runtime startup failure, before individual history loading.
The generic RunAsNode hint in the timeout is not the root cause: the executable's
RunAsNode fuse was enabled.

## Packaged regression

```powershell
node e2e/boot-smoke-packaged.mjs
```

The smoke now seeds 122 synthetic unresolved records in its temporary profile.
The fixture verifies its PID is definitively absent before use and contains no
customer data. Existing renderer and Runtime readiness budgets remain unchanged.
After Runtime initializes, every seeded record must still match its original
bytes: unresolved cleanup evidence must not be deleted or falsely marked complete.

Observed before SDK replacement: the unmodified rc.5 packaged application fails
with the same Runtime startup timeout. The SDK task's source regressions passed
51 tests covering historical records and real Windows processes. This does not
qualify the existing rc.5 package as fixed.

## Local candidate verification — 2026-09-14

SDK commit `ad8b88ce` changes cleanup used at both startup and exit. In the
daemon path, `connectKodaXRuntime` launches `kodax_cli.js daemon serve`;
`main()` awaits `cleanupRegisteredManagedChildren()` before dispatching
`serveDaemonCommand()`. The daemon cannot become ready while that cleanup blocks.

A separate diagnostic copy of the unpacked app used the locally built SDK from
that commit. Space/Electron files were retained; the Space main bundle's SHA-256
was checked equal. The original `out/win-unpacked`, dependency pin, user settings
and SDK source were not changed. The candidate still reports the source version
rc.5, but it is **not the published rc.5 artifact**.

| Check                                                                   | Result                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Published rc.5, 122 synthetic records                                   | Runtime startup timeout                                                                                       |
| Candidate, identical fixture shape                                      | Runtime ready in 29,247 ms, including the deliberate 20-second test hold; all 122 records unchanged           |
| Candidate, real profile, first launch                                   | Runtime ready in 13,475 ms; six history requests returned ready in 61–481 ms                                  |
| Candidate, real profile, second launch after verifying no daemon exists | Runtime ready in 13,293 ms; six history requests returned ready in 31–443 ms; renderer waiting indicator gone |
| Candidate, packaged complete-exit E2E                                   | Two full product exits and persisted history restoration passed                                               |

The real-profile reads covered three sessions each from KodaX and KodaX-Space:
five had nonempty history, and one was empty. All 122 original child-record files
were compared byte-for-byte after each launch and remained unchanged. No model
requests were sent. The real-profile daemon exited after the diagnostic client
closed before the second launch; this was not reuse of a warm Runtime.

These results establish that the SDK correction resolves the reproduced startup
block and its downstream history wait. They do not assert that every possible
history-loading failure is fixed. Formal release qualification still requires the
published SDK update and normal Space packaging pipeline below.

## Completion criteria

1. Install the published SDK release containing the process cleanup correction
   and rebuild Space through its normal packaging pipeline.
2. Pass the packaged regression above, plus the existing complete-exit smoke.
3. Launch the resulting executable with the real profile and verify several
   existing Coder sessions load history; do not send model requests or clear data.
4. Confirm unresolved historical records remain preserved and shutdown still
   handles live owned children correctly.

No production Space startup behavior or user configuration was changed for this diagnosis.

## Published rc.6 verification — 2026-09-14

Root and Desktop now pin the official npm `@kodax-ai/kodax@0.7.96-rc.6`.
The installed package, lockfile and Registry tarball passed the exact-byte release
dependency gate. No other dependency versions were upgraded. SDK public capability
contracts remain unchanged; Space retains its existing startup deadlines, admission
checks and history-loading implementation. The built-in manual and its version
assertions now describe rc.6, while earlier release qualification remains historical.

`npm run build:smoke` and normal `node scripts/pack.mjs --win` passed. The resulting
`out/win-unpacked/KodaX Space.exe` contains the official rc.6 package, rather than
the earlier diagnostic SDK copy. No local-tarball override was used.

| Check                                               | Result                                                                                                                                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint and typecheck                                  | Passed                                                                                                                                                                                                                                        |
| Complete Node suite                                 | 83 release, 3,731 Desktop and 362 shared-package tests passed; 20 skipped. One manual assertion still expected rc.5; after updating that exact version assertion, all 7 manual tests passed on rerun (4,177 distinct passing tests in total). |
| Packaged dependencies                               | Public facades, native bundle, SQLite, Runtime Workers and real image decoder checks passed                                                                                                                                                   |
| Packaged boot with 122 synthetic historical records | Renderer ready in 6,017 ms; Runtime ready in 29,036 ms including the deliberate 20-second hold; all records unchanged                                                                                                                         |
| Packaged complete exit                              | Two full product exits and persisted Session history restoration passed                                                                                                                                                                       |
| Real profile, first cold launch                     | Runtime ready in 10,417 ms; six history requests ready in 48–353 ms; renderer waiting indicator gone; all 122 historical records unchanged                                                                                                    |
| Real profile, second cold launch                    | After verifying the previous daemon descriptor was gone: Runtime ready in 12,420 ms; six history requests ready in 17–63 ms; waiting indicator gone; all 122 records unchanged                                                                |

The real-profile checks send no model requests and do not clear historical process
records. They cover three KodaX and three KodaX-Space sessions, including five with
nonempty history. These results address the reproduced startup block; they do not
claim that unrelated history or provider failures cannot occur.

The full UI suite completed with 87 passed, two skipped for missing Downloads
preview/PDF fixtures, and the sent-image failure described below. After the test
synchronization correction, the sent-image case passed three consecutive runs
(`--grep 'sent image' --repeat-each=3`), giving 88 distinct passing UI cases and
two fixture-dependent skips. There are no remaining failed cases. This includes
Coder and Partner, FileViewer, send/retry, settings, window lifecycle and Workflow.

The full UI suite exposed a test synchronization omission in the sent-image case:
`setInputFiles` returns before asynchronous attachment admission completes, while
the existing composer deliberately rejects Enter during that interval. Its failure
snapshot retained the prompt and image in the composer. The test now waits for the
Send button to become enabled before pressing Enter. No fixed sleep, extra retry,
longer timeout or product change was added; all thumbnail, attachment URL and
FileViewer assertions remain intact.

### Standards

No remaining actionable findings. The review covered repository rules and the code
smell baseline. A contradictory current-version statement in the capability ledger
was corrected without rewriting historical evidence.

### Spec

No remaining actionable findings. Version omissions in the built-in manual and
current documentation were corrected. Existing startup budgets and unresolved Run
records remain preserved; the regression runs against the actual packaged Runtime.

Standards: 0 remaining findings. Spec: 0 remaining findings.
