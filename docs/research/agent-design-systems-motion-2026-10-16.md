# KodaX Space 如何统一主题、颜色、组件和动效，同时成为适合长时间使用的 Agent 工作台？

结论摘要（设计推断）：最有价值的方向是「完整内容画布 + 安静的导航与检查器 + 统一执行轨迹」，先减少容器、颜色和常驻动画的竞争，再补有语义的精致反馈；以 Linear 的内容层级、Raycast 的操作一致性、shadcn 的 Agent patterns 为主要参考，Refero 与 React Bits 用于探索气质和局部表现。[Linear 2026 refresh](https://linear.app/now/behind-the-latest-design-refresh)、[Raycast Action Panel](https://developers.raycast.com/api-reference/user-interface/action-panel)、[shadcn AI Elements](https://ui.shadcn.com/docs/ai-elements)。

调研日期：2026-10-16（Asia/Shanghai）。本笔记只将官方文档、官方源码和规范作为事实依据；「设计推断」是给 KodaX 的提案，不代表被引用产品已经采用该方案，也不代表审美存在客观全球排名。

## 1. 现有项目已经具备什么

以下是源码事实，未据此声称当前所有页面在视觉上都已一致：

| 源码事实                                                                                                                    | 一手依据                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Desktop 使用 React 19.2.7、Tailwind 3.4.16、Vite 6，并已有 Geist、JetBrains Mono 和 Lucide。                                | `apps/desktop/package.json:14`、`:15`、`:30`、`:40`、`:61`、`:62`                         |
| CSS 已有 base/raised/inset/float 表面、四档文字、边框、强调色和六类状态色的明暗主题。不是缺少颜色变量。                     | `apps/desktop/renderer/src/styles.css:39`、`:124`                                         |
| 正文字号初始值为 13.5px；已有统一 UI 与 mono 字体变量。                                                                     | `apps/desktop/renderer/src/styles.css:20`、`:105`                                         |
| Motion 已集中定义 150/260/380ms、三个 easing、24ms stagger 和封顶数量。                                                     | `apps/desktop/renderer/src/lib/motion.ts:15`、`:27`、`:35`、`:37`                         |
| 已有订阅系统 reduced motion 的 hook 和 CSS 兜底，也有 q-minimal 降级。                                                      | `apps/desktop/renderer/src/lib/motion.ts:69`；`apps/desktop/renderer/src/styles.css:1865` |
| 共享 `space-ui-kit` 的包描述写有 Tailwind/shadcn-derived，但当前唯一源码文件只导出 `cn()`；不能将其视作已有完整共享组件库。 | `packages/space-ui-kit/package.json:4`；`packages/space-ui-kit/src/index.ts:1`、`:10`     |
| 当前 CSS 确实包含背景 aurora 循环、侧栏 awaiting 呼吸、skeleton shimmer、液面波动、token 轨道等多种动画。                   | `apps/desktop/renderer/src/styles.css:1097`、`:1344`、`:1387`、`:1597`、`:1748`           |

**设计推断：**优先工作应是统一这些既有系统的使用规则与层级，而不是一次性换字体、换 CSS 框架、安装多个动画库。共享组件应从真实重复的导航行、图标按钮、执行步骤、popover 等提取，不能为了“设计系统”先造完整框架。依据：上表的现有能力与项目 `AGENTS.md` 的 YAGNI/三例后抽象约束。

**源码计算提示：**浅色 `--fg-muted` 的 `#8A8A93` 对 `#FFFFFF` 为约 3.42:1；深色 `#6B6B74` 对 `#0B0B0D` 为约 3.73:1。若必要的小号信息使用这两组实色配对，会有对比度风险；这不是对所有实际页面的截图测量，也不是全产品合规结论。来源：`styles.css:39`、`:47`、`:124`、`:131`；[WCAG 普通文本 4.5:1 与计算公式](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。

## 2. Refero：适合找气质，不能直接当产品规范

**事实：**Refero Styles 首页提供 2,000+ AI-readable DESIGN.md，包含颜色、排版、间距和组件；其入口提示包括 Warm indie SaaS、Linear but warmer、Film grain & photos、Everything rounded 等。[Refero Styles 首页](https://styles.refero.design/)。

**边界：**这些是 Refero 对官网风格的整理，属于 Refero 自身策展内容的一手来源，不是 Cursor、Raycast 等产品发布的设计系统。只能据此说明“Refero 怎么描述这个风格”，不能据此断言目标产品内部的真实 token、字体授权或产品布局。[Refero Cursor 条目](https://styles.refero.design/style/4e3b4717-84c8-4599-baaf-a343c3d619b6)、[Refero Raycast 条目](https://styles.refero.design/style/3b6a17f0-3bdf-418c-a95e-0b89e5a8b2f8)。

**设计推断：**值得探索三个不同的气质，而不是把三个网站的控件各拼一块：

| 探索气质   | 应转译到工作台的特征                                        | 适合留在官网或空态的部分                          | 依据                                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 暖灰工作室 | 低饱和暖灰、纸感但不加噪点、小幅强调、文本优先。            | 巨幅 editorial 标题、每屏几十像素的 section gap。 | [Refero 首页风格入口](https://styles.refero.design/)、[Linear 暖灰调整](https://linear.app/now/behind-the-latest-design-refresh#the-tools-that-helped-us-move-faster)                                        |
| 石墨工程台 | 中性深灰、低反差 shell、高反差正文、紧凑操作、mono 元数据。 | 全屏红蓝辉光、聚光灯追踪、厚重发光卡片。          | [Raycast 官方交互模型](https://developers.raycast.com/api-reference/user-interface)、[Linear 内容优先](https://linear.app/now/behind-the-latest-design-refresh#dont-compete-for-attention-you-havent-earned) |
| 清晰编辑台 | 亮色连续画布、稳定分栏、精细对齐、克制品牌点色。            | Marketing hero 的大面积渐变与滚动叙事。           | [Stripe Apps 一致性与品牌使用](https://docs.stripe.com/stripe-apps/design#brand-expression-and-custom-styling)、[Linear 层级与布局](https://linear.app/now/how-we-redesigned-the-linear-ui)                  |

**未证实：**Refero 个别条目出现 `#26251` 这样的疑似无效 hex，且有大量提取出的具体数值；本轮未校验其所有数值，不将这些 token 当生产输入。定位：上述 Cursor 条目的 Primary Filled Button 等内容。

## 3. 长时间工具应向哪些官方设计经验学习

### Linear：内容是主角，结构退到背景

**事实：**Linear 2026-03-12 的官方说明明确将侧栏降低亮度以突出主内容，缩小部分 tabs/icons，减少无理由的分隔线，并将默认色盘从偏冷蓝调整为低饱和暖灰。[Linear 2026 refresh，What changed / Tools](https://linear.app/now/behind-the-latest-design-refresh)。

**事实：**其 2024 redesign 使用 LCH，以 base、accent、contrast 三个输入生成主题；将 sidebar、tabs、app header、view header 的行为定义作为里程碑，并覆盖多种视图进行压力测试。[Linear 2024 redesign，Appearance / Hierarchy / Milestones](https://linear.app/now/how-we-redesigned-the-linear-ui)。

**设计推断：**KodaX 左、中、右不应拥有同样强的卡片边界和阴影。中央让连续画布占据工作区，左侧作为导航底层，右侧作为按需检查器；只有浮层、输入框、独立 artifact/审批对象需要明显边界。去卡片的价值在于层级和连续性；按内容类型自适应宽度，不恢复全局固定 max-width。当前源码已记录用户对 `max-w-3xl` 宽屏留白过多的反馈并主动取消限宽，代码、表格和 artifact 应保留全宽能力。依据：[Linear 2026 内容与结构原则](https://linear.app/now/behind-the-latest-design-refresh#structure-should-be-felt-not-seen)；`apps/desktop/renderer/src/shell/ConversationStreamV2.tsx:2182`。

**设计推断：**现在无需复制 Linear 的主题生成引擎；先手工校准一套浅色、一套深色和必要的语义 token。若未来确实支持任意用户基色，再评估生成系统。依据：既有源码已有两套明暗 token；[Linear 的主题生成属于其具体产品需求](https://linear.app/now/how-we-redesigned-the-linear-ui)。

### Raycast：统一操作模型比装饰更有辨识度

**事实：**Raycast 使用 React 描述 UI，但渲染为其原生支持的组件；List 是主要界面，支持右侧 Detail；各组件通过 ActionPanel 暴露上下文操作，动作可分语义组并配快捷键。[Raycast UI](https://developers.raycast.com/api-reference/user-interface)、[List](https://developers.raycast.com/api-reference/user-interface/list)、[ActionPanel](https://developers.raycast.com/api-reference/user-interface/action-panel)。

**事实：**其 ActionPanel 的前两个动作自动映射主/次操作快捷键，List/Grid/Detail 的默认主操作为 Enter，次操作为 Command+Enter。[ActionPanel API](https://developers.raycast.com/api-reference/user-interface/action-panel)。

**设计推断：**KodaX 应统一每个 session、file、tool、artifact 的“主动作 / 次动作 / 更多动作”；让 hover、右键、键盘与工具条找到同一组动作。可借鉴一致性，不能直接照搬 macOS 快捷键到 Windows，也不需要引入 Raycast 的原生 UI 技术。依据：[Raycast 的集中动作模型](https://www.raycast.com/blog/how-raycast-api-extensions-work)。

### Stripe：品牌表达应有明确位置

**事实：**Stripe Apps 限制控件自定义颜色来维持平台一致性和对比度，允许用顶部 app indicator 的颜色与图标表达品牌，并提供组件组合 patterns。[Stripe Apps design，Custom styling / Branding / Components and patterns](https://docs.stripe.com/stripe-apps/design)。

**设计推断：**KodaX 的琥珀品牌色可保留在主操作、当前选择、少量身份标识；状态色用于结果语义，不应把“正在运行”“思考中”“来源类型”“链接”“品牌”都做成同等强度的彩色标签。强调色的数量不需要跟 Agent 能力的数量一起增长。依据：[Stripe 的品牌与系统色边界](https://docs.stripe.com/stripe-apps/design#brand-expression-and-custom-styling)；现有 `styles.css:58`、`:66`、`:74`。

## 4. 组件与动画库：各自真正解决什么

| 来源                                | 已核实的用途与技术                                                                                                                                                                                                                             | 许可事实                                                                                                                                                                                                                                | 对 KodaX 的设计推断                                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animate UI                          | React、TypeScript、Tailwind、Motion 的动画组件分发；有 Radix、Base UI、Headless UI 分组；通过 shadcn CLI 将组件加进项目。                                                                                                                      | MIT。[官方仓库](https://github.com/imskyleen/animate-ui)、[LICENSE](https://github.com/imskyleen/animate-ui/blob/main/LICENSE.md)、[安装](https://animate-ui.com/docs/installation)。                                                   | 挑 Tooltip、Tabs、Popover、Collapse、Copy button 等少数组件研究其反馈；不把所有控件都弹跳化。[组件目录](https://animate-ui.com/docs/components)。 |
| React Bits 免费库                   | 以文字、背景、3D、交互效果为主，提供 JS/TS 与 CSS/Tailwind 变体。                                                                                                                                                                              | 当前为 MIT + Commons Clause，允许集成到应用/网站，限制组件本身的转售、再分发或移植库；不能简称纯 MIT。[官方 README](https://github.com/DavidHDev/react-bits)、[LICENSE](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)。 | 适合品牌空态或 welcome 的单一局部；长期对话正文不采用文字解密、粒子、拖影光标。                                                                   |
| React Bits Pro                      | 付费 React 动画组件、marketing blocks、application UI、templates 与 Agent Kit；支持 CSS/Tailwind，CLI 需要 license key 和 registry。[介绍](https://pro.reactbits.dev/docs/introduction)、[安装](https://pro.reactbits.dev/docs/installation)。 | 2026-09-11 版本协议按开发者席位授权；2.4 禁止将 Product 的实质部分公开到开源仓库；不能把“可商用”理解为可随意公开源码。[协议 §2.1–2.4](https://pro.reactbits.dev/license#2-license-grant)。                                              | 本轮可看预览和比较气质；不要将付费代码复制进仓库。其 WebGL、背景、cursor effects 不能证明在当前 Electron 工作流中无性能成本。                     |
| Motion                              | 提供动画与 reduced-motion API；性能取决于动画属性，transform/opacity 通常成本较低。[性能指南](https://motion.dev/docs/performance)、[无障碍](https://motion.dev/docs/react-accessibility)。                                                    | MIT。[LICENSE](https://raw.githubusercontent.com/motiondivision/motion/main/LICENSE.md)。                                                                                                                                               | CSS 已能覆盖的反馈继续用 CSS；真实需要跨元素布局过渡、presence 时再按需引入，避免为整个视觉刷新换动画栈。                                         |
| Radix Primitives                    | 处理 ARIA、焦点、键盘导航等交互基础，开发者仍需提供正确 label。[官方无障碍说明](https://www.radix-ui.com/primitives/docs/overview/accessibility)。                                                                                             | MIT。[LICENSE](https://raw.githubusercontent.com/radix-ui/primitives/main/LICENSE)。                                                                                                                                                    | 可作为 Dialog/Menu/Popover 等复杂行为的一个候选，不是视觉主题。                                                                                   |
| Base UI                             | 无样式 React primitives，可用 CSS、Tailwind 等；组件可组合，tree-shakable，支持 React 17+、Vite。[About](https://base-ui.com/react/overview/about)、[Quick start](https://base-ui.com/react/overview/quick-start)。                            | MIT。[LICENSE](https://raw.githubusercontent.com/mui/base-ui/master/LICENSE)。                                                                                                                                                          | 与 Radix 二选一做试点即可；不要同时增加两套弹层、焦点和 Portal 体系。                                                                             |
| shadcn/ui                           | 使用语义背景/前景配对、CSS variables；主题与 radius 有统一规则。[Theming](https://ui.shadcn.com/docs/theming#token-convention)。                                                                                                               | MIT。[LICENSE](https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md)。                                                                                                                                                        | 学其源码归项目、统一 token 的方法；不必接受默认视觉，也不必在本轮升级 Tailwind 3→4。                                                              |
| AI Elements / shadcn Agent patterns | 当前 shadcn 文档将 Chat、Reasoning、Tool、Plan 等作为组件组合 patterns；执行步骤共用 Trace，代码复制进项目，不另装 AI Elements 包。[现行 patterns](https://ui.shadcn.com/docs/ai-elements)。                                                   | 旧 Vercel AI Elements 源码 LICENSE 为 Apache-2.0；现行 shadcn 源码按其仓库许可及具体文件核对。[旧 LICENSE](https://raw.githubusercontent.com/vercel/ai-elements/main/LICENSE)。                                                         | 最值得借鉴的是统一“执行步骤形状”和展开层级，沿用 KodaX 的事件/IPC 数据，不为外观迁移整个 Agent SDK。                                              |
| Streamdown                          | 专门处理 AI streaming 的未闭合 Markdown；有代码、Mermaid、math、CJK 插件和 react-markdown 迁移文档。[官方介绍](https://streamdown.ai/docs)、[迁移](https://streamdown.ai/docs/migrate)。                                                       | Apache-2.0。[LICENSE](https://raw.githubusercontent.com/vercel/streamdown/main/LICENSE)。                                                                                                                                               | 在相同长中文/代码/表格样本上比对稳定性和成本；若现有 renderer 无相应问题，视觉刷新不应强制替换 Markdown。                                         |

**时效事实：**旧 AI Elements 官网公告其将迁往 shadcn/ui，并于 2026 年 11 月末 deprecated；现行 shadcn 文档表示已复制到项目的旧组件仍可继续运行。[旧站公告](https://elements.ai-sdk.dev/)、[现行迁移说明](https://ui.shadcn.com/docs/ai-elements#migrating-from-ai-sdk-elements)。

**未证实：**本轮没有执行这些库在当前 KodaX 构建中的安装、bundle 分析或性能测试；“60fps”“audited”等供应方宣传不等于 KodaX 实测。具体组件依赖、Tailwind 3 兼容和许可证须在选中少量候选后按文件锁定版本核对。[React Bits Pro 自述](https://pro.reactbits.dev/docs/introduction)；当前构建依据 `apps/desktop/package.json`。

## 5. 统一视觉系统的最小设计提案

本节全部为设计推断，数值用于下一轮原型比较，尚未应用到生产代码。

### 5.1 先定义表面角色，再给颜色

| 角色         | 推荐表现                                                                                                                        | 依据                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 应用 shell   | 贯通的低对比背景，容纳窗口控件与导航。                                                                                          | [Linear 背景层级](https://linear.app/now/how-we-redesigned-the-linear-ui)                                                       |
| 中央工作画布 | 不加外围 card 的完整平面；不恢复全局固定 max-width，按内容类型自适应，代码/表格/artifact 保留全宽；仅长文章阅读列作为后续比较。 | [Linear 主内容优先](https://linear.app/now/behind-the-latest-design-refresh)；本项目 `ConversationStreamV2.tsx:2182` 的限宽反馈 |
| 左侧导航     | 分组、行、选中态构成层级；取消逐组外框和多余阴影。                                                                              | [Linear 侧栏调整](https://linear.app/now/behind-the-latest-design-refresh#dont-compete-for-attention-you-havent-earned)         |
| 右侧检查器   | 与选中对象相关，可关闭；内部用 section 而非 card 套 card。                                                                      | [Raycast List + Detail](https://developers.raycast.com/api-reference/user-interface/list)                                       |
| 输入区       | 一个明确但轻量的输入表面；附件、模型、模式和发送按钮按主次排布。                                                                | [shadcn Prompt Input pattern](https://ui.shadcn.com/docs/ai-elements)                                                           |
| Agent 执行流 | 一条统一轨迹；步骤默认紧凑，展开后才显示参数、日志、diff。                                                                      | [shadcn Trace / Tool / Plan](https://ui.shadcn.com/docs/ai-elements)                                                            |
| 临时浮层     | Menu/Popover/Dialog 才拥有主要 elevation。                                                                                      | [Base UI 的 Portal 与 layering](https://base-ui.com/react/overview/quick-start#portals)                                         |

### 5.2 颜色以成对语义 token 管理

**事实依据：**shadcn 使用 background/foreground 配对；Radix 色阶按页面背景、交互背景、边框、强调填充、文字等不同用途划分；DTCG 支持带类型的 token 和 alias，2025.10 是 Community Group 规范，不是 W3C Standard。[shadcn Token Convention](https://ui.shadcn.com/docs/theming#token-convention)、[Radix scale 用途](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)、[DTCG 2025.10 §3.8 / Status](https://www.designtokens.org/tr/2025.10/format/)。

**提案：**沿用现有 token 名，并补齐真正缺失的配对和用途约束，而非组件直接使用新 hex。Token 层级只需“基础色值 → 表面/文字/状态角色 → 个别确有差异的组件角色”；浅色和深色保持同一组件结构。依据：上述规范和已有 `styles.css:39–179`。

以下是探索候选（非主报告最终建议）。主报告方向为同一视觉系统下的石墨深灰与纸白两主题，保留琥珀品牌色；此表仅用于说明前景/背景配对与计算方法。

| 探索候选角色      | 暖浅色候选 | 深色候选  |
| ----------------- | ---------- | --------- |
| shell             | `#EFEFEB`  | `#121412` |
| canvas            | `#F7F7F2`  | `#171917` |
| overlay           | `#FFFFFF`  | `#20231F` |
| primary text      | `#22231F`  | `#EEF0E8` |
| secondary text    | `#64675E`  | `#ACB2A4` |
| accent ink / fill | `#985F18`  | `#D6B078` |
| accent foreground | `#FFFFFF`  | `#282015` |

**计算结果（不是完整无障碍验收）：**按 WCAG sRGB 相对亮度公式，以上浅色正文/画布为 14.71:1、次级文字为 5.36:1、强调色文字为 4.90:1；深色正文为 15.38:1、次级文字为 8.13:1；浅色实心按钮白字为 5.27:1、深色实心按钮文字为 7.91:1。未包含透明混合、hover、disabled、selection、chart、diff 与实际字体。公式依据：[WCAG contrast / relative luminance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html#dfn-relative-luminance)。

### 5.3 尺寸和字体：增加秩序，不靠小字挤出密度

**提案：**保留现有 Geist/JetBrains Mono；原型比较正文 14/15px、UI 13/14px、metadata 12px；中文正文单独校准行高。正文、代码、侧栏、控件分别有稳定的密度，不能全局一起缩小。圆角按角色控制：行/紧凑按钮 5–6px、输入/弹层 10–12px、主要对话输入 14–16px；应用外壳与主画布不套同等级圆角。依据：`apps/desktop/package.json:14–15`、[Linear 对齐、密度与跨视图验证](https://linear.app/now/how-we-redesigned-the-linear-ui)。

**提案：**首先做一个默认密度，在 1280/1440/1920 宽度与系统缩放下验证；没有真实需求前不增加多套 density 设置。侧栏宽度和 inspector 开关属于布局能力，不是靠卡片 padding 隐式决定。依据：项目 `AGENTS.md` 的最小实现原则与 [Linear 的 view stress tests](https://linear.app/now/how-we-redesigned-the-linear-ui)。

### 5.4 动效表达状态变化，不作为常驻背景

| 动效用途                  | 提案                                                                     | 依据                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| hover / focus / press     | 约 120–150ms，颜色或轻微 opacity；点击行为立即发生。                     | 现有 `motion.ts:27`；[Motion performance](https://motion.dev/docs/performance)                                  |
| popover / 菜单            | 约 150–200ms，小幅位移与透明度；不对内部文字单独 stagger。               | [Animate UI 组件与 reduced motion](https://animate-ui.com/docs/accessibility)                                   |
| inspector 开关 / 布局切换 | 约 220–280ms；只在用户发起的结构变化时使用。                             | 现有 `motion.ts:27`；[Motion layout 与 reduced motion](https://motion.dev/docs/react-accessibility)             |
| 新消息 / 工具结果         | 轻量单次出现，历史回填不逐条表演；自动滚动跟随不抢走读旧消息的位置。     | [shadcn Message Scroller pattern](https://ui.shadcn.com/docs/ai-elements)、现有 `motion.ts:37`                  |
| 正在运行                  | 一个可识别的状态标记即可；相邻多项后台任务避免每项同时发光、呼吸、旋转。 | [Linear 视觉权重原则](https://linear.app/now/behind-the-latest-design-refresh)、现有 `styles.css:1283`、`:1344` |
| 品牌时刻                  | welcome / 首次进入可有一次精致动效；正文、文件树和背景保持稳定。         | [Motion 无障碍建议](https://motion.dev/docs/react-accessibility#automatic)                                      |

**事实：**Motion 的 `reducedMotion="user"` 会停用 transform/layout 动画而保留 opacity/backgroundColor；Animate UI 官方也推荐在根部设置它。已有 CSS 动画不受 MotionConfig 自动控制，仍需原本 CSS/hook 的兜底。[Motion](https://motion.dev/docs/react-accessibility#automatic)、[Animate UI](https://animate-ui.com/docs/accessibility#animate-ui--motion)、`apps/desktop/renderer/src/lib/motion.ts:69`。

**事实：**官方性能指南强调优先选择动画属性；transform/opacity 通常较便宜，CSS 自定义属性的动画本身并不自动硬件加速。[Motion performance，CSS variables / Conclusion](https://motion.dev/docs/performance)。

## 6. 可验收的底线

| 验收点     | 规范事实 / 对 KodaX 的推断                                                                                                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文字对比度 | WCAG AA：普通文本至少 4.5:1，大文本至少 3:1；placeholder/hover 文本也在范围内。提案：真实主题的每个常用角色逐对检查，不能把必要信息都降到 faint。[SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html#success-criterion)                                                                       |
| 控件与状态 | 辨识控件/状态所需的非文本部分通常需 3:1 对比，规范有范围和例外；不是所有装饰边框都必须高反差。提案：低对比卡片线条可以删除，focus 与必要状态不能一起弱化。[SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#success-criterion)                                                            |
| 点击目标   | WCAG 2.2 AA 的最小目标为 24×24 CSS px，含间距、inline 等例外。提案：图标看起来可以小，hit area 保留，避免为密度牺牲操作可靠性。[SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html#success-criterion)                                                                                      |
| 键盘与焦点 | Modal 应管理进入/退出焦点、Tab 循环及 Escape；Dialog/Menu/Popover 使用经过验证的 primitive 仍须校验组合后的行为。[WAI APG Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/#keyboard-interaction)、[Radix labels 责任](https://www.radix-ui.com/primitives/docs/overview/accessibility#accessible-labels) |
| 动效       | reduced motion 下保留状态信息，移除大范围运动和持续装饰循环。提案：在当前 q-minimal 与系统设置下分别走完整任务。[Animate UI reduced motion](https://animate-ui.com/docs/accessibility#prefers-reduced-motion)                                                                                                          |
| 真实性能   | 本轮未跑 benchmark。提案：用长中文对话、流式代码、工具批量完成、并行 session、Markdown 表格和 resize 等真实负载验收，不能拿组件官网的轻量 demo 代替。依据：[Motion 对设备与实际属性的测试建议](https://motion.dev/docs/performance#conclusion)。                                                                       |

## 7. 最小集成路线（设计推断）

1. **先验证布局。**同样的真实 session 内容，比较当前三张卡片与连续主画布；同时比较 inspector 打开/关闭。先决定信息层级，不先堆视觉效果。依据：[Linear 压力测试](https://linear.app/now/how-we-redesigned-the-linear-ui)。
2. **统一 foundation。**收敛现有 CSS 表面、文字、边框、accent/status 与 motion 用法；保留现有 React 19/Tailwind 3/字体/图标。依据：本仓库 `styles.css`、`motion.ts`、`package.json`。
3. **先做 8–10 个高频原语。**建议从 IconButton、NavigationRow、Status、SectionHeader、Tabs、Menu/Popover、Dialog、Input/Composer、TraceStep 入手；仅将 3+ 真实重复部分放入共享包。依据：现有 `space-ui-kit/src/index.ts` 与 `AGENTS.md`；[shadcn Trace patterns](https://ui.shadcn.com/docs/ai-elements)。
4. **选一个交互 primitive 体系试点。**针对复杂弹层，在 Radix/Base UI 中选一个，以真实键盘操作、Portal/z-index、焦点恢复和现有布局兼容作为判断，不以 demo 漂亮程度决定。依据：[Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility)、[Base UI setup](https://base-ui.com/react/overview/quick-start)。
5. **再统一执行流。**复用既有 Agent 事件与 IPC，集中整理步骤状态、展开/折叠、参数/结果、错误、审批与 artifact；先构图和展示模型，不同时改后端协议。依据：[shadcn AI patterns 的组合结构](https://ui.shadcn.com/docs/ai-elements)。
6. **最后选局部动画。**如纯 CSS 已达到目标则继续用 CSS；确有复杂 presence/layout 才引 Motion；Animate UI 一次只引所需组件；React Bits 只在明确的品牌场景选择。依据：[Animate UI installation](https://animate-ui.com/docs/installation)、[Motion performance](https://motion.dev/docs/performance)。
7. **锁定真实验收矩阵。**至少覆盖浅/深色、中文/英文、长会话、代码/diff、窄窗、系统缩放、键盘、reduced-motion、加载/失败/等待输入；依照已有项目测试纪律补必要行为测试和人工指南。依据：本仓库 `AGENTS.md`；[Linear 跨视图测试](https://linear.app/now/how-we-redesigned-the-linear-ui)。

## 未证实

- 没有可靠一手来源能证明哪一个 UI 是“全球最好看”；这是目标，不是可核实事实。需让真实用户在长时间任务中比较原型。
- Refero 的逐项颜色、字体、间距提取未逐一校验；本笔记没有把它们视为官方产品规范。
- React Bits Pro 的付费源码、所有组件依赖、每个 effect 的 reduced-motion 行为与当前构建兼容均未检查；本轮仅阅读公开官方页面，没有复制付费源码。
- 不将 React Bits Pro 的性能宣传、Radix/Base UI 的无障碍目标等同于集成后的自动合格；最终组合需要本地验证。
- 本轮没有认定现有所有动画都应删除，源码清单只是需要按任务语义重新分配预算的证据。

## 未解问题

1. 三个气质方向中，哪个最符合 KodaX 要表达的性格：温暖、锋利、清晰，还是介于其中？需要同内容高保真稿比较，不能仅凭色盘决定。
2. 主要用户在 1280/1440/4K + 缩放下的分布、平均会话长度、同时打开 inspector 的比例，是否支持当前默认三栏？缺少产品使用数据。
3. 品牌琥珀色是否必须保留？可以保留为身份色，但其文字/实心按钮在浅深模式应有不同明度。
4. 当前 Markdown streaming 是否存在可复现的重排、代码不完整或性能问题？没有证据前不决定迁移到 Streamdown。
5. 共享组件究竟放 `space-ui-kit` 还是先留 renderer？需要清点真实 3+ 重复实例与 Partner 的实际共享边界。
6. 本仓库后续是否公开分发源代码？这直接影响 React Bits Pro 的可集成范围；即使购买许可证，也不能据此推定公开付费源码的权限。
