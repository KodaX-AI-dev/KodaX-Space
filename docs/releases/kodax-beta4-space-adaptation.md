# Registry SDK 0.7.97-beta.4 的 Space 适配

2026-11-08。Root 和 Desktop 精确依赖 `@kodax-ai/kodax@0.7.97-beta.4`。
lockfile 使用 npm Registry URL，SHA-512 为
`yFW6U+NHpIflGmKX7p8I/jxMyPYbgTFIbG7sLtSDqSMvXWKidIXy5ixHda/BrGmaoqmPvqdW44Xi5wbEgfWOnA==`。
上一版接入见 [beta.3 记录](kodax-beta3-space-adaptation.md)。

## SDK 变化与 Space 处理

| beta.4 变化                                                                                                           | Space 处理                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 历史轮次契约 v2：`resolveHistoryTurn` 就绪结果即完整操作目标（Session、轮起点、`kind:'turn_end'` 轮尾、expectedHead） | IPC 新增 `HistoryTurnTarget`。Fork 传 `turn`，回退确认传 `{selector, turn, activeRunId}`，Main 原样以 `{turn}` 交给 Runtime，不再拼装边界或单独传 expectedHead                            |
| `status:'stale'` 改为 `resync_required` 错误，`data.reason` 为 4 种闭集原因                                           | Adapter 按 code 与 `data.reason` 识别，不解析消息文本。解析返回 `stale{reason}`，Fork 返回 `{changed}`，回退返回 `target_changed`；已停止运行后变化为 `stopped_history_changed`           |
| 活动运行仍为 `conflict`                                                                                               | 回退区分为 `session_busy`（新增提示）与停止后未确认的 `stop_unconfirmed`，不再与“记录已变化”混用                                                                                          |
| 不可用原因闭集新增 `incomplete_turn`                                                                                  | IPC 枚举与 SDK 一致，界面提示“这一轮还有未完成的工具调用”                                                                                                                                 |
| `productHistoryLocation` v2：每页按需给 `newerCursor`；`cursor` 与 `around` 互斥；读取支持 `timeoutMs`                | `hasNewer` 改由 `newerCursor` 判定，读取选项按互斥联合构造，历史读取与轮次解析带 15 秒预算                                                                                                |
| SDK 能力常量成为公开类型；`ensure` 支持 requirements                                                                  | 启动门禁直接读取类型化常量并要求两项历史能力 v2，daemon requirements 同步；较旧的空闲 Host 由 SDK 启动器升级。成品冒烟（`scripts/smoke-pack.mjs`）同样要求并核验打包 Host 协商到这两项 v2 |
| 分页读取过期也使用 `resync_required`                                                                                  | 既有读取路径已将其映射为 `data_changed`，重新读取最新页，无需改动                                                                                                                         |
| `loadAgentsFiles` 恢复只返回 AGENTS.md；规则改由 `loadInstructionFiles` 提供                                          | Space 编辑器继续用 `loadAgentsFiles`。规则片段由 Host 注入提示词，Space 不读写                                                                                                            |

## 同时修复

- **AGENTS.md 保存路径。** SDK `scope` 表示优先级而非位置：`<project>/AGENTS.md` 为 `directory`，`<project>/.kodax/AGENTS.md` 才是 `project`。Space 原先按 scope 推导写入路径，编辑 `.kodax/AGENTS.md` 会覆盖根目录 AGENTS.md；根文件已存在时仍显示“新建项目文件”，保存模板会覆盖它。beta.3 中规则片段也以 `project` 出现，同一缺陷会把规则内容写进 AGENTS.md。现在保存按精确路径，Main 仅允许 `~/.kodax/AGENTS.md`、`<project>/AGENTS.md`、`<project>/.kodax/AGENTS.md`；加载与保存使用同一全局目录。
- 旧的 Fork 调用方（菜单、右键、底栏、会话流）处理结构化 `{changed}`，显示“记录已变化”而非通用错误。

