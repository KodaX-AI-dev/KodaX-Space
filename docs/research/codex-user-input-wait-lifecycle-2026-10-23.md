# Codex 的用户提问如何等待、自动结束和恢复，Space 可以借鉴什么？

TL;DR：本地 Codex 源码把“等待必要决策”“可以无回答继续”“异步询问后继续工作”分成不同语义。Core 的同步提问没有默认五分钟截止时间；当前 TUI 对非阻塞同步问题采用 60 秒宽限 + 60 秒倒计时，到期返回空答案，交互后停用倒计时；Plan 阻塞问题持续等待。空答案作为成功工具结果交给模型，不冒充用户取消。另一个 `request_user_input_async` 工具立即返回，用户回答走普通用户消息通道。这些是开源 Core / app-server / TUI 的证据，不能直接认定闭源桌面应用采用同一 UI 策略。〔C1、C2、C3、C4〕

## 调研范围与证据基线

- 调研日期：2026-10-23（Asia/Shanghai）。用户明确指定的本地仓库：`C:\Works\PubProj\codex`。
- 所有 Codex 源码及测试引用均对应 **commit `deede7201da27a178c39befa6b4959bb7d451645`**，commit 日期 2026-10-21，标题 `Keep rollout trace terminal sessions distinct when process IDs are reused (#56011)`。调研开始时工作树干净。本次没有修改 Codex 源码，也没有执行 Rust 测试；“测试证据”指仓库中已有的测试断言。
- 已检查本地仓库与其父目录的 `AGENTS.md`；相关路径中只有 TUI `bottom_pane/AGENTS.md` 有专属指令，要求修改状态机时同步文档。本次只读实现，无实现修改。
- 本文的“同步”指工具需要等一个 response 才返回模型；`isBlocking=false` **并不**使同步工具立即返回。它控制 TUI 是否可以自动结束等待。真正立即返回的是独立异步工具。〔C1、C2、C4〕

以下引用索引中的路径、行号全部属于上述 commit，索引可以通过本地源码核对；结论引用索引时同时继承该 commit 基线。

## 已证实行为

### 1. Core 等待答案没有默认截止时间，UI 决定是否自动结束

同步 handler 将 `is_blocking` 设置为 `mode == ModeKind::Plan`，把旧字段 `auto_resolution_ms` 明确设置为 `None`，然后 `await session.request_user_input(...)`。Session 创建 `oneshot` 回调，记录 pending request、发出问题事件，最后直接 `rx_response.await.ok()`；这条函数中没有 `timeout` / `sleep` / 默认 300 秒期限。〔C1、C2〕

因此，不能只看到 `autoResolutionMs=None` 就认定“所有 Codex 选择题永不超时”：当前 TUI **另有**自动结束策略，也不能把 `isBlocking=false` 理解成模型已经继续工作；Core 仍在等待那个工具结果。Default mode 是否允许同步提问另有 feature / available-modes gate。〔C1、C2、C3、C5〕

| 请求类型 | 当前开源实现的等待行为 | 无操作的结果 | 证据 |
| --- | --- | --- | --- |
| 同步 `request_user_input`，Plan / `isBlocking=true` | Core 等 response；TUI 禁用自动结束计时 | 持续等待，直到回答或显式中断等生命周期动作 | C1、C2、C3 |
| 同步 `request_user_input`，允许的非 Plan / `isBlocking=false` | Core 仍等 response；TUI 固定 60 秒隐藏宽限，接着 60 秒可见倒计时 | TUI 返回 `{"answers":{}}`；不是选择第一项，也不是中断任务 | C1、C2、C3 |
| 独立 `request_user_input_async` | 发出含问题的 Async AgentMessage 后，工具立即返回 `{"accepted":true}` | 没有等待答案的 Core 回调；工作可继续 | C4、C6 |

`autoResolutionMs` 在协议和 TUI 注释中已标为 deprecated；TUI 当前按 `isBlocking` 和固定策略判断，不使用旧字段的数值来决定时长。已有测试专门验证：即使 `auto_resolution_ms=None`，只要 `is_blocking=false`，自动结束仍会生效。〔C3、C7〕

### 2. 自动结束不是自动选中，也不是用户取消

