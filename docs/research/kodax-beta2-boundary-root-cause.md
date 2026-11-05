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

上一轮将 `SPACE_E2E_PACKAGED_EXECUTABLE` 误当测试入口；实际 fixture 接受 `SPACE_E2E_EXECUTABLE`。因此之前标注的 29 项“成品界面”实际是源码 Electron，不能计作成品资格；打包脚本自带 6 项生命周期测试使用正确变量，仍属真实成品验证。本轮须用正确入口重跑，并核对实际 process.execPath、app.isPackaged 和包内 SDK 身份。

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

修复为显式保留一个前台会话订阅。前台 `session.liveSnapshot` IPC 传入 `retainObservation`；Main 按最新请求顺序保留前台会话，切换后按原有 settled 检查释放前一个，会话删除时清理；后台、历史与 Actor 的一次性读取默认仍可退休。Renderer 在 selection/Host ready/history ready 边缘请求，空闲历史首屏仍优先显示；mock 不接真实 SDK。每个前台边缘用已有 Map 合并一次补读，不能把一个旧的“曾经前台”请求当作当前的前台意图，否则 A→B→A 会丢失订阅。不增加周期轮询、不依赖每一帧 live 投影驱动 effect。

公开 SDK adapter 回归验证保留、切换释放和迟到响应不能抢占新前台。真实 Provider/Host 界面验证 Partner 缓存 A→B→A 后，另一个公开 SDK 客户端修改 idle workMode，UI 收到更新，下一次 Partner 输入由 Host 原子恢复 Agent。另有两项受控 IPC 用例刻意延迟后台请求和上一次前台请求，验证新前台补读不会被吞掉；此注入只证明 Renderer 协调，不冒充真实 Host 端到端测试。早期受控用例限制“总共最多三次读取”失败，是静态快照 fixture 同时触发其他合法协调，不能用该计数定位订阅丢失；已改为直接核对释放后新的前台 IPC 意图，观察退休和反馈流量另有真实对照断言。

五项源码针对性回归 5/5 通过、retries=0：Host CAS 工作模式、Partner 缓存切换、两种慢 IPC 时序和工具图片刷新恢复。旧提交 `ead06bfe` 的 build 全绿、CI 失败（两平台 Partner/Windows 工作模式显示陈旧，及工具图片恢复失败）；不以旧的 build 通过冒充 CI 全绿，也不把局部图片通过扩大为根因已全部覆盖。最终提交的 CI 和真正成品须重新核对。

## Standards

规范轴已复审生产修复；新增测试长回调按项目规则拆分为具名 helper，再复审。最终结果按提交后记录。

## Spec

需求轴发现的 raw-first 验证缺口已修复：显式 Space 兼容读取移至独立 SDK probe 之后，并完成两轮。前台订阅补读两个竞态已修复，需求轴复审残留 0；身份、正文引用、SDK seq/本地 revision 和真实并发拒绝均未放宽，不将 Host ready 等同于历史已加载。
