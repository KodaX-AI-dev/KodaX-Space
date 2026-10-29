# KodaX alpha.11 全量增量接入复核

2026-10-30。范围：已安装 Registry `@kodax-ai/kodax@0.7.97-alpha.11` 相对 alpha.10 的完整 CHANGELOG、随包 SDK_MIGRATION / CLIENT_CONTRACT / SPACE_SDK_SEAMS / embedder-guide，以及 Space 的实际消费链和上一轮 Windows 安装包 `out/sdk-alpha11`。不是要求为 SDK 的每个底层 API 新增桌面入口。

**结论：不能判定全部匹配完成。** 上一轮六条接入及 28 项打包测试通过，只证明那些测试覆盖的边界。新增复核发现首条输入前无法选工作模式、命令目录与执行不一致、Partner 未采用 SDK Agent preset、用户文档缺失。原报告的“0 remaining findings”保留为当时评审记录，不能当成本次完整覆盖结论。

本次为核查：没有修改产品运行代码或重打包；探针在隔离用户目录、隔离 Windows desktop 和本地模拟 Provider 上执行。以下“待改”没有被旧安装包修复。

## 新增实测证据

最终探针：`artifacts/diagnostics/sdk-alpha11-audit/modes.spec.ts`；配置同目录 `playwright.config.ts`。使用上一轮产出的真实 Windows 包与独立 Coder daemon，Provider 不访问付费模型。

`modes-verified.log`：1 项综合探针通过（15.0 秒）。这个通过表示下列观察被成功验证，**不表示已知缺口已修复**。

| 实际执行面 | 模型收到的工具数 | repo_overview | script_exec | bash |
| --- | ---: | --- | --- | --- |
| Coder / Coding | 74 | 有 | 无 | 有 |
| Coder / Agent | 56 | 无 | 无 | 有 |
| Coder / Script | 45 | 无 | 有 | 有 |
| Partner 定制 profile | 53 | 有 | 无 | 无 |

工具数量仅描述本夹具，不能成为生产固定值。Coder Agent 比 Coding 少 18 个编程专用工具；Script 调用 `tools.read({path:'README.md'})`，模拟 Provider 的下一轮收到包含实际文件内容和 leaf receipt 的结果，Product view 保留 `script_exec` 工具项。证明模式切换影响真实执行，补上了旧测试只切换再切回 Coding 的缺口；尚未证明 Script 的拒绝、Stop、部分副作用和恢复全链路。

证据目录：`artifacts/diagnostics/sdk-alpha11-audit/packaged-verified/modes-audit-actual-published-mode-menus-and-Script-execution/`，包含实际 Provider 菜单、Script Product view、命令目录/执行回执和三张界面截图。

## Standards

独立规范评审：1 项未解决。`CONTRIBUTING.md:48–51` 要求用户可见变化同步 `docs/USER_MANUAL.zh-CN.md` 和 `apps/desktop/electron/kodax/space-manual-topics.ts`。两处尚未解释 Agent/Coding/实验性 Script、Coding 默认、Host 空闲/CAS/升级边界及完整原文读取失败语义。用户手册仍泛称 Agent Mode，无法解释它与 AMA、权限模式的区别。

## Spec

当前需求是完整核实新能力，包括模式选择和 Partner 使用 Agent；随包契约要求工作模式由 Host Session 设置管理、不能由本地 config 冒充。

1. **首条消息前无法选择 Agent/Script（Space 待改）。** `AgentModeSelector.tsx:27,89` 无 session 时不读取状态且禁用控件。`BottomBar.tsx:733` 的创建发生在发送等后续动作中。安装包空会话截图确认 disabled。应利用已有 Host draft Session 建立选择，再通过 Host 设置接口保存并回读；必须防止创建/切换与发送、换项目、换会话竞态，不能仅保存一个本地 mode 后假装 Host 已切换。
2. **`/work-mode` 被展示却不能执行（Space 待改）。** 安装包 `slash.discover` 返回该命令及 `[agent|coding|script]` 参数说明；合法 `slash.exec` 调用返回 `unknown command: /work-mode`。`electron/ipc/slash.ts:62–70` 只将 prompt command 送入 SDK，Space builtin 未承接控制命令。应使用与选择器相同的 Host 读写和准入边界接通此命令，或明确不广告无法执行的命令；不能把它发送给模型当普通任务。
3. **Partner 未采用 SDK Agent preset（组合契约待明确）。** `real-session.ts:2562–2568` 提供自定义 `agentProfile` 与 `toolVisibilityPolicy`。SDK `work-mode.ts:9–10` 对这类调用保留旧 profile 路径；安装包包含相同逻辑。原文：“原 SDK 显式 profile、专用角色与工具权限不被产品预设覆盖”。因此仅添加 `workMode:'agent'` 不生效。实际菜单证明 Partner 仍有 `repo_overview` 等，而 SDK Agent 没有。不能删除 Partner profile 或策略强行切换：会丢专家身份/验证及连接器约束，SDK Agent 本身仍有 bash/write/edit 和子代理能力。要满足用户提出的 Partner 使用 Agent，需要 SDK 明确支持模式筛选与受限 profile 的组合，再由 Space 接入；当前隐藏切换器不能视为已启用 Agent。

规范轴：1 项未解决；需求轴：3 项未闭环，其中 Partner 属于当前契约组合限制，不能误报为 SDK 违反既有兼容承诺。下表的验证缺口另列，不冒充已复现代码缺陷。

## 完整增量核对表

