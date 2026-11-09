# ZCode 的会话内历史怎样加载、呈现并与实时输出衔接？

TL;DR：ZCode 采用尾窗分页、按轮虚拟化、独立运行尾轮与用户滚动权；值得借鉴的是稳定身份、历史与实时的同一投影以及前插锚定。它同时存在宽屏目录主动补齐全历史、整轮挂载成本、搜索补页上限和像素位置记忆等权衡，不能概括为“全部按需加载且没有长历史问题”。具体证据见下文。

## 范围与证据边界

- 调研日期：2026-11-09；仓库：C:/Works/PubProj/ZCode；实际 HEAD：a9fe401eede6e6e5e01be9048679c206fe6f02d9。调查时 git status --short 无输出；所有行号以该检出源码为准。
- 已读根 AGENTS.md、packages/ui/AGENTS.md、packages/services/AGENTS.md、apps/zcode-cli/AGENTS.md。运行规定的 node scripts/check-workspace-freshness.mjs，结果为 main 与 origin/main 同步，ahead 0 / behind 0。
- 本文只读源码及现有测试，没有启动 UI、运行浏览器验收、执行性能采样或修改 ZCode。测试条目代表仓库断言，不能当作本次实测通过；历史文档中的性能数字也没有当作本次测量。
- 重点是当前 V4 会话内历史，不把命令输入历史、任务列表历史或分享只读页面与聊天时间线混为一谈。实际渲染入口接收 snapshot.rows.window，分页回调来自同一 lease.store。[SessionPane.tsx:6126](C:/Works/PubProj/ZCode/packages/ui/src/v4/SessionPane.tsx:6126)、[SessionPane.tsx:4839](C:/Works/PubProj/ZCode/packages/ui/src/v4/SessionPane.tsx:4839)

## 1. 分页并不等于全程只保留尾窗

| 场景 | 源码可确认行为 | 证据 |
| --- | --- | --- |
| 首个 wire snapshot | 先按 delivery profile 过滤可见 rows，totalCount/firstRowId 保留该可见分支口径；仅 window 截取末尾 60 rows。这里的 row 不是“轮”，也不是完整聊天 message。 | [publisher.ts:350](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.ts:350)、[core.ts:75](C:/Works/PubProj/ZCode/packages/shared/src/zcode-protocol-v4/core.ts:75) |
| 更早一页 | 使用窗口首 rowId 作为 beforeRowId，默认取 60 rows；服务端返回 rowId 小于游标的最后 limit 行，按现有序列返回，并附 atLogEpoch/hasMore。协议单页上限 200。 | [store.ts:1257](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1257)、[publisher.ts:478](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.ts:478)、[core.ts:76](C:/Works/PubProj/ZCode/packages/shared/src/zcode-protocol-v4/core.ts:76) |
| 接近顶部 | scroll handler 按 max(64px, 两个视口高度) 判断补页；要求仍有历史且当前没有在途请求。触发前记录稳定虚拟单元及相对视口位置。 | [anchor.ts:278](C:/Works/PubProj/ZCode/packages/ui/src/v4/timelineScrollAnchor.ts:278)、[Timeline.tsx:1518](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:1518) |
| 首轮被尾窗切断 | 窗口首轮找不到 turnHeader 且还有旧 rows 时，不等待滚动事件，逐页向前补齐；每个 session/subscription/首 row 游标只自动尝试一次，避免空页或失败时自旋。 | [store.ts:249](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:249)、[SessionPane.tsx:4864](C:/Works/PubProj/ZCode/packages/ui/src/v4/SessionPane.tsx:4864) |
| 宽屏问题目录 | 容器宽度至少 864px、目录未被显式隐藏、有历史且没有加载中时，自动调用 loadAllOlder；不是必须等用户点击目录才开始加载。 | [helpers.ts:73](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationTurnNavigatorHelpers.ts:73)、[helpers.ts:115](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationTurnNavigatorHelpers.ts:115)、[Timeline.tsx:740](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:740)、[Timeline.tsx:768](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:768) |
| 完整目录补齐 | 按每页最多 200 rows 串行拉到分支起点，等全部页成功后一次合并进 snapshot.window；少于两条真实用户输入时一般不合并探测页，首轮本来不完整则例外保留补齐数据。 | [store.ts:1298](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1298)、[store.ts:1340](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1340)、[store.ts:1387](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1387)、[store.ts:1425](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1425) |
| 分享选择 | 激活分享选择且还有历史时，也会请求完整旧历史；这是另一个不能只靠顶部滚动理解的数据加载入口。 | [SessionPane.tsx:4853](C:/Works/PubProj/ZCode/packages/ui/src/v4/SessionPane.tsx:4853) |

