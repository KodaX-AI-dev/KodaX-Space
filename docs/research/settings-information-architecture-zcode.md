# ZCode 的设置标签如何对应内容，哪些组织方式值得 Space 借鉴？

结论摘要：ZCode 最值得借鉴的是“按用户理解的对象建立独立入口，再把作用域作为另一维度明确展示”。它将常规、外观、模型配置与 Agent 能力、数据管理分组；MCP、技能、命令拥有独立入口，虽然内部复用同一个实现。它也有较宽泛的常规页，因此不建议直接照搬全部内容归属。[配置源](C:/Works/PubProj/ZCode/packages/ui/src/settings/settingsPageConfig.ts:40)、[真实路由](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2058)。

调研日期：2026-11-06。本地 checkout：`C:/Works/PubProj/ZCode`，HEAD `a9fe401eede6e6e5e01be9048679c206fe6f02d9`。仅静态阅读当前源码、第一方规格与已有测试目录，没有启动程序或执行测试。以下不是视觉截图验收。

## 1. 当前真实入口，不能只看旧文档或未过滤的数组

当前 Root 的设置分支确实渲染 `SettingsPage`，已有 workspace 的覆盖层也复用它；此次主线跟踪共享设置页面，没有把 `v4/composer` 中的会话即时控制、旧 BotsDialog 或工作流运行面板误当成全局设置。[Root 无 workspace 分支](C:/Works/PubProj/ZCode/packages/ui/src/Root.tsx:1538)、[覆盖层](C:/Works/PubProj/ZCode/packages/ui/src/root/WorkspaceSettingsLayer.tsx:36)。

导航配置先定义三个组，再把页面按 `groupId` 分配；真正渲染时使用 group 标题、group 内按钮和当前页 `aria-current`。组标题本身不负责切换内容。[分组定义](C:/Works/PubProj/ZCode/packages/ui/src/settings/settingsPageConfig.ts:40)、[分组渲染](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:1593)。

| 组 | 当前可见内容（按组内配置顺序） | 源码 |
| --- | --- | --- |
| 基础设置 | 常规、外观、模型设置、浏览器、远程设备、电脑控制、快捷键 | [页面配置](C:/Works/PubProj/ZCode/packages/ui/src/settings/settingsPageConfig.ts:67)、[中文组名](C:/Works/PubProj/ZCode/packages/ui/src/i18n/locales/zh-CN.ts:3048) |
| Agent 能力 | 个性化、记忆、子智能体、插件、MCP、技能、命令、钩子 | [能力配置](C:/Works/PubProj/ZCode/packages/ui/src/settings/settingsPageConfig.ts:85) |
| 数据与统计 | 数据同步、使用统计、项目管理、归档 | [数据配置](C:/Works/PubProj/ZCode/packages/ui/src/settings/settingsPageConfig.ts:176) |

这不是“所有平台都有所有入口”：电脑控制通过 desktop 参数控制；远程设备与数据同步只在桌面可用。`automations` 虽然还在基础定义中，却被显式隐藏，因为产品将其视为 workspace 主视图；旧 `plugins` 与工作区文件搜索入口也隐藏。不能把未过滤数组直接当成用户当前导航。[平台过滤](C:/Works/PubProj/ZCode/packages/ui/src/settings/settingsPageConfig.ts:222)、[桌面专属](C:/Works/PubProj/ZCode/packages/ui/src/settings/settingsPageConfig.ts:258)、[隐藏分区与理由](C:/Works/PubProj/ZCode/packages/ui/src/lib/settingsNavigation.ts:43)。

## 2. 标签与实际内容的对应

