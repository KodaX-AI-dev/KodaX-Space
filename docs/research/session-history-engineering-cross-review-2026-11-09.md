# 历史阅读方案的工程交叉评审：哪些体验现在可以兑现？

2026-11-09，基线 `ffeb9ed7`。结论：保留“同修订保存页连续阅读＋可信跨来源切换”，先改善历史边界、落点和返回，不默认改 Ctrl+F、不重组整轮、不把 F144 或 SDK 升级作为入口修复的前置。与产品评审交换并回应了一轮意见；下文区分源码事实、设计建议和待测目标。本次只读业务代码，未运行 UI 或测试。

## 1. 对上一轮方案的关键修正

| 上一轮主张 | 工程判断 | 建议收敛 |
| --- | --- | --- |
| 统一为一条连续阅读路径 | 产品方向成立，但“保存页连续”与“实时 view 接上保存历史”不是同一个已证实能力 | 同 revision/sourceRevision 保存页继续前插/后接；跨来源仅在可信映射下恢复位置，无法映射则显式跳转 |
| 默认搜索整个会话 | 现在的 SDK 检索与 Ctrl+F 的确定子串查找语义不同；直接换默认会丢掉刚看到的 live 文本 | Ctrl+F 保留“已加载内容”；提供明确的“搜索此对话”入口，不在首期暗中合并计数 |
| 每轮提问、过程、最终回答重新组织 | SDK 是有序显示项权威，当前 UI 过程分组不是完整轮次或最终回答边界证据 | 首期沿用当前布局和折叠，单独完善命中展开、边界说明；重组轮次须先证明实际收益与分组依据 |
| 回到最新同时提示新消息 | 导航需要成立，但 hasNewer 也表示选中保存历史，不能当新增消息证据 | 首期改进“回到最新”文字可见性；没有可靠增量身份时不显示未读数量 |
| 按轮虚拟化可解决长会话 | 整轮可能含单个巨型 Markdown 或数百工具，少数轮仍会产生大量 DOM/解析工作 | F144 按逻辑显示行验证成本；另测巨型单条，按瓶颈选择粒度 |

