# 怎样让长会话从最新输出到旧记录都能顺畅阅读？

建议优先补齐已保存历史的可达性，让翻阅、查找和返回都围绕用户正在读的位置。Fork 和回退另由 SDK 验证应保留到哪一轮。做完这两件事，再用长会话实测决定是否需要虚拟列表和全局提问目录。

范围为共享 Coder 的 Space、SDK 和同一 SDK 的终端客户端。以下把实测、源码判断和候选设计分开。现场依据来自前一轮对 `20260928_160252_occb6cfe737bfa` 的只读调查，本轮页缝实验使用独立临时会话。

## 哪些体验有具体反例

| 用户在做什么 | 看到的现象与原因 |
| --- | --- |
| 打开会话，一直向上翻 | 当前 view 和最近一页已保存历史各有范围。Space 用历史页是否有更新页决定显示哪份内容。最近一页的这个标记恒为假，有 view 时它就被 view 遮住。上翻取的是这页之前的游标。有些已保存内容因此从两个方向都翻不到。见下方实验。[历史 IPC](../../apps/desktop/electron/ipc/session.ts#L1685) · [分页安装](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L917) · [显示选择](../../apps/desktop/renderer/src/store/productSessionView.ts#L89) |
| 搜索记得的一句话 | Ctrl+F 的计数和箭头来自当前显示内容，同一输入框的下拉来自 SDK 对原始记录的相关度检索。浏览器对照出现了本窗 0/0、下拉 1 条，点中只能在浮层读正文。SDK 检索默认取 8 项、上限 20，不能拿返回数充当全文出现次数。[窗口匹配](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1226) · [搜索浮层](../../apps/desktop/renderer/src/features/session/ProductHistorySearch.tsx#L58) · [SDK 检索](../../../KodaX/packages/agent/src/session-lineage/history-retrieval.ts#L487) |
| 想知道自己读到了哪一次提问 | 侧轨收集本窗 user 和本地回显，以数组长度从 1 编号。换窗会重排，三项以下侧轨消失。`/history` 只取旧缓存中最近 20 个可见提问，`/tree` 描述会话的父子关系。三种入口回答的是不同的问题。[侧轨](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1125) · [两个命令](../../apps/desktop/renderer/src/shell/BottomBar.tsx#L1378) |
| 浏览旧轮，点“从这里 Fork” | 现场 view 122 个显示项、4 个用户提问，直接带历史边界的项为 0。已取回的历史有 216 个显示项，投影后仅 1 个提问能连上边界。缺边界的分支弹提示后就返回，继续等待不会启动定位。另一个隔离实验按“显示成功”的工具行边界 Fork，确实遗漏了已保存的工具结果。行按钮、菜单和命令还从不同缓存取目标。[现场与入口实测](space-history-action-entrypoints-2026-11-07.md) · [SDK 派生实验](sdk-view-history-action-boundaries-2026-11-07.md) |
| 仅想扫一眼旧回答 | 当前正文补读 effect 遍历选中窗口里的非 draft 项，对不完整的文本和工具参数发起读取，范围可覆盖折叠或不在视口的内容。现场 34 次补读有 12 次因为 SDK 路由旧 ID 失败，逐项重试和 toast 放大影响。已有源码修复能抑制这一故障。何时值得补多少正文仍是独立的设计取舍。[补读调度](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L840) · [旧会话修复及部署状态](../../docs/KNOWN_ISSUES.md#L16055) |

### 两组可重复的页缝实验

用 SDK 的 FileSessionStorage 分别写入 120、200 条短消息，用户和助手交替，每行带唯一序号，无压缩、无流式输出、无显示 checkpoint。启动独立的本地源码 Runtime，订阅 `sessions.observeView`，按 Space 的参数调用 `sessions.readHistory({limit:150})`，沿返回的游标读取。将真实返回值交给 Space 的 `replaceProductSessionView` 和 `installProductHistory`，按生产调用点传入来源标记，记录实际选中的显示项。两组历史状态均为 `resolved`。[SDK 首窗取数](../../../KodaX/src/sdk-runtime.ts#L4591) · [SDK 显示项上限](../../../KodaX/src/session-view.ts#L821) · [Space 读取参数](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L4604) · [Space 选窗](../../apps/desktop/renderer/src/store/productSessionView.ts#L89)

| 保存消息数 | 当前 view | SDK 历史首页 | 沿普通翻页能看到的范围 | 遗漏 |
| --- | --- | --- | --- | --- |
| 120 | 41–120 | 1–120，无下一页游标 | 41–120 | 1–40 |
| 200 | 121–200 | 51–200，有下一页游标 | 121–200 → 1–50 → 121–200 | 51–120 |

这是 SDK 实读加 Space 选窗的组合实验。另一组 Chromium 对照用真实会话组件和隔离 IPC 验证了历史首页特征行没有进入会话流。以上数字不能外推为用户原会话漏掉的条数。普通页面下翻、唯一“返回最新”按钮以及冻结页不被新帧覆盖已有回归，改造应保留这些行为。[浏览器交互调查](session-reading-ux-2026-11-07.md) · [现有导航回归](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1958) · [原分页修复](../KNOWN_ISSUES.md#L16040)

## 用户应能预期的行为

| 场景 | 建议的可见行为 |
| --- | --- |
| 打开与跟随最新 | 先显示最近内容，处在末尾时跟随输出。用户上翻后保留正在读的段落及其相对位置。有新输出时沿用一个“回到最新”入口，可提示有更新；只在数量可证明时显示条数。 |
| 相邻翻阅与换视图 | 上翻能进入最近已保存记录，再按顺序往前。能证明同一条记录时保持页缝连续。暂时无法对齐时，给出明确的“查看已保存记录”入口和返回路径。展开工具、更改字号或从摘要切详细时，保留原段落或所属提问。加载反馈放在触发处。 |
| 快速浏览和定位 | 正文以提问、回答为主线，思考、工具和长输出沿用可折叠细节。侧轨用提问摘录指示当前段落，范围限于可定位的问题。一次会话内可记住从哪里打开搜索或旧记录，返回恢复原位置；“回到最新”有独立含义。 |
| 查找关键词 | 保留“本页查找”和“搜索会话”两种明确意图。本页的数字、箭头、Enter 指向同一组屏幕命中。会话搜索显示相关结果，保留查询和结果选中态。能证实对应当前分支时提供“在对话中查看”，否则提供原文与返回。来源未知时只说明可读原文。 |
| 从旧回答继续 | 建议以用户的一轮提问及其全部已保存响应为操作单位。同一轮只给一个明确目标，例如“保留到这轮，创建分支”。回退确认展示保留到哪一问和后续会话记录会怎样，避免用窗口内序号指代目标。菜单的“派生当前会话”和“撤回最近一轮”始终以会话实际末尾为准。普通输入继续发往当前分支末尾。 |
| 查看部分恢复或过时的记录 | 已读到的段落可以保留。需要新数据时，SDK 能证实原位置才重新定位；否则就地说明已变化，提供重新选择、重搜或返回最新。可读、可定位、可执行变更分别判断。草稿、压缩副本、已离开当前分支的命中都可能只满足其中一部分。 |

这些是产品提议。底层已分别为阅读与变更定义了约束。当前 view 是 SDK 整份替换的有界投影，含尚未保存项。已保存历史按修订分页。搜索命中使用原始转录的引用，归档及压缩记录与当前分支不总是一一对应。操作边界表示一条 canonical 消息之后，一轮还可能包含不可见的工具结果。跨修订的 cursor、行 ID、正文相同、时间相同都不足以证明操作位置。[ADR-010](../ADR/ADR-010-sdk-product-output.md) · [历史搜索公共投影](../../../KodaX/src/sdk-runtime.ts#L9100) · [操作契约](../../../KodaX/docs/SPACE_SDK_SEAMS.md#L320)

## 方案取舍与实施顺序

1. **先在 Space 打通最短的阅读路径。** 把“用户选了实时还是已保存记录”与“当前历史页前后是否还有页”分开。直接复用已经取回的历史首页，包含只有一页的情况。同修订内可按已知来源恢复阅读位置，无可验证锚点时用显式切换；所有页都能读到。同步校正搜索范围与本窗提问编号。优先补读正在阅读、用户展开或明确要复制的内容；全文复制须实际读完整。先量首屏正文补读量，再定预取预算。[当前状态](../../apps/desktop/renderer/src/store/productSessionView.ts#L73) · [分页导航](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L1240) · [搜索实现](../../apps/desktop/renderer/src/features/session/ProductHistorySearch.tsx#L30)
2. **Space 与 SDK 共同验证两项能力。** 一项是只读定位，给定所见项或搜索引用，返回能验证的阅读窗口与落点，或仅原文可读、来源已变化。已有同修订、同窗口身份直接复用。另一项是解析本次 Fork/回退应保留的完整轮尾，覆盖隐藏结果、跨页和旧无 ID 的记录。写入时保留现有 sourceRevision 校验，回退还需把用户确认时的 expectedHead 贯穿 Space 调用链。SDK 拥有来源和分支，Space 持有屏幕偏移、焦点、返回路径和用户选择。行、菜单、命令共用操作逻辑并保留各自作用域。两种能力的输入可能相同，但只读定位成功不能授权改写会话。[SDK 来源丢失点与候选接缝](sdk-view-history-action-boundaries-2026-11-07.md) · [上下游入口](space-history-action-entrypoints-2026-11-07.md) · [REPL 现有来源锚点及有限窗口](../../../KodaX/packages/repl/src/ui/utils/prompt-history-browse.ts#L92)
3. **有定位契约后再提升连续性。** 同一修订只保留相邻的有限页，围绕当前段落换入换出。已有页缓存和索引优先复用。用动态高度、长思考、图片、旧会话及持续输出压测，达到需要时才换虚拟列表。已有 F144 的有界 DOM、焦点和锚点验收值得沿用；其中“现有能力足够整个方案”与“已有可累积的稳定行索引”的前提要在共享 Coder 路径重验。[F144 原计划](../features/v0.2.x-plus.md) · [历史性能样本](../KNOWN_ISSUES.md#L11816)

交叉评审也检查了其他选择。只加虚拟滚动可以减轻排版，却仍会跳过上述 70 条。全量拉取再由 Space 拼流式尾巴要解决重复正文、草稿提交和来源歧义，正是 ADR-010 已记录的回归。由 SDK 提供一个全新的统一时间线协议长期可行，但需要覆盖项身份、草稿转正、压缩、失效和迁移；目前有更小的可验证交接。全会话提问目录有助于“记得话题、忘了关键词”，值得用这个任务单独比较，暂不为显示一个全局序号而完整扫描正文。[ADR 的复现与取舍](../ADR/ADR-010-sdk-product-output.md) · [现有终端客户端对照](../../../KodaX/packages/repl/src/ui/utils/prompt-history-browse.ts#L40) · [侧轨现状](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L1125)

## 对局部轮号与写入时机的交叉复核

**保留三份数据各自的作用，收敛谁能决定操作目标。** 当前 view 可以显示未保存的输出，最近装入的一页 history 只能为该页可证明来源的项提供消息边界。即使 view 项带 inputId/outputId，匹配项也可能在别页，或者对应多个不同边界。旧用户缓存还承担临时输入等职责，不能假设恒空；仅共享 Coder 的持久历史操作应移除对它的依赖。行数、token、重试分支的数量不足以说明哪些生命周期保护可以删除。[边界匹配与临时输入](../../apps/desktop/renderer/src/features/session/productConversation.ts#L108) · [单页保存](../../apps/desktop/renderer/src/store/productSessionView.ts#L89) · [旧请求失效保护](../../apps/desktop/renderer/src/shell/sessionHistoryPaging.ts#L1240)

**页内轮号既影响操作前，也影响成功之后。** 隔离内存对照用真实投影、回退资格函数与 store：将第 41、42 问构成一页，得到下标 0、1。第 42 问在页尾时不可回退，将第 43 问加入投影后，原第 42 问变为可回退。另在旧缓存预置第 1、2 问，按页面第 41 问的下标 0 调用现有 Fork 和回退缓冲函数，子缓存复制了第 1 问，旧源缓存截断后也保留了第 1 问。实验只调用本地函数，未发 IPC。共享 Runtime 实际写盘使用 entryId/sourceRevision；局部序号仍传给子会话元数据，谱系面板还据此排序、展示。验收要同时核对操作可用性、确认文案、磁盘结果、成功后立即展示和重新打开后的谱系。共享 Coder 应从权威结果恢复，只有来源可证明时才复制本地附属内容；若拿不到全局轮号，可用提问摘录展示。[赋号](../../apps/desktop/renderer/src/features/session/productConversation.ts#L173) · [回退资格](../../apps/desktop/renderer/src/features/session/turnIndex.ts#L74) · [本地复制](../../apps/desktop/renderer/src/store/appStore.ts#L9729) · [本地截断](../../apps/desktop/renderer/src/store/appStore.ts#L9809) · [子会话元数据](../../apps/desktop/electron/kodax/host.ts#L1197) · [谱系展示](../../apps/desktop/renderer/src/features/session/SessionLineagePanel.tsx#L150)

**点击时只读解析，确认与写入绑定同一份结果。** 行点击应传当时所见项的来源引用及其窗口版本，避免回调在新快照上按同一个数字重选。会话菜单的当前末尾、上一轮则由 SDK 根据该会话解析。只有 SDK 能证明仍是同一目标时才返回完整轮尾与当时的修订。回退同时返回当时的分支头 expectedHead（可为 null）。将同一结果用于确认和提交；确认期间有变化就返回冲突，保留用户所读位置并允许重新选择。按需读缩短了过期窗口，无法消除并发。SDK Product 接口要求 expectedHead；Space 实际连接 Runtime，现有 IPC 未传该字段，该路径只在收到它时检查。Fork 的来源修订仍按既有契约校验。[行回调重新取快照](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2093) · [Space IPC](../../packages/space-ipc-schema/src/channels/session.ts#L1141) · [实际 Runtime 入口](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L1763) · [SDK Product 接口](../../../KodaX/packages/coding/src/client-contract.ts#L209) · [Runtime 条件校验](../../../KodaX/src/sdk-runtime.ts#L9617)

**回退结果还要交代运行是否停止。** 当前 Host 先取消权限与提问交互、尝试取消运行，再向 SDK 提交截断。若之后修订冲突，历史未改写，交互或运行可能已经停止。建议只读解析和取消确认均不触发停止；活动会话沿用明确的“停止并回退”意图，确认后重新验证相同目标与所确认的运行，命令返回实际发生的停止与截断结果。测试确认期间另一轮启动、确认后停止成功但写入冲突两种时序。这是源码顺序导出的风险，本次未在用户会话执行停止或回退。[Host 顺序](../../apps/desktop/electron/kodax/host.ts#L1292) · [现有回退产品语义](../USER_MANUAL.zh-CN.md#L463)

**工具结果完整性直接检查持久记录。** 隔离 Fork 已复现遗漏 tool_result；SDK 有请求前工具历史整理路径，且截图中的边界预检在发出 Fork IPC 前就返回。不能用这个实验归因截图里的 Provider 鉴权失败，也不能用“子会话还能发消息”证明保存前缀正确。[工具结果实验](sdk-view-history-action-boundaries-2026-11-07.md) · [工具历史整理](../../../KodaX/packages/coding/src/agent-runtime/catch-terminals.ts#L101) · [行预检](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2102)

**附属通知也是入口一致性的一部分。** 消息行回退未传本地通知截点，菜单和斜杠命令在有下一条可用提问时会传。Main 仅在截断成功且收到截点时清理通知存储。用相同会话副本分别从三个入口回退，比较刷新前后的本地通知和谱系；仅凭页尾没有下一条，无法判定整段历史的通知截止位置。[行入口](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2187) · [菜单](../../apps/desktop/renderer/src/shell/SessionMenu.tsx#L248) · [命令](../../apps/desktop/renderer/src/shell/BottomBar.tsx#L1968) · [Main 截断条件](../../apps/desktop/electron/ipc/session.ts#L235)

## 决定方案去留的验证

- **能读全。** 重放上述 120/200 条样本，从最新向上再往下，每个可显示的已保存项都能抵达，顺序正确，无凭空重复。再加一个超过 150 个显示块的单轮，区分消息数、块数、轮数。
- **读得稳。** 在旧回答中间暂停，触发新输出、工具展开、字体变化、旧页读到一半发生修订变化。记录锚点及偏移、键盘焦点、页面跳动；返回最新确实回到最新，用户主动搜索后的返回尽量恢复原段。不可重定位时保留可读内容并给出真实状态。
- **找得准。** 覆盖本页零命中但全会话有结果、同文重复、仅归档原文、压缩后或回退后的旧命中；键盘与鼠标选中一致，退出能回原位置。让用户在记得关键词和只记得话题两种条件下找同一段，记录找到正确段落的比例、用时和误跳次数，再决定目录的价值。
- **改得对。** 在隔离副本比较派生后保存的实际记录。旧无 ID、隐藏 tool_result、跨页整轮、活动中或点击后有新输入都要覆盖，并交叉验证消息行、菜单和命令。过时目标应要求重新选择。Fork 保留源会话，回退仅截断所选位置以后的会话历史。
- **成本有界。** 比较普通会话、含数 MB 思考的已有极端样本和万行混合高度基准。记录首屏可读时间、IPC 补读字节、DOM 数、峰值内存、锚点漂移及滚动长任务。F144 的“万行时挂载 ≤500 行、布局稳定后锚点偏移 ≤2 px”是待测目标，尚非当前版本数据。[已有性能目标](../features/v0.2.x-plus.md#L55)

**未证实。** 用户原会话沿桌面滚动究竟跳过哪些行，本轮没有逐项核对；所提 UI 在真实任务中能省多少时间也尚无用户测试。全局目录的收益、SDK 定位可跨哪些旧格式、极端数据的性能瓶颈，以及按需查询和随数据携带轮尾描述哪个成本更低，均需上述实验裁决。本文是方案研究，不代表发布状态。