TUI 初始光标落在第一项，但 `answer_committed=false`。正常提交只把明确 committed 的选择和备注放入答案；自动结束则直接返回**空的整个答案映射** `answers={}`，历史记录标 `interrupted=false`，界面把相应问题显示为 `unanswered`。不存在“预选第一项就代表用户同意”的实现语义。〔C8、C9、C10〕

Core handler 把收到的 `RequestUserInputResponse` 序列化成 JSON，以 `success=true` 作为工具结果返回模型。空答案没有特殊取消分支，已有参数化 handler 测试包含 `None` / empty response 并要求 handler 成功；只有没有收到 response、等待通道关闭时才构造 `was cancelled before receiving a response`。所以沿当前实现链路，空答案会给模型一个有效工具结果，而不会自己触发 `TurnAborted`。这是源码链路与 handler 测试支持的结论；本次未另跑跨 120 秒的端到端探针。〔C1、C11〕

真实中断是另一条动作：TUI 的 interrupt key 或适用的 Ctrl+C 发 `AppEvent::interrupt()` 并关闭 overlay；Core 集成测试通过显式 `Op::Interrupt` 验证最终产生 `TurnAborted`。Esc 在已打开选项备注时先退出备注，Ctrl+C 在有备注草稿时先清空草稿，并非每次按键都中断。〔C12、C13〕

### 3. 用户开始交互后，当前同步问题的倒计时被停用

非 blocking overlay 收到非 Release 按键，或非空粘贴时，设 `auto_resolution_snoozed=true`；随后自动结束策略返回 Disabled。它不是“再延长 60 秒”，而是停用当前 request 的自动结束。下一个排队 request 激活时重新记录开始时间并重置 snoozed。单测覆盖按方向键、粘贴、排队后重新计时。〔C3、C14〕

这避免了用户已经在阅读、导航或输入时突然失去问题。该收益是由上述状态机推导出的设计解释，不是对桌面应用用户体验的实测。〔C3、C14〕

### 4. app-server 也没有给提问回调附加默认传输截止时间

app-server 把 Core 的问题转换成 `item/tool/requestUserInput` server request，保留 `thread_id`、`turn_id`、`item_id`、`isBlocking` 等信息，注册 callback 后交给后台任务。等待函数直接 `receiver.await`，没有在这一层包一段默认时限。结果转成 `Op::UserInputAnswer` 回送 Core。〔C15、C16〕

app-server 对一般 client error、callback channel 关闭、无法反序列化 response 的当前降级结果也都是空答案；“turn state changed”的特定错误则直接返回，避免为已经切换的 turn 重新塞答案。它们与显式用户中断不同，但当前协议的纯 `answers` 结构并不向模型保留详细的“无答案原因”。不宜把这种降级保真度当成 Space 必须照搬的部分。〔C16、C17〕

仓库确实有网络超时，例如远程 app-server client 的连接 / initialize 各 10 秒，但它们用于建立传输和初始化，不能拿来证明人工答题限时 10 秒。测试中的 `timeout(DEFAULT_READ_TIMEOUT, ...)` 也是测试 harness 的读取保护，不能当产品超时策略。〔C18、C19〕

### 5. 活跃等待与短暂断连可以分开处理

持续运行的 app-server 将普通 server request callback 和原始 request 保存在内存映射；`connection_closed` 清理连接上下文及特殊 user-verification owner，但没有普遍删除所有普通提问 callback。`thread/resume` 会向新连接重放该 thread 尚未完成的普通 server requests；这些请求保留原 request ID。〔C20、C21、C22〕

等待用户问题时，thread status 有独立 `WaitingOnUserInput` flag，并保持 `Active`。无订阅线程的延迟卸载要求“无订阅 + 非 Active”，因此不能把“没用户连接”直接视为“用户取消”。这只适用于 server 进程仍运行、thread 仍加载的恢复范围。〔C23、C24〕

问题获得 response 后，app-server 发 `serverRequest/resolved`；TUI 根据对应 `item_id` 把当前 / 排队 overlay 移除，既不再提交一个回答，也不额外发中断。已有 stale request 单测断言移除旧问题不产生 interrupt 或 answer。这可以防止另一个客户端回答后，旧窗口继续显示可操作问题。〔C25、C26〕

