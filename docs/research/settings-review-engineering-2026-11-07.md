# Space 设置重组怎样保持最小改动、性能与旧入口兼容？

结论摘要：推荐 11 个直接可见目的地（主区 10 项，底部“关于”1 项），上下文策略页侧栏名为“上下文与限制”、页头为“上下文与运行限制”，不为保留“八页”而把 MCP、技能藏进第二级。实现应限于 renderer 信息架构、布局与加载时机；配置写入、权限与会话语义不动。最大工程风险不是页数，而是旧导航回写造成反跳、拆 Runtime 后重复读取/重置压缩草稿，以及把 `hidden` 改成卸载而丢失编辑。以下事实均引用本地第一方源码，建议明确标为设计判断。

日期：2026-11-07。独立工程审查，交叉讨论对象为 settings_deepseek、settings_zcode；仅阅读源码并新增此笔记，没有修改产品代码、运行测试或写入实际配置。审查对象为 [上一轮八页建议](C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/settings-information-architecture-comparison-2026-11-06.md)。工作区同时存在其他开发，本文行号对应本次读到的工作区内容。

## 1. 推荐导航与反对的方案

以下是设计判断，并非已经完成的视觉或可用性验收。内容归属的依据为当前 [Preferences](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:461)、[Runtime](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:838)、[Providers](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2719)、[扩展与组件](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/ExtensionSettingsPanel.tsx:20)。

| 非点击分组 | 可见目的地 | 内容边界 |
| --- | --- | --- |
| 应用 | 常规 | 语言、工作区默认值、终端、窗口关闭、通知与聚焦 |
| 应用 | 外观 | 主题、视觉质量，保留现有预览 |
| 任务 | 模型与服务商 | 原 Providers，凭据、模型、默认项和连接测试 |
| 任务 | 上下文与限制 | 页头“上下文与运行限制”；压缩策略、Workflow 运行限制；不混入外部 Agent 注册 |
| 能力 | 外部 Agent | 注册、启停、移除、预检、一致性测试；遵守原能力门控 |
| 能力 | MCP | 页面标题“MCP 配置”；来源、路径、服务器数、重载 |
| 能力 | 技能 | 用户/项目目录、现有目录或 ZIP 安装 |
| 能力 | 扩展与连接组件 | 保留两种安装物各自的管理分节，组件安装不冒充账号连接 |
| 系统 | 安全与沙箱 | 宿主沙箱状态、显式 setup、说明；不新增会话权限表单 |
| 系统 | 故障排查 | Host、配置路径、迁移、集成/扩展健康、生效规则、诊断导出 |
| 底部 | 关于 | 版本摘要、更新，再到授权/离线激活 |

MCP 当前是配置概览与重载，不是服务器 CRUD 管理器；技能当前是目录与安装入口。独立入口的理由是术语可发现性，不是内容长度，因此应做紧凑浅页，不为填充留白而增加新功能。[MCP 实际控件](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1384)、[技能实际控件](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1428)。外部 Agent 有真实编辑、预检和测试生命周期，且 `enabled=false` 会隐藏整节；拆成独立页时不能显示一个全空页面。[注册加载](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1745)、[功能门控](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1910)。

我反对另外两种导航：

1. **六页只改名/加锚点**：改动最少，但 MCP、技能依然需要猜“运行时”，健康与诊断仍分裂，未解决用户指出的标签归属问题。原 Runtime 同时呈现 Host、沙箱、健康、压缩、MCP、技能，内容分布足以支持这个判断。[Runtime 首段](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1090)、[后段](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1298)。
2. **八页 + 工具五子页**：起初可接受，交叉讨论后撤回。它并未真正减少内容目的地，只把明确的 MCP/技能术语藏进“工具与集成”；同时引入第二套选中态、键盘导航与返回路径。ZCode 的不同资源可以独立入口而共用实现；DeepSeek 的插件设置只有一个 tab 时不再画重复导航，均支持“复用实现不等于合并产品入口”的判断。[ZCode 资源路由](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2118)、[DeepSeek 按需 tab](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-plugins/src/client/PluginsSettingsSection.tsx:32)。

## 2. 旧入口清点与兼容表

### 实际入口

