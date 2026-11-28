# Space builtin skill maintenance

> 2026-11-28 版本基线：Space `0.1.47-rc.4` / Registry SDK `0.7.97-rc.4`。内置 Skill 为 17 个：不再随包发布 `huashu-design`（固定上游快照已停止同步，其背景音乐与风格样张约 37 MB），需要它的用户可作为用户或项目 Skill 安装。本轮发布状态、验收与未关闭边界见 [rc.4 发布记录](releases/v0.1.47-rc.4-release-readiness.md)；下方 beta.3 与更早的基线记录保留原语境。

> 2026-11-14：当前工作树已升级为 SDK `0.7.97-beta.9`（Registry），见 [beta.9 适配](releases/kodax-beta9-space-adaptation.md)、[beta.8 适配](releases/kodax-beta8-space-adaptation.md)、[beta.7 适配](releases/kodax-beta7-space-adaptation.md)；下方 alpha.5 发布准备记录保留原语境。

> 2026-11-21 版本基线：Space `0.1.47-beta.3` / Registry SDK `0.7.97-beta.13`。内置 Skill 脚本在打包版中从 `app.asar.unpacked` 运行，脚本依赖的 npm 包（yaml、fflate）一并解包并由打包 smoke 校验；Windows 注册等待占用 `extensions.json` 的扫描器；集成健康（含 Skills）每 2 秒走 Host 轻量健康查询。Settings 的用户/项目 ZIP 与文件夹安装接受最多 32,768 个文件的技能（Issue 253）。本轮发布状态、验收与未关闭边界见 [beta.3 发布记录](releases/v0.1.47-beta.3-release-readiness.md)；beta.2/beta.1/alpha.5/alpha.4 基线记录保留为已发布历史，下方带日期的旧记录保留历史语境。

KodaX Space ships its own vetted skills from `resources/builtin-skills`. They are
installed with the application under `resources/builtin-skills`, registered
automatically at startup, and presented by Space as `builtin`.

The files stay outside `app.asar` deliberately. Skill-owned Python, Node, and
shell scripts need ordinary filesystem paths. Users do not need to install the
skill itself separately. Optional upstream workflows (for example browser,
video, TTS, or AI-review export pipelines) may still require their documented
Node/Python packages, Playwright browser binaries, `ffmpeg`, a POSIX-compatible
shell, or API credentials. Builtin delivery does not embed those external
command runtimes.

## Discovery with the Coder daemon

When Coder uses the shared Runtime daemon, Composer discovery merges two bounded catalogs:

1. the installer-owned Space builtin subset; and
2. the Runtime daemon Skill catalog.

The merge is by exact Skill name. A Space builtin is emitted first and wins a collision so the
entry shown in slash completion resolves through the same local registry used by `skill.invoke`;
duplicate rows are never shown. User/project precedence remains the KodaX registry's responsibility
and is not changed by this merge.

Failure remains fail-soft for discovery: if the local builtin subset cannot be read, Space returns
the daemon catalog; if daemon discovery fails, Space falls back to the complete local registry. The
IPC result still validates each item and keeps the existing 256-entry cap.

## Source of truth

- `resources/builtin-skills.sources.json` declares either an upstream repository
  and its approved redistribution inputs, or a Space-owned path under
  `resources/first-party-skills/`.
- `resources/builtin-skill-patches/` contains reviewable Space-specific changes.
- `resources/builtin-skills.lock.json` records the resolved upstream commit or
  content-addressed first-party revision, patch hashes, and SHA-256/size of every
  shipped file.
- `resources/builtin-skills/` is the generated, vendored snapshot.

Only content whose license permits copying, modification, and redistribution may
be added. A changed upstream license hash stops synchronization and requires
manual legal review.

## Updating from upstream

```bash
npm run skills:update
npm run skills:check
```

`skills:update` clones configured upstream branches or reads declared
first-party sources, verifies approved license hashes where applicable, rejects
symlinks, secrets, and dynamic-context shell tokens, applies Space patches, and
rewrites both the vendored tree and integrity lock.

## First-party platform expert skills

