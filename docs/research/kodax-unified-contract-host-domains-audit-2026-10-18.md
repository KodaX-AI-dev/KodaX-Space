# Space 的 KodaX 统一契约迁移：Main 周边域是否仍有缺漏？

TL;DR：有。已确认共享 Coder 的 MCP 面板仍创建第二套可执行连接；Memory 治理仍直接操作旧路径的本地 controller，并丢失预览 revision。Learning 已复用 Host 域，ready 接入属于恢复契约的待验证改进，现有持久游标/回放机制不能被忽略，尚无已证实漏事件反例。config、Actor 和 daemon 不能仅因仍使用 `/runtime` 就判错，须按实际所有权与产品等价能力分别处理。[SDK_MIGRATION.md:47–53](../../node_modules/@kodax-ai/kodax/docs/SDK_MIGRATION.md#L47)、[CLIENT_CONTRACT.md:117–151](../../node_modules/@kodax-ai/kodax/docs/CLIENT_CONTRACT.md#L117)，具体生产链见下文。

## 范围和证据边界

- 只读审计 Space commit `8514865a72ab87d7baa5f21d0b3b8cb3ac8d2145` 的生产 UI → IPC → Main 调用链；SDK 物理安装为 Registry `0.7.97-alpha.7`。[已安装 package.json:2–3](../../node_modules/@kodax-ai/kodax/package.json#L2)
- API 能力以物理安装的文档、声明为准。补充实现证据来自相邻 KodaX 仓库 `v0.7.97-alpha.7 = 25fa6399ada6dae0493faa221eb82174eebb9ad6`；本文引用的 `runtime-memory.ts`、`runtime-learning.ts`、`client-runtime-adapter.ts`、`host-integrations.ts`、`integration-hot-reload.ts`、Memory paths 和 identity 文件，已用 `git diff --quiet v0.7.97-alpha.7 HEAD -- <files>` 确认与该 tag 相同。相邻仓库当前 HEAD 为 `b0b446ec84fd20f21529025d086813eb5bcb2bd0`，不能把它的全部内容当作 alpha.7。
- 本次只写这份研究笔记，没有修改产品、依赖或 tracker，没有启动模型、重建 SDK、改变 native ABI 或联系其他聊天；下述影响由静态调用链证明，未将其包装成真实 UI/模型 E2E 结果。
- 输入、Skill 执行、review、Workflow、权限、聊天正文/历史、统计及退出主链由其他审计负责；本文只检查 MCP/config/catalog/Skill 发现、Memory、Learning、注册/Actor 管理和 daemon 管理周边。迁移文档本身要求消费者不再持有客户端 MCP owner 或独立 Memory owner，不能用聊天主链回归通过替代这些领域的验收。[SDK_MIGRATION.md:47–50、138–139](../../node_modules/@kodax-ai/kodax/docs/SDK_MIGRATION.md#L47)

## 判定总表

| 领域                      | 生产事实                                                                                          | 判定                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| MCP 状态、start/stop/logs | Coder 面板仍直接 `getMcpManager()`，查询的是 Space 进程内连接                                     | 未迁移、用户可达；存在第二 owner                                 |
| MCP tools/reload          | tools 优先 Host、失败回退本地；reload 先重建本地再重载 Host                                       | 部分迁移；不能据 Host tools 接上就称 MCP 完成                    |
| MCPB                      | bundle 资产安装属 Space；共享 MCP 注册仍走 `/repl` 文件写、本地 manager reload                    | 资产管理可保留；共享配置/连接交接未闭环，Host watcher 可最终生效 |
| Memory                    | Coder-only UI 直接 `createMemoryControlPlane`，路径来自旧 `resolveMemoryRoot`                     | 未迁移、用户可达；与 Host scoped identity 不同                   |
| Memory 预览批准/拒绝      | IPC 无 revision；批准先重读 proposal 然后直接批准新结果                                           | 未接上预览身份契约                                               |
| Learning                  | 查询与控制复用 Host learning，同 `/client` 后端；bridge 擦掉 ready，但有持久游标回放/gap recovery | owner 已迁移；ready/恢复顺序待验证，不列为已确认漏事件           |
| config                    | Host patch/reload 已存在；UI compaction 和部分 provider 配置仍本地读写                            | 不能笼统判错；alpha.7 公共 config 不包含这些完整管理字段         |
| Actor/注册                | Coder A2A Actor 使用 Host；Reference executor 是明确 Space 自有兼容平面                           | 正确保留边界；无证据表明是第二套 Coder native Actor owner        |
| daemon 管理               | Main 使用 Host management 和 SDK CLI safe-stop，legacy 模式有独立 owner fence                     | 可信宿主管理边界可保留；不能要求 Renderer 代管或强停             |

表内证据分别见下方各节；表格不代表这些领域均已真实 E2E 验证。

## 1. MCP：第二套可执行 owner 仍在生产路径

**状态：未迁移且用户可达，优先修正。** SDK 明确要求 Host 负责 MCP 文件与执行连接，UI 不再创建 `McpManager`；公开 `mcp.status()` 只读状态，`reloadServers()` 显式重建，`listTools({forceRefresh:true})` 显式刷新。产品接口没有承诺旧 manager 的全部 start/stop/log 方法，缺少等价项也不能通过另建连接补齐。[SDK_MIGRATION.md:47、53](../../node_modules/@kodax-ai/kodax/docs/SDK_MIGRATION.md#L47)、[CLIENT_CONTRACT.md:106、131](../../node_modules/@kodax-ai/kodax/docs/CLIENT_CONTRACT.md#L106)

生产入口与实际调用：

1. `PopoutOverlay` 实际挂载 `McpPanel`；面板刷新同时调用 `mcp.servers` 和 `mcp.discover`，按钮调用 start、stop、reload、tools、logs。不是仅存于测试的旧代码。[PopoutOverlay.tsx:215](../../apps/desktop/renderer/src/shell/popouts/PopoutOverlay.tsx#L215)、[McpPanel.tsx:103、189、210、232、259、290](../../apps/desktop/renderer/src/shell/popouts/McpPanel.tsx#L103)
2. Main 的 `mcp.servers/start/stop/logs` 无 Coder/Partner 分流，直接取得本地 manager；生产构造为 `new sdk.McpManager(servers)`。[ipc/mcp.ts:49–80](../../apps/desktop/electron/ipc/mcp.ts#L49)、[mcp/manager.ts:84–99](../../apps/desktop/electron/mcp/manager.ts#L84)
3. `mcp.tools` 虽优先调用 Host，但任意 Host 查询错误都会记录 warning 后回退本地 manager；`mcp.reload` 则无条件先 `reloadMcpManager()`，再尝试 Host reload。两端都成功也仍是两套连接集合。[ipc/mcp.ts:82–147](../../apps/desktop/electron/ipc/mcp.ts#L82)、[runtime-host-adapter.ts:7058–7069](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L7058)
4. `mcp.discover` 仍通过 `/repl` 和项目 integration reader 读取全局/项目配置并合并 MCPB metadata。这是本地配置投影，不是 Host 已加载连接状态。[mcp/config-reader.ts:16–39、78–120](../../apps/desktop/electron/mcp/config-reader.ts#L78)

**实际影响：** Coder 面板的“停止”作用于 Space manager，不证明 Agent 使用的 Host server 已停止；“启动/工具查询”可另起 stdio server；Host tools 查询失败后显示本地成功目录会掩盖 Host 不可用。project-scope 本地目录与 Host global `mcp.listTools` 的来源也可能不同，不能把两者同名 server 当成同一个运行实例。判断来自上面调用链；未观察个人 MCP 进程，不能断言当前用户已经有重复 server。

**最小修正：** 共享 Coder 的状态和工具目录只消费 Host `mcp.status/listServers/listTools/reloadServers`，Host 故障保留为可见 unavailable。旧 start/stop 若无公共业务等价项，应明确收窄 UI 或向 SDK 提窄接缝；不要在 Coder 管理面自动构造本地 manager。Partner/显式 legacy 有自己的执行 owner 时按 surface/mode 明确路由，不必删除它们需要的本地代码。产品接口能力矩阵见 [已安装 Client 类型:1069–1094](../../node_modules/@kodax-ai/kodax/dist/types-chunks/client-contract-CRm9ZpL2.d.ts#L1069)。

### MCPB 的边界校正

bundle 解包、安装目录、Space 安装记录可以由宿主管理；但注册 shared MCP server 仍调用 `/repl.getMcpServerConfig/upsertMcpServer/removeMcpServer`，安装和卸载后只 reload 本地 manager 与本地 extension runtime。[mcpb/registry.ts:590–631](../../apps/desktop/electron/mcpb/registry.ts#L590)、[ipc/mcpb.ts:55–104、256–274](../../apps/desktop/electron/ipc/mcpb.ts#L55)

**不能据此断言 Host 永不生效：** alpha.7 Host 初始化了 integration hot reload，MCP 文件变化由 watcher 调用 `replaceConfiguredMcpCapabilityProvider`。但当前 MCPB 回执没有等待该 Host activation，也没有证明 watcher 正常，且仍额外 reload 了本地可执行 manager。[KodaX@25fa639 src/host-integrations.ts:19–48](../../../KodaX/src/host-integrations.ts#L19)、[src/integration-hot-reload.ts:64–107](../../../KodaX/src/integration-hot-reload.ts#L64)

最小修正是保留资产安装，shared MCP 注册经 Host `getServer/upsertServer/deleteServer`，需要立即确认时显式 `reloadServers` 并显示 Host 结果；本地安装成功和 Host 激活失败应可区分。不是把 bundle 解包本身搬进 Host。[已安装 Client 类型:1069–1094](../../node_modules/@kodax-ai/kodax/dist/types-chunks/client-contract-CRm9ZpL2.d.ts#L1069)

## 2. Memory：旧路径和本地 controller 没有迁到 Host scoped identity

**状态：未迁移且 Coder 用户可达，优先修正。** `/memory` 在 Coder 打开 `MemoryPanel`，Partner 显式拒绝；面板 list/proposal/read/approve/reject/curate/pack 全部经注册 IPC 进入 `MemoryGovernanceService`。因此这不是 Partner 特有例外。[BottomBar.tsx:1477–1485](../../apps/desktop/renderer/src/shell/BottomBar.tsx#L1477)、[MemoryPanel.tsx:109、134、156、187、217、246、263](../../apps/desktop/renderer/src/shell/popouts/MemoryPanel.tsx#L109)、[ipc/memory.ts:4–11](../../apps/desktop/electron/ipc/memory.ts#L4)

服务每次根据 Session projectRoot 计算 `resolveLearningProposalStore`、`resolveMemoryRoot`，再在 Electron 进程 `createMemoryControlPlane({cwd, learningStorePath, memoryRoot, sessionId, discoverSkills:false})`，没有调用 Host `memory.forProject`。[memory-service.ts:291–316](../../apps/desktop/electron/memory/memory-service.ts#L291)

这是实际路径/身份差异：

- 旧 `resolveMemoryRoot(cwd)` 是 `<agentConfigHome>/projects/<remote-key|local-hash>/memory`。[KodaX@25fa639 packages/agent/src/memory/paths.ts:117–127](../../../KodaX/packages/agent/src/memory/paths.ts#L117)
- Host `memory.forProject(projectRoot)` 则使用 `deriveCodingMemoryIdentityFromRoot(configHome,projectRoot)`，派生 tenant/user/workspace/agent/project 身份，再 `resolveScopedMemoryRoot(identity,'project')`，路径为 `memory-scopes/<tenant-hash>/project/<project-hash>`；controller 携带该 identity，操作重新进行 Host 授权。[KodaX@25fa639 src/runtime-memory.ts:118–142](../../../KodaX/src/runtime-memory.ts#L118)、[packages/coding/src/memory-runtime.ts:85–102](../../../KodaX/packages/coding/src/memory-runtime.ts#L85)、[packages/agent/src/memory/paths.ts:139–162](../../../KodaX/packages/agent/src/memory/paths.ts#L139)
- alpha.7 Product 与 Runtime 的 `memory.forProject` 是同一个后端；正确修复重点是使用该 Host plane，不是仅换 import 名称。[KodaX@25fa639 src/client-runtime-adapter.ts:129–154](../../../KodaX/src/client-runtime-adapter.ts#L129)

**实际影响：** 治理面读取/修改的是另一套 legacy root，不能保证是当前 Coder 执行使用的 scoped Memory；缺失 tenant/agent/user/workspace 归属上下文，也绕开了 Host 每次操作的 project 授权与精确 ref 解析。这里证明的是实现分叉，不声称已经发生个人记录丢失或迁移失败。[CLIENT_CONTRACT.md:84、151](../../node_modules/@kodax-ai/kodax/docs/CLIENT_CONTRACT.md#L151)

**最小修正：** 在可信 Main 根据已经验证的 Session/projectRoot 获取同一连接的 `memory.forProject`，转发公开 controller 查询/批准/拒绝/readRef。不要自己拼 scoped 路径，也不要复制旧目录覆盖新目录。`runCurator/buildMemoryPack` 没在 alpha.7 Product controller 中公开，不能通过另建本地 owner“补齐”：应先明确该 UI 能否由现有查询结果表达，或向 SDK 提窄的业务接缝，再处理旧功能的迁移。支持范围见 [已安装 Client 类型:674–708](../../node_modules/@kodax-ai/kodax/dist/types-chunks/client-contract-CRm9ZpL2.d.ts#L674)，当前本地 curator/pack 调用见 [memory-service.ts:356–379](../../apps/desktop/electron/memory/memory-service.ts#L356)。

## 3. Memory 预览 revision 与用户已见内容的绑定遗漏

**状态：用户可达的并发正确性缺口；应与 Memory owner 一并修。** SDK proposal 带 `revision`，批准/拒绝回传用户所见 revision，批准还必须保留 expectedFingerprints；过期预览不能批准新内容。[CLIENT_CONTRACT.md:151](../../node_modules/@kodax-ai/kodax/docs/CLIENT_CONTRACT.md#L151)、[已安装 Client 类型:674–684](../../node_modules/@kodax-ai/kodax/dist/types-chunks/client-contract-CRm9ZpL2.d.ts#L674)

Space 的 proposal schema 和 approve/reject input 均没有 revision；Main normalization 不保留它，controller 调用也不传第三个 expectedRevision 参数。现有 fingerprints 仍有价值，但不能替代 proposal 内容身份。[memory IPC schema:103–114、244–264](../../packages/space-ipc-schema/src/channels/memory.ts#L103)、[memory-service.ts:137–151、338–347](../../apps/desktop/electron/memory/memory-service.ts#L137)

更具体地，点击 Approve 会重新 `memory.proposal`，随后直接用 fresh proposal 的 id/fingerprints 提交，而不是绑定面板已展示 proposal 的 revision；点击 Reject 同样只传 id/reason。若 proposal 内容在用户查看后改变，当前流程可能批准用户尚未看过的新预览，或拒绝新版本；即使再次读取缩短窗口，也没有所见版本的 CAS。[MemoryPanel.tsx:168–191、211–221](../../apps/desktop/renderer/src/shell/popouts/MemoryPanel.tsx#L168)

**最小修正：** 把 Host proposal revision 贯穿 IPC 和 UI；点击批准/拒绝提交当前展示的 revision 与 fingerprints。若 fresh 版本不同，更新预览并要求用户针对新内容重新执行动作。保持 Host 的冲突结果和错误，不自动重放 mutation。[SDK_MIGRATION.md:66](../../node_modules/@kodax-ai/kodax/docs/SDK_MIGRATION.md#L66)、[ClientMemoryController:680–681](../../node_modules/@kodax-ai/kodax/dist/types-chunks/client-contract-CRm9ZpL2.d.ts#L680)

## 4. Learning：Host owner 正确，ready/恢复顺序属于待验证改进

**已经对齐的部分：** IPC 的 default runtime port 统一进入 `RuntimeHostAdapter.learning*`，实际调用同一个 Host learning 域；Product facade 本身也直接转发同样的 `runtime.learning` 方法。因此这里不存在另起 learning owner，不能因为 import 名称就要求重写。[ipc/learning.ts:541–550](../../apps/desktop/electron/ipc/learning.ts#L541)、[runtime-host-adapter.ts:6962–7020](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L6962)、[KodaX@25fa639 src/client-runtime-adapter.ts:114–126](../../../KodaX/src/client-runtime-adapter.ts#L114)

**契约使用差异：** alpha.7 的 Learning subscription 明确带 `ready:Promise<void>`，文档要求重新订阅、等待 ready 后再读 snapshot/list/get，读取期间的通知作为再次刷新信号；错误、断连和 Run 终态分开。Space `LearningRuntimePort.subscribe` 仅声明 `AsyncIterable`，擦掉 ready；`bootstrap()` 先读取 snapshot/events 并可推送 connected，之后 `subscriptionLoop()` 才 subscribe，重连也先 bootstrap 再订阅，未等待注册，也未做注册后的快照同步。这证明没有直接使用新推荐顺序，但单凭顺序不同不足以证明丢事件。[CLIENT_CONTRACT.md:117–121](../../node_modules/@kodax-ai/kodax/docs/CLIENT_CONTRACT.md#L117)、[已安装 RuntimeLearningSubscription:298–310](../../node_modules/@kodax-ai/kodax/dist/sdk-runtime.d.ts#L298)、[ipc/learning.ts:44–53、473–535](../../apps/desktop/electron/ipc/learning.ts#L473)

**影响及校准：** SDK 保留早期 iterator 错误，Space `next()` reject 会进入 reconnect 分支，因此不能说它完全吞掉所有订阅故障。Host `LearningEventSubscription` 保存 afterRevision，next 先读取持久 events，随后 register-and-recheck，覆盖“读快照后、注册订阅前”的普通新增事件；Space 还用 runtimeId/gap 检查并回读快照。故不能把未 await ready 直接等同数据断档。确定的差异是 connected/恢复快照早于远端注册确认；是否需要更强的跨 Host generation 快照栅栏尚待反例验证，不计入已确认功能缺漏。[ipc/learning.ts:473–535](../../apps/desktop/electron/ipc/learning.ts#L473)、[KodaX@25fa639 src/runtime-learning.ts:15–25、166–211](../../../KodaX/src/runtime-learning.ts#L15)、[packages/agent/src/learning/learning-center-service.ts:150–162、434–495](../../../KodaX/packages/agent/src/learning/learning-center-service.ts#L434)

**最小后续：** 可让 port 保留 ready 和 iterator.return，以契约规定顺序组织恢复，同时保留原持久 cursor、事件回放/gap recovery、错误展示和不重放治理动作；先增加握手失败、注册期间变化和 Host generation 变化的有意义反例，避免为了换接口名字改坏已有回放保证。无需建立新的 learning service。[CLIENT_CONTRACT.md:117–121](../../node_modules/@kodax-ai/kodax/docs/CLIENT_CONTRACT.md#L117)

## 5. config/catalog：存在混合接入，但不能伪造产品等价项

共享 Main 已有 Host `config.read/readEffective/patch/reload`；`/fallback`、`/stall-log` 在 runtime 模式使用这些公开 Host 管理方法。不是所有配置仍本地执行。[runtime-host-adapter.ts:7023–7038](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L7023)、[slash/builtin.ts:2688–2766](../../apps/desktop/electron/slash/builtin.ts#L2688)

Settings 的 compaction UI 确实仍本地 `loadConfig/saveConfig` 后再 reload Host；但这条路径把 reload 失败作为 `runtimeReload.status:'failed'` 返回并展示 warning，不能报成静默完全成功。更关键的是 alpha.7 `ClientConfig` 和 `RuntimeConfigPatch` 不含完整 compaction/customProviders 管理字段，不能建议直接 `config.patch({compaction})`，否则是在调用不存在的契约。[SettingsModal.tsx:1082–1099](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L1082)、[ipc/settings.ts:87–104、155–169](../../apps/desktop/electron/ipc/settings.ts#L87)、[user-config.ts:311–320](../../apps/desktop/electron/kodax/user-config.ts#L311)、[已安装 ClientConfig:1843–1878](../../node_modules/@kodax-ai/kodax/dist/types-chunks/client-contract-CRm9ZpL2.d.ts#L1843)、[RuntimeConfigPatch keys:1335–1337](../../node_modules/@kodax-ai/kodax/dist/sdk-runtime.d.ts#L1335)

Provider 配置也要分来源：Space 自有 provider/default 元数据继续落本地是宿主 UI 管理；Space 自有 custom provider 已通过 Runtime catalog upsert/delete 同步 Host，带失败恢复。直接编辑已有 KodaX config provider 则仍 `saveConfig` 后 best-effort reload，reload 异常只写 warning，调用者仍可能得到 `{ok:true}`。因此仍有“已保存”和“Host 已应用”反馈不足，但不是重复模型执行 owner。[providers/config.ts:3–10](../../apps/desktop/electron/providers/config.ts#L3)、[providers/runtime-catalog.ts:61–110](../../apps/desktop/electron/providers/runtime-catalog.ts#L61)、[user-config.ts:346–399](../../apps/desktop/electron/kodax/user-config.ts#L346)、[ipc/provider.ts:70–77、452–480](../../apps/desktop/electron/ipc/provider.ts#L70)

Builtin provider UI catalog 从安装 SDK 的 capability JSON 投影，再组合 Space 自有和 KodaX config provider；这些读取不是付费模型探测。不能把它声称为 Host 现场 catalog；本轮也没有执行 probe。当前 Host 技能/命令列表已有 adapter 入口，Skill 的发现与实际调用一致性由输入域专审，本文不重复下执行结论。[providers/catalog.ts:1–25](../../apps/desktop/electron/providers/catalog.ts#L1)、[ipc/provider.ts:205–287](../../apps/desktop/electron/ipc/provider.ts#L205)、[runtime-host-adapter.ts:7072–7086](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L7072)、[CLIENT_CONTRACT.md:105](../../node_modules/@kodax-ai/kodax/docs/CLIENT_CONTRACT.md#L105)

最小后续是明确可信 Main 的配置管理例外和现有 SDK 缺少的窄接缝；可支持字段走 Host patch，保留 Space 元数据；本地配置写后向用户区分 saved/applied/error，而不是在缺少公开字段时强行造通用 options 袋。[SDK_MIGRATION.md:53](../../node_modules/@kodax-ai/kodax/docs/SDK_MIGRATION.md#L53)

## 6. 注册/Actor 与 daemon：应保留的宿主边界

Coder 的 A2A 注册查询与外部 Actor tree/detail/spawn/send/interrupt/output 都进入同一 Host，按 Session 与实际 Actor/turn 查询；task.start 对 code+runtime 的 Host 注册选择 `startRuntimeActorTask`，后续控制根据 Host task identity 路由。这部分没有发现客户端缓存冒充 Host Actor 完成的确定新证据。[ipc/agent.ts:243–277、280–352](../../apps/desktop/electron/ipc/agent.ts#L243)、[runtime-host-adapter.ts:7109–7138、7174–7299](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L7174)

Space 本地 `externalAgentGateway` 确实持有独立注册文件与 executor plane，但它只注册 Reference executor，显式没有 credential、network/workspace effects 和 Artifact 能力，并有单独 managementOwner/CAS；UI 只给 Reference 条目编辑/删除。这是明确的 Space 兼容/演示执行平面，不应与 Host native/A2A Actor 混同，也不应为完成迁移把 Partner 这条边界盲删。[external-agent-gateway.ts:385–435、600–626](../../apps/desktop/electron/kodax/external-agent-gateway.ts#L385)、[SettingsModal.tsx:2175–2200](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L2175)

残余可观测性问题是 Host 注册/task 查询部分 catch 后返回 local/空数组，会让 Host 不可用显示成局部正常目录；这与文档要求保留 unavailable/error 有距离，可与统一管理面改造一起补 partial 标记，而不重造 executor。[ipc/agent.ts:63–77、169–185、199–215](../../apps/desktop/electron/ipc/agent.ts#L63)、[CLIENT_CONTRACT.md:345](../../node_modules/@kodax-ai/kodax/docs/CLIENT_CONTRACT.md#L345)

daemon 管理由可信 Main 保留是合理边界：正常连接先使用 SDK ensure/passive connect，runtime mode switch 有 owner fence 和管理 preflight；在没有 ready runtime 的 embedded rollback 分支调用已发布 SDK CLI `daemon stop --profile coder --timeout-ms ... --json`，验证 SDK 输出而非直接按缓存 PID 发信号。完整退出另走 lifecycle 回执主链，不应把 safe-stop helper 的存在误报为绕过统一产品退出。[runtime-host-adapter.ts:1704–1734、2354–2369、7537–7575](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L7537)、[runtime-daemon-control.ts:166–214](../../apps/desktop/electron/kodax/runtime-daemon-control.ts#L166)、[SPACE_SDK_SEAMS.md:87–116](../../node_modules/@kodax-ai/kodax/docs/SPACE_SDK_SEAMS.md#L87)

## 验收建议与未解问题

建议优先修正 Memory scoped plane/预览 CAS 和 MCP 单 Host owner（含 MCPB 注册交接）；Learning ready/跨代恢复先补针对性证据，再决定是否改动，管理面 partial/applied 状态另行补齐。每项都应由上述真实 UI/IPC 链的反例回归证明；旧 adapter/聊天回归全绿不能覆盖这些独立路径。依据是本报告各节对应的生产调用链及 [SDK_MIGRATION.md:131–139 验收清单](../../node_modules/@kodax-ai/kodax/docs/SDK_MIGRATION.md#L131)。

仍需产品/SDK 决策而非静态源码能独立回答：

1. Memory `curate/pack` 两个已有 UI 操作如何通过 Host 公开接缝保留；当前 Product controller 没有对应方法。[ClientMemoryController:677–687](../../node_modules/@kodax-ai/kodax/dist/types-chunks/client-contract-CRm9ZpL2.d.ts#L677)
2. Coder MCP start/stop 和 project-scope 管理交互要收窄到现有公共能力，还是向 SDK 提窄的 Session/连接管理接缝；不能沿用第二 manager 作为透明补齐。[SDK_MIGRATION.md:53](../../node_modules/@kodax-ai/kodax/docs/SDK_MIGRATION.md#L53)
3. 完整 compaction 和 custom provider 配置是否继续作为明确可信 Main 管理例外，或由 SDK 增加领域接缝；现有 Product config 类型不能承接其全部字段。[ClientConfig:1843–1878](../../node_modules/@kodax-ai/kodax/dist/types-chunks/client-contract-CRm9ZpL2.d.ts#L1843)

未证实：没有执行用户个人 Memory/MCP mutation，未判断个人 legacy/scoped 数据具体分布，未证明本次升级已经导致数据丢失、重复 MCP 进程或 Learning 事件漏收；这些不能从静态迁移缺口自动推导。