| alpha.11 能力/改动 | Space 当前接入 | 验证与剩余边界 |
| --- | --- | --- |
| Agent/Coding/Script Session 设置 | Host 能力键、CAS、空闲准入、设置投影、下拉框已接入；模型/权限/AMA 独立 | 原包测持久化、冲突、活动 Run 拒绝；本次证明实际工具菜单不同。首条前选择和命令入口待改 |
| Partner 与自定义 profile | 仍是受限的 Partner 独立 profile，未使用 SDK Agent preset | 本次实际请求菜单与源码交叉确认；需上述组合契约 |
| Script 执行与 receipts | Coder 走既有 managed Host，通用工具卡可呈现 script_exec | 本次真实 VM + read leaf + receipt + Product view 通过；权限拒绝、Stop、部分副作用/重启恢复尚无 Space 专项验收 |
| Thinking / 工具参数 token 估算 | IPC 与活动 UI 消费 Host estimatedTokenCount；无估算仅状态，移除本地字符换算 | 原包流式实测通过；Provider usage 与 UTF-16 偏移保持原义 |
| 工具完整原文 | 工具具体 item ID，live/history 对应 readItem/readHistoryEntry，part original；Renderer 不打开 outputPath | 原包验证双路径分页、显示、缺失文件错误。夹具预先保存文件，未覆盖真实 MCP 生成大结果→Host 保存→Host 重启→Space 读取 |
| MCP 原文存储、共享输出保留、长 JSON 预览 | 由新版 SDK 执行，Space 未增加本地清理/裁剪替代 | 没有静态消费缺陷；上述真实生成及 Host 重启链仍需补测，Renderer reload 不能替代 Host restart |
| 结构化 taskResult 与恢复 | IPC 保留 source/可选 taskId/runId/title/status/artifactRefs；中性折叠 Markdown，未知保持未知 | 原包 failed/unknown/无 ID/独立同文本通知/字面内容通过；多报告顺序、超长报告全文尚缺专项 UI 测试 |
| 独立 transcript taskResults 数组 | 兼容无 ID/未知状态，不伪造 taskId 或跨消息正文去重 | 单测与静态消费核对；不能把子任务失败当根 Run Provider 错误 |
| 问题等待、non_interactive | Host 独占 deadline，保留 skipped/non_interactive，不提交本地 timeout/default；权限独立 | 原包等待/Skip 通过，类型/转换测试通过；没有新增同类缺口 |
| Skill 单命令 Bash 策略 | 执行交 SDK；主进程和 daemon builtin 路径注册及可信重载保留 | 原包 draft-response 实际执行通过；SDK 负责解析命令，不在 Space 复制规则 |
| Skill 仓库根发现、重载缓存、模型加载生命周期/偏好 | 使用 SDK catalog/loader，模型策略与显式调用均沿 SDK 执行边界 | 静态接缝正确；模型自动加载→action policy→hook→model preference 的组合尚无 Space 完整专项实测，不能用显式斜杠技能测试代替 |
| Ark/MiMo/MiniMax 目录与推理/容量 | 动态读取 SDK provider-capabilities，模型解析走 SDK；MiniMax 默认/兜底已更新 M3.1-Flash，历史 M3 保留 | 目录/兼容单测通过；不代表这些云 Provider 的真实模型质量或服务端可用性均已实测 |
| 启动恢复、Windows stale-process、历史游标、sandbox 能力探测 | 继续统一 Client/Host，Space 不重复做 SDK 恢复；历史双向翻页消费公开边界 | 原包启动/退出/分页/冷恢复回归通过。Issue 371 首次读取延迟未关闭，ready 不代表历史已加载 |
| SDK 构建/CI/归档验证及 PowerShell 测试环境修复 | SDK 内部发布工程；Space 使用物理安装的 Registry 包 | 无需新增 UI 或复制 SDK CI；已有包内 SDK 字节/worker/native smoke。不能由此推断 Linux 已验收 |

四份接入文档中延续的启动阶段、退出 recovery、真实 lastMessageAt、Product 授权、队列/Stop、Workflow/Memory/附件/产物等属于此前已接入契约。本轮结合既有代码及原包 28 项回归记录核对，未发现因 alpha.11 必须新增第二个 Runtime 或 Session 写入者的理由。未对所有云模型、全部 Skill 组合或全部系统进行穷举验收。

## 需 SDK 协作的 Partner 需求

Space 希望 Partner 使用新版 Agent 工作模式，同时保留现有自定义 agentProfile、专家验证、toolVisibilityPolicy、连接器及 Host 授权限制。目前 alpha.11 的 resolveWorkMode 遇到任一显式 profile/工具策略即走兼容 coding 路径，单传 workMode:'agent' 不会应用 Agent 的编程专用工具筛选；安装包实际 Provider 菜单也证实 Partner 仍暴露 repo_overview 等条目。请提供受支持的显式组合方式，保持旧 profile 调用兼容，使 Agent 工作面与 Partner 原有能力上限取交集，且有效模式能够被可靠确认；不能通过丢弃 profile/策略或扩大权限解决。验收应同时验证模型 schema、工具发现和实际调用：编程专用工具按 Agent 规则隐藏且不可通过桥接恢复，Partner 原本禁止的 bash/write/edit/子代理不因切换开放，允许的 Skill、研究、连接器、Artifact 和专家验证仍工作；普通 Coder 的 Coding/Agent/Script 及专用子 Agent 兼容行为不退化。

Linux Node 缺失指引仍按原 integration 文档交接；Kylin 实机、Space Issue 225 客户证据、SDK Issue 371 和上述专项验收继续保留，不能计为本次已闭环。