| 标签 / 区域 | 实际承载的内容 | 判断 |
| --- | --- | --- |
| 常规 | 语言、界面模式、终端配置/字体/shell、工具搜索、原生搜索增强、HTTP 代理、桌面通知/托盘/保活/更新，以及若干消息与交互行为 | 标签比较宽，仍有“杂项抽屉”倾向；不是完全值得照搬的范例。[内容控件](C:/Works/PubProj/ZCode/packages/ui/src/settingsPageHelpers.tsx:374)、[终端与工具搜索](C:/Works/PubProj/ZCode/packages/ui/src/settingsPageHelpers.tsx:446)、[代理](C:/Works/PubProj/ZCode/packages/ui/src/settingsPageHelpers.tsx:582)、[调用参数](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:1799) |
| 外观 | 主题、UI 字号、代码预览的主题/字号/显示行为，并提供深浅预览 | 主题和代码显示被放在用户能预期的同一页。[路由](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2058)、[外观内容](C:/Works/PubProj/ZCode/packages/ui/src/settingsCodePreview.tsx:81) |
| 模型设置 | Provider/模型配置及相关账户授权；内部采用“Provider 导航 + 右侧详情”而不是一条很长的全部 Provider 表单 | 独立业务工作面，内容自身有二级导航。[路由](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2083)、[双栏结构](C:/Works/PubProj/ZCode/packages/ui/src/settings/model-provider-section/SectionLayout.tsx:70) |
| 个性化 | 本机用户指令 `~/.zcode/AGENTS.md` 的编辑，不等同于主题外观 | 明确区分“界面个性化”和“Agent 指令个性化”。[本机写入边界](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2098)、[保存](C:/Works/PubProj/ZCode/packages/ui/src/settings/PersonalizationSection.tsx:198) |
| 记忆 | 开关与本机已保存工作区记忆查看，按项目组织 | 与自定义指令独立，仍明确本机数据源。[路由和本机 Host](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2107)、[中文查看文案](C:/Works/PubProj/ZCode/packages/ui/src/i18n/locales/zh-CN.ts:3181) |
| 插件 / MCP / 技能 / 命令 | 各有一级导航，分别把同一个 `PluginsSection` 置为相应 mode；每个入口仍有自己的标题、列表与编辑状态 | 实现复用不决定产品分类；内部共用代码无需迫使用户去同一“大扩展”标签找全部对象。[插件、MCP、技能路由](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2118)、[命令路由](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2205) |
| 快捷键 | 独立页面，按命令文字和实际按键组合筛选，提供冲突语义一致的结果 | 高频可检索能力有直接入口。[路由](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2081)、[过滤逻辑](C:/Works/PubProj/ZCode/packages/ui/src/settings/ShortcutSettingsSection.tsx:58) |
| 账号 | 设置侧栏底部复用 workspace 账户菜单，接收登录/退出和用户身份 | 不是把所有账号都混入模型或许可页；模型服务的凭据仍在模型业务内。[Footer](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:1662) |

当前一级配置中没有名为 Runtime、Diagnostics 或 License 的通用顶级入口；这只说明这份共享设置导航的命名，不代表全项目不存在诊断、授权、付费或运行时能力。[完整配置](C:/Works/PubProj/ZCode/packages/ui/src/settings/settingsPageConfig.ts:67)。本次也未在该导航里找到独立的通用“权限”页，不能将会话权限模式或浏览器控制权限推断成全局设置分类。

## 3. 作用域是另一维度，不能藏在标题下

- Provider 配置被明确强制注入本机 `localHostServices`，即使当前 workspace 在远端也不能误写远端；个性化和记忆也分别固定本机边界。这说明“你正在操作哪个设备/配置源”是显式的产品事实。[模型](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2084)、[个性化/记忆](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2098)。
- 插件/MCP/技能等资源页使用独立 `useSettingsScope` 和 `PluginScopeMenu`；作用域域模型区分本机用户、远端设备用户及 workspace identity。页面类别与作用域不会被编码为同一串模糊导航名称。[范围菜单](C:/Works/PubProj/ZCode/packages/ui/src/settings/PluginsSection.tsx:1141)、[状态解析](C:/Works/PubProj/ZCode/packages/ui/src/settings/PluginsSection.tsx:959)、[域模型](C:/Works/PubProj/ZCode/packages/ui/src/settings-scope/domain/scope.ts:19)。
- 插件商店浏览与安装流可离开设置覆盖层；管理已安装资源仍在设置中。定时任务则作为工作区任务能力从设置导航移出。这些都是按任务目的分类，而非按源代码包分类。[离开设置打开商店](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2130)、[隐藏自动化理由](C:/Works/PubProj/ZCode/packages/ui/src/lib/settingsNavigation.ts:43)。

## 4. 搜索、二级页与保存

