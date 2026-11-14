# beta.2 历史与 Stop 后发送的根因复验

2026-11-05。基线 Space `de015cce` / Registry SDK `0.7.97-beta.2`。本轮对应用户要求：查清未闭环问题根源，区分 SDK 与 Space，并验证可行解决方案。队列行为以 `docs/features/SDK_0.7.97_MIGRATION.md` 的“相同队列不重复推送”为约束，保持 ADR-010 的公开 SDK 输出与修订边界。

## 已确认的 Space 根因

`CoderSessionProjectionReducer.replaceProductQueue()` 原先只和本次 reducer 已接收的 product queue 比较。新 reducer 尚未接收 product queue 时，已有 live 投影中的空队列与首次 Host 空队列虽然相同，仍被发布为 queue 变化并推进 projectionRevision。

冷恢复/空闲观察退休后，新的观察 bootstrap 再次走到这个分支；Renderer 收到基线版本尚未水合的 queue 增量而要求补读，补读及 Actor bootstrap 又打开/退休观察。一次对照约 21 秒捕获 252 次 Session observe、247 次 Actor tree 查询、259 次 queue 空增量，形成无实际输入变化的反馈循环。Host 因这些调用不断更新位置索引缓存和读写锁，其他历史读与后续准入撞上真实活跃的存储围栏。

最小修复：记录 product queue 后，再与当前投影的 queuedInputs 比较；相同则不 commit。真实新增、清空、recovery/admissionError 变化仍按原逻辑推进。没有改 SDK、没有放宽身份或 sourceRevision 校验、没有自动重发输入。

## 因果对照

- 正式 SDK 的单纯存盘历史、实际 Script 部分写入→Stop→冷 Host、双客户端观察、外部 loadSession、Script Read/Plan 拒绝前序、Actor 查询等无 Space 对照均通过；没有 Space 代码或真实外部账号。
- 同一 Space 会话、同一 Host，Main 存活时捕获历史 resync；只暂停该隔离 Main，连续读成功；恢复 Main，resync 再现。正文哈希不变，变动为 Host PID 写入的位置索引及锁。
- 应用单行修复后，Main 存活、暂停、恢复三种状态的原始 SDK 读取全部成功。撤掉该行反向复验，Main 存活/恢复时失败再次出现，暂停时仍成功；随后重新应用修复。
- reducer 回归先 RED 后 GREEN；两份投影/适配器单测 347 项通过。用公开 API 验证首次空队列、恢复后的相同非空队列、重复帧、真实新增/清空和失败分类。

保留的反向对照 `red-verified/` 在 22.2 秒内有 4,042 个 RPC（含 ACK）、201 次 Session observe、193 次 Actor tree、198 个空队列变化；`green-verified/` 在 19.8 秒内为 634 个 RPC、15 次 observe、14 次 Actor tree、0 个空队列变化，三个 Main 活动阶段的原始 SDK 读全部成功。两组都包含实际 Read/Plan 拒绝/Stop 执行，不是单纯对比空闲进程；这些是隔离场景的流量证据，不是模型性能或智能 benchmark。

原始脚本、RPC 方法名（无参数/凭据）、文件事件和 A/B/A 数据位于忽略的 `artifacts/diagnostics/beta2-rootcause/`，其中 `red-verified/` 和 `green-verified/` 保存独立原件。诊断暂停进程仅针对路径/PID 已验证的隔离测试 Main，均已恢复；产品不包含这些探针。

## 验证记录更正

上一轮将 `SPACE_E2E_PACKAGED_EXECUTABLE` 误当测试入口；实际 fixture 接受 `SPACE_E2E_EXECUTABLE`。因此之前标注的 29 项“成品界面”实际是源码 Electron，不能计作成品资格；打包脚本自带 6 项生命周期测试使用正确变量，仍属真实成品验证。本轮已用正确入口重跑，并核对实际 process.execPath、app.isPackaged 和包内 SDK 身份，最终结果见下文。

此前交接文档把原始历史冲突视为待 SDK 根因，证据不足；现有 A/B/A 已确认上述 Space 反馈循环，不应要求 SDK 放宽合法并发冲突来掩盖它。真正成品回归按下文逐轮记录，不把部分通过当作完整验收。

## 修复及重复验证

生产修复与回归提交 `ead06bfe1be7bd4fe27390c54b494627dae4b56d`。保留正式 SDK beta.2 原包，未修改 SDK 仓库或 node_modules。