分页失败的处理偏轻：loadOlder 捕获错误并写 warn，finally 清除 loadingOlder，保留下一次触发重试；此方法没有把失败写成独立的分页错误 UI 状态。过期 epoch 或窗口首游标已变时，丢弃返回结果，避免恢复已被裁剪的历史。不能据此宣称整个应用没有网络错误提示。[store.ts:1272](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1272)、[store.ts:1288](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1288)

**权衡／可借鉴：**尾窗能减小首次传输，但宽屏完整问题目录会把数据加载目标改为“整条分支”。DOM 虚拟化主要限制挂载数量，不会自动限制已补齐 rows 的传输和 projection 内存。Space 应分别决定首次打开预算、向前翻页预算、全量导航预算；不宜因为复用虚拟列表就默认目录也可以免费全量化。以上是对明确加载路径的工程判断，尚未实测其内存峰值。[publisher.ts:364](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.ts:364)、[store.ts:1425](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1425)

## 2. 渲染单位是一整轮，运行末轮单独保留

1. 时间线使用 @tanstack/react-virtual；历史单元按稳定 key 取尺寸缓存，未知单元以当前一屏高度作估算，容器尚不存在才使用固定初值。动态尺寸来自 ResizeObserver 测量，overscan 为前后各两轮。[Timeline.tsx:119](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:119)、[Timeline.tsx:850](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:850)、[Timeline.tsx:880](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:880)
2. 历史 DOM 只遍历 virtualRows，每个 wrapper 绝对定位，内部挂整个 ConversationTurnGroup；不是把每个 Markdown 段落或每条工具输出作为独立虚拟单元。[Timeline.tsx:2172](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:2172)
3. 只有最后一个仍 running 的 unit 被拆为普通文档流 live tail，其他历史或非最后的 running unit 仍归虚拟列表；没有 running 尾轮时全部回到虚拟列表。live tail 在用户上滚离开时也仍有独立 DOM 分支。[liveTail.ts:59](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationTimelineLiveTail.ts:59)、[Timeline.tsx:2208](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:2208)
4. 历史与尾段分区，派生按 history 引用复用，live tail 常见情况下直接复用历史数组；时钟仅给 running unit 传 nowMs，已完成轮不接每秒时钟值。[Timeline.tsx:452](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:452)、[liveTail.ts:71](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationTimelineLiveTail.ts:71)、[Timeline.tsx:2193](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:2193)
5. 完成态正文走 static Markdown，真实 streaming 才启用流式解析和未闭合 Markdown 处理；正文动画显式关闭。源码注释记录了历史消息使用 streaming 解析、频繁重挂载曾触发错误的背景；本次只确认现有分支设置，未复现旧错误。[message.tsx:1739](C:/Works/PubProj/ZCode/packages/ui/src/components/ai-elements/message.tsx:1739)、[message.tsx:1760](C:/Works/PubProj/ZCode/packages/ui/src/components/ai-elements/message.tsx:1760)

**权衡／可借鉴：**常驻运行尾轮减少“正文先长高、占位高度稍后更新”的布局缝隙，但并没有把超长单轮成本消除：虚拟窗口即使只挂少数轮，每轮仍可能有长 Markdown／大量工具。适合先复用稳定 turn identity、静态与流式解析分流、历史派生缓存；只有在真实长单轮成本明确后，才考虑更细粒度虚拟化，不能将“overscan=2”解释为两屏成本上界。[liveTail.ts:50](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationTimelineLiveTail.ts:50)、[Timeline.tsx:119](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:119)、[Timeline.tsx:2193](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:2193)

## 3. 历史与实时衔接由权威投影处理

