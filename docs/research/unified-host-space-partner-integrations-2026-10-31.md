# Space 迁入统一 Host 后，业务集成与 Partner 如何保持能力、授权和恢复语义？

TL;DR：不能把 Partner inline driver 换成 `ensureKodaXClient` 就宣告迁移完成。固定的 KodaX `f6a010462` 已退役 public embedded/owner/factory 注入，但仍拒绝 Partner，且没有可信 profile 传输；后续未提交代码提供了必要的新接缝，尚须发布并修正能力广告、验证恢复上限。Space 应保留 Main 的专家/连接器/凭据/交付业务所有权，把执行迁给同一个 Host，并逐项替换旧进程内依赖，不能把 Expert、IMAP、工具调用和 Executor Plane 统称 A2A。

状态：**研究提案，未接受设计，未实现、未发布、未提交**。本次只读源码/第一方文档；没有运行模型、外部账号、测试、安装、构建或用户数据操作。笔记只记录源码支持的事实及明确标注的迁移建议。

## 证据冻结与引用约定

- `S:` = `C:/Works/GitProj/KodaX-AI/KodaX-Space`，HEAD `7801a8ca099c4ecf47af5b1e361ff6812f8c12b9`。下文 `S:路径:行` 均指这个版本；现有 `tests/fixtures/file-preview/fixture.txt` 修改未触碰。Space manifest/lock 是 `0.1.47-alpha.3` + 精确 SDK `0.7.97-alpha.11`，因此不能用历史集成文档中 alpha.2/alpha.6 的快照替代当前依赖事实。〔S:package.json:3,59；S:apps/desktop/package.json:3,16；S:package-lock.json:2153–2156；S:docs/partner/INTEGRATION.md:87–90〕
- `K:` = `C:/Works/GitProj/KodaX-AI/KodaX` 的 **commit `f6a010462`**，使用 `git show f6a010462:<path>` 读取，不把该目录的未提交文件当作 commit 内容。`K:src/sdk-runtime.ts:4140–4152` 明确拒绝私有 Runtime 构造和 `externalAgents/sharedDaemonHost/daemonHostRuntimeId` public 注入。〔K:src/sdk-runtime.ts:4140–4152〕
- `W:` = 同一 KodaX 主库 **2026-10-31 读取时的未提交工作区**，只能证明拟议接缝，不能证明 registry alpha.11 或 `f6a010462` 有该能力；`createExecutionProfile`、Partner 准入、Run actual workMode/effectiveConfig 等均按此归类。工作区文档本身也将这些写为后续未发布修复。〔W:docs/SPACE_SDK_SEAMS.md:7–12；W:src/sdk-client.ts:16；W:src/client-host-authorization.ts:8–22,190–218〕
- 固定版本复核命令：在对应仓库运行 `git show 7801a8ca:<path>` / `git show f6a010462:<path>`，再按行定位。`W:` 没有 immutable commit，实施前必须换成实际发布包的完整性、构建身份和能力/fixture 证据，不可直接引用成上线结论。〔建议，依据上述版本差异〕

## 1. 当前不是“四种 Partner Agent factory”

| 业务 | 当前真实结构 | 迁移时不能偷换的语义 |
| --- | --- | --- |
| Partner 会话执行 | `KodaXHost` 维护 ManagedSession，默认创建 Real/Mock；Partner 由 `RealKodaXSession.runRealStream` 调用 standalone `/coding` 的 `runManagedTask`。 | Host 会话/Run 变为唯一执行 owner，Space Main 保留产品配置与安全业务，不能留下第二个 inline fallback。〔S:apps/desktop/electron/kodax/host.ts:82–88,232–245,266–365；S:apps/desktop/electron/kodax/real-session.ts:2671–2694〕 |
| Expert | Space Extension manifest/UserExpertStore → immutable `PartnerExpertSnapshot` → 每轮 `buildPartnerAgentProfile` 的 persona、verification 和默认 Skill。 | Expert 是同一个会话的持续角色和方法，不是独立远程 Agent；换 A2A 会改变上下文、选择、验证和历史语义。〔S:apps/desktop/electron/space-extensions/experts.ts:15–61；S:apps/desktop/electron/kodax/partner-profile.ts:146–201；S:apps/desktop/electron/kodax/real-session.ts:724–746,2454–2457〕 |
| Mail | Main `createMailConnector`，底层 ImapFlow/mailparser/html-to-text；通过窄的 connector read/search 暴露给本轮。 | 不是邮件 Agent/SMTP；保留 canonical INBOX UIDVALIDITY/UID 引用、只读旗标、体积/扫描限额，不能换成任意网络工具。〔S:apps/desktop/electron/partner-connectors/runtime.ts:115–139；S:apps/desktop/electron/partner-connectors/mail-connector.ts:1–16,49,72–79,432–450,512–547；S:apps/desktop/electron/kodax/partner-connector-runtime.ts:137–151,211–239〕 |
| Connector adapter factories | Main `getPartnerConnectorService` 组合 Feishu、腾讯文档、IMAP、官方远程 MCP、API 和私有平台 adapters；`createPartnerConnectorRunRuntime` 只是 per-run ExtensionRuntime wrapper。 | adapter/credentials/策略/真实操作生命周期继续归 Main 服务；工具通道可以迁，但不能让模型或 Host 原始 MCP 直接绕开服务。〔S:apps/desktop/electron/partner-connectors/runtime.ts:76–82,115–171；S:apps/desktop/electron/kodax/partner-connector-runtime.ts:410–483〕 |
| Executor Plane | 唯一查到的 AgentExecutorFactory 是 `ExternalAgentGateway` 的 `createReferenceAgentExecutorFactory`，不是专家/邮件 factory；它使用 standalone `/agent` 的 plane、独立 JSON store、注册/preflight/task/input/cancel/reconcile。 | Reference、A2A、native Actor 是不同协议/生命周期。Reference 明确没有网络、credential 和 artifact authority，不能直接把旧 taskId/registration 当 Host A2A id。〔S:apps/desktop/electron/kodax/external-agent-gateway.ts:293–348,487–585,600–631〕 |

