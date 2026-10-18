# Space 接入 KodaX 0.7.97-alpha.7

当前源码为未发布的 Space `0.1.47-alpha.3`，精确安装 Registry SDK `0.7.97-alpha.7`。根目录、Desktop、lockfile、物理安装及 Registry 原生文件校验已对齐，没有开发链接。当前验收见 [alpha.7 接入](../releases/kodax-0.7.97-alpha.7-integration.md)及[消费端复核](../releases/kodax-0.7.97-alpha.7-space-followup.md)。下方 alpha.6 及 2026-10-14 的 alpha.3–5 记录保留历史时点，不代表当前依赖或发布状态。

### 2026-10-18 Registry alpha.7 接入

新建 Host 请求 `daemonLifecycle: interactive`，复用兼容 Host 时保留其显式常驻或服务意图，关闭时取消当前启动。共享存储 owner 发现、zombie/PID 身份判断、启动期限及 owner 更替重试由 SDK 负责；Space 不接管锁或重放已接受输入。

SDK 当前 view 仍为有界替换窗口，最多 150 项，可从 Thinking 或工具开始。Space 按 SDK 项身份与顺序显示，不再向下一条 query 裁剪，也不把窗口起点当作完整历史起点。更早内容通过同修订的 `readHistory` 分页读取；工具时间戳保留 SDK 保存值，末尾无结果工具仍允许正常到达 EOF。SDK 的终端 Logo 与按键处理不属于 Space 适配范围。

### 2026-10-15 Registry 接入

Space 同时要求 SDK 与 Host `sessionDrafts:1`；普通 Coder 明确创建草稿，缺少能力即拒绝准入。SDK 的可选 `lastMessageAt` 保留到持久化、恢复后的内存会话、公开 IPC 与 Renderer；列表/Runtime 启动顺序不再把创建时间或恢复时间当成真实消息时间。本地实际输入时间独立记录，首次 canonical 刷新不会丢掉刚发送的活动。原有统一 view 替换和历史独立窗口继续适用。

本次是 v0.1.46 已有能力的依赖与契约迁移。用户已要求完成 Space 侧接入；不增加客户端产品、服务器或新的应用配置。

## 已确认的公共接缝

### 聊天输出面迁移（2026-10-14，源码与本地联调完成，Registry 发布闭环待完成）

真实 Session `20261014_140626_nub2876ee9a86e` 的落盘历史和 SDK 官方 view 各有一份输入与回答；Space 将底层 delta 与 canonical history 再次拼接后显示两份，刷新后恢复一份。首个输入已有 inputId，却不带 turnId，附件路径说明还使实时和历史正文不同。补 turnId 只能修补旧合并路径，不能完成输出面迁移。

本次 Coder Host 输出迁移的公共接缝和验收标准：

- Main 透传 SDK 完整当前 view 的显示项身份、顺序和替换语义；Renderer 只改变布局，不重建 assistant/thinking/tool 正文。底层 Runtime 仍承接可信凭据、执行授权和非正文诊断。
- 历史与搜索使用 SDK readHistory/readHistoryEntry/searchHistory；正文补读校验项身份、版本、偏移和长度。保留附件、工具参数/结果、Artifact、Fork/Retry/Rewind 的 SDK historyBoundary。
- 当前窗口与历史浏览窗口分开；较早页不与另一个修订的实时正文拼接。相同输入和输出按 SDK item ID 更新；不同身份的相同正文完整保留。
- 回归覆盖真实问题的数据形状（inputId 存在而 turnId 缺失、含本地附件）、运行中→落盘→终态、相同文本的不同输入、队列/steer、重连与刷新、长正文、历史分页和边界失效。
- Mock 与 Partner 的既有独立执行路径保持适用范围，不把它们的本地事件冒充共享 Coder Host view；所有接入共享 Coder Host 的普通聊天均只消费统一输出面。
- 完成判据是上述接缝回归、真实发布 SDK 的 Electron E2E、类型检查、lint、构建和双轴评审通过；不得仅凭 SDK 版本或输入入口更新宣布完成。

