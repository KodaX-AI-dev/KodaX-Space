# Fork / 回退为何在历史加载后仍提示缺少边界？

2026-11-07。结论：这是 SDK 显示项来源信息与 Space 操作入口没有完整接通的问题；不能用重复加载或移除边界校验解决。只给 view 补上消息边界也不足以保证“整轮操作”正确，须先核对隐藏工具结果、跨页轮尾和修订失效语义。以下均为调研，不代表实现已完成。

## 范围与证据等级

- 现场为 `20260928_160252_occb6cfe737bfa`；通过公开 SDK 被动连接现有 coder Host，只读 view/history，没有在用户会话执行 Fork、回退、发消息或模型调用。
- 浏览器对照使用真实 Space 组件、隔离内存状态和拒绝写入的 IPC fixture；证明 Renderer 的路径选择，不能代替真实 SDK 存储变更验收。
- SDK 上游的独立源码与隔离存储研究见 [上游笔记](sdk-view-history-action-boundaries-2026-11-07.md)。原先拟议“view 全部带 historyBoundary”的测试是候选设计探针，不应当作既有契约的强制要求。

## 现场不是仍在加载

公开读取现场得到：当前 view 122 项、4 个 user、0 项直接携带 historyBoundary；readHistory 返回 216 个显示项，全部携带边界。把二者交给当前 projectProductConversation 后，4 个 user 只有 1 个得到边界。前三个旧 user 没有 inputId，最后一个新 user 有 inputId。Space 只按 SDK inputId/outputId 连接两种窗口，不按正文或显示 ID 反推来源，因此前三轮无法被连接。

这一结果与实现相符：`productHistoryBoundary` 优先使用 item 自带边界，再按输入/输出身份唯一连接历史边界；没有身份就返回 undefined。消息按钮发现 undefined 即弹“等待历史加载”，没有在此分支触发新的边界查询。[productConversation.ts:108](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/session/productConversation.ts:108)、[ConversationStreamV2.tsx:2087](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ConversationStreamV2.tsx:2087)、[ConversationStreamV2.tsx:2159](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ConversationStreamV2.tsx:2159)

浏览器对照构造两轮重复文本：view 使用旧 opaque ID，无 input/output ID；独立 history 全部提供正确 canonical 边界。点击第一轮 Fork 和回退后，唯一 IPC 为 settings.get，两个操作都在 Renderer 预检中返回，并各弹同一句等待提示。这排除了“SDK 已收到操作后拒绝”的解释。临时给对应 view 项注入已知正确边界，再点击相同按钮，就分别到达 session.fork 和 session.rewind；fixture 明确拒绝写入。

## Space 各入口没有使用同一份操作目标

| 入口                 | 当前来源                                               | 后果与依据                                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 消息下方 Fork / 回退 | productTranscriptSnapshot → projectProductConversation | 使用当前所选 SDK view/history 窗口，但旧项无身份时不能连接边界。[ConversationStreamV2.tsx:2094](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/ConversationStreamV2.tsx:2094)                                                                              |
| 会话菜单             | appStore.userMessagesBySession                         | 不读取 productTranscript。latest/previous 轮次与边界来自旧缓存。[SessionMenu.tsx:66](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/SessionMenu.tsx:66)                                                                                                    |
| 右键 Fork            | appStore.userMessagesBySession                         | 同样依赖旧缓存。[SessionContextMenu.tsx:38](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/SessionContextMenu.tsx:38)                                                                                                                                      |
| /fork 与 /rewind     | appStore.userMessagesBySession                         | 按旧缓存选 latest/previous 或用户索引，再检查边界。[BottomBar.tsx:1861](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/BottomBar.tsx:1861)、[BottomBar.tsx:1936](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/BottomBar.tsx:1936) |

共享 Runtime 的历史 IPC 返回 items:[] 和 productItems；product 分支安装到 productSessionView 后直接 return，不水合上述旧消息缓存。旧缓存可能为空，也可能只包含临时用户输入，并不能作为另一份操作权威。[session.ts:1695](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/session.ts:1695)、[sessionHistoryPaging.ts:917](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/sessionHistoryPaging.ts:917)

浏览器对照也验证了这个遗漏：即使 product history 已有两轮完整边界，只要旧 appStore 消息缓存为空，会话菜单的 Fork 与 Rewind 1 turn 仍禁用。因此单改 SDK 字段不能宣称所有入口闭环。

## 消息边界不等于轮次末尾

SDK 现有 historyBoundary 注释定义为完整 canonical **消息**之后的边界，而不是 user turn 末尾。Space 则用一个用户轮次索引驱动多个消息上的操作：遍历所选窗口时，每遇到一个带边界的后续项，就覆盖当前 user 的边界。它实际得到的是“当前所选窗口里该轮最后一个有边界的显示项”，没有证明该项等于完整轮尾。[client-contract.ts:772](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/client-contract.ts:772)、[productConversation.ts:176](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/session/productConversation.ts:176)

因此必须覆盖两个真实边界条件：工具结果可能是没有独立显示项的 user/tool_result 消息；一个长轮次可能跨历史页，当前页最后一项未必是完整轮尾。Space 旧历史路径已经有跨页轮尾辅助函数，但 Coder 共享 Runtime 现在走 productItems 分支，不能因旧辅助函数测试存在就认为新路径也覆盖了这些情形。[session.ts:435](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/session.ts:435)、[session.ts:477](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/session.ts:477)、[session-fork-rewind.test.ts:118](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/test/session-fork-rewind.test.ts:118)

## Main 与 Host 的校验应保留