事实依据：[ADR-010 的来源分离与连续保存页补充](../ADR/ADR-010-sdk-product-output.md) · [Ctrl+F 当前默认](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1226) · [SDK 搜索读取](../../apps/desktop/renderer/src/features/session/ProductHistorySearch.tsx#L39) · [过程分组](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L695) · [保存页选择与 hasNewer](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L944) · [F144 逻辑行目标](../features/v0.2.x-plus.md#L33)。

## 2. 连续性的真实边界

### 已经具备的基础

- 同 revision/sourceRevision 相邻保存页累积，重叠只按 SDK item ID 保留一份。保存正文与 advancing view 分别存储，当前只选其中一份显示。[保存页合入](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L924) · [显示选择](../../apps/desktop/renderer/src/store/productSessionView.ts#L92)
- SDK 现在已支持 `around.searchItemId` 或 `around.historyBoundary` 的有界定位，Host 周边读取 limit 为 30；普通历史页 limit 为 150。故不能预设新方案必须升级 SDK，也不能把周边定位误当精确字符位置接口。[IPC schema](../../packages/space-ipc-schema/src/channels/session.ts#L1028) · [Host 读取](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L4721)
- 搜索 around 窗口有独立 owner、epoch 和恢复闭包，可恢复旧集合、游标和原来源。部分或歧义历史状态也已被单独表达。[openLocatedHistory](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L1321) · [历史置信状态](../../packages/space-ipc-schema/src/channels/session.ts#L1001)

### 不能省略的反例

1. **同一 entry 下有多个同类型显示块。** 现有接缝只接受相同类型＋entryId＋sourceRevision 在 view 与历史各唯一匹配；否则没有 savedItemId。删掉这条守卫而按文本/时间去匹配，会把同一回答的不同片段错当成同一位置。[映射和提前返回](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1743)
2. **保存历史只有一页，view 覆盖更小。** 没有 nextCursor 不代表保存内容已经全部显示。把入口仅绑 `hasMore` 会恢复这个不可达问题；`canOpenSavedPage` 的历史非空条件正是保留该页入口。[入口条件](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L894) · [首个保存页选择](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L1305)
3. **view 中还有未保存输出。** 强制以保存历史取代实时窗口后，用户可能暂时看不到当前输出；因此无锚点切换要由显式操作表达落点，提供返回位置和回到最新，而不是把自动切换伪装成无缝前插。[正文选择](../../apps/desktop/renderer/src/store/productSessionView.ts#L92) · [显式打开标记](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1710)
4. **历史修订变化。** 在旧集合上拼入新 revision 会破坏顺序与引用意义。当前读旧页检测 invalidation epoch，不兼容时保留旧可读投影并置 savedPageChanged；建议保持这种失败语义。[修订检查](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L1297)

所以本期可承诺的是“可读保存项有清楚的到达路径；普通浏览不丢当前阅读控制权”，不能先承诺“任意旧会话都没有跨来源跳转”。来源术语可留在代码内，产品文案只说明“将定位到最近的历史消息”。

## 3. 搜索交互应先保住确定性

当前本地查找扫描已挂载行的文字，排除 hidden/inert/aria-hidden、footer 和折叠 details；以匹配的显示行计数，并非字符串的全部出现次数。它能包含当前已显示的实时内容。[usePageFindMatches.ts](../../apps/desktop/renderer/src/features/session/usePageFindMatches.ts#L7)

SDK 搜索则经过 250ms 去抖取得相关 hits，再通过独立引用读取原文。现在点击结果先预览，随后“在对话中查看”才 around 定位；它不等于本地 find 的 next/previous match。[ProductHistorySearch.tsx:39](../../apps/desktop/renderer/src/features/session/ProductHistorySearch.tsx#L39) · [原文和定位入口](../../apps/desktop/renderer/src/features/session/ProductHistorySearch.tsx#L180)

与产品评审的共识：

- Ctrl+F 默认保留明确的“已加载内容”；另提供“搜索此对话”。运行中尚未保存的内容不应因默认切换而突然查不到。
- 可定位命中可在第二个小交付中默认先尝试 around 直达，保留独立“查看原文”；unavailable 则转原文预览，stale 则保留查询并要求重查。
- 先明确命中结果与计数单位，再决定合并搜索。不能把 SDK 返回相关结果条数写作全文出现次数。
- 虚拟化开始前，要把本地 find 从 DOM 改为逻辑行寻址；只扫描挂载行会让搜索范围随滚动改变。逻辑搜索还须明确折叠/未补齐正文是否纳入，不应为了“完整”默认拉取所有工具正文。[F144 导航契约](../features/v0.2.x-plus.md#L41)

## 4. 阅读位置与性能的两处隐患

**行锚点不等于文字锚点。** 当前记录 `data-msg-id` 和整行 top 相对 viewport 的偏移；适合页前插和相邻稳定行，但长单条内部重排时，相同像素偏移不保证同一句文字仍在眼前。现有保存/恢复逻辑应延续，是否需要段落/字符级锚点由巨型单条的宽度与字号变化样本决定，不在首期假设新锚点体系。[采样](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1244) · [恢复](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1559)

**有界读取不等于总成本有界。** `MAX_CACHED_SESSION_HISTORIES = 32` 是会话缓存数量，不是单会话页数上限；同修订相邻页可以继续累计。`content-visibility` 会减少屏幕外布局/绘制，仍有消息 DOM、字符串、React 节点和缓存成本。F144 是另一条有明确目标的工程工作，首期边界入口修正无需等它。[缓存逐出](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L295) · [DOM 挂载](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2621) · [content-visibility](../../apps/desktop/renderer/src/styles.css#L1353)

现有 Markdown 的缓存键包含完整内容，每次流式内容变化通常产生不同键；缓存已完成正文不代表流式追加解析成本已解决。应测长 Markdown 追加更新，再决定采用冻结稳定块、节流或延迟高亮。思考分段只解决该思考展示，不自动解决助手长正文与巨型工具轮。[Markdown 缓存](../../apps/desktop/renderer/src/features/session/messages/Markdown.tsx#L56) · [实际缓存键](../../apps/desktop/renderer/src/features/session/messages/Markdown.tsx#L372) · [ThinkingText](../../apps/desktop/renderer/src/features/session/messages/ThinkingText.tsx#L5)

## 5. 共同建议的最小交付

### 第一片：历史边界与阅读落点

用已有条件生成清晰边界行：可加载、加载中、失败重试、需显式跳到保存历史、已到可证明的分支起点。不可仅凭历史非空声称“还有更早内容”，不可仅凭无游标声称完整历史已显示。来源部分/歧义时保留可读记录并解释范围。按钮可键盘到达；手动入口与自动读取共用现有请求和恢复路径。[当前边界条件](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1710)

统一底部动作的可见文字为“回到最新”；保留“返回原处”独立落点，不加入没有依据的未读数。退出搜索/切会话/用户再滚动时，继续让旧异步恢复失效。[最新动作](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2244) · [原处入口](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2794)

### 第二片：查找范围与结果直达

本地范围名称澄清，显式会话搜索；默认尝试定位命中、原文退路、查询与焦点恢复作为完整垂直路径验收。沿现有 around 能力实现，不先建立全局索引或改造 SDK。[现有定位与返回](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1381)

### 独立后续：按测量推进 F144

分别跑短消息规模、长 Markdown 单条、大量工具单轮三个维度。若 DOM/布局主导则按 F144 推进；若解析或 IPC 主导则先优化对应路径。首期不新增全量目录、不重做全部工具分组、不引入通用状态机与多余配置。

## 6. 接受与否由哪些证据决定

| 样本/动作 | 核对内容 |
| --- | --- |
| 一页保存历史比 view 多，且没有 nextCursor | 首个保存页全部可达；入口不被隐藏；无强映射时落点明确 |
| 同文同时间/一个 entry 多块/缺身份旧记录 | 不按正文或时间合并；无法映射时仍可显式阅读 |
| 保存页连续上翻、反向读回、搜索 around 后返回 | 同修订所有可读 ID 可达、顺序正确、无重复，恢复原集合/游标/焦点 |
| 阅读中输出、换会话、返回最新、迟到请求 | 不抢位置，不串会话，不安装旧修订，不把来源切换当新消息 |
| 长单条改宽/改字号、图片/正文补读、工具展开 | 分别记录文字段落是否保持、行锚点漂移、输入延迟；不只看整行 top |
| 1k/10k/30k 短条与单个巨型轮 | 首屏时间、IPC字节、解析、DOM数、heap、主线程长任务分开报告 |
| 文字只在live/折叠细节/未加载保存页 | 两种范围的命中符合标签；无结果不等于历史不存在；定位失败有原文路径 |

现有浏览器测试已覆盖唯一底部控制、迟到结果、显式保存入口、原生拖动与短视口等断言；本次只读取，没有重跑或把设计预算当实测结果。[conversationHistoryNavigation.browser.test.ts](../../apps/desktop/renderer/src/shell/conversationHistoryNavigation.browser.test.ts#L116)

## 7. 交叉讨论结果与未解问题

与 [产品交叉评审](session-history-product-cross-review-2026-11-09.md) 共识：Ctrl+F 默认保留已加载内容；跨来源守住身份与显式跳转；首期不做全量目录、未读计数或整轮重组；命中直达与原文降级可作第二片。分歧已收敛，不将“统一路径”理解成客户端重新拼接正文。

仍需样本回答：自动对齐失败在真实旧会话中的占比；当前源窗口能否提供足够“有更早内容”的可证明信息；长单条重排实际漂移；用户是否更常找关键词还是话题；真实主要成本是否值得提前推进 F144。没有这些证据前，不改 F144 排期，不预设 SDK 新接口，不给出性能改善百分比。