本次实现已切换共享 Coder 的当前聊天、历史分页、搜索与完整正文补读。Main 只投影 SDK item，并为图片签发安全预览引用；Renderer 按完整快照替换当前窗口，较早历史窗口保持冻结。普通聊天不再从 Runtime assistant/thinking delta 拼正文；SDK 的不同 item 即使共享 outputId，也完整保留。发送占位只按 Host 接受的 inputId 结束。

复核补齐了快照与实时帧的排序：快照读取与替换进入同一 productViewQueue，读取期间到达的新帧随后应用；终态也复用这一入口。公开 observeView 反例先证明旧快照覆盖新帧，再验证修复。Rewind 已提交但后续显示读取失败时，保留成功回执并请求重新同步。

真实 SDK 联调另发现 alpha.5 的上游缺口：canonical accepted user 恢复成 SDK view 时丢掉图片引用。已在相邻 KodaX 仓库的 `src/session-view.ts` 修复，按原 inputId 恢复原消息的图片引用，不改变显示项身份、顺序或正文；两个相同提示、不同 inputId/图片的 SDK 公共回归通过。Space 不从本地历史补造附件。

**验证与发布状态**：

- Desktop 全量回归最后一轮 3,892 项，3,879 通过、13 项既有条件跳过、0 失败；后续快照/历史/正文/诊断等改动另跑关联回归，不叠加到全量计数。
- 本地补丁 SDK 的 Electron E2E 16/16 通过：13 项真实共享 Host 契约回归与 3 项 Mock 附件/启动兼容。覆盖流式时刷新、无 turnId 的附件输入、重复文本的不同输入、长正文补读、用户图片、Artifact、队列/Stop、Fork/Rewind、过期游标、多客户端退出和失败诊断。最后快照排序修复另跑流式刷新、队列、失败诊断与 Rewind，4/4 通过；这些重复用例不增加 16 项总数。
- 新输出接缝 4 个模块的 17 项覆盖率回归通过，行覆盖率 95.79%、分支覆盖率 88.61%；这不是全仓覆盖率声明。
- Space `typecheck`、`lint`、`build:smoke` 通过；SDK 70 项 Session view/history 回归、源码与测试类型检查、bundle 与声明构建通过。Standards、Spec 两轴均 0 项残留。
- 根/Desktop manifest 和 lockfile 仍锁 Registry `0.7.97-alpha.5`。当前本机使用官方 `link:kodax` 链接补丁 SDK 联调，没有修改 Registry 实体包或发布新版本；开发链接不能作为正式包依赖。正常打包会按 lockfile 重装 Registry 包，因此升级版本锁以前仍会装回缺少图片修复的 alpha.5。
- **正式发布的剩余步骤**：SDK 维护者发布同时包含用户图片修复与下方草稿生命周期修复的版本；Space 精确更新根/Desktop/lockfile，撤下开发链接，重跑同一 E2E 和正式打包 gate。未经这一步，不宣称 Registry 接入或新安装包已经完成。

手动回归见 [F121 v0.1.47 输出迁移测试指南](../test-guides/FEATURE_121_v0.1.47_TEST_GUIDE.md)，架构边界见 [ADR-010](../ADR/ADR-010-sdk-product-output.md)。本次输出迁移没有删除个人历史；未发送输入的空 Session 已按下方生命周期修复处理。

本轮检查、源码指纹与待发布边界见 [机器可读验收记录](../releases/coder-output-migration-2026-10-14-evidence.json)。

### 未发送 Session 草稿生命周期（2026-10-14，源码修复，待同批 SDK 发布）