`f6a010462` 的 public `externalAgents` 注入退役不等于 standalone `/agent` 的 executor-plane 库被删除：Space 自己调用 `/agent.createAgentExecutorPlane` 仍是现存业务代码；若继续保留它，它是 Space 自有服务，而不是被 unified Host 自动接管。不能把“库还能用”解读成“可再向 public Host 注入 factory”。〔K:src/sdk-runtime.ts:4148–4152；S:apps/desktop/electron/kodax/external-agent-gateway.ts:6–16,600–631〕

## 2. 必须先到位的 SDK 契约与已经存在的接缝

### 2.1 固定 f6 不能直接承接 Partner

`f6a010462` 的共享 Runtime admission 明确 `isPartnerSessionIdentity(...) => false`；其 Main execution authorization 只有 scoped credential、Host Tools、独立 Actor tools 上限和 Workflow ceiling，没有 `profile`、`agentProfile`、verification 或 `services.createExecutionProfile`。因此保留原 surface/profileId 的 Partner 在此版本会拒绝；伪装成 `code`/去掉 identity 则掩盖产品安全边界，不是兼容方案。〔K:src/sdk-runtime.ts:21392–21413；K:src/client-host-authorization.ts:173–197〕

未提交 `W` 才把 `surface:'partner'` 纳入 admission，并新增 `RuntimeExecutionProfile {agentProfile, taskVerification, tools, toolMetadata}`、同连接 `services.createExecutionProfile` 和 `productExecutionProfile.version === 2` 检查。builder 读该 Session 的 **Host 实际工具目录**，合并所选 Host Tool descriptors，拒绝同名碰撞；不能使用 Main 的进程内工具 registry 做最终目录。〔W:src/sdk-runtime.ts:21443–21456；W:src/client-host-authorization.ts:8–22,190–218；W:src/client-runtime-adapter.ts:20–50；W:src/execution-profile.ts:9–31〕

**已发现未发布代码内部的不一致**：同一 `W` 中实际 admission 允许 `partner`，但 server initialize 仍广告 `sessionAdmission.surfaces` 为 Coder 列表且 `partnerDenied:true`。这是源码可直接确认的上游 gap，不能让 Space 同时相信两者。发版前应修复能力描述并对已发布二进制验证；只看 pending fixture 成功不能替代广告一致性。〔W:src/sdk-runtime.ts:808–817,21452–21456；W:src/runtime-daemon/server.ts:152–161,2796–2800〕

### 2.2 Main 可以在同连接上“选择快照”，不能搬运原始函数图

`W.authorizeExecution(request, services)` 每次操作由可信 Main 决定 profile、credential、Host Tools；SDK 克隆产品输入并删除 `authorization/profile/agentProfile/toolVisibilityPolicy/...` 等越权字段。Main 回调可以根据自己验证的 Session/Expert 引用生成本轮 profile，并使用当前连接的 services；返回的是完整 JSON profile 值，不是 opaque profile id。`toolVisibilityPolicy` 函数只在 Main 针对 Host catalog 求值，Host 接收 allowlist + 完整 name/sideEffect/planModeAllowed 元数据并逐调用复核。〔W:src/client-host-authorization.ts:8–22,190–218；W:src/client-runtime-adapter.ts:20–50；W:src/execution-profile.ts:9–31〕

这不提供传输 `extensionRuntime`、`agentExecutorPlane`、任意 `promptOverlay`、dynamic-context executor 或自定义 SDK events 的通道；原来 `RealKodaXSession` 拼出的 context/options 要分别分配到 profile、Host 自有 integration、Main Host Tool 和 Host observation。当前公开文档也明确 Product 不开放任意 prompt/context 或 selfManual/promptOverlay。〔S:apps/desktop/electron/kodax/real-session.ts:2546–2584,2618–2668；W:docs/SPACE_SDK_SEAMS.md:151,264–269；W:packages/coding/src/client-contract.ts:785–799〕

`surface/profileId/persona/verification` 本身不是工具权限。`workMode:'agent'` 是通用 Agent 预设，不能重建 Space 旧 Partner 的 shell-free/no-child-tools 边界。保留现有产品行为时，Main 必须显式提交 Partner tool policy，并由 Host 与 workMode、Skill policy、管理员/权限模式取交集；仅设置 Agent workMode 会放大旧 Partner 能力。〔W:docs/SDK_MIGRATION.md:11–21,46–49；W:src/runtime-daemon/server.ts:2562–2575；S:apps/desktop/electron/kodax/partner-tools.ts:34–49,157–177；S:apps/desktop/electron/kodax/partner-profile.ts:36–39,58〕

### 2.3 独立 Actor 不能套 root profile

`W` server 明确拒绝 `agents.spawn/followup` 带 `authorization.profile` 或 root Workflow ceiling。独立 Actor 使用自己的声明和工具上限；派生子任务继承父限制。Main 回调必须按 request.kind 分支，不能对所有请求无条件返回 Partner root profile。Expert 的持续角色也不能自动变成每个独立 Actor 的 persona。〔W:src/runtime-daemon/server.ts:2401–2408；W:docs/SDK_MIGRATION.md:44–47；S:apps/desktop/electron/kodax/partner-profile.ts:146–149〕

## 3. 业务集成逐项接线清单

下表“目标”全部是研究建议，需通过后文验收；“现有事实”引用当前源码。

