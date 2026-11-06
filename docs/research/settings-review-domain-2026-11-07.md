# 设置导航应如何划分领域、作用域与真实能力？

TL;DR：不沿用“Runtime”杂物间，也不把八页数量当目标。最终共识采用分组侧栏、最多十一叶子：常规、外观、模型与服务商、上下文与限制（页头“上下文与运行限制”）、MCP、技能、外部 Agent、扩展与连接组件、安全与沙箱、故障排查、关于；按现有能力门控显示。作用域必须跟随实际数据所有者；禁止通用“全局/项目”切换器，禁止把插件安装、组件安装、账号连接、会话选用合并成“已连接”。这是基于下述源码的设计判断，未改产品代码。最终命名及整合方案见[共识报告](C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/settings-design-consensus-2026-11-07.md)，下文历史讨论保留当时名称。

## 范围与快照

- 仓库：`C:\Works\GitProj\KodaX-AI\KodaX-Space`，checkout HEAD `2e8bbd7e28b688a6fd5a9509140b828dce9fff56`；读取日期 2026-11-07。行号针对读取时工作区快照，不能当作该 HEAD 的纯净提交内容。
- 独立检验对象是 [2026-11-06 八页建议](C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/settings-information-architecture-comparison-2026-11-06.md)。只把源码及第一方文案作为事实源；导航、标签、布局均标为设计判断。
- 另一线程正在修改工作模式。下文记录当前读取到的行为以揭示迁移风险，不把固定 `ama` 或已有模式枚举当成未来产品设计约束。读取快照的创建逻辑见 [createSession.ts:116](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/createSession.ts:116)。

## 事实：默认值、当前会话与配置所有者

| 对象 | 读取到的真实边界 | 导航/文案含义（设计判断） |
|---|---|---|
| Space 应用偏好 | IPC schema明确是用户级 `~/.kodax/space/settings.json`；含默认工作区、语言、终端、关窗行为及 runtimeDefaults。见 [settings.ts:1](C:/Works/GitProj/KodaX-AI/KodaX-Space/packages/space-ipc-schema/src/channels/settings.ts:1)、[settings.ts:68](C:/Works/GitProj/KodaX-AI/KodaX-Space/packages/space-ipc-schema/src/channels/settings.ts:68)。 | 常规页面解释“Space 应用偏好”。不提供项目切换器。 |
| 新会话默认 | createSession 根据 pending、Space 默认、KodaX 默认解析创建参数；模型/服务商还存在各自回退。见 [createSession.ts:76](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/createSession.ts:76)。 | 页面必须区分“以后创建的会话”与“当前会话有效值”，不把前者写成统一控制所有现有会话。 |
| 权限选择器 | 当前有效值优先 session；点击会更新 pending、Space runtimeDefaults，并在有会话时调用 session.setPermissionMode。见 [ModeSelector.tsx:110](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ModeSelector.tsx:110)、[ModeSelector.tsx:191](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ModeSelector.tsx:191)。 | 不能在纯导航重组中承诺“会话入口仅改当前会话”。保留原行为就要如实说明；若要拆开，是独立行为决策。 |
| 推理强度选择器 | pickEffort先修改活跃 session，再更新 pending 和 Space reasoning default。见 [ModelEffortSelector.tsx:269](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ModelEffortSelector.tsx:269)。 | 同上；新增全局“默认推理/权限”表单不是简单搬迁旧 section。 |
| 服务商/模型 | 有 session 时模型以 session.model 为准；选服务商的流程还包含 provider.setDefault。见 [ModelEffortSelector.tsx:134](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ModelEffortSelector.tsx:134)、[ModelEffortSelector.tsx:244](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ModelEffortSelector.tsx:244)。 | “默认服务商”和“当前会话模型”不要混在同一保存承诺里。 |
| 上下文压缩 | updateKodaxCompactionConfig读取并写SDK writable config patch；projectRoot仅传给末尾 loadKodaxConfigOverview，不选择写入项目文件。共享config路径由运行目录拼接config.json。见 [user-config.ts:311](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/user-config.ts:311)、[user-config.ts:694](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/user-config.ts:694)、[user-config.ts:710](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/user-config.ts:710)。 | 标为“共享 KodaX 配置”。项目回读上下文不等于项目设置；禁止在此加全局/项目写入切换器。 |
| Workflow 限制 | Space持久化 `workflow-policy.json`，只有 maxAgents/maxConcurrency/tokenBudget；tokenBudget是每次Workflow运行的上限，0为不限。两条启动路径共用buildWorkflowHostPolicy。见 [workflow-policy.ts:11](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/workflow-policy.ts:11)、[workflow-policy.ts:68](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/workflow-policy.ts:68)、[workflow-policy.ts:95](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/workflow-policy.ts:95)。 | “Space Workflow 运行限制”，不能简称全局Token预算、账户用量或所有Agent任务预算。 |
| 保存与生效 | compaction写文件后尝试Runtime reload；失败可返回“文件已保存、运行Runtime未应用”。application协议区分 immediate/next_run/extension_reload/restart。见 [settings.ts:72](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/settings.ts:72)、[settings.ts:152](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/settings.ts:152)、[settings.ts:160](C:/Works/GitProj/KodaX-AI/KodaX-Space/packages/space-ipc-schema/src/channels/settings.ts:160)。 | 不设置一个笼统“所有设置即时生效”说明；在相关字段附近呈现真实生效时机/失败结果。 |

