# Space 的设置标签为什么难以对应内容，应如何重新分配？

结论摘要：Space 当前分类混用了“用户偏好、实现模块、资源管理、运行健康、支持工具”几种标准，导致 Runtime 成为兜底大页，Preferences 承担大量互不相邻的任务。建议按用户要配置的对象重组，并独立说明全局/项目/会话作用域与生效时间。此为基于实际 Space 截图及三份源码的设计判断，不是用户可用性实验结果。

2026-11-07 更新：本页八页方案保留为首轮建议。经三位子 Agent 独立研究与交叉讨论，推荐已调整为分组直接入口，并纠正会话控件默认值持久化的表述。最终建议及取舍见 [交叉讨论综合方案](settings-design-consensus-2026-11-07.md)。

日期：2026-11-06。Space 基线 HEAD `2e8bbd7e28b688a6fd5a9509140b828dce9fff56`；研究时工作区另有工作模式相关开发，本轮未修改产品代码。参考项目基线与具体证据见 [DeepSeek 笔记](settings-information-architecture-deepseek.md)、[ZCode 笔记](settings-information-architecture-zcode.md)。本轮启动隔离的 Space Electron 实际打开六个设置页，读取标题、内容与截图，没有修改设置或执行沙箱安装、连接测试、模型请求。

## 1. Space 当前实际分配

当前一级标签是 Preferences、Providers、Runtime、Extensions、License、Diagnostics；页面标题直接复用标签和简介。每个面板都在首次打开设置时挂载，只通过 hidden 隐藏非当前页。[导航定义](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L102)、[页头](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L280)、[面板挂载](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L300)。

| 当前页 | 实际内容 | 对用户定位的影响（设计判断） |
| --- | --- | --- |
| 偏好 | 外观、语言、软件更新、终端 shell、关闭窗口行为、默认工作区、自动聚焦与系统通知、Workflow 运行限制 | 名称太宽；打开后主要看到外观，简介却强调工作区、自动化和工作流；高频界面偏好与低频 Agent 运行预算混合 |
| 服务商 | 内置/自定义 provider、API 凭据、默认模型、连接测试、存储说明 | 领域相对一致，但“模型”在标题中不可见；统计摘要与大量 Provider 卡片放在长页，真实配置任务不够突出 |
| 运行时 | 生效规则、Host 说明、扩展能力健康、命令沙箱、集成健康、外部 Agent 注册、配置路径与迁移、上下文压缩、MCP、技能安装 | 技能/MCP/压缩的入口无法从 Runtime 标签自然推知；用户先遇到技术说明和排障状态，编辑任务在较后位置 |
| 扩展 | Space Extension 插件库包管理、连接组件安装 | 与 Runtime 中的扩展健康、MCP、技能拆散；“连接组件已安装”也不等同于“账号已连接” |
| 许可证 | 社区/商业授权状态、导入许可证、导出申请 | 内容本身清楚，但作为与巨大 Runtime 同级的大页，导航权重失衡 |
| 诊断 | 一个导出诊断包任务及说明 | 主要健康状态却留在 Runtime，排障需要在两个类别之间寻找 |

