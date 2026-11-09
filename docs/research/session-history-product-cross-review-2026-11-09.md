# 历史浏览方案怎样收敛到最小且可信的用户体验？

2026-11-09。产品评审结论：优先交付“边界清楚、旧内容可达、跳转可返回”，保留同修订保存页连续浏览。首期保留 Ctrl+F 的确定性已加载内容查找，不默认切换 SDK 会话检索；不把跨实时/保存来源无缝、全局提问目录、全轮重组、未读计数或虚拟化绑进本次入口修复。

本轮对[上一版综合方案](session-history-experience-2026-11-09.md)作反例评审，并与 `/root/history_engineering_review` 直接交流两轮。结论是待实施建议，未运行 UI、未修改业务代码；代码基线为 `ffeb9ed7`。

## 1. 需要修正上一版的地方

| 上一版主张 | 反例／风险 | 修正建议与证据 |
| --- | --- | --- |
| 主入口默认搜索整个已保存会话 | 用户要找刚看见的实时文字，未保存内容不在保存检索来源；当前 SDK hits 与本地子串查找不是同一口径。更改默认可能让“眼前有字却查不到”重新出现。 | Ctrl+F 首期开“已加载内容”，始终显示范围；提供明确“搜索已保存会话”升级动作，保留查询词。当前默认与打开快捷键都明确选 page；当前 DOM 查找会排除隐藏、inert 与折叠 details。[搜索状态](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1230) · [快捷键](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1350) · [查找语义](../../apps/desktop/renderer/src/features/session/usePageFindMatches.ts#L6) |
| 搜索结果显示摘录并可定位前后文 | 当前点中摘录先读取完整原文，之后还要点“在对话中查看”；对主要任务“找到当时的讨论”增加一次选择。原文读取失败也可能妨碍用户发现定位能力。 | 第二个独立切片：点击命中默认先尝试 around 定位，显式“查看原文”为辅助动作；仅原文可读则退到预览，stale 则重新搜索。保留结果、焦点与原位置。当前 openHit 与 onLocate 是两个不同动作，已有可复用接缝。[当前打开结果](../../apps/desktop/renderer/src/features/session/ProductHistorySearch.tsx#L73) · [原文/定位 UI](../../apps/desktop/renderer/src/features/session/ProductHistorySearch.tsx#L184) · [定位与返回](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1381) |
| 用“连续阅读”统一全部正文 | 对无强身份旧记录强行自动切换，只能猜测落点；同时显示实时与保存正文则违反既定来源归属。 | “连续”分为同修订保存页内连续、可信跨来源定位与不能对齐时显式跳转。用户不必理解 view/history，但必须提前知道动作会定位到另一段。ADR-010 明确禁止把两个正文来源拼成第二份会话。[ADR-010](../ADR/ADR-010-sdk-product-output.md) · [当前映射与拒绝分支](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1743) |
| 顶部入口改为更早内容加载 | 只按 hasMore 显示会使只有一页的保存内容再次不可达；历史非空也不能证明它一定比当前 view 更早。 | 入口以实际动作命名。已知有早页用“加载更早消息”；有保存内容但不能连续对齐用“浏览历史消息”，说明“将定位到最近的历史消息”，随后可“返回原处”。保留单页进入路径。[入口条件](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L894) · [单页选择](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L1305) |
| 每轮统一为提问、过程摘要、最终回答 | 当前已有工具/思考分组，而且有正文的 assistant 消息被特意保留；把中间 assistant 正文全部塞进“过程”可能再度藏掉有意义回复。布局上的一轮也不是 SDK 可安全改写的完整轮次。 | 首期沿用当前 normal 模式，不新增全轮内容重组；只修复明确的可见性和定位问题。最终回答／完整轮语义要有 SDK 证据再做。当前 groupTools 的正文保留注释还记录过“正常输出过会消失”的旧问题。[groupTools](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L695) · [保留正文](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L748) |
| 阅读旧内容时显示新消息提醒 | 当前 hasNewer 也标记保存来源选择，不证明新消息刚到达；token、view revision 同样不能充当新增消息数。 | 首期明确“回到最新”，不新增计数。若以后需要“有新消息”，另定义已读水位及可靠提交身份。[当前赋值](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L1305) · [当前返回按钮](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2812) |

以上是基于具体实现的产品判断，不是竞品用户实验结果。竞品资料只提供查找、目录和细节密度的参考，并未证明四家统一采用一种向上分页方式。[竞品证据边界](coding-agent-history-ux-competitors.md#未证实)

## 2. 首期应该呈现的完整路径

1. **打开会话。** 首屏恢复可读的最新内容，加载、空会话和失败分开；正文仍沿 SDK 顺序。
2. **向上回看。** 同修订保存页内自然补入较早项；用户真实上翻才取得阅读权，程序滚动、搜索跳转和布局调整不启动另一轮分页。现有代码已有真实方向判断，应继承。[相邻请求](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1710) · [滚动方向](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1895)
3. **遇到接缝。** 可确认同一项则保持该项与视口偏移；不能确认则显示清楚的跳转动作，点击后落在最近保存消息附近，并保留返回入口。不能把有意停止当成“已到开头”。[映射](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1743) · [接缝回落](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1568)
4. **读旧位置。** 新输出不取得滚动权。底部“回到最新”拥有稳定含义；临时跳转另有“返回原处”，搜索定位另有“返回搜索结果”，三个落点不可混成同一个图标。[独立返回入口](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2794)
5. **查找。** Ctrl+F 明确显示“已加载内容”，本地零结果时清晰提供“搜索已保存会话”；不擅自切范围或把两个结果数相加。保存会话结果按其真实检索范围命名，未保存的当前内容仍能本地查找。[范围选择](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2722)
6. **到达边界。** 正在读取、读取失败和源变化分别反馈，保留已读内容。只有来源完整且确实到分支起点时才显示“已到本会话开头”。当前错误 sentinel 已有独立状态，可在现有基础收敛。[加载与错误反馈](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L3578)

这些步骤能解释用户下一步，不要求普通用户理解“实时窗口”“canonical”“revision”。需要解释的只有动作结果、可读范围和返回落点。

## 3. 顶部边界的产品约束

建议使用与正文对齐、可识别的边界行。常规状态保持安静，用户到边界时能够看清；按钮拥有明确热区、焦点和动词。当前截图中的弱化小字可作为待验证风险，不能仅凭截图给出 WCAG 合规判断。[用户截图与源码说明](session-history-experience-2026-11-09.md#1-红框按钮实际做什么)

| 真实状态 | 用户看到的结果 |
| --- | --- |
| 有较早页且能继续读取 | “加载更早消息”；自然上翻可触发，同一动作也可键盘或点击执行 |
| 正在读取 | “正在加载更早消息…”；保留已有内容和阅读位置 |
| 保存记录可读但缺可靠接缝 | “浏览历史消息”；说明“将定位到最近的历史消息”；完成后可“返回原处” |
| 较早页读取失败 | “较早消息加载失败”＋“重试”，不声称已经到头 |
| 完整来源确认已到起点 | “已到本会话开头”，没有伪加载按钮 |
| 来源部分恢复或已经变化 | 显示实际状态及可执行动作，不能把“可读部分”叫“全部历史” |

不用“展开全部历史”，因为它把读取范围与折叠展示混在一起；也不根据缓存条目数显示“还剩 N 条”，缓存数量不是全部历史数量。此约束来自现有入口与分页语义。[入口条件](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L894) · [保存页选择](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L1305)

## 4. 对两个本地参照的取舍

- **deepseek-harness：**优先采用内容锚点与相对高度、用户阅读权、流式稳定块三项思路。普通 Chat 的手动补页不是必须复制的交互；其主消息全量挂载与 Trajectory 表虚拟化不能混为一种性能保证。[研究](deepseek-harness-history-rendering-2026-11-09.md)
- **ZCode：**优先参考顶部预取、稳定虚拟单元及独立运行尾轮的验证方法；不因为宽屏目录看起来方便就让目录加载全部正文。整轮虚拟化需要另测一个巨型轮，而不只测试大量小轮。[研究](zcode-history-rendering-2026-11-09.md)
- **KodaX 的边界：**ADR-010 当前明确选择 SDK 单一正文来源，不能为了模仿别的投影结构而恢复 renderer 私有正文重建。任何统一表象先在既有公开读取/定位契约上证明。[ADR-010](../ADR/ADR-010-sdk-product-output.md)

## 5. 与工程评审达成的最小交付

### 切片 A：边界与返回

范围为顶部入口可发现性、真实状态、显式跳转落点和原位置返回。保持当前保存页累计策略和 SDK 来源选择；不新增目录、未读数量或全轮重组。

验收必须覆盖：只有一页保存历史且内容不同、实时/历史无映射、保存页有映射、短于一屏、跨页工具轮、读取失败、源变化、读旧页收到新输出。每条可读保存项可到达；明确跳转可返回，换会话后的迟到结果不能移动当前界面。[既有回归入口](../../apps/desktop/renderer/src/shell/conversationHistoryNavigation.browser.test.ts#L116)

### 切片 B：保存检索结果直达上下文

保留 Ctrl+F 范围，先减少保存检索结果的多次点击。使用已有 around 查询；定位失败保留原文退路，过期结果可重新查找，返回恢复结果、焦点与原位置。不要让读取整份长原文成为定位的前置条件。[当前定位函数](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1381) · [结果组件](../../apps/desktop/renderer/src/features/session/ProductHistorySearch.tsx#L112)

### 后续测量

位置稳定性要区分“同一消息行还在”与“同一文字段落还在”。当前锚点以 DOM 消息行和 top 偏移捕获，长单条在字号/宽度变化后可能重新排版；不应在尚无数据时承诺字符级阅读位置。[锚点捕获](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1244)

测量大量小轮、一个巨型正文、一个巨型工具轮三类数据，分别定位 IPC、解析、挂载与布局开销；再决定 F144 粒度及正文块锚点是否必要。[F144](../features/v0.2.x-plus.md#feature_144-windowed-continuous-transcript-virtualization)

## 6. 交叉讨论记录

第一轮产品提出两项异议：Ctrl+F 改默认范围会降低对眼前文字的确定性；入口绑定 hasMore 会失去单页历史。工程确认这两项，并提出“连续”必须区分同修订保存页与跨来源接缝，保留原文读取退路。

第二轮产品接受该范围约束，提出 around 优先、原文辅助；把新消息计数、全轮重组移出首期。工程确认共同最小交付，补充当前锚点是行级而非字符级；around 可用既有公开契约，首期不预设 SDK 升级。

**最终共识：**切片 A 先解决用户是否知道怎样继续看、会跳到哪里以及怎样返回；切片 B 单独解决搜索结果的额外交互。当前讨论不建议一次重写所有聊天渲染，也不承诺无法证明的历史完整性。

## 未证实与未解问题

- 未现场操作用户的具体历史会话，不能判断其保存记录与实时 view 的实际覆盖差异。
- 尚无用户任务测试比较“查当前文字”和“查旧讨论”的相对频率；因此保留既有确定性默认，显式提供升级范围，而不推断一个统一默认适合所有人。
- SDK 会话搜索对工具、思考、归档和分支的实际召回边界仍须按发布包契约单独验证；本文不承诺全部文字匹配次数。
- 原文预览与命中直达的自动降级、字号变化中的段落保持，仍需从真实入口运行验证。
- 本轮只读源码和现有测试并与工程 agent 交叉讨论，没有运行测试或 UI；测试存在不等于本轮已通过。