- CLI 的 rowsRange 与 wire snapshot 都读取同一个 publisher.projection。wire 截尾只发生在打包发送边界，publisher 内部 rows 保留全量可见历史，供分页查询。不能把 UI 尾窗误认为存储或 CLI 内存也只有 60 行。[publisher.ts:340](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.ts:340)、[publisher.ts:478](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.ts:478)
- Renderer 收到 snapshot 时整体替换状态；收到 delta 时先丢弃重复/迟到帧，只有 fromSeq 等于当前 seq 才应用并推进水位；断档进入 recovery 或强制 snapshot，不把不连续帧先拼入 UI。[store.ts:864](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:864)、[store.ts:903](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:903)
- 异步历史读取期间仍可收到实时 delta。loadOlder 返回后以“当前”snapshot 合并更早 rows，并检查 epoch 与首游标没有变化；因此没有拿请求发出前的旧 snapshot 覆盖期间的新内容。[store.ts:1267](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1267)
- Gateway 的持久恢复按 session 单飞，并在读持久事件前登记 hydration buffer；已有健康 live publisher 且持久事件完整时可直接复用。确需重建时先 rehydrate 持久 events，再将最近 raw tail 与等待窗口 buffer 按 eventId 合并、依据 sequenceNumber 排序后 ingest。[gateway.ts:3312](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts:3312)、[gateway.ts:3356](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts:3356)、[gateway.ts:3386](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts:3386)、[gateway.ts:3422](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts:3422)、[gateway.ts:3457](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts:3457)
- desktop-continuous 与 replayable 是明确分档，Gateway 根据可信 clientMode 选择 profile；分页也按档位过滤。不能从桌面源码行为推出手机远控所有瞬时行完全一致。[gateway.ts:1564](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts:1564)、[gateway.ts:1758](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts:1758)

**可借鉴原则：**历史查询与实时流共用身份及投影；UI 只控制已加载窗口与交互，不用第二份“历史 messages + streaming messages”数组自行猜测连续性。ZCode 为此维护 epoch、seq、buffer、profile 等协议边界；Space 是否需要同等复杂度，应由其实际传输与恢复合同决定，不能整套照搬上述运行时。[store.ts:903](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:903)、[gateway.ts:3457](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts:3457)

## 4. 保持阅读位置：区分用户意图、前插和布局补偿

| 机制 | 现有实现 | 证据 |
| --- | --- | --- |
| 跟随最新 | 底部容差 48px；following 是用户滚动权。只有 user 来源的 scroll 按落点更新 following；layout/programmatic 来源保留原意图。 | [anchor.ts:13](C:/Works/PubProj/ZCode/packages/ui/src/v4/timelineScrollAnchor.ts:13)、[anchor.ts:57](C:/Works/PubProj/ZCode/packages/ui/src/v4/timelineScrollAnchor.ts:57) |
| 上滚优先 | wheel、touch、键盘捕获方向；内容增长贴底前再次对账。明确 awayFromBottom 立即解除 following，避免 scroll 事件尚未到达时被布局提交拉回。 | [anchor.ts:108](C:/Works/PubProj/ZCode/packages/ui/src/v4/timelineScrollAnchor.ts:108)、[anchor.ts:169](C:/Works/PubProj/ZCode/packages/ui/src/v4/timelineScrollAnchor.ts:169)、[Timeline.tsx:978](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:978) |
| 前插锚定 | 加载前保存稳定虚拟 key 的起点和视口偏移；前插后优先用同 key 的新起点恢复绝对位置，没有可用锚点才退到总虚拟高度差；该批次禁用逐项重复补偿。 | [Timeline.tsx:1528](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:1528)、[Timeline.tsx:1888](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:1888)、[Timeline.tsx:892](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:892) |
| 动态行高 | 脱离底部、非恢复/前插抑制期、非宽度调整期时，仅视口上方已结束的 item 允许 virtualizer 补偿；同批测量比较 virtualizer 同一坐标水位。 | [anchor.ts:82](C:/Works/PubProj/ZCode/packages/ui/src/v4/timelineScrollAnchor.ts:82)、[Timeline.tsx:892](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:892) |
| 部分轮次补齐 | 在 layout 阶段测量已挂载轮并更新既有 virtualizer 后再对账，防止首轮同 key 正文补长时先按旧尺寸画出。 | [Timeline.tsx:1812](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:1812) |
| 浏览器锚定 | 内容子树显式 overflowAnchor:none，让前插、吸底与会话位置恢复由同一套逻辑负责，避免原生 anchor 选中 sticky composer 另作位移。 | [Timeline.tsx:2119](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:2119) |
| 会话间位置记忆 | 内存 Map 最多 200 entries，读取会 touch、溢出删最老项；key 包含 workspaceIdentity/path、可选 pane、session/task；保存 scrollTop/scrollHeight/clientHeight/wasPinnedToBottom。这里是像素记忆，没有在此模块写磁盘。 | [memory.ts:1](C:/Works/PubProj/ZCode/packages/ui/src/lib/chatSessionScrollMemory.ts:1)、[memory.ts:27](C:/Works/PubProj/ZCode/packages/ui/src/lib/chatSessionScrollMemory.ts:27)、[memory.ts:38](C:/Works/PubProj/ZCode/packages/ui/src/lib/chatSessionScrollMemory.ts:38)、[memory.ts:127](C:/Works/PubProj/ZCode/packages/ui/src/lib/chatSessionScrollMemory.ts:127) |
| 会话切回 | 没有记忆或记忆为贴底则定位最新；离底记忆先恢复，内容尚不足则保留待恢复意图，后续 rows/测量提交再恢复；用户调整后不继续用旧意图覆盖。恢复坐标最终限制在当前可滚动范围。 | [Timeline.tsx:1759](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:1759)、[Timeline.tsx:1830](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:1830)、[memory.ts:139](C:/Works/PubProj/ZCode/packages/ui/src/lib/chatSessionScrollMemory.ts:139) |

