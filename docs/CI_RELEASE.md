# CI 与发布候选验证

## 执行结构

同一提交的三个 workflow 并行推进：

- `build`：独立 lint；Windows、Linux、macOS arm64、macOS Intel 各执行一次 typecheck、完整单测和源码构建。`typecheck` 自带 workspace packages 构建，不再额外重复调用。
- `ci`：Windows/Linux 各两个 E2E 分片，保持每个 runner 单 worker。E2E 不等待慢单测，也不再重复执行单测。每个 Windows runner 独立预热已有 SDK native artifact 检查，避免依赖另一 job 的机器状态。
- `release`：同时启动源码资格检查与四平台打包。打包成功后保存安装包和可运行的 tar 归档，另起验收 job 运行现有 packaged SDK acceptance。公开发布必须同时通过源码资格、打包、验收三道门禁。

`release` 不再重复完整单测、typecheck、lint或 `smoke:pack`（`pack.mjs` 内已经运行后者）。本地打包脚本及其 Windows boot/complete-exit smoke 保持原有行为。

## 发布步骤

1. 在同一提交中确定源码、版本、lockfile与changelog；提交进入main时会启动 `ci` 和 `build`。
2. 可以在这些检查尚未完成时推送指向该提交的版本tag。release会开始打包，并等待同SHA的源码检查；不必人为等CI全部通过才启动打包。
3. 源码资格检查只接受本仓库、同一完整SHA、指定workflow路径的main push或手动运行。它还检查全部实际job成功，包括Intel，不能用只有汇总绿灯的文档跳过冒充完整验证。
4. 如果没有对应的源码运行，或仅有文档跳过，release会各dispatch一次完整 `ci`/`build`。手动dispatch始终执行全量检查。若候选ref在此期间移动到另一SHA，该运行不能放行原候选；等待有界，最终失败。
5. 已失败、取消或超时的源码检查会阻止发布，不自动反复重试直到绿。发布前再次核验记录的run、attempt、SHA和全部job。
6. `workflow_dispatch` 的release仅验证和保存候选，**即使选择tag也不创建公开Release**。只有 `push v*` 路径在全部门禁通过后发布。

首次部署此配置时，需先将包含新workflow及脚本的变更合入默认分支，确保GitHub已识别两条源码workflow的dispatch入口。可以先用PR检查验证源码，再用分支上的release dispatch验证四平台候选；不能用PR合成merge SHA代替待发布branch/tag SHA。

## 失败后的最小重跑

| 失败位置 | 操作 | 已完成的工作 |
| --- | --- | --- |
| 某个源码job | 在对应ci/build运行中重跑失败job，随后重新运行release的源码资格job及其下游 | 不需要重打已成功的候选包 |
| Packaged acceptance | 重跑失败的验收job及下游发布job | 从同一次release运行的candidate artifact恢复，无需重新打包 |
| 打包 | 重跑失败打包job及下游验收 | 成功平台可继续复用；验收必须匹配实际产物 |
| 上传或发布API | 重跑失败job | 发布前仍会重验源码资格、验收回执与安装包哈希 |

推荐GitHub的 **Re-run failed jobs**，避免默认重跑全部成功job。源码或依赖变更需要新提交、新候选；不同SHA之间不能混用证据。

候选归档保留14天，安装包保留30天；过期后不能继续只重跑验收，需要重新构建和验收。若单独重建某个平台，旧验收回执与新归档/安装包指纹不符时发布会拒绝，需重新验收。源码run重跑会改变attempt，旧源码资格同样需要重新生成。

## 证据与指标

- `candidate-<os>`：`app.tgz` 与 `candidate.json`。tar保留macOS符号链接及执行权限；JSON记录仓库、SHA、版本、平台、release run ID、归档和安装包SHA-256。
- `installer-<os>`：安装包、更新清单与同一份候选JSON。上传使用 `compression-level: 0`，避免对已有压缩格式重复压缩。
- `accepted-<os>`：仅在验收成功后上传的候选JSON。发布要求它与安装包附带的JSON逐字相同，并复算安装包哈希。
- `source-checks`：两条源码workflow的run ID、attempt及源码身份，发布前在线复核。
- `playwright-results-*`、`packaged-sdk-results-*`、`packaging-smoke-*`：保留报告、失败截图和trace，成功重试也上传。JSON及summary记录首次通过率、flaky、失败、跳过、耗时p50/p95与最慢测试。这里p50/p95是**当前测试集合的用例耗时分位数**，不是多次发布的墙钟分位数。

SDK artifact/Host历史竞态不能仅凭这次流水线改造宣称已消失。保留原断言、超时与retry策略；使用上传证据定位并回归修复。持续观察多次运行的首次通过率，不能只看最终绿色状态。

## 无效运行与分支保护

只有变更集合完全由 `docs/research/**/*.md` / `*.json` 组成时，自动ci/build才跳过重任务；改动为空、未知base、产品文档、内置skills、代码、workflow或lockfile都执行完整检查。rename按旧路径和新路径一起判定。

始终运行 `CI gate` 和 `Build gate`；它们只允许明确的研究笔记分支跳过，不把失败/取消当作成功。推荐将这两个汇总检查作为分支保护的required checks；已有矩阵检查名称仍保留。当前仓库分支保护的read API返回404，未自动改动仓库规则。

PR使用workflow+事件+ref隔离的concurrency并取消旧运行。main与手动运行不取消正在执行的检查，因为发布候选可能正在等待它们；release按ref串行且不取消进行中的发布。GitHub自身同组pending队列仍可能替换尚未开始的运行，被取消的候选检查必须明确重跑，不会被当作绿灯。

## 验证

本地回归入口（无需GitHub写权限）：

```text
node --test scripts/test/ci-changes.test.mjs scripts/test/ci-source-gate.test.mjs scripts/test/ci-report.test.mjs scripts/test/ci-tools-cli.test.mjs scripts/test/ci-workflows.test.mjs scripts/test/release-candidate.test.mjs
```

这些测试覆盖真实临时Git变更分类、本地HTTP模拟的GitHub边界、失败/缺失/错误SHA/错误仓库/attempt变化、Intel缺测、校验和变更、重建后旧验收回执失效、工作流发布依赖与成功重试报告。

上线验收：

1. PR修改源码时四平台build和四个E2E分片都执行；研究笔记PR只有changes与两个gate执行。
2. 同SHA同时启动source checks和release dispatch，确认复用已有运行；缺失时仅dispatch一次，不重复全量单测。
3. 任意源码job失败、验收失败、证据缺失或篡改时不能创建Release。
4. 四平台从artifact还原的应用均通过现有验收；验收失败后重跑时确认build job没有再次执行。
5. 记录本轮首次通过率、source/build/acceptance的关键路径与归档传输时间，对照[调研基线](research/ci-release-optimization-2026-10-29.md)。25–35分钟只是初始目标，实际云端结果才是验收证据。

平台行为依据：[GitHub workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)、[artifact权限保留说明](https://github.com/actions/upload-artifact/blob/v4/README.md#permission-loss)，更多官方引用见[平台调研](research/ci-release-platform-options-2026-10-29.md)。