这不等同于“随便杀 app-server 或重启设备后所有 pending 问题都能恢复”：这些 callback 是内存状态；单客户端 stdio 连接关闭时 server 主循环也会退出。进程退出、持久化恢复与 UI 同步是另一组需要独立证明的性质。〔C20、C27〕

### 6. 异步提问的回答与 UI 生命周期独立于同步 overlay

`request_user_input_async` 产生 `delivery=Async`、`questions` 结构的 AgentMessage，立即完成 item 并返回 `accepted:true`，不建立同步用户回答 waiter。集成测试用两次模型请求证明随后还能正常生成 `Finished.`，并验证第二次模型请求收到的是 `accepted:true` 工具输出。〔C4、C6〕

TUI 把异步问题保留在 question editor，不抢夺输入焦点；用户回答经现有普通用户消息 / 队列通道发出，只有本地 send / queue 被接受后才把该题消耗掉。断连时禁用 delivery、保留可编辑草稿；测试确认离线输入、Enter 不发送且不清除问题。已发送但不确定送达的恢复队列保留 QuestionAnswer 来源，并暂停至用户选择重试。〔C28、C29、C30〕

异步编辑器还有一个容易误读的字段：未展开时设置 `expires_at=now+30s`，剩余 20 秒内显示倒计时；展开或交互会清除该字段。但在当前 tree 中，该字段的读取用于 `timer_remaining` / `countdown` / frame scheduling，**未找到按到期自动发送答案、自动删除问题或中断 turn 的实现**。`BottomPaneView` 的这份实现也没有到期处理 `pre_draw_tick`。因此不能仅凭 `expires_at`、`snooze_auto_resolution` 命名就把它写成“异步问题 30 秒后自动答复 / 取消”。〔C31、C32〕

异步问题在 live turn 完成、失败或中断时，由 TUI 取回未提交的输入草稿，带着原问题文本恢复到主输入区域，然后清理 pending questions。普通被接受的后续输入也会清理旧问题，显式 skip 可移除题目而不发送空白消息。seen IDs / answered IDs 防止 replay 重新打开已经回答或跳过的题。〔C33、C34、C35〕

## Space 当前契约核对（主线补充）

本段对应 Space commit `63e3c7e8ae4623cd86980bb15b434bb586212299` 及已安装发布包 `@kodax-ai/kodax@0.7.97-alpha.9`，不属于上面的 Codex commit 基线。

- SDK 仍声明 AskUser 默认五分钟截止；`RuntimeUserInputRequest.expiresAt` 必填，结算状态只有 `answered` / `dismissed` / `already_resolved`。Space 当前回复入口也只有 `respond` 与 `dismiss` 两条路径，没有独立的“跳过后继续”结果。〔[SDK deadline](/C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/sdk-runtime.d.ts:1394)、[请求与结算类型](/C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/sdk-runtime.d.ts:2845)、[Space 回复入口](/C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/runtime-host-adapter.ts:7515)〕
- 已实际调用 `createKodaXRuntime({ userInputTimeoutMs: 0 })`，SDK 在启动前拒绝：`userInputTimeoutMs must be a positive integer no greater than 2147483647.`。因此不能把该参数设成 0 来实现无限等待；需要 SDK 明确提供无截止时间的契约，或调整其交互策略。这里没有尝试用超大期限冒充无期限等待。〔同一发布包的公共 API 调用；参数声明见上述 SDK deadline 引用〕

## 对 Space 的建议（设计判断，不是 Codex 实现事实）