| 域 | 现有事实/调用点 | 建议目标与不可丢的约束 |
| --- | --- | --- |
| Host/Session facade | `host.ts` 创建时校验 Partner-only、persistent-only Expert/connectors；`setPartnerExpert/setPartnerConnectors` 串行 durable mutation。〔S:apps/desktop/electron/kodax/host.ts:282–302,399–487〕 | 保留产品校验与 IPC facade，统一 Host 持有全部真实 Session/Run；取消 default/legacy/Partner inline 执行分叉，但不以删除 facade 代替业务迁移。 |
| Expert catalog | resolve 验证 extension/expert/revision；requireAvailable 查当前包仍存在，但保持已绑定旧 prompt/revision，升级包不等于用户同意替换角色。〔S:apps/desktop/electron/space-extensions/experts.ts:33–61〕 | Main 仍解析 opaque 引用和 exact snapshot；每次新输入/排队消费按明确时点重新检查 package availability，保留原 revision，不能 Renderer 直接传 instructions/profile。 |
| Expert profile/verification | base Partner instructions + expert prompt + workflow quality checks 合成；verification 增加 requiredChecks/criteria，角色不增加权限。〔S:apps/desktop/electron/kodax/partner-profile.ts:48–135,151–201〕 | 新包 profile v2 绑定完全相同 instructions/verification/tool ceiling；用 `runs.read().effectiveConfig` 核对实际装配，不用 UI 当前模式推定。`effectiveConfig` 只能证明执行事实，不代替授权记录。〔W:packages/coding/src/agent-runtime/effective-config.ts:15–32,51–58；W:src/sdk-runtime.ts:20662–20664〕 |
| Expert 默认 Skill | 每轮加载 expert 精确 skillRef；用户 slash Skill 覆盖本轮方法，不移除角色；缺失/blocked/fork 在模型准入前拒绝；Partner disableDynamicContext，hooks 不能借此调用工具。〔S:apps/desktop/electron/kodax/real-session.ts:610–746,1051–1074；S:apps/desktop/electron/kodax/partner-expert-runtime.test.ts:688–846〕 | 默认 Skill 不是把名称拼进 prompt 就等价：需保留 trusted invocation、变量/参数、model override、allowedTools、hooks/finalize、错误分类及 raw input。优先补 Host 原生可信“默认方法 Skill”接缝/受限 Host extension；未证明前作为切换阻塞，不能偷偷调用 standalone prepare 再传任意 options。 |
| 普通 slash/model Skill | Space 当前准备时检查 context fork；模型触发 Skill 的 options.skillDynamicContext 也明确 Partner disable。〔S:apps/desktop/electron/kodax/real-session.ts:618–650,2651–2655〕 | 原始输入走 Product `inputs.submit`；新 Host 原生 Skill 机制负责准备，但必须证明 Partner shell-free、fork拒绝、hooks不会旁路。目前 `W` Host 通用动态上下文可运行受限 read-only shell，不能假定与“完全禁用”相同。〔W:src/sdk-runtime.ts:12419–12437,14727–14755〕 |
| selected sources/evidence | 每轮取 Partner sources、automatic retrieval overlay、工具 policy summary，和用户 prompt overlay 合并。〔S:apps/desktop/electron/kodax/real-session.ts:2443–2481；S:apps/desktop/electron/kodax/partner-profile.ts:203–248〕 | 保留 Main sources/KB/retrieval 服务和当轮快照；把可信引导与不可信内容/引用明确分开。可研究纳入 Main 生成的 profile instructions 或 Host 扩展；只有列 sourceId/加载真实证据的验收通过才等价，不能因为有 persona 字段就宣称整个 overlay 完成。 |
| source/KB tools | `partner_source_read` 按当前 session sourceId、root、bounded extraction；KB list/read/search/maintenance/write 是 Space stores，靠 SessionRunContext 获取身份。〔S:apps/desktop/electron/kodax/partner-source-tool.ts:18–38,147–164；S:apps/desktop/electron/kodax/partner-kb-tools.ts:15–87,91–104,200–241〕 | 用 Main per-session/per-run Host Tools 封装现有 handler，保留 store/source boundary/admin audit；身份从可信 invocation→Host session/run + Main原始快照恢复，不能接受模型 sessionId/root。 |
| artifact/Office | inline 首轮全局 registerTool；Coder Host Tools 已有 create_artifact/create_office_artifact/manual/control。另有 `space-artifacts.mjs` 在 Node Host 装 Artifact SDK tools。〔S:apps/desktop/electron/kodax/real-session.ts:1613–1623；S:apps/desktop/electron/kodax/runtime/space-host-tools.ts:49–108；S:resources/space-artifacts.mjs:46–74〕 | Space store 工具和 SDK Artifact runtime 是两套职责，不能只注册 SDK Artifact extension 就替换 Space artifact.changed/版本/会话归属/导出。保留现有 Space handler→Host Tool；确保与 Host 目录无同名碰撞；Artifact worker 仍需可解析相同主包和真实 Node。〔S:resources/space-artifacts.mjs:10–43,46–74；W:src/client-runtime-adapter.ts:35–43〕 |
| delivery/小文件/rollback | `write_partner_deliverable`、`write_partner_workspace_file`、`rollback_partner_checkpoint`，以及 file proposal create/update；政策明确 bounded owned scopes。〔S:apps/desktop/electron/kodax/partner-delivery-tool.ts:22–76,82–110,162–180；S:apps/desktop/electron/kodax/partner-workspace-file-tool.ts:24–74,105–113；S:apps/desktop/electron/kodax/partner-file-proposal-tool.ts:25–78,166–194〕 | Host Tool bridge复用业务 handler，保留 delivery root、checkpoint before/after hash、symlink/TOCTOU、审批/审计；绝不能用通用 write/bash 替代，或让“rollback完成”只指聊天声明。 |
| helper runner | `run_partner_helper` Worker/VM、15s上限、写入量/扩展名/输入输出大小限制；不是任意 Shell。〔S:apps/desktop/electron/kodax/partner-helper-runner-tool.ts:49–63,107–128,996–1055,1103–1202〕 | 暂留 Main受限执行服务，Host Tool只是入口；Host取消/退出不能被当作Main Worker已终止。明确cancel信号/清理回执，不能搬成Script workMode后宣称安全等价。 |
| connector run tools | wrapper动态曝光read/search/propose/腾讯create/飞书Base/create，availability和plan过滤；运行内连接/权限撤销仍实时检查。〔S:apps/desktop/electron/kodax/partner-connector-runtime.ts:33–38,260–307,313–407,460–483〕 | 用 per-input/run scope租约+handler捕获 immutable bindings，或经审查的同等窄Host extension；保留同run实时撤销/权限收紧。不要全局给所有Partner注册全部平台工具；租约绑定不是连接器scope验证的替代。 |
| mail/remote MCP/API | Main adapters组合见上节，账号keychain、平台OAuth、官方CLI/MCP只在Main service内部使用。〔S:apps/desktop/electron/partner-connectors/runtime.ts:15–34,115–171；S:apps/desktop/electron/partner-connectors/official-remote-runtime.ts:193–210,295–357〕 | 继续由Main管理连接和凭据；LLM provider scoped credential broker不承载邮箱密码/OAuth刷新token/平台CLI profile。可以迁窄工具桥，不能把这些秘密放进Product input/profile/通用MCP描述。 |
| MCP | inline `createSpaceSdkExtensionRuntime` 合并project MCP并注册reverse能力；Coder面板已有Host owner、失败不回退本地。〔S:apps/desktop/electron/kodax/sdk-extensions.ts:79–87,171–219；S:apps/desktop/electron/test/mcp-host-owner.test.ts:7〕 | 所有执行MCP归统一Host，保留project覆盖/用户split config与reverse elicitation能力。Partner过滤需对 discovery、direct call、mcp_call及target metadata同时生效；不得因主工具mcp_call获准就放行任意target。 |
| SDK filesystem extension / Space Extension | SDK extension默认需显式env启用，在inline创建/activate/dispose；Space Extension是manifest、专家/connector/catalog/UI frame另一层。〔S:apps/desktop/electron/kodax/sdk-extensions.ts:70–72,139–219；S:packages/space-ipc-schema/src/channels/space-extension.ts:27–85；S:apps/desktop/electron/space-extensions/experts.ts:15–61〕 | SDK执行extension转到Host可信配置与lifecycle；Space Extension bundle/Host API version/disable/uninstall/Main policy保持产品权威。不能因为统一Host支持extensions，就直接运行任意.space-extension。 |
| builtin Skills | Main `registerPluginSkillPath`只影响本进程；Host另通过split extensions配置CAS注册`space-builtins.mjs`并用catalog验证激活。〔S:apps/desktop/electron/skill/space-builtins.ts:23–76,113–141；S:resources/space-builtins.mjs:1–4〕 | 统一Host之后Host catalog为执行真相，保留安装包真实路径、用户/项目覆盖、activation失败降级和诊断，不能把Main registry可见当Host可执行。 |
| Workflow / 子任务 | Partner `/workflow`执行和生命周期入口被产品显式拒绝；Expert.workflow只是工作期待。Coder Workflow已有Host start，旧local fallback还持有executor plane/artifact bridge。〔S:apps/desktop/electron/kodax/workflow-controller.ts:1094–1108,1423–1447,1896–1915,2005–2045；S:apps/desktop/electron/test/partner-workflow-guard.test.ts:10–66〕 | 保持Partner拒绝实际Workflow/child dispatch；Coder原生Workflow/Actor统一消费Host，外部Reference历史与操作另审。不能将专家workflow metadata自动编译成运行权。 |
| Memory Governance | `memory-service`先拒绝Partner，再优先HostController；不存在时构造本地MemoryControlPlane，resolver仍由kodaxHost/tryResume找到会话。〔S:apps/desktop/electron/memory/memory-service.ts:322–338,426–442〕 | 保持Coder-only支持面；统一Host后移除本地control fallback，缺Host能力就按事实不可用，不能因新Host接受Partner而自动开放治理/curator。Partner KB是另一套产品store，不等于此Memory Governance。 |
| Reference plane | Space自有store、owner/revision/preflight、task与events、Task Dock输入/cancel/reconcile；factory只有Reference，artifactPolicy deny。〔S:apps/desktop/electron/kodax/external-agent-gateway.ts:46–57,361–399,487–579,600–631〕 | public Host无factory注入口。保留历史只读与明确兼容服务是可行边界；如要求Host执行同一factory，必须先有受审的Host extension/executor注册契约，或真正协议adapter及数据迁移验收。不能把当前Reference `protocol:'http'`字符串当A2A兼容。 |

