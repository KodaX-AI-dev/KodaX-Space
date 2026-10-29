# 如何在保留发布质量门禁的同时缩短 CI 与 release？

结论摘要：当前配置存在相同检查重复执行、Node/Electron 原生模块 ABI 往返和重复打包 smoke；优先消除这些重复，再评估下载缓存、安装包上传压缩和 E2E 分片。跨 workflow 复用必须绑定同一个 commit 与成功的 run，不能把“最近一次绿灯”当成发布证据。依据见下文仓库行号及官方文档。

调研日期：2026-10-29。范围：本地工作区配置与第一方文档；未运行测试或 workflow、未修改配置、未读取凭据。本文不包含线上 Actions 耗时统计，收益均需由对应 step 的实际耗时确认。仓库引用是调研时工作区的行号，工作区存在用户未提交改动。

## 已确认的配置事实

| 事实 | 一手证据 | 优化含义（建议） |
| --- | --- | --- |
| `ci` 的 Windows/Linux shard 1 执行 typecheck 和完整 `npm test`；`build` 又在 Windows/Linux/macOS 执行相同检查。 | `.github/workflows/ci.yml:82–105`；`.github/workflows/build.yml:41–60` | 让 build 负责三系统源码质量检查，让 ci 的两个分片都直接进入 E2E；先消除 Windows/Linux 的完全重复工作。 |
| `typecheck` 自带 `build:packages`，workflow 又提前执行它；release 的平台 build 命令还会通过 `build:smoke` 再执行一次。 | `package.json:21–38`；`.github/workflows/release.yml:82–89,119–120` | 明确每个 job 的构建入口，去掉重复调用。不要删除仍被后续 TypeScript/package resolution 依赖的首次构建。 |
| `pack.mjs` 的正常 release 路径已执行 `runProductSmokes()`，其中包含 `scripts/smoke-pack.mjs`；release workflow 另有一次 `npm run smoke:pack`。 | `scripts/pack.mjs:98–103,148–159`；`.github/workflows/release.yml:146–149` | 每个平台保留一次相同打包 smoke。Windows boot/complete-exit smoke 是独立检查，不能一并删除。 |
| 桌面单测先保证 SQLite 的 Node ABI，E2E 和 pack 再保证 Electron ABI；ABI 不匹配时，默认从源码重编译。 | `apps/desktop/package.json:11`；`scripts/e2e-run.mjs:6–11`；`scripts/pack.mjs:151–154`；`scripts/ensure-sqlite-native.mjs:108–153` | 将 unit 与 E2E/package 放在独立 runner，可能减少 ABI 往返；不要把未经验证的原生预编译包开关当成默认加速方案。 |
| 所有 workflow 已配置 npm 缓存，但没有 Electron/electron-builder 的显式下载缓存。 | `.github/workflows/ci.yml:63–71`；`.github/workflows/build.yml:27–35`；`.github/workflows/release.yml:68–76` | “开启 npm cache”不是新增方案，应检查实际命中与 Electron/toolset 下载。 |
| 当前 E2E 为 `workers: 1`、`fullyParallel: false`，Windows/Linux 各有两个 runner 分片；CI 重试次数为 2。 | `playwright.config.ts:22–27`；`.github/workflows/ci.yml:45–60` | 优先保留单 runner 的进程隔离；扩大分片前测量最长 spec 和分片不均衡。 |
| lint 只在 release workflow 内执行，且每个平台执行一次；build/ci 未包含 lint。 | `.github/workflows/release.yml:88–89`；`.github/workflows/build.yml`；`.github/workflows/ci.yml` | 将 lint 前移为源码质量门禁，避免出包时才发现静态错误；单次运行能否覆盖所有平台应以规则是否环境相关为准。 |
| release 发布 job 仅 `needs: build`（同 workflow 的安装包矩阵），没有依赖另两个 workflow 的绿色结果。 | `.github/workflows/release.yml:197–201` | 新方案应明确“源码 CI 成功 + 四平台产物验收成功”才发布，避免把人工等待误认为已有机器门禁。 |

## 平台能力与实施取舍

### 1. 缓存应针对实际下载与 ABI，而非笼统缓存 node_modules

