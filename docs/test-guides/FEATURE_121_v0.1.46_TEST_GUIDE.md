# F121 Runtime integration: rc.1 multimodal regressions

## Scope

Space source `0.1.46-alpha.10`, installed Registry SDK `0.7.96-rc.1`.
The original session `20260911_100157_8gbfe22d504b2f` used beta.6: three native
children each failed twice when PNG results reached string-only dispatch.
Worker metadata recorded `m.startsWith is not a function`; Actor output lost
that exception and substituted stale assistant text or `failed without output`.

The SDK changelog records these fixes in beta.7, retained in rc.1. Space already
accepts `local_execution` / `local_execution_error` in its Runtime IPC contract
and projects safe failures without suggesting a Provider settings change.
The rc.1 permission authority v6 gate is shared by startup, daemon admission
and packaging; an installed new package alone is not proof of an upgraded daemon.

## Automated verification

Run `node --test scripts/test/kodax-multimodal-contract.test.mjs` from the Space root.
This suite is also included by `npm test` through the release-test glob.
It uses public APIs from the installed package, a real PNG, an isolated temporary
home and an in-process deterministic Provider. It does not send model requests,
patch SDK internals or alter the original session.

Seven checks passed on 2026-09-12:

- Direct `runKodaX`: `read` and `tool_call` retain text/image blocks through an
  allowing after-tool guardrail, post-processing and the next Provider request.
- Managed `runManagedTask`: the same two routes preserve native image blocks.
- `CodingActorSession`: a real native child completes its PNG read.
- A child after-tool TypeError produces a failed Actor turn whose error identifies
  local SDK execution, with `source: local`, `errorName: TypeError` and
  `code: ERR_INVALID_ARG_TYPE`, instead of stale assistant commentary.
- Capacity spill persists oversized accompanying text and keeps the image block.

Registry dependency qualification also passed: root/Desktop manifests, lockfile
and installed package match the official rc.1 tarball and its SHA-512 integrity:
`sha512-kJKrlgtkDGg8BN43/+GLXs3u5fosCy470aDLwEBOdpOHN3fEb7w4E6vX8LWnQbY5EEVakYD2fewZutnfSSalyQ==`.

Space validation on 2026-09-12 also passed: `npm run typecheck`,
`npm run build:smoke`, and `npm test` (3,362 passed, 5 existing skips, 0 failures:
58 release, 2,986 desktop and 318 schema checks passed). Source lint passed with
`npm run lint -- --ignore-pattern 'scratch/**'`. Unqualified `npm run lint`
also scanned pre-existing untracked review copies under `scratch/` and reported
94 errors and one warning there; those copies were not changed or suppressed in
the project configuration. The final focused multimodal suite passed 7/7 after
adding independent image-shape and induced-failure assertions.

## Desktop acceptance

1. Build/start Space with rc.1 and wait for Runtime readiness. Verify the actual
   connected Runtime meets permission authority v6; allow the normal SDK-owned
   idle-daemon replacement if an older daemon is detected.
2. In a fresh task with an image-capable model, ask three child agents to read a
   small local PNG and report what they see. Expect three completed child turns
   and no `startsWith`, `trim` or `Buffer.byteLength` exception.
3. Repeat via a bridged `tool_call` read where that route is exposed. The model
   should receive the image, not just JSON or an `[Image: path]` placeholder.
4. Reopen the task and inspect child output. Historical beta.6 failed turns should
   remain historical failures; upgrading must not rewrite their recorded outcome.

The automated tests prove SDK execution and content fidelity. Actual upstream
vision quality and live desktop acceptance remain manual checks; no provider
availability or visual interpretation claim is inferred from the offline fixture.

## Unified SDK alpha.3 migration (2026-10-11)

Root and Desktop now pin published `@kodax-ai/kodax@0.7.97-alpha.3`. Earlier evidence above remains historical.

1. Start Coder, submit an ordinary input and an explicit tool, and verify one canonical user input per send. Skill/command hooks must execute once in Host.
2. During AMA, submit steer and after-turn inputs. The queue uses accepted input IDs and does not claim a future Run ID. A closed steer window must report the SDK rejection.
3. Reconnect or reload while a Run is active. Restore the current queue, tools, reasoning and interactions; completed tool receipts must stay separate when model call IDs repeat.
4. Inspect statistics after reload. Host totals must not double after replay; missing usage and operation-only adapters remain partial. Context composition and actual tool Sandbox facts must retain their identities.
5. Change Workflow limits and Provider configuration after accepting an input. Reconnect and retry that input or steer its Run: original captured allowlist and maxAgents/tokenBudget stay in force. New inputs use the new policy.
6. Exit Space with another client online. Space-owned work is cleaned while the peer stays online. Without a peer, exact Host exit needs a succeeded SDK receipt. Unknown cleanup retains recovery and never displays verified success.
7. Restart after an accepted exit. Old stable identity cannot admit new work; offline recovery checks the old receipt before the new identity resumes.
8. Verify Partner still uses its existing inline safety boundary, and Space usage questions can call the readonly space_manual tool.

Automated entry point: `apps/desktop/electron/kodax/runtime-sdk-migration.test.ts`, supported by adjacent view/exit/authorization/tool-history tests, runtime-host-adapter regressions, Renderer statistics/tool-identity tests and IPC schema tests. The real daemon fixture uses a local Provider and an isolated profile; live model behavior and desktop interaction remain separate manual acceptance checks.

## Automated desktop acceptance after alpha.3 migration

Run `npm run e2e` to build and run the suite, or `npm run e2e:run` with an
existing build. Windows uses an isolated Win32 Desktop without switching the
user's desktop or changing production window behavior. The launcher owns its
process tree through cancellation. `npm run e2e:headed` intentionally displays
debug windows on the current desktop.

Generated `tests/fixtures/file-preview` samples cover nine preview cases without
personal Downloads. `KODAX_ARTIFACT_E2E_DIR` selects an explicit alternate sample
directory when needed.

`npm run e2e:run -- tests/e2e/sdk-unified-contract.spec.ts` exercises the published
SDK and local deterministic Provider: tools/manual, statistics, history/reload/
Fork, queue/Stop, stale boundary/Rewind, verified last-client exit and peer
protection. `npm run smoke:complete-exit` runs the same cases against the Windows
directory package; `npm run smoke:pack` checks packaged dependencies, native
resources, Sandbox, Worker and public Runtime lifecycle.

2026-10-11: 99 distinct source E2E cases passed (93 existing plus 6 real SDK),
6 packaged real-SDK cases passed, no failures/skips/retries. Existing cases
include Mock/injected-event scenarios; live services and other platforms remain
separate checks. See [scope, evidence and limits](../research/kodax-0.7.97-alpha.3-space-e2e-validation.md).
