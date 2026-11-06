# DeepSeek Harness 的设置导航如何与实际内容对应？

结论摘要：这个 checkout 的内置设置主要围绕“账号、通用设置、模型、内置插件、Agent 预设”组织；模型连接与模型目录集中在“模型”，高级字段在具体 Provider 内折叠；完整插件管理是独立工作面，设置中的“内置插件”只是部署清单。最值得借鉴的是清楚区分“用户偏好、将来会话的默认值、当前会话状态、可管理资源”，而不是照搬导航标签数量。依据见下面逐项源码引用。

日期：2026-11-06。本地仓库 `C:/Works/PubProj/deepseek-harness`；HEAD `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。本轮仅阅读第一方源码、注册与文档，未启动产品、未运行其测试、未做像素效果验收。页面由动态注册组装，实际部署与访问权限会影响可见项；下面列的是查到的内置注册，不是假定所有部署都固定显示五项。

## 1. 一级导航的真实来源

Settings shell 从 `settings.section` 注册目录读取 id、order 和本地化 label，再按 order 排序；选中项消失时回退到第一项，右侧只渲染当前 section。因此页面归属由具体注册定义，不能仅从某个旧截图或测试假数据猜测。[目录投影](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/index.ts:159)、[选中与渲染](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.tsx:58)

| 一级入口 | 顺序 | 内容及实际边界 | 依据 |
| --- | ---: | --- | --- |
| 账号 | -10 | 账号身份、登录状态、余额/赠送额度、平台使用记录等；注册受 `account/watch` 访问能力门控 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-account/src/client/index.ts:336)、[账号内容](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-account/src/client/AccountSection.tsx:92) |
| 通用设置 | 0 | 功能贡献的偏好条目，单列渲染；权限默认值、语言、外观、字体、显示、快捷键等均进入这里 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/index.ts:266)、[单列组合](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/GeneralSection.tsx:14)、[中文标签](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/locales.ts:53) |
| 模型 | 10 | Provider/连接凭据/支持模型与自定义模型 API 在同一工作流中呈现 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-models/src/client/index.ts:136)、[页面职责](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-models/src/client/ModelsSection.tsx:1) |
| 内置插件 | 15 | 查看部署携带的插件清单；不是完整安装/配置管理器 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-plugins/src/client/index.ts:74)、[中文标签与说明](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-plugins/src/client/locales.ts:16)、[只读 inventory 注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-plugin-inventory/src/client/index.ts:33) |
| Agent 预设 | 20 | 预设名册、默认选择、模式解释、只读组合查看与 Creator 入口；按内置/自定义分组 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-agent-preset/src/client/index.ts:281)、[页面](C:/Works/PubProj/deepseek-harness/packages/client/ui-agent-preset/src/client/AgentPresetSection.tsx:1)、[分组与默认操作](C:/Works/PubProj/deepseek-harness/packages/client/ui-agent-preset/src/client/AgentPresetSection.tsx:112) |

这里没有为了填满导航而给每种技术子系统创建一级页；但这不表示所有相关能力都不存在。当前检查的内置注册与一般 slot 扩展能力需要区分。[section slot 契约](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings/src/client/contract/slots.ts:57)、[动态目录](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/index.ts:168)

## 2. “通用设置”实际装了什么

通用页没有自己写死所有业务字段，只按 item slot 渲染。内置贡献的项目和顺序如下；是否可见仍受对应功能/能力注册影响。[GeneralSection](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/GeneralSection.tsx:14)

| 条目 | 顺序 | 作用 | 依据 |
| --- | ---: | --- | --- |
| 默认权限模式 | -20 | 新会话的默认权限；完全权限切换有确认，不等于修改所有现有会话 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-permission-presets/src/client/index.ts:169)、[说明](C:/Works/PubProj/deepseek-harness/packages/client/ui-permission-presets/src/client/locales.ts:9)、[确认交互](C:/Works/PubProj/deepseek-harness/packages/client/ui-permission-presets/src/client/PermissionRow.tsx:53) |
| 语言 | 0 | 选择语言偏好 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/locale/src/client/index.ts:622) |
| 外观 | 10 | 主题选择 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-theme/src/client/index.ts:622) |
| 字体设置 | 11 | 按文字角色调整字体与字号 | [注册及动作](C:/Works/PubProj/deepseek-harness/packages/client/ui-theme/src/client/index.ts:631) |
| 对话显示 | 12 | 转录显示模式、折叠时机和折叠回复 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-chat/src/client/apply.ts:193) |
| 显示代码工作视图 | 15 | 控制代码轨迹/差异和完整 Agent 预设入口的呈现 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/index.ts:84)、[用户文案](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/locales.ts:55) |
| 快捷键 | 16 | 通用页入口打开独立快捷键参考/编辑浮层，不把整张快捷键表铺在通用页 | [入口与浮层注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-shortcuts/src/client/index.ts:42) |
| 链接打开方式 | 17 | 链接目的地偏好，依赖可用的 browser 侧栏能力 | [注册与持久化](C:/Works/PubProj/deepseek-harness/packages/client/ui-chat/src/client/apply.ts:149) |
| 运行忙碌时 Enter 行为 | 20 | 输入提交偏好 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/apply.ts:198) |
| 性能用量偏好 | 30 | 对话显示/性能策略 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-chat/src/client/apply.ts:182) |
| 会话日志上传 | 90 | 对应 namespace 被 Host 服务时才显示的上传偏好 | [门控注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-session-log/src/client/index.ts:36) |
| 桌面更新渠道 | 95 | 桌面 bridge 提供 channels 能力时显示 | [门控注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/index.ts:108) |
| 当前版本 | 100 | 版本信息 | [注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/index.ts:100) |

**设计判断**：DeepSeek 的通用页也覆盖不少领域，不能据此推导“所有东西放通用就是最佳方案”。它把大多条目做成清楚命名的偏好行，复杂快捷键进入自己的浮层，模型/Agent 资源进入专属页；这比用一个“Runtime”容器承接所有实现细节更容易形成用户预期。这个判断来自上面的条目分布和下节资源页边界，不是本轮亲测的可用性评分。

## 3. 模型页为何与标签较一致

- 模型页以 Provider 行为主，已有连接与可添加目录/自定义 API 两条路径都在一个页面；一次主要展开一个 editor card，两个添加方式按需挂载，访问过的草稿保留。删除 Provider 要确认，变更完成后以 Host 推送失效或重新加载同步。[ModelsSection 设计与实现说明](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-models/src/client/ModelsSection.tsx:1)
- ProviderEditor 的首要字段是 API key，baseURL、模型目录和特定路由的名称/协议放进折叠的自定义设置区。用户无需先理解环境变量引用名称才能完成连接。[ProviderEditor](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-models/src/client/ProviderEditor.tsx:1)
- 推理强度刻意不放在 Provider 级，因为它是每个模型的能力；具体模型在 composer 的 model picker 选择强度。这是“字段放到正确对象层级”的直接例子。[ProviderEditor 能力边界说明](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-models/src/client/ProviderEditor.tsx:14)
- Provider 编辑有本地 draft 与 revision；保存流程写最小 path ops，而不是把部分展示值重建成整份配置。存在明确提交边界，不能笼统说整个设置全是即改即存。[草稿/revision](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-models/src/client/ProviderEditor.tsx:194)、[apply](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-models/src/client/ProviderEditor.tsx:268)

## 4. 设置中的插件与真正的插件管理不是同一页

- 设置“内置插件”下有 feature-owned tab 机制，但一个 tab 时直接展示内容，不重复画一层 tab 导航；多个 tab 才显示横向 tabs。首次访问挂载，之后隐藏保留草稿、搜索与目录快照。[PluginsSettingsSection](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-plugins/src/client/PluginsSettingsSection.tsx:32)
- 当前找到的内置 tab 是 `all`，显示只读 Host plugin inventory，支持部署/客户端状态和重试，不是安装表单。[inventory tab 注册](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-plugin-inventory/src/client/index.ts:33)、[页面 face](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.tsx:24)
- 真正的 plugin manager 把 `plugins` 注册成主侧栏工作面。其源码明确写“属于 profile、不属于 Session”，处理安装、启用、组合及配置项；能力访问受 `pluginManager/listBundles` 门控。[管理工作面边界](C:/Works/PubProj/deepseek-harness/packages/client/ui-plugin-manager/src/client/index.ts:82)、[独立侧栏入口](C:/Works/PubProj/deepseek-harness/packages/client/ui-plugin-manager/src/client/index.ts:167)

**对 Space 的建议**：设置页里可以保留扩展的默认行为与健康信息；完整资源库、安装/编辑和项目级启停需要明确自己的入口与作用域。“插件/扩展”一个标签同时承担配置、健康、商店、连接器账号和运行状态，会重新产生标签与内容的预期偏差。此为基于上述边界的设计建议，不是要求复制 DeepSeek 的插件框架。

## 5. 作用域与保存语义

- 这里配置服务以 active profile 中唯一 entry id 为 namespace，区分 resolved / inherited / explicit override 并带乐观 revision；“全局”更准确地说是当前 Host/profile 的配置，不能误称为只存在某个浏览器的本地偏好。[第一方设置机制说明](C:/Works/PubProj/deepseek-harness/docs/subsystems/settings.md:7)、[浏览器统一经 Host 持久化](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings/src/client/index.ts:42)
- 语言选择先发布本地显示结果，再写 Host；主题/字体也提供直接 set 动作。因此轻量偏好可以即改即存，但仍需区分当前显示和 Host 接受的最终状态。[语言](C:/Works/PubProj/deepseek-harness/packages/client/locale/src/client/index.ts:256)、[主题](C:/Works/PubProj/deepseek-harness/packages/client/ui-theme/src/client/index.ts:258)、[字体](C:/Works/PubProj/deepseek-harness/packages/client/ui-theme/src/client/index.ts:274)
- ConfigForm 的 mutate 会排队、带 revision、提交后接受新 view，失败时恢复读取；不是仅在 UI 改一个 checkbox 就宣称保存成功。[ConfigForm](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings/src/client/config-form.ts:129)
- 权限的设置行描述为新会话默认值；当前会话权限另有 composer/slash 入口，经具体 Session 的 `/permission` command 修改。默认值与当前会话状态没有混成同一字段。[默认说明](C:/Works/PubProj/deepseek-harness/packages/client/ui-permission-presets/src/client/locales.ts:9)、[当前 Session 操作](C:/Works/PubProj/deepseek-harness/packages/client/ui-permission-presets/src/client/index.ts:126)、[两类入口](C:/Works/PubProj/deepseek-harness/packages/client/ui-permission-presets/src/client/index.ts:169)
- Agent 预设默认值写到 Host 将来创建 Session 时消费的配置 namespace；页面还会在适用时同步当前空白任务，不能说它从不影响当前 UI。[默认值存储职责](C:/Works/PubProj/deepseek-harness/packages/client/ui-agent-preset/src/client/settings-store.ts:1)、[空白任务同步](C:/Works/PubProj/deepseek-harness/packages/client/ui-agent-preset/src/client/section-store.ts:72)

## 6. 布局事实与可借鉴原则

源码将设置壳设计成居中的导航+内容 panel；CSS 固定 188px rail 与弹性内容列，整体 800px 宽、高度受窗口约束；内容与导航分别滚动。窄浏览器布局会变为占满视口，桌面仍保留 rail。这里仅确认源码规则，未实际测量每个平台窗口。[结构](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.tsx:67)、[CSS](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.module.css:84)

建议借鉴的规则是：一级页按用户要配置的对象命名；资源页围绕一个主要对象；设置默认值与当前 Session 操作分开；复杂资源管理不要伪装成偏好；只有内容真的需要时增加二级导航。以上分别由本笔记第 1、3、4、5 节和 PluginsSection 的“单 tab 不画 tab”实现提供依据。

## 未证实

- 未启动应用，因此没有本轮截图、像素/滚动/焦点/屏幕阅读器和实际保存体验证据；不能将本笔记称为完整 UX 实测审计。
- 搜索到旧测试和 `SettingsRoot.navIcon` 对 `archived-sessions` 的记录，但没有找到当前内置 `settings.section` 的对应真实注册；故没有把它列进当前导航表。[保留的图标分支](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.tsx:40)
- 未找到独立 Runtime、诊断、MCP 一级设置注册，不能从此推导这些功能不存在。动态插件能贡献新 section；MCP 的完整配置表面与具体部署注册不在本次聚焦范围。
- 不能假定当前 checkout 的默认装配与用户见到的发布版装配完全一致。

## 未解问题

- Space 应把扩展安装/管理保留在设置内，还是继续作为独立工作面？需要结合 Space 现有入口与用户任务决定；DeepSeek 的选择只能提供边界参考。
- Space 中默认值、当前会话值、项目配置各有哪些？需要逐项清点，不应仅把 Runtime 页拆成数个新名字。
- 通用设置的条目数量在 Space 是否仍适合一页？DeepSeek 自身也有较宽的通用页，需结合真实内容密度与搜索需求判断。
