# Registry alpha.11 Space integration

> Follow-up implementation and new package qualification are tracked separately in the [completion record](kodax-0.7.97-alpha.11-completion.md). The package hashes and results below remain evidence for the original integration build.

> 2026-10-30 follow-up audit: this report records the original integration and its bounded tests, not complete feature closure. The [coverage audit](kodax-0.7.97-alpha.11-coverage-audit.md) identifies unresolved first-input mode selection, advertised `/work-mode` execution, Partner profile composition and user-documentation gaps. The original package below has not been rebuilt for those findings.

2026-10-29. User-authorized scope: install exact Registry SDK alpha.11, adapt all six migration areas, regress the earlier conversation's fixes and rebuild Windows artifacts. Space remains 0.1.47-alpha.3, unpublished.

## Initial inventory and acceptance

- Already adapted, requiring regression: AMA-only product default, ordinary questions without local deadlines, explicit Skip versus Stop, independent permission approvals, builtin Skill registration on the daemon, typed Skill failures, exit recovery/ownership, reconnect, startup phase reporting, manual updates, Linux caption controls, React cold-history hydration, neutral notices and bidirectional history navigation.
- Required changes: Host Session workMode selector (Coding default, Agent and experimental Script, CAS conflicts and old-Host refusal); streaming estimates from Product activity; explicit original tool reads via concrete tool item IDs; structured taskResult metadata in IPC/display; independent transcript reports and non_interactive preservation.
- New SDK internals to verify without duplicating: Skill discovery/activation and shell policy, model catalog updates, saved output retention and restored task reports. Preserve KodaX's automatic sandbox fallback.
- Public test seams: IPC schemas, SDK-backed Host adapter/settings, Product projection/rendering, paginated item reads, question outcomes, isolated real SDK/daemon/Electron UI. Tests use no paid providers or customer profile writes.
- Missing verification at start: actual installed Host capabilities, new paths in a packaged application, earlier customer-session cold loading. Source/type declarations alone do not satisfy these requirements.

SDK migration references are the installed package's docs/SDK_MIGRATION.md, docs/CLIENT_CONTRACT.md, docs/SPACE_SDK_SEAMS.md and public_docs/sdk/embedder-guide.md. Historical paragraphs in those files do not override actual package bytes or observed Host capabilities.

The SDK's Issue 371 (historical first-read latency), Space Issue 225 (intermittent startup still needing customer evidence), live model quality, and customer Kylin machine acceptance remain separate from this integration. Host ready does not mean history has loaded.

Registry verification: 0.7.97-alpha.11, integrity `sha512-Fo4qL6qvA/1ViL8sElvXB+X0+xP6c23GGJ5iJY10wDUDLXokIiVXY8+4bXx3r8OYFyiqUyBJ7+9v2UnCc5cNHg==`.

## Implemented adaptations

- Session workMode reads and writes use the existing Product Client and Host revision. The selector exposes Agent, Coding and experimental Script, disables during active work, handles conflicts without retrying a stale choice, and refuses unsupported Host capabilities. Model, permission and AMA remain independent. The mutation also uses Space's Coder admission gate.
- Product activity crosses IPC with Host estimatedTokenCount. Thinking and identified tool-input progress display approximate tokens; no client estimate is shown before the view arrives or when Host supplies no estimate. Transcript thinking summaries no longer convert text length into tokens. Provider usage and UTF-16 offsets are unchanged.
- Tool cards carry the exact Product tool item. Full originals read through the Host in bounded pages, for both live and historical IDs. outputPath is only an availability fact; Renderer never reads it. Missing originals surface errors rather than substituting preview text.
- Structured taskResult crosses strict IPC and renders neutral, collapsible Markdown with status, optional identity/title and literal content. Only SDK recognizes source-qualified legacy envelopes; the Space XML parser was removed. Independent same-text notices survive. Legacy transcript extraction accepts report arrays, unknown status and absent taskId without fabricating a deduplication key.
- Question response provenance preserves non_interactive separately from skipped. Client timeout answers are rejected by SDK before submission; ordinary questions have no local deadline. Existing permission handling stays independent.
- SDK catalog refresh flows through discovery; Space's MiniMax fallback/default now matches MiniMax-M3.1-Flash and keeps historical MiniMax-M3 discoverable. SDK Skill discovery, single-command Bash policy, MCP original retention and sandbox fallback execute in the installed SDK, without a second Runtime or writer.