- 源码 Script 冷恢复/观察后原始稳定读、两种 Host token 流式进度间的 Stop→下一次发送，各重复 5 轮，共 10/10 通过，retries=0、无跳过；旧取消请求不重放，第二条真实进入本地 Provider。
- 将独立 SDK probe 移到显式 Space 兼容 history 读取之前，再做两轮，2/2 通过；不是先 load 修好再冒充原始首读。探针与 Main 的实际 runtimeId 必须一致。
- 前期两次追加探针在冷 Host 重新就绪等待时超时，未到原始读取断言；失败现场保留。helper 现在无论成功失败都记录 before/after 连接事实，随后五轮及两轮 raw-first 均完成。没有扩大 45 秒等待、降低断言或以失败重试计作首次通过；本轮不声称修复全部 Host 启动性能，Issue 371 独立保留。
- typecheck、lint 通过；误用 `SPACE_E2E_PACKAGED_EXECUTABLE` 会在 native 重建/启动测试之前明确失败，正确 CLI 日志标明 source/packaged 模式。
- 重新打包通过；原生依赖、SDK/Artifact Worker、122 条历史子记录保留检查通过，真正成品的 6 项 SDK 生命周期测试通过。boot smoke 的 26.38 秒包含测试刻意的启动保持，不作为生产性能数据。

## 前台订阅的独立遗漏

真正打包的 32 项界面回归在第 12 项发现 Partner 的外部工作模式变更没有进入 UI。工作模式原子准入、Agent persona 与 shell 均通过，失败是空闲界面的 Host 状态新鲜度。去掉旧反馈循环后暴露出：`retireObservationIfQuiescent()` 也退休了当前显示的空闲会话，而旧循环意外承担了不断刷新的作用。

修复为显式保留一个前台会话订阅。前台 `session.liveSnapshot` IPC 传入 `retainObservation`；Main 按最新请求顺序保留前台会话，切换后按原有 settled 检查释放前一个，会话删除时清理；后台、历史与 Actor 的一次性读取默认仍可退休。Renderer 在 selection/Host ready/history ready 边缘请求，空闲历史首屏仍优先显示；mock 不接真实 SDK。每个前台边缘用已有 Map 合并一次补读，不能把一个旧的“曾经前台”请求当作当前的前台意图，否则 A→B→A 会丢失订阅。Renderer 未新增轮询定时器，也不依赖每一帧 live 投影驱动 effect。当前会话的既有 Actor 长轮询可随前台保留，后台会话继续按原条件退休；不是让所有历史会话常驻。

公开 SDK adapter 回归验证保留、切换释放和迟到响应不能抢占新前台。真实 Provider/Host 界面验证 Partner 缓存 A→B→A 后，另一个公开 SDK 客户端修改 idle workMode，UI 收到更新，下一次 Partner 输入由 Host 原子恢复 Agent。另有两项受控 IPC 用例刻意延迟后台请求和上一次前台请求，验证新前台补读不会被吞掉；此注入只证明 Renderer 协调，不冒充真实 Host 端到端测试。早期受控用例限制“总共最多三次读取”失败，是静态快照 fixture 同时触发其他合法协调，不能用该计数定位订阅丢失；已改为直接核对释放后新的前台 IPC 意图，观察退休和反馈流量另有真实对照断言。

五项源码针对性回归 5/5 通过、retries=0：Host CAS 工作模式、Partner 缓存切换、两种慢 IPC 时序和工具图片刷新恢复。旧提交 `ead06bfe` 的 build 全绿、CI 失败（两平台 Partner/Windows 工作模式显示陈旧，及工具图片恢复失败）；不以旧的 build 通过冒充 CI 全绿，也不把局部图片通过扩大为根因已全部覆盖。最终提交的 CI 和真正成品须重新核对。

## Standards

规范轴最终复审：硬违反 0、可行动 smell 0。新增测试长回调已拆分为具名 helper；没有新增配置、轮询或通用框架。

## Spec

需求轴发现的 raw-first 验证缺口已修复：显式 Space 兼容读取移至独立 SDK probe 之后，并完成两轮。前台订阅补读两个竞态已修复，需求轴复审残留 0；身份、正文引用、SDK seq/本地 revision 和真实并发拒绝均未放宽，不将 Host ready 等同于历史已加载。

## 最终代码与真正成品

生产修复提交 `ff4bdfa03023c369260631127d093ef3cd926cc4`，已推送 main。typecheck、lint 通过；当前 adapter 304 项与 projection 45 项分别通过，共 349 项、0 失败、0 跳过。

`npm run build` 成功，自带真正成品的 6 项 SDK 生命周期验证全部首次通过，保留正常的过期写入拒绝与其他客户端退出保护。随后使用正确的 `SPACE_E2E_EXECUTABLE` 运行完整 34 项专项界面 E2E，34/34 通过，retries=0、无跳过；覆盖上述两种慢 IPC 用例，及真实 Host 的模式、Partner、问题等待、Skill、任务报告、原文、队列取回、promotion、工具图片、历史滚动和 Workflow 单次结果。受控 IPC 的两例验证边界见上文。

