# ZCode 输入框中的原子引用为何更轻，Space 可以借鉴什么？

结论摘要（设计判断）：ZCode 当前行内引用的核心是“类别图标 + 与正文同级的文字”，而非带持续底色和边框的小按钮。Space 可以保留现有 Lexical 原子节点、删除和发送协议，先将视觉改为轻量行内引用；不必为改善外观替换编辑器或引入组件库。

实施更新：用户批准的轻引用样式已落入当前源码。本文 Space 样式对照保留改动前快照；现状与验证见 [F031 指南](../test-guides/FEATURE_031_0.1.47_TEST_GUIDE.md)。

日期：2026-11-07。ZCode checkout `a9fe401eede6e6e5e01be9048679c206fe6f02d9`；Space HEAD `47221d32c3e2d3e1725b0a8b4b3b0bc67d365f56`。本轮只读源码，没有运行 ZCode、没有修改产品代码。下述尺寸和颜色是当前源码规则，不代表已观察所有平台的计算样式、选择和删除结果。这里只比较插入后的行内节点；补全下拉菜单与输入框外的附件卡片不是同一对象。

## 1. ZCode 的实际行内节点

| 维度 | 源码事实 |
| --- | --- |
| 节点基础 | `PromptMentionNode` 继承 Lexical `TextNode`，`createDOM` 保留原生文字 DOM；`isTextEntity=true`、前后不可在节点内插字、创建时 `setMode("token")`。[节点实现:103](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:103)、[原子语义:163](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:163)、[创建:188](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:188)。 |
| 轮廓与排版 | 基础类是 `inline-flex cursor-default items-center gap-1 align-top text-ui-base leading-5 font-medium`；该组件链未附加通用 border、padding、rounded 或 background 类。[基础类:3](C:/Works/PubProj/ZCode/packages/ui/src/mentions/mentionChip.ts:3)。因此“不是胶囊”的判断限定在这条 DOM/CSS 链，不根据主题中存在背景变量就推定它实际用了底色。 |
| 文字尺寸与对齐 | 默认 UI 字号变量为14px，`text-ui-base` 指向该变量。桌面正文也选 `text-ui-base leading-5`，节点和正文共享20px行盒；源码注释专门说明 `align-top` 用于消除 inline-flex `align-middle` 的约1px视觉偏移。[默认字号:78](C:/Works/PubProj/ZCode/packages/ui/src/styles.css:78)、[字号别名:158](C:/Works/PubProj/ZCode/packages/ui/src/styles.css:158)、[正文类:99](C:/Works/PubProj/ZCode/packages/ui/src/lib/mobileTextInput.ts:99)、[节点对齐注释:3](C:/Works/PubProj/ZCode/packages/ui/src/mentions/mentionChip.ts:3)。 |
| 图标 | `::before` 为1rem×1rem、不可收缩；`gap-1` 提供图标与字之间的4px间距。图标通过 mask/image CSS变量装饰，不把 img/svg 放到 Lexical 文字节点前面。[伪元素:2267](C:/Works/PubProj/ZCode/packages/ui/src/styles.css:2267)、[装饰函数:54](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/promptMentionDecoration.ts:60)、[保留文字DOM原因:110](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:110)。 |
| 图标语义 | 技能为 WandSparkles；通用命令为 SquareSlash，goal/workflow/compact 各有专用图形；文件按文件类型选择 Material 图标，目录用 folder，加载失败有文档/内置SVG回退。[图标常量:19](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/mentionIconDom.ts:19)、[命令分配:78](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/promptMentionDecoration.ts:84)、[文件分配:69](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/promptMentionDecoration.ts:74)、[文件类型:131](C:/Works/PubProj/ZCode/packages/ui/src/lib/fileDisplay.tsx:131)。 |
| 类别颜色 | 文件、技能、命令使用各自 foreground 类；当前浅色变量分别为 `#1a70b8`、`#7453b0`、`#566270`，深色分别 `#8fc5ef`、`#bda5e6`、`#b5c0cc`。这是类别文字色，不代表这些节点同时有同色背景。[类别类:8](C:/Works/PubProj/ZCode/packages/ui/src/mentions/mentionChip.ts:8)、[浅色变量:661](C:/Works/PubProj/ZCode/packages/ui/src/styles.css:661)、[深色变量:827](C:/Works/PubProj/ZCode/packages/ui/src/styles.css:827)。 |
| 展示名称 | 文件节点取文件 basename；技能去掉显示名开头 `$`，文件等去 `@`，会话去 `#`。原 Markdown/路径不放到行内文字中反复展示。[文件展示:19](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:19)、[显示归一化:26](C:/Works/PubProj/ZCode/packages/ui/src/mentions/promptMentionLabel.ts:26)。 |
| 发送身份 | 节点保留独立 markdown/value，`getMarkdown()` 明确“offset使用展示文字，canonical仅供发送和剪贴板”；序列化通过该字段输出完整内容。[身份分离:158](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:158)、[序列化:13](C:/Works/PubProj/ZCode/packages/ui/src/mentions/promptSerialization.ts:13)。 |