## Source, publication and activation

Registry integrity was verified with the release gate, not a local SDK link. Root and desktop manifests, lockfile and installed bytes all resolve alpha.11. Source build, typecheck and lint passed. Isolated real daemon tests proved sharedSessionSettings includes workMode; the packaged pass below records exact Host identity and capability evidence. Selecting Script was verified; real-provider Script effectiveness remains outside this deterministic fixture.

## Standards

Independent review of this turn's diff: 0 remaining findings. Initial oversized helpers were split into focused hooks/read helpers. Final removal of local thinking estimates and redundant caches was also reviewed.

## Spec

Independent review against the user handoff and installed SDK contract: 0 remaining findings. A discovered initial-view gap in token estimation was fixed and regression-tested. Initial UI test failures were traced to test timing: reload requires reselecting the Session, external settings updates require observing the new revision, and queued prompt echo precedes Host model admission. Tests now wait on those actual boundaries.

Standards: 0 remaining findings. Spec: 0 remaining findings.

## Validation and delivery

Validation completed on 2026-10-30 (Asia/Shanghai), started on 2026-10-29.

- Final `npm test`: **4,465 passed, 20 conditional/platform skips, 0 failed** (release 107+7 skipped; desktop 3,988+13 skipped; IPC schema 370). Log: `artifacts/diagnostics/sdk-alpha11/full-tests-final.log`.
- `npm run typecheck`, `npm run lint`, final `npm run build:smoke`, and the exact Registry release gate passed. Focused test-first evidence includes rejected new schema fields, original-content paging, work-mode CAS/old Host, non-interactive outcomes and missing-estimate rendering.
- `electron-builder --win -p never --config.directories.output=out/sdk-alpha11` built Setup and Portable. No installation or Space publication was performed. Existing `out/win-unpacked` and earlier artifacts were preserved.
- Package smoke passed: exact SDK bytes/facades/chunks, native modules, builtin resources, Artifact worker with PNG evidence, constructed-handler workers, updater loading and SQLite execution.
- Packaged startup smoke passed: Renderer ready 6,308 ms, Runtime ready 27,762 ms **including an intentional 20-second readiness hold**; 122 seeded stale child records preserved. These figures are a controlled regression fixture, not a startup performance benchmark.
- Original customer Session `20261026_200011_47f836372c903b`: **3/3 packaged cold selections passed**, each with an intentional 10-second Host readiness hold. All retained evidence has empty React/page-error and toast lists. The immutable copied source and message content were preserved; only isolated test profile/project metadata was relocated.
- Packaged suite: **28/28 passed, no retries**, in 6.2 minutes. Log: `artifacts/diagnostics/sdk-alpha11/packaged-e2e.log`. It covers the three new alpha.11 flows, manual update confirmations, daemon builtin execution, question waiting/Skip, cold-start exit, history scrolling, Product output/reload/long bodies/images/Artifacts, Workflow/Memory, approval plans, queue/Stop/canonical mutation conflicts and complete exit with peer clients.

Observed **packaged isolated Host**: SDK `0.7.97-alpha.11`, mode `daemon`, profile `coder`, process isolation, origin under this package's `resources/app.asar/node_modules/@kodax-ai/kodax/dist/kodax_cli.js`. `sharedSessionSettings.version = 2` and keys include `workMode`; Product Client, history boundaries, session observation/cancellation, managed durability, Skill catalog/preparation, question transport and sandbox capabilities are present. The mode test verifies Agent → Coding → Script → Coding persistence, real CAS rejection, active-Run rejection and unchanged model/provider/permission/AMA. Full capability evidence is in `artifacts/diagnostics/sdk-alpha11/packaged-e2e/**/actual-host-capabilities.json`.