1. **优先修复语义错误。** 人工等待到期只能表示“暂未回答”，不能转换成 `Operation cancelled by user`。把用户点停止 / 取消、无回答自动继续、连接暂不可用区分开。同步 Core 返回空答案并成功结束工具的模式表明“无回答”与“任务中断”可以独立。〔依据 C1、C9、C11、C13〕
2. **现有 Space 选择题先按必要决策题持续等待。** 保持待回答的可恢复状态，由 SDK / Runtime 支持无期限等待，不设隐藏五分钟截止；停止按钮仍显式中断。它对应 Codex blocking 提问最直接的语义。只改 Space 前端倒计时不能解决 Runtime 在后台结算的问题。〔设计依据 C2、C3、C23；Space SDK 的限制见上面的契约核对〕
3. **可选偏好题的自动继续放到契约支持之后。** `answers={}` 是 Codex 的 response 格式，不能假定 Space SDK 也能接受。若未来采用有限等待，应先让 SDK 明确支持“未回答 / 跳过”结果，再由模型按已有信息继续、或判断仍无法执行。UI 要展示后果，推荐项 / 初始光标不能当用户选择。TUI 的 60+60 秒与交互后停用计时可作产品参考；Space 的期限和请求结算仍应由 Host 权威管理，不能照搬单端 TUI 计时器。〔设计依据 C2、C3、C8、C9、C14、C20〕
4. **异步提问可作为后续功能。** 只有任务在缺少该答案时仍有独立工作可做，才立即继续；答案按用户后续输入送回。无需为眼前 bug 先实现一整套新异步工具。异步工具与 legacy 非 blocking 同步 overlay 是两个方案，不能只更名就互相替代。〔依据 C2、C4、C6、C28〕
5. **恢复围绕 request ID 和状态完成。** 后端保留待答题，重连重放；前端保留输入、暂停发送；已答题以 resolved 事件移除。先覆盖进程仍存活的断连恢复，再单独讨论重启恢复。这比把心跳、RPC timeout 或页面卸载直接当取消更符合已证实的 Codex 分层。〔依据 C20–C30〕

建议验收用例：超过旧五分钟界限仍可回答；自动继续只产生“未回答”而不产生用户取消；停留第一项从不自动授权；开始输入后不被倒计时打断；显式停止仍中断；断连期间草稿保留且不发送，重连恢复同一 request；另一客户端答完后旧弹窗失效；旧 request 的迟到响应不能误答新题。〔测试设计依据 C8–C14、C20–C30〕

## 未证实

- **闭源 Codex Desktop 的实际时长、动画、弹窗和重连策略**：本仓库证据只证明 Core、app-server 与 TUI；即使代码注释提到 desktop，或测试模拟 desktop 回复，也不证明桌面 UI 实际使用同样策略。
- **同步阻塞问题跨 server 进程崩溃 / 系统重启的完整恢复**：本次核查了内存 waiter、运行中 thread resume 和连接关闭，不足以认定进程重启后 pending question 必然续接。
- **异步编辑器 30 秒 timer 原本的产品意图**：现有源码有展示与重绘，没有找到到期解决动作；可能是历史遗留，也可能有后续工作，不能从名称推断。
- **Space 后续 SDK 如何表达无限等待与跳过**：现有发布包的期限与结算限制已核对，但尚未实现新契约，也未验证跨应用重启保留同一个待答请求。本文没有假定 UI 单改即可绕过 Runtime 的五分钟期限。
- **空答案自动继续的完整长时端到端实测**：本文以 TUI 到期单测、Core handler 空答案成功单测、现有有答案 round-trip 测试与源码串联，没有执行新的 Rust 端到端测试。

## 引用索引

以下每条均为 Codex commit `deede7201da27a178c39befa6b4959bb7d451645` 的本地 primary source。标注范围用于核对上下文；链接落在起始行。