| 入口 | 当前行为与源码 | 重组约束 |
| --- | --- | --- |
| Shell 设置按钮、Project/Files 导航入口、顶部菜单 | 统一打开 `preferences`；菜单还有 Mod+, 快捷键 | 保持单一设置工作面，默认落常规 |
| Provider 错误操作按钮 | system notice 派发 `kodax-space.open-provider-settings`；Shell 转 `providers` | 继续直达模型与服务商，不能回到常规 |
| 主扩展工作面的 Manage | `openSettingsAt('extensions')` | 直达扩展与连接组件 |
| ChipBar 工作区按钮 | 独立 `SettingsModal initialTab="preferences"` | standalone 旧 props 仍可解析 |
| ChipBar 授权激活按钮 | 独立 `initialTab="license"` | 关于页应定位授权，避免用户再次寻找 |
| Space Control | renderer 允许六个 SettingsTab，Electron catalog/classification 目前只列五个，漏 extensions | 兼容既有接受值，不借 UI 重组扩大自动化协议能力 |

来源：[Shell 统一打开和 Provider 事件](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/Shell.tsx:946)、[两个导航入口](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/Shell.tsx:1521)、[扩展 Manage](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/Shell.tsx:1583)、[Mod+,](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/Shell.tsx:1919)、[菜单项](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/Shell.tsx:1967)、[错误按钮](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/session/messages/bubbles.tsx:897)、[ChipBar 常规](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ChipBar.tsx:111)、[ChipBar 激活](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ChipBar.tsx:513)、[Broker 六值](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/space-control/SpaceControlBroker.tsx:43)、[catalog 五值](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/space-control/catalog.ts:57)、[classification 五值](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/space-control/classification.ts:29)。

### 固定旧 key 的默认含义

以下是建议的兼容映射，不是现有行为。`runtime` 原来覆盖多个领域，无法无损映射到一个新叶子，故必须固定稳定默认值，而不是由最近访问位置决定。

| 旧 key | 新目标 | 特定入口 |
| --- | --- | --- |
| `preferences` | 常规 | 外观使用新内部入口直达 |
| `providers` | 模型与服务商 | 原 Provider 错误跳转沿用 |
| `runtime` | 上下文与限制 | 页头“上下文与运行限制”；旧自动化仍打开实际压缩编辑页；新内部 MCP/沙箱/外部 Agent 入口各有明确目标 |
| `extensions` | 扩展与连接组件 | 原 Manage 沿用；不把它改为 MCP |
| `diagnostics` | 故障排查 + 诊断导出 section | 原单任务一跳可达 |
| `license` | 关于 + 授权 section | 原激活按钮一跳可达 |

最小策略（设计判断）：保留六个旧 `SettingsTab` 作为兼容输入；另有 renderer 内部 `SettingsPageId` 与少量必要 section 目标。只在入口边界把旧 key 解析成 canonical 目标，Shell 和 Settings 内容内部始终同步 canonical 页。Broker 的旧输入枚举不扩展，观察结果按原类别投影（例如 MCP/技能/沙箱/外部 Agent 都可报告 `runtime`），并明确这种观察粒度仍是旧类别；如以后需要自动化定位新叶子，再单独演进协议和合同测试。

不能简单让 MCP 页面选择时调用 `onTabChange('runtime')` 后由 Shell 回写旧 `initialTab`：当前 effect 收到 `initialTab` 变化会 `setTab(initialTab)`，新映射将使 MCP 反跳“上下文与限制”。canonical 状态和兼容输入需要在边界分开；standalone ChipBar 则继续适配 `initialTab`。已有状态同步事实见 [initialTab effect](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:168)、[onTabChange](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:159)、[Shell 受控回调](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/Shell.tsx:1719)。

`semanticActions.ts` 不包含设置导航；它提供主题、语言、推理默认等实际变更函数，因此不用为了导航重组改动这些持久化操作。[semanticActions](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/space-control/semanticActions.ts:7)。

## 3. 配置边界必须保持

以下是源码事实：

- 压缩 IPC 校验 `projectRoot` 后更新配置并显式 reload；真正写入调用 `loadWritableKodaxConfig` 和 `saveWritableKodaxConfigPatch`，项目参数用于重新生成 overview，不能由参数名推断项目级保存。[IPC](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/settings.ts:152)、[写入](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/user-config.ts:311)。
- 当前权限选择同时更新 next-session preference、持久化 runtime defaults，并可修改当前 session；effort 同时设当前 session、pending 和默认值。因此不能把它描述成“当前会话与默认完全隔离”，也不应在设置重组时偷偷拆分这种行为。[ModeSelector](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ModeSelector.tsx:191)、[effort](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ModelEffortSelector.tsx:269)、[默认值写入](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/space-control/semanticActions.ts:30)。
- 默认工作区保存有独立确认动作，且当前项目等于旧默认时还会更新当前项目与项目列表；不是普通字符串开关。[保存副作用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:491)。
- 沙箱 setup 与刷新分别是显式动作；仅访问设置页只读状态，不能改成自动安装。[状态读取](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1498)、[刷新和 setup](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1502)。