## 4. Host Tools 接缝可复用，但当前实现不支持 Partner，也不等价任意 function executor

当前 `registerSpaceHostTools` 为Coder实现：descriptor只有artifact/Office/manual/可选control；handler拿到可信invocation后检查leaseId、从Host load session/run/settings、验证run归属，并**显式拒绝 Partner surface/profileId**。它只复原Code的SdkToolExecutionContextLike，没有恢复Partner permissionMode/Expert/bindings/source快照。故把Partner route指到这个lease会丢工具且被handler拒绝。〔S:apps/desktop/electron/kodax/runtime/space-host-tools.ts:49–108,112–155；S:apps/desktop/electron/kodax/session-run-context.ts:5–19,31–67〕

手册/通用可信系统引导有现成Host extension路径：`provider:before`可`replaceSystemPrompt`；但不能把这个扩展点泛化成“替换Main全部context”。hook payload只有provider/model/reasoning/systemPrompt等，没有sessionId/runId/profile；API另有`getExecutionScope`，但注册阶段或非受管调用可为空，需要证明实际provider hook的精确scope。不能解析systemPrompt猜Partner身份，不能对所有客户端全局覆盖prompt，也不能靠改prompt同时改变AMA verification/tool ceiling。每run扩展frame快照支持生命周期隔离，但不等于Main临派发重授权。〔W:packages/coding/src/extensions/types.ts:197–207,426–429；W:packages/coding/src/agent-runtime/provider-hook.ts:55–80；W:packages/coding/src/extensions/runtime.ts:996–1020,1865–1889；W:docs/SPACE_SDK_SEAMS.md:264–266〕

建议分开三个实际用例：静态Space手册用随包受信Host hook合并；Expert persona/verification和source handles用可信Main profile数据；需要业务资源/平台操作的能力用Main窄Host Tools。Skill hooks/dynamic context仍属Host受管准备阶段，必须单独保留Partner完全禁用/拒绝语义，不能把它们包装成不受限Host Tool来恢复旧功能。〔建议；S:apps/desktop/electron/kodax/real-session.ts:632–655,2651–2655；W:src/client-host-authorization.ts:8–22,190–218；W:src/sdk-runtime.ts:12427–12437,14727–14755〕

原进程内 `withSessionRunContext` 用AsyncLocalStorage携带sessionId/surface/root/permissionMode；独立Host不会共享Electron ALS。新adapter应以`invocation.sessionId/runId/leaseId`核验Host事实，加Main已持久化的原输入配置，调用原handler并显式提供context。工具输入中的sessionId/root/连接scope不可作为信任来源，Host session不能证明该run拥有某connector。〔S:apps/desktop/electron/kodax/real-session.ts:2682–2694；S:apps/desktop/electron/kodax/session-run-context.ts:21–67；S:apps/desktop/electron/kodax/runtime/space-host-tools.ts:125–155；建议〕

