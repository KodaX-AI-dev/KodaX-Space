# 补全后的原子标签有哪些更合适的视觉组件可参考？

结论摘要：推荐 Space 保留当前 Lexical 原子节点，视觉向 ZCode 的“图标＋正文大小的短名称”靠近，默认去持续边框与底色。网上可参考 Lexical Beautiful Mentions 的样式定制方式、Plate Mention 的弱底色与选择状态，以及 Radix Badge 的 soft 视觉。组件名字或是否原子化不决定美观；不必为改外观迁移编辑器。此为设计判断，尚未修改产品。

实施更新：用户已批准后续视觉调整。当前源码已采用轻引用与文件蓝/技能紫/命令琥珀三色，详情见 [F031 验证指南](../test-guides/FEATURE_031_0.1.47_TEST_GUIDE.md)。下文与对照图保留实施前研究语境。

日期：2026-11-07。Space HEAD `47221d32c3e2d3e1725b0a8b4b3b0bc67d365f56`；ZCode checkout `a9fe401eede6e6e5e01be9048679c206fe6f02d9`。本地引用针对读取时工作树，另有并行开发，不能当作纯净 HEAD 行号。研究范围限定为补全确认后进入输入框的行内对象，附件卡片和候选菜单另论。

## 1. Space 当前为何容易像小按钮