设计判断：本轮只调整显示位置、标签、真实作用域/生效提示与加载时机，不更改 IPC schema、SDK 配置模型、admission、license 或凭据存储。特别是不新建统一“用户/项目”切换器覆盖所有页面，不新增全局权限默认表单，也不新增模型生成的设置摘要或搜索。

## 4. 性能和状态保持的具体风险

### 现状

六个 panel 在首次打开时同时挂载，仅用 `hidden` 隐藏，所以切页保留编辑，但也会启动隐藏页的副作用。[六页挂载](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:300)。例如 Preferences 读 settings，Providers 读 provider.list，License 读状态，Runtime 读 overview 和迁移计划，ExtensionHealth 读扩展健康。[Preferences effect](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:472)、[Providers effect](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2780)、[License effect](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:2466)、[Runtime refresh](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:861)、[ExtensionHealth](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/ExtensionHealth.tsx:22)。

`SpaceExtensionsProvider` 已复用外层 live catalog，不要为了“延迟加载”又建一套；组件列表已有 `active` 门控与安装中 750ms 轮询，隐藏页不应持续轮询。[catalog 复用](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/SpaceExtensionsProvider.tsx:60)、[组件 active/poll](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/ConnectorComponentsPanel.tsx:55)。

Shell 关闭设置会卸载整个 SettingsModal，切 session/surface 也会关闭；因此“访问后保留”只保证本次打开期间切页，不宣称跨关闭、跨项目或重启保留草稿。[关闭与切换](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/Shell.tsx:957)、[条件挂载](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/Shell.tsx:1719)。

### 关键风险：Runtime 的 refresh 同时重置编辑器

`refresh()` 并行读取 overview 和迁移计划，随后 `syncCompactionForm` 把三个文本输入重新赋值。MCP reload、迁移完成和技能安装都会再调用 refresh。拆页后若将这个函数复制到 MCP/技能/故障排查各页，可能引入重复 IPC；若改成共享 overview 并对每次变化同步表单，又会在其他资源刷新时冲掉未保存压缩草稿。[读取并同步](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:865)、[三个输入](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:849)、[MCP 后 refresh](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:978)、[迁移后 refresh](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1024)、[技能安装后 refresh](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1066)。

最小修正建议：首次访问挂载，访问后 `hidden` 保持；只共享多个真实消费者所需的只读 overview 与显式 refresh，迁移计划到故障排查首次进入才读取。压缩草稿仅在首次成功读入、用户明确重载或本表单保存成功后同步；刷新 MCP/技能不能同步它。无需通用数据框架、全局永久缓存或新增持久化 draft。

这个模式已有直接参考：DeepSeek 插件设置维护已访问集合并隐藏已挂载内容。建议借鉴其状态保持规则，不复制其 slot/plugin 架构。[参考实现](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-plugins/src/client/PluginsSettingsSection.tsx:32)。

Token 约束（验收目标）：普通打开、切页、搜索、显示状态只走本地 renderer/store/只读 IPC，不触发 session send、模型请求或运行一致性测试；预检、连接测试、外部 Agent 一致性测试、安装和 reload 仍保留显式动作。不能把“本地 IPC 读”混称额外 token 消耗，也不能对尚未实测的全部调用链作零成本保证。

## 5. 布局代价必须显式处理

现有按钮最小高度为 44px。11 叶子中主区 10 项至少 440px，另有组名、页顶、footer 关于；当前 nav 仅 padding，窄于 650px 时还转成单行横滑，且存在 `.settings-nav-list > button` 直接子元素规则。加 group wrapper 后不能假定旧 CSS 自动正确。[44px](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/workspace.css:326)、[nav 样式](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/workspace.css:266)、[650px 布局](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/workspace.css:518)、[直接子按钮规则](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/workspace.css:558)。

设计约束：保留 44px 点击目标，主区导航独立纵向滚动，关于在底部仍可达；组名不进入 tab roving 序列；键盘选中后滚入可视区域。窄屏采用单层叶子序列或单页选择器，按实际窗口验证后选择，不引入两层 tab 或双轴滚动。页面有多少内容就显示多少，不将 MCP/技能拉成全高巨卡。移除全页常驻的 Key safety，把安全说明放到凭据旁；当前它占据任何页相同位置。[常驻说明](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:269)。

## 6. 最小实施顺序与定向验收

实施建议按纵向可回归的步骤推进：先建立 canonical renderer 目标与旧 key 解析并验证入口；再按上述明确领域提取现有内容、保留处理函数和写入；随后首访挂载/visited 隐藏与只读 overview 去重；最后统一紧凑设置行、分组侧栏、窄窗与视觉。不要在导航重组同一补丁里额外重写 Provider 生命周期、SDK 配置或外部 Agent 协议。