能力形状也不同：Host Tool只提供schema、description、`none/idempotent/non_idempotent`，handler收invocation并返回content/structuredContent；原ExtensionRuntime还能提供hooks、controller、hydrateSession、capability prompts/resources/search快照和run-scoped tools。单个RPC工具不能替代整个ExtensionRuntime或AgentExecutorFactory的preflight/events/tasks/cancel/reconcile。〔W:src/client-host-authorization.ts:127–180；S:apps/desktop/electron/kodax/partner-connector-runtime.ts:410–456；S:apps/desktop/electron/kodax/external-agent-gateway.ts:435–585〕

Host Tool映射会把`none`变readonly/planAllowed、其余变mutates-state；原connector还有`reads-network`和不同planModeAllowed。必须测试基于**实际Host元数据**生成的Partner policy、调用时再次检查target metadata、原业务plan例外，不能只比较工具名。未提交profile builder正是为解决元数据变化后的旧授权沿用而保存精确metadata。〔K:src/runtime-daemon/reverse-bridge.ts:1088–1105；W:src/execution-profile.ts:4–7,15–31；S:apps/desktop/electron/kodax/partner-connector-runtime.ts:137–151,211–239；S:apps/desktop/electron/kodax/partner-tools.ts:179–225〕

生命周期仍依赖Main：反向桥没有连接handler时是`waiting_host`；已经dispatched后断连/超时则副作用`unknown`，不会证明远端操作没发生。f6默认最多64 tools/lease、结果默认1MiB，不能把大文件/附件塞回content绕过现有artifact/read边界；主进程重启后内存dedup map也不持久。〔K:src/runtime-daemon/reverse-bridge.ts:28–29,276–285,688–789；S:apps/desktop/electron/kodax/runtime/space-host-tools.ts:118–119,125–126,155–159〕

建议保持Main可见资源操作ledger并与Host invocationId、业务taskId/turnExecutionId关联；断连后的native create/Base unknown不自动重试。Host取消、Main connector进程/网络请求取消、业务写入是否已dispatch及外部内容校验是不同事实，必须各自结算。现有原生创建描述/verification已经要求canonical URL、独立content verification、unknown不重试；这套语义不能被generic tool错误字符串压平。〔S:apps/desktop/electron/kodax/partner-connector-runtime.ts:179–209,240–258；S:apps/desktop/electron/kodax/partner-profile.ts:54–70,97–113；建议〕

## 5. 凭据和外部依赖的所有权

Main provider broker已有leaseId/session/provider allowlist + operation-specific policy fence，且provider凭据只由reader按请求读取。`authorizeProductExecution`为所选provider创建scoped lease，恢复同连接附着；这是模型凭据接缝，不能替代connector account/revision/resource授权。〔S:apps/desktop/electron/providers/runtime-credential-broker.ts:17–31；S:apps/desktop/electron/kodax/runtime-host-adapter.ts:6277–6326,6357–6384〕

连接器runtime composition root依赖Space数据目录、ExtensionStore manifest和required capabilities、AdminPolicyAuditStore、Electron平台openExternal、keychain和打包官方CLI archive。邮箱依赖ImapFlow/mailparser/html-to-text，远端MCP/OAuth与平台API依赖各自credential store/endpoint/schema验证。这些并非Host中天然存在的能力；迁移执行owner不会搬走Electron用户交互和平台credential backend。〔S:apps/desktop/electron/partner-connectors/runtime.ts:1–34,40–75,95–113,142–185；S:apps/desktop/electron/partner-connectors/mail-connector.ts:1–16；S:apps/desktop/electron/partner-connectors/official-remote-runtime.ts:193–210,295–357〕

连接器service现有授权不是一次绑定即可：account revision、adapter类型、exact scope hash、INBOX/native create grants、folder/document whitelist、当前plan mode、extension blocked epoch、account epoch和admin policyRevision均在dispatch前及结果交付前检查。新的Host Tool handler必须复用它；为“让Host离线可用”把凭据/账号scope永久交给通用Host MCP会改变安全上限。〔S:apps/desktop/electron/partner-connectors/service.ts:851–867,893–997,1000–1035；S:apps/desktop/electron/kodax/partner-connector-runtime.ts:288–307,313–407〕

## 6. 授权、排队、专家切换和Host重启恢复

### 6.1 现有Space与新Host的时点不同，需要显式定约

Partner当前expert mutation是persist-first，同session runtime队列成功ACK后才更新内存；当前run固定角色，`after_turn`下一轮开始才抓最新已提交expert。现有测试明确“queued开始早于write ACK用旧role”“committed change只影响queued next turn”，这不是可随意改变的实现细节。〔S:apps/desktop/electron/kodax/host.ts:399–448；S:apps/desktop/electron/kodax/real-session.ts:1153–1155；S:apps/desktop/electron/kodax/partner-expert-runtime.test.ts:604–675〕

Coder现有Main授权则在input提交时capture，重投同inputId返回已捕获authority；steer必须复用target run原授权。Host execution key包含principal/session/credential/host-tools/Workflow/profile，相异profile不能混进活动run；steer key不等明确conflict。迁移不能同时宣称“排队永远取最新角色”和“已接受input authority不可变”而没有新接缝。〔S:apps/desktop/electron/kodax/runtime-host-adapter.ts:6244–6275,6325–6354；W:src/runtime-daemon/server.ts:2431–2438；W:src/sdk-runtime.ts:12610–12619〕

建议把两个时点分别定义：排队输入的用户意图/原绑定上限在接受时固定；真正开始下一轮时允许刷新已提交Expert角色/方法的产品契约，必须经可信Host/Main机制再次验证，而且只能收窄原安全上限。若选“接受时就冻结角色”的新产品语义，必须明确评审并更新Partner体验/回归，不可当成原行为已保留。`steer`继续旧run profile；角色切换需要新run，不能在同run伪装steer改变authority。〔建议，依据上述冲突〕

