# KodaX 能否保留漂亮的玻璃质感，并把动效做得更有辨识度？

结论摘要（设计建议）：可以。保留连续正文画布，把玻璃集中在输入框、命令面板和局部操作面；以移动的选中底板、边缘受光、一次性的完成光扫建立辨识度。上一轮样稿主要实现了基础状态反馈，尚未充分呈现这种材质和动效。本笔记依据下列源码与官方页面，未进行 GPU、功耗或帧率实测。

调研日期：2026-10-16（Asia/Shanghai）。本轮只读官方文档、官方公开源码和仓库文件；以下“建议”是设计判断，不表示相应库已安装，也不表示供应方效果在 KodaX 上已通过性能验收。

## 1. 上一轮实际参考与实现到哪里

- **调研记录事实：**旧报告对 Animate UI 只选出了 Tooltip、Tabs、Popover、Collapse、Copy button 等类别，React Bits 用于探索品牌局部，Pro 只看公开页面；其动效规范重点是 120–150ms 按压/悬停、150–200ms 菜单、220–280ms 布局、减少动态效果。记录没有证明已选定并实现 Glass Surface、Border Glow 或液体背景。依据：`docs/research/agent-design-systems-motion-2026-10-16.md:71`、`:73`、`:131`、`:167`。
- **样稿源码事实（本次修订前）：**组件页已有 7px 位移淡入、菜单 4px 位移、对话框 9px 位移和轻微缩放、spinner、状态 pulse，以及分段控件的移动 indicator；普通动效示例的导航则只是背景颜色过渡。它不能代表已经实现 Animate UI 完整的共享布局动画或 React Bits 的光学效果。依据：`docs/design/space-ui-exploration/components.html:658`、`:690`、`:879`、`:1150`。父任务正在继续修改此样稿，因此这些行号记录的是调研起点。
- **玻璃没有从正式产品删除：**生产 CSS 当前有 q-minimal / q-balanced / q-full 三档；balanced 使用 18px blur，full 使用 24px blur，minimal 实色化；另有 1px 渐变描边和靠近光标时显示的 specular 高光。依据：`apps/desktop/renderer/src/styles.css:571`、`:593`、`:600`、`:635`、`:650`、`:682`、`:949`。
- **原样稿的材质表达不足：**Graphite 原稿只在 dialog 背景上声明 3px backdrop blur，组件页也是 3px dialog backdrop；不能把它称为对旧玻璃系统的完整展示。依据：`docs/design/space-ui-exploration/graphite.html:1195`、`docs/design/space-ui-exploration/components.html:946`。这是样稿欠缺，不是已经决定正式产品放弃玻璃。

## 2. 这次具体核实的效果

