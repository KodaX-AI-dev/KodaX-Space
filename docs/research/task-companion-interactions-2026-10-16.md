# 宠物如何成为不打断主任务的任务伴侣？

TL;DR：建议把宠物设计为「状态入口 + 旁路解释 + 多项目摘要」的同一个角色；主任务继续执行，旁聊默认不回灌、不执行操作，主动汇报按有价值的事件触发。Claude Code 与 Codex 已有主旁路分离的官方先例，但没有证据支持机械地每几轮弹一次消息。后一句以及具体产品方案均为本产品建议，依据见下文。

访问日期：2026-10-16。本文只引用第一方文档和标准；记录实际获取到的内容，不推测将来版本。范围仅为调研与设计建议，不代表 KodaX Space 已经实现这些能力。

## 已核实的交互事实

### Claude Code：/btw 的上下文、权限和生命周期

- **上下文**：终端 `/btw` 使用主会话已有的用户消息、模型回复与工具结果；可在主回合运行中独立提问，不打断主回合，但看不到主模型尚在写出的回复。旁路问题与答案不进入主会话历史。[官方 Interactive mode：Side questions with /btw](https://code.claude.com/docs/en/interactive-mode#side-questions-with-btw)，访问页正文第 730–739 行。
- **权限**：终端旁路不能读文件、跑命令或搜索，只能基于现有上下文回答；需要新调查时，官方提供把问答分叉为有工具权限的后台 subagent 的路径。[同一节](https://code.claude.com/docs/en/interactive-mode#side-questions-with-btw)，第 739–752 行。
- **持久化**：终端回放最近 20 组旁路问答，历史只在内存，退出即清除；VS Code 面板的保存行为不同，不能把终端生命周期套到全部客户端。[同一节](https://code.claude.com/docs/en/interactive-mode#side-questions-with-btw)，第 736–742 行。
- **桌面端**：可用 `/btw` 或 macOS `Cmd+;` / Windows `Ctrl+;` 打开 side chat，读取当时的主线程上下文，内容不回到主对话；支持本地、SSH、WSL。桌面 side chat 不落盘，关闭应用后无法找回。[官方 Desktop：Ask a side question without derailing the session](https://code.claude.com/docs/en/desktop#ask-a-side-question-without-derailing-the-session)，第 528–530 行。

**本产品建议**：借鉴「主任务执行、旁路帮助理解」和「明确数据边界」；不要因为产品外观像桌面聊天，就假设各家旁路都有同样的工具权限、持久化和追问能力。KodaX 可选择保存旁聊，但必须自己定义该行为，不能称其为对 `/btw` 生命周期的原样复刻。

### Codex：确有旁路，不等于普通新聊天

- **CLI**：`/side`（命令表亦列 `/btw`）是从当前聊天建立的临时旁聊。旁路 transcript 与父聊天分离，TUI 继续展示父聊天状态；旁聊中不能再建旁聊，review mode 不可用。[官方 Developer commands：Start a side chat with /side](https://learn.chatgpt.com/docs/developer-commands#start-a-side-chat-with-side)，第 3902–3911 行及 CLI slash commands 表。
- **桌面端**：同一官方页的桌面可用 slash commands 表列出 `/side`，说明其开启临时 side chat，不打断主聊天。因此「桌面有不打断主任务的旁聊入口」有第一方依据。[官方 Developer commands：Available slash commands](https://learn.chatgpt.com/docs/developer-commands#available-slash-commands)，访问页第 3993–4031 行。
- **证据边界**：上述文档没有完整规定桌面 side chat 的具体面板尺寸与位置、工具权限、对后续父消息的实时同步方式、磁盘保存和过期规则；这些仍未证实，见下节。[同页旁聊说明](https://learn.chatgpt.com/docs/developer-commands#start-a-side-chat-with-side)。

**本产品建议**：借鉴主旁路分离与持续显示主任务状态；将 KodaX 的旁聊称为任务解释/伴侣旁聊，不把「重新发起一个执行 Agent」隐含在宠物点击动作里。

### 本地产品与 SDK：已有候选原语，尚未等同于 /btw

- Space 能力账本将 `quickAsk.tempSession` 标为 supported：当前 Quick Ask 使用 plan-mode 临时会话、局部捕获事件、关闭时清理，并能把已持久化会话晋升到 Coder。`quickAsk.sideQuery` 则为 partial，明确尚待匹配晋升/历史语义才迁移。来源：`apps/desktop/electron/ipc/version.ts:133–145`。
- 当前安装 SDK 的 embedder guide 说明公开导出 `@kodax-ai/kodax/llm` 的 `sideQuery` 是隔离、只输出文本的 one-shot，而非向 chat session 追加消息。来源：`node_modules/@kodax-ai/kodax/public_docs/sdk/embedder-guide.md:2773–2777`；本地依赖内容是本次检查快照，不是不可变上游版本链接。
- 对应类型声明规定 `tools=[]`、无工具循环、独立超时与成本来源；超时/取消/错误通过 `stopReason` 返回，需要调用方自行降级。请求结构允许显式传入 system、messages、timeout、abortSignal、querySource。来源：`node_modules/@kodax-ai/kodax/dist/types-chunks/side-query.d-DTrhVd_r.d.ts:6–38`。这是声明契约核验，本次未执行该 API 验证运行时。

**本产品建议**：保留现有 Quick Ask 晋升和历史语义；任务伴侣通过显式任务快照调用独立 `sideQuery` 作为候选实现路径，多轮历史由应用层管理。不要把当前 Quick Ask 当作已经存在的只读 `/btw`，也不要让伴侣摘要替代主 SDK 的权威执行结果。方案需要后续接口与运行时验证，本次未实现。

## 三类官方人机交互依据

### 1. 主动打扰必须看任务与注意力

Microsoft HAX Guideline 3 要求根据用户当前任务和环境决定何时行动或打断；对于主动 AI，当前注意力会影响恰当时机，并提醒评估上下文采集的隐私代价、配合全局控制。[HAX：Time services based on context](https://www.microsoft.com/en-us/haxtoolkit/guideline/time-services-based-on-context/)，Guideline 3 正文，第 78–81 行。

**本产品建议**：采用完成里程碑、出现阻塞、需要决策、失败恢复、用户返回工作区等事件；把「累计几轮」最多作为合并更新的内部信号。普通进展在输入/读代码时延后；审批、失败等高价值状态按严重性提示。不要为判断注意力引入摄像头或跨应用监控；已有的前后台、输入焦点与工作区可见性足够作为首版信号。这些触发方式与技术范围是本产品选择，非 HAX 规定。

### 2. 不确定时缩小能力，自动化必须可退出

Microsoft HAX Guideline 10 建议在用户意图不清时澄清或降级服务，以免采取错误行动。[HAX：Scope services when in doubt](https://www.microsoft.com/en-us/haxtoolkit/guideline/scope-services-when-in-doubt/)，Guideline 10 正文，第 78–85 行。

Google PAIR 建议平衡自动化与用户控制，允许调整、关闭和恢复常规操作；请求注意力应克制、便于关闭，并尊重用户选择。[PAIR：Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/)，章节「Balance control & automation」「Allow for opting out」，第 221–256 行。

**本产品建议**：伴侣区分已确认、执行中、推测、未知；没有新事件就不生成「仍在努力」类内容，不伪造完成百分比或剩余时间。宠物关闭与主动摘要静音分别控制，关闭形象不应隐藏错误和审批。询问「为什么卡住」若缺证据，应明确当前只有运行状态，并提供跳转真实日志/主任务的入口。

### 3. 状态更新可以被感知，而不抢走焦点

WCAG 4.1.3 说明状态消息应可由辅助技术识别、无需接收焦点；目的之一是让用户知道变化而不多余打断。成功、等待、过程进展和错误属于可能的状态消息；普通状态可用 `role=status`，顺序进度日志可用 `role=log`，不重要且不紧急的内容不应滥用 assertive live regions。[W3C：Understanding Status Messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html#intent)，「Intent」「Sufficient Techniques」「Failures」，访问页第 31–51、107–144 行。该页为理解性说明；其对应的成功准则为 WCAG 4.1.3。

**本产品建议**：宠物动作必须有文字等价状态，键盘可打开伴侣面板；普通摘要更新单个礼貌播报区域，不抢焦点，不让每一条 token 或宠物帧触发读屏。完成的小动作不是唯一反馈；长文本保留在可回看的摘要列表。

## 对 KodaX Space 的设计启发（全部为本产品建议）

| 决策       | 建议                                                                                    | 依据与不可照搬点                                                                             |
| ---------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 角色职责   | 一个伴侣形象承担状态呈现、解释与摘要入口；执行仍由原主任务负责                          | Claude `/btw` 与 Codex `/side` 证明主旁路分离有先例；不能据此宣称旁聊天然安全或免成本        |
| 常驻位置   | 优先放在当前任务标题/状态附近或右侧工具栏的固定锚点；输入框边缘保留为可选择的陪伴表现   | 位置是待验证的产品判断，官方来源没有证明宠物最优位置；避免随内容滚动、遮挡输入和多只同时出现 |
| 打开层级   | 小状态入口 → 可关闭的短摘要 → 用户主动固定的伴侣面板                                    | 根据 HAX 时机原则、PAIR 注意力克制和 W3C 非抢焦点状态反馈推导，非现成行业标准                |
| 旁路提问   | 默认只读当前任务已有信息，持续多轮追问；显示项目、任务、数据截至时间                    | 借鉴 Claude 上下文边界和 Codex transcript 分离；持续多轮与本地保存是 KodaX 自己定义的能力    |
| 回到主任务 | 「发送到主任务」展示将发送的文字、任务对象和排队/立即转向语义；只有用户执行此动作才回灌 | 主旁路隔离可降低不经意转向；具体动作与授权必须匹配 KodaX 已有消息处理机制                    |
| 主动汇报   | 主 Agent 已有进度先去重合并，结构化事件先用模板；仅必要时生成短摘要                     | HAX 支持按上下文择时，不支持某个固定轮次/秒数最佳；避免为复述进度再开常驻有工具 Agent        |
| 多项目     | 全局只聚合项目名、任务状态、待办数；摘要和旁聊按项目/任务隔离，点击切换到对应原任务     | 是 KodaX 的范围设计；旁路先例不证明跨项目读取已获授权，当前项目切换不能让旧摘要冒充新任务    |
| 错误与未知 | 「测试正在运行，尚未收到结果」优于「快完成了」；离线/恢复后标明最后更新时间             | 基于 HAX 不确定时降级；状态与内容都应有可核对的事件来源                                      |
| 节流       | 同任务短时更新合并；窗口后台只累计；回来展示一条摘要；需要决策和失败优先                | 具体延迟、冷却间隔、最长静默时间需要产品验证；不是文献给出的通用常数                         |
| 关闭行为   | 关闭宠物不关闭原任务、工具、告警与正常状态；允许只关主动摘要                            | PAIR 的退出与常规路径原则；保留原产品功能是本次设计约束                                      |

### 建议的摘要语法

以下文案仅为本产品示例，不是调研发现或真实任务状态：

> KodaX Space · 工作区改版
> 已完成：工作区与设置视觉统一。
> 正在做：检查语言与宠物状态的回归。
> 需要你：暂无。最近更新 14:32。
> 查看依据 · 问一句 · 打开任务

建议摘要同时保存其引用的 run/turn/event 截止点。用户旁聊时读到的是该截止点的事实快照；可以请求刷新，但不把模型补写的推断升级为已完成事实。另一项目的更新永远带项目和任务标签。

## 未证实

- Codex 桌面旁聊与 CLI 的工具权限、精确持久化/过期策略是否完全一致；官方已证实 `/side` 和不打断主任务，但本次获取的页面没有给出这些细节。
- Claude Code Desktop side chat 是否与终端 `/btw` 使用完全相同的工具限制与旁聊历史窗口；官方 Desktop 页没有作出这个完整保证，因此不可直接迁移终端结论。
- 某个固定轮数、固定 30/60 秒间隔、宠物位置或某种特定动作能显著提高生产率/信任；本次来源没有这样的实证结论。
- 宠物人格本身能改善任务可靠性；本次资料支持透明状态、适时提示、可控旁路等机制，不证明拟人化形象本身带来该收益。

## 未解问题

1. 用户更希望伴侣是「当前任务的讲解员」还是「全局项目管家」？建议先落地当前任务旁路，再提供只含状态元数据的全局摘要。
2. 旁聊是随任务保存还是临时？建议可回看，但明确本地保存范围、删除跟随原任务；不得用临时二字描述持久化数据。
3. 首版是否只用模板生成主动摘要，何时才值得付费调用模型？需要结合现有运行事件质量与实际成本量测。
4. 正常 Agent 进度与伴侣摘要如何去重，哪些事件才值得主动提示？应以短时工作流验证与真实任务回放评估。
5. 当前工具面板已占用右侧时，伴侣应替换面板、分栏还是小浮层？需用完整多项目工作区原型验证，不应只看孤立宠物演示。
6. 用户关闭宠物后是否仍需旁聊文本入口？建议保留；这是能力与形象分离的产品选择，待与用户对齐。

## 关键来源索引

1. [Claude Code Interactive mode — Side questions with /btw](https://code.claude.com/docs/en/interactive-mode#side-questions-with-btw)
2. [Claude Code Desktop — Ask a side question without derailing the session](https://code.claude.com/docs/en/desktop#ask-a-side-question-without-derailing-the-session)
3. [OpenAI / ChatGPT Learn — Developer commands](https://learn.chatgpt.com/docs/developer-commands#start-a-side-chat-with-side)
4. [Microsoft HAX — Time services based on context](https://www.microsoft.com/en-us/haxtoolkit/guideline/time-services-based-on-context/)
5. [Microsoft HAX — Scope services when in doubt](https://www.microsoft.com/en-us/haxtoolkit/guideline/scope-services-when-in-doubt/)
6. [Google PAIR — Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/)
7. [W3C — Understanding SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html#intent)