在检查到的 `mentionChip` 类和 `.prompt-mention` 样式中，没有专门的 hover/selected 外观或常驻删除叉；不能据此宣称它没有浏览器文字选区效果，也不能将主题里定义的 `*-node-hover` 变量当作已经启用的交互。该结论的范围是上述实际类与两条伪元素选择器。[基础类](C:/Works/PubProj/ZCode/packages/ui/src/mentions/mentionChip.ts:3)、[实际选择器](C:/Works/PubProj/ZCode/packages/ui/src/styles.css:2267)。

## 2. “完整删除”与“看起来像标签”是独立问题

ZCode 在光标位于自动补位空格之后时，用一次 Backspace 同时移除空格与前一个 PromptMentionNode，避免按两次才能删除。它另有 macOS Option+ArrowRight 边界守卫，阻止光标掉进节点内部。视觉上不画胶囊，不会让 token 自动变成可拆散的普通文本。[Backspace:661](C:/Works/PubProj/ZCode/packages/ui/src/LexicalChatInput.tsx:661)、[词级跳转:699](C:/Works/PubProj/ZCode/packages/ui/src/LexicalChatInput.tsx:699)。

Space 也已经有 `TextNode.setMode('token')`、文本实体边界以及自动空格身份删除逻辑。因此保留原子能力与删除体验，不要求保留现有外边框。[Space 节点](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ComposerTokenNode.ts:53)、[Space 原子创建](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ComposerTokenNode.ts:65)、[Space 删除](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/useComposerEditor.ts:234)。

## 3. 与 Space 当前规则的直接对照

| 项目 | Space 当前源码 | ZCode 当前源码 |
| --- | --- | --- |
| 主体 | `inline-block`，13px/22px，`vertical-align:-4px` | `inline-flex`，默认14px/20px，`align-top` |
| 表面 | 1px持续边框、6px圆角、`surface-3 / .65`底色、左右6px内边距 | 上述节点类没有持续边框/底色/内边距 |
| 图标 | 13px、5px右距、前景静态muted；file/skill/command各一个通用Lucide形状 | 1rem图标、4px gap；文件可按类型，技能/部分命令有语义图标 |
| 类别信息 | 三类主体都是主前景文字色，主要靠图标区分 | 不同类别foreground颜色，图标继承/采用文件素材 |
| 长度 | `max-width:min(60%,280px)`，ellipsis，title保留detail/value | 节点基础类未定义同类宽度上限；文件显示basename，其他label做前缀归一化 |
| hover/详情 | hover改accent底色与边框；点击打开完整引用、复制、删除操作 | 本次节点链未确认同类详情弹层或专用hover样式 |

Space 规则来源：[正文与标签:60](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/styles.css:60)、[图标:102](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/styles.css:102)、[hover:123](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/styles.css:123)、[title:48](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ComposerTokenNode.ts:48)、[详情操作:70](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ComposerEditor.tsx:70)、[点击入口:148](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ComposerEditor.tsx:148)。ZCode 来源见第1节逐项引用。

**设计判断**：Space 现有字比正文小1px，却增加边框、padding和底色，且标签与图标分别用负像素偏移，容易呈现为正文里嵌入的小按钮。ZCode 的图标与文字更接近连续输入句子。“更好看”仍需要在真实 Space 的中英混排、换行和选区中比较，不能从这张源码对照表直接下定论。

## 4. 对现有 Lexical 最小且值得验证的方向（设计建议，未实施）