**最小保真方案需要一个窄的上游接缝，目前未找到已实现的public版本**：在Host将已接受的queued input绑定新run之前，以原principal/session/inputId验证Main新提交的persona/verification/默认Skill修订；Host把安全工具/connector/credential上限和原接受快照取交集，并持久化本轮采用的Expert revision，然后才执行Skill准备/模型。复用现有Main authorizer概念即可，不需要通用插件框架，但现在authorizer只在客户端发请求时调用，Host queue捕获的`ProductExecutionContext.bindRun`闭包已经固定profile。现有队列没有dequeue时反向调用Main重授权的public API。〔W:src/client-runtime-adapter.ts:17–50；W:src/runtime-daemon/server.ts:2421–2446；W:src/product-execution-authorization.ts:5–11；W:src/sdk-runtime.ts:12442–12451〕

现有同inputId重投并不能当该接缝：队列digest含execution key，修改profile会冲突；withdraw后用新inputId是新意图；Space私下另管一份排队再在idle发送，会丢掉Host已接受/离线队列的所有权与恢复语义。`provider:before`改prompt也没有同时更新verification/默认Skill/安全ceiling的原子保证。因此若不先补窄接缝，只有“接受时冻结角色”的真实产品语义分叉可选，必须明确接受，不能称零回归。〔W:src/session-input-queue.ts:28–37,134–150,248–255；W:packages/coding/src/extensions/types.ts:197–207；建议/推断〕

### 6.2 现在的Main授权store不足以保存Partner

`RuntimeInputAuthorizationStore` strict schema只容credential/hostTools/tools/workflowHostPolicy，**没有profile**；record键是runtimeId+clientInstanceId+sessionId+inputId，128KiB限制，已捕获值不可替换。直接把new profile加入当前authorization会在capture解析被拒；只存lease引用也不能保留persona/verification/tool metadata。〔S:apps/desktop/electron/kodax/runtime/runtime-input-authorization-store.ts:9–38,46–103〕

建议在切换前保存非秘密、可验证的原始授权快照：exact Expert/revision/useSkill、base Partner policy版本、profile.agentProfile/taskVerification/tools/toolMetadata、selected connector snapshots及revision、source/evidence引用、原inputId与runId映射和租约descriptor身份。扩展store有界schema/CAS/immutable语义并证明最大Expert+metadata不超限；凭据材料始终不落此record。恢复时新Host目录只能与旧tool metadata快照/当前live revocation取交集，不能为了恢复把旧policy重新按更大的新目录求值。〔建议；S:apps/desktop/electron/kodax/runtime/runtime-input-authorization-store.ts:9–38,71–103；W:src/execution-profile.ts:15–31〕

### 6.3 Host并不持久化Main函数或完整queued authority

`W.captureGenerationResume`保存可序列化agentProfile/taskVerification/workModePolicy和任务选项；toolVisibilityPolicy等非序列化authority变为requiredBindings，新进程必须提供匹配类型的binding。Host generation checkpoint因此可保存persona/verification事实，却不能独自恢复Main谓词、connector服务或handlers。〔W:src/runtime-generation-recovery.ts:10–19,21–54,57–70；W:src/sdk-runtime.ts:3886–3916〕

Host `PendingSessionInput`持久化只有input、skill标志、principalId；内存里才有execution closure/key。恢复可置awaitingBinding；原principal重投同inputId后以新authority重绑。input digest包含execution key，普通ACK丢失的重复提交与恢复后fresh binding不是同一情形。它保证原principal/intent边界，**不证明新profile不会比原profile更宽**；这个事实需原授权快照及恢复策略补齐。〔W:src/session-input-queue.ts:6–37,64–68,95–117,134–150,161–176〕

Space当前重连可从同runtimeId的store恢复queued/run租约；Host替换后store键变了，generation recovery又调用`kind:'recovery'`（没有inputId）并按当前settings生成新授权。其恢复options只传当前provider/model/reasoning，没有Partner profile/原scope。这个实现只能作为Coder既有基础，不能据此承诺Partner跨Host恢复无权限放大。〔S:apps/desktop/electron/kodax/runtime-host-adapter.ts:5195–5237,6334–6340,6579–6602〕

SDK recover校验原principal、旧owner已dead、精确checkpoint/history digest、无stop/活动run/待清理shell，再要求credential/HostTools重绑；它把保存的声明式context与新binding组合后重新start，并仍会经过本次execution.bindRun。因此必须实测原profile上限和新profile binding组合的最终结果，不能只看到checkpoint读回就宣称策略保留。〔W:src/sdk-runtime.ts:12878–12923,11949–11955；W:src/runtime-daemon/server.ts:2562–2575〕

对独立Actor恢复，应保存并验证actorPath/turnId与自己的tool ceiling，使用空objective+resumeCheckpoint，不能借root recovery把Partner角色或root许可覆盖进去；SDK对子checkpoint记录了actor身份/tools，但新Main仍需按原授权重建，而不是从当前根会话推断。〔W:src/sdk-runtime.ts:3893–3901,3914–3915；W:src/runtime-daemon/server.ts:2401–2408；W:docs/SDK_MIGRATION.md:69–72〕

## 7. 切换门槛与最小实施顺序（提案）

1. **先SDK后Space**：发布包含Partner admission/profile v2/Host catalog/metadata复核/actual snapshot/Actor checkpoint的新包，并修复`partnerDenied`广告；验包内容和两类Host（新起/已有旧Host）upgrade-required行为。f6或旧registry失败不能回退Partner inline执行。〔建议；K:src/sdk-runtime.ts:4140–4152,21401–21413；W:src/client-runtime-adapter.ts:25–48；W:src/runtime-daemon/server.ts:2796–2800〕
2. **先复原不变量**：明确Partner默认workMode=agent且显式旧tool policy、profile/verification、expert/Skill排队时点、原授权快照与恢复交集规则。没有默认Skill和完全禁用动态shell的Host接缝/证据前，不删除旧功能后声称同等迁移。〔建议；S:apps/desktop/electron/kodax/real-session.ts:610–746,2651–2655；W:src/sdk-runtime.ts:14727–14755〕
3. **Main窄桥**：分开Coder和Partner的descriptor/handler构建，复用现有Space stores/connector service；按本轮授予工具、exact bindings和live revocation；Host负责模型schema/调用裁剪，Main负责平台资源/业务写入。不要做通用“执行任意function/source”的桥。〔建议；S:apps/desktop/electron/kodax/runtime/space-host-tools.ts:112–162；S:apps/desktop/electron/partner-connectors/service.ts:893–997〕
4. **统一Host integrations**：MCP/SDK extensions/builtin Skills/Artifact执行迁为Host真理；Space Extension和connectors的产品catalog留Main。先用无付费fixture覆盖完整请求/工具/恢复链，再按真实账号人工清单验收平台能力。〔建议；S:apps/desktop/electron/skill/space-builtins.ts:23–76；S:apps/desktop/electron/kodax/sdk-extensions.ts:171–219；S:docs/partner/INTEGRATION.md:87–95〕
5. **Reference决策独立验收**：先保留历史可读及明确状态，不把externalAgents退役错误吞掉。若必须在统一Host中维持原Reference执行，先补Host-owned executor注册或协议adapter的正式契约，再迁registration/task/events/取消/恢复；“换成A2A”不是可直接执行的迁移票。〔建议；K:src/sdk-runtime.ts:4148–4152；S:apps/desktop/electron/kodax/external-agent-gateway.ts:487–631〕
6. **最后移除旧owner**：对Partner所有入口/取消/复原/fork/retry/command/tool/workflow/Task Dock/extension disable已覆盖后，才删inline run、局部ExtensionRuntime、进程内registerTool和owner切换配置；保留standalone SDK的合法库使用不应被一刀切删除。〔建议；S:apps/desktop/electron/kodax/real-session.ts:1613–1623,2482–2496,2671–2694；S:apps/desktop/electron/kodax/external-agent-gateway.ts:600–631〕