SDK 的公开 `sessions.create({ draft: true })` 与 Host `sessionDrafts:1` 能力支持
可观察、可设置的内存草稿。生产 Ink/classic REPL 共用的命令绑定声明草稿，CLI
启动协商新能力，避免继续连接不能保证草稿语义的旧 Host。首个有效用户输入进入
canonical 历史时转正并保存设置；拒绝输入、未发送即退出不会留下新的 Session
或设置文件。显式普通创建的持久化语义继续适用。

Space 仅在 Host 提供新能力时使用草稿创建普通 Coder 会话。旧 metadata-only 空
记录经 SDK 完整历史确认后隐藏，原文件保留；命名、旧分支、Artifact、错误和
恢复状态均保留。空标题有本地化名称，过滤不占可见额度。复核补上草稿删除、
转正期间并发设置读取、设置写盘失败后重试，以及 SDK 完整记录已重命名而摘要
仍为空的反例。

SDK 的创建/输入/设置/CLI/schema/存储边界关联回归 61/61 通过，另跑存储
关联回归 168/168 通过；Space adapter/历史列表关联回归 258/258 通过。
重建后的本地 SDK Electron 回归 14/14 通过（13 项真实 Host + 1 项旧记录兼容），
确认输出、队列、退出及旧记录保留、侧栏标题与刷新。SDK 三个草稿接缝新增
可执行语句起始行覆盖 45/47（95.74%），不是全仓覆盖率；类型检查、lint、
构建及双轴复审通过。
测试没有删除或迁移个人记录。SDK 的 Issue 368 回归指南位于其仓库
`docs/test-guides/ISSUE_368_v0.7.97_REGRESSION_GUIDE.md`；本仓库的
[Space Issue 220 回归指南](../test-guides/ISSUE_220_v0.1.47_REGRESSION_GUIDE.md)
记录桌面验证步骤。

本轮独立证据见 [草稿生命周期验收记录](../releases/session-draft-lifecycle-2026-10-14-evidence.json)。

测试通过现有 RuntimeHostAdapter、RealKodaXSession、IPC 和已发布 SDK 的公共接口验证。保留现有 Coder/Partner 隔离、可信 Main 凭据与 Host Tools、共享设置与 Shell 合同、历史与实时输出身份规则（ADR-009）。

1. 启动使用 ensure，重连使用 passive connect；按真实能力版本拒绝不兼容 Host。
2. 普通输入、队列、steer/redirect、Skill、command、review、workflow、独立 Actor 与 compaction 接入可信 Main 授权。输入使用稳定 inputId；queued 不虚构 runId；秘密不经过 Renderer/IPC。
3. 重连从 SDK 当前 view/snapshot 重建，不使用已删除的 journal/replay。历史使用 SDK canonical 边界与 sourceRevision，过期边界拒绝；保留 Fork/Retry/Rewind、长正文、附件和中断记录。
4. 累计统计、物理请求、上下文和逐工具 Sandbox 使用 SDK statistics，保留 partial/unknown，不用 permissionMode 推断实际执行。
5. 完整退出使用 SDK lifecycle 回执及离线查询。区分接受、工作清理、受保护的其他客户端和精确 Host 退出；unknown 保留恢复信息；Space 自身资源仍由 Space 清理。

## 实现与验收顺序

逐个接缝执行 RED → GREEN。先启动与当前投影，再输入授权与队列，再历史与统计，最后退出/恢复。每片运行关联回归；收尾运行全量测试、类型检查、lint、构建与 Standards/Spec 评审。验收要求不只消除类型错误，还验证已发布包上的真实运行与退出。

迁移事实与上游证据见 [已发布 SDK 验收](../research/kodax-0.7.97-alpha.2-published-sdk-audit.md)。实现验收结果完成后追加于此。

## 上游接缝需求的范围校正（2026-10-10）

用户选择由 SDK 团队补必要接缝，Space 继续其他迁移。需要保留的是现有产品行为，不是四个旧 Run options 字段的形状。不能据此设计通用 Main run-options 覆盖接口或恢复客户端执行权威。