实际进程为 `out/win-unpacked/KodaX Space.exe`，`app.isPackaged:true`，`appPath` 为 `resources/app.asar`，Node `24.17.0` / Electron `42.5.0`；独立原始 SDK probe 核对与 Main 重启后的 runtimeId 一致，包内 SDK 为 Registry `0.7.97-beta.2`。Main 与当前构建逐字节一致，555 个 Renderer 文件逐字节一致。122 条历史子记录在 boot smoke 后保留；26.43 秒包含测试刻意的启动保持，不是生产性能测量。

| 本地未发布产物   | SHA-256                                                            |
| ---------------- | ------------------------------------------------------------------ |
| app.asar         | `6ec58c3bf64bd040de8451d2983f60d2ec1a11e6f202c989061252e6bf1077f5` |
| Setup alpha.4    | `53d8207aec1f7a80eac1b4fa8663086c25a3bd28802f4978004973eac22d598b` |
| Portable alpha.4 | `6f51d6f7f1c4213d7473efa03eb9812fce2264552de5bb45965d69ead021664a` |

这是本地重新打包的验收产物；没有移动已发布 alpha.4 标签、替换 Release 资产或发新的 Space 版本。既有用户数据没有迁移或重写。核心三场景成品重复与最终提交的跨平台 CI 结果见下文。

### 追加重复、准备失败与 CI 下载

- 最终相同成品的 Script 冷重启/原始历史读、Host token 两阶段 Stop→下一次发送、Partner 缓存切换各重复三轮，9/9 通过，retries=0、无跳过，证据为 `foreground-packaged-repeat-diagnostic/`。
- 中途 `foreground-packaged-repeat/` 为 5 通过、1 失败、3 未运行：第二个 Partner starter 的模板在测试 fill 后迟到，实际 UI 与 Provider 都收到“默认模板＋标记”。专家 chip 已出现不代表模板已写入；测试现在在 A/B 两次 starter 后明确等待 textarea 的模板值，再填入精确标记。不是修改发送行为或放宽精确历史断言。
- `foreground-packaged-repeat-ready/` 为 2 通过、1 失败、6 未运行：首次 Partner 输入显示独立 Provider 超时/恢复耗尽，本地 Provider requests/errors 均空，未出现历史 `resync_required`/`session_data_changed` 证据。本次尚未复现其稳定根因，不将它归入已确认的队列反馈根因，也不擅自认定 SDK 缺陷。测试新增仅失败时读取公开 Provider/live 状态和 Main 对 fixture `/models` 的连通性；诊断失败单独记录，始终保留原异常。后续完整三轮 9/9 通过不抹去该次失败。
- `ff4bdfa0` 的 macOS Intel build 失败明确发生在 `space-artifact-extension.test.mjs` 首次 require Electron：Electron 42 改为懒下载，二进制下载卡满 300 秒单测截止；日志为 `Downloading Electron binary...`。已在 build/ci 的源码 runner 上将官方源 Electron 下载放到独立的有界 10 分钟前置步骤，保留原矩阵、测试截止和失败门禁。回归先 RED 后 GREEN，workflow 契约 5/5；并未扩大全局单测等待或跳过测试。
- `1a0bada08b2b9f62a6b7a1fe7c5bd2bf17f8a918` 仅包含上述 CI/测试准备与取证改动；生产源码和本地安装包仍为 `ff4bdfa0`。lint 通过，规范/需求复审均 0 残留。已失败且被新配置取代的旧 build 停止剩余工作，原日志保留；旧 source CI 不以此取消，最终按实际完成结果记录。

最新验证以同 SHA 的 build `41976738355` 和完整 CI `41977334223` 为准；原排队的重复 push CI 已取消。

追加独立 Partner 十轮（相同成品、独立 profile、retries=0）10/10 通过，未触发超时取证；这不补造此前那次连接失败的根因。生产提交 `ff4bdfa0` 的完整 source CI `41974573000` 全绿：Windows 两 shard 为 89/88 通过、各 7 个既有条件跳过；Linux 为 95/89 通过、1/6 条件跳过，无 flaky/retry 记录。新提交的完整 CI 使用同 SHA 的 workflow_dispatch `41977334223`，取消的 `41976738365` 仅为尚未开始的重复 push 批次；没有取消旧的健康 source CI 或跳过矩阵。

### 最终构建日志核对

`1a0bada0` 的 [build 41976738355](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/41976738355) 全绿，四平台完整单测均 0 失败、0 取消，类型检查与 Renderer/Main 构建通过。以下每行是一份平台运行的独立统计，不把跨平台重复运行相加为不同用例。