**权衡／可借鉴：**优先移植“真实滚动意图只由用户改变”“前插时保存稳定条目＋偏移”这两个合同，比直接搬一组定时器更可靠。ZCode 内存位置记忆适合同一 renderer 生命周期内切换；没有证据证明跨应用重启或正文大幅修订后仍能语义定位原句。其宽度校正、布局 guard 与用户意图 TTL 共同维护滚动所有权，移植时必须结合 Space 的布局和生命周期复核。[anchor.ts:57](C:/Works/PubProj/ZCode/packages/ui/src/v4/timelineScrollAnchor.ts:57)、[anchor.ts:236](C:/Works/PubProj/ZCode/packages/ui/src/v4/timelineScrollAnchor.ts:236)、[Timeline.tsx:125](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:125)、[memory.ts:11](C:/Works/PubProj/ZCode/packages/ui/src/lib/chatSessionScrollMemory.ts:11)

## 5. 过程折叠、思考与工具

- 正常已完成轮的过程内容可放进 Collapsible；运行中强制展开。默认展开还考虑异常结束、没有最终正文但有工作内容等条件，不能概括成“完成后一律折叠”。分段及兼容整轮路径的开关都是组件局部 useState，随默认值/segment 或 unit key 改变重设。[TurnGroup.tsx:775](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTurnGroup.tsx:775)、[TurnGroup.tsx:1122](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTurnGroup.tsx:1122)、[renderUnits.ts:365](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationTurnRenderUnits.ts:365)
- 思考行另有一层 Reasoning：默认关闭，streaming 且空文本时不呈现；显示摘要触发器，手动展开后状态边界不会覆盖用户操作。也就是说“过程组运行中展开”和“每条思考默认展开”是不同规则。[RowView.tsx:1826](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationRowView.tsx:1826)、[reasoning.tsx:94](C:/Works/PubProj/ZCode/packages/ui/src/components/ai-elements/reasoning.tsx:94)、[reasoning.tsx:115](C:/Works/PubProj/ZCode/packages/ui/src/components/ai-elements/reasoning.tsx:115)
- “显示思考”关闭时仍保留每轮首条思考，其余由 visibility policy 隐藏；工具按 CUA/explore/terminal/changes 等分组投影，不只显示一条原始 JSON。SessionPane 默认 explore/terminal 开启、changes 关闭。[RowView.tsx:2421](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationRowView.tsx:2421)、[TurnGroup.tsx:420](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTurnGroup.tsx:420)、[SessionPane.tsx:2076](C:/Works/PubProj/ZCode/packages/ui/src/v4/SessionPane.tsx:2076)

