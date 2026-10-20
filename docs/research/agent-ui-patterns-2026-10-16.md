# 顶尖 Agent 工作台有哪些值得 KodaX Space 借鉴的界面模式？

TL;DR：建议把 Space 的主工作区改成连续画布，把左右区域变为导航与按需展开的工作面；真正值得借鉴的是「任务切换—过程压缩—待办外露—成果审阅」的层次，而不是把所有区域都换成漂亮卡片。这是结合下列第一方资料与当前源码的设计推断，不是全球审美排名。

调研日期：2026-10-16。范围：Claude Code Desktop、Cursor Agents Window、Codex、Google Antigravity、T3 Code、Conductor、Zed，以及 Linear 的第一方设计复盘。方法：实际打开官方文档、第一方文章与官方源码；没有登录并逐项操作这些产品，不能把文档描述当作已经亲测的行为、动画或性能。官网宣传中的评价和用户证言不作为证据。

## 1. Space 的现实约束与用户观察

- Space 的产品定位是 Provider 中立、本地优先的桌面 Agent 工作台，不以替代 IDE 为目标；Coder 的主要产出是代码变更，Partner 的主要产出是文档、报告、表格等 Artifact。因此视觉方案必须同时容纳会话、审阅和成果阅读，不能直接复制以编辑器为中心的 IDE 布局。[PRD 定位](../PRD.md#1-产品定位)、[与 IDE 的差异](../PRD.md#22-与-cursor--windsurf--cline-的差异)、[Coder / Partner 对照](../PRD.md#23-partner-全场景--全功能)。
- 用户所说的「三栏都是卡片」有源码依据：Shell 外层使用 `gap-2.5 p-2.5`，中央使用 `rounded-xl border ... lift`；LeftSidebar 和 RightSidebarFrame 也都使用 `glass lift ... border ... rounded-xl`。这里只确认结构与样式类，不据此推断所有屏幕尺寸的实际观感。[Shell.tsx:1477](../../apps/desktop/renderer/src/shell/Shell.tsx#L1477)、[Shell.tsx:1567](../../apps/desktop/renderer/src/shell/Shell.tsx#L1567)、[LeftSidebar.tsx:181](../../apps/desktop/renderer/src/shell/LeftSidebar.tsx#L181)、[RightSidebarFrame.tsx:38](../../apps/desktop/renderer/src/shell/RightSidebarFrame.tsx#L38)。
- Space 已有四级 surface、文字层次和琥珀强调色 token，视觉系统不是从零开始；重构应先明确各 surface 的使用语义，避免又加一套主题系统。[styles.css:26](../../apps/desktop/renderer/src/styles.css#L26)。
- Space 已有右侧 default / half / max / custom 宽度语义及相关按钮；研究中的「review 获得足够面积」主要是组织与默认行为的问题，不是要求重复实现扩宽功能。[RightSidebarFrame.tsx:5](../../apps/desktop/renderer/src/shell/RightSidebarFrame.tsx#L5)。会话源码也明确记录用户曾反馈 `max-w-3xl` 在宽屏留下过多空白，当前采用少量横向 padding、不全局限宽；这是设计约束，不能在研究后直接退回固定窄阅读列。[ConversationStreamV2.tsx:2182](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2182)。

**设计判断**：问题首先是三个区域被赋予相似的容器重量，削弱了主次；其次才是某个颜色或圆角是否好看。取消中央外框是合理的第一步，但不能自动解决多重页头、过密控制、状态噪声和成果面积的问题。依据是上述源码结构；需要原型对比验证，不把这个判断包装成已被竞品证明的结论。

## 2. 产品证据与迁移价值

### Claude Code Desktop：自由安排工作面，压缩过程信息

**官方事实**：

- Code 的会话在侧栏管理；会话内部支持 chat、diff、browser、terminal、file、plan、tasks、subagent 等可拖动、缩放和关闭的 pane。[Arrange your workspace](https://code.claude.com/docs/en/desktop#arrange-your-workspace)。
- Normal 把工具调用压成摘要；Thinking 额外显示 thinking；Verbose 展示每次工具调用和中间步骤。当前文档明确旧版 Summary 模式已移除，旧截图不代表现状。[Switch view modes](https://code.claude.com/docs/en/desktop#switch-view-modes)。
- 修改发生后，`+12 -1` 一类统计可打开 diff；文件列表和具体变更分栏，支持逐行评论与批量反馈。[Review changes with diff view](https://code.claude.com/docs/en/desktop#review-changes-with-diff-view)。
- 侧栏可按状态、项目、环境过滤和分组；可以并排查看两个 session。[Work in parallel with sessions](https://code.claude.com/docs/en/desktop#work-in-parallel-with-sessions)。

**对 Space 的推断**：借鉴摘要层和可展开工作面，比照搬其窗口样式更有价值。默认会话应优先显示意图、阶段、结果；工具细节保留可达入口。右侧若正在审阅代码，应允许扩成主要工作面。不要为复制自由布局而引入完整 docking 系统，Space 现有宽度控制可以先承担这一职责。

### Cursor Agents Window：Agent 工作台与传统编辑器分工

**官方事实**：

- Agents Window 是独立的 Agent 优先界面，可在多个项目和执行环境间工作，并能随时回到经典 IDE，或同时打开二者。[Agents Window](https://cursor.com/docs/agent/agents-window#choosing-between-agents-window-and-editor)。
- 该界面集合多 workspace、并行 agent、worktree、diff、提交与 PR 管理。[Features available only in the Agents Window](https://cursor.com/docs/agent/agents-window#features-available-only-in-the-agents-window)。
- 文件搜索和查看可直接在 Agents Window 内完成，不必为了检查文件强制切回编辑器。[Switch back to the IDE](https://cursor.com/docs/agent/agents-window#switch-back-to-the-ide)。
- 官方同时记录 queue 与 steer：后续指令可排队，也可在安全边界引导运行中的 Agent；不同入口处于不同推出阶段。[Queued messages / Steer](https://cursor.com/docs/agent/overview#queued-messages)。

**对 Space 的推断**：Space 无需增加大型编辑器来获得专业感；任务导航、过程、diff、交付出口的完整性更接近自身定位。并行任务主要通过列表和状态组织，只有用户主动比较时才同时打开多个会话。输入框应说明此刻的发送行为，避免用户以为「继续说话」一定会打断或一定会排队。

### Codex：审阅是独立工作，作用域必须清楚

**官方事实（official OpenAI documentation）**：

- 本地 review pane 可以查看变更、留下行级反馈、选择暂存或还原；作用域包括 Unstaged、Staged、Commit、Branch、Last turn。[Review local changes](https://learn.chatgpt.com/docs/code-review#review-local-changes)、[What changes it shows](https://learn.chatgpt.com/docs/code-review#what-changes-it-shows)。
- review pane 反映仓库状态，包含 Agent、用户和其他来源的未提交变更，不能把所有内容都标成 Agent 所写。[What changes it shows](https://learn.chatgpt.com/docs/code-review#what-changes-it-shows)。
- 行级评论保留文件和行上下文；后续消息明确请求处理评论。可在整个 diff、文件、hunk 三个粒度暂存或还原。[Inline comments](https://learn.chatgpt.com/docs/code-review#inline-comments-for-feedback)、[Staging and reverting](https://learn.chatgpt.com/docs/code-review#staging-and-reverting-files)。
- OpenAI 第一方工作流文章把并行 thread、Git worktree、技能和自动化列为桌面长任务的组成部分。[Run long horizon tasks with Codex / Why Codex can stay coherent](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex#why-codex-can-stay-coherent-on-long-tasks)。

**对 Space 的推断**：最值得借鉴的是审阅作用域和变更归属的可见性。一个看起来精致但无法解释「这是本轮、整条分支还是整个工作区的变更」的面板仍然不可靠。中央与 review 的面积应随当前工作变化，右侧不应永远只有一个狭窄宽度。

### Google Antigravity：按任务组压缩过程，把待处理决策单独露出

**官方事实**：

- Artifact 包括实现计划、diff、图、图片和浏览器录屏；桌面 App 有用于组织 Artifact 的侧栏和 review pane，可以查看计划、diff 与录屏。[Artifacts / Reviewing artifacts across surfaces](https://antigravity.google/docs/artifacts#reviewing-artifacts-across-surfaces)。
- IDE 的 task group 顶部描述目标与本组修改，变更文件入口可直接检查文件；子任务的执行细节默认折叠。[Task groups / Overview](https://antigravity.google/docs/tools/#overview)、[Subtasks and progress updates](https://antigravity.google/docs/tools/#subtasks-and-progress-updates)。
- 需要批准的终端命令、浏览器设置等 pending step 有单独区域，不要求用户展开所有过程日志才能发现。[Pending steps](https://antigravity.google/docs/tools/#pending-steps)。
- 计划支持行内反馈、Proceed，以及提交评论后让 Agent 继续修改计划。[Implementation plan](https://www.antigravity.google/docs/ide-implementation-plan#implementation-plan)。

**对 Space 的推断**：任务卡片只在它真的是一个可复核的工作单元时成立；不应把每条微小工具事件都做成同等卡片。折叠执行细节时，等待审批、失败和需要输入的状态必须留在外层。Coder / Partner 可以共享同一任务组骨架，但成果区域分别呈现 diff 与文档，避免在通用卡片内挤压复杂内容。

**范围说明**：上面的 task group 资料标注为 Antigravity IDE；Artifact 页面标注为 App / CLI。两种 surface 的信息不能混合成一个未经实际操作的「当前桌面截图」。早期 Agent Manager 的命名和布局不作为本文事实。

### T3 Code：与 Space 更接近的多 Agent 壳，源码可核对

**官方事实**：

- permission mode 位于 composer，作用于当前 thread；审批在会话中处理，不同 provider 能力有差异。[Permission modes](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/docs/user/permission-modes.md#permission-modes)。
- composer 支持 Queue / Steer，快捷动作可以让当前 thread 留在后台并打开新 thread；PR 可在右侧 panel，diff 支持跨文件搜索。[Composer controls](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/docs/user/keybindings.md#composer-controls)、[Find in a diff](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/docs/user/keybindings.md#find-in-a-diff)。
- 锁定源码中的 DiffPanelShell 有 inline、sheet、sidebar、embedded 模式；inline 模式用 `border-l` 分隔，宽度为 `42vw`，上下限 `360px` / `560px`，该容器没有圆角或卡片阴影类。[DiffPanelShell.tsx:8–45](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/apps/web/src/components/DiffPanelShell.tsx#L8-L45)。
- 侧栏可收起、可拖动调整，增宽时保护主内容最小宽度；chat canvas 布局函数的默认阅读宽度上限为 `768`，会为 preview 和 composer 避让。[AppSidebarLayout.tsx:312–340](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/apps/web/src/components/AppSidebarLayout.tsx#L312-L340)、[chatCanvasLayout.ts:21–56](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/apps/web/src/components/chat/chatCanvasLayout.ts#L21-L56)。

**对 Space 的推断**：这里提供的是「画布面积和内容排版可以分别控制」的实现参照，不是恢复 Space 全局窄列的理由。Space 已收到固定窄列浪费宽屏的反馈；应优先保留自适应内容，只对真正过长的文字行探索局部排版，diff、表格、图像继续按内容需求获得空间。上述数值只是该 commit 的实现，不建议原样搬到 Space，也不能由这个组件断言 T3 所有页面都没有卡片。[Space 用户反馈记录](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2182)。

源码快照：通过官方仓库 API 实际读取 `main`，解析为 commit `e3b35d1b2440b104f0bc2e357377c348121234dd`，以上源码引用均锁定该 commit。

### Conductor：工作单元与审阅闭环比 Agent 数量更重要

**官方事实**：

- workspace 是委派单元，branch / PR 是集成单元；一个可独立交付的改动对应一个 workspace。[Workflow / Break down the problem](https://www.conductor.build/docs/concepts/workflow#break-down-the-problem)。
- 独立交付任务使用多个 workspace；需要共享分支与代码状态的协作使用同一 workspace 中多个 Agent。[Parallel agents](https://www.conductor.build/docs/concepts/parallel-agents#decision-guide)。
- Diff Viewer 有文件列表、unified diff、按 commit 过滤和行级评论；行内反馈可变成 composer 附件发送给 Agent。[Diff viewer](https://www.conductor.build/docs/reference/diff-viewer#what-to-review)、[Verify, review, and resolve conflicts](https://www.conductor.build/docs/concepts/workflow#verify-review-and-resolve-conflicts)。
- Checks 收集 Git、PR、CI、部署、评论和 todo 等合并就绪状态，具体区块取决于仓库与连接情况。[Checks / What it shows](https://www.conductor.build/docs/reference/checks#what-it-shows)。

**对 Space 的推断**：不要用越来越多的 Agent 卡片表现「强大」。导航优先显示可独立理解的工作流和产出，协作细节放在任务内部。右侧的目的应是帮助用户做下一项决定，而不是无差别罗列模型、Token、日志和工具状态。合并就绪、等待输入等关键状态可以用紧凑摘要表示，完整证据按需打开。

**适用边界**：Conductor 的 branch / PR / merge 闭环针对编码；Partner 的研究、写作和表格任务应借鉴「可独立复核的工作单元」与状态组织，不能强行加入 Git / PR 页头。同样，Zed 的编辑器内 hunk 操作只直接适用于 Coder；Partner 应以引用、版本、预览、导出等成果语义代替。[Space 两种产出](../PRD.md#23-partner-全场景--全功能)。

### Zed：渐进披露与真实能力边界

**官方事实**：

- Threads Sidebar 按项目组织多个独立 thread，可归档和恢复；title bar 的 worktree picker 用于选择或创建隔离工作区。[Managing Multiple Threads](https://zed.dev/docs/ai/agent-panel#managing-multiple-threads)。
- 编辑文件数与行数会露出在 Agent Panel；composer 上方的折叠入口与 Review Changes 可打开完整变更，支持按 hunk 接受或拒绝。[Reviewing Changes](https://zed.dev/docs/ai/agent-panel#reviewing-changes)。
- 官方明确一些外部 Agent 不支持历史恢复、checkpoint 或 Token 信息等所有能力；不能为所有 Agent 画完全相同的能力承诺。[Overview](https://zed.dev/docs/ai/agent-panel#overview)。
- 沙箱审批可以针对特定 host、路径或命令，并区分单次、当前 thread、永久授权。[Approval Prompts](https://zed.dev/docs/ai/sandboxing#approval-prompts)。

**对 Space 的推断**：多 provider 的统一风格应统一布局、视觉词汇和操作规则，同时诚实呈现能力差异。审批需要在简洁外观里交代动作、目标与授权范围；不靠大面积红黄背景制造紧张，也不能把范围藏进小字 tooltip。

### Linear：统一的是层次和视觉变量，不是所有容器的形状

**第一方设计复盘事实（2024 设计过程，不当作 2026 逐屏现状）**：

- 设计团队把 sidebar、tabs、headers、panels 一起调整，以减少视觉噪声、加强对齐和导航密度；探索以全局 chrome 的倒 L 形为出发点。[Concept exploration](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=I%20started%20to%20focus%20on%20this%20inverted%20L-shape)。
- 复盘描述主题围绕 base、accent、contrast 生成；同时区分 background、foreground、panel、dialog / modal 的 elevation。[Appearance](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=instead%20of%20having%20to%20define%2098)。
- 上线前测试环境、外观与层次，在 list、board、timeline、split、fullscreen 等布局检验视觉系统。[Hierarchy](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=Linear%20relies%20on%20a%20set%20of%20structured%20layouts)。

**对 Space 的推断**：更值得借鉴「外壳与内容分开、主题控制一致、在真实复杂状态测试」的方法，不是复制 Linear 的紫色、字体或所有像素。Space 已有语义 token，适合保留品牌强调色并校正用法，而不是为了新鲜增加很多颜色选项。

## 3. 横向归纳：哪些是证据，哪些是设计决定

| 议题           | 第一方资料支持什么                                                                                                                                                                                                                                                                                                                                                  | 给 Space 的建议（设计推断）                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 主工作区去卡片 | T3 的特定 diff inline 容器采用分隔线；Linear 把 chrome 与内容层次作为设计目标。不能由此证明「所有顶尖工具都无卡片」。[T3 source](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/apps/web/src/components/DiffPanelShell.tsx#L28-L45)、[Linear](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=inverted%20L-shape) | 优先试中央连续画布、左右贴边分区；阴影留给真正覆盖页面的浮层。                                       |
| 左栏           | Claude、Zed 都以项目 / session / thread 组织与切换工作。[Claude](https://code.claude.com/docs/en/desktop#work-in-parallel-with-sessions)、[Zed](https://zed.dev/docs/ai/agent-panel#managing-multiple-threads)                                                                                                                                                      | 做紧凑列表，标题与状态为主；状态变化不改变行高，不把会话做成反复嵌套的卡片。                         |
| 右栏           | Claude 支持可调整 pane；Codex 有完整 review 工作面。[Claude](https://code.claude.com/docs/en/desktop#arrange-your-workspace)、[Codex](https://learn.chatgpt.com/docs/code-review#review-in-the-app)                                                                                                                                                                 | 利用 Space 已有 half / max 控制；轻量信息用 Inspector，阅读报告 / review diff 时组织为更大的工作面。 |
| 执行过程       | Claude Normal 压缩工具；Antigravity 默认折叠子任务细节。[Claude](https://code.claude.com/docs/en/desktop#switch-view-modes)、[Antigravity](https://antigravity.google/docs/tools/#subtasks-and-progress-updates)                                                                                                                                                    | 相邻读取 / 搜索可视觉归组；保持真实 SDK 事件身份，视觉归组不生成第二份会话事实。                     |
| 等待审批       | Antigravity 把 pending step 外露；Zed 按授权对象和时长表达审批。[Antigravity](https://antigravity.google/docs/tools/#pending-steps)、[Zed](https://zed.dev/docs/ai/sandboxing#approval-prompts)                                                                                                                                                                     | 强调只分配给当前需要用户操作的区域，已完成步骤归于安静。                                             |
| 成果审阅       | 多产品提供 diff、行级评论、产物或证据专用表面。[Codex](https://learn.chatgpt.com/docs/code-review#inline-comments-for-feedback)、[Antigravity](https://antigravity.google/docs/artifacts#reviewing-artifacts-across-surfaces)、[Conductor](https://www.conductor.build/docs/reference/diff-viewer#comments)                                                         | 结果不只有一条「完成」消息；应有可打开、可复核、可继续迭代的对象。                                   |
| 密度           | Linear 明确改进导航密度；T3 把画布与正文宽度分开。[Linear](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=increase%20the%20hierarchy%20and%20density)、[T3](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/apps/web/src/components/chat/chatCanvasLayout.ts#L24-L56)                                             | 导航紧凑，正文舒展，diff / 表格可宽；避免把所有区域统一成相同 padding。                              |

## 4. 建议的 Space 原型规则

以下均为待验证设计建议，不是竞品的官方规范；引用用于说明推导依据。

1. **一个外壳，一个连续主画布。** 左栏承担导航，中央承担当前工作，右侧随选择出现；中央先移除外层 `rounded-xl + border + lift`，左右避免同等外阴影。保留内容内部的输入框、审批块与成果对象边界。[Space 当前结构](../../apps/desktop/renderer/src/shell/Shell.tsx#L1477)、[T3 分栏实现](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/apps/web/src/components/DiffPanelShell.tsx#L28-L45)。
2. **让内容决定宽度。** 保留 Space 已有自适应宽度，不重新全局锁成 `max-w-3xl`。若超长文字行确实影响阅读，局部比较正文排版与内容宽度；代码审阅、图片、图表和 Artifact 保留大工作面。最小窗口、常见笔记本和宽屏分别验证。[Space 既有反馈](../../apps/desktop/renderer/src/shell/ConversationStreamV2.tsx#L2182)、[T3 可分离的布局参照](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/apps/web/src/components/chat/chatCanvasLayout.ts#L24-L56)。
3. **连续对话，分组过程。** 最终回复保持文档式连续阅读；工具调用用可展开行或阶段分组。成功不持续发光，等待输入 / 失败获得可见位置。[Claude transcript modes](https://code.claude.com/docs/en/desktop#switch-view-modes)、[Antigravity pending steps](https://antigravity.google/docs/tools/#pending-steps)。
4. **卡片有明确语义。** 可使用卡片的对象：待审批决策、可选择方案、可打开成果、独立任务摘要；普通区域布局、长正文和每个工具事件无需自动成为卡片。此规则是上述模式的综合推断，先用真实会话验证。[Antigravity task groups](https://antigravity.google/docs/tools/#overview)、[Zed compact change entry](https://zed.dev/docs/ai/agent-panel#reviewing-changes)。
5. **主题统一通过角色，而非涂同一种颜色。** 区分 app chrome、content、inset、overlay；强调色主要用于主动作、选中和少量品牌位置；成功 / 警告 / 错误按状态语义另设。沿用现有 token，测试明暗主题的文字、边界和焦点。[Space tokens](../../apps/desktop/renderer/src/styles.css#L26)、[Linear appearance](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=instead%20of%20having%20to%20define%2098)。
6. **多 Provider 一致外观、诚实能力。** 统一 composer 和审批排版，不能为缺失能力画出假的 checkpoint、进度百分比或完整审阅功能。[Zed capability caveat](https://zed.dev/docs/ai/agent-panel#overview)、[T3 provider differences](https://github.com/pingdotgg/t3code/blob/e3b35d1b2440b104f0bc2e357377c348121234dd/docs/user/permission-modes.md#provider-differences)。
7. **动态效果必须对应状态或空间变化。** 优先验证侧栏展开、内容切换、工具分组展开、提交后的输入状态等有限动作。循环光效、粒子、流动背景是否合适，需要真实长会话观察；本文没有第一方证据证明「动画越多越好」。Space 当前已有丰富 glass / breathing / shimmer 等效果，新的设计应审视总量而非继续叠加。[Space styles](../../apps/desktop/renderer/src/styles.css#L1285)。

## 5. 未证实与资料冲突

- **「全球最好看的 Agent 工具」没有可核对的统一排名。** 本文没有把官网评语、社交平台推荐或收录网站数量当成审美证据；最后的美学选择仍需用户对同等完成度原型的比较。
- **不能证明去卡片一定提高效率。** 已找到真实实现参照，但 Space 的改善幅度需要用自己的密集会话、成果与窗口尺寸验证。
- **竞品精确颜色、字体、圆角、动效时长与帧率未测量。** 不引用模型记忆给出貌似精确的数值；唯一列出的布局数值来自锁定 T3 源码。
- **Claude 旧文档 / 搜索缓存与当前英文正文存在版本差异。** 例如旧页面列 Summary，当前英文页面明确移除。本文以实际打开的当前英文正文为准；不从旧摘要推断当前状态。[Current view modes](https://code.claude.com/docs/en/desktop#switch-view-modes)。
- **Antigravity surface 命名发生变化。** 本次当前资料区分 App / CLI / IDE，因此没有把旧 Agent Manager 截图与当前 task group / Artifact 文档拼成一个统一界面。
- **T3 官网「每个 thread 都有自己的 branch」不能替代全部代码路径核验。** 本文不将这个营销概述当作 worktree 隔离的完整保证，只使用用户文档与锁定组件源码能支持的事实。
- **OpenAI 原 Codex app features URL 已重定向至统一 Features 页面。** 本文引用最终官方地址的 Code review 及原始第一方 Codex 工作流文章；不据重定向后混合的 ChatGPT / Codex 导航泛推所有 Codex 界面能力。[Final documentation](https://learn.chatgpt.com/docs/code-review#review-local-changes)。

## 6. 未解问题

- Space 的第一默认场景应优先突出 Coder 长任务、Partner 产物，还是两者等权？这决定默认右侧工作面及任务列表信息。
- 右侧现在是 Task Dock、Inspector、review、Artifact 等多种职责的入口；哪些属于「当前选中对象」，哪些值得占据持久 tab，需要基于实际用户工作流决定。
- Space 已有 half / max / focus 等扩宽与聚焦能力；在 1280×800 等小窗口中，应怎样选择默认规则、何时收起导航或 Inspector、何时把 review 切为主视图？这里要决定现有能力的使用规则，不是再造一套控制。竞品资料不能替 Space 作答。[RightSidebarFrame 宽度控制](../../apps/desktop/renderer/src/shell/RightSidebarFrame.tsx#L5)、[Shell max 聚焦](../../apps/desktop/renderer/src/shell/Shell.tsx#L1392)。
- 如何在「视觉很克制」和「一眼知道 Agent 在做什么」之间取得平衡，需要运行中、等待输入、失败恢复、长工具输出等状态的并列原型。
- Space 的品牌强调色应继续琥珀、改为其他主色，还是提供克制的少量主题？应以三种同等真实内容的视觉方向比较后决定，不由单张首页截图决定。
- 动画应保留哪些、取消哪些、在 reduced motion 下如何变化，需要检查 Space 的实际渲染成本与长时间使用感受。
