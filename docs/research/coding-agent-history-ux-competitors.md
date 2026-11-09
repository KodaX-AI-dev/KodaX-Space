# Coding agent 如何让用户浏览当前会话的较早消息？

**结论摘要：可核实的参考是把“找另一个会话”“回看本会话”“展开执行细节”“压缩模型上下文”分开表达；Cursor 提供跨会话与会话内搜索，VS Code 提供全文查找与消息跳转，历史 Cascade 提供用户消息目录，Claude Code Desktop 提供 transcript 详细程度切换。它们不能证明四家都采用向上自动加载，更不能证明压缩后所有客户端始终能回看完整原文。** [Cursor 搜索](https://cursor.com/help/ai-features/conversation-search)、[VS Code 会话内导航](https://code.visualstudio.com/docs/chat/chat-overview#find-text-in-a-chat-session)、[Cascade 1.6.1 发布说明](https://docs.devin.ai/desktop/changelog#v1-6-1)、[Claude Desktop 视图](https://code.claude.com/docs/en/desktop#switch-view-modes)

调研日期：2026-11-09。输入问题：KodaX 会话顶部的低对比文字按钮“查看已保存记录”容易让人认为眼前历史不完整。该反馈为研究前提，本笔记没有检验 KodaX 的保存、分页或展示实现，也没有亲自操作竞品。

## 证据范围与时效

- 结论只使用已检索并打开的第一方文档、第一方工程博客和官方发布说明；搜索摘要、社区用户反馈、官方仓库中的用户 issue 不作为功能已实现的证据。
- Cursor 同时有 Agents Window 与经典 IDE；搜索文档明确把跨会话搜索放在 Agents Window。本笔记不会把它推成全部界面的相同入口。[Cursor Agents Window：Choosing Between Agents Window and Editor](https://cursor.com/docs/agent/agents-window#choosing-between-agents-window-and-editor)
- **Windsurf 有重大时效边界**：原 Cascade 文档现重定向到 Devin；当前官方页明确写明 Cascade 为 legacy，Devin Desktop 不再创建新 Cascade 会话，也不再打开旧会话。下文 Cascade 的目录等行为均标作历史版本能力，不能作为当前 Devin Local 的承诺。[Cascade legacy：页面开头](https://docs.devin.ai/desktop/cascade)
- Claude 的范围是 Desktop 的 Code tab；CLI 文档仅用于说明证据边界。不能把 Claude Chat、Cowork、终端 transcript 的行为自动套到 Code tab。[Claude Desktop：Coming from the CLI?](https://code.claude.com/docs/en/desktop#coming-from-the-cli)

## 四产品比较

“未证实”表示本次第一方来源未给出足够证据，不表示产品没有该能力。

| 维度 | Cursor | Windsurf / Cascade | Claude Code Desktop | VS Code / GitHub Copilot |
| --- | --- | --- | --- | --- |
| 找另一个会话 | Agents Window 支持搜索过去 transcripts。[来源](https://cursor.com/help/ai-features/conversation-search) | 历史 Cascade 用左上角下拉菜单切换；当前已停开旧 Cascade。[来源](https://docs.devin.ai/desktop/cascade#simultaneous-cascades) | 侧栏管理、分组排序与归档入口。[来源](https://code.claude.com/docs/en/desktop#organize-and-find-sessions) | Sessions list 与中间 conversation 明确分区。[来源](https://code.visualstudio.com/docs/agents/run/chat-view#interface-overview) |
| 本会话查找 / 跳转 | Ctrl+F 搜索并在命中之间跳转。[来源](https://cursor.com/help/ai-features/conversation-search) | 1.6.1 引入所有用户消息目录；滚动时出现，可跳到历史消息。[来源](https://docs.devin.ai/desktop/changelog#v1-6-1) | Code tab 的本会话全文搜索、消息目录未证实。 | Ctrl+F、上一/下一 prompt；搜索涵盖屏幕外文本。[来源](https://code.visualstudio.com/docs/chat/chat-overview#find-text-in-a-chat-session) |
| 向上分页 / 自动加载 | 具体触发、批量大小、到顶提示未证实。 | 同左；旧版目录不证明分页策略。 | 同左。 | 同左；可搜屏幕外内容不证明后端分页策略。 |
| 折叠细节 | 1.4 Compact chat mode 默认折叠 diff、隐藏工具图标。[来源](https://cursor.com/changelog/1-4) | 通用工具调用折叠策略未证实。 | Normal / Thinking 折叠工具摘要；Verbose 展示中间步骤。[来源](https://code.claude.com/docs/en/desktop#switch-view-modes) | 工具与推理详细程度可调；终端输出有折叠区。[来源](https://code.visualstudio.com/docs/chat/chat-overview#customize-the-chat-display)、[工程博客](https://code.visualstudio.com/blogs/2026/03/05/making-agents-practical-for-real-world-development#handle-large-outputs) |
| 压缩与原始记录 | 压缩有损；官方工程文章说明历史文件可供 agent 回查。[来源](https://cursor.com/blog/dynamic-context-discovery#2-referencing-chat-history-during-summarization) | @历史对话通常检索摘要和相关片段，不是整份对话；这不证明压缩后的 UI 行为。[来源](https://docs.devin.ai/desktop/cascade#-mention-previous-conversations) | 自动摘要与 /compact 已证实；Desktop 压缩后完整原文的回看契约未证实。[来源](https://code.claude.com/docs/en/desktop#check-and-free-up-context) | 自动压缩与 /compact 已证实；文档定义其作用为节省后续模型请求上下文。[来源](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#compact-conversation-context) |

## 1. Cursor：把跨会话检索与当前 transcript 导航分开

- 官方 Conversation search 分成两个问题：过去会话在 Agents Window 的命令入口搜索（Windows/Linux Ctrl+K）；当前会话用 Ctrl+F，并有命中计数和命中跳转。这是入口和作用域明确分开的证据，不是“查看已保存记录”的同义功能。[Conversation search：两个 How do I… 小节](https://cursor.com/help/ai-features/conversation-search)
- 2025-08-06 的 1.4 发布说明把 Compact chat mode 定义为视觉密度设置：隐藏工具图标、默认折叠 diff、空闲时隐藏输入框。该条没有说删除会话文字，也没有承诺所有工具结果统一以何种样式折叠。不能把这里的 compact mode 当成上下文 /compact。[1.4：Compact chat mode](https://cursor.com/changelog/1-4)
- 2026-01-06 第一方工程文章说明，上下文满时会摘要；摘要是有损压缩，但会把历史文件引用交给 agent，让它搜索摘要遗漏的细节。它证实“模型当前窗口”和“可检索历史文件”可分离，不足以证明任意版本 UI 的逐条加载方式。[Dynamic context discovery：第 2 节](https://cursor.com/blog/dynamic-context-discovery#2-referencing-chat-history-during-summarization)
- Shared transcripts 文档把分享对象描述为包含代码、工具调用及结果的完整会话历史。这提供另一种记录出口，但该功能受套餐限制，也不能替代当前会话向上浏览的证据。[Shared transcripts：What gets shared? / Which plans support shared transcripts?](https://cursor.com/help/ai-features/shared-transcripts)

**边界**：旧 `docs.cursor.com/en/agent/chat/history` 搜索结果仍显示旧 History panel 说明，但本次打开已重定向到文档首页，因此不采纳其快捷键、SQLite 细节或入口为现行事实；“Load older messages”仅查到社区反馈，没有核实到现行第一方产品契约。

## 2. Windsurf / Cascade：历史版本的消息目录最值得借鉴

- 官方 1.6.1（2025-04-02）发布说明明确：滚动对话时出现覆盖所有过去用户消息的目录；可滚动到任意过去消息，也可从目录执行 revert。**浏览定位和代码回滚在同一目录中是不同动作**，设计时需要避免混淆。[Devin Desktop changelog：v1.6.1 → Improvements to Long Conversations](https://docs.devin.ai/desktop/changelog#v1-6-1)
- legacy 文档保留了两个不同作用域：左上角下拉菜单切换不同 Cascades；@mention 过去对话时，模型取相关摘要、checkpoint 和被询问片段，通常不取全文。后者是模型上下文检索，不是用户浏览原始记录的入口。[Cascade：Simultaneous Cascades / @-mention previous conversations](https://docs.devin.ai/desktop/cascade)
- 同页现在同时保留旧行为描述和开头的停用声明，应以停用声明理解当前可用性；不能因正文还写着切换操作就判断旧会话现仍可打开。共享 Cascade 页面也已移除。[Cascade：页面开头 / Sharing your conversation](https://docs.devin.ai/desktop/cascade)

**边界**：未证实 Cascade 的消息分页、具体向上加载按钮、工具调用折叠、压缩标记或全文搜索；也不根据旧 Cascade 文档推断 Devin Local 当前实现。

## 3. Claude Code Desktop：用展示模式解释执行细节，用 context 解释模型记忆

- Desktop 的 Transcript view 可通过会话标题旁菜单或 Ctrl+O 切换：Normal 保留全文回答并把工具调用压成摘要；Thinking 加上思考；Verbose 展示工具调用、文件读取和中间步骤。官方还注明旧版本的 Summary 模式在新版映射为 Normal。因此“摘要式展示”应视为视图选择，不能直接当成丢失历史。[Desktop：Switch view modes](https://code.claude.com/docs/en/desktop#switch-view-modes)
- 侧栏分组排序和 Archived 入口负责找会话；context 使用量与 /compact 负责模型窗口。官方说窗口满时自动摘要并继续，也支持手动摘要，但没有在该说明中承诺 Code tab 在压缩后如何展开全部旧原文。[Desktop：Organize and find sessions / Check and free up context](https://code.claude.com/docs/en/desktop#organize-and-find-sessions)
- 通用引擎说明提醒摘要可能丢失早期详细指令，说明压缩确实改变模型可直接使用的信息。[How Claude Code works：When context fills up](https://code.claude.com/docs/en/how-claude-code-works#when-context-fills-up)
- CLI 的 Manage sessions 页明确标注自己覆盖 CLI：恢复已压缩会话时使用最后摘要、未被摘要消息及后续消息，已摘要的旧消息不会再次加载；它同时说明 transcript 文件与保留策略。**不能把“文件曾保存”推成 Desktop 当前视图会自动显示全部，也不能把“未再次加载”推成原文件立刻删除。** [Manage sessions：页面开头 / What a resumed session restores / Where transcripts are stored](https://code.claude.com/docs/en/sessions)

**边界**：没有查到足够的 Desktop 第一方证据确认会话内 Ctrl+F、消息目录、向上分页或压缩前原文的稳定回看入口；Chat/Cowork 搜索文档和 CLI 快捷键均不拿来补空白。

## 4. VS Code / GitHub Copilot：会话列表、查找、定位、折叠各司其职

- Chat view 文档把顶部 Sessions list、中间 Chat conversation、底部输入框分别命名；列表可与对话并排，也可选择会话后用返回键回列表。找会话和读本会话是明确不同层级。[Use the Chat view：Interface overview / Sessions list layout](https://code.visualstudio.com/docs/agents/run/chat-view#interface-overview)
- 会话内 Ctrl+F 搜索 prompts、responses、屏幕外文字和代码块；命中 Completed N steps 折叠区会展开它。查找不含 tool pills 或折叠 reasoning。另有上一/下一 prompt、代码块快捷键和 sticky prompt。这里的“全文”有清楚的搜索边界。[Use chat：Find text / Navigate between prompts / Customize the chat display](https://code.visualstudio.com/docs/chat/chat-overview#find-text-in-a-chat-session)
- 执行细节可用 View Mode 控制；官方工程博客也解释终端输出放入可折叠区，目的在于保留按需查看能力并减少长对话噪音。[Use chat：Customize the chat display](https://code.visualstudio.com/docs/chat/chat-overview#customize-the-chat-display)、[2026-03-05 工程博客：Handle large outputs](https://code.visualstudio.com/blogs/2026/03/05/making-agents-practical-for-real-world-development#handle-large-outputs)
- 管理会话文档把 compaction 定义为摘要早期历史、节省后续请求 token，并支持 /compact 或 context 控件；保存记录则有独立的 Export Chat、Copy All / Copy Final Response，其中 Copy All 包含中间步骤与工具调用。这些是独立功能，不能由此保证每个 provider 和所有压缩状态均完整导出。[Manage sessions：Compact conversation context](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions#compact-conversation-context)、[Session history：Export or copy a conversation](https://code.visualstudio.com/docs/agents/run/sessions/session-history#export-or-copy-a-conversation)

**边界**：当前文档覆盖多个 agent harness，具体能力有 harness/状态限制；“搜索屏幕外内容”不等于已证明无限滚动或后端游标分页。未在本次研究中审计 VS Code 源码或运行长会话。

## 对 KodaX 问题的推论（设计建议，不是竞品事实）

1. 同一会话的较早消息入口宜用“加载更早消息”或“查看本会话较早消息”，并在真实存在尚未加载记录时显示数量/范围和加载状态；“已保存记录”更像独立存档概念，不能仅靠颜色调整说明作用域。这个建议来自 Cursor 的双作用域搜索与 VS Code 的列表/对话分区，不是已经完成的用户实验。[依据](https://cursor.com/help/ai-features/conversation-search)、[依据](https://code.visualstudio.com/docs/agents/run/chat-view#interface-overview)
2. 可以采用原位补充较早消息，并保留当前阅读位置；若需要快速穿越长会话，可考虑用户消息目录或上一/下一 prompt。目录有历史 Cascade 的直接先例，prompt 跳转有 VS Code 的直接先例；原位加载与锚点保持是本研究建议，尚无本次竞品证据验证其普遍性。[Cascade 依据](https://docs.devin.ai/desktop/changelog#v1-6-1)、[VS Code 依据](https://code.visualstudio.com/docs/chat/chat-overview#navigate-between-prompts-in-a-chat-session)
3. 折叠工具调用、收起长输出可以减少噪音，但需要可辨识的展开入口；上下文摘要应另用状态说明。只有在 KodaX 的持久化与读取路径已证实完整时，才可显示“原始消息仍可查看”等保证。[Claude 视图依据](https://code.claude.com/docs/en/desktop#switch-view-modes)、[Cursor 压缩依据](https://cursor.com/blog/dynamic-context-discovery#2-referencing-chat-history-during-summarization)

## 未证实

- 四家当前桌面/IDE 产品统一采用“向上滚动自动加载”，或统一采用显式按钮；具体阈值、页大小、滚动锚点、虚拟化与数据库分页均未核实。
- “大多数竞品没有查看历史按钮”“大多数竞品一定保留并展示所有早期消息”“压缩只影响模型且完全不影响 UI”都不能由本次证据得出。
- 各产品在网络失败、长时间未打开、版本迁移、已归档/删除、保留期限到期等情况下的完整恢复保证未逐一核实。
- 不能把官方论坛中的用户体验描述当成官方已实现规格；本次也没有据此给出对比度、按钮尺寸、位置或易用性评分。

## 未解问题

1. KodaX 的“查看已保存记录”到底打开另一种会话记录视图，还是补齐当前会话的较早消息？是否有未持久化、被压缩、仅未加载、被过滤四种状态混用？需要代码与运行证据回答。
2. 本任务最小修复是明确文案与范围，还是需要统一 transcript 数据源及分页？需要先量化真实消息数、可加载数和展示数。
3. 是否需要新增全文搜索或消息目录，取决于用户查找任务与典型会话长度；四家存在相关模式，不构成 KodaX 必须实现全部功能的理由。
4. 如需确认竞品实际向上加载与压缩后的完整回看，需要固定产品版本、客户端、会话类型和足够长的样本进行实机验证；本笔记没有这类观察。