**权衡／可借鉴：**把最终回答与过程分层有助于降低回看密度，但必须保留无回答及异常路径的可见证据。此处外层过程展开偏好是局部 state，虚拟化卸载后按默认规则初始化，不能声称其逐轮手动展开偏好已持久化。Space 可采用少量稳定分层规则，不应直接搬来 ZCode 专属工具分类与首条思考必留政策。[TurnGroup.tsx:775](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTurnGroup.tsx:775)、[renderUnits.ts:365](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationTurnRenderUnits.ts:365)

## 6. 搜索、轮次导航与返回最新

1. 会话内 find 索引仅选择可见 userInput 与 assistantText，查询 trim 后大小写折叠，以 indexOf 找子串。此入口没有索引 reasoning 或 toolCall；正文可按代码评论投影开关先取 visibleText。按不可变 row 弱引用缓存投影和小写文本。[findIndex.ts:6](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationFindIndex.ts:6)、[findIndex.ts:50](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationFindIndex.ts:50)、[findIndex.ts:67](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationFindIndex.ts:67)、[findIndex.ts:108](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationFindIndex.ts:108)、[findIndex.ts:144](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationFindIndex.ts:144)
2. 有非空 find query、会话不是 running/prewarming、仍有旧页且 loaded rows 少于 1200 时，effect 继续调用 loadOlder。1200 是“停止自动补页的判断阈值”，单次分页可能跨过阈值；已由宽屏目录加载的更多 rows 仍会参与索引，不是强制截断搜索到 1200 行。运行中本地已加载文本仍可建索引，该 stable 条件直接约束的是补页及历史结果定位等路径。[findHook.ts:30](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:30)、[findHook.ts:161](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:161)、[findHook.ts:167](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:167)、[findHook.ts:310](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:310)
3. 显式导航先粗定位目标虚拟 unit，再在实际布局测量完成后对 DOM Range 居中；单命中回环也有 navigationRequestId，能重新挂载已离窗目标。匹配 Markdown 源标记或链接地址而没有渲染文本 Range 时，只要目标行已挂载且布局完成，就结束请求，不再强拉用户滚回。[findHook.ts:328](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:328)、[findHook.ts:347](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:347)、[Timeline.tsx:1692](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:1692)
4. 历史搜索结果跳转使用 query/snippet 请求；snippet 尚未在 loaded rows 出现时可继续分页，同样受 stable 与 1200 自动加载判断约束。这证明存在结果落点协议，不等于本文已经验证全局历史搜索服务的召回范围。[findHook.ts:397](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:397)、[findHook.ts:432](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:432)
5. 问题目录自身也虚拟化，条目有用户问题与助手回答摘要；hover/focus 展示预览，点击以 rowId/unitIndex 定位真实用户 query。默认预览上限 220 字符、两段；尊重 reduced-motion，决定平滑或立即跳转。[Navigator.tsx:115](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTurnNavigator.tsx:115)、[Navigator.tsx:245](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTurnNavigator.tsx:245)、[Navigator.tsx:274](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTurnNavigator.tsx:274)、[helpers.ts:137](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationTurnNavigatorHelpers.ts:137)
6. 返回最新按钮的可见条件是“有内容且 following=false”；点击恢复 following、立即写 scrollTop 到底并保存位置。当前按钮接收 label/onClick，没有未读消息计数输入；即使没有新增内容，只要主动离底也会出现。因此不能将它写成“有新消息时出现的提醒”。本次在时间线入口未找到另一个计数式新消息提醒，不据此断言侧栏等其他位置没有未读状态。[anchor.ts:199](C:/Works/PubProj/ZCode/packages/ui/src/v4/timelineScrollAnchor.ts:199)、[Timeline.tsx:1556](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:1556)、[Timeline.tsx:2295](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:2295)

