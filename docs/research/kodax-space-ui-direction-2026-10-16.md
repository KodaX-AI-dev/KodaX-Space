# KodaX Space 怎样形成有辨识度、空间高效、适合长期工作的 Agent 界面？

结论摘要（设计建议）：优先采用「连续主画布、贴边导航、按需检查器」的布局，以石墨深灰 / 纸白为明暗主题，保留克制的琥珀品牌色。美感主要来自空间层次、排版、执行过程和成果之间的连续性；动效集中在真实状态变化和用户操作上。中央去掉外层卡片值得优先验证，但单独删除圆角不足以完成改版。[当前布局](../../apps/desktop/renderer/src/shell/Shell.tsx)、[Linear 2026 设计说明](https://linear.app/now/behind-the-latest-design-refresh)、[竞品研究](agent-ui-patterns-2026-10-16.md)。

调研日期：2026-10-16（Asia/Shanghai）。本文是研究和设计提案，未修改产品代码，也未建立新的 feature 或发布承诺。

## 1. 证据范围与产品边界

- **本地事实**来自当前工作区源码；**外部事实**来自官方文档、第一方设计复盘、规范和锁定的官方源码。下面的配色、尺寸、默认行为是提案，不是已实现状态。[资料与引用详表](agent-ui-patterns-2026-10-16.md)、[视觉系统资料](agent-design-systems-motion-2026-10-16.md)。
- **没有完成本轮运行界面截图审计。** 内置浏览器连接超时；后备 Windows 浏览器工具因为不能可靠确认当前 URL 停止。本轮未继续 Computer Use，也没有用旧截图替代本次证据。因此不声称已亲测竞品、测量当前成品页面或验证动效帧率。
- Space 的定位是 Provider 中立、local-first 的桌面 Agent 工作台，包含 Coder、Partner 和统一工具宿主。品牌系统应共享；Coder 的 diff、Partner 的文档成果需要不同的内容排版。[PRD §1.1](../PRD.md)、[ADR-007](../ADR/ADR-007-partner-surface-model.md)。

## 2. 对「中间应该完整非卡片」的判断

**建议采纳，同时调整两侧的外壳与间距。** 问题的核心是主次和有效面积：当三个区域都带圆角、边框、阴影和相似留白时，它们容易被理解为三个平级对象，中央承载的工作内容不够突出。这个判断有明确代码依据，实际观感仍需下一轮截图验证。[Shell.tsx:1477、1567](../../apps/desktop/renderer/src/shell/Shell.tsx)、[LeftSidebar.tsx:178](../../apps/desktop/renderer/src/shell/LeftSidebar.tsx)、[RightSidebarFrame.tsx:38](../../apps/desktop/renderer/src/shell/RightSidebarFrame.tsx)。

### 2.1 当前能从源码确认的结构

| 观察                                                                           | 源码依据                                                                    | 设计含义（推断）                                                                                   |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 三栏父容器使用 `p-2.5 gap-2.5`。左右栏及中央都有 `rounded-xl`、边框与 `lift`。 | `Shell.tsx:1477、1567`；`LeftSidebar.tsx:181`；`RightSidebarFrame.tsx:38`。 | 卡片感来自整套外壳，不仅是中间的圆角。                                                             |
| 三栏全开时有五个 flex 子项：左栏、拖拽条、中央、拖拽条、右栏。                 | `Shell.tsx:1477–1663`；`ResizeHandle.tsx:160`。                             | 四段 gap，加上左右外边距和拖拽条，形成可计算的空间开销。                                           |
| 中央滚动容器有 `px-8`；内容层再有 `pl-10 sm:pl-12` 给时间线。                  | `ConversationStreamV2.tsx:2180–2184`。                                      | 在常规桌面宽度，正文前的横向留白约 112px，不能只看面板外边距。时间线的定位功能应保留，尺寸可收紧。 |
| Coder 与 Partner 的主区都采用同类 card 外壳。                                  | `Shell.tsx:1567`；`PartnerWorkspace.tsx:140`。                              | 改版需要覆盖两个 surface 的共享外观，不能只改 Coder 首页。                                         |
| 已有半宽 / 最大宽右栏、阅读专注模式、窗口宽度保护与侧栏拖拽。                  | `RightSidebarFrame.tsx`；`Shell.tsx:634、650、1389`。                       | 优先调整既有能力的呈现与默认规则，无需再造一套布局系统。                                           |
| 项目曾因用户反馈宽屏留白过多而取消 `max-w-3xl`。                               | `ConversationStreamV2.tsx:2182`。                                           | 不应为了模仿聊天产品重新强制全局限宽。                                                             |

### 2.2 空间示例：收益可以计算，体验提升尚待验证

按当前 Tailwind 默认 4px spacing 刻度，三栏全部显示时，固定横向开销为：

`20px 外边距 + 4 × 10px gap + 2 × 4px 拖拽条 = 68px`。

仅用于隔离布局因素的例子：窗口宽 1440px，左栏固定 260px、右栏固定 320px，当前中央约为 `1440 − 260 − 320 − 68 = 792px`。若改为贴边分栏、两个各 1px 的视觉分界，保持两栏宽度不变，中央约为 `858px`，增加约 66px / 8.3%。这是静态几何推算，未计边框、缩放、滚动条或实际运行状态；320px 不是对所有窗口的默认宽度声明。依据：`Shell.tsx:153–161、245–255`、`ResizeHandle.tsx`。

**建议：**视觉分隔可以只有 1px，但拖拽命中区仍应覆盖分界两侧，不能把可操作区域也缩成 1px。正文 gutter 可先比较左右 20–24px、时间线 28–32px 的版本，保留路径定位、跳转和键盘焦点，不靠缩小字号挤空间。

## 3. 参考产品：分别学习什么

以下“借鉴”是设计推断；引用链接与两篇附录提供对应事实。未把官网视觉当作已登录产品的完整实测。

| 对象                 | 第一方资料可确认的模式                                                                       | 对 Space 最有价值的借鉴                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linear               | 2026 refresh 降低侧栏亮度、收紧部分 tabs/icons、减少多余分隔、向低饱和暖灰调整。             | 主内容优先，结构安静；密度靠对齐和秩序，而非到处缩字。[官方复盘](https://linear.app/now/behind-the-latest-design-refresh)。                                                                               |
| Claude Code Desktop  | 项目 / session 组织、可调整工作区、不同 transcript 显示模式。                                | 过程可以有简洁默认态，细节仍可展开；文字、执行和审阅分别给合适空间。[官方桌面说明](https://code.claude.com/docs/en/desktop)。                                                                             |
| Cursor Agents Window | 任务和审阅导向的界面，与直接文件编辑的 Editor 有不同定位。                                   | Space 的专业感可以建立在委派、进度、成果与 review 的闭环上。[官方说明](https://cursor.com/docs/agent/agents-window)。                                                                                     |
| Codex                | review 有工作区、分支、本轮等作用域及行级反馈。                                              | 变更范围、来源和下一步操作应清楚；review 应获得完整工作面。[官方 review 文档](https://learn.chatgpt.com/docs/code-review)。                                                                               |
| Antigravity          | Artifact、task group、折叠子步骤与外露的 pending step，分别出现在官方注明的不同 surface 中。 | 把过程压缩成可理解的工作阶段，同时让等待输入和审批保持可见。[Artifacts](https://antigravity.google/docs/artifacts)、[Tools](https://antigravity.google/docs/tools/)。                                     |
| T3 Code              | 锁定源码的 inline diff shell 使用分隔线与多种面板模式。                                      | 与 Space 相近的多 Agent 壳可用平面分栏；具体宽度不照搬。[锁定源码](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/apps/web/src/components/DiffPanelShell.tsx#L8-L45)。 |
| Conductor / Zed      | 任务 / thread 组织，以及 diff、行或 hunk 粒度的审阅入口。                                    | 多任务靠列表和明确状态组织；执行详情进入任务内部，完整 review 按需打开。[Conductor](https://www.conductor.build/docs/concepts/workflow)、[Zed](https://zed.dev/docs/ai/agent-panel)。                     |
| Raycast              | 集中的上下文动作、快捷键、List + Detail；官方设计复盘将操作条、toast 与导航标题归整。        | 每类对象都有一致主动作、次动作和更多动作，形成操作上的精致感。[API](https://developers.raycast.com/api-reference/user-interface)、[设计复盘](https://www.raycast.com/blog/a-fresh-look-and-feel)。        |
| Stripe               | 官方色彩方法强调对比度、可辨认色相和相近视觉权重；Stripe Apps 对品牌色与系统控件有明确边界。 | 建立成对的前景 / 背景颜色，品牌表达有固定位置。[色彩研究](https://stripe.com/blog/accessible-color-systems)、[Apps design](https://docs.stripe.com/stripe-apps/design)。                                  |

**对“优秀”的选择标准（本报告判断）：**先看任务主次是否清楚、长内容是否舒适、复杂状态是否仍整齐、操作是否顺手、是否有自己的品牌记忆。空首页的惊艳程度只是其中一项。Space 应在满载工作时同样好看。

## 4. Refero 和组件网站应该怎样用

**Refero 适合建立风格词汇。** 它明确提供颜色、排版、间距、组件和 AI-readable DESIGN.md，包含暖色 SaaS、偏暖的 Linear 等方向；其条目说明测量经过归一化，角色和建议经过解释，HTML 为重建。它是 Refero 策展的一手证据，不等于被收录公司的官方产品规范。[Refero](https://styles.refero.design/)、[Cursor 条目说明](https://styles.refero.design/style/4e3b4717-84c8-4599-baaf-a343c3d619b6)。

设计建议：官网的编辑感可以转译为有节制的字重、纸白、少量品牌色；大标题、大 section gap、整屏背景动效适合官网或短暂空态，不应直接套给密集工作区。不要从多个条目各取一个按钮、一种卡片和一段背景，最后得到拼接的风格。

| 来源                  | 建议取用的位置                                      | 本轮取舍                                                                                                                                                                                |
| --------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animate UI            | Popover、Tooltip、Tabs、Collapse、Copy 等有限反馈。 | 研究动效节奏与状态衔接；选中组件后核验 Tailwind 3 和当前弹层体系的兼容性。[组件](https://animate-ui.com/docs/components)、[安装](https://animate-ui.com/docs/installation)。            |
| React Bits / Pro      | 品牌空态、局部有记忆点的视觉表现。                  | 作为灵感库；粒子、文字变形、光标拖影不进入长时间正文阅读区。[Pro 目录](https://pro.reactbits.dev/docs/components)。                                                                     |
| shadcn Agent patterns | 执行步骤、工具、计划与输入区的组合方式。            | 借鉴统一的 Trace 形状与展开层次，沿用 KodaX 事件语义和 SDK。[当前文档](https://ui.shadcn.com/docs/ai-elements)。                                                                        |
| Radix / Base UI       | 菜单、对话框、焦点、键盘等基础行为。                | 有真实缺口时选一套试点，不为外观一次安装两套 primitive。[Radix](https://www.radix-ui.com/primitives/docs/overview/accessibility)、[Base UI](https://base-ui.com/react/overview/about)。 |
| Motion                | 复杂的 presence / layout transition。               | 现有 CSS 能完成的反馈继续用 CSS，按必要性引入。[性能指南](https://motion.dev/docs/performance)。                                                                                        |

源码引入与视觉借鉴需要分别判断：当前 React Bits 免费仓库是 MIT + Commons Clause，Pro 协议对公开源代码分发有约束，不能仅凭“可商用”就复制进公共仓库。这里记录供应方条款，不作法律结论；具体版本与文件的核验见附录。[免费库 LICENSE](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)、[Pro §2](https://pro.reactbits.dev/license#2-license-grant)。

## 5. 推荐的统一设计方向

本节为待验证设计提案，不是已批准规范。

### 5.1 气质：安静、精确、带温度

建议延续 Space 已有的琥珀识别色，配中性略暖的石墨灰和纸白。主区的文字与成果清晰，导航退后，少量关键交互带温暖的光感。界面辨识度来自稳定的形状、排版与行为；不需要用常驻大面积辉光证明“这是 AI”。依据：现有 `styles.css:39–179`、[Linear 的主次与暖灰调整](https://linear.app/now/behind-the-latest-design-refresh)。

以下为主报告的**原型起始色**，附录中的其他色盘属于探索候选。实现时映射到现有语义 token，不在组件里散落 hex。

| 角色                  | 深色起始值            | 浅色起始值            |
| --------------------- | --------------------- | --------------------- |
| 导航 / app chrome     | `#131313`             | `#F3F2EE`             |
| 主工作画布            | `#181817`             | `#FCFBF8`             |
| 临时浮层              | `#242422`             | `#FFFFFF`             |
| 正文                  | `#EEEDE9`             | `#242421`             |
| 次要正文              | `#AAA9A2`             | `#62625B`             |
| 仍需阅读的 metadata   | `#85847D`             | `#707068`             |
| 品牌填充 / 填充上的字 | `#E2B66D` / `#241A0B` | `#E2B66D` / `#241A0B` |
| 文字形式的品牌强调    | `#E2B66D`             | `#80551B`             |

已做静态不透明颜色的 WCAG 相对亮度计算：深色次要正文 / metadata 对画布约 7.54:1 / 4.73:1；浅色约 5.94:1 / 4.82:1；浅色品牌文字约 6.28:1；品牌填充按钮约 9.08:1。这里只证明这些指定色对的数值，不包含状态、透明混合、字体、焦点或全产品合规验证。[公式](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html#dfn-relative-luminance)。

现有 light `fg-muted #8A8A93` 在白底约 3.42:1、dark `#6B6B74` 在 `#0B0B0D` 约 3.73:1；若用于必要的小号信息，存在对比度风险，应在真实页面逐处确认。不能由 token 本身推断所有用法不合格。[当前 tokens](../../apps/desktop/renderer/src/styles.css)、[WCAG 文字对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。

品牌色与状态色各有角色：主动作可用琥珀，警告需要图标与明确文字，选中状态可用中性底色；绿色 / 红色主要表达成功和失败。不要把模型、来源、工具、运行、思考全部做成同等强度的彩色胶囊。状态不能只靠颜色区别。[Stripe Apps design](https://docs.stripe.com/stripe-apps/design)、[WCAG Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)。

### 5.2 空间与布局

| 区域              | 提案                                                                                | 仍需保持的能力                                               |
| ----------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 左栏              | 贴边的导航平面；项目 / session 用紧凑行、分组与稳定选中态。起始宽度比较 232–248px。 | 多项目切换、未读、运行、等待操作、长标题、拖拽调整。         |
| 中央              | 贯通工作画布；取消外层圆角、整圈边框和 `lift`，收紧外部空隙。                       | 自适应宽度、正文时间线、历史跳转、流式稳定、滚动位置。       |
| 右栏              | 按需 Inspector；无内容时不为占位而常开。内部用 section / row 组织。                 | 现有 Task Dock 的运行和异常摘要；用户固定打开的偏好。        |
| review / artifact | 根据用户主动打开的内容扩大到半宽或主工作面。                                        | 沿用现有 half/max，保留返回会话位置与输入草稿。              |
| 输入区            | 单一、轻量、边界明确的输入表面；附件、模式、模型、发送按主次排列。                  | Provider 仍是重要操作；权限范围、停止、排队 / 引导语义准确。 |
| 临时浮层          | 菜单、命令面板、Popover、Dialog 使用主要 elevation。                                | 键盘导航、焦点回归、点击外部关闭、Windows/macOS 差异。       |

**宽度约束：**不恢复全局 `max-w-3xl`。代码、diff、表格、图像和 artifact 应能利用可用宽度；纯长文章的行长可在真实内容中单独比较。小窗口优先保护当前工作面，基于现有最小中央宽度规则决定关闭或覆盖哪一侧，不把所有栏压到难以阅读。[当前用户反馈](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx)、[现有布局保护](../../apps/desktop/renderer/src/shell/Shell.tsx)。

### 5.3 什么值得做成卡片

**建议保留明确边界：**输入框、待审批决策、可选择方案、可打开的成果、独立任务摘要、预览缩略图。它们是可操作或可复核的对象。

**建议使用平面内容或行：**主布局分区、普通 Agent 正文、项目 / 会话列表、每一条工具微事件、常规设置项。使用留白、对齐和字重先建立关系，必要时才增加分隔和表面色。

这是基于任务组、列表与审阅模式的综合提案，不能当作“卡片越少越好”的通用结论。[Antigravity task groups](https://antigravity.google/docs/tools/)、[Raycast List](https://developers.raycast.com/api-reference/user-interface/list)、[Linear 结构原则](https://linear.app/now/behind-the-latest-design-refresh)。

### 5.4 执行过程：压缩细节，保留可控性

建议让同一轮工作呈现为连续结构：用户意图 → 阶段摘要 → 可展开执行轨迹 → 成果 / 审阅入口。相邻的搜索、读取和检查在视觉上归组；当前执行步骤、待输入、失败恢复始终能找到。已有 SDK 事件身份和历史关系继续是事实源，不能为新动画生成另一套会话状态。[PRD 原则](../PRD.md)、[ADR-010](../ADR/ADR-010-sdk-product-output.md)、[shadcn Trace patterns](https://ui.shadcn.com/docs/ai-elements)。

右侧任务详情与中央过程可以共享状态来源，但职责不同：中央解释当前工作的来龙去脉，右侧提供摘要和对象详情。完成后用可打开的 diff、报告、图表或文件表达产出，让用户能直接检查和继续修改。[Codex review](https://learn.chatgpt.com/docs/code-review)、[Antigravity artifacts](https://antigravity.google/docs/artifacts)。

### 5.5 字体、组件与动效

**字体提案：**保留现有 Geist / JetBrains Mono，明确中文系统 fallback；先比较 UI 13–14px、正文 14–15px、metadata 12px 的真实内容。中文与英文各校准行高，数字用稳定的等宽数字，避免状态变化时跳动。不要为了“高级感”把工作区做成大字号品牌海报。[现有字体依赖](../../apps/desktop/package.json)、[现有字体变量](../../apps/desktop/renderer/src/styles.css)。

**组件提案：**共享 token、图标线重、行高、按钮主次、焦点、菜单和状态表达。优先整理实际重复的 IconButton、菜单行、Popover、执行步骤、Composer 控件；达到项目要求的三个真实用例后再抽共享组件。`space-ui-kit` 当前只有 `cn()`，不能把“已有共享包”误认为“已有完成的组件库”。[UI kit](../../packages/space-ui-kit/src/index.ts)、[项目最小实现约束](../../AGENTS.md)。

**动效提案：**延续已有 150 / 260 / 380ms token，仅确有必要时增加语义分工；不要另开一套时间与 easing。品牌可以通过一次轻微的边缘提亮、状态接续、成果展开形成记忆。[现有 motion](../../apps/desktop/renderer/src/lib/motion.ts)。

| 场景                  | 推荐表现                                                       | 避免                                               |
| --------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| hover / press / focus | 短促颜色、透明度和清楚的焦点反馈。                             | 所有按钮都位移、扫光或弹跳。                       |
| 侧栏 / Inspector      | 用户操作后的短时空间过渡，保持对象位置关系。                   | 拖拽期间每次尺寸变化都播放 spring；正文持续重排。  |
| tool / task           | 当前步骤一个轻量活动标识；结束状态衔接；详情展开有节奏。       | 每个工具各自呼吸、光环、spinner 同时竞争。         |
| 流式正文              | 增量稳定排版，历史回填不重播入场；用户读旧消息时保留滚动位置。 | 每个 token 做渐入 / 变形；刷新把整屏文字重新入场。 |
| artifact              | 打开成果时清楚的工作面变化，返回后保留任务上下文。             | 随意自动抢走当前工作，或成果始终挤成缩略卡片。     |
| 空态 / 品牌           | 一个克制的局部视觉特征，进入工作后退场。                       | 长期位于文字后的 WebGL、粒子、噪点、极光。         |

对大面积玻璃的建议是收敛到临时浮层或少量 chrome，主内容保持稳定底色。当前 full 档中央有 `blur(24px)`，并已在流式、历史恢复和交互中降载；改版应继承这些保护，而非再叠动态背景。此处仅据代码判断成本路径，没有实测 GPU 或功耗。[styles.css:995–1025](../../apps/desktop/renderer/src/styles.css)、[Motion performance](https://motion.dev/docs/performance)。

保留 reduced-motion 路径；关闭装饰运动后仍要有文字状态、焦点和完成反馈。键盘、文字对比度和可见命中目标应作为视觉质量的一部分一起验证。[已有 motion hook](../../apps/desktop/renderer/src/lib/motion.ts)、[Motion accessibility](https://motion.dev/docs/react-accessibility)。

## 6. 先做哪些工作，才能验证这个方向

这是研究后的建议顺序，未开始实现。

1. **选真实内容作为比较基准。** 使用同一条任务，在浅 / 深色和常见窗口尺寸下比较；不能拿空态和满载界面比较美感。
2. **先改外壳与空间。** 只调整三栏容器、外间距、正文 gutter 与标题层级，保留组件行为。这样能判断“去卡片”本身的收益。
3. **再统一配色与基本组件。** 校准表面和文字色对、按钮、菜单、列表行、popover；不要同时更换 Markdown 引擎、字体与框架。
4. **打磨 Agent 独有状态。** 长执行流、待审批、输入、错误恢复、并行任务、成果与 review 的状态连续性。
5. **最后加入少量识别性动效。** 在长会话、系统缩放、reduced-motion 和较弱 GPU 下验证后再决定保留哪些效果。

优先复用现有主题 token、布局规则、半宽 / 全宽、focus、motion 与降载机制。当前 React 19 / Tailwind 3 / Electron 体系没有因“更好看”而必须整体迁移的已知理由。[依赖](../../apps/desktop/package.json)、[现有布局](../../apps/desktop/renderer/src/shell/Shell.tsx)、[视觉质量档位](../../apps/desktop/renderer/src/lib/visualQuality.ts)。

## 7. 验收应覆盖的真实画面

以下是后续视觉验证清单，**本轮未执行**：

| 画面 / 流程                                  | 希望证明什么                                         |
| -------------------------------------------- | ---------------------------------------------------- |
| 首次打开项目、空任务                         | 主入口清楚、无无意义空面板，不靠大宣传标题撑布局。   |
| 中英混排的长会话 + 代码 / 表格               | 主内容舒适，宽内容能扩展，路径和行号不被过度截断。   |
| 连续 30+ 工具步骤                            | 有阶段、有当前状态，完成记录能安静地留在背景。       |
| 并行任务与未读                               | 列表仍好扫，状态变化不改变行高或打乱当前焦点。       |
| 待审批 / 等待回答 / 失败恢复                 | 一眼能看到需要做的决定，动作目标和授权范围清楚。     |
| 大 diff / 报告 / 图表审阅                    | 工作面够用，范围清楚，来回切换不丢草稿和滚动位置。   |
| 1024、1280、1440、1920 宽与 125% / 150% 缩放 | 层级和控件仍完整；小窗口有合理优先级，宽屏有效利用。 |
| 明暗主题、键盘、reduced-motion               | 同一套组件都成立，关闭运动后仍可理解状态。           |

## 8. 未证实与未解问题

- 没有“全球最好看”的统一可验证排名；本报告选择的是适合 Space 定位的审美与交互方向，不宣称全球比较已经完成。
- 去卡片可回收多少空间可静态推算，但是否更舒适、更快找到信息，需要相同真实任务的原型比较。
- 当前生产界面的逐屏视觉效果、实际对比度、键盘可用性、渲染性能和功耗未完成本轮实测。
- 明暗主题谁先作为默认、琥珀的饱和度、中文排版大小，仍需同等内容原型校准。用户已有的主题偏好不应被直接重置。
- Task Dock 的常驻监控价值与按需 Inspector 的简洁之间如何平衡，需要分别看 Coder 与 Partner 的真实使用频率；“按需”不应让长任务变得不可见。
- 右侧 half / max、focus、自适应宽度已经存在；后续要决定何时显露、何时保留用户选择，不是新增同名功能。
- 哪些动效最有品牌记忆，只能在实际运行中验证；不能由组件库 demo 的流畅推断 Electron 长会话同样流畅。

## 9. 配套研究

- [Agent UI 交互模式：官方资料与源码对照](agent-ui-patterns-2026-10-16.md)。
- [统一视觉系统、参考库与动效取舍](agent-design-systems-motion-2026-10-16.md)。

这三篇文档保留了事实依据、设计判断与待验证部分；后续设计稿和实现只需引用研究，不应将提案误记成已发布能力。

## 10. 根据预览反馈补充：多项目并行、设置与可见动效

### 保留项目 → 会话层级，并让并行状态可扫读

用户明确要求多个项目同时工作。现有 Space 已实现按项目分组的会话树、项目级加载、运行 / 等待状态与未读，不应为了减少视觉元素而退回只有一个项目的会话列表。首轮 HTML 样稿省略了这项既有能力，应修正样稿而不是削减产品能力。[当前 LeftSidebar.tsx](../../apps/desktop/renderer/src/shell/LeftSidebar.tsx)。

设计提案：左侧常驻多个具名项目；每个项目可折叠，内部是紧凑会话行；项目折叠时仍显示运行和待处理数量。当前会话只占一个选中态；其他项目的运行、待输入、未读各自可见。跨项目切换保留草稿与运行状态，不能把导航切换表现成取消其他任务。全局摘要只聚合需要关注的状态，不另造重复的任务卡片。

OpenAI 官方文档把项目与其相关 chats、文件和上下文作为组织层级，并支持固定项目 / chat、归档及独立任务。这支持借鉴它的层级和组织方式，不能据文档断言本轮已实测 Codex 原生界面的所有像素和行为。[官方 Projects and chats](https://learn.chatgpt.com/docs/projects#organize-projects-and-chats)。

### 设置成为完整工作面

当前 Space 的 `SettingsModal` 使用全屏遮罩、背景模糊和居中的 `glass lift` 容器，内部已有偏好、服务提供商、运行时、扩展、授权、诊断六类。功能复杂度已接近独立设置工作区；用完整页面承载能减少容器层级，并给长表单和分类导航更稳定的位置。[SettingsModal.tsx:77–139、198–211](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx)。

设计提案：左侧设置分类、右侧统一设置行；保留原有类别，常规与外观作为偏好内的子页。明确设置范围是此设备，避免与当前项目的会话上下文混淆。主题即时预览；凭据、运行时等配置不冒充已写入；进入设置再返回应保留项目、会话、滚动位置和输入草稿。危险确认仍可使用短暂对话框，完整设置本身无需铺在工作区之上的大浮层。

OpenAI 当前设置文档明确区分 General、Appearance 等类别，外观包含 Light / Dark / System 及 UI / code 字体；文档已合并展示 ChatGPT 桌面与 Codex 相关内容。本提案借鉴分类和层级，不把这份文档当作“Codex 设置一定采用某个精确几何布局”的证据。[官方 Settings](https://learn.chatgpt.com/docs/app/settings#appearance)。

### 布局对照不等于主题选项

A/B/C 只用于本轮比较工作区结构。正式产品建议采用选定布局，继续保留浅色、深色、跟随系统。不同主题使用同一套组件结构和状态语义。预览入口将「布局对照」和「深浅主题」分组标注，组件与设置独立成为可直接访问的演示页。

### 把动效落在可体验的状态变化

新增组件页用单次模拟工作流呈现读取 → 归组工具过程 → 等待人工确认 → 成果出现 → 打开审阅；审批停留等待用户操作。按钮的主次 / loading / disabled、命令搜索、上下文菜单、列表选中、步骤展开及减少动态效果均可实际操作。所有任务和配置均为本地样稿数据，没有调用模型或修改真实配置。

本轮实际在内置浏览器发现约 796px 的预览宽度下，旧样稿的右侧详情默认遮挡正文与主题按钮。样稿已改为窄窗口默认收起详情；后续验收必须覆盖真实侧面浏览器宽度，不能只检查 1280px 以上的截图。
