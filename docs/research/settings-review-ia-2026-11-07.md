# Space 设置应该按什么入口组织，才容易找且不会再次成为杂项页？

结论摘要（设计判断）：推荐按用户查找对象提供 **11 个直接可见的叶子入口，采用非交互分组，不再增加“工具与集成”二级 tab**。外部 Agent 与任务资源策略分开；MCP、技能明确可见；扩展与连接组件同页分节；沙箱保持系统归属；关于放底部，故障排查独立但降低视觉权重。数量来自当前对象边界，不是目标。独立入口可以很短，不能为了填满页面添加功能。依据是 Space 当前实际 section 与操作，以及 ZCode 的对象入口和 DeepSeek 的管理边界，详见下文引用。

调研日期：2026-11-07。仅静态源码分析，未做此方案的原型或窗口实测。Space HEAD `2e8bbd7e28b688a6fd5a9509140b828dce9fff56`；ZCode HEAD `a9fe401eede6e6e5e01be9048679c206fe6f02d9`；DeepSeek Harness HEAD `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。读取了前一轮八页提案及两篇竞品笔记作为线索；下面事实均回引拥有事实的源码。当前工作区另有工作模式改动，本笔记没有修改产品代码。

## 1. 八页提案应接受哪些挑战？

### 导航少与结构少不是一回事

Space 当前是六个固定 tab，并且六个 panel 一次全部挂载，仅通过 `hidden` 切换；当前分类是代码里的 Preferences/Providers/Runtime/Extensions/License/Diagnostics，而不是按一个一致的用户对象规则建立。[导航定义](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:102)、[同时挂载](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:300)

**设计判断**：八个一级入口中，如果“工具与集成”含四个独立二级页，实际已有 `7+4=11` 个内容目的地。交叉讨论中加入外部 Agent 后，则是 `7+5=12` 个目的地。一级按钮变少并没有减少内容目的地；它增加了一次分类猜测与页面切换。推荐方案的十一叶子中，扩展/连接组件同页两个分节，合计仍处理同样的资源对象，没有添加空白总览。

| 用户任务 | 八页及资源二级页 | 推荐的直接叶子 | 判断 |
| --- | --- | --- | --- |
| 找 MCP 配置 | 猜“工具与集成”→MCP | MCP | 已知术语直接出现，不要求先猜上位类目 |
| 安装技能 | 猜“工具与集成”→技能 | 技能 | 同上 |
| 注册外部 Agent | 在“Agent 与上下文”找，或“工具与集成”→外部 Agent | 外部 Agent | 与上下文压缩不再混合 |
| 安装连接组件 | “工具与集成”→连接组件 | 扩展与连接组件→同页组件分节 | 同页定位仍有成本，但无需又一层内容页面 |

该表为预期查找路径分析，**不是用户测试的时间测量**。当前 MCP 的确仅展示路径、来源、数量、建议与重载；技能仅目录与四种安装动作，不应因独立入口就补出不存在的管理器。[MCP](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1384)、[技能](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1428)

### Agent 是执行者资源，上下文是任务策略

Workflow 设置当前包含最大 Agent 数、并发数、token 预算；压缩设置包含触发比例、触发 token 数、上下文窗口。这两块都可用“任务资源边界”解释。[Workflow 字段](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/workflow/WorkflowPolicySection.tsx:37)、[压缩字段](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1303)

外部 Agent 则有注册编辑、启停、移除、预检和只读一致性测试，并非上下文参数或只有 SDK 版本的薄页；它的生命周期以 Agent 注册对象为中心。[保存](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1781)、[预检和测试](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1857)、[编辑器](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1952)、[启停和移除](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2045)

**设计判断**：首轮用“任务与上下文”承接压缩和 Workflow 限制，外部 Agent 单列。最终接受主线的命名收紧：侧栏“上下文与限制”，页头“上下文与运行限制”，直接对应已有字段。也不把未来可能的记忆、人格、系统提示词塞进这个页；当前没有这些设置 section 就不为其预建空壳。

### 工具、技能、扩展不能只按实现依赖归并

Space 扩展库已有真实安装/启停/卸载动作，并直接渲染连接组件 section；连接组件说明明确“安装不会连接账号，也不会授予会话访问权限”。[现有扩展操作与组合](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/ExtensionSettingsPanel.tsx:43)、[组件内容](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/ConnectorComponentsPanel.tsx:124)、[明确的安装边界](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/i18n/messages.ts:3298)

**设计判断**：两类宿主安装物可以保留同页，标题必须并列写“扩展与连接组件”，内部也必须分节。MCP 是协议配置、技能是提示/能力资料的安装对象，不能因为运行时最终消费它们，就全部归进含糊的“工具”页。“安装成功”不能显示为“已连接”，账号连接继续所属业务流程。

## 2. 推荐完整导航

以下均为设计建议。分组标题不可点击；页签名不附加二行解释以控制导航高度，具体说明进入页头。最多十一叶子，外部 Agent 受实际能力门控，不能显示空白目的地；现实现有 `enabled=false` 时不渲染整个 section。[门控](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1910)

| 分组 | 可见叶子 | 页内边界与标题 |
| --- | --- | --- |
| 应用 | 常规 | 语言、默认工作区、终端 Shell、关闭窗口行为、自动聚焦、完成通知 |
| 应用 | 外观 | 主题、视觉品质；保留现有视觉选项，不混入更新 |
| 任务 | 模型与服务商 | Provider 列表、凭据、默认项、模型选择、连接测试与凭据存储说明 |
| 任务 | 上下文与限制 | 页头“上下文与运行限制”；上下文压缩、Workflow 规模/并发/token 上限；两个独立 section，各说明保存及生效语义 |
| 能力资源 | 外部 Agent | 注册、启停、移除、可调度性/预检/测试；宿主与适配器事实放折叠详情 |
| 能力资源 | MCP | 页头“MCP 配置”；描述“查看配置来源、服务器数量并重新加载”，不称服务器管理器 |
| 能力资源 | 技能 | 用户/当前项目目录与安装；项目不可用时明确原因，继续保留用户级安装 |
| 能力资源 | 扩展与连接组件 | “Space 扩展库”安装/启停/卸载；“连接组件”安装/校验等现有动作，两者不合并状态 |
| 系统 | 安全与沙箱 | 当前沙箱可用性、后端与版本、刷新、安装设置、诊断和引导；不冒充全局权限控制台 |
| 系统 | 故障排查 | 导出诊断置顶；Host 事实、扩展健康、集成健康、配置路径/来源、迁移、生效规则按诊断任务排序，技术详情折叠 |
| 固定底部 | 关于 | 当前版本、检查/下载/安装更新、授权状态/导入/请求导出 |

**安全放系统的取舍**：当前 SandboxReadinessSection 的核心是宿主 ASRT/backend/platform、安装设置与诊断；它没有在该 section 提供 MCP/技能授权编辑。放“能力资源”旁边容易令用户误以为它直接控制每个资源的访问权限。保持独立系统页更准确；若未来实际出现权限策略编辑，再据事实重审分组。[版本和后端](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1595)、[设置安装](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1624)、[诊断与引导](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1658)

**关于与故障排查的权重**：授权和更新属于产品身份/生命周期，与“当前为什么不可用”不同。关于固定底部以便找到，故障排查仍在系统组直接可见；错误提示可直达对应故障 section。不能把导出诊断藏进关于的某个折叠层，也不要把“高级”当新 Runtime 兜底页。[当前授权操作](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2535)、[当前更新操作](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/updater/UpdateSettings.tsx:46)、[当前诊断导出](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:367)

## 3. 现有全部内容去向

下表以当前真实 render 树为清单。每一行的“去向”为设计判断，现状由引用支持；不新建尚不存在的账号、快捷键、记忆或代理权限设置。

| 当前 panel / section | 推荐去向 | 当前源码 |
| --- | --- | --- |
| Preferences / AppearanceSettings（主题、视觉品质） | 外观 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:526)、[真实字段](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/AppearanceSettings.tsx:14) |
| Preferences / LanguageSection | 常规 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2402) |
| Preferences / UpdateSettings | 关于 / 软件更新 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:534) |
| Preferences / TerminalShellSection | 常规 / 终端 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:690) |
| Preferences / WindowCloseBehaviorSection（Windows 条件） | 常规 / 窗口 | [条件](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:542)、[内容](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:788) |
| Preferences / Workspace | 常规 / 默认工作区 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:544) |
| Preferences / Interface（SmartPopoutToggle、NativeCompletionNotificationSettings） | 常规 / 注意力与通知 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:604) |
| Preferences / WorkflowPolicySection | 上下文与限制 / Workflow 运行上限 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:615) |
| Providers / 全部（统计、搜索、添加/编辑、自定义和内置分组） | 模型与服务商，保留原编辑工作流 | [状态及动作](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2719)、[内容起点](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2785) |
| Runtime / ConfigApplication | 故障排查 / 配置生效规则（折叠）；具体页保留其所需提示 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1090) |
| Runtime / RuntimeHostSection | 故障排查 / Host 环境（折叠） | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:823) |
| Runtime / ExtensionHealth | 故障排查 / 扩展健康；资源页只保留已有对象状态 | [真实挂载](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1114) |
| Runtime / SandboxReadinessSection | 安全与沙箱 | [真实挂载](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1116) |
| Runtime / IntegrationHealth | 故障排查 / 集成健康 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1118) |
| Runtime / ExternalAgentsSection | 外部 Agent | [真实挂载](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1198) |
| Runtime / KodaxConfig（路径、来源、迁移） | 故障排查 / 配置与迁移 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1200) |
| Runtime / Compaction | 上下文与限制 / 上下文压缩 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1298) |
| Runtime / MCP | MCP | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1384) |
| Runtime / Skills | 技能 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1428) |
| Runtime / 顶部刷新、loading、error 等共享壳 | 随所属请求拆分为当前页反馈，不复制整个 Runtime 的副作用 | [刷新读取与表单同步](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:861) |
| Extensions / ExtensionSettingsContent | 扩展与连接组件 / Space 扩展库 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/ExtensionSettingsPanel.tsx:57) |
| Extensions / ConnectorComponentsPanel | 扩展与连接组件 / 连接组件 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/ExtensionSettingsPanel.tsx:67) |
| License / 全部 | 关于 / 授权 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2535) |
| Diagnostics / 导出、包含内容、隐私说明 | 故障排查 / 导出诊断，隐私说明保留在操作旁 | [引用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:388) |
| 导航底部固定 KeySafety 提示 | 模型与服务商的凭据/存储说明旁，不占每页固定导航空间 | [当前固定提示](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:269) |

### 作用域与保存必须逐项标明

- Compaction 收到 projectRoot，但实际写共享 writable KodaX 配置，再用 projectRoot 读取 overview；不能因为在项目里打开页面就标“仅当前项目”。[写入事实](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/user-config.ts:311)
- MCP 当前同时显示全局/项目路径和数量，技能有明确用户/项目安装动作。作用域是对象内容维度，不再做一个对所有页面都生效的假“全局/项目”选择器。[MCP 字段](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1389)、[安装动作](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1441)
- 默认工作区显式保存；Workflow 数字框在 blur/Enter 提交；压缩有独立保存。导航重排不能将它们视觉上统一包装成“全部自动保存”。[工作区](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:491)、[Workflow](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/workflow/WorkflowPolicySection.tsx:84)、[压缩保存](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1365)
- 会话权限入口当前同时更新 pending、现有 session、下次默认；effort 同样写 session 并调用 Space 默认保存。因此不能复制竞品措辞并声称“现有会话入口只改当前”。本轮建议只重排设置，不修改这些写入语义。[权限](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ModeSelector.tsx:191)、[effort](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ModelEffortSelector.tsx:269)

## 4. 两个替代方案

| 方案 | 可见入口 / 内容目的地 | 好处（判断） | 代价（判断） | 结论 |
| --- | --- | --- | --- | --- |
| A：原八页，把资源收进“工具与集成”四二级页 | 8 / 11；外部 Agent 另挪为第五子页时 8 / 12 | 左栏短，资源子页共同壳容易实现 | 已知术语不可见；需要先猜分类；仍有十一/十二目的地；Agent 与上下文原版混对象 | 不推荐作为当前默认 |
| B：六页最小重命名，常规/模型/任务与集成/扩展/授权/支持 | 6 / 6，长页面用锚点 | 改动小，入口少 | 当前 Runtime 仍是多对象长页，只换名字；MCP、技能、外部 Agent 仍需滚动找；授权仍占同级高权重 | 可作极小改动过渡，不能解决核心问题 |
| 推荐：对象直达、非交互分组 | 最多11 / 最多11，外部 Agent 能力门控 | 用户术语可见；无额外 landing/tab；所有现有 section 有确定去向 | 矮窗口需要导航滚动；小页留白必须克制；需要更细的请求/副作用归属 | 在下面验证条件满足时优先 |

**为什么不直接复制竞品**：ZCode 的当前配置确实把 MCP、技能、插件和子 Agent 分别注册，并在真实 route 中复用 PluginsSection 的不同 mode；这是对象可见性而非要求复制其功能数。[配置](C:/Works/PubProj/ZCode/packages/ui/src/settings/settingsPageConfig.ts:95)、[MCP/技能](C:/Works/PubProj/ZCode/packages/ui/src/settings/settingsPageConfig.ts:108)、[复用路由](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2137)。DeepSeek 的设置“内置插件”是只读清单，真正插件管理在主侧栏工作面；Space 此处是实际安装管理，所以不能仅按同名标签复制归属。[内置清单](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-plugin-inventory/src/client/index.ts:33)、[独立管理边界](C:/Works/PubProj/deepseek-harness/packages/client/ui-plugin-manager/src/client/index.ts:82)、[独立入口](C:/Works/PubProj/deepseek-harness/packages/client/ui-plugin-manager/src/client/index.ts:167)。

## 5. 交叉讨论：反驳、修正和保留

这里记录其他 Agent 对方案的挑战及本 Agent 的判断，属于设计讨论，不作为独立事实来源。

| Peer 挑战 | 修正或坚持 | 源码约束/验证方式 |
| --- | --- | --- |
| 领域 Agent：八一级+五子页实际十二内容目的地，不能只比较一级数 | 接受，比较三个维度：可见叶子、内容目的地、查找层级 | 本文第1/4节用明示算式，不把它写成用户实测 |
| 领域 Agent：合并插件库和组件会混淆安装/账号连接 | 接受；叶名并列，两分节，安装状态不等于已连接 | [现文案](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/i18n/messages.ts:3298) |
| 工程 Agent：十一行与组标题在矮窗口可能挤压；窄窗口现横排需要适配 | 接受；导航独立滚动，关于固定可达，键盘选中项滚入视口；待原型验证，十一项不能视为已获视觉验证 | [现有滚动 nav](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:250) |
| 工程 Agent：共享原 Runtime hook 会在读 MCP 时读迁移计划，并覆盖压缩草稿 | 接受；只考虑共享必要只读 overview，迁移计划由故障排查懒读，表单初始化不得随别页刷新重置 | [原刷新同时读迁移并同步表单](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:861) |
| 主线：外部 Agent 低频是否值得独页？ | 保留独页，但能力关闭不显示；频率未测不能冒称高频；完整注册生命周期支持对象独立 | [编辑/启停/移除](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2045)、[门控](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1910) |
| 主线/工程：MCP 是浅只读页，标题是否暗示完整管理？ | 修正首轮“MCP服务器”为叶名“MCP”、标题“MCP配置”；明确仅来源/计数/重载；保留直接可见 | [真实能力](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1384) |
| 主线：沙箱移能力组是否更自然？ | 保持系统组；当前是宿主安装/后端环境，无每资源权限编辑 | [现有内容](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1595) |
| 主线最终收紧：“任务与上下文”仍太宽泛 | 接受侧栏“上下文与限制”、页头“上下文与运行限制”；旧 runtime 稳定映射可作兼容 fallback，诊断意图仍应有显式目标 | [当前两组真实字段](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/workflow/WorkflowPolicySection.tsx:37)、[压缩字段](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1303) |

**最小实现约束（建议）**：首访挂载、访问后隐藏保留本次设置打开期间的草稿；不增加跨关闭草稿存储。不要把十一页做成十一份 overview/迁移轮询。浅页使用紧凑内容宽度，不堆装饰卡、无用总览或空态来撑高度；不新增搜索索引、模型调用、协议字段或 prompt 文本。导航重组本身不应增加模型 token；这里只是约束，尚未审计实现的数据通路或性能。

DeepSeek 的 plugin settings 对一个 tab 直接展示、多个才加 tab，首次访问后保留内容；可借鉴“只有真实层级才加导航”，无须复制其插件系统。[实现](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-plugins/src/client/PluginsSettingsSection.tsx:32)

## 6. 可反驳问题与验收方向

1. **已知术语是否足够普遍？** 给熟悉 coding agent 与新用户分别执行“安装技能、查看 MCP 来源、添加外部 Agent”，若直接叶子未减少错误首选或查找路径，十一叶子优势应重审，不能用研究者直觉代替结果。
2. **资源四叶子是否使常规任务更难找？** 在实际最小窗口高度与中文长度下，观察语言/模型/更新/诊断四任务是否需要反复导航滚动。若高频入口频繁移出视口，应先缩导航行高/描述与调整顺序，再评估合并；不能预设数量正确。
3. **“上下文与限制”是否仍过抽象？** 最终名称已比首轮“任务与上下文”收紧，但若用户找 token 预算只会选模型页、找 Workflow 限制只会选外部 Agent，仍需用真实选择检验，而不能视命名调整即解决发现性。
4. **扩展/连接组件是否应拆？** 若用户把扩展安装与账号连接混淆，即使两分节也没改善，考虑独立“连接组件”叶子；不能靠更泛的“集成”名称掩盖差异。
5. **“故障排查”会不会隐藏正常配置维护？** 配置迁移/查看路径可能是正常维护而非故障。若用户因此找不到，可用“配置与诊断”替代，但仍应禁止成为无归属设置兜底；需比较两标签的任务首选。
6. **关于是否压低授权可发现性？** 若授权导入是高频部署流程，需要保留原 onboarding/到期提示直达关于授权，而不是仅依赖用户探索左栏。

## 未证实

- 十一叶子的实际视觉密度、窄屏/矮窗口/中文/读屏体验未做原型实测；不能称其已优于八页的用户体验。
- 各设置的使用频次和用户首选分类没有遥测或访谈证据。
- “无额外 token”在本轮是设计约束，不是对未来实现的已验证结论。
- 外部 Agent 的生产发布能力门控、不同 edition 的可见性需要实现阶段核对，本文只确认当前 renderer 的 enabled 门控。
- 本轮未重新遍历每个错误入口/深链接调用者；兼容迁移不可只按旧 tab 名猜默认子页。

## 未解问题

- 当前最小支持窗口高度下，十一叶子如何同时保证常规/模型/故障排查与底部关于可达？需做实际交互原型。
- 用户对“上下文与限制”“故障排查”“扩展与连接组件”的真实首选是否符合此分类？需任务测试或用户确认。
- 旧 runtime 入口应按每个调用者的意图直达哪个 section？必须逐个追入口，再决定 alias，而非统一重定向任务页。
- 本次是否仅重排，还是同时修复 Workflow 保存失败缺少反馈等既存行为？该现状可由 patch 的 catch 返回 null 看到，但不应偷偷扩大重排范围。[当前错误处理](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/workflow/WorkflowPolicySection.tsx:17)