Main IPC 先确保 Session 已恢复，再向 kodaxHost 提交输入边界。共享 Runtime 路径要求精确边界，将 boundaryId/sourceRevision 转成 SDK entryId/sourceRevision；它不会用 Renderer 的局部 turnIndex 重新决定磁盘位置。回退成功后会失效旧的正文历史缓存、重新取得 SDK view，并更新 Actor 观察。问题发生在得到正确目标之前，不应通过放宽这层保护来绕过。[session.ts:668](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/session.ts:668)、[session.ts:686](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/session.ts:686)、[host.ts:1121](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/host.ts:1121)、[host.ts:1249](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/host.ts:1249)、[runtime-host-adapter.ts:4262](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/runtime-host-adapter.ts:4262)

ADR-010 已明确：当前 view 与历史窗口分开选择，操作可用 SDK 来源身份连接，但不恢复客户端正文匹配、ID 解析或私有日志重建。任何方案都应遵守这个现有约束。[ADR-010:15](C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/ADR/ADR-010-sdk-product-output.md:15)

## 现有通过项的覆盖缺口

现有真实 SDK E2E 覆盖新生成消息上的消息行 Fork，以及 sourceRevision 过期拒绝后从 UI 回退。其输入由本地 Provider 新生成，不能覆盖无 input/output ID 的旧会话，也没有覆盖会话菜单/右键/斜杠使用旧缓存的问题。[sdk-unified-contract.spec.ts:51](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/sdk-unified-contract.spec.ts:51)、[sdk-unified-contract.spec.ts:241](C:/Works/GitProj/KodaX-AI/KodaX-Space/tests/e2e/sdk-unified-contract.spec.ts:241)

下一步验收应同时证明“可操作”和“操作位置正确”：旧消息、重复文本、相同时间、成功/失败工具结果、跨页长轮次、元数据/检查点写入后的修订失效、并发新输入、多个入口一致，以及 Fork 不改原会话、回退只移除所选轮之后的历史。

## 不采用的捷径

- 仅改等待文案或去掉 Renderer 预检：不能产生 canonical 目标，Main/Host 仍应拒绝缺失边界。
- 按正文、时间、局部轮次索引或解析 SDK ID 猜位置：旧会话允许重复文本和缺失身份，违背 ADR-010。
- 切换为同时渲染 view 与 history：会重引入重复显示与两份正文权威，且不能解决隐藏工具结果或源修订变化。
- 把 historyBoundary 当作持久字段无限复用，或遇 resync 自动改用当前最新轮：会改变用户选择；应重新读取并要求重新选择/确认，不能悄悄变更操作目标。

## 推荐的最小完整方案

以下是结合上下游证据的设计判断，不是已经实现的接口。

1. **操作目标由 SDK 从 canonical 来源解析。** 保留已有 historyBoundary 的“消息之后”语义；“整轮之后”必须包含该轮已保存的隐藏工具结果，跨页也不能用可见页尾替代。SDK 在读取来源时保留显示项与 canonical entry 的关系，旧无 input/output ID 消息也应按来源定位。优先采用用户操作时的窄只读解析，返回精确目标和当时的 sourceRevision，继续复用既有 Fork/Rewind mutation。这样不要求 Space 复制历史遍历，也不要求每个流式帧预计算整轮末尾；它的代价是新增公开接缝及相应传输回归。携带明确整轮目标字段仍是备选，但不能通过重新解释现有 message boundary 实现。
2. **Space 统一读取 SDK 操作目标，保留入口各自的选择范围。** 消息行作用于所见、所选轮；会话级 Fork 作用于当前会话的实际末尾；“回退 1 轮”作用于实际最新轮之前。浏览旧页不能悄悄改变会话级菜单含义。消息行、菜单、右键和斜杠入口应共用同一个选择/调用路径，不再分别从旧缓存推导 authority。Mock 与独立非共享 Runtime 兼容路径保持明确分支。
3. **修订与生命周期保护。** 操作 revision 仅作为短期快照事实，不写回持久 UI checkpoint。来源缺失、未提交输出、加载中、原 Session 活动、目标过期应区分；陈旧选择不自动升级为当前末尾。SDK 已校验 sourceRevision。回退的 expectedHead 需要从确认贯穿到提交：Space 当前调用 Runtime 接口时未传该字段，SDK 在收到时才比较。只读解析、停止运行与截断分别有可观察的结果，验收见[交叉复核](session-reading-model-2026-11-07.md#对局部轮号与写入时机的交叉复核)。
4. **UI 显示真实原因。** 只有确有在途查询时显示加载；缺少可证明来源时说明不可操作，变化冲突时提示刷新并重新选择；禁止继续用“等待历史加载”解释所有状态。

实施前最后一个技术取舍是按需解析的公开载体：核对现有 SDK/daemon 方法是否能承载一个小型只读请求；若必须扩展，应限制在这次三个具体选择语义（所选轮、当前末尾、上一轮），不建设通用 action 框架。同时与“明确整轮目标字段”比较代码与保存/刷新影响，选满足相同验收的较小改动。不能只因字段改动少就接受已实测会漏工具结果的 message boundary 方案。上游替代方案比较与反例见 [SDK 调查 §6](sdk-view-history-action-boundaries-2026-11-07.md)。

## 未解问题与决策边界

1. 交互是否统一保持“完整所选轮之后”，还是允许明确的“这条消息之后”？当前 UI 使用轮次回调，不能在修复时悄悄改语义。
2. 在 SDK 现有查询能力中，能否用来源 entry 身份以有界代价取得完整轮尾（含隐藏 tool_result），而不扫描/重建客户端历史？应由上游调研结论决定是否需要一个小型显式解析入口。
3. 截图中的 Provider authentication failed 是独立运行错误，不是这条边界提示的根因；本轮没有发起付费调用或修改凭据。

本研究阶段不修改 Fork/回退运行代码、不发布 SDK、不重启或改写用户会话。先前修复正文补读/通知刷屏的改动保持原样。
