# KodaX beta.1：Space 完整适配审计与实施方案

2026-11-03。**审计结论：主要生产链路已经接入，但不能宣布全部适配完成。** Partner 正常输入确实使用 Agent 工作面和可信 profile；模型 Provider 新 Key 已使用权限保护的 `auth.json`。以下保留用户批准的实施方案和审计基线；实际修复、验证、成品及仍待 SDK/环境的范围见 [本轮执行记录](kodax-beta1-space-fixes.md)。

本次已将 Claude 补审逐项对照源码并归入实施清单；见 [核实记录](../research/sdk-beta1-claude-gap-verification.md)。补充内容包括：无 error 的冷队列等待、冷身份缓存污染、旧 Linux profile 显式恢复、Workflow 局部订阅失败、Artifact 加载诊断和连接器持久性。新增发现以静态确认为主，仍须先复现；下面的关闭清单覆盖全部当前已核实缺口，不把未执行的验收记为通过。

## 1. 审计固定点与范围

- Space：`64fcfed3`，SDK 在 Root/Desktop/lockfile 精确锁定 `0.7.97-beta.1`，Space 仍为 `0.1.47-alpha.3`。已交付的 Windows 成品与测试范围见 [此前验收](kodax-0.7.97-beta.1-integration.md)。
- SDK 源码：`C:/Works/GitProj/KodaX-AI/KodaX@e733e51f9`，release 提交、工作树干净。`alpha.11..beta.1` 为 87 个提交，`alpha.12..beta.1` 为 14 个提交。前者包括共享 Host 与 FEATURE_302，后者包括默认方法、业务绑定、promotion、原子配置和 redirect/recovery 补审。范围不限于最后一次依赖版本变化。
- 事实优先级：正式安装包的类型/实现、实际 Host 能力与行为；四份随包权威文档；release 源码补证。四份文档与本地 release 文档归一换行后相同，但本地 `dist/kodax_cli.js` 与安装包不相同，不能拿源码目录中的 dist 充当已安装字节，也不能仅凭文档历史标题“未发布”判断能力尚未发布。
- SDK：`docs/SDK_MIGRATION.md`、`docs/CLIENT_CONTRACT.md`、`docs/SPACE_SDK_SEAMS.md`、`public_docs/sdk/embedder-guide.md`，以及 LLM/Artifact 相关契约。逐项调用位置与来源在三份 [凭证调查](../research/sdk-beta1-credentials-audit.md)、[Partner 调查](../research/sdk-beta1-partner-audit.md)、[其余 27 类契约](../research/sdk-beta1-contract-inventory.md) 中列出。
- 这轮做源码、声明、旧证据和隔离假凭证探针核查；未读真实用户 Key/token，未运行真实服务认证，未修改 SDK、原生 ABI 或发布新版本。此前 27 项成品测试只证明其已列明的路径，不代表下面新增的所有组合已验证。

## 2. Partner 应当如何接入

Partner 的 `Session.workMode='agent'` 负责选择 SDK 的通用 Agent 工作面；可信 Main 的 execution profile 注入角色 instructions、验证要求、默认 Skill 和业务授权；AMA 负责协作模式。这些状态分别由 Host 持有，模型与权限选择继续独立。