## 8. 必须迁移/新增的回归验收

本次没有执行这些测试。表中现有test只作为primary acceptance意图，不代表新Host路径已经通过；现有很多“actual SDK”测试仍运行standalone inline，必须新增同语义的跨进程Product Client fixture。

| 验收组 | 具体必须证明 | 现有primary入口 |
| --- | --- | --- |
| admission/版本 | 新Host以真实Partner identity创建/列举/读写/执行；旧Host缺profile v2/目录直接upgrade-required；initialize广告与真实准入相符；不降级成Code或inline。 | K:src/sdk-runtime.ts:21401–21413；W:tests/sdk-profile-contract.e2e.test.ts:118–125；W:src/runtime-daemon/server.ts:2796–2800 |
| 真实工具上限 | Partner原allowed集合、动态Host Tool及MCPtarget在schema/discovery/direct/tool bridge/mcp_call路径一致；未知mutation、bash、child dispatch被拒；工具metadata修改后旧profile拒绝，fresh合法profile成功。 | S:apps/desktop/electron/kodax/partner-connector-sdk.test.ts:337–413；W:src/sdk-profile-contract.test.ts:19–92；W:tests/sdk-profile-contract.e2e.test.ts:142–202 |
| expert persona+verification | role/task两类专家、多轮/短follow-up、qualityChecks、真system prompt、来源/目的地真实性checks；新effectiveConfig与实际模型上下文一致；不丢verification、不赋额外工具权。 | S:apps/desktop/electron/kodax/partner-expert-profile.test.ts:21–66；S:apps/desktop/electron/kodax/partner-expert-runtime.test.ts:428–561 |
| Skill | expert每轮默认方法、用户slash覆盖单轮、prompt-only、缺失默认拒绝、fork拒绝、hook拒绝、model动态Skill不执行shell；支持raw input/inputId，不重复写历史或伪造slash用户意图。 | S:apps/desktop/electron/kodax/partner-expert-runtime.test.ts:688–846；S:apps/desktop/electron/test/explicit-skill-send-contract.test.ts:7–47；S:apps/desktop/electron/kodax/real-session.ts:610–746 |
| 专家切换/排队 | 持久ACK前后切换、queued刚开始的竞态、running固定旧角色、after_turn约定角色/默认Skill时点；包disable/uninstall在queue消费前阻止模型；A/B会话不串角色。 | S:apps/desktop/electron/kodax/partner-expert-runtime.test.ts:535–675,707–730；S:apps/desktop/electron/kodax/real-session.ts:1153–1155 |
| ACK丢失/重复提交 | Main在capture后、Host enqueue后、acceptance发回前分别断连；相同inputId不双run/双历史/双remote create，不被最新expert覆写；不同正文或artifact仍冲突。 | S:apps/desktop/electron/kodax/runtime/runtime-input-authorization-store.ts:71–103；W:src/session-input-queue.ts:28–37,134–150,155–179 |
| steer/redirect | 精确targetRunId，沿用原principal/profile/scope；角色已切换也不能给活动run升级，target终态产生dropped/conflict，不悄悄重发新任务。 | S:apps/desktop/electron/kodax/runtime-host-adapter.ts:6252–6275,7060–7096；W:src/sdk-runtime.ts:12610–12619 |
| Host替换恢复 | 原runtimeId记录映射到原run/input；snapshot可验证、live撤销只收窄；Host新增工具/metadata变化不得扩大旧授权；缺snapshot拒绝继续；原Expert与verification、默认Skill、源/connector scope不换成当前新配置；未知tool不重放。 | W:src/runtime-generation-recovery.ts:13–19,57–70；W:src/sdk-runtime.ts:12878–12923；S:apps/desktop/electron/kodax/runtime-host-adapter.ts:6334–6340,6579–6602 |
| root/Actor恢复 | 派生子Actor保持父显式上限，独立Actor保持独立声明、actorPath/turnId/tools；root profile不能送agents.followup；空objective恢复原checkpoint；stale revision/不同principal/活owner/history变化拒绝。 | W:src/runtime-daemon/server.ts:2401–2408；W:src/sdk-runtime.ts:3886–3916,12878–12923；W:docs/SDK_MIGRATION.md:69–72 |
| connector isolation/revoke | Partner A/B、Coder各轮可见工具；read前后撤销、account revision、extension disable、admin policy tighten、plan tighten立即拒绝；reserve names不能被base provider shadow。 | S:apps/desktop/electron/kodax/partner-connector-runtime.test.ts:541–701,792；S:apps/desktop/electron/kodax/partner-connector-sdk.test.ts:337–492；S:apps/desktop/electron/partner-connectors/service.ts:893–997 |
| mail | scoped INBOX才出现search；每页500 UID/25头、canonical UID reference、只读EXAMINE/BODY.PEEK、无SMTP/mark-read、断连及时关socket、大消息限制；原邮件body当不可信数据。 | S:apps/desktop/electron/kodax/partner-mail-runtime.test.ts:39；S:apps/desktop/electron/kodax/partner-connector-runtime.ts:211–239；S:apps/desktop/electron/partner-connectors/mail-connector.ts:76–79,162–178,432–475,512–547 |
| 原生创建/提案 | 飞书唯一可信账号/目录、腾讯allowCreateDocument、Base新资源首表流程；append只建review卡；unknown/partial不自动重试；canonical URL即时交付，内容校验warning独立。 | S:apps/desktop/electron/kodax/partner-connector-runtime.test.ts:66–257,363–453,604–649；S:apps/desktop/electron/kodax/partner-mail-runtime.test.ts:91；S:apps/desktop/electron/kodax/partner-profile.ts:54–70,97–113 |
| Main断连/退出 | waiting_host vs dispatched unknown；lease resume/撤销、同principal所有权；Main Worker/CLI/network取消与Host Run结算分开；退出后Provider/connector凭据不会被别的client借用；不自动重放有状态外部操作。 | K:src/runtime-daemon/reverse-bridge.ts:276–285,504–519,774–819；S:apps/desktop/electron/providers/runtime-credential-broker.ts:17–31；S:apps/desktop/electron/partner-connectors/runtime.ts:183–189 |
| 交付/安全 | sources有界读取、KB session/project权限、delivery path/扩展名、checkpoint回滚hash及symlink、helper 15s/写入量/敏感字段；artifact版本/通知/恢复/导出归属；不能退为generic write/bash。 | S:apps/desktop/electron/kodax/partner-source-tool.ts:67–97,147–164；S:apps/desktop/electron/kodax/partner-checkpoint-store.ts:349–420；S:apps/desktop/electron/kodax/partner-helper-runner-tool.ts:49–63,996–1055；S:apps/desktop/electron/artifact/create-artifact-tool.ts:189–248 |
| integrations/打包 | Host catalog真实builtin Skill可读/执行、user/project覆盖、project MCP/reverse能力、SDK extension opt-in/disable/reload、Space Extension API 4/包禁用；Node Artifact worker路径与ASAR真实可用，失败不阻断基础聊天。 | S:apps/desktop/electron/test/sdk-extensions.test.ts:197–342；S:apps/desktop/electron/skill/space-builtins.ts:23–76；S:resources/space-artifacts.mjs:10–74；S:packages/space-ipc-schema/src/channels/space-extension.ts:27–85 |
| Workflow/Reference | Partner所有执行/生成/rerun/revise/lifecycle入口继续拒绝、只读inspection保留；Coder单Host；Reference旧注册/ledger/events终态可读，既有task input/cancel/reconcile不能误路由Host Actor/A2A。 | S:apps/desktop/electron/test/partner-workflow-guard.test.ts:10–66；S:apps/desktop/electron/test/workflow-controller.test.ts:22；S:apps/desktop/electron/kodax/external-agent-gateway.ts:487–579 |
| Memory Governance | Coder已有Inbox/Refs/approve/reject/curator/pack经Host，revision CAS保留；Host不可用不回落本地control；Partner仍拒绝，Partner KB不受影响。 | S:apps/desktop/electron/memory/memory-service.ts:322–338,369–385,400–414,426–442 |