- 找到的搜索属于资源页内搜索：插件页把 query 按当前 tab 保存；记忆、快捷键、钩子等也复用 `SettingsSearchInput`。没有证据可把该通用组件描述为“全设置全文搜索”。[插件页 query](C:/Works/PubProj/ZCode/packages/ui/src/settings/PluginsSection.tsx:1220)、[搜索控件](C:/Works/PubProj/ZCode/packages/ui/src/settings/SettingsSearchInput.tsx:7)、[快捷键过滤](C:/Works/PubProj/ZCode/packages/ui/src/settings/ShortcutSettingsSection.tsx:58)。
- 模型配置有业务内双栏导航；资源编辑使用统一返回组件、面包屑上报等机制。二级返回规格覆盖 Memory、插件、命令、钩子、子智能体与 MCP；不要把每个二级列表都升级成一级设置分类。[模型双栏](C:/Works/PubProj/ZCode/packages/ui/src/settings/model-provider-section/SectionLayout.tsx:70)、[资源面包屑](C:/Works/PubProj/ZCode/packages/ui/src/settings/PluginsSection.tsx:1122)、[第一方返回规格](C:/Works/PubProj/ZCode/docs/ui/settings-secondary-navigation.md:5)。
- 保存不是全站一刀切：外观开关/选择直接调用更新函数；个性化文本有 Save、Cancel、未保存标记，并在保存失败时保留草稿。常规中的代理等文本配置也有单项保存动作。因此可以借鉴“明确保存反馈”，不应声称它是统一自动保存。[主题选择](C:/Works/PubProj/ZCode/packages/ui/src/settingsCodePreview.tsx:120)、[个性化按钮/dirty](C:/Works/PubProj/ZCode/packages/ui/src/settings/PersonalizationSection.tsx:281)、[失败保留草稿](C:/Works/PubProj/ZCode/packages/ui/src/settings/PersonalizationSection.tsx:205)、[代理保存控件](C:/Works/PubProj/ZCode/packages/ui/src/settingsPageHelpers.tsx:582)。
- 打开设置会记住最近分区，并支持明确的页面/Provider/作用域跳转意图；旧 `plugins` 和 `codePreview` 偏好分别迁到当前 plugin/appearance，隐藏页回退到可见页。导航重组需要维护这些入口兼容，而不只是改左栏文本。[最近分区与旧值迁移](C:/Works/PubProj/ZCode/packages/ui/src/lib/settingsNavigation.ts:125)、[已有页面跳转事件](C:/Works/PubProj/ZCode/packages/ui/src/lib/settingsNavigation.ts:477)。

## 5. 与旧规格冲突的地方

`docs/ui/settings-sidebar-layout.md` 仍有“常规管理主题和语言”“代码预览为独立内容”等历史描述；当前导航配置与渲染器已经把主题和代码预览放在 appearance，常规也扩展了大量其他项。这里以当前可执行源码为准，旧文档仅作设计沿革，不能照抄旧标签表。[旧文档](C:/Works/PubProj/ZCode/docs/ui/settings-sidebar-layout.md:31)、[当前外观路由](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2058)。

## 6. 对 Space 的建议（推断）

1. 用“外观、模型、Agent、工具连接、应用行为、数据维护”这类用户任务词汇重新检查归属，尤其避免 Runtime 成为无法预测内容的兜底页。ZCode 当前的独立模型、MCP、技能和命令入口提供直接参照；具体一级页数量仍应按 Space 的真实设置清单决定，不复制其全部功能。[分类依据](C:/Works/PubProj/ZCode/packages/ui/src/settings/settingsPageConfig.ts:67)。
2. 一级类目、资源二级页、项目/设备作用域分开表达；同一个能力在不同作用域使用清楚的范围控件。这样不需要把“项目 MCP、用户 MCP、远端 MCP”做成三个相似顶级标签。[范围依据](C:/Works/PubProj/ZCode/packages/ui/src/settings/PluginsSection.tsx:1141)。
3. 代码里的 RuntimePanel/ExtensionPanel 不应决定用户看见的分类。可以复用逻辑再按任务分配视图，ZCode 的 `PluginsSection mode` 已证明这两件事可以分开。[复用路由](C:/Works/PubProj/ZCode/packages/ui/src/SettingsPage.tsx:2137)。
4. 也要吸取它的不足：常规已经包含终端、网络和 Agent 交互等很多内容，不把“它有常规页”当成 Space 继续堆杂项的理由。[常规真实内容](C:/Works/PubProj/ZCode/packages/ui/src/settingsPageHelpers.tsx:374)。

## 未证实

- 未实机验证设置页在各窗口宽度、深浅主题、读屏、中文输入法下的实际效果。
- 没有证明全设置全文搜索存在；本次确认的是资源级搜索。
- 没有审计所有会话级权限/Agent 模式入口，不能据此为 ZCode 做完整安全或运行时权限分类说明。
- 本次仅跟踪当前共享 SettingsPage，未把所有 legacy 弹窗、v4 会话内设置或历史文档当作同一用户界面。

## 未解问题

- Space 的完整设置清单与实际使用频率尚需由主线盘点，才能决定应拆出多少一级页。
- Space 的哪些运行配置需要重启/重载、哪些是会话覆盖，需要在重新分类时逐项保留其真实生效范围。
- ZCode 的页面分类不应决定 Space 是否新增记忆、快捷键编辑、远程设备或自动化能力；本轮只借鉴组织方式。
