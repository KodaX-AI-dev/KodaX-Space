# KodaX 最新 SDK 与 Space 统一契约迁移是否完整对齐？

> 后续状态（2026-10-20）：本审计记录 alpha.7 时点的缺口。A–H 产品修复已在 `c83ca0f5` 落地，Artifact 四公开入口已由主包 alpha.8/9 正式交付。本轮的队列授权、生产启用与重新验收见[迁移收口记录](../releases/space-sdk-migration-closeout-2026-10-20.md)；下文的“未实施/未交付”不代表当前状态。

结论：**alpha.7 已正确安装，普通共享 Coder 的输入、授权、输出、历史、统计和退出主链已迁移；不能据此认定整个 Space 已完成统一契约迁移。** 本轮沿生产入口确认了 Workflow、命令/Review、Space 自带 Skill、计划审批、Memory、MCP，以及工具图片/终态事实消费的遗留边界。alpha.7 的新增启动与历史修复大多已正确继承，这些遗漏主要来自此前迁移范围未收完。[发布及安装证据](kodax-space-contract-alignment-evidence-2026-10-18.json)、[上游完整目录](kodax-alpha7-upstream-change-inventory-2026-10-18.md)、[输入与授权审计](kodax-unified-contract-input-authority-audit-2026-10-18.md)、[Host 领域审计](kodax-unified-contract-host-domains-audit-2026-10-18.md)

## 1. 版本与核验边界