**权衡／可借鉴：**“搜索结果存在”与“正文可高亮且能定位”应分成两个事实，源 Markdown 和渲染文本天然可能不同；ZCode 的结束条件值得参考。Space 若要承诺完整会话搜索，需要明示范围或由权威侧查询，不应直接沿用 1200 自动补页阈值并把 loaded matchCount 宣称成全历史匹配数。宽屏目录先补齐全历史又会改变同一搜索入口的覆盖量，这是两套加载机制的真实耦合。[findHook.ts:310](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:310)、[findHook.ts:370](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:370)、[store.ts:1425](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1425)

## 7. 已检查的测试及其证明边界

| 测试来源 | 现有断言覆盖 | 本次状态 |
| --- | --- | --- |
| [v4-scroll.test.ts:29](C:/Works/PubProj/ZCode/packages/desktop/test/e2e/conversation-session/conversation-session-v4-scroll.test.ts:29) | 历史轮数大于挂载轮数、顶部历史可达、任务切回位置误差不超过 4px、流式时上滚不拉回、返回底部恢复跟随。 | 只读；未运行。 |
| [v4-turn-navigator.test.ts:49](C:/Works/PubProj/ZCode/packages/desktop/test/e2e/conversation-session/conversation-session-v4-turn-navigator.test.ts:49) | 宽屏问题目录、问题预览、点击跳转、离底 following=false、窄 pane 隐藏/恢复。 | 只读；未运行。 |
| [timeline-resize.test.mjs:66](C:/Works/PubProj/ZCode/packages/ui/test/browser/manual-review/pending/conversation-timeline-resize.test.mjs:66) | SRM10：宽度/布局变化时贴底或脱离跟随的行为，按钮与滚动输入。 | manual-review/pending；只读，未运行。 |
| [timeline-resize.test.mjs:213](C:/Works/PubProj/ZCode/packages/ui/test/browser/manual-review/pending/conversation-timeline-resize.test.mjs:213) | SSV03：部分首轮补齐，following/reading × mobile/desktop × theme，观察重叠帧与锚点偏差。 | manual-review/pending；只读，未运行。 |
| [render-isolation.test.mjs:58](C:/Works/PubProj/ZCode/packages/ui/test/browser/manual-review/pending/message-render-isolation.test.mjs:58) | RRI01–04：真实组件更新期间无关历史 memo-skip，活动文本必须实际渲染，历史可被虚拟窗口卸载。 | manual-review/pending；只读，未运行。 |
| [render-boundaries.test.mjs:90](C:/Works/PubProj/ZCode/packages/ui/test/browser/manual-review/pending/render-boundaries.test.mjs:90) | Markdown 源码命中但无 Range 后不夺回滚动；离窗目标正例和新的显式导航仍可定位。 | manual-review/pending；只读，未运行。 |
| [render-boundaries.test.mjs:235](C:/Works/PubProj/ZCode/packages/ui/test/browser/manual-review/pending/render-boundaries.test.mjs:235) | 同词大量命中限制 DOM 遍历；正文修订后的搜索计数更新。 | manual-review/pending；只读，未运行。 |
| [streaming-performance.test.ts:195](C:/Works/PubProj/ZCode/packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-streaming-history-performance.test.ts:195) | 长历史思考/正文持续输出、完成正文精确一致、帧间隔和搜索长任务预算、定位后不反复夺回滚动。 | manual-review/pending；只读，未运行；没有把预算当实际成绩。 |

上述测试中存在浏览器和 Electron 层面的行为断言，但当前 checkout 的运行结果、Windows 上的真实滚动体验、移动端远程链路与超长单轮性能，均不能由“测试文件存在”直接推出。本文也没有运行 typecheck/lint，因为没有修改其代码，且任务限定只读研究、不运行 UI。

## 8. 对 Space 的采用建议与不适用项

以下是基于前述证据的建议，不是对 Space 当前缺陷的已确认判断。