1. **去持续轮廓，保留原子对象。** 优先试“图标 + 正文字号的短名称”，边框与常驻底色移除，hover/键盘选中才给非常轻的局部底色。后两种状态是给 Space 的建议，不冒充 ZCode 已实现。依据是 Space 与 ZCode 同为 TextNode token，外观并不决定原子语义，见第1/2节。
2. **与 Space 正文共用行盒。** Space正文目前14px/26px，标签可保持14px并与26px行盒协调；不要机械复制ZCode的20px，更不要靠`vertical-align:-4px`和图标`-2px`分别补偿。图标建议14–16px、gap4px，在实际截图中选择。依据是ZCode对同一行盒的明确处理与Space当前字号差，见第1/3节。
3. **短名称和图标承担识别。** 文件保留短名及现有同名消歧，技能使用有辨识度的图形；类型图标可先只覆盖已有本地图标能力，不为了视觉引入远程请求或整套文件图标依赖。Space现有同名文件最短区分路径应保留。[现有消歧](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/useComposerEditor.ts:174)。
4. **类别色要轻，不做三种彩色按钮。** 可以验证文件冷蓝、技能克制的紫/暖色、命令中性灰；与Space纸面/石墨主题协调，深浅色独立检查对比度。ZCode的具体色值仅是参照，不直接移植主题，见第1节颜色证据。
5. **保留详情与完整删除。** Space已有点击详情、复制和移除；可以继续让这些操作按需出现，避免每个小引用常驻删除叉。Backspace、Undo、剪贴板原文、同名文件和中文输入法必须回归，不能为了去边框修改wire值或展开Skill正文。[Space详情](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ComposerEditor.tsx:70)、[原子删除](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/useComposerEditor.ts:234)、[wire字段](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ComposerTokenNode.ts:10)。

## 5. 交叉质疑：不要把“去胶囊”写成“直接改 inline-flex”

根 Agent 提供的在线候选包括 Lexical Beautiful Mentions、Plate Mention与Radix Badge，并倾向ZCode式无持续边框的行内引用。此处只响应视觉方向，不将根 Agent 的在线观察当本报告的本地事实来源。

- **长标签省略风险**：Space当前依靠inline-block容器上的max-width/overflow/text-overflow截断；若直接改为inline-flex，直接文字会成为匿名flex item，不能假定原容器上的ellipsis仍产生相同效果。第一片可以保留inline-block，仅改变表面与字号，或先在真实编辑器验证flex的省略行为。这是CSS布局推论及实施风险，不是已运行得到的缺陷。[现有截断规则](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/styles.css:83)
- **图标不能侵入文字DOM**：ZCode源码明确记录首部img/svg会截断Lexical选区映射、异步图标失败时replaceChildren会毁掉文字节点。Space目前也是伪元素装饰；为支持视觉不能随意插入React标签、删除按钮或重建子树。[DOM约束](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:110)、[异步图标约束](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/promptMentionDecoration.ts:46)、[Space伪元素](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/styles.css:102)
- **共享行高而非抄数值**：ZCode桌面正文和节点同为14px/20px，Space正文14px/26px；字体回退、中文/英文/数字混排会改变光学基线。应同时检查token前后正文、行首/行尾与自动折行，不能把align-top当作跨字体已验证结论。[ZCode行盒](C:/Works/PubProj/ZCode/packages/ui/src/lib/mobileTextInput.ts:99)、[Space行盒](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/styles.css:65)

建议验证矩阵（尚未执行）：短/超长文件名与同名目录消歧；命令+技能+文件夹杂中英文同一行；窄输入框折行及省略后完整身份可查看；整段选择/Shift选择/复制粘贴/Undo；自动补位空格后的Backspace及中文IME组合态；深浅色与正常/hover/选中态。原子删除的既有测试不能替代新的排版视觉检查。

## 未证实

- 未运行ZCode；没有ZCode实机截图、实际计算样式、读屏或选区验收。本报告中的外观来自源码链追踪。
- 未证明该方向一定优于Space当前外观；需要真实句子中同时出现命令、技能、文件、中文和英文进行视觉比较。
- 未确认ZCode所有主题、字号、插件样式、浏览器native selection的最终合成效果；不能把“未发现专用规则”扩大成“完全没有hover/selection”。

## 未解问题

- Space采用几乎无底色的行内引用，还是保留极淡底色的软标签，哪一种更符合用户偏好？需要视觉样本比较。
- 非交互态的类别色是否只给图标，还是给图标和名称一起着色？应以深浅色对比度和整段阅读干扰为准。
- 完整路径的按需查看继续用当前点击弹层，还是后续收紧为轻量popover？这是独立视觉决策，不改变原子删除合同。

本轮仅新增此研究文档；未修改产品代码、依赖、SDK或发送内容。