- 核验日期：2026-10-18，Asia/Shanghai。开始时 Space HEAD 为 `dcd21ef8`；过程中另一个线程提交文档 `8514865a`，两者之间 `apps/`、`packages/`、`scripts/` 无代码变化。本轮不更改 SDK、依赖、产品代码或个人配置。[本轮源码版本及 probe](kodax-space-contract-alignment-evidence-2026-10-18.json)、`git diff dcd21ef8..8514865a -- apps packages scripts`
- 根目录、Desktop、lockfile 和实体安装均为 **`@kodax-ai/kodax@0.7.97-alpha.7`**；Registry `alpha` 也为 alpha.7，`latest` 仍为 **0.7.96**。alpha.7 实际发布于 **2026-10-18 08:15:48（UTC+8）**，不能把 changelog 的 10-16 版本日期当作 npm 发布时间。[Registry 原始 metadata](https://registry.npmjs.org/@kodax-ai%2Fkodax)、[本轮抓取](kodax-space-contract-alignment-evidence-2026-10-18.json)
- 不只核对版本字符串：下载 Registry tarball 后，已安装 alpha.7 的 **1,006/1,006 发布文件逐字节一致**，锁文件 SHA-512 也匹配。npm 没有 `gitHead`，因此源码 tag 与发布包使用交叉核对，不宣称可重现构建证明。[字节与声明核验](kodax-alpha7-upstream-change-inventory-2026-10-18.md#实际发布包与安装结果)
- 本轮增量完整范围是 **alpha.6 → alpha.7：38 commits、84 files、+3,685/-338**；另外复核 alpha.1 起统一契约在当前 Space 的生产调用链。相邻 KodaX alpha.7 tag 为 `25fa6399`，HEAD `b0b446ec` 只多一个文档整理提交，没有未发布运行时代码。[全部文件和 commits](kodax-alpha7-upstream-change-inventory-2026-10-18.md)

## 2. SDK 更新内容及 Space 影响

### alpha.7 的全部行为类别

| 上游改动            | 具体语义                                                                                                                            | Space 当前判断                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 共享存储 owner 发现 | 跨 profile 找真正 Host；等待 starting owner；Linux zombie 与 PID generation 统一判断；附着期间 owner 更替只在原启动期限内重发现     | 交给 SDK。Space 保留实际 owner profile，不自行清锁或重放业务                            |
| 启动控制            | deadline 穿过 discovery、spawn、readiness、socket 和最终身份核验；AbortSignal 可取消；结构化启动错误、升级 blocker 和连接 ETIMEDOUT | 已传取消信号，按类型区分安全初始化恢复；ETIMEDOUT 已在分类中                            |
| Windows 启动成本    | 目标 PID 精确 FILETIME；合并 Job/Host 身份读取；不对不可验证历史记录逐条开 PowerShell helper                                        | 自动继承，没有理由在 Space 再加历史扫描或扩大期限                                       |
| Host 生命周期       | interactive 空闲 30 秒；显式 daemon/A2A 服务保持常驻；pending maintenance/background work 阻止自动闲置退出                          | Space 新建 Host 请求 interactive，复用 retained Host 不强制改策略；完整退出仍走公开回执 |
| 队列竞态            | predecessor 在异步 journal 绑定期间完成后，新发布的 queued Run 会再次唤醒 guarded drain                                             | 自动继承；输入身份、接收回执与未来 Run 分开，不增加发送重试                             |
| 当前 view 与历史    | 保留最多 150 项的尾窗口，可从 Thinking/tool 开始；pending-tool EOF 正常；旧 cache EOF 再验证 source boundary；保留工具时间          | 当前共享 Coder 用 SDK 替换窗口与独立历史页；不按下一条 query 裁剪                       |
| CLI/TUI 展示        | 历史开头 banner、终端滚动和 starting daemon 的 already_running 语义                                                                 | CLI 行为不机械复制为 Electron 组件逻辑                                                  |

以上各类别的逐函数、逐文件来源，以及 35 个测试/验收文件、16 个文档/子模块和 8 个元数据/CI 文件，见[上游完整目录](kodax-alpha7-upstream-change-inventory-2026-10-18.md)。Space 实际对应位置为 [`createRuntimeConnectOptions:2354`](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L2354)、[`initialize:2443`](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L2443)、[`isDaemonEnsureRecoveryFailure:2024`](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L2024)、[`readProductHistory:4262`](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L4262)、[`runtime-client-exit:74`](../../apps/desktop/electron/kodax/runtime/runtime-client-exit.ts#L74)。

**公开类型没有再次整体翻新。** 两个 tarball 的全部声明只有 `sdk-runtime.d.ts`、`sdk-agent.d.ts` 变化；新增 lifecycle 选项、pendingBackgroundWork、可取消 preflight、升级错误字段与 Job identity helper。`/client`、`/coding`、`/llm`、`/media` 的声明和共享 types-chunks 不变；没有新的 capability 版本门槛或 Artifact 子路径。native 有重建字节变化，协议仍为 text=5、shell=10、ASRT=0.0.65，不能把重建 hash 当作行为升级。[完整声明与 native 对比](kodax-alpha7-upstream-change-inventory-2026-10-18.md#公开-sdk-类型与导出只有两份声明改变)

### alpha.1–alpha.6 的迁移背景也已纳入

| 版本    | 与本次复核相关的既有变化                                                      | 当前核查重点                                                            |
| ------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| alpha.1 | 统一 Product 契约；输入身份、完整 view 替换、历史引用、结算与交互分域         | 是否仍有旧执行 owner、事件拼正文或文件写入路径                          |
| alpha.2 | 可信 Main 授权、详细执行统计、客户端退出与离线回执                            | 授权快照、真实物理请求、unknown 与其他客户端保护                        |
| alpha.3 | Workflow maxAgents/tokenBudget、并发名额与真实用量                            | 普通 Product Run 已绑定；显式 Workflow 启动仍需补迁                     |
| alpha.4 | 退役运行外 verifier，主 Agent 证据评审；启动进度；可选 Artifact 源码能力      | 不把历史 sidecar 读取或视觉技能等同于固定自动验收保证                   |
| alpha.5 | 多格式 Artifact 九操作、PNG 附件读回、统计页上限及忙碌 preflight              | Host PNG 字节已可读，但通用工具图片在 Space 显示仍有缺口                |
| alpha.6 | Session drafts、lastMessageAt、恢复用户图片、跨协议 schema、并发 Host refresh | 草稿能力门槛、真实活动排序和用户图片已接入；不继续保留已过期 workaround |

版本事实以[已安装 SDK 的 changelog](../../node_modules/@kodax-ai/kodax/CHANGELOG.md)、[统一迁移指南](../../node_modules/@kodax-ai/kodax/docs/SDK_MIGRATION.md)、[Space 接缝](../../node_modules/@kodax-ai/kodax/docs/SPACE_SDK_SEAMS.md)为来源；Space 逐项状态以下文生产链核查为准，不从历史报告的“完成”字样倒推。

## 3. 已对齐的主链

| 接缝                 | 当前生产实现与证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 启动/连接/能力门槛   | 可信 Main 继续持有公共 Runtime 控制面；ensure 与 passive connect 分开，显式要求 Product、draft、授权、history boundary、exit、facts 等能力。单凭 import 仍为 `/runtime` 不构成某项业务失效。[adapter:1495](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L1495)、[1704](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L1704)、[2354](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L2354)                                                           |
| 普通输入与授权       | 稳定 inputId；接受前捕获不可变非秘密 Main 授权；队列、steer 与重连按原身份恢复。普通输入走公开 acceptInput，非旧 runs.start 伪造 Product 身份。[adapter:6070](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L6070)、[6178](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L6178)、[6838](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L6838)、[真实发布包回归](../../apps/desktop/electron/kodax/runtime-sdk-migration.test.ts#L23)                 |
| 当前正文             | SDK observeView 的有序项整份替换；保留 item ID，不按相同正文/outputId 合并；快照和实时帧在同一队列排序。[adapter:4238](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L4238)、[4313](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L4313)、[productSessionView:66](../../apps/desktop/renderer/src/store/productSessionView.ts#L66)                                                                                                                              |
| 历史、搜索和长正文   | readHistory/readHistoryEntry/searchHistory；显示项与历史引用分开；ID、版本、UTF-16 offset、长度及期限核验；浏览旧页不拼入实时正文。[adapter:4262](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L4262)、[productItemContent:30](../../apps/desktop/renderer/src/lib/productItemContent.ts#L30)、[历史 IPC:1666](../../apps/desktop/electron/ipc/session.ts#L1666)、[ProductHistorySearch:10](../../apps/desktop/renderer/src/features/session/ProductHistorySearch.tsx#L10) |
| Fork/Retry/Rewind    | 使用 SDK historyBoundary/sourceRevision，不能从显示下标猜 canonical 边界；失效要求重新选择。[adapter:3964](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L3964)、[ConversationStreamV2:2039](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2039)、[统一契约 E2E:239](../../tests/e2e/sdk-unified-contract.spec.ts#L239)                                                                                                                                   |
| 统计                 | SDK 累计事实替换估算；保留 partial、缺失 usage、物理请求/operation、逐工具 sandbox；分页请求上限 500，Host/Session 边界校验。[adapter:3859](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L3859)、[统计 schema](../../packages/space-ipc-schema/src/channels/statistics.ts)、[store:8854](../../apps/desktop/renderer/src/store/appStore.ts#L8854)                                                                                                                          |
| Stop 和接受/观察交接 | Session cancel 有精确 Run/requestId；确认终态后只释放匹配旧 Run 的 admission hint；accepted input 在 canonical 通知与异步图片投影完成前保留观察需求。[adapter:6672](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L6672)、[6774](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L6774)、[Stop 回归](../../apps/desktop/electron/test/real-session-runtime-stop.test.ts)                                                                                          |
| 完整退出与恢复       | lifecycle request/readExit 和离线 reader；原 request/runtime/client 身份核对；accepted/cleanup/Host success 分开，unknown 保留，其他客户端 protected 允许本客户端正常清理。[runtime-client-exit:55](../../apps/desktop/electron/kodax/runtime/runtime-client-exit.ts#L55)、[adapter:7422](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L7422)                                                                                                                              |

Mock、Partner 的独立执行及显式 legacy 模式不能只因存在低层 API 就判迁移失败。Quick Ask 的实现要按实际 surface/temporary 分支理解：目前代码可能复用共享 Coder Runtime，不能笼统写成“全部仍 inline”。[输入审计中的边界校正](kodax-unified-contract-input-authority-audit-2026-10-18.md)、[real-session:823](../../apps/desktop/electron/kodax/real-session.ts#L823)

## 4. 确认需要继续处理的 Space 遗漏

这里“确认”包括可达生产调用链和局部反例。没有端到端复现的项目只说明静态可证明的影响，不扩张为已发生的数据损坏或已证实的安全漏洞。

### A. 显式 Workflow 仍在 Electron 启动第二套执行 owner

`workflow.start/rerun` 和 `/workflow` 仍交本地 workflowController，后者加载 `/coding` manager、自己创建 runDir 并 startFromOptions；list/get/部分控制才有 daemon 分支。maxAgents/tokenBudget/concurrency 并未被删除，遗漏在共享 Host 的启动所有权、授权、设置、统计、取消与退出归属没有统一。普通 AMA Product Run 的 workflowHostPolicy 正确，不能替代显式 Workflow 入口验收。[workflow IPC:155](../../apps/desktop/electron/ipc/workflow.ts#L155)、[207](../../apps/desktop/electron/ipc/workflow.ts#L207)、[controller:1395](../../apps/desktop/electron/kodax/workflow-controller.ts#L1395)、[完整调用链审计](kodax-unified-contract-input-authority-audit-2026-10-18.md)

建议：把现有 Coder 显式 start/rerun 交给 Host 的 workflows.start，使用 Host 返回的 runDir/身份；保留原产品上限及 Space 自身 UI/通知，补真实 Host 的启动→统计→取消→退出回归。

### B. Prompt Command 和 Review 没有完整使用 Host 的准备入口

slash.discover 能列 Host command，但非 Space builtin 的 slash.exec 返回 unknownCommand 后，原文进入 session.send；该入口主要按 Skill 识别，不会调用 commands.execute 的 command 准备链。`/review` 仍插入本地 HEAD diff 模板，没有使用声明的 base/SHA/`--workflow` 参数，也未走 Host review.start；SDK 的 reviewLean 没有对应现有 UI 入口，不单独要求新增。并非说用户无法让模型做代码评审，缺的是已有命令语义和 Host 的可信准备链。[slash:40](../../apps/desktop/electron/ipc/slash.ts#L40)、[69](../../apps/desktop/electron/ipc/slash.ts#L69)、[runtime-command](../../apps/desktop/electron/kodax/runtime-command.ts)、[输入审计](kodax-unified-contract-input-authority-audit-2026-10-18.md)

建议：区分 Skill、prompt command、extension tool 与 Space 自有命令，按对应 Host 产品入口执行，避免把所有 `/name` 都当 Skill 或普通文本。

### C. Space 自带 Skill 的本地注册没有完整交接给共享 Host

registerSpaceBuiltinSkills 只在 Electron 进程注册 plugin path；skill.discover 又把本地 builtin 合入 Host catalog。真实 Registry Host 的隔离 profile/project 对照中，本地可见而 Host 不可见的资源 Skill 有 **16 项**，包括 copywriting、customer-research、draft-response、process-doc、status-report。当前用户的全局 skills 仍可被 Host 发现，所以同名 frontend-slides 存在也不能证明 Space 打包资源已交接。[注册:63](../../apps/desktop/electron/skill/space-builtins.ts#L63)、[合并 catalog:70](../../apps/desktop/electron/ipc/skill.ts#L70)、[真实 Host 原始对照](kodax-space-builtin-skill-host-evidence-2026-10-18.json)

建议：使用上游认可的可信 Host skill/extension 注册方式，让发现与执行指向同一资源来源，再移除本地 catalog 对执行可用性的误导。此次证明 catalog 不一致，没有用付费模型执行这些 Skill，也不宣称所有同名 Skill 都失败。

### D. exit_plan_mode 审批丢失完整 plan

已发布 RuntimePermissionRequest.plan 明确提供完整定稿，但 permissionInteraction 只转换 inputPreview，IPC 与 PermissionModal 没有 plan 字段/分支。本轮对真实投影函数输入带 plan 的 exit_plan_mode 请求，结果只有“未知工具，高风险”及普通允许/拒绝信息，原计划不在结果中。Host 仍负责审批裁决；Space 没有让用户看到此次审批对应的完整计划。[已发布类型:2743](../../node_modules/@kodax-ai/kodax/dist/sdk-runtime.d.ts#L2743)、[投影:497](../../apps/desktop/electron/kodax/runtime/coder-daemon-projection.ts#L497)、[审批 UI](../../apps/desktop/renderer/src/features/permission/PermissionModal.tsx)、[可复查反例](kodax-space-contract-alignment-evidence-2026-10-18.json)

建议：完整保留 SDK plan，专用审批展示绑定原 requestId；不能从聊天缓存猜计划，也不能用截短 inputPreview 替代。

### E. Memory 管理仍是旧本地 owner，目录和 CAS 也未统一

MemoryPanel→memory IPC→MemoryGovernanceService 仍本地 createMemoryControlPlane；旧 memory root 与 Host memory.forProject 的 scoped root 不同，存在管理面看不到 Host 实际记忆的可能。当前 approve/reject 的 DTO 也没有用户已审阅 proposal 的 expectedRevision；不能只因批准前重新读取就视为已保留用户看过的版本。[memory-service:320](../../apps/desktop/electron/memory/memory-service.ts#L320)、[Memory schema](../../packages/space-ipc-schema/src/channels/memory.ts)、[Host 领域审计与上游 scoped root/CAS 依据](kodax-unified-contract-host-domains-audit-2026-10-18.md)

建议：Coder MemoryPanel 走 Host memory.forProject，透传 proposal revision/预览边界与 CAS；不自动搬动旧文件或绕过冲突覆盖。

### F. MCP 面板仍管理本地第二个连接实例

servers/start/stop/logs 直接用 getMcpManager；tools 在 Host 错误后回退本地 manager；reload 先构建本地 manager 才 reload Host。用户看到或停止的进程可能不是共享 Coder 实际使用的 MCP owner。MCPB 还直接修改 shared integration 配置并刷新本地 manager；Host 有 watcher，因此不能夸大为“安装必定永不生效”，但成功回执也不等于 Host activation 已确认。[MCP IPC:49](../../apps/desktop/electron/ipc/mcp.ts#L49)、[82](../../apps/desktop/electron/ipc/mcp.ts#L82)、[121](../../apps/desktop/electron/ipc/mcp.ts#L121)、[Host 领域审计](kodax-unified-contract-host-domains-audit-2026-10-18.md)

建议：Coder 的发现、状态、工具和 reload 使用同一 Host；保留 Partner 自有 connector 范围。上游没有承诺的 start/stop/log API 先明确能力缺口，不用启动第二套连接来补界面。

### G. Host 的工具图片可读取，但 Space 通用显示链仍丢图

SDK view/history 已带工具图片引用，readItem(part:'attachment') 支持 Host 校验的 PNG bytes/hash/尺寸；现有真实 SDK 回归确实验证了这一底层路径。但是 projectProductConversation 的 tool_call 不带 imageAttachments，session.productItem 的 part 只有 text/input；Main 图片预览还要求 Space clipboard sandbox，不能覆盖任意 Host 工具证据路径。反例中输入保留了图片引用和适配图片，显示结果两者都消失。[SDK 接缝附件合同](../../node_modules/@kodax-ai/kodax/docs/SPACE_SDK_SEAMS.md)、[工具投影:76](../../apps/desktop/renderer/src/features/session/productConversation.ts#L76)、[IPC:401](../../packages/space-ipc-schema/src/channels/session.ts#L401)、[clipboard guard:439](../../apps/desktop/electron/ipc/clipboard.ts#L439)、[反例](kodax-space-contract-alignment-evidence-2026-10-18.json)

建议：Main 按 Host item identity/index 和受校验字节读取签发安全预览，工具显示模型保留图片；同时覆盖刷新与历史项，不扩大为任意路径读取。用户上传图片已有单独通过的链路，不能把两者混为同一验收结果。

### H. Run 终态的 effectOutcome 没有进入 Space 投影

RuntimeTerminalFact 有 revision/kind/code/effectOutcome；projectRuntimeRun 只取部分失败分类和通用 phase，IPC Run 投影没有 effectOutcome。本轮 interrupted + daemon_crashed + effectOutcome:unknown 的投影只剩 interrupted 和普通原因。退出回执中的 unknown 已保留，这不等于 Run 副作用 unknown 也已被完整消费。[SDK 类型:2444](../../node_modules/@kodax-ai/kodax/dist/sdk-runtime.d.ts#L2444)、[投影:216](../../apps/desktop/electron/kodax/runtime/coder-daemon-projection.ts#L216)、[Run IPC](../../packages/space-ipc-schema/src/channels/runtime.ts)、[反例](kodax-space-contract-alignment-evidence-2026-10-18.json)

建议：保留 Host 终态事实，在中断/恢复详情中区分“执行已结束”和“副作用已知/未知”。当前证据证明信息丢失，不证明 Space 已自动重放副作用。

## 5. 需要区分的边界与未闭环项

- **独立 Artifact SDK 仍未交付。** 本轮 Registry 仍 404；根 SDK 没有对应 export。九操作、多格式后端有源码不等于 Space 已安装；已有 create_artifact/create_office_artifact、Host PNG 附件与视觉技能各自有作用，但不能据此宣称完整独立 Artifact SDK 接入。[Registry 与 exports 抓取](kodax-space-contract-alignment-evidence-2026-10-18.json)、[完整交付调查](kodax-alpha7-artifact-delivery-readiness-2026-10-18.md)
- **配置不应机械改接口名。** shell、密钥、管理员策略及某些当前 ClientConfig 未覆盖的设置仍可能需要可信 Main 公开接缝；这里要明确未覆盖字段/Host activation/CAS，而非把所有 `/repl` 或 `/runtime` 使用一概判错。[SDK 迁移指南](../../node_modules/@kodax-ai/kodax/docs/SDK_MIGRATION.md)、[Host 领域审计](kodax-unified-contract-host-domains-audit-2026-10-18.md)
- **Learning 不能只凭旧接口名字判定丢事件。** 现有 bridge 有 cursor/replay/gap 恢复；Product subscription 的 ready/失效协议是否完全对齐，需要按实际事件契约核验。相关确定项和不确定项单列在[Host 领域审计](kodax-unified-contract-host-domains-audit-2026-10-18.md)，不与已复现的投影缺陷混计。
- **慢启动与首失败原因未全部解释。** alpha.7 已修很多可确定的启动成本和竞态，但 SDK guide 保留原约 30 秒 slow-resume、部分 WFP/ConPTY 首失败；Space 也保留间歇 first-input/本地 Provider network error 的未诊断证据。后来通过不能覆盖首次失败或自动证明根因。[上游限制](kodax-alpha7-upstream-change-inventory-2026-10-18.md)、[Space 资格记录](../releases/kodax-0.7.97-alpha.7-qualification.md)

## 6. 本轮验证与后续验收顺序

本轮执行了 **15 个文件、422 项现有关联回归，422 通过、0 失败、0 跳过**。第一组 308 项包含 RuntimeHostAdapter、view/item 读取、退出、授权 store、正文投影和 IPC；第二组 114 项包含真实已发布 SDK 的稳定输入/授权/统计/PNG/生命周期回归、Stop、队列、历史分页和统计 store。它们证明主链现有断言成立，不覆盖上面所有遗漏。[落盘结果摘要](kodax-space-contract-validation-2026-10-18.json)、[第一组日志](../../.tmp-sdk-alignment-audit-tests.log)、[第二组日志](../../.tmp-sdk-alignment-contract-tests.log)

另执行了两个独立 probe：一组直接调用生产投影函数证明工具图片、审批计划、effectOutcome 信息丢失；一组启动真实 Registry Host 对照 Space 自带 Skill 的可见性。后者未调用 Provider，最终 SDK cleanup 和精确 Host 退出均为 succeeded。[投影 probe 源码](kodax-space-contract-alignment-probe-2026-10-18.mjs)、[投影证据](kodax-space-contract-alignment-evidence-2026-10-18.json)、[Skill Host probe 源码](kodax-space-builtin-skill-host-probe-2026-10-18.mjs)、[Skill Host 证据](kodax-space-builtin-skill-host-evidence-2026-10-18.json)

也重新读取了 GitHub 实际 run/job 状态：`39097232475` 整体是 failure，但 Linux 和两个 macOS jobs 为 success；Windows 的独立后续 `39098059757` 为 success。这是同一 production `290c5fcb` 的分次平台证据，不是“一次全平台 run 全绿”，Release job 均 skipped。当前 HEAD 相对该 production 的相关代码差异仅为测试改动。[原四平台 run](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39097232475)、[Windows 后续](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/39098059757)、[既有逐项资格记录](../releases/kodax-0.7.97-alpha.7-qualification.md)

本轮不重跑全仓 npm test、不重建安装包、不执行付费模型或修改生产代码；因此不把以前 4,373 项全量结果或既有 20 项打包 E2E 当成本轮新结果，也不作全仓 80% 覆盖率声明。

建议后续按现有接缝分片收口：

1. **用户立即可见的契约缺口**：计划审批、Prompt Command、Space builtin Skill 来源一致性。
2. **执行所有权**：显式 Workflow、Memory scoped owner/CAS、Coder MCP 单一 Host。
3. **事实显示**：工具图片的 Host 字节→安全预览、Run terminal/effectOutcome；补相应刷新/历史/中断回归。
4. **完成判据**：新增反例先失败，最小实现后通过；再跑真实发布 SDK 的 Electron 场景及相关平台检查，最后更新“完整迁移”状态。不能仅以版本安装成功或已有主链测试全绿完成此闭环。

上述顺序是依据触发频率、用户知情审批、共享 owner 一致性和已确认信息丢失作出的工程判断；具体每片入口与上游约束见两份领域审计，而非新增通用兼容层。

## 未证实

- 本轮未复现命令/Review/Workflow/Memory/MCP 的付费模型完整用户任务，也未证明已有用户数据损坏；其结论范围是生产可达旧调用链与公开契约的差异。
- 未推断独立 Artifact 包的发布时刻、未发布原因或未公开版本。
- 未把局部投影 probe 当作完整 UI/模型/多平台 E2E，也未把当前通过的主链回归当作缺口不存在的证明。

## 未解问题

1. 上游以哪个正式包/版本交付独立 Artifact SDK，以及共享 Host extension 的安装归属如何确认？
2. 统一契约尚未覆盖的 MCP start/stop/log 和配置字段，最终采用哪个公开 Host 接缝？需要明确上游边界，不能用第二个执行 owner 代偿。
3. Learning 订阅与已保留的间歇首失败还需要哪些确定性反例才能完成根因闭环？

这份文档完成的是详查、证据固化及迁移状态校正；A–H 尚未在本轮实施修复。