| ID | 来源与核对行 | 证明内容 |
| --- | --- | --- |
| C1 | [core/src/tools/handlers/request_user_input.rs](/C:/Works/PubProj/codex/codex-rs/core/src/tools/handlers/request_user_input.rs:73)，73–105、149–152 | mode 决定 isBlocking，autoResolutionMs=None，等待后序列化，success=true，通道关闭才取消 |
| C2 | [core/src/session/mod.rs](/C:/Works/PubProj/codex/codex-rs/core/src/session/mod.rs:3272)，3272–3344 | 注册 pending oneshot、事件、直接 await、回答回送 |
| C3 | [tui/src/bottom_pane/request_user_input/mod.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/request_user_input/mod.rs:72)，72–73、249–325、1859–1887 | 60+60 秒、isBlocking 与 snoozed 判断、弃用旧字段、无旧期限字段仍自动结束 |
| C4 | [core/src/tools/handlers/request_user_input_async.rs](/C:/Works/PubProj/codex/codex-rs/core/src/tools/handlers/request_user_input_async.rs:139)，139–163 | Async AgentMessage、started/completed、accepted:true |
| C5 | [core/src/tools/handlers/request_user_input.rs](/C:/Works/PubProj/codex/codex-rs/core/src/tools/handlers/request_user_input.rs:73)，73–76；[core/tests/suite/request_user_input.rs](/C:/Works/PubProj/codex/codex-rs/core/tests/suite/request_user_input.rs:415)，415–429 | available mode gate、Default mode feature |
| C6 | [core/tests/suite/request_user_input_async.rs](/C:/Works/PubProj/codex/codex-rs/core/tests/suite/request_user_input_async.rs:447)，447–501、573–623 | 异步工具不结束 turn、第二次模型请求含 accepted:true |
| C7 | [protocol/src/request_user_input.rs](/C:/Works/PubProj/codex/codex-rs/protocol/src/request_user_input.rs:34)，34–46、65–78 | isBlocking 与弃用 autoResolutionMs 协议 |
| C8 | [tui/src/bottom_pane/request_user_input/mod.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/request_user_input/mod.rs:701)，701–721、866–918 | 预选与 committed 分离、只提交 committed 的内容 |
| C9 | [tui/src/bottom_pane/request_user_input/mod.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/request_user_input/mod.rs:922)，922–943、1988–2017 | 自动结束提交空映射、interrupted=false 与单测 |
| C10 | [tui/src/history_cell/request_user_input.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/history_cell/request_user_input.rs:19)，19–55 | unanswered / interrupted 独立显示 |
| C11 | [core/src/tools/handlers/request_user_input_tests.rs](/C:/Works/PubProj/codex/codex-rs/core/src/tools/handlers/request_user_input_tests.rs:85)，85–104、161–184；[core/tests/suite/request_user_input.rs](/C:/Works/PubProj/codex/codex-rs/core/tests/suite/request_user_input.rs:185)，185–213 | empty response 成功；正常回答回到下一次模型请求 |
| C12 | [tui/src/bottom_pane/request_user_input/mod.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/request_user_input/mod.rs:1198)，1198–1235、1469–1487 | 显式 interrupt 与 Esc/Ctrl+C 细分 |
| C13 | [core/tests/suite/request_user_input.rs](/C:/Works/PubProj/codex/codex-rs/core/tests/suite/request_user_input.rs:307)，307–326 | 显式 Op::Interrupt -> TurnAborted |
| C14 | [tui/src/bottom_pane/request_user_input/mod.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/request_user_input/mod.rs:1213)，1213–1218、1494–1498、2021–2105 | 按键 / 粘贴停用计时，下一题重置 |
| C15 | [app-server/src/bespoke_event_handling.rs](/C:/Works/PubProj/codex/codex-rs/app-server/src/bespoke_event_handling.rs:833)，833–878 | 转为 server request，传递所有身份和阻塞字段 |
| C16 | [app-server/src/bespoke_event_handling.rs](/C:/Works/PubProj/codex/codex-rs/app-server/src/bespoke_event_handling.rs:1654)，1654–1732 | 无额外等待时限；response/error/关闭通道转换 |
| C17 | [app-server-protocol/src/protocol/v2/item.rs](/C:/Works/PubProj/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs:1803)，1803–1814 | response 只含答案结构 |
| C18 | [app-server-client/src/remote.rs](/C:/Works/PubProj/codex/codex-rs/app-server-client/src/remote.rs:65)，65–66、845–875 | connect / initialize 的传输时限 |
| C19 | [app-server/tests/suite/v2/request_user_input.rs](/C:/Works/PubProj/codex/codex-rs/app-server/tests/suite/v2/request_user_input.rs:126)，126–171 | 测试读取 timeout 及 resolved 事件顺序 |
| C20 | [app-server/src/outgoing_message.rs](/C:/Works/PubProj/codex/codex-rs/app-server/src/outgoing_message.rs:292)，292–296、347–460、599–612 | callback 内存表、连接关闭处理、pending request 查询 |
| C21 | [app-server/src/outgoing_message.rs](/C:/Works/PubProj/codex/codex-rs/app-server/src/outgoing_message.rs:463)，463–481 | 原始 request 重放给新连接 |
| C22 | [app-server/src/request_processors/thread_lifecycle.rs](/C:/Works/PubProj/codex/codex-rs/app-server/src/request_processors/thread_lifecycle.rs:935)，935–964 | resume response 后重放 pending requests |
| C23 | [app-server/src/thread_status.rs](/C:/Works/PubProj/codex/codex-rs/app-server/src/thread_status.rs:201)，201–220、447–468 | pending user-input counter、WaitingOnUserInput -> Active |
| C24 | [app-server/src/request_processors/thread_lifecycle.rs](/C:/Works/PubProj/codex/codex-rs/app-server/src/request_processors/thread_lifecycle.rs:22)，22–83；[app-server/src/request_processors/thread_processor.rs](/C:/Works/PubProj/codex/codex-rs/app-server/src/request_processors/thread_processor.rs:3808)，3808–3820 | 无订阅且非 active 才安排 idle unload，connection_closed 不直接 stop 正在加载的 thread |
| C25 | [app-server/src/request_processors/thread_lifecycle.rs](/C:/Works/PubProj/codex/codex-rs/app-server/src/request_processors/thread_lifecycle.rs:1019)，1019–1041；[app-server/src/bespoke_event_handling.rs](/C:/Works/PubProj/codex/codex-rs/app-server/src/bespoke_event_handling.rs:1662)，1662–1664 | response 后 resolved 通知 |
| C26 | [tui/src/bottom_pane/request_user_input/mod.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/request_user_input/mod.rs:946)，946–959、2109–2177 | item_id 移除已解决 UI，旧题移除不产生回答或中断 |
| C27 | [app-server/src/lib.rs](/C:/Works/PubProj/codex/codex-rs/app-server/src/lib.rs:1195)，1195–1218 | single-client stdio 关闭时退出 |
| C28 | [tui/src/chatwidget/questions.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/chatwidget/questions.rs:19)，19–36、120–163；[tui/src/bottom_pane/async_questions/mod.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/async_questions/mod.rs:1)，1–3 | 不抢焦点、普通消息 / queue、接受后才消耗回答 |
| C29 | [tui/src/chatwidget/reconnect.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/chatwidget/reconnect.rs:27)，27–55；[tui/src/chatwidget/tests/questions_tests.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/chatwidget/tests/questions_tests.rs:400)，400–420 | 断连禁用发送但可编辑 |
| C30 | [tui/src/chatwidget/tests/questions_tests.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/chatwidget/tests/questions_tests.rs:355)，355–383 | 不确定送达的回答保留来源、恢复队列待用户重试 |
| C31 | [tui/src/bottom_pane/async_questions/state.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/async_questions/state.rs:14)，14–104；[tui/src/bottom_pane/questions_tests.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/questions_tests.rs:36)，36–51 | 30 秒 timer、20 秒 countdown、展开停用；过期只断言倒计时消失 |
| C32 | [tui/src/bottom_pane/async_questions/input.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/async_questions/input.rs:153)，153–316；[tui/src/bottom_pane/async_questions/state.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/async_questions/state.rs:85)，85–104、208–260 | timer 只有显示 / 调度读点，BottomPaneView 没有到期处理钩子 |
| C33 | [tui/src/chatwidget/protocol.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/chatwidget/protocol.rs:478)，478–506；[tui/src/bottom_pane/async_questions/state.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/async_questions/state.rs:219)，219–229；[tui/src/bottom_pane/questions.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/questions.rs:43)，43–61 | live turn 结束回收草稿并清题 |
| C34 | [tui/src/chatwidget/tests/questions_tests.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/chatwidget/tests/questions_tests.rs:116)，116–155、624–644 | 被接受后续输入清旧题、拒绝空白、显式 skip |
| C35 | [tui/src/bottom_pane/async_questions/state.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/async_questions/state.rs:14)，14–27、152–189、208–260；[tui/src/bottom_pane/async_questions/state_tests.rs](/C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/async_questions/state_tests.rs:74)，74–90 | 去重、跨客户端 answer resolution 与 replay 不复活旧问题 |

## 未解问题

1. Space 要先只修“无回答不能视为用户取消”，还是同时引入 blocking / optional 的明确提问契约？前者范围更小；后者需要 UI、Runtime 和模型工具共同理解。
2. Space 哪些现有题必须用户决策，哪些能按明确假设继续？这需要产品语义，不能由是否有推荐项来推断。
3. Space / SDK 的待答题是否已持久化、重连时如何列举，以及新增的无期限 / 跳过契约如何定义？现有 API 的期限与状态限制已核对，持久化恢复仍需单独验证。
4. 是否需要跨应用重启恢复回答草稿和同一 pending request？这超出此次 Codex 运行中连接恢复证据。