## 9. 未证实与未解问题

- **未证实**：registry中任何已发布包包含`W`上述契约；本次不install/build/publish，不能证明真实SDK/二进制能力。切换以新包+新/旧Host fixture为准。〔S:package-lock.json:2153–2156；W:docs/SPACE_SDK_SEAMS.md:7–12〕
- **未证实**：Expert默认Skill、Partner完全disable动态上下文/hooks/fork，在Product Client原始输入接口已有可保真接缝。当前输入只有text/delivery/inputArtifacts，authorization.profile不含默认Skill或skillDynamicContext选项；通用Host默认执行器仍可调用read-only shell。需要上游明确契约或Host可信extension的实际实现证据。〔W:packages/coding/src/client-contract.ts:785–799；W:src/client-host-authorization.ts:8–22,190–218；W:src/sdk-runtime.ts:14727–14755〕
- **未证实**：profile跨Host recovery与queued fresh binding自动保持旧授权上限。现有SDK保存声明式上下文和requiredBindings，Main当前store没有profile且按runtimeId分区，不能得出“无权限放大恢复”。需要上述新回归。〔W:src/runtime-generation-recovery.ts:13–19,57–70；W:src/session-input-queue.ts:22–26,134–150；S:apps/desktop/electron/kodax/runtime/runtime-input-authorization-store.ts:9–38〕
- **待产品决定**：排队输入接受时固定Expert，还是保留目前消费时取最新已ACK角色；安全上限/用户意图固定与角色刷新必须分别定义，不能由实现偶然选择。〔S:apps/desktop/electron/kodax/partner-expert-runtime.test.ts:604–675；W:src/runtime-daemon/server.ts:2431–2438〕
- **上游接缝缺口**：保留“dequeue采用最新已ACK角色”需要原inputId/原安全ceiling下的临派发persona+verification+默认Skill更新；当前authorizer在client request阶段运行，Host queue捕获固定execution closure，没有找到对应public reauthorization操作。仅provider hook改system prompt不足以证明原子行为。〔W:src/client-runtime-adapter.ts:17–50；W:src/product-execution-authorization.ts:5–11；W:src/sdk-runtime.ts:12442–12451；W:packages/coding/src/extensions/types.ts:197–207〕
- **待上游决定**：public factory退役后Reference/自定义Executor若要成为Host执行能力，允许哪种受信注册/协议适配，以及owner、credential、artifact quarantine、preflight/revision、cancel/reconcile、任务历史兼容如何证明。已有Standalone plane不回答这个问题。〔K:src/sdk-runtime.ts:4148–4152；S:apps/desktop/electron/kodax/external-agent-gateway.ts:600–631〕
- **未验收**：真实飞书、腾讯文档、QQ/163、Notion/Airtable/Atlassian/Slack/GitHub/Zoom及私有平台账号行为，本次只审读源码；历史集成文档明确外部账号未自动视为验收完成。〔S:docs/partner/INTEGRATION.md:87–95；S:apps/desktop/electron/partner-connectors/runtime.ts:115–139；S:apps/desktop/electron/partner-connectors/official-remote-runtime.ts:295–357〕

