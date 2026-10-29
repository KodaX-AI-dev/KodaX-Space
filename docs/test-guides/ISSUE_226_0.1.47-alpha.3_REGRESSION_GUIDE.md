# Issues 226–229 — alpha.10 integration regression

Scope: Space `0.1.47-alpha.3` working tree with Registry SDK `0.7.97-alpha.10`, 2026-10-28. A source fix and a locally verified package do not mean a new Space installer was published.

## Automated checks

- `node --test --test-force-exit scripts/test/kodax-interactions.test.mjs`: actual installed Runtime question lifecycle, without model requests.
- `node --test --test-force-exit --import tsx apps/desktop/electron/test/space-builtins.test.ts`: actual independent Host registration and policy reload; missing registration is a local failure with zero Provider requests.
- `node --test --test-force-exit --import tsx apps/desktop/electron/kodax/runtime/runtime-client-exit.test.ts`: ready plus old unknown cleanup, blocking recovery, identity-verified protected peer, accepted receipt identity and bounded confirmation.
- `node --test --test-force-exit --import tsx apps/desktop/electron/test/runtime-host-adapter.test.ts`: original Run recovery after replacement with Main authorization, exact identity, no prompt resubmission, same-Host reconnect during capacity wait or recovery acknowledgement, existing transport/Stop/CAS/queue boundaries.
- `node scripts/e2e-run.mjs tests/e2e/runtime-user-input.spec.ts`: real Coder UI Skip reaches the installed SDK as unanswered without choosing the default or stopping the Run.
- `node scripts/e2e-run.mjs tests/e2e/runtime-builtin-skills.spec.ts`: invoke the actual installed `/draft-response` from the Coder composer and complete a response through the independently running Host.
- Full repository test/typecheck/lint/build and package checks are recorded in the [integration record](../releases/kodax-0.7.97-alpha.10-integration.md).

## Customer scenarios

1. Start a new Coder or Partner conversation. AMA is shown without an SA picker; Alt+M cannot select SA. `/agent-mode sa` explains retirement. Reopen a fixture with saved SA defaults/sidecar, continue it and fork it: future execution uses AMA; historical execution facts remain historical.
2. Leave a normal select/input/multi question idle beyond the old deadline. It stays pending, no default is submitted and no error appears. Skip/Esc continues with an unanswered result; answering later cannot replace it. Stop interrupts only its captured Run. Repeat with Partner and a connector permission prompt: a permission refusal remains a refusal.
3. In an isolated Windows profile, stop/restart around an accepted client exit. Once SDK verifies the original Host/process/Job shutdown, a historical unknown cleanup result must not permanently block startup or be rewritten as success. A live/unknown owner, failed cleanup or unresolved containment must remain blocked. Keep an independent peer connected: Space can finish its own verified cleanup while the peer Host and history remain usable.
4. Invoke an installed builtin such as `/draft-response` in Coder and Partner. Coder must rehydrate trusted policy from the Host-registered source. Remove the registration only in a controlled fixture: show the local Skill error/code, no Provider-settings CTA, and no Provider request. Restore registration and retry a new invocation. Optional Artifact failure must not disable the Skill catalog.
5. During a real delayed cold start, inspect the displayed module/extension/runtime/recovery/MCP/session/A2A/listener phase when emitted. No secret, fake percentage or extra readiness probe should be shown. Full exit while initializing retains Issue 224's cancellation and cleanup behavior.
6. For a checkpointed Run observed by a live Main, replace the Host in an isolated fixture. It resumes the same Run with newly bound authority and no duplicate input/tool effect. Stop, unavailable authority, changed history or unknown effects prevent automatic resume. A same-Host capacity wait remains active with Stop and model selection available, and shows required/available capacity when provided.

Do not simulate power loss against a customer profile or delete its journals/owner files. Issue 225's intermittent startup delay still needs an original stalled trace; these checks do not close that report.