| 可优先借鉴的合同 | 用途及真实代价 | 不宜直接套用的部分 |
| --- | --- | --- |
| 历史与实时共用稳定 row/turn 身份及单一投影 | 避免重复、覆盖在途流式更新；需要定义版本/序列与陈旧请求判定。 | ZCode 完整 gateway/buffer/profile 机制取决于其 CLI/远控架构，不是 UI 改造的必要前提。[store.ts:1267](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1267)、[gateway.ts:3457](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts:3457) |
| 接近顶部预取＋单飞＋明确 hasOlder | 用户接近旧边界前准备数据；失败后需有明确可恢复路径。 | 两屏和 60/200 rows 是其预算，Space 应用实际 RTT、消息密度决定；只记日志的失败反馈未必够用。[anchor.ts:278](C:/Works/PubProj/ZCode/packages/ui/src/v4/timelineScrollAnchor.ts:278)、[store.ts:1257](C:/Works/PubProj/ZCode/packages/ui/src/v4/conversationProjectionStore.ts:1257) |
| 用户滚动权与稳定条目＋偏移锚定 | 处理历史前插、工具折叠、流式增长时保持阅读上下文。 | 不直接复制时间阈值与整套恢复 guard；不要把像素内存 Map 宣称为跨重启阅读进度。[anchor.ts:57](C:/Works/PubProj/ZCode/packages/ui/src/v4/timelineScrollAnchor.ts:57)、[Timeline.tsx:1888](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:1888)、[memory.ts:11](C:/Works/PubProj/ZCode/packages/ui/src/lib/chatSessionScrollMemory.ts:11) |
| 历史虚拟化＋活动尾轮隔离＋静态 Markdown | 降低历史重渲染和动态尾轮测高冲突。 | 整轮虚拟化对超长单轮仍可能昂贵，普通文档流尾轮也常驻；不能承诺所有消息长度都受 DOM 数上界约束。[Timeline.tsx:2174](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:2174)、[Timeline.tsx:2208](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:2208) |
| 搜索粗定位后等布局再按 Range 精确定位 | 让屏外目标可到达，并避免无可渲染 Range 时持续抢滚动。 | loaded-window 搜索与 1200 自动补页阈值不等于完整历史搜索；宽屏补齐也不是免费索引。[findHook.ts:310](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:310)、[findHook.ts:347](C:/Works/PubProj/ZCode/packages/ui/src/v4/useConversationTimelineFind.ts:347) |
| 回到最新与新消息提醒分别建模 | 回到最新只需要滚动权；若产品需要“新增 N 条”，还要定义已读水位。 | 不把 ZCode 当前无计数的返回按钮包装成新消息计数提示。[Timeline.tsx:2295](C:/Works/PubProj/ZCode/packages/ui/src/v4/ConversationTimeline.tsx:2295) |

## 未证实

- 未实测打开、翻页、搜索与恢复时的时间、CPU、内存峰值，没有跨产品性能排名。
- 未证实逐轮工具／思考手动展开状态在虚拟卸载、窗口刷新和应用重启后均能恢复；本次看到的外层过程开关是局部 state。
- 未证实所有平台及真实远控网络下都完全不跳动；源码有防护和测试意图，不等同于运行证明。
- 未确认全局历史搜索后端的完整召回、索引更新与已归档会话语义；本文确认的是会话内 find 与外部搜索结果进入时间线后的定位协议。
- 未确认时间线之外所有新消息提示；本文只确认回到最新按钮不以新增计数作为输入。
- 未证明整轮虚拟化足以应对单轮数万字、极多工具输出、富媒体异步尺寸等极端负载。

## 未解问题

1. Space 的“历史体验”承诺是否包含完整全文搜索、工具/思考检索、归档检索？若包含，采用本地已加载窗口查找还是权威查询？
2. 阅读位置需要保持到什么层级：同一 pane 内切换、刷新恢复、跨设备同步，还是稳定消息／段落级语义锚点？像素记忆不能替代这项产品选择。
3. Space 是否真的需要宽屏问题目录；若需要，是否值得为目录加载整份正文，还是提供轻量 turn 索引？ZCode 的实现提供了一种明确取舍，不能证明它对 Space 最适合。
4. 分页失败、只搜索了部分历史、存在新消息时，用户应该看见哪些独立状态？这些属于 Space 的交互合同，需要与源码现状一起决定。
5. 在 Space 的真实数据中，瓶颈更偏总轮数、单轮长度、工具数量还是 Markdown/富媒体？应先以代表性会话建立基线，再选虚拟粒度与缓存边界。