当前已接：创建 Partner Session 时通过 Host 设置 Agent，每轮正常执行同步 Agent；`registerPartnerHostExecution` 组装 persona，`services.createExecutionProfile` 基于 Host 目录构造声明，默认 Skill 交给 Host 准备，binding resolver 在实际消费时读取最后成功提交的专家/连接器。普通 shell/write/子 Agent 保留，实际操作继续遵守权限、审批、沙箱及业务绑定。[创建](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L3653)、[每轮同步](../../apps/desktop/electron/kodax/real-session.ts#L518)、[profile/defaultSkill](../../apps/desktop/electron/kodax/runtime/partner-host-tools.ts#L178)、[resolver](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L6455)。

SDK 的可信 profile 使用 `workModePolicy:'intersect'`，角色 instructions 会进入 AMA Worker 的提示装配；不能因为 Space 使用 `/coding` 的类型，或遗留函数名含 Coder，就断定实际运行成 Coding。反过来，Run 标记为 Agent 也不足以单独证明模型实际收到的 instructions/tools 完整。需要下述原始请求专项。[SDK release `src/runtime-daemon/server.ts:2645-2653`、`packages/coding/src/task-engine/runner-driven.ts:1952`，完整定位见 Partner 调查。]

## 3. 无 Keychain 的准确范围

当前模型 API Key、默认 Provider OAuth、Main 稳定客户端秘密已经走 `auth.json`。文件采用 SDK 的权限保护和原子提交，普通 config 不写新 Key，Renderer 不读回秘密；新用户这三条路径无需 Keychain。原加密备份仍用于旧用户按原身份迁移，不能为删除依赖而删除它们。[文件初始化](../../apps/desktop/electron/providers/provider-storage.ts#L87)、[OAuth](../../apps/desktop/electron/providers/credentials.ts#L119)、[稳定秘密](../../apps/desktop/electron/kodax/runtime/runtime-client-secret-file.ts#L28)、SDK `SDK_MIGRATION.md:524-537,620-635`。

“受权限保护的明文文件”必须在界面如实表达。当前设置页仍写 Keychain/系统加密，是遗漏。Partner 的邮件、腾讯及部分官方远端连接器仍向旧凭证层保存新秘密：Win/mac 正常使用系统保护的加密 vault，Linux 可用 libsecret，也可能降为 memory；缺少用户可见的持久性事实。钉钉另由官方 CLI 管理 token 密文及系统 Keychain 中的密钥，不能因其 profile 目录隔离就宣称无 Keychain。因此**模型 Provider 无 Keychain 与整个 Space 无 Keychain是两个不同的完成范围**。本轮必须修正连接器保存结果的真实性；全连接器后端迁移另列产品切片，不贸然移除旧依赖或启用 CLI 测试绕过。来源与固定官方版本依据见 [凭证调查追加节](../research/sdk-beta1-credentials-audit.md)。

## 4. 全部能力映射

“已接”表示有生产调用；“待验”表示已有代码仍缺对应专项；“可选”表示 SDK 提供该能力，但 Space 没有把它作为本轮产品功能开放。详细引用见三份调查记录，不以已安装 SDK 代替 UI 已完成。

| 范围                                                           | 当前判断                                                    | 本轮必要动作                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 唯一共享 Host、owner、退役 embedded/default constructor        | 主流程已接；旧 inline 只保留受控测试/历史分支               | 维持单 writer；迁移现用诊断脚本，不删除历史维修版本门禁                            |
| Main identity、授权服务、Host 目录和 lease                     | 已接完整 identity/profile 服务；独立 Actor 有独立授权       | 补各请求种类、Host 换代与迟到返回隔离专项                                          |
| Agent/Coding/Script、AMA、权限、模型                           | Coder 选择/CAS/忙碌门禁与 Partner Agent 已接                | 补 Partner Main 设置入口与命令/工具等准入边界，避免 UI 与 Host 模式分离            |
| persona、verification、16 专家、默认 Skill                     | 已接；16 专家正常首轮有真实 Host 证据                       | 追加实际 system/工具 schema 与有效配置断言，验证显式覆盖后一轮复原                 |
| after-turn/steer/redirect/冷恢复                               | 暖队列/原Run恢复已有；冷队列可能无error而静默等待，重绑缺失 | B1可见恢复/取回→B2原身份重绑；顺序/未知不重放，C2消费模式约束                      |
| 原文取回、admissionError、旧队列                               | 新输入完整意图与显式取回已接                                | 保留 SDK durable 原文/撤回回执需求；不以 preview 重建旧全文                        |
| Quick Ask promotion                                            | 稳定 requestId/CAS/丢响应查询、同 Session 提升已接          | 保留 view 兼容与 SDK 根修；补第二客户端、冷 Host、Partner 目的地（若产品存在入口） |
| Provider API Key/auth.json/CAS/墓碑/迁移                       | 文件主路径已接；来源漏洞及旧eligible无后端恢复缺口          | A来源v2、显式env恢复、真实存储UI与现行文档                                         |
| OAuth/default file/旧注册迁移/拒 token/context                 | 消费和刷新链路已接；未有完整桌面登录注销向导                | 本轮保留真实能力说明、同注册不重放；真实测试账号与撤销恢复另验                     |
| Native cloud、稳定 principal                                   | 请求入口已接；强 principal 证明未普遍提供                   | 未证实保持未知，不伪造 replayIdentity，不将默认 namespace 机械改为 coder           |
| 新协议/preset/区域/订阅配置                                    | 外部高级配置可消费，普通创建表单仍仅两类兼容协议            | 保留未建模字段与只读保护，显示认证/编辑范围；新增向导属于可选功能                  |
| canonical/nativeHistory、有序 thinking/tool、Fork/Retry/Rewind | 走 Host canonical 操作，未由显示文本重建                    | 补高级原生片段、附件、原文和冷恢复的保真专项                                       |
| thinking/工具参数 estimatedTokenCount                          | 已接 Host 估算，不自行字符换算                              | 保留缺失即未知、跨 Run 隔离回归                                                    |
| taskResult/长报告/unknown/中性消息                             | 已接；成品回归通过                                          | 保留未知和缺 ID，不将子报告当主 Run 终态                                           |
| 工具 original/历史分页/搜索/滚动                               | 已接具体工具 ID 和 Host 原文分页                            | 保留丢原件错误、边界冲突重取与同一下箭头回最新；Issue 371 另测                     |
| 普通问题/deadline/skip/non_interactive/Plan                    | 已接 Host 等待与请求身份、完整 Plan                         | 补刷新/断连/Host deadline/权限独立超时组合                                         |
| effort requested/sent/verified、继承                           | 只读实际事实与选择分离；内部继承由 SDK 处理                 | 验证根/Worker/Actor/workflow，不回写 wire 结果到用户选择                           |
| 模型图片/上下文/输出上限                                       | 使用模型级能力；已修自定义 Provider 路径                    | 不提高用户默认预算；拒新图保留草稿和旧图；高级模型编辑保真                         |
| 费用 null/nominal/TTL/报价范围                                 | 当前 Space 主要显示 token，无完整金额产品 UI                | 本轮保持不造金额；费用 UI 如立项须完整保留 nullable/nominal/partial                |
| 远端目录/WebSocket/Google 显式 cache                           | SDK 内部协议可生效；未有完整独立管理 UI                     | 不为了升级自动探测/轮询；作为可选产品范围                                          |
| images/classify/deferred/media publish                         | 未作为独立 Space 产品操作接入                               | 可选；若做，必须有 durable reference、同 scope、远端取消、usage 去重与最终图片验证 |
| Skill/.agents/learned Skill/hooks/MCP/Memory                   | 核心接线已进 Host；MCP 能力说明仍旧                         | 修诊断 owner 文案；补策略/卸载/恢复/Memory 证明，不重建第二 runtime                |
| A2A/Actor/workflow                                             | Host执行与各自授权已接；workflow缺局部订阅恢复/快照重读     | E局部恢复，C身份/模式；独立Actor与工作流撤销专项                                   |
| 原子核心配置/application/坏文件                                | 已接 SDK lock/read/atomic 与四类生效边界                    | 验提交未知结果、损坏保留、CAS、并发 rename 与账号保持                              |
| statistics/coverage/issues/cursor 代次                         | 已接 partial 与只读冲突重取                                 | 补 Host 重启/投影淘汰/迟到结果，不以统计授权重新执行                               |
| 错误与恢复/unknown/历史进程身份                                | 保留 typed/local failure 及原 Run 身份                      | 真正异常关机与未知外部效果需专项，不能自动重放                                     |
| doctor/锁/storageRepair/GC                                     | 管理员完整修复 UI 未开放；历史工具有版本限制                | 本轮只修诊断可用性，不按 TTL/锁龄清理或自动确认外部副作用                          |
| 完整退出/Host 升级/手动更新                                    | 已接退出回执、其他客户端保护与用户下载/安装确认             | 补真实旧安装覆盖升级；不强停活跃/未知 owner                                        |
| 沙箱/无感回退/Node/Linux 窗口                                  | SDK 自动回退保留，可信激活入口已接                          | 无 Node 的 Kylin/Linux、安装中断与窗口控制需真机专项，不加 Node gate               |
| 完整 dist/JSON/schema/native/worker/Artifact                   | Windows资源门禁通过；Artifact加载失败未单独投影             | F当前catalog/tools与LKG健康；跨平台资源和质量分别验收                              |
| PowerShell NoProfile/启动性能                                  | SDK 行为已变；旧性能诊断构造不兼容                          | 核对内置扩展/helper 不依赖个人 profile，换代诊断后重新量测历史首帧                 |

补审新增矩阵项：C1 冷身份污染、E Workflow观察恢复、F Artifact能力健康、G连接器持久性均为本轮必修，逐项责任与关闭证据见第7节，不归入可选新增产品功能。

## 5. 实施切片与验收

### A. P1：凭证来源与界面一致性

**已复现问题。** 在独立临时根中先保存并固定文件 Key A（没有 env），后来 env B 出现，由另一 SDK store 删除 A；Space 的状态仍为 shared + tombstone + configured:false，而下一次实际读取却返回 B。没有执行 Space 的“删除并回退”操作。[读值后无条件回退](../../apps/desktop/electron/providers/credentials.ts#L228)、[仅 scope 的旧选择记录](../../apps/desktop/electron/providers/file-credentials.ts#L45)。假值探针保存在 `artifacts/diagnostics/beta1-release/credential-external-removal-audit.mjs`，不输出秘密。

最小修改：

1. 沿用当前 SDK AtomicFile store 与批量 CAS，把 Space 私有来源记录升级为能表达实际批准的 file/env/legacy；env 只记录来源/变量名，不复制值。
2. 将实际读值、Provider list、测试连接、broker 和 UI 统一到同一来源决定。选中文件失效/出现墓碑时明确不可用；没有原来源授权，undefined 不代表可以读取任意后来出现的 env。
3. 保留已有合同中，用户在 `both` 提示下明确选择删除并使用环境变量的路径；将该意图按原显示状态 CAS 保存。外部 CLI 删除与 Space 显式改来源应区分。SDK CLI 自己的默认 fallback 规则不改。
4. v1 有真实文件 Key 的记录可无歧义转为 file；已选 shared 删除保持不可用。v1 private 空值/墓碑可能是原 env pin，也可能是文件删除，不能猜来源；保留原记录并提供明确继续环境来源/重新保存的动作。旧备份不复活，不重置 selection/tombstone。
5. Settings、Provider Card、自定义表单、doctor、故障指南中英文同步显示真实文件存储和来源。保留旧 IPC 字段名兼容，先补 `file` 分支，不做无必要全仓字段改名。

6. 补旧 Linux/Kylin profile 的明确恢复路径：eligible 旧 profile、未固定来源、旧 backend 不可读时，继续区分“未知旧账号”与“确实不存在”，不静默用 env；提供逐 Provider 的“重试旧凭证”“使用现有环境变量”“保存新 Key”和已有共享值的显式采用。选择按原显示状态 CAS 持久保存；不全局关闭旧发现、不删除备份。fresh、已有来源选择的正常路径保持，Provider 来源选择也不能替代旧 Main 稳定秘密的恢复。[条件与恢复设计](../research/sdk-beta1-credentials-audit.md)。
7. 清理完整现行说明：ProviderCard 未知来源不得推成 keychain；BottomBar doctor、README/README_CN、PRD/HLD、USAGE/手册、IPC/启动注释同步文件+broker事实。原 PRD/HLD 强制 OS Keychain 的条款依本会话已采纳方案更新。当前 Provider 的不可达 memory 告警移除或收窄，但连接器真实的临时保存告警必须单独补。[逐文件清单](../research/sdk-beta1-credentials-audit.md)。

先写 RED：外部撤销+新 env、原 env 消失、已批准删除回退、v1 歧义、并发 CLI 更新、同/异数据根、连接变更、rename、迟到迁移与 tombstone；另加 eligible 旧 profile + 无 libsecret + 未选择来源、已固定 env、已有文件来源、fresh 四组。再用真实 Electron IPC/无 OS vault fixture 验保存→退出→重启、来源展示和模型实际使用账号。用户明确选 env 后不得再读旧 backend；旧 Main 身份秘密不可用时仍不能新建身份接管旧队列。存储不可用与旧迁移不可用分别展示。

### B. P1：Partner 未消费队列跨 Main/Host 换代

**静态确认缺失，先补真实失败证据。** 新 after-turn input 保存了完整意图并注册了进程内 binding；没有 Run 时不会记录 resolved Run authorization。重连仅读取旧 captured authorization 并恢复 credential/tool，没有重新注册 execution binding 并用原意图重绑 pending input。SDK 要求旧 principal 用同 inputId/原意图重新提交以完成重绑。[接收](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L7569)、[重连](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L5390)、SDK `SPACE_SDK_SEAMS.md:26`，详见 Partner 调查。

**先修可见性。** SDK 冷恢复可只设内部 awaitingBinding，不产生 admissionError；公开 queue/getInput 当前也不暴露该字段。Space 仅在 admissionError 下提供取回，所以会显示普通等待、没有取回入口，且队首挡住本 Session 后续输入。[SDK 与 UI 源码定位](../research/sdk-beta1-claude-gap-verification.md#五项意见的判断)。

B1：对 Host 确认 queued、原身份且 Main 有完整恢复材料的输入，独立于 admissionError 提供显式取回；缺材料则明确说明受限，不以 preview 取回。重连/重绑进度是 Main 自己的恢复状态，必须与 Host 错误分开，不能把所有普通排队或缺 error 都伪造成 binding 失败。后项保持原顺序；不自动跳过队首、删除输入或另建副本。若要求精确展示 Host 内部等待原因，另补只读事实接缝；基础取回与重绑不以该增强为前提。

B2：仅对 Host 确认仍未消费且可重绑的 queued input，验证稳定 Main principal，取私有保存的原 text/attachments/delivery/target/inputId，注册当前 Runtime 的 binding lease，经原身份准入接缝重绑。resolver 仍在真实消费时采用最后成功提交的选择。已派发、有 Run、终态、未知副作用或命令结果不确定时不走此自动路径；重连竞态合并，避免重复登记和第二次执行。旧队列无完整材料继续保留，等待 SDK 原文/回执接缝，不由 preview 构造新请求。

验收分别覆盖：Renderer reload、Main 断连重连同 Host、Main 重启、Host 冷换代、两者组合；特别覆盖没有 admissionError、队首等待/后续排队、自动重绑失败和用户先取回的竞争。再测专家切换/禁用/卸载、连接器撤销、原账号、附件/长文本、同时重连。取回可用性与实际材料一致；每个原输入最多执行一次；本地恢复失败可见，原问题保留。已在执行的 Run 使用原快照恢复。

### C. P1/P2：Partner 身份、Agent 边界与实际注入

C1（P1）：冷 Session 身份必须先验证再缓存。command/workflow 在 surface 缺缓存时默认 code，ensureSession 在持久身份校验前写 sessionSurfaces；旧 Partner 被拒绝后错误 code 仍留存，正常输入/读设置也无法纠正。初始有界 profile 及常见 ready slash 的 commitRuntimeMutation 会提前正确填身份，因此按“缺缓存的 workflow/直接 command/启动竞态”等条件复现，不写成所有未打开的 Partner 必现。[详细 guard 与证据](../research/sdk-beta1-partner-audit.md)。

最小修改：现有 Session 从可信 Main Session/公开 Host 元数据解析 surface/projectRoot，校验成功后才提交正式缓存。保留并发 ensure 的预期身份门禁，未验证候选不与已验证事实混用；一次失败不污染下次正常输入。真正身份冲突继续拒绝，不 retag、不吞错后默认 code。新建 Session 仍用明确创建意图，不能将“不在有界列表”当作不存在。验收含：profile 外旧 Partner、Host 未 ready、首次 command/workflow 后普通输入、首次操作失败再读设置、并发 ensure、真实冲突及现有 Coder 回归。

C2（P2）：正常链路已 Agent，但 `session.setWorkMode → updateWorkMode` 尚未按 surface 拒绝 Partner 的 Coding/Script 修改；底栏写死 Agent，下次普通输入可能纠正。command/workflow 等入口没有普通输入的 sync，旧 Coding Partner 或排队期间另一客户端改值仍可能用 Coding。[Main 设置](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L4518)、[执行入口](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L7664)。

最小修改：在可信 Main 校验 surface，Partner 只接受 Agent；Coder 仍保留三模式，走原 Host 安全空闲/CAS。统一核对普通输入、显式 Skill、命令、工具和 workflow 的准入设置；错误/旧 Host 不伪造本地成功、不清历史。其他客户端更改设置后重读 Host 事实并按安全空闲规则处理，UI 显示与实际状态一致。

外层 CAS 仅作执行准备，不能宣称消除了其他客户端在设置后、真正消费前改值的窗口。binding request/services/profile 当前没有已解析 workMode/required mode；既有 resolver 读取的 view 也可能复用先前 loading 的旧快照，不可作为锁内权威模式证明。补 SDK 的可信准入模式约束后，在实际即时/排队消费、command/review/tool/workflow 装配边界校验 Agent；不在 Host 持锁的 resolver 内嵌套设置 mutation。详见 [新增 SDK 交接](kodax-beta1-partner-mode-admission-handoff.md)。独立 Actor/specialist 的自有模式不强套根 Partner 模式。

C3：捕获本地假 Provider 实际 system/messages/tool schemas，核对普通 Partner、prompt-only 专家及全部 16 专家的 instructions、默认 Skill、原问题各出现正确次数；断言 `Run.workMode`、`effectiveConfig.workMode`、`agentProfile`、`toolScope/modelToolScope` 与请求一致。显式方法一轮覆盖后回默认；shell/read/write/子 Agent 在正常权限下可用，Plan/显式上限仍生效；独立 Actor 不借根 profile。加上 Partner fork/retry/compaction/model switch、原生历史和 checkpoint 冷恢复。这些存在旧单测/独立库夹具，缺的是新协议真实 Host 的完整证明，不能写全仓零测试。多客户端模式竞态、队列消费和 workflow 装配要故障注入，不能只测 UI 或 Run 选择值。

### D. P2：诊断与历史工具

将 MCP 及相邻 capability 的 owner/detail 改为实际 Host 路径；不重写已正常的 MCP 执行链。[错误描述](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L1912)、[实际调用](../../apps/desktop/electron/ipc/mcp.ts#L43)。

校正现有 `/extensions` 诊断来源：当前 `BottomBar.tsx:1676-1711` 使用 mcp.discover，只列 MCP extension/server，不能作为 Host SDK extension 加载/失败清单。`/mcp` 继续展示 MCP；Host extension 诊断应读取公开 catalog，与 F 的 Artifact/builtin 状态使用同一事实。Space 安装包 registry 与 Host 已加载 extension 分开命名，避免“已安装”冒充“Host 已加载”。

`scripts/diagnostics/session-startup-history.mjs:162` 仍采用退役的默认 Runtime/inline；改为隔离共享 Host 的公开观测，记录 Host ready 与 history read，Renderer 首帧由配套 Electron 成品测试单独测量。旧进程内 fs 计数不能伪称已覆盖 daemon。`repair-kodax-session-history.mjs:245` 的 0.7.82 门禁保持，明确历史用途；新版维修应另走公开 repair/fence 流程，不机械去门禁。验收使用当前正式包、临时副本、真实 owner 退出确认，无用户数据改写。

### E. P2：Workflow 局部订阅恢复与快照同步

当前只等待 `workflowSubscription.ready`，未传 onError。SDK 可以在 transport 仍 connected 时终止单个订阅，现有 connection loss 恢复不会启动；真实重连后也没有 ready→list/get 全量同步，断连窗口内完成且无后续事件的工作流可能保持旧 UI。[实际订阅](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L2644)、随包 `CLIENT_CONTRACT.md:200-206`。已有手动刷新和本地 fallback 不等价于已同步 Host。

在现有订阅处补局部 onError、可见 stale/恢复状态和单个恢复任务。关闭旧订阅→建立新订阅→等 ready→list/get 只读重建快照；读期间通知标记待刷新，避免旧快照盖新事件。以 Runtime 对象/订阅 generation 隔离迟到结果，合并重复错误、有界退避；完整退出/换代关闭 timer 和迟到握手。不要为填状态洞伪发 started/finished 事件或重放 start/pause/resume/stop；快照同步不重复通知、交付或 Artifact 登记。

验收：握手前拒绝、ready 后局部错误但 transport 不断、重复错误、恢复窗口内完成且后续无事件、读取中并发更新、Host 替换、退出中迟到成功、另一 Session/客户端持续工作。断言唯一订阅/恢复任务、ready 后发生 list/get、最后状态与 Host 一致，普通 Run 和其他能力不被误判失败。

### F. P2：Artifact 与 builtin 扩展能力健康

Host `catalog.extensions().diagnostics.failures` 已有 stage/target/message/occurredAt/source，Space 尚未消费。已有 Settings 集成 domain 健康不是逐扩展加载成功的证明，builtin 安装也只核验 Skill entry。保留 Skill 与可选 Artifact 分离的设计。[注册](../../apps/desktop/electron/skill/space-builtins.ts#L33)、[现有配置健康](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L1116)、[SDK 加载事实与来源](../research/sdk-beta1-contract-inventory.md)。

经 Main 投影当前 Host 的 loaded entry/实际 tools 与有界脱敏错误，分别展示 builtin Skills、Artifact 的 ready/degraded/unavailable。保留 last-known-good；历史失败不永久标记当前已恢复能力失败。复用启动/集成变化/显式刷新边界检查，不增加逐 token 轮询或第二个 extension runtime。修复前置条件后经可信重载或安全空闲重启，再核验工具。正常 input/Skills/history/其他扩展继续工作；真实打包资源缺失或篡改仍由门禁拒绝，不能用“可选”掩盖。

验收：合法配置但 Artifact entry 导入失败、缺 worker/运行前置条件、Skill 独立成功、LKG 重载失败仍可用、修复后恢复、旧 Host 错误迟到。先核对公开 catalog 的当前事实，再核对 Settings、`/extensions` 和任务失败提示；不显示整体 Provider 错误，也不由此新增强制 Node 安装。

### G. P1/P2：连接器秘密保存的真实性与边界

本轮必要修复是保证连接器保存结果如实表达持久性：当前旧 store 可能降到 memory 并 void 成功，Provider 页恒 file 的告警覆盖不到它。沿现有 connector CredentialStore/连接结果暴露 durable/temporary/failed（或等价事实）；要求重启仍保留账号的连接必须持久提交成功才宣称已保存。允许临时会话时明确提示仅本进程并保留可见状态，不能仅凭同进程 get 成功当持久化证明。不同平台失败路径保持实际差别，不一概宣称加密或永久保存。

分别验 Win/mac vault 不可用/写失败、Linux libsecret 不可用/写失败、OAuth 刷新与注销、保存后退出重启、同账号与不同 connector 隔离。原秘密、旧备份和撤销事实保留，失败不换号。Provider/Main 的同原值旧秘密迁移读取可能写回 vault，不能改成“所有旧层绝对只读”。

全应用去 Keychain 单列可选迁移：Provider file、Space connector store、外部 DingTalk CLI profile 三类分别处理。DingTalk 固定版本默认在系统 Keychain 保护密钥，不偷开测试 file-DEK，也不把目录中的密文直接写入 Provider auth namespace。[固定官方实现](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/keychain/keychain_darwin.go#L248)、[平台与连接器详细依据](../research/sdk-beta1-credentials-audit.md)。该可选迁移不免除本轮对临时保存的真实性修复。

### H. 必须补的组合回归

| 专项            | 验收重点                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 授权全入口      | input/after-turn/steer/redirect/recovery、command/tool/review/probe/workflow/Actor 各自的身份与上限                                  |
| 原生历史        | nativeHistory、有序 thinking/tool、图片、工具原文，经 Fork/Retry/Rewind/压缩/冷恢复保真；身份变化由 SDK 裁定复用                     |
| 交互            | 普通问题重载/断连仍 pending，Host deadline、skip/non_interactive/Stop 各自保真，Plan 完整审批                                        |
| 配置与统计      | 四类 application、坏文件、提交结果未知、cursor conflict/reset、partial/issues、未知实际 Run 字段与迟到结果隔离                       |
| 凭证            | 无 Keychain 新安装、旧加密迁移、原 env/shared/private、OAuth 拒 token/注销/换号/冷 Host，副作用请求不重放                            |
| 旧 profile 恢复 | eligible+无libsecret+未选来源时用户明确选择env；已有选择/fresh不误伤；Main旧身份秘密独立恢复，不自动生成新身份接管                   |
| Partner 冷入口  | profile外/缺缓存/初始化竞态的首次command/workflow、失败后普通输入与读设置、真实身份冲突；模型实际Agent与原身份不变                   |
| 队列恢复 UI     | 无admissionError的waiting、队首后项、有完整材料取回、旧材料受限说明、取回与重绑竞态、顺序及恰好一次                                  |
| 局部观察/能力   | Workflow局部error与ready后snapshot、Artifact当前工具及diagnostics、LKG、Host换代、退出取消；不拖垮其他Session                        |
| 连接器秘密      | durable/temporary/failed与真实重启结果一致；三类存储域及平台差异；不可静默丢失或换号                                                 |
| 分发与生命周期  | 精确 Registry 字节/完整资源，忙碌旧 Host 不强换，其他客户端保护，真实旧安装覆盖升级，手动下载/安装确认                               |
| 平台与客户样本  | Kylin/Linux 无 Node+窗口+自动回退、Windows 异常退出/沙箱中断、macOS/ARM；Issue 371 用隔离客户 Session 测首历史/UI而非只测 Host ready |

先运行变更相关 RED/GREEN 与组合专项，再 typecheck/lint/build、双轴评审、一次完整回归；最后重打 Windows 成品并重复关键产品流程。真账号、安装向导、跨平台需对应环境证据，未具备时明确列未验证，不用 SDK CI 或离线假 Provider 结果代替。

## 6. SDK 依赖与额外产品能力

本轮确认需要 SDK 后续发布闭环的三项：

1. [promotion view 元数据失效](kodax-beta1-promotion-view-handoff.md)。Space 继续用公开 load 核验同 Session 正式状态，SDK 发布修复后再去掉窄兼容。
2. [旧队列完整原文与 durable 撤回回执](kodax-beta1-queued-intent-handoff.md)。新输入冷重绑由 Space 完成；旧队列及撤回组合崩溃不能靠本地 preview 补齐。
3. [实际准入工作模式约束](kodax-beta1-partner-mode-admission-handoff.md)。Space 入口同步/模式 guard 先修；原子保证由 Host 在真实消费与装配边界验证，不能用外层 CAS 或缓存 view 替代。

其余已确认的 Space 缺口不要求 SDK 重复造接口。queue 的只读 awaiting-binding 原因作为第 2 项观测增强一并提出，Space 基础可见性/取回/新队列重绑可以先做；旧原文/回执和模式原子保证分别等 SDK。新增 SDK 工厂不意味着必须替换已正确的自有 authorizer/AtomicFile batch CAS；Runtime 执行角色 coder 与 default 凭证命名空间不同，不能机械改绑定身份。

以下另作产品切片，当前不宣称有完整界面：原生 Provider/preset/OAuth/cloud 配置登录向导、费用与 TTL/nominal 展示、远端模型目录和显式 cache/WebSocket 管理、独立生图/分类/deferred 操作、管理员存储维修、整个 Partner 连接器去 Keychain。它们各有额外身份、取消、回执或迁移边界，不能在依赖升级时隐式加入；当前既有配置可读可执行及字段保真仍必须保证。

## 7. 执行次序与关闭条件

1. 先锁定失败证据：A 来源/旧 profile 恢复、C1 冷身份、B1 无 error 队列。A 与 C1 可独立开发；B2 以身份和原输入材料可靠为前提，不靠猜测重提。
2. 实现 A1–A3、C1、B1→B2，再补 C2 的 Space 入口与 C3 注入/恢复验证；同步交付 SDK 第 3 项模式约束需求，旧 SDK 上不宣称原子保证已完成。
3. D 诊断/现行文档、E Workflow 观察恢复、F 扩展能力健康、G 连接器持久性，均有独立失败注入和验收；不把这些必要修复归入可选新功能。
4. H 组合回归、typecheck/lint/build、双轴评审和一次完整回归，重打 Windows 成品；从真实旧安装/无 Keychain profile 回归。平台、真实账号和 Issue 371 单独留证。
5. 等 SDK 三项发布，精确锁新字节，核对能力与行为后闭环；仅在对应根因修复验证通过后移除窄兼容。可选产品扩展分别立项，不阻塞已明确的 Space 修复。

| 关闭项                         | 责任与前置                             | 完成证据                                                                       |
| ------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------ |
| A1 来源 v2/CAS/外部撤销        | Space；保留 SDK 文件 store             | RED→GREEN，原账号/墓碑/并发/旧 v1 歧义，broker 使用来源一致                    |
| A2 存储 UI/现行文档            | Space；README、PRD/HLD、两种语言及诊断 | 成品 file/unknown/error 显示真实，历史/连接器说明未被盲改                      |
| A3 旧 profile 无 Keychain 恢复 | Space；未知旧账号仍受保护              | fresh/已pin/eligible 分类，明确 env 选择 CAS，无旧 Main 身份替换               |
| B1 队列可见与显式取回          | Space；Host queued + 自有完整材料      | 无 admissionError 也可操作，缺原文诚实受限，后项顺序保持                       |
| B2 新队列冷重绑                | Space；C1 + B1 + 原身份/材料           | Main/Host 重连组合、取回竞态、原输入只执行一次                                 |
| C1 冷身份与缓存                | Space；可信身份先验证                  | profile 外 Partner 首次 workflow/command，不污染后续；真冲突仍拒绝             |
| C2 Agent 全入口/消费约束       | Space 入口 + SDK 模式接缝              | 普通/命令/工具/workflow/排队及双客户端并发只能 Agent 或执行前拒绝              |
| C3 注入/恢复/历史证明          | Space；以上身份/模式基础               | 16 专家实际载荷/effectiveConfig，Partner fork/retry/compact/model/冷恢复/Actor |
| D 诊断工具与含义               | Space                                  | MCP/SDK extensions 归属正确，当前包诊断可运行，旧 repair 门禁保留              |
| E Workflow 订阅                | Space；subscriptionLifecycle           | 局部 error 恢复 + ready 后 snapshot，退出取消，不重复执行/通知                 |
| F Artifact/builtin 健康        | Space；公开 catalog                    | 当前/历史失败与 LKG 区分，工具事实正确，普通输入/历史继续                      |
| G 连接器保存事实               | Space；现有 connector store            | temporary/durable/failed 与真实重启一致；DingTalk 外部边界准确                 |
| SDK-1 promotion                | SDK 发布后 Space 锁包                  | 新旧观察者及第二客户端元数据/正文一致                                          |
| SDK-2 旧队列/回执              | SDK 发布后 Space 接入                  | 原文附件、丢响应/组合崩溃、幂等及其他 principal 拒绝；只读原因一致             |
| SDK-3 模式准入                 | SDK 发布后 Space 接入                  | Host 锁内模式竞态、旧 Host 协商，不改其他产品默认模式                          |
| H 发布与环境矩阵               | Space + 真机/测试账号                  | 正式字节、成品、旧安装升级、平台与真实服务各有结果，无证据不关闭               |

关闭时逐项填写：SDK 版本/Host 指纹、Space 提交、生产调用、UI、实际专项、打包字节及未验证范围。不得再用“27 项通过”“SDK CI 全绿”或“包已升级”概括为全部能力已适配完成。