## 事实：能力资源不是同一类“连接”

| 对象及建议名称 | 存储/动作/现有入口事实 | 作用域与入口（设计判断） |
|---|---|---|
| **MCP 配置与服务器** | 当前设置section只有用户/项目配置路径、来源、数量和重载；mcp IPC提供discover/servers/start/stop/tools/logs/reload，无配置写入handler。见 [SettingsModal.tsx:1384](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1384)、[mcp.ts:1](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/mcp.ts:1)、[mcp.ts:91](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/mcp.ts:91)。 | 侧栏直接“MCP”；页面保留“用户配置/项目配置”并列概览+已有重载，可链接已有运行态管理。不凭导航新增连接器CRUD、JSON编辑器或用户/项目写入选择器。项目来源信息保留实际项目名称和路径。 |
| **技能** | install target真实支持user/project：user写运行目录skills；project写项目`.kodax/skills`，缺projectRoot报错。已有四种安装按钮（用户/项目×目录/zip）。见 [install.ts:30](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/skill/install.ts:30)、[skill.ts:81](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/skill.ts:81)、[SettingsModal.tsx:1428](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1428)。 | 侧栏“技能”，安装动作局部选择真实目标。没有项目时项目安装禁用/说明；不把选择目标变成所有设置的全局作用域。 |
| **外部 Agent 注册** | Gateway默认写Space data目录external-agent-plane，注册不含projectRoot；本地Reference注册有owner/revision约束，虽protocol字段为http，源码明确其不做网络I/O。见 [external-agent-gateway.ts:299](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/external-agent-gateway.ts:299)、[external-agent-gateway.ts:361](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/external-agent-gateway.ts:361)、[external-agent-gateway.ts:393](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/external-agent-gateway.ts:393)。UI有编辑/启停/删除、dispatchability、preflight/conformance。见 [SettingsModal.tsx:1770](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1770)、[SettingsModal.tsx:1857](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1857)、[SettingsModal.tsx:1969](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1969)。 | 直接叶子“外部 Agent”，页面区分注册管理与当前项目可调度/预检结果。projectRoot是预检/调度上下文，不意味着项目级注册。不能宣传成已实现任意远程Agent接入或全局Agent模式。 |
| **Space 扩展库** | ExtensionSettingsPanel调用catalog.install/setEnabled/uninstall；第一方文案明确安装不自动连接账号或更改Skill。见 [ExtensionSettingsPanel.tsx:43](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/ExtensionSettingsPanel.tsx:43)、[messages.ts:3590](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/i18n/messages.ts:3590)。 | “扩展与连接组件”页第一section，按钮“安装扩展包/启用/停用/卸载”，状态“已安装/已启用”。这里的包生命周期不能叫账号连接。 |
| **连接组件** | 组件action为install/cancel，list返回安装状态；文案明确“安装不会连接账号，也不会授予会话访问权限”。见 [ConnectorComponentsPanel.tsx:13](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/ConnectorComponentsPanel.tsx:13)、[ConnectorComponentsPanel.tsx:41](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/ConnectorComponentsPanel.tsx:41)、[messages.ts:3298](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/i18n/messages.ts:3298)。 | 同页第二section“连接组件”，按钮“安装/修复/取消”，成功“已安装/可用”。不使用“已连接”。 |
| **账号连接** | 独立的partner.connectors.accounts/onboarding/connect/disconnect IPC；Dialog已连接账号选择与断开独立于tryConnection。见 [partner-connectors.ts:69](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/partner-connectors.ts:69)、[partner-connectors.ts:114](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/partner-connectors.ts:114)、[PartnerConnectorDialog.tsx:175](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/PartnerConnectorDialog.tsx:175)、[PartnerConnectorDialog.tsx:272](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/PartnerConnectorDialog.tsx:272)。 | 保持Partner对应连接器的“连接账号/管理账号/断开账号”入口；设置可给准确跳转，不新建空泛全局“账号”页，不把组件安装成功当账号授权成功。 |
| **当前会话选用的连接器** | Binding明确无账号/网络副作用；有session调用session.partnerConnectors.set，无session调用resolve，按surface/project/session绑定上下文；菜单非Partner返回null，选中与connected分开。见 [partnerConnectorBinding.ts:35](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/partnerConnectorBinding.ts:35)、[partnerConnectorBinding.ts:92](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/partnerConnectorBinding.ts:92)、[PartnerConnectorProvider.tsx:140](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/PartnerConnectorProvider.tsx:140)、[PartnerConnectorChips.tsx:137](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/PartnerConnectorChips.tsx:137)。 | 在Partner会话/待创建会话入口叫“用于此会话/从此会话移除”；资源范围继续归现有资源范围入口。不要叫全局“已授权”，也不要放进通用设置开关。 |