内容来源：[Preferences](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L524)、[Providers](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L2719)、[Runtime 开头](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L1090)、[外部 Agent](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L1198)、[压缩/MCP/技能](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L1298)、[ExtensionSettingsPanel](../../apps/desktop/renderer/src/features/extensions/ExtensionSettingsPanel.tsx#L27)、[License](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L2458)、[Diagnostics](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L362)。实际页面标题清单另存于 [inventory.json](../../artifacts/settings-review/inventory.json)。表中影响属于从内容归属推导的设计判断。

### 实际截图证据

1. **打开设置 → 偏好**：页面能正常呈现，外观占据首屏主要面积；页头简介与首屏主任务不一致。已查看本轮保存截图。[偏好截图](../../artifacts/settings-review/1-preferences.png)。
2. **进入运行时**：首屏依次是生效规则、Host 描述、扩展能力状态和命令沙箱；技能与 MCP 不在首屏。已查看截图并对照完整标题清单。[运行时截图](../../artifacts/settings-review/3-runtime.png)、[标题清单](../../artifacts/settings-review/inventory.json)。
3. **服务商、扩展、许可证、诊断**：完成导航与内容清点；扩展截图仍含连接组件 Loading，故不作为稳定视觉证据。其他页的内容分类结论以源码和实际读取的标题为依据，没有将未逐张验收的截图当作视觉结论。

隔离环境里的“沙箱需设置”“部分内置能力不可用”只描述本轮测试 profile，不能据此断言用户真实环境故障。截图足以支持当前布局与首屏排序观察，不能证明读屏、所有窗口尺寸或真实保存流程均合格。

## 2. 两个参考项目的真正启发

| 项目 | 当前真实组织 | 对 Space 最有价值的规则 |
| --- | --- | --- |
| DeepSeek Harness | 账号、通用设置、模型、内置插件、Agent 预设；设置里的内置插件是只读部署清单，完整管理在独立工作面 | 字段属于具体对象；模型连接与模型能力分层；新会话默认值与当前会话控制分开；偏好与资源管理有边界 |
| ZCode | 基础设置 / Agent 能力 / 数据与统计三组；模型、MCP、技能、命令有可预测的独立入口 | 内部复用同一组件不必合并产品标签；作用域与页面类别分开；复杂模型页使用业务内导航；旧入口重组需要迁移 |

依据：[DeepSeek 实际注册与内容](settings-information-architecture-deepseek.md#1-一级导航的真实来源)、[字段层级](settings-information-architecture-deepseek.md#3-模型页为何与标签较一致)、[插件边界](settings-information-architecture-deepseek.md#4-设置中的插件与真正的插件管理不是同一页)、[ZCode 分组](settings-information-architecture-zcode.md#1-当前真实入口不能只看旧文档或未过滤的数组)、[ZCode 作用域](settings-information-architecture-zcode.md#3-作用域是另一维度不能藏在标题下)。

两者的“通用/常规”本身也偏宽泛，不能把竞品的所有字段分配都当成最优答案。DeepSeek 的账号、ZCode 的远程设备/同步等有它们自己的产品与部署前提，Space 不应为模仿设置导航而新增这些功能。[DeepSeek 通用清单](settings-information-architecture-deepseek.md#2-通用设置实际装了什么)、[ZCode 当前常规](settings-information-architecture-zcode.md#2-标签与实际内容的对应)。

## 3. 推荐的 Space 导航与完整迁移映射

以下是设计建议，尚未实施。保持现有能力与配置语义，只重新组织入口和呈现。建议八个目的地，按三组排列；关于位于侧栏下部。分组标题只用于扫描，不是空白落地页。

| 导航组 | 新标签 | 从现有页面迁入的内容 | 页面内部组织 |
| --- | --- | --- | --- |
| 应用 | 常规 | 语言、默认工作区、窗口关闭、终端 shell、自动聚焦、通知 | 应用行为 / 工作区与终端 / 通知与焦点；把高频选择做成紧凑设置行 |
| 应用 | 外观 | 主题、视觉质量 | 现有主题/材质预览保留；不把运行预算、更新或技术说明放进来 |
| AI 与工具 | 模型与服务商 | 凭据、provider、模型目录、默认项、自定义端点与测试 | Provider 列表 → 当前详情；主要连接字段先呈现，协议/环境变量/存储等按需展开 |
| AI 与工具 | Agent 与上下文 | 上下文压缩、Workflow 运行限制、外部 Agent 注册 | 行为与上下文 / 外部 Agent 两个明确子区域；普通配置先呈现，注册与合规测试按需打开 |
| AI 与工具 | 工具与集成 | MCP、技能安装、Space 插件库包、连接组件 | MCP / 技能 / 插件库 / 连接组件四个二级入口；每项沿用自己的实际操作边界，不做一条超长混合列表 |
| 系统 | 安全与沙箱 | 现有命令沙箱状态、显式 setup 与配置说明 | 状态与可执行操作先呈现，诊断详情折叠；当前会话权限仍通过现有会话入口修改，不伪造新的全局权限表单 |
| 系统 | 高级与诊断 | Host 事实、配置路径/迁移、生效规则、扩展/集成排障细节、诊断导出 | 按排障任务组织；正常状态简要展示；技术字段和 revision 默认折叠 |
| 侧栏下部 | 关于 | 版本、更新检查、许可证、离线激活 | 版本与更新 / 授权；不把许可证虚构成登录账号 |

这个映射直接处理第 1 节盘点出的所有现有内容，并未新增记忆编辑、远程设备、快捷键编辑、云账号或自动化调度。若后续确认某资源已有更完整的独立管理工作面，设置中直接进入/复用该工作面，避免复制一套不同状态的管理界面。

“工具与集成”是资源导航容器，每个二级页只呈现一种对象；“高级与诊断”只收低频维护事项，技能、MCP 与用户可编辑的上下文策略必须迁出，避免把原 Runtime 大页仅换一个名字。

## 4. 作用域和生效时间必须单独表达

Space 现有 MCP/技能同时展示用户与当前项目路径，运行页却只有通用标题/简介；内容涉及当前项目并不意味着所有写入都是项目级。[页头](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L280)、[MCP](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L1384)、[技能](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L1428)。

例如压缩设置虽然传入 `projectRoot`，实际写入仍经 `loadWritableKodaxConfig` 与 `saveWritableKodaxConfigPatch` 修改共享配置，项目参数用于返回 overview。不能给它随便加一个“当前项目”切换器，造成错误预期。[IPC](../../apps/desktop/electron/ipc/settings.ts#L152)、[写入实现](../../apps/desktop/electron/kodax/user-config.ts#L311)。

建议：

- 应用级项目标识为“应用偏好”；SDK 共享配置标识“共享 KodaX 配置”；真正支持项目覆盖的资源才提供“用户 / 当前项目”选择。
- 字段附近显示真实生效规则，例如“立即生效”“用于新终端/新任务”“需要重载”。既有 Runtime application 数据可用于呈现，不能统一写成保存立即生效。
- 默认值与当前会话有效值应明确解释；现有权限/effort 会话入口同时持久化后续默认，纯导航重排不能将其描述为“只影响当前会话”，也不新增默认权限表单。见 [后续领域核对](settings-review-domain-2026-11-07.md)。
- 保存策略按编辑类型保持：主题/简单开关即时更新，路径、凭据、压缩参数、导入等保留明确保存或确认动作。失败保留草稿，切分类不丢未保存编辑。

上述为设计取舍，其依据是 Space 的真实写入边界、已有 application 元数据，以及 DeepSeek/ZCode 对默认值、当前状态和资源作用域的区分；不是将一个新的全局范围选择器强行覆盖所有设置。

## 5. 布局与性能建议

- 侧栏只显示短标题和必要分组，页头用一句话解释这一页能完成什么；简介要与实际内容保持一致。去掉与当前页无关的常驻“密钥安全”说明，将它放在凭据操作附近。[当前常驻说明](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L269)。
- 普通开关/选择器采用统一设置行：左侧标题与说明，右侧控件。主题预览、Provider 编辑和导入等任务保留适当完整空间；不让每个小选项都获得大段分节留白。[当前通用分节布局](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L3056)。
- 资源页保留自己的筛选；若增加设置搜索，只检索本地标题/说明/别名并定位到对应字段，不调用模型。没有证据表明两个参考项目都提供了全设置全文搜索，不能用不存在的竞品能力作为事实背书。
- 当前所有面板首次同时挂载；建议改为首次访问才加载，访问后保留挂载与草稿。这样同时保留编辑状态，并避免打开设置就获取所有 Provider、运行状态与资源清单。不应在每次切页时卸载重建表单。[当前挂载](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L300)、[DeepSeek 按需保留案例](settings-information-architecture-deepseek.md#4-设置中的插件与真正的插件管理不是同一页)。
- 重组保留旧 `initialTab`、错误中的“打开服务商设置”及快捷入口的映射；后续允许定位具体资源/字段，不只打开一个需要继续滚动的大页。[当前初始页与回调](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L79)、[切页](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L159)。

## 未证实与未解问题

- 竞品仅做本地源码研究，未启动其设置页面；不宣称它们所有平台的视觉、滚动和保存体验更好。
- Space 本轮为隔离 profile 的只读页面走查，没有验证真实账号、保存、迁移、重启或沙箱 setup 的端到端行为。扩展加载中的截图不作为完成态视觉证据。
- 八页方案是有现有清单依据的推荐取舍，不是用户已确认的最终导航。具体功能频率与用户查找速度仍需在真实页面中验证。
- 若实施，首先确认配置归属与保存动作不变，并补齐旧入口定位、草稿保持、首次按需加载、全局/项目范围及深浅/窄窗回归；不能只改标签文本就宣称信息架构完成。

本轮仅新增研究笔记与本地截图，未调整产品设置、SDK、IPC 或现有工作模式开发。