- **Partner 历史轮次（PF014）。** 非 Mock 的 Partner 会话本就运行在共享 Runtime 上，此前只是渲染端把它排除在 SDK 轮次路径之外。现在 Partner 与 Coder 同样经 `resolveHistoryTurn` → `{turn}` Fork/回退；Main 对所有 Runtime 会话拒绝旧边界回退。Fork 子会话保留 Partner 工作面、专家快照与连接器范围。Mock 会话保持脚本路径。见 [Partner PF014](../partner/features/v0.1.0.md#feature-pf014)。
- 源码 E2E 中过期回退用例仍按 beta.3 形状构造 `confirmedTurn`，已改为 beta.4 `{selector, turn, activeRunId}`，并断言 `target_changed`。

## 此前适配验收（2026-11-08，主线整合前）

| 检查             | 结果                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 完整 `npm test`  | Desktop 4,191 通过 / 1 失败 / 13 跳过（4,205）；Schema 372/372；另一工作区 147 通过 / 7 跳过。唯一失败为不稳定用例，见 [Issue 238](../ISSUES_ARCHIVED.md)                                                             |
| 类型、lint       | 通过                                                                                                                                                                                                               |
| 源码 Electron    | 13 个历史、Fork/回退、模式及退出场景一次通过（retries=0），含新增 Runtime Partner 回退与 Fork 场景                                                                                                                 |
| Registry 一致性  | 打包门禁从 npm 重新下载锁定 tarball，SHA-512 与全部已安装 SDK 文件核对通过。当日网络约 30 KB/s，以 `SPACE_PACK_REGISTRY_TIMEOUT_MS=1200000` 延长下载等待（默认仍 30 秒，校验内容不变）                             |
| 打包流程内置检查 | `smoke-pack` 全部通过，含打包 Host 协商历史契约 v2 两项能力；app.asar 中 Runtime 与 Worker 执行通过；冷启动 Renderer 6.7 秒就绪，确定性延迟后 Runtime 28.1 秒就绪，122 条历史子进程记录保留；完整退出场景 7 项通过 |
| Windows 打包应用 | 同一组 13 项一次通过（retries=0），含 Runtime Partner 回退与 Fork                                                                                                                                                  |

## 打包门禁等待时间

`scripts/kodax-runtime-release-gate.mjs` 新增 `SPACE_PACK_REGISTRY_TIMEOUT_MS`（正整数毫秒），仅延长 Registry tarball 下载等待；未设置时为 30 秒，非法值直接报错。

## 未改动项

- 沙箱能力仍为 v11；beta.4 的 Windows ACL 排除、默认模型与孤立 tool_use 修复属于 SDK 内部，Space 无需改动。
- 打包资源与 beta.3 相同（CLI 内嵌 manifest 的压缩不影响 SDK 包内资源），beta.3 已验收 asar 内读取。
- Space 无 Retry 入口，未接入 `{turn, before:true}`。

## 本次主线整合与复验

原未提交适配先保存为检查点，再与远程主线整合。最终代码为 `74f55ee8`，基线为已推送到 `origin/main` 的 `351d3b90`；包含最初缺少的 18 个提交及验证期间新增的历史滚动修复。收尾时又接收远程文档补记 `b9961ae6`，仅更新原 beta.3 的验收记录，未改变本次验证的运行时代码。只接收已进入远程主线的提交，没有修改 `codex/alpha4-release-final` 分支或其工作树。

AGENTS.md 冲突同时保留精确路径保存与 Main 写入白名单、非目标来源只读保护和 512 文件集合上限。规则继续由 Host 加载，不作为 beta.4 AGENTS.md 编辑草稿。更新现行说明，保留 beta.3 历史验收记录。

| 检查                       | 结果与范围                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 初轮完整 `npm test`        | 接收 `351d3b90` 前：4,719 通过、20 条件跳过、0 失败；Desktop 4,196/13 跳过，Schema 373，发布脚本 150/7 跳过。此前 Issue 238 本轮未复现，不据此关闭不稳定性记录 |
| 最终类型、lint、格式、构建 | `npm run typecheck`、`npm run lint`、改动文件 Prettier 检查和 `npm run build:smoke` 全部通过                                                                   |
| 最终浏览器回归             | 接收 `351d3b90` 后，历史导航与 AGENTS.md 两个浏览器测试文件 7/7 通过                                                                                           |
| 源码 Electron              | 初轮 24/24；接收新增滚动修复后，对规则、历史定位、Fork/回退、Partner、排队、Stop 与退出再验 10/10；全部 `retries=0`                                            |
| 最终 Windows 目录包        | `node scripts/pack.mjs --win --dir` 通过；Registry tarball 与已安装 SDK 内容完整性核验、asar Worker、原生资源、Host 历史契约 v2 检查均通过                     |
| 最终冷启动                 | Renderer 5,202 ms 就绪；Runtime 在确定性延迟后 26,717 ms 就绪，122 条历史子进程记录保留                                                                        |
| 最终成品 E2E               | 打包内置 7 项与补充 15 项，共 22/22，全部 `retries=0`；覆盖 Coder/Partner、专家、规则编辑、历史操作、排队恢复、Quick Ask、Workflow、Host UI 和退出             |

完整测试没有在接收 `351d3b90` 后再次全量运行；该提交的交集由最终浏览器及源码/成品定向验收覆盖。本轮未进行 beta.4 的 macOS/Linux 实机验收，也未创建新标签、发布 Release 或上传安装器。

日志在忽略目录 `artifacts/diagnostics/`：`beta4-main-integration-tests.log`、`beta4-main-integration-e2e-source.log`，以及 `beta4-main-integration-final-{typecheck,browser,lint,build,pack,e2e-source,e2e-packaged}.log`。

## Standards

初评发现用户手册与应用内主题仍描述 beta.3 规则片段编辑器，已同步为 beta.4 的规则加载与 AGENTS.md 三路径编辑边界。最终 `351d3b90...74f55ee8` 静态复查：成文规范剩余问题 0，坏味道基线剩余发现 0。

## Spec

最终静态复查确认完整 SDK 轮次目标、过期与忙分流、游标、能力协商、AGENTS.md 白名单及 PF014 符合设计。变基后的 beta.4 补丁与初轮等价，保留上游手势触发翻页与 beta.4 Fork 变化提示。需求轴剩余问题 0；运行时证据以以上实际验收范围为准。