以上四个常被混用的动作必须保持：**安装/启用扩展包 → 安装/修复组件 → 连接账号 → 在会话中选用并选择资源范围**。箭头描述用户理解顺序，不表示全部适配器都需要全部步骤；例如已有Dialog会按adapter/setupKind区分configuration-required等流程。见 [PartnerConnectorDialog.tsx:64](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/PartnerConnectorDialog.tsx:64)。

## 推荐导航与现有 section 迁移（设计判断）

组标题不点击；下面十一项均直接打开内容，不再藏于“工具与集成”二级tabs。

| 分组 | 直接叶子 | 迁移来源与范围 |
|---|---|---|
| 应用 | 常规 | Preferences的语言、默认工作区、终端shell、关窗、输入自动聚焦、通知；来源 [SettingsModal.tsx:533](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:533)、[SettingsModal.tsx:544](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:544)、[SettingsModal.tsx:604](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:604)。 |
| 应用 | 外观 | Preferences的AppearanceSettings，主题/视觉质量；来源 [SettingsModal.tsx:526](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:526)。 |
| AI与任务 | 模型与服务商 | 现ProvidersPanel，保留默认服务商、现有配置/验证能力；来源 [SettingsModal.tsx:2719](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2719)。 |
| AI与任务 | 上下文与限制 | 页头“上下文与运行限制”；Runtime压缩section + Preferences WorkflowPolicySection，两个小节分别标“共享 KodaX 上下文压缩”“Space Workflow 运行限制”；来源 [SettingsModal.tsx:1298](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1298)、[SettingsModal.tsx:615](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:615)。不迁入外部Agent注册。 |
| 能力资源 | MCP | Runtime MCP section；按上表保留现有能力，不承诺配置编辑器。 |
| 能力资源 | 技能 | Runtime技能目录/安装section。 |
| 能力资源 | 外部 Agent | Runtime ExternalAgentsSection；保留真实项目预检上下文，注册列表与预检区分。 |
| 能力资源 | 扩展与连接组件 | 现ExtensionSettingsPanel两section保留，包与组件各自命名；账号管理留Partner入口。 |
| 系统 | 安全与沙箱 | Runtime SandboxReadinessSection，只包括实际readiness、安装/刷新、诊断指引。已有设置调用sandbox.setup且显示后端/平台/版本；来源 [SettingsModal.tsx:1521](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1521)、[SettingsModal.tsx:1597](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1597)。 |
| 系统 | 故障排查 | 原Diagnostics + Runtime Host事实、配置路径/迁移、extension/integration health。字段生效时机留字段旁；此页只保留概览。来源 [SettingsModal.tsx:1090](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1090)、[SettingsModal.tsx:1113](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1113)、[SettingsModal.tsx:1200](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1200)。 |
| 底部 | 关于 | Preferences现有更新块 + LicensePanel。固定页面顺序“应用名/当前版本摘要 → 更新 → 许可证摘要 → 许可证详情/离线操作”；来源 [SettingsModal.tsx:534](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:534)、[SettingsModal.tsx:2458](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2458)。离线导入/请求导出是现有能力，应保留可达性，非新增登录页。 |

### 对十一叶子的反证