| 验收场景 | 通过标准 | 现有回归依据 |
| --- | --- | --- |
| 旧六 key、Provider 错误、Manage、ChipBar 激活 | 每个落到上表目标与必要 section；重复打开旧 key 不反跳/失效 | Shell/ChipBar/Broker 引用见第 2 节 |
| 外观/常规/资源跨页 | theme、语言、通知等原保存语义一致；工作区字段切页不丢未保存值 | [交互回归](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/settings-modal-interactions.spec.ts:171) |
| 压缩草稿 → MCP reload → 返回 | 输入逐字保留；保存仍有原范围与 reload 提示；后台 overview 更新不强制回填 | [refresh 风险](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:865) |
| 首开常规/首访资源/再次访问 | 未访问 Providers、沙箱、许可、迁移不因隐藏挂载而额外读取；重复访问不重建表单；安装轮询只在 active 时执行 | [当前挂载测试](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/settings-modal.spec.ts:108) 需改成行为保持，删除“所有未访问页已挂载”的旧假设 |
| 外部 Agent 不支持 | 能力门控后不出现空白正文，当前可见页失效有稳定回退；打开不自动启动 conformance | [门控](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:1910)、[已有外部 Agent E2E](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/external-agent-reference.spec.ts:106) |
| 导航键盘/读屏 | Arrow/Home/End 只遍历可见页、焦点入视；tab-panel 标记和名称正确；嵌套编辑器 Escape 不关闭整个设置 | [现键盘逻辑](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:172)、[嵌套 Escape](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/SettingsModal.tsx:192)、[命名审查](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/settings-modal-interactions.spec.ts:237) |
| 低高窗口与 650px 两侧、深浅/三质量/中英 | 10 主区项与关于均可达，窄屏不挤压内容，不出现双轴导航；MCP浅页不人为留白 | [集成工作面回归](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/integrated-workspace.spec.ts:13) |
| 关闭设置回工作面 | composer 草稿、Files 搜索/滚动/宽度、Partner 工作面保持；设置草稿跨关闭仍按原行为处理 | [Files 恢复](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/integrated-workspace.spec.ts:187)、[Partner 恢复](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/integrated-workspace.spec.ts:216) |
| 各资源保存/失败/迁移/导出 | 保留旧动作和失败草稿，不自动执行写入；只更新目标定位，不削减覆盖 | [Provider 文件凭据](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/provider-file-credentials.spec.ts:52)、[迁移](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/integration-migration.spec.ts:35)、[恢复面板](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/beta1-recovery-panels.spec.ts:35)、[SDK UI 合同](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/sdk-ui-contract-acceptance.spec.ts:328) |
| 产品描述和自动化合同 | 去掉旧六页数量假设、更新实际范围文案；协议旧 key 仍有效，未借重排放宽写入或增加模型请求 | [产品信息](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/product-information.spec.ts:39)、[控制目录测试](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/test/space-control-tools.test.ts:245) |

## 7. 交叉讨论记录、未证实与未解问题

- **修正**：我最初接受八页+工具子页。DeepSeek 方向指出此结构隐藏用户明确寻找的 MCP/技能；ZCode 方向指出这实际并未减少目的地。我接受该反驳，改为 11 直达；同时明确 10 主区项的高度预算和窄屏适配是实施成本，不能当作现 CSS 可直接承载。
- **坚持**：首次访问延迟挂载、访问后保持；但反对为此建立全局永久 draft、重复 Extension catalog 或逐页复制 Runtime.refresh。两位领域 Agent 均接受共享读取与压缩草稿副作用的约束。
- **修正**：“Agent 与上下文”混合了策略和资源生命周期，改“任务与上下文”；外部 Agent 独立进入能力组。故障排查按实际诊断/迁移任务命名，避免“高级”重新变成杂项兜底。
- **保持边界**：MCP 独立入口不增加 CRUD；关于先版本和更新，许可仍有明确摘要/离线操作；沙箱归系统而非工具权限管理。以上是基于引用源码后的共同设计取舍，不是竞品实测结论。

未证实：本轮没有运行设置视觉或保存 E2E，也未证明 11 项在所有高度上优于八页。只读 IPC 的实际次数、启动耗时与 token 请求应通过实施时的调用记录/测试验证，不能仅凭结构推断已达成性能目标。

未解问题：窄于 650px 时采用单层横滑叶子还是单页选择器，需在真实窗口中比较后决定；外部 Agent 可用性首次读取前的导航占位与失效回退需在实施中明确。两项都不要求扩大后端配置语义。
