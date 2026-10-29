# Published alpha.10 Space integration

Date: 2026-10-28. Space remains `0.1.47-alpha.3`; this is an unpublished working-tree integration, not a new installer release.

This records the completed alpha.10 integration phase. Subsequent Kylin window/manual-update work and its newer package evidence are recorded [separately](../research/kylin-window-sandbox-and-manual-updates-2026-10-28.md); the installer hash below identifies this phase's build.

## Requirements and implementation

Root/Desktop manifests, lock entries and the physical installation use the official Registry `@kodax-ai/kodax@0.7.97-alpha.10`, without a source link. Its integrity is:

```text
sha512-rxq51s3oApYoTNfxu+SWxlKZHSSSA3FJnAEgWdGKlqCXxXHIRJm1J5V05DqXQhvKgiO9jg7c8zoEd2aGwS2LUA==
```

- Retire SA in Space: remove the picker/shortcut and SA suggestions, converge legacy defaults, sidecars and new/resumed executions on AMA, and return an explicit migration hint for `/agent-mode sa`. Preserve SDK compatibility types and historical execution facts.
- Ordinary questions wait indefinitely by default. Skip is an unanswered result in both Coder and inline Partner callbacks; it does not select a default or stop the Run. Stop retains its separate exact-Run semantics. Permission/guardrail authorization is unchanged.
- Consume the SDK's fresh exit-recovery assessment separately from historical cleanup. Verified old Host shutdown can release startup while old work remains `unknown`; pending, failed or unverifiable recovery stays blocked. A special existing shared-Host boundary remains: identity-verified `host_protected` plus succeeded personal cleanup completes only Space's own exit/identity retirement while preserving the SDK's blocked Host-shutdown assessment and the peer Host. It never certifies Host shutdown or unknown work as successful.
- Preserve local Skill failure stages `skill_load/skill_policy`, all four stable codes, the bounded safe `skillName`, and the SDK safe message through IPC and history/live projections. Do not direct these failures to Provider settings or automatically retry them. Independent daemon registration and trusted policy reload remain required; optional Artifact failure stays separate.
- Normalize the Host Skill catalog through the existing Space metadata mapper, including the installed builtin-root check. Coder and Partner show the same builtin origin; SDK policy enforcement continues on its independently registered source.
- Keep the previous phase's 18 Skill snapshots, pinned sources, licenses, Space patches and content improvements. SDK-owned Skill fixes arrive from the published dependency; Space does not maintain a fork of those Skills.

## Additional SDK changes

- Forward all actual `initializing` phases through the bounded startup DTO, diagnostics and localized UI, including recovery and MCP preparation. These are observations, not readiness or percentages.
- On a reconnect to a replacement Host, resume only the original Run in `recovering` with a generation checkpoint, no Stop and no terminal fact. Use fresh trusted Main authorization and `runs.recover`; never submit its prompt again. Same-Host capacity waits and unknown/terminal outcomes are not replayed. SDK still validates history, authority, owner and effects. A new Main does not infer another principal's authority from Host death.
- Project only bounded capacity-wait timing/token facts, including a waiting child when the root has no counts; do not expose checkpoint bodies, paths or digests to renderer. Keep the Run and Stop active and explain model selection when capacity is insufficient.
- Kimi K3.1 routes/effort metadata continue through the existing SDK-backed catalog. A2A task-store cleanup needs no Space engine patch. The installed JavaScript contains the event-stream handoff fix, not merely its type declaration; existing observation ownership and revision checks remain in place.

## Verification record

The installed-package question tests cover indefinite default, explicit skip, configured timeout, late answer and Stop. The real daemon Skill tests cover both registered execution and missing registration: the latter has zero Provider requests and retains typed local error facts. Consumer regressions cover exit readiness versus unknown cleanup, protected peers, legacy SA migration, exact Run recovery, startup phases and capacity-wait display.

Completed source checks:

- `npm run typecheck`, `npm run lint`, `npm run build:smoke`: passed. The last recovery correction was followed by another typecheck, focused lint and Main rebuild.
- `npm test`: 4,435 passed, 20 existing conditional/platform skips, zero failures (release 106/7; Desktop 3,960/13; IPC schema 369/0). Both same-Host reconnect regressions are included in the full run.
- `skills:check`: all 18 Space builtin snapshots and their source/patch/license integrity passed.
- Installed SDK Skill metadata keeps `git-workflow` and `tdd` discoverable for natural-language requests; their bodies constrain the requested work. The public LLM catalog exposes both Kimi K3.1 Pro/Highspeed routes for `kimi` and `kimi-code`, with their SDK-defined context and effort metadata. No live subscription or paid model request was made.
- Independent Standards and Spec review: zero remaining findings after fixing both recovery reconnect boundaries (capacity wait and acknowledgement).
- Source UI: the full run selected 154 cases. It had 148 passes, three conditional skips and three test failures: two old `alpha.9` literals in diagnostics and one fixture write racing startup layout migration. Diagnostics now reads the declared manifest version; historical sessions are seeded before Electron launch. The two affected files were rerun with all six cases passing, giving 151 distinct accepted cases and three skips. Original ordering/reload assertions remain intact. The real Coder Skip case passed; its screenshot was visually checked, and both keyboard hints now also say Skip.
- The added actual-builtin test first confirmed successful independent-Host `/draft-response` execution, then caught a display-origin mismatch: the Runtime IPC branch bypassed Space's existing metadata mapper. After reusing that mapper, all 17 focused Skill registry/metadata tests, typecheck, focused lint and the real Coder E2E passed. The final package is rebuilt after this correction.

## Final Windows package

- `node scripts/pack.mjs --win`: passed after the final metadata correction, including the automatic `smoke:pack`, `smoke:boot` and `smoke:complete-exit` gates. Root/Desktop/lockfile remained pinned to Registry alpha.10.
- Packaged facade/chunk/native integrity, physical sandbox resources, Artifact worker with exact PNG evidence, constructed-handler Workers, updater and SQLite execution all passed.
- Cold boot: renderer ready in 4,191 ms; Runtime ready in 25,165 ms **including an intentional 20-second readiness hold**. All 122 seeded historical child records remained intact. This is an isolated regression fixture, not a normal-startup latency benchmark.
- The final executable passed all **19 packaged UI cases**: six unified SDK cases and 13 additional cases for AMA, the actual installed `/draft-response`, unanswered Skip, bilingual/short-window diagnostics, delayed startup, startup cancellation and migration seams. The packaged question screenshot was also visually checked. No failures remain.
- Local installers: `out/KodaX-Space-Setup-0.1.47-alpha.3.exe` and `out/KodaX-Space-Portable-0.1.47-alpha.3.exe`. These builds retain the working-tree version and were not uploaded or published. Setup SHA-256, unchanged across the final UI run:

```text
3f6a958c0c8d92377aba58b20fc71f9128dafbe2357c39ea65dd23759c566cd3
```

Issues 226–229 are resolved in source. No paid model, customer profile or external connector write was used. The original intermittent slow cold-start report (Issue 225) remains `needs-info`; actual phase reporting improves its diagnostics and does not prove the original latency cause fixed. Live connector/account acceptance and model-output quality are outside these offline integration checks.

Manual acceptance steps: [Issues 226–229 regression guide](../test-guides/ISSUE_226_0.1.47-alpha.3_REGRESSION_GUIDE.md). Earlier Skill content work: [F135 guide](../test-guides/FEATURE_135_0.1.47-alpha.3_TEST_GUIDE.md).

## Standards

Zero remaining findings. The independent review found no new written-standard violation or reportable baseline code smell in the integration diff.

## Spec

Zero remaining findings. The independent review confirmed the recovery acknowledgement/ownership fix, trusted Skill boundaries and shared metadata mapping. The two reconnect findings were fixed and covered by regressions.

Review totals: Standards 0 (no remaining severity); Spec 0 (no remaining severity).