`actions/setup-node@v4` 的 `cache: npm` 缓存包管理器的全局下载数据，不缓存 `node_modules`。现有配置命中该缓存也仍需 `npm ci`、安装脚本以及原生模块准备。[setup-node v4：Caching global packages data](https://github.com/actions/setup-node/blob/v4/README.md#caching-global-packages-data)

Electron 官方列出独立二进制缓存目录：Linux 为 `~/.cache/electron`，macOS 为 `~/Library/Caches/electron`，Windows 为 `%LOCALAPPDATA%/electron/Cache`；`electron_config_cache` 可覆盖路径。electron-builder v26 文档也演示单独持久化 Electron 与 electron-builder 下载目录。因此建议缓存下载目录，按 OS、架构和工具版本/lockfile 隔离，实测恢复成本与下载成本后保留。[Electron：Cache](https://www.electronjs.org/docs/latest/tutorial/installation#cache)；[electron-builder v26：Docker](https://www.electron.build/v26/docs/features/multi-platform-build/#docker)

本仓库会在 Node 与 Electron ABI 间切换。若以后缓存编译后的 SQLite binding，缓存键至少要区分 OS、CPU 架构、运行时 ABI、SQLite 版本及构建环境，恢复后仍运行已有加载验证；此为基于当前代码的实施建议，并非已验证加速效果。优先避免 ABI 往返，比新增复杂原生二进制缓存更简单。依据：`scripts/ensure-sqlite-native.mjs:67–74,108–157`。

Playwright 官方不建议默认缓存浏览器二进制：恢复时间可能接近重新下载，Linux 系统依赖也不能通过该缓存解决。本项目使用 `_electron` API，配置中也没有浏览器安装步骤，不能把增加 Chromium 缓存当成主要优化。[Playwright：Caching browsers](https://playwright.dev/docs/ci#caching-browsers)；`playwright.config.ts:3`；`.github/workflows/ci.yml:61–125`。

### 2. 扩大 E2E 分片前，先移除分片 1 的额外单测负担

Playwright 支持 `--shard=x/y` 在独立机器分配测试；未启用 `fullyParallel` 时按文件分配，大 spec 可能使分片不均衡。本仓库 shard 1 额外承担 unit/typecheck，因此先去掉重复负担，再由测试报告决定是否从两片增加到三片或四片。新增分片会重复安装和构建，不能承诺按分片数线性加速。[Playwright：Balancing Shards](https://playwright.dev/docs/test-sharding#balancing-shards)；`.github/workflows/ci.yml:82–105`。

三个 workflow 当前都设 `fail-fast: false`。GitHub 的 `fail-fast: true` 会取消矩阵中仍在运行或排队的其他 job；它能缩短已失败一轮的资源消耗，但不会让正常成功的一轮更快，也会丢失其他平台的诊断机会。建议 release 保留完整矩阵证据，不把 fail-fast 当成核心提速措施。[GitHub：Handling failures](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations#handling-failures)；`.github/workflows/ci.yml:44`；`.github/workflows/build.yml:20`；`.github/workflows/release.yml:45`。

### 3. 取消过时 CI，避免它与最新提交抢 runner

GitHub 支持按 `concurrency.group` 分组，并用 `cancel-in-progress: true` 取消同组正在执行的旧运行。建议只给普通 PR/branch CI 使用 `workflow + PR号或ref` 的组键；保留 workflow 名可避免 build 与 ci 相互取消。tag 发布独立处理，不能让新提交取消已经进行的安装包发布。该方案改善连续推送时的排队与浪费，不减少孤立一次运行的计算量。[GitHub：Control concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency#using-concurrency-in-different-scenarios)

### 4. 安装包上传可先试 compression-level: 0

当前 installer 上传没有指定压缩级别，因此使用 upload-artifact v4 默认级别 6。官方支持设为 0，并建议对难再压缩的大文件这样做。建议针对 exe/dmg/AppImage/deb/zip 的 artifact 上传测一次 0 与默认值，比较压缩耗时、体积和传输时间；不要同步取消日志/文本报告的压缩。Windows fallback zip 另有 `Compress-Archive -CompressionLevel Optimal`，其收益须另测。[upload-artifact v4：compression level](https://github.com/actions/upload-artifact/blob/v4/README.md#altering-compressions-level-speed-v-size)；`.github/workflows/release.yml:140,183–195`。

### 5. 同一 SHA 复用 CI 结果，比再次执行源码门禁更有潜力

建议发布分成两类证据：同一提交的源码质量证据（lint/typecheck/unit/source E2E），以及每个 OS/架构的实际安装包验收。tag 解析出的完整 SHA 必须与成功源码 CI run 的 `head_sha` 对应；不能复用 PR merge SHA 的成功结果来代替另一个发布 SHA。平台/依赖条件不同的检查不能直接省略，例如现有 build 的 macOS runner 与 release 的 Intel macOS runner 不同。依据：`.github/workflows/build.yml:23`；`.github/workflows/release.yml:47–65,151–170`。这是建议架构，当前尚未实现。

若采用 `workflow_run`，必须注意：它的默认 `GITHUB_SHA` 是默认分支最新提交；`workflows: [ci, build]` 表示任一 workflow 完成即可触发，并不代表两者都成功；完成事件也不等于成功，需要显式检查 conclusion。因此不要只改一个触发器就宣称实现“全绿再发布”。建议使用统一汇总 gate 或显式查询同 SHA 的必需 workflows，缺失/失败/取消一律阻止发布。[GitHub：workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)

跨 run 取 artifact 可使用 `download-artifact@v4` 的 `run-id` 和具有读取权限的 token。建议保存明确的 run ID、artifact ID/摘要、SHA、版本和平台，而非下载同名“最新”产物；发布前校验成功状态与版本。GitHub 也明确警告 `workflow_run` 可获得写权限，不应执行来自不可信上游的代码。优先使用本仓库受信 main/tag 的产物来源，并让发布步骤只处理已校验文件。[download-artifact v4：Other workflow runs](https://github.com/actions/download-artifact/blob/v4/README.md#download-artifacts-from-other-workflow-runs-or-repositories)；[GitHub：workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)

单 workflow 内使用 `needs` 汇总更直接：它要求依赖 job 成功，但依赖失败会导致下游跳过。若汇总 job 是 required check，应让它在依赖结束后始终执行并显式检查所有必需结果；发布 job 再依赖汇总成功。不要只依赖被跳过的 job 来表达失败。[GitHub：Using jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs#defining-prerequisite-jobs)；[GitHub：Handling skipped but required checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks)

### 6. 路径过滤不能让 required check 永远等待

GitHub 区分 workflow 被路径/分支过滤跳过与 job 被条件跳过：前者关联 check 可停在 Pending 并阻塞合并，后者报告 Success。若以后跳过文档改动的重型 CI，应保留始终运行的汇总检查，明确哪些 job 本轮可跳过；不能直接给 required workflow 添加 `paths-ignore` 就结束。[GitHub：Handling skipped but required checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks)

本项目内置 skill 的 Markdown 属于产品资源，`skills:check` 进入 build/test，因此不能用宽泛 `**/*.md` 过滤“文档修改”。建议只在验证过边界后考虑特定纯文档目录。依据：`package.json:32,34–37,50`。

### 7. Node 单测也可以跨 runner 分片，不必先提高单机并发

`.nvmrc:1` 固定 Node 22.23.1；该版本官方支持 `node --test --test-shard=1/2` 与 `2/2`，按测试文件分配分片。可让每个独立 runner 保持现有 `--test-concurrency=1`，缩短长单测套件的串行时间。分片按文件划分，不能保证耗时平均；也不会自动覆盖被遗漏的 workspace 或脚本测试。[Node 22.23.1：--test-shard](https://nodejs.org/download/release/v22.23.1/docs/api/cli.html#--test-shard)；`apps/desktop/package.json:11`；`package.json:49–50`。

建议先对最慢的 desktop 单测尝试两个独立 runner 分片，并确保 `scripts/test/*.test.mjs`、IPC schema 与 UI kit 测试仍有完整归属。实现时将 shard 参数放在真正的 `node --test` 调用上；当前根 `npm test` 是串接 release scripts 与各 workspace 的命令，不能假定在根命令尾部追加参数就会正确传到每一个测试进程。保留全部原有测试清单，并核对分片测试总数。依据：`package.json:49–50`；`apps/desktop/package.json:11`。

Node 的进程隔离会把各文件放进独立子进程，`--test-concurrency` 控制并行文件数；这种隔离不等于隔离磁盘、系统 keychain 或守护进程。建议先保留 concurrency 1，后续只对已证明不共享外部资源的测试组试 2；不要直接把整个桌面套件改为按 CPU 数并发。独立 runner 分片也会新增 npm install/native 准备成本，需要比较端到端时长。[Node 22.23.1：Test runner execution model](https://nodejs.org/download/release/v22.23.1/docs/api/test.html#test-runner-execution-model)；`apps/desktop/package.json:11`；`.github/workflows/ci.yml:18–20`。

## 建议落地顺序

1. **先做重复工作清理**：ci 分片移除 build 已覆盖的完整 unit/typecheck；清理重复 `build:packages` 与重复 `smoke:pack`；lint 前移。保留三系统单测和四个安装包平台的独立验收。依据：上述“配置事实”表。
2. **再做低侵入实验**：installer artifact 压缩级别 0、Electron/toolset 下载缓存、旧 CI concurrency cancellation；每项独立比较同类 run 的 step 耗时。依据：上述平台能力 1、3、4。
3. **最后改发布依赖关系**：同 SHA 的源码 gate 只验证一次，安装包矩阵继续检查真实产物，汇总成功后发布；流程固定后再决定增加 E2E 分片。依据：上述平台能力 2、5。

## 未证实

- 哪一个优化能节省多少分钟：本文未读取线上 step timing，不能给出具体百分比或目标时长承诺。
- 当前队列是否受并发配额限制、缓存实际命中率及上传压缩占比：需要 Actions 运行记录。
- 单测与 E2E 分离后节省多少 SQLite 重编译：代码支持该机制推断，但需要日志中实际 ABI rebuild 耗时确认。
- 直接上传 frontend/main 中间产物供所有平台复用是否净收益为正：需确认平台差异、artifact 传输成本及构建环境；当前不建议先做。

## 未解问题

- required checks 与分支保护实际配置是什么？重命名/合并 jobs 时需同步，避免旧名称阻塞。
- 应保留几种 macOS 源码测试环境？仅合并完全重复的 Windows/Linux 工作可先做；取消 Intel/macOS 独立测试需要覆盖证据。
- 用户感受到的总等待中，线上计算、排队、flake 重跑以及本地预检查各占多少？应分别统计，避免用总 runner-minutes 代替发布时间。
- 是否希望发布自动等待同 SHA 全部 CI 完成？当前 YAML 尚未建立这个跨 workflow 门禁，实施时需把该行为写入方案。