- 最明确的待补能力是 Product 路径的 Workflow 可用性，以及 Host 对既有 maxAgents/tokenBudget 上限的配置和实际执行。maxConcurrency 已有 Host config.workflow.maxConcurrency 入口，应先复用。Workflow 运行目录应由 Host 管理，Space 消费其 runDir 等公开事实；不预设 Product 输入接受路径参数。
- 手册品牌和主题可以优先使用现有 Host extension 的 provider:before 和内建 manual 工具扩展；这部分首先是 Space 接入工作，不能直接列为 SDK 必须新增的字段。
- 动态输入补充包含附件路径和 Partner 提供的上下文，不应统一升级为可信 system prompt。先核对现有文本/附件/引用业务接口能否承接；只有确实无法保留现有语义的部分才提窄的业务接缝，不预设任意 promptOverlay 参数或任意运行配置袋。
- Skill/command/review 的准备、hooks 和工具限制应由 Host 的现有产品执行入口负责，Space 不继续双重准备。

依据：SDK [统一迁移边界](C:/Works/GitProj/KodaX-AI/KodaX/docs/SDK_MIGRATION.md:9)、[FEATURE_298 设计目标](C:/Works/GitProj/KodaX-AI/KodaX/docs/features/v0.7.97.md:181)，Space [现有 Workflow 上限](../../apps/desktop/electron/kodax/workflow-policy.ts#L78)。已发布 alpha.2 的公共入口实测确认普通低层 runs.start 带 inputId 会被拒绝；该路径不能替代产品输入身份。

## alpha.3 接入落点（2026-10-11）

npm `alpha` 已核对为 `0.7.97-alpha.3`。根目录、Desktop 与 lockfile 使用同一精确版本，正常 Registry 安装，SDK 开发目录没有修改。

- 复用现有可信 Main Runtime 连接的公开 Product 接口；普通输入走 `acceptInput`，显式工具走带 inputId 与 authorization 的工具入口。技能、命令 hooks 和 review 的准备由 Host 完成。Partner 保留自己的 inline 执行边界。
- Main 授权捕获 Session 的有效 Provider 与明确 fallback allowlist，以及 workflowHostPolicy 的 maxAgents/tokenBudget。并发复用 config.workflow.maxConcurrency；Workflow 目录由 Host 管理。授权在 Product RPC 前以不可变非秘密记录保存，按 Host/客户端/Session/inputId 隔离；重试、队列派生 Run 和 steer 都复用原快照。重连恢复 Session broker，不能改成单 Run broker。旧 Run 若没有可证明的 Main 快照，steer 明确拒绝，不重新计算授权。
- 队列从公开 current view 恢复，inputId 是队列身份；接收 queued 时不虚构未来 Run。SDK 的序列与 Space 本地投影 revision 分别使用，队列变化允许在相同 SDK seq 上推进本地投影。相同队列不重复推送。
- 移除 journal/replay、旧 operation envelope 和旧完整退出 API。保留仍公开的 canonical history/fork/rewind 接口及 sourceRevision。长 view 正文校验长度、revision、offset 和读取期限；同一 model toolId 的多次执行使用公开 opaque item ID 区分，不解析 ID。
- statistics 提供累计用量、物理请求与 operation 区分、retry/fallback/compaction/Actor 归属、上下文组成及逐工具 Sandbox 原始事实。IPC 仅投影已知字段。Renderer 用 Host 累计值替换旧估算，保留 partial/缺失用量；重载能恢复上下文组成。
- lifecycle 用同一 requestId 查询接受、工作清理与精确退出回执。在线的其他客户端受保护。接受退出后轮换 Main 身份并保留旧 keychain 引用用于离线查询；unknown 不当作成功。请求与确认有期限，观察超时后的迟到订阅会关闭。真实最后客户端退出的短暂 containment_active 继续查询 SDK 回执，直到 SDK 证明退出或期限耗尽。
- Space 手册通过现有只读 Host Tool `space_manual` 接入，组合安装 SDK 的手册与 Space 操作说明。发布 SDK 拒绝覆盖内建 `kodax_manual`；不用全局 Extension 把其他客户端的手册改成 Space。附件与 Partner 上下文使用产品文本/附件接口，不增加任意 system prompt 接缝。

真实发布包离线 Provider 回归已验证：稳定输入与 canonical 身份、物理请求统计、Space 手册工具、steer、after-turn 队列、Main 重建后重复输入与原授权复用、多客户端保护、身份轮换/离线恢复、最后客户端精确 Host 退出。验证使用隔离目录及本地 HTTP fixture，不依赖真实模型服务。

## 最终自动验收（2026-10-11）

- Registry 再次核对：`alpha = 0.7.97-alpha.3`，stable `latest = 0.7.96`。`npm ls` 确认根目录及 Desktop 使用同一个 Registry 安装的 alpha.3；tarball 与 lockfile integrity 相符。
- `npm test`：4,332 项，4,312 通过、20 项既有平台/条件跳过，0 失败。其中 release 92/99、Desktop 3,855/3,868、IPC schema 365/365。最后两处恢复修复另跑 40 项关联回归，全部通过；不将重复执行加进全量总数。
- 关键迁移接缝 coverage：30 项全部通过，行覆盖率 97.77%、分支覆盖率 87.04%。范围为 view 读取、历史/工具恢复、授权快照持久化和客户端退出，并包含已发布 SDK 的真实 Host 回归；不宣称全仓达到该覆盖率。
- `npm run typecheck`、`npm run lint`、`npm run build:smoke` 通过。生产 Renderer、Main、preload 与 worker 已重新构建。
- Electron 生产启动 E2E：`renderer-boot.spec.ts` 1/1 通过；Renderer 正常挂载、preload bridge 可用、无未捕获页面错误。测试使用隔离 profile，native SQLite 已切回 Electron ABI，当前构建可启动。
- 最终 Standards 轴 0 项残留、Spec 轴 0 项残留。复核中发现的回执误配、canonical thinking/text 分项恢复、首个退出 ACK 丢失恢复等问题均补上反例并验证通过。

恢复仍遵循公开事实：thinking/text 分量只消费已证明 Run/Turn 的有序前缀，不跨工具边界；无执行 item ID 的实时工具回执仅连接唯一未完成的同 Host/Run/Turn 候选。多候选时重新读取 Host 当前 view，不猜测归属。SDK 无法观察的内部请求继续显示 partial，退出未知继续保留 unknown；这是契约边界，不补造成功或用量。

本次完成源码依赖更新、Space 接入与生产构建；没有发布新的 Space 版本或安装包。

## 扩展 E2E 验收（2026-10-11）

源码 99 个不同用例（93 项现有桌面 + 6 项真实发布 SDK）全部通过，0 失败/跳过/重试；同一真实 SDK 套件在打包目录应用通过 6/6。最后启动/九类文件预览专项 2/2 通过，打包 dependency/boot/SDK gate 全部通过。见 [E2E 范围、修复与限制](../research/kodax-0.7.97-alpha.3-space-e2e-validation.md) 和 [逐项证据](../research/kodax-0.7.97-alpha.3-space-e2e-evidence.json)。

修复了 Stop 后新输入 admission 期间的观察订阅过早退役；反例 RED→GREEN，adapter 250/250 回归通过。Windows 常规 E2E 在独立 Desktop 运行，不切换用户桌面，保留正常产品窗口行为；Job 负责结束/取消时的测试子树清理。最终 Standards/Spec 均 0 项残留。

这些结果不等于所有功能均经过真实 SDK/线上服务执行：既有 UI 套件含 Mock/注入情景，真实模型、外部账号和其他 OS 未验收；unknown/ACK 丢失/Main 重建以公开 SDK 集成回归证明，不改 SDK 私有状态制造 packaged E2E。