Artifacts (all Space `0.1.47-alpha.3`, unpublished):

| File                                                      |     Bytes | SHA-256                                                            |
| --------------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `out/sdk-alpha11/KodaX-Space-Setup-0.1.47-alpha.3.exe`    | 213534096 | `63d8fb3ab97b6325dd66afe2365320b41afeafe31367ca31ff705a86ae8ddd76` |
| `out/sdk-alpha11/KodaX-Space-Portable-0.1.47-alpha.3.exe` | 213324133 | `88f0a9b1476a1ba63d7472b1485e7a5e1273a9c5a64926c444088bb8fe149d15` |
| `out/sdk-alpha11/win-unpacked/KodaX Space.exe`            | 232351232 | `5472bf559fe8327ca98d33a7f590e59c3b020c432037c9f1d1ec789a4d92aa49` |
| `out/sdk-alpha11/win-unpacked/resources/app.asar`         | 125465322 | `4c4c69ab153f1e8a5a7e2cd54fb6818648346abbf54fbc26d48e5ee1049998bd` |

## Conversation issue closure boundaries

| Concern                                                 | Current status                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SA incompatibility                                      | Space remains AMA-only; workMode is a separate Host setting, not a reintroduction of SA.                                                                                                                |
| Long-unanswered questions                               | Host-managed waiting/Skip/Stop/deadline semantics retained and tested.                                                                                                                                  |
| Coder builtin Skill failure / misleading Provider error | Main/daemon registration and typed handling retained; real packaged draft-response passed.                                                                                                              |
| React 185 when opening the supplied Session             | Source fix and 3/3 current-package cold replay passed.                                                                                                                                                  |
| Yellow child notifications / raw envelopes              | SDK structured report display enabled; neutral status, literal Markdown and independent notices tested.                                                                                                 |
| Older-history scroll trap / duplicate newest control    | Bidirectional page navigation and one bottom arrow passed in the current package.                                                                                                                       |
| Forced automatic updates / stable-to-alpha              | Manual check + version-bound separate download/install confirmation and channel protection retained. Unit and packaged UI tests passed; no real NSIS replacement was performed.                         |
| Kylin missing window buttons                            | Linux rendering corrected; Windows native button operations are automated. Actual Kylin/UKUI acceptance remains pending.                                                                                |
| Sandbox behavior                                        | Existing automatic fallback and authorization preserved; published-SDK fallback/deny/Stop tests pass. Linux Node guidance gap below remains; customer-machine fallback failure has not been reproduced. |
| Abnormal shutdown / first-read latency                  | Cleanup/ownership/recovery tests and controlled startup pass. Space Issue 225 still needs customer evidence; SDK Issue 371 remains open. Host ready is not history-loaded.                              |

## Remaining SDK follow-up for the owning thread

已在物理安装的 Registry `@kodax-ai/kodax@0.7.97-alpha.11` 复核：当 Linux sandbox doctor 返回 `JavaScript Skill interpreter is unavailable` / Node ENOENT，公开 `getKodaXSandboxSetupGuidance` 仍只列 bubblewrap/socat/ripgrep，没有解释 Node 缺失。请补齐按诊断原因生成的可选修复指引，并保持 KodaX 现有用户无感自动回退：Electron 优先复用自身解释器，普通工具不能仅因 doctor 未就绪要求用户安装依赖后才能继续；沿原 Auto/Edits/Plan/Full Access 和 Exec Policy 授权继续，不能重复执行或把 fallback 冒充隔离执行。验收需覆盖 Linux 缺 Node、Electron PATH 无 Node、沙箱后端准备/启动失败，以及拒绝、Stop、执行状态未知不得自动重放。此处确认的是诊断指引缺口，未复现客户机器普通 Bash 自动回退失效。探针证据：`artifacts/diagnostics/sdk-alpha11/sandbox-guidance.json`。