Space 的 `.composer-token` 采用13px字号、22px行高、1px边框、持续底色、左右6px padding及6px圆角，还用负像素 vertical-align 调整；图标为13px伪元素。类别主体统一主前景色。[当前规则](../../apps/desktop/renderer/src/styles.css#L83)。现有留存的[深色截图](../../artifacts/composer/composer-dark.png)与[浅色截图](../../artifacts/composer/composer-light.png)也能看到嵌在文字里的有底标签；它们是前轮截图，不代表本轮重新运行整个 Space。

“标签比正文小、盒子却更厚，容易显得像独立控件”是基于上述尺寸/装饰的视觉判断，不是用户实验结果。原子行为来自 TextNode 的 token 模式及编辑命令，和是否画边框无绑定。[节点](../../apps/desktop/renderer/src/shell/ComposerTokenNode.ts#L53)、[创建](../../apps/desktop/renderer/src/shell/ComposerTokenNode.ts#L65)、[编辑/删除](../../apps/desktop/renderer/src/shell/useComposerEditor.ts#L234)。

## 2. ZCode 值得借鉴的视觉

ZCode 的实际节点是16px图标与正文同级的文字，间距4px；基础类没有通用边框、padding或持续底色。默认14px/20px与它自己的正文行盒协调，使用 align-top；文件、技能、命令分别采用蓝、紫、中性类别文字色。[基础类](C:/Works/PubProj/ZCode/packages/ui/src/mentions/mentionChip.ts:3)、[图标](C:/Works/PubProj/ZCode/packages/ui/src/styles.css:2267)。它同样是 Lexical TextNode token，视觉较轻不要求放弃完整删除。[节点](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:103)、[创建](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:188)。

完整颜色、图标、短名称、DOM 与删除链，以及对该建议的交叉反证见[ZCode 专项笔记](composer-atomic-tag-zcode-visual-2026-11-07.md)。只读了 ZCode 源码，没有运行其实机；不能把新增的 hover/选中设计说成 ZCode 已有行为。

## 3. 网上可参考的组件

以下事实来自2026-11-07读取的官方文档/作者仓库；“适合 Space”列是取舍判断。

| 参考 | 已证实的能力/形态 | 适合 Space 的用途 |
| --- | --- | --- |
| [Lexical Beautiful Mentions](https://github.com/sodenn/lexical-beautiful-mentions#customize-mention-style) / [官方演示](https://lexical-beautiful-mentions-docs.vercel.app/) | 同 Lexical；主题可分别指定触发符、值、容器及 focused 状态，也允许自定义节点组件；没有要求统一使用某一种胶囊。 | 技术体系最接近，借鉴视觉状态的分离；没有必要为修改外观替换已经通过删除/序列化回归的 Space 节点。 |
| [Plate Mention](https://platejs.org/docs/components/mention-node) / [实际 UI 源码](https://raw.githubusercontent.com/udecode/plate/main/apps/www/src/registry/ui/mention-node.tsx) | 示例为中性弱底、圆角、基线对齐；选中且编辑器聚焦才加 ring。源码使用 Plate/Slate 相关属性及非编辑节点。 | 可参考“弱底引用”的视觉备选；它的编辑器节点不直接接到 Space 的 Lexical 中。 |
| [Radix Themes Badge](https://www.radix-ui.com/themes/docs/components/badge) / [样式源码](https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/components/badge.css) | 基于 span；提供 soft/surface/outline/solid 等视觉变体，soft 使用透明底色及前景色。 | 适合参考 gray/soft 的轻表面；本身不负责光标、整块删除或撤销。 |
| [Dice UI Mention](https://diceui.com/docs/components/base/mention) | 文档提供触发字符、候选组合及 data-tag 样式入口。 | 可作为补充资料；本轮未核实它与 Space 的完整输入语义兼容，暂不作为替换建议。 |

另核对了 [Tiptap Mention](https://tiptap.dev/docs/editor/extensions/nodes/mention)：支持定制渲染，但属于另一编辑器体系；仅为换外观引入整套节点机制不符合本轮最小改动目标。此处的“不迁移”是工程取舍，不是说它的视觉能力不足。

## 4. 源码样式对照图

[打开对照图](../../artifacts/composer-visual-research/comparison.png) / [本地 HTML](../../artifacts/composer-visual-research/comparison.html)。

图使用同一段文案，在浅/深背景比较 Space 当前、ZCode 方向、Plate Mention、Radix soft 四种形态。原子标签形态按相应源码规则摘录；ZCode 颜色使用其当前主题覆盖值，图标统一复用 Space 的 Lucide 装饰。Radix 的变量映射到样本颜色/尺寸，未复现完整主题环境。因此它是研究样本，不是原产品截图或组件开箱即用效果，也不验证选区/输入法/删除。

本地 Headless Chromium 已生成并查看整张图。在线 in-app browser 打开 Lexical 演示及 Radix 页面各超时一次，未拿到可操作演示；在线判断依据是已读取的官方文档与源码，不宣称在线交互验收完成。

## 5. 推荐给 Space 的最小方向（未实施）

1. **默认轻引用。** 去持续边框和底色，短名称与正文同字号；保留小型语义图标。键盘选中或 hover 时才给轻底色/选区反馈。这是给 Space 的建议，不冒充现有 ZCode 实现。
2. **和句子一起排版。** 适配 Space 自己的正文行盒，避免把 ZCode 的20px行高机械复制过来；中英文、命令、技能、文件混排时保持视觉基线。[Space 正文](../../apps/desktop/renderer/src/styles.css#L60)、[ZCode 同行盒规则](C:/Works/PubProj/ZCode/packages/ui/src/mentions/mentionChip.ts:3)。
3. **保留原子能力和身份。** 完整删除、撤销、复制、真实路径、同名文件消歧及点击详情继续使用现有链路；外观改善不改变发送文本、不展开技能正文、不新增模型调用。[详情](../../apps/desktop/renderer/src/shell/ComposerEditor.tsx#L70)、[节点身份](../../apps/desktop/renderer/src/shell/ComposerTokenNode.ts#L10)。
4. **先改表面，再验证布局。** 不直接把 inline-block 改为 inline-flex；匿名文字 flex item 可能改变现有长标签 ellipsis。图标继续通过伪元素装饰，保护 Lexical 的文字 DOM。此为 CSS 推论与已记录的 DOM 约束，不是已经复现的回归。[现有截断](../../apps/desktop/renderer/src/styles.css#L83)、[ZCode DOM 注释](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:110)。

这是视觉层的改进方向；没有新增依赖、修改产品 CSS、执行模型请求或重做编辑器。

## 未证实与未解问题

- 未启动 ZCode，未成功操作在线演示；对照图不能代替真实 Space 内长标签、中文IME、光标/选区、整体删除与 Undo 验收。
- 没有验证候选包与当前 Lexical 版本、剪贴板协议及 Space 命令语义完全兼容；本轮建议是借鉴样式，不是安装清单。
- 是否需要保留极淡的常态底色，还是完全采用无底的文字引用，仍需用户对照偏好与真实输入框验证。
- 类别色可只给图标，也可图标和名称一起着色；需在 Space 真实深浅主题中检查可读性与整句阅读干扰。

本轮只增加研究笔记与忽略目录中的样式样本，没有提交产品改动。
