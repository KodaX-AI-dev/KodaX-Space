# 一段会话从哪里接着读，能在读到的位置做什么？

2026-11-07。建议先让最近一页已保存记录可直接到达，让查找结果与计数一致，并把分叉、回退的目标交给 SDK 解析。连续浏览的下一步取决于同一位置能否在实时显示、历史分页和搜索之间复现。当前的单一“回到最新”按钮、阅读旧页时冻结画面，以及有界加载都值得保留。[ADR-010](../ADR/ADR-010-sdk-product-output.md) · [既有浏览器回归](../../apps/desktop/renderer/src/shell/conversationHistoryNavigation.browser.test.ts#L34)

## 从用户手势看现在的行为

| 任务 | 实现与可见后果 |
| --- | --- |
| 打开持久化会话 | Host 首次先建立 SDK view，再取最多 150 个历史条目的最新页。Renderer 已保存该页，但有 view 时优先展示 view。SDK 的 view 截取末尾 150 个**显示项**，历史则先分页再将一条记录投影成零至多个显示项。因此首屏看得到“最新”并不能证明已经看到了最新历史页的全部内容。[Host:4612](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L4612) · [Store:89](../../apps/desktop/renderer/src/store/productSessionView.ts#L89) · [SDK view:687](../../../KodaX/src/session-view.ts#L687) · [SDK history:26](../../../KodaX/src/client-history.ts#L26) |
| 向上翻并再向下读 | 主进程把带 cursor 的页标为 hasNewer。Renderer 切换单页，记录已走过的 cursor/revision 并可按原路回读。两页没有重叠时用新页靠近接缝的一端落脚。若最新历史页比 view 覆盖更多可见内容，从 view 直接用最新历史页的 nextCursor 上翻便会跨过这部分；若 SDK 历史只有一页，亦没有旧游标可触发切换。后者尤其适合用单个多工具长轮验收。[IPC:1710](../../apps/desktop/electron/ipc/session.ts#L1710) · [分页:917](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L917) · [接缝:1454](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1454) |
| 阅读旧位置时有新输出；回到最新 | 新的 view 在后台更新，旧页仍选中。返回按钮会取消旧页视口恢复、重新选择最新数据再到底部。这个行为已有浏览器保障；按钮按滚动位置或 hasNewer 显示，其状态本身无法区别“下面原来就有历史”和“刚有新的已提交内容”。后者若要提示，可直接写“有新消息”，只按可信的提交变化触发，勿用每个 token 或笼统 view revision 计数。[Store:76](../../apps/desktop/renderer/src/store/productSessionView.ts#L76) · [返回:2013](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2013) · [按钮:2419](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2419) |
| 搜索、预览命中、读前后文 | 同一 Ctrl+F 输入驱动两套结果。数字和上下键只看 displayMessages，SDK 则搜历史，选中结果时用引用读正文，在浮层中替换列表。观察到当前窗口没有匹配时，0/0 与一条可点的历史命中同时出现。当前搜索结果引用可读单条正文，公开分页参数仅有 cursor/limit；搜索的 entryIndex 只在当前 revision 有效。[当前结果:1226](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1226) · [计数/导航:2359](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2359) · [预览:58](../../apps/desktop/renderer/src/features/session/ProductHistorySearch.tsx#L58) · [SDK 分页:432](../../../KodaX/packages/coding/src/client-contract.ts#L432) · [SDK 命中:629](../../../KodaX/packages/coding/src/client-contract.ts#L629) |
| 扫视侧轨、定位某次提问 | 侧轨遍历当前 displayMessages，只收用户消息与本地 echo，再从 1 编号。悬浮显示的 #N、无障碍按钮名都取此编号，换页后另一个提问也可显示 #1。跨页开头若只有上轮后半段，当前页没有其提问锚点。“本段提问”配短摘要更贴切，全局轮号需要可证明的位置。[提问锚点:1125](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1125) · [标签:2496](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2496) |
| 在消息下分叉、回退 | 两个处理器都重新从当前窗口投影选择用户轮次。没有 historyBoundary 就在调用 IPC 前弹相同的“等待”提示。当前窗口、整轮的结束位置、当前分支末尾各自回答不同问题。按钮应清楚说明例“保留到该轮回复结束”，由 SDK 确认目标；此前按选择操作的浏览器对照和隐藏工具结果反例已记录。[分叉:2093](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2093) · [回退:2165](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2165) · [操作入口调查](space-history-action-entrypoints-2026-11-07.md) |
| 展开工具、读长正文、失败恢复 | 当前补读遍历所选窗口的非 draft 项，按 item/part/version 去重。同一读取域的当前工作树只会出现一次通用警告。适合把正文读取失败和重试附在受影响的项上，让仍可用的预览、其它正文和用户阅读位置都能继续使用。需要考虑找文字、复制完整正文和无障碍阅读时的显式加载。[补读循环:845](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L845) · [失败分支:893](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L893) · [帧内批处理:60](../../apps/desktop/renderer/src/store/productSessionView.ts#L60) |

## 两个方案及选择条件

**A．保留实时窗口和已保存记录两种读法。** 最近一页历史要能主动打开，即使 history.nextCursor 为空也一样。把“用户选择看实时/已保存”与“历史页后面还有较新页”的标志解开。在读历史的界面保留当前页/相邻页动作和一个“回到最新”；从实时某个位置切入时，暂存该会话的来源、行和视口内偏移。返回原处时能确认同一位置就恢复，来源已轮换时保留阅读页、告知原位置不可恢复，并给用户选择最新。这样搜索命中的长文仍可先在浮层读，按 Esc 返回原位置。搜索控件要么以一种结果驱动计数、箭头和预览，要么明确区分“在本段查找”和“搜索已保存记录”，避免把只在工具/草稿中出现的本地命中悄悄漏掉。默认侧轨显示当前段的提问摘要。SDK 声明 partial/ambiguous 时说明可读范围，不推算全局轮号或隐藏可读段落。[窗口选择](../../apps/desktop/renderer/src/store/productSessionView.ts#L89) · [视口捕获](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1294) · [搜索范围](../../../KodaX/packages/coding/src/client-contract.ts#L567)

**B．同一滚动区按所读位置取相邻内容。** 首开仍可使用 SDK view；浏览超过实时窗口或选择“在对话中查看”时，由 SDK 在指定来源的位置取一段带前后文的保存记录。进入后，前后翻均围绕锚点读，搜索结果直达真实段落；摘要/详细视图只改变展示。每次切换保持单一正文来源、有限页缓存和已读位置。定位失败时保留当前可读页，给出刷新、预览或回到最新。当 SDK 能对旧会话可靠说明覆盖范围、将选中位置定位到保存页、区分过期/缺失/未保存时，B 才能对用户兑现连续性。阅读锚点可定位某条消息的一部分；执行回退仍须校验同一轮完整持久化边界和当前 head。[ADR-010](../ADR/ADR-010-sdk-product-output.md) · [SDK 两种修订](../../../KodaX/packages/coding/src/client-contract.ts#L438) · [边界反例](sdk-view-history-action-boundaries-2026-11-07.md)

**取舍。** A 可以先解决可达性、错误计数和反馈，不需要为一次阅读扫描全部历史；代价是部分跨来源跳转只能预览或手动翻页。B 更符合找回“当时那次讨论并从那里操作”的任务，成本在 SDK 来源映射、过期恢复和客户端动态布局。先用反例验证过渡接缝，再决定是否增加窄的按位置读取能力。REPL 已有一个同源交叉样本：记录来源、文本内字符位置与屏幕行，修订轮换时围绕原锚点重读，遇到歧义放弃替换；旧数据缺少强身份时仍会失败。Space 可以复用这些验收语义，其浏览器布局应继续使用现有消息锚点。F144 的“无需 SDK gate”和“累计模型具有稳定逻辑行”是规划假设，有界 DOM 的价值应由性能测量评估，不能把虚拟化作为恢复语义的前提。[REPL 锚点](../../../KodaX/packages/repl/src/ui/utils/prompt-history-browse.ts#L40) · [REPL 跨修订与歧义用例](../../../KodaX/packages/repl/src/ui/utils/prompt-history-browse.test.ts#L89) · [F144](../features/v0.2.x-plus.md#L33)

## 验证与未解问题

- 本次在 Chromium 中用真实 ConversationStreamV2 和模拟 IPC 做了临时对照。让最新历史页含实时窗口没有的一行，首屏只显示实时输入，切到较早页后直接显示相邻页；将检索词只放入 SDK 搜索结果，顶部显示 0/0、下拉有一个结果，点击后全文在浮层，正文流里没有命中。这是构造的覆盖差异，不能据此断定用户原会话具体哪些行受影响。既有“唯一底部按钮、相邻页及迟到结果归属”浏览器回归本轮实际重跑 1/1 通过。[对照所用公开组件和夹具](../../apps/desktop/renderer/src/shell/conversationHistoryNavigation.browser.test.ts#L8)
- 优先验证一个跨 150 显示项的工具密集轮、只有一页的保存记录、重复提问、位于未加载页的命中和部分来源历史。记录每个预期内容能否触达、来回是否保留阅读行、敲 Enter 与点击是否选同一命中。同时覆盖滚轮/键盘、换会话后迟到返回、长正文补全后高度变化和旧页收到新输出。操作验收需比对实际保留的轮次和隐藏工具结果。[分页与输入既有回归](../../apps/desktop/renderer/src/shell/conversationHistoryNavigation.browser.test.ts#L155) · [SDK 完整轮次反例](sdk-view-history-action-boundaries-2026-11-07.md)
- 未解问题是实际用户会话中窗口覆盖缺口的规模、按锚点寻址在旧会话中的覆盖率，以及远距离搜索命中的可接受延迟。用匿名计数、只读副本和长轮夹具量出这些值，再确定 B 的必要接口与迁移时点。无依据的全局未读数量、全量目录及默认常驻第二套原文不应设为验收目标。