`feishu-office-suite` is the first Space-owned platform expert Skill. Its
editable source lives in `resources/first-party-skills/feishu-office-suite`; the
generated copy under `resources/builtin-skills/` is the packaged artifact. The
Skill routes only to Partner's typed Feishu document and Base tools. It does not
replace connector authorization, expose a raw CLI, or claim support for the
rest of the Feishu product suite.

First-party revisions use `first-party:<sha256>` over the complete source file
manifest. `skills:check` therefore fails when either the authored source or the
generated packaged copy drifts from the lock.

Review the resulting diff before committing:

1. Read upstream release notes and the full current license.
2. Confirm the resolved revisions in `resources/builtin-skills.lock.json`.
3. Check that every Space patch still expresses the intended policy.
4. Run the skill-specific tests, `npm run typecheck`, and a real package smoke.

Recommended maintenance policy:

1. Update through a dedicated dependency-style pull request, never as an
   unreviewed side effect of a product change.
2. Resolve a new upstream Git commit only when intentionally requested; do not
   follow a moving branch during packaging.
3. Treat license-hash or patch-context changes as manual-review blockers.
4. Review upstream additions as executable supply-chain input, including nested
   scripts, binaries, prompts, network behavior, and external commands.
5. Land the regenerated tree, source manifest changes, patches, and integrity
   lock together.
6. Run the complete release gate on the final candidate. A previously packaged
   snapshot does not validate a newly synchronized tree.

The synchronizer performs a case-insensitive forbidden-text check after all
patches. An upstream rename or newly introduced signature must stop the update
for review; do not weaken the scan to make a moving patch pass. The MIT license
and upstream authorship remain in the shipped snapshot even though generated
user output carries no default tool promotion.

For a local preview of already installed sources:

```bash
npm run skills:update:installed
npm run skills:check:installed
```

This reads matching directories from `~/.agents/skills`. It is useful for local
inspection. The normal `skills:check`, release tests, and release builds reject
these `installed:` revisions; regenerate with `npm run skills:update` before
shipping so the lock records an auditable Git commit.

## Packaging regression guard

`scripts/smoke-pack.mjs` requires the packaged Space builtin file set to match
the integrity lock exactly, then compares every byte. It also verifies that
KodaX SDK builtin Markdown remains inside `app.asar`, that every KodaX builtin
Skill file is present in `app.asar.unpacked` (builtin scripts run under a real
`node`), and that every package a builtin Skill script imports (for example
`yaml` or `fflate`) is unpacked under `app.asar.unpacked/node_modules`. Source
synchronization also rejects broken or escaping local Markdown links. A missing
or unexpected resource, stale patch, invalid link, or changed byte fails
validation instead of producing a partially working release.

The current release gate and artifact expectations are tracked in the
[v0.1.43 release-readiness checklist](releases/v0.1.43-release-readiness.md).

## Current license exclusion

The locally installed `pdf`, `pptx`, `xlsx`, and `docx` skills carry Anthropic
terms that explicitly prohibit retaining, copying, modifying, or distributing
the materials outside the service. Those copies must not be vendored into
KodaX Space. Use a redistributable implementation or obtain explicit
redistribution permission before adding equivalent builtin skills.

F137 plans independent Chinese-first `docx`, `pdf`, `xlsx`, and `pptx`
implementations for `v0.1.61`. Their design starts from Space's own document
contracts and public format/library documentation; a later capability-only
comparison is recorded without copying or translating proprietary prompts,
code, examples, assets, tests, or structure. GA uses bounded Worker/child-process
inspection and execution, cancellable jobs, and truthful validation while
delivering complete format workflows. F137 owns reusable native PPTX mechanics;
F129 later reuses them for Studio and target-Office verification. Adapter-backed
OCR/recalculation/render operations remain unavailable only when their adapters
or functional/fidelity fixtures do not qualify; the post-v0.5.x F138 OS sandbox
is not a prerequisite. First-party authored sources are kept separate from
generated builtin snapshots. See
[the v0.1.61 design](features/v0.1.61.md).