| 官方效果                                      | 官方事实                                                                                                                                                                                                                                                                                               | 对 KodaX 的建议（设计判断）                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Animate UI **Highlight / Tabs**               | Highlight 支持 hover、click、受控值，children 模式使用 Motion `layoutId`；TabsHighlight 默认弹簧 stiffness 200、damping 25。[Highlight](https://animate-ui.com/docs/primitives/effects/highlight#children-mode)、[Tabs](https://animate-ui.com/docs/primitives/animate/tabs#tabshighlight)             | 让项目筛选、工作区 tab、设置分类的选中底板连续移动。大幅长距离跳转用淡入淡出，避免底板穿过很多无关项目。                               |
| Animate UI **Shine**                          | 可配置角度、颜色、时长，支持 hover/tap；`loop` 默认 false。[Shine API](https://animate-ui.com/docs/primitives/effects/shine#api-reference)                                                                                                                                                             | 成果完成、主操作确认时扫过一次 600–900ms 柔光；不在正文或每个按钮上持续循环。                                                          |
| Animate UI **Sliding Number**                 | 数字位数滑动，支持 fromNumber、initiallyStable、spring transition。[Sliding Number](https://animate-ui.com/docs/primitives/texts/sliding-number#api-reference)                                                                                                                                         | 并行任务数、已完成数发生离散变化时滑动一次；token 高频更新直接稳定更新，避免一直滚动。                                                 |
| Animate UI **Button**                         | 普通 Button 提供 hoverScale / tapScale，默认 1.05 / 0.95。[Button API](https://animate-ui.com/docs/components/buttons/button#api-reference)                                                                                                                                                            | 密集工作台缩小幅度：主按钮可轻微压下，工具条图标更适合固定外框、只动图标。默认 5% 不是必须照搬的设计值。                               |
| React Bits 免费库 **Glass Surface**           | 官方效果是可折射背后内容的液态玻璃；公开实现含 SVG displacement、RGB 分通道及 WebGL 路径，不能等同于普通半透明 CSS 面板。[组件](https://reactbits.dev/components/glass-surface)、[官方源码](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Components/GlassSurface/GlassSurface.tsx) | 借鉴边缘厚度、顶部受光和背景透色；工作台默认先使用现有 CSS 玻璃，不默认引入完整折射实现。                                              |
| React Bits 免费库 **Border Glow**             | 网格渐变边缘会随光标方向和靠近程度增强；公开源码按 pointer 位置更新角度与边缘接近度，另有可选入场扫光。[组件](https://reactbits.dev/components/border-glow)、[官方源码](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Components/BorderGlow/BorderGlow.tsx)                         | 输入框焦点、待审批对象、成果主卡三处择少使用；缩小光晕，保持正文和代码稳定。不是给每个项目行画发光边框。                               |
| React Bits 免费库 **Animated Content**        | 包装内容入场，提供 slide、blur、3D tilt、wipe 与 stagger 等视觉方向。[组件](https://reactbits.dev/animations/animated-content)                                                                                                                                                                         | 借鉴一组新成果的短距离、少量错峰；流式 token 和已阅读消息不重复入场。                                                                  |
| React Bits 免费库 **Liquid Ether**            | 是跟随光标的发光液体背景；当前公开源码使用 WebGL 流体计算，含可见性与活动状态判断后请求下一帧的逻辑。[组件](https://reactbits.dev/backgrounds/liquid-ether)、[官方源码](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Backgrounds/LiquidEther/LiquidEther.tsx)                      | 只考虑无任务时的短暂品牌场景或单独可选演示，不作为滚动长对话背后的默认常驻背景。不能由“酷”推断“廉价”。                                 |
| React Bits Pro **Frame Border / Liquid Swap** | Frame Border 提供边框流动、点击脉冲、暂停与 reduced-motion 静态帧；Liquid Swap 是图像经液态玻璃球切换。[Frame Border](https://pro.reactbits.dev/docs/components/frame-border)、[Liquid Swap](https://pro.reactbits.dev/docs/components/liquid-swap)                                                    | Frame Border 的单次边缘反馈有参考价值；Liquid Swap 更适合图片展示，不用于项目/会话切换。这里只参考公开效果说明，未读取或复制付费实现。 |

**名称边界：**Glass Surface、Border Glow、Animated Content、Liquid Ether 在本次核实中均来自 React Bits 免费库页面；不要把它们误称为 React Bits Pro 独有组件。Pro 的已核实参考列在最后一行。[免费组件目录](https://reactbits.dev/get-started/index)、[Pro 组件目录](https://pro.reactbits.dev/docs/components)。

## 3. 建议的统一视觉与动态语言

以下是具体设计提案，参考依据在每行末尾；数值是待样稿验证的初始值，不是性能结论。

| 部位                 | 静态质感                                           | 动态反馈与预算                                                                         | 依据                                                                                                                                                                       |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 中央对话、代码、diff | 连续、稳定、清晰的内容表面                         | 新区块 4–8px 位移＋opacity，约 220–300ms；既有正文不跟随背景运动                       | [Animated Content](https://reactbits.dev/animations/animated-content)、[Motion 属性与层面积](https://motion.dev/docs/performance#rendering)                                |
| 底部输入框、命令面板 | 局部半透明、上缘细高光、轻微背景透色、稳固文字底色 | focus 时显示边缘受光；光层 opacity 或 transform 变化，约 160–240ms；先不动画 blur 半径 | 现有 `styles.css:635`、`:650`；[Glass Surface](https://reactbits.dev/components/glass-surface)、[Motion 性能](https://motion.dev/docs/performance)                         |
| 项目筛选、工作区 tab | 一块有材质的选中底板，避免每项独立卡片             | 同组短距离切换底板滑移约 220–280ms，内容淡换约 140ms                                   | [Highlight](https://animate-ui.com/docs/primitives/effects/highlight)、[Tabs](https://animate-ui.com/docs/primitives/animate/tabs)                                         |
| 成果完成             | 精细边缘、少量暖光，与品牌色统一                   | 仅完成时扫光一次约 600–900ms，随后稳定；重复播放由用户触发                             | [Shine 默认不循环](https://animate-ui.com/docs/primitives/effects/shine#api-reference)、[Frame Border 可重播/暂停](https://pro.reactbits.dev/docs/components/frame-border) |
| 设置页               | 与工作台相同底色、排版与边缘语言；内容行保持可读   | 分类切换的底板迁移与内容淡换；主题预览可局部玻璃，不把整页变成透明叠层                 | [Highlight](https://animate-ui.com/docs/primitives/effects/highlight)、现有 `styles.css:615` 对背景文字透出问题的记录                                                      |
| 低动态模式           | 保留静态材质、对比度、选中状态                     | 停止位移、缩放、扫光和装饰循环；仍显示完成与待审批语义                                 | [Animate UI reduced-motion 建议](https://animate-ui.com/docs/accessibility#prefers-reduced-motion)                                                                         |

## 4. 性能表述应当准确

1. **`transform` / `opacity` 是优先选择，不是绝对流畅保证。**Motion 建议优先这些属性，也明确硬件加速受浏览器条件影响；新建图层占用 GPU 存储。[Motion rendering / hardware acceleration](https://motion.dev/docs/performance#rendering)。
2. **固定 blur 与动画 blur 是两种预算。**`backdrop-filter` 处理元素后方像素；面板静止，不表示后方内容、滚动或窗口尺寸不变。保持 blur 值与后景静止可减少主动变化，但不能据此宣布“零成本”或“必然缓存”。[MDN backdrop-filter 语义](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter#description)、[web.dev blur 与绘制检查](https://web.dev/articles/animations-guide#check_whether_an_animation_triggers_paint)。
3. **当前项目已经按静态 chrome / 滚动内容分配玻璃。**源码注释禁止将 `.glass` 用于对话滚动区，全特效才开启 aurora 漂移，流式输出与历史恢复时暂停背景。这些是实现意图；注释中的“静止不增成本”“零额外开销”不是本轮测量结论。依据：`apps/desktop/renderer/src/styles.css:575`、`:598`、`:701`、`:1088`、`:1136`。
4. **高光、阴影、CSS 自定义属性动画也需要验收。**小面积、短时、事件触发是控制工作的设计方法；动态渐变/阴影可能触发绘制，动画 CSS 变量不自动硬件加速。[Motion CSS variables / expensive paints](https://motion.dev/docs/performance#css-variables)、[web.dev paint profiler](https://web.dev/articles/animations-guide#check_whether_an_animation_triggers_paint)。
5. **不把 `will-change` 撒满页面。**MDN 明确警告过量使用会增加内存和渲染复杂度，应针对已有性能问题按需使用。[MDN will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/will-change)。
6. **正式集成验收建议：**在目标 Electron/Chromium、核显和高 DPI 下比较默认/低动态/关闭玻璃；负载包括长中文代码流、滚动、多个并行任务、拖拽窗口、失焦。采集掉帧、paint、主线程和 GPU/功耗信息后再决定默认预算；当前没有这些数据。[web.dev 性能检查步骤](https://web.dev/articles/animations-guide#check_for_dropped_frames)、[Motion conclusion](https://motion.dev/docs/performance#conclusion)。

## 未证实

- 未测量 KodaX 在目标硬件上的玻璃 GPU 时间、功耗、显存与帧率；不据库官网预览宣称“低成本”。
- 本轮只核实 React Bits Pro 公开文档，未获取付费实现，无法判断其具体依赖、源码兼容与真实运行成本。[Pro 公开组件页](https://pro.reactbits.dev/docs/components)。
- 这份笔记不宣布审美排名；具体玻璃强度、暖光色与动效幅度需要用户在当前任务样稿中判断。

## 未解问题

- 主要用户机器的 GPU、分辨率和缩放分布尚未知；这决定默认玻璃面积与是否需要沿用三档质量控制。
- 标准模式的边缘受光、一次扫光与原有 aurora 的组合是否过强，需要并排查看实际长会话。
- Glass Surface 的真实折射是否比现有 CSS 玻璃带来足够视觉收益，尚无 KodaX 内部 A/B 样稿或性能数据支持。