| 平台        | 用例  | 通过  | 条件跳过 | 失败 / 取消 |
| ----------- | ----- | ----- | -------- | ----------- |
| macOS Intel | 4,677 | 4,635 | 42       | 0 / 0       |
| macOS ARM64 | 4,677 | 4,635 | 42       | 0 / 0       |
| Windows     | 4,674 | 4,587 | 87       | 0 / 0       |
| Ubuntu      | 4,668 | 4,560 | 108      | 0 / 0       |

全仓 `npm run format:check` 报 507 个既有文件的格式问题；与本轮从 `de015cce` 开始的变更及当前未提交文档交集为零。本轮全部修改文件的 Prettier 检查通过。没有为取得一个全仓格式绿灯去批量改写无关代码或 Skill 内容。

### 最终完整 CI

`1a0bada08b2b9f62a6b7a1fe7c5bd2bf17f8a918` 的 [完整 CI 41977334223](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/41977334223) 全绿：

| 平台 / shard | 通过 | 既有条件跳过 | 失败 / flaky |
| ------------ | ---- | ------------ | ------------ |
| Windows 1/2  | 89   | 7            | 0 / 0        |
| Windows 2/2  | 88   | 7            | 0 / 0        |
| Linux 1/2    | 95   | 1            | 0 / 0        |
| Linux 2/2    | 89   | 6            | 0 / 0        |

四个 job 的最终日志均无 retry 记录，完整矩阵与门禁保持，没把平台条件跳过或重试当作首次通过。最新真正成品主包与 Main/555 个 Renderer 文件指纹一致；`ff4bdfa0` 之后只改 CI、测试与文档，未引入第二 Runtime、Session 写入者、SDK 补丁或自动重发。

已确认的两个问题按 Space 根因闭合，未发现需要 SDK 变更的确定项；此前把它们直接归因 SDK 的结论撤回。一次独立本地 Provider 超时仍未稳定定因，十轮额外验证通过不能为它补造根因；保留失败及后续取证。Issue 371 首读性能、Issue 225 原始客户偶发启动和真实外部环境不因本轮通过而宣称完成。已发布 Space alpha.4 及其 beta.1 资产保持不变，本地 beta.2 产物未发布。

### 文档提交的完整复验：b90ff545

包含指南/版本说明的文档提交触发仓库规定的完整矩阵：[build 41981067416](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/41981067416) 7/7、[CI 41981067386](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/41981067386) 6/6 全绿。它与 `1a0bada0` 没有生产代码差异。

本轮 Linux 为 95/89 首次通过、1/6 条件跳过；Windows 2/2 为 88 首次通过、7 条件跳过；Windows 1/2 为 88 首次通过、1 flaky、7 条件跳过。唯一 flaky 是既有 `full-access-mode.spec.ts` 的默认权限持久化即时读取断言（首次得到 undefined，随后重试通过），不属于本轮修改的测试。ModeSelector 的按钮显示用户意图，默认值经 `void persistRuntimeDefaults(...)` 异步保存；旧测试在文字变化后立即读 settings，并把 IPC 错误也折成 undefined，未等待持久化完成。因此日志能确认该验证时序/诊断缺口，不能据此认定 SDK 写入故障；本轮没有修改该用例来取得绿色结果。此轮有 flaky 的事实保留，不替换前一轮 `1a0bada0` 无重试的真实结果，也不声称本轮全量测试均首次通过。

### 可转 SDK 的最终结论

正式 Registry `@kodax-ai/kodax@0.7.97-beta.2` 保持未修改时，已确认先前历史 `resync_required` 和 Stop 后下一次发送冲突存在 Space 根因：首次相同队列被误报为变化，造成观察/快照补读反馈，持续触发 Host 真实位置索引与存储围栏活动；暂停同一 Host 的隔离 Space Main 后读取恢复，恢复 Main 后再现，Space 单行修复的正反向 A/B/A 对照成立。Space 随后补齐前台空闲订阅保留及切换竞态，避免去掉反馈后界面状态陈旧。349 项针对性单测、真正成品 34 项专项及 6 项生命周期、核心三轮 9 次和额外 Partner 十轮均通过，源码完整矩阵与四平台 build 也已验证。因此这两项不需要 SDK 新增补丁或放宽并发保护；请保留真实并发、过期 cursor/sourceRevision 和输入准入的拒绝语义。独立的一次本地 Provider 超时尚未稳定定因、以及最新文档复验中一个旧权限设置测试的 flaky，均不据此新增 SDK 缺陷要求；Issue 371 性能和原始客户环境仍单独跟踪。

## Space 补完后续

用户进一步要求实际修复后，权限 E2E 的异步读取问题已完成可控慢写 RED/GREEN 修复，并为独立 Provider 超时补充分层取证；原生产修复 ead06bfe/ff4bdfa0 已在 main。本轮具体改动、38 次真实成品重复和 349 项单测记录见 [Space 修复补完](kodax-beta2-space-followup.md)。历史失败与旧 CI 数字继续保留，不由后续结果覆盖。