1. **“能力页内锚点更省导航”**：八个一级页+工具五子页并非八个内容目的地，而是十二个；十一直接叶子反而少一次猜测上位分类。把所有能力放单一长页会重演Runtime杂糅。外部Agent已有编辑、启停、删除、可调度、预检与一致性操作，值得独立入口；MCP/技能较浅，允许紧凑小页面，不为填充空白新增CRUD。此项是可发现性判断，尚需UI验证。
2. **“安全也是能力，应放能力资源”**：当前SandboxReadiness对象是主机后端准备/安装/诊断，安装动作有独立系统确认；不是每次任务授权。按真实现状归系统更准确；以后若有真正任务权限表单，应依据数据owner重新判断，不先铺全局开关。依据上表Sandbox源码与只读projection约束 [settings.ts:120](C:/Works/GitProj/KodaX-AI/KodaX-Space/packages/space-ipc-schema/src/channels/settings.ts:120)。
3. **“十一项在低高窗口过长”**：接受工程Agent挑战。十一叶子是领域建议，不是沿用旧CSS即可的结论；必须验证侧栏可独立滚动、窄屏单层选择、焦点/深链。若视觉验证失败，优先折叠组标题或页面选择器，不能通过重新混合对象解决。不能做双轴滚动或三级缩进。
4. **“关于被LicensePanel占满”**：接受风险。不得简单把整块许可证搬到关于最上方；用版本/更新优先、许可证摘要及详细操作后置来维护“关于”的语义。需要激活时状态和入口仍可见，不能折叠掉异常或必需行动。

## 不应凭此次重组新增的控件或承诺

- **通用全局/项目切换器**：只有Skill安装真实有目标写入contract；MCP有两来源概览，压缩projectRoot只回读，外部Agent注册本地Space owner。统一切换器会制造不存在的项目写入能力。依据前述配置及资源表。
- **全局权限、SA/AMA、所有任务Token总预算开关**：schema字段或读取时固定值不能自动推导新的设置入口。是否改变默认/当前会话行为，应交给正在推进的工作模式设计；本次只重组已有section。Workflow tokenBudget只承诺每Workflow运行上限。依据默认值/Workflow表。
- **任意SDK sandbox allow-list编辑器**：现有IPC projection有editable防止部分投影覆盖CLI完整数据，不能因为有“安全”页面就加可编辑表单。见 [settings.ts:120](C:/Works/GitProj/KodaX-AI/KodaX-Space/packages/space-ipc-schema/src/channels/settings.ts:120)。
- **嵌入式/共享Host切换器**：读取时IPC明确拒绝非daemon，“Embedded execution is retired”。导航不能从保留enum造出复活入口。见 [settings.ts:101](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/settings.ts:101)。
- **安装即授权、账号连接即所有会话选用、Reference即远程HTTP能力、保存即运行态应用**：这些承诺与上述primary source不符。

## 与其他 Agent 的直接交叉讨论

- 与`settings_deepseek`：对方提出十一叶子且不隐藏MCP/技能。我的初始八页+工具子页方案经反证后放弃；同意直接叶子，同时要求“扩展与连接组件”两section、已安装/已连接分离。对方接受，并以messages.ts:3298补充源码确认。当前坚持：账号连接与会话选用不迁为全局开关。
- 与`settings_engineering`：对方接受“任务与上下文”与外部Agent剥离，挑战十一叶子的44px行高与低高/窄屏导航；提示Runtime.refresh混合migration/compaction草稿同步、旧入口兼容。我的修正：十一叶子只是领域结论，必须通过导航溢出/窄屏验证；保留首访挂载及访问后草稿的工程约束，禁止拆页时复制Runtime请求与副作用。路由/性能细节以工程Agent笔记为证，不在本领域笔记冒充已验证。
- 与主Agent：接受“不能从固定ama推导后续设计约束”的纠正；保留读取快照标签。回应关于页许可证挤占问题，以版本/更新在前、授权摘要与离线操作后置作为推荐，仍待视觉验证。

## 未证实

- 未运行或截图新导航；十一叶子在实际窗口、字体缩放、中文/英文长度下是否舒适尚未证实。
- 没有证明新的全局默认模式/权限/推理设置已获产品授权；本文不新增此类需求，也不覆盖并行工作模式方案。
- 没有证明所有连接器均需要组件安装、支持相同账号管理动作或跨Code/Partner表面；建议文案保留adapter能力区别。

## 未解问题

1. 十一直接叶子的实际侧栏密度与窄屏选择方式需要UI原型/实际窗口验证；若无验证，不能以页数更少视为更好。
2. 并行工作模式改动完成后，当前会话选择与持久默认是否继续联动？需要按最终代码复核此处事实与文案。
3. MCP页是否只迁移现有概览+重载，还是同时放已有服务器运行态入口？两者都可使用现有能力，但运行态与配置来源必须分区；本次不建议新增编辑器。
4. 关于页许可证在required/expired等状态下详情是否自动展开，需结合已有许可证状态产品流程决定；异常状态和激活入口必须可见。
