# KodaX 工作树是否补齐 Space 的 Product Client / Host 接缝？

> 后续复核：本文保留第一次工作树修复的历史结论。新增 lifecycle、独立 Actor 授权与 execution facts 后曾确认 7 项缺陷，目前均通过独立正向复验，见[最新七项修复审计](kodax-space-sdk-seven-fixes-audit.md)。旧“没有完整退出 API”及旧反例描述不能用于判断当前工作树；npm 安装包与工作树修复仍须区分。

结论：独立 Spec 轴未发现可证实的、由本次 diff 引入的需求遗漏、越界行为或实现错误（0 项）；可信执行授权和 canonical Fork/Retry/Rewind 的缺口已有真实源码路径承接。完整退出事务、任意结构化附件与跨重启计费账本仍是明确保留的限制，不能把当前工作树等同于 Space 已完成迁移或 npm 已发布。依据：下文逐项源码追踪；规范来源为 `K:docs/SPACE_SDK_SEAMS.md:7-69`。

## 审计身份与方法

- 日期：2026-10-09；KodaX 根目录 `C:/Works/GitProj/KodaX-AI/KodaX`，本文以 `K:` 表示该目录。
- 固定点及审计时 HEAD：`ba30095a6a2da143a43776402813f24734d8c53a`；无新 commit。检查命令为 `git diff HEAD`，额外纳入未跟踪的 `docs/SPACE_SDK_SEAMS.md`、`src/client-host-authorization.ts`、`src/product-execution-authorization.ts`、`src/sdk-client.host-authorization.test.ts`。
- 工作树文件清单 SHA-256：`452928fbc67bfa8dffaae353886aa2f13634d504bc687200c12c43776a0ac10d`。算法：下方 28 个文件按路径排序，每行 `<原始文件字节 SHA-256>  <仓库相对路径>`，UTF-8、LF、末尾 LF；对完整清单再取 SHA-256。该值是审计快照身份，不是 Git tree object。
- 父代理另用 `git diff HEAD` 二进制 patch 加四个未跟踪接缝文件计算内容身份 `4a3444f3ffb035b8a2a4d2bb7c989345155dd83b00e802272bf2e7fc088e1f89`，并在 [本轮运行证据](kodax-space-sdk-seams-working-tree-evidence.json) 中保存；算法不同，因此不应与上述清单 hash 比较相等。
- **所有 `K:文件:行` 引用均绑定上述固定点与工作树快照。** 清单内文件按所列 SHA-256 定位；未修改的依赖源码按固定点定位。源码引用中的行范围方便人工核对，并非只引用文档自述。
- 来源要求按顺序核对：固定点 commit message 是 Windows supervisor 修复，没有接缝需求引用；使用用户本轮明确提供的 `K:docs/SPACE_SDK_SEAMS.md` 作为来源规范，同时核对用户给出的原始三类请求（可信授权、canonical 操作边界、宿主配置/附件/统计/退出范围）。本审计不依赖其他评审代理的结论。
- 只读 KodaX；没有修改 SDK，没有调用真实模型，没有复跑整套测试。本文只报告 diff 引入且有可信证据的问题；既有代码仅用于追踪新行为。源码测试断言作为覆盖意图证据，不冒充本代理的运行结果。
- 读取 `K:AGENTS.md` 和 Space `AGENTS.md`；使用 code-review 的独立 Spec 轴与 research 的 primary-source 引用要求。本文不替代 Standards 轴。

## 已补齐的接缝

### 1. Main 授权回调确实进入公开连接路径

规范原文：“回调使用同一连接的 `services.credentials` 与 `services.hostTools` 注册现有 lease”，“SDK 丢弃产品 payload 中的授权字段，再附加 Main 返回的 binding”，“返回 `undefined` 明确选择原有无 binding 路径”。`connectKodaXClient`/`ensureKodaXClient` 公共 options 增加 `authorizeExecution`，只把回调交给本地 adapter；adapter 克隆业务输入，剔除授权/凭据/origin/trustedRunId 字段，调用回调，然后附加回调结果。`undefined` 无 binding，抛错直接拒绝。**这是一条真实执行路径，授权字段不再是只能写类型的空接缝。** 来源：`K:docs/SPACE_SDK_SEAMS.md:7-9`；`K:src/sdk-client.ts:18-50`；`K:src/client-runtime-adapter.ts:14-31`；公共独立类型 `K:src/client-host-authorization.ts:165-182`。

配置回调时连接要求 `productExecutionAuthorization:1`；所有 Product 连接同时要求 `productHistoryBoundaries:1`。Host 只根据 owner 实际能力发布两项新能力，Runtime 的版本化能力检查会拒绝不匹配的 Host，不会只接收 binding 后继续无授权执行。来源：`K:src/sdk-client.ts:30-49`；`K:src/sdk-runtime.ts:4080-4082,5507-5513`；`K:src/runtime-daemon/server.ts:2497-2552`；规范 `K:docs/SPACE_SDK_SEAMS.md:7,50`。

### 2. wire/schema/Host 实际绑定和 Session 配置保留

规范原文：“实际创建的 Run；可信准备、hooks、模型与工具执行共享该 Run 的授权，保留该 Session 的 MCP/extension 配置”。七类业务 intent 的 adapter 入口均调用授权：input、command、review、agents_lean、tool、workflow、compaction。wire schema 为执行入口增加 non-secret binding。Host 在 dispatch 外建立 `ProductExecutionContext`，身份包含 principal、Session、credential lease/Provider 集、Host Tool lease；实际 `startRun` 创建 Run ID 后才调用 `bindRun`，再次校验 Session，一并绑定 scoped access 与 Host Tool runtime。来源：`K:docs/SPACE_SDK_SEAMS.md:9,34-40`；`K:src/client-runtime-adapter.ts:28-31,92-95,148-156,202,248`；`K:src/runtime-daemon/schema.ts:296,444,651-663,1398-1405`；`K:src/product-execution-authorization.ts:5-19`；`K:src/runtime-daemon/server.ts:2314-2334`；`K:src/sdk-runtime.ts:11256-11264`。

绑定 Host Tool 时，Host 用传入的 Session extension runtime 与 Host Tool runtime 合并；普通启动也以 Session extension runtime 为默认。可信 command 的 `commandInvocation` 在这次重新绑定中不会被删掉，所以其 allowedTools/hooks/runtimePolicy 留给已有执行策略。低层不可信 transport 的同字段仍被剔除。来源：`K:src/runtime-daemon/server.ts:2384-2403,2430-2435`；`K:src/sdk-runtime.ts:11306-11310,12097-12105`；已有策略实际执行 `K:packages/coding/src/skill-invocation-policy.ts:318-328,355-369,406-424`。

### 3. 排队授权隔离、steer 和 redirect

规范原文：“接收时保存非秘密授权上下文，实际消费时绑定 Run；不同授权不合批，也不注入另一授权的活动 Run”。queue fact 捕获 `ProductExecutionContext`，intent digest 包含授权 key；批次在 Skill 或授权 key 变化处分割。活动 Run 消费队列时必须 key 相同；后续独立 drain 用首条记录捕获的 context 包裹 `startRun`。提交/撤回后删除 fact 的 context。**不同授权的输入有明确隔离条件，后续 drain 不依赖另一个 Run 的 AsyncLocalStorage 偶然值。** 来源：`K:docs/SPACE_SDK_SEAMS.md:35`；`K:src/session-input-queue.ts:18-27,57-77,145-151,160-181,193-196`；`K:src/sdk-runtime.ts:10606-10612,11660-11692`。

规范原文：“steer：目标 Run 原有授权；不同授权返回 conflict”，“redirect：旧 Run 保持原授权，新排队意图带自身授权”。新增 steer 检查在写入 interrupt 之前比较 context key 和目标 Run key；已绑定的低层 Run 使用独立 `runtime-bound:<runId>`，不会接受无 binding 的 Product steer。redirect 先把当前 intent 连同 context 排入队列，再停止旧 Run；不替换旧 record 的 credential scope。来源：`K:docs/SPACE_SDK_SEAMS.md:36-37`；`K:src/sdk-runtime.ts:11471-11473,11826-11832,11870-11879`；queue capture `K:src/session-input-queue.ts:74-77`。

### 4. Provider、purpose 与派生 scope 保持既有检查

规范原文：“每次实际请求重新检查 Provider 与 purpose”，“Workflow 子 Agent 的普通模型请求仍可为 primary，目标为带 parentRunId 的 actor_turn”。Host 要求 scoped v2 lease、非空且唯一 Provider allowlist，并禁止扩展注册 allowlist。绑定的 access 按实际 Provider/purpose/attribution 调用既有反向桥；Run 预检也核对 primary Provider。新增 Product binding 的作用是进入既有 resolver，并未把秘密写入业务输入。来源：`K:docs/SPACE_SDK_SEAMS.md:30,38-42`；`K:src/runtime-daemon/server.ts:3164-3207,3211-3238`；`K:src/sdk-runtime.ts:11358-11368,10734-10744,10824-10836`；公开 broker request shape `K:src/client-host-authorization.ts:31-73`。

Workflow 明确 Session 的要求在 Host 接收 binding 时落实（外层 `requireStringField(params, 'sessionId')`），最后沿普通 `startRun` 绑定实际执行 Run。review 的 workflow 分支也使用同一 dispatch context 和 admitted start。手动 compaction 的 Product adapter 仅传 credential，Host 发出 `operation: session.compact` 的短期 operationId，再用 scoped access 执行；Host Tool lease 不参与该操作。来源：`K:docs/SPACE_SDK_SEAMS.md:38-39`；`K:src/runtime-daemon/server.ts:2316-2318,2168-2198,1740-1780`；`K:src/sdk-runtime.ts:4473-4497,5185-5193`；`K:src/client-runtime-adapter.ts:92-95`。

### 5. child 工具上限覆盖 Host Tool definitions

规范原文：“Host Tool lease 不绕过这些限制”。新增 `childToolDefinitions` 合并注册工具和 Run scoped 工具；Actor capability 上限、specialist complement、只读子任务、digest 与 structured-output repair 的 excludeTools 都使用或纳入这组定义。反向桥把 Host Tool `sideEffect: none` 映为 `readonly`，其他两类保守映为 `mutates-state`；新增只读过滤因此与实际 bridge definitions 语义一致。该改动直接承接新 Host Tool 接缝，没有证据表明是无需求的 scope creep。来源：`K:docs/SPACE_SDK_SEAMS.md:66,79`；`K:packages/coding/src/child-executor.ts:440-477,941,1099,1154-1169,1312-1328,1625-1631`；已有映射 `K:src/runtime-daemon/reverse-bridge.ts:1061-1086`。

### 6. canonical 边界与历史质量已公开

规范原文：“readHistory 返回……sourceRevision、status……issues”，“同一消息的显示块共享该边界”，“记录原样回传，不能从显示 item ID……推导”。Product `ClientHistoryPage` 新增三项元数据；projection 直接转发 Runtime page 的元数据，并把 `entry.boundaryId` 与 `page.sourceRevision` 组成各显示块的 boundary。Fork/Rewind adapter 原样传给 Runtime；Rewind 公共类型不再只有 selector。来源：`K:docs/SPACE_SDK_SEAMS.md:48,54-56`；`K:packages/coding/src/client-contract.ts:151,373-403,448-457,575-584`；`K:src/client-history.ts:55-72`；`K:src/client-runtime-adapter.ts:81-89`。

这些边界来自已有 canonical conversation source，而不是 display ID：下层 conversation group 明确用 `group.source.id`；Runtime page 从 descriptor 转发 boundaryId 和 sourceRevision。Host storage 重新捕获完整 source snapshot 并核对 sourceRevision，要求目标父链完整；stale 映射为 `resync_required`，Rewind 在修改前核对 expectedHead。来源：`K:packages/repl/src/session/conversation-history.ts:1270-1277`；`K:src/sdk-runtime.ts:20720-20738,8524-8563,8831-8857`；`K:packages/repl/src/interactive/storage.ts:656-670,5232-5258,5371-5397`。

### 7. Retry before 与图片引用

规范原文：“在查询前派生，再用新 inputId 提交原查询”，“Retry 包括第一条查询之前的空历史；before 需要 canonical boundary”。公共/Runtime 类型和 wire schema 传递 before，Runtime 拒绝无 boundary 的 before，storage 取目标父节点进行 canonical fork；无父节点时创建空 lineage。此实现没有把查询保留后再靠 UI 删除。来源：`K:docs/SPACE_SDK_SEAMS.md:55,58`；`K:packages/coding/src/client-contract.ts:449-456`；`K:src/runtime-daemon/schema.ts:1295-1307`；`K:src/sdk-runtime.ts:8524-8526,8544-8559`；`K:packages/repl/src/interactive/storage.ts:5400-5413`。

规范原文：“attachments 暴露 canonical 用户图片块/工具结果图片的 path、mediaType”。用户图片从 canonical owner message 提取，工具结果图片从匹配 tool_use_id 的 canonical result 提取；两处均保留 path 和可选 mediaType。没有构造字节内容或臆造 picker metadata。来源：`K:docs/SPACE_SDK_SEAMS.md:67`；`K:src/client-history.ts:56-59`；`K:src/client-canonical-tools.ts:39-50`；回归断言 `K:src/sdk-client.history-boundaries.test.ts:66-80`。

## 仍有限制，但本轮不是修复遗漏

1. **退出事务与 crash 续跑。** 用户明确指出新版没有旧完整退出事务的等价 API；接缝文档也直接写出 `settleKodaXRuntimeExit` 不再导出、Space 自身退出由 Space 管理，不自动重放队列/Provider/未知工具效果。本次 diff 没有声称重新实现这些能力，因此不把它当作本轮修复实现错误。公开 `host.shutdown` 路径仍委托既有 daemon shutdown，不能据此推导完整可恢复结算票据。用户披露这项限制不等于批准 Space 删除原功能；如果迁移目标仍要求完整功能等价，这项缺口继续保留。来源：`K:docs/SPACE_SDK_SEAMS.md:69`；`K:src/client-runtime-adapter.ts:32-37`；`K:src/runtime-daemon/server.ts:1023-1029`；本轮用户说明。
2. **queued 授权失效。** 尚未创建 Run 时，绑定失效的 queued intent 可以保留 queued；drain 的错误只由 Host diagnostic 报告。Space 必须处理 queued/no-run 情况，提供撤回/重新提交，而不能直接永久 await runId。该限制与保守失败设计一致，不把它误报成凭据 fallback 或跨 Run 借权。来源：`K:docs/SPACE_SDK_SEAMS.md:42`；`K:src/sdk-runtime.ts:9332-9347,11660-11692`；`K:src/session-input-queue.ts:185-199`。
3. **独立 Agent 操作。** Product `agents.spawn/followup` 未接入本轮 authorize callback；规范明确保留 `/runtime` 的 host-only credential options，不把单 Run Tool lease 扩为任意 Actor 授权。Space 是否使用这类独立 Actor 操作仍需消费者设计决定。来源：`K:docs/SPACE_SDK_SEAMS.md:44`；`K:src/client-runtime-adapter.ts:203-207`；`K:src/sdk-runtime.ts:1677-1691`。
4. **手册、Shell 与宿主策略。** 这轮明确了既有可信接入点，不是增加任意 Renderer prompt/config 通道。provider hook 的 replaceSystemPrompt 有真实 setter；Shell contract 位于 Runtime Session settings 并规范化；owner execPolicy/autoReview 不能由 attach client 覆盖。可信 Host 如何安装 Space 手册与共享 hook 策略仍归宿主集成。来源：`K:docs/SPACE_SDK_SEAMS.md:64-66`；`K:packages/coding/src/agent-runtime/provider-hook.ts:55-82`；`K:src/sdk-runtime.ts:1587,1610,4020-4027,21016,21288-21295`；Product settings 白名单 `K:src/client-settings.ts:3-19`。
5. **附件和统计范围。** 图片 references 不等于附件字节、原始 picker 来源或 Office/Artifact 对象；详细 usage 是最新活动字段，costReport 仍是 string。不能将这次 DTO 补齐外推为 file/video Provider 支持或完整跨重启 Session/Provider/Actor 账本。来源：`K:docs/SPACE_SDK_SEAMS.md:67-68`；`K:packages/coding/src/client-contract.ts:545-573,576-581`；`K:src/session-view.ts:592-604,460-474`；图片实际 projection 来源同上节。
6. **partial/ambiguous。** 公共质量字段帮助 Space 显示历史不完整，但不保证每条记录均可执行 Fork/Retry/Rewind；storage 完整父链校验会保守拒绝。UI 应直接转发 boundary，遇 resync/conflict 刷新后重新选，不推导替代范围。来源：`K:docs/SPACE_SDK_SEAMS.md:48,58`；`K:packages/repl/src/interactive/storage.ts:656-670,5388-5397`；`K:src/client-runtime-adapter.ts:81-89`。

## 独立运行验证（父代理执行）

父代理对同一工作树复跑五个核心测试文件，158/158 通过；源码和测试 typecheck 通过；真实 dist 声明消费者在 `types: []`、`skipLibCheck: false` 下编译通过。证据：[本轮运行证据](kodax-space-sdk-seams-working-tree-evidence.json)，`tests`、`typecheck`、`sdkConsumerTypes` 字段；SDK 身份为其 `sdkBaseline` 与 `worktreeContentSha256`。

父代理从 Space 目录直接导入工作树 dist，启动隔离 home 的实际 detached Host；capability handshake、Host Tool 反向桥（1 次）、scoped credential 反向桥到本地 HTTP（2 次）、公开历史质量字段、Retry before、canonical Rewind、stale boundary 拒绝及 idle shutdown 均成功。这给公开构建产物提供独立消费者证据；没有真实模型请求或真实用户 Session。证据：[本轮运行证据](kodax-space-sdk-seams-working-tree-evidence.json)，`builtSdkProbe`、`distribution`、`limits` 字段；SDK 固定点及工作树身份同上一段。

## 未证实

- 本代理没有独立复跑文档所述“56 文件 / 519 测试”、覆盖率百分比和全构建，因此它们仍是 SDK 团队的验收声明，不能由该 spec 自证。测试源码确认有真实 Host fixture、scoped credential/Host Tool bridge、异授权队列、steer conflict、伪造 payload、Skill/command/review/workflow/compaction、撤销、canonical 操作和图片断言；这些断言不等于所有边缘路径已实测。来源：`K:docs/SPACE_SDK_SEAMS.md:77-81`；`K:src/sdk-client.host-authorization.test.ts:16-179`；`K:src/sdk-client.derive.test.ts:101-136`；`K:src/sdk-client.history-boundaries.test.ts:66-80`。
- 上节只记录父代理独立运行事实；本代理没有把父代理或 Standards 轴的源码结论当成自己的 Spec finding 依据。158 个核心测试与 dist 消费者成功不替代 SDK 团队所述 519 个完整回归或全仓覆盖率。
- 本轮未查询 npm Registry，不能对“已经发布/尚未发布”的外部状态作独立结论。只确认该规范标为工作树补齐，且本轮 HEAD 未改变。来源：`K:docs/SPACE_SDK_SEAMS.md:3,81`；上述 Git 固定点。
- 没有验证完整 Space 主进程/IPC/Renderer 迁移、真实 keychain、Office/Artifact 用户数据、全部 Provider 或机器崩溃矩阵；本文结论限于列出的 SDK diff 与 Host 源码，不外推这些产品验收结果。

## 未解问题（未升格为 finding）

1. **工具显示项的选择语义。** 工具项的正文来自 successor 的 tool_result，但本轮新增 historyBoundary 指向 owner assistant/tool_use 消息；Fork 按规范“包含边界消息”会在该 canonical 消息之后结束。源码足以证明两种身份有差异，但规范没有承诺“Fork 工具卡片包含卡片所显示的后续结果”，也没有明确 tool card 是否应作为可选操作点；因此不凭猜测报错误。Space 若在工具卡片提供 Fork，应先定义用户选择的语义，再做针对性验证。来源：`K:src/client-history.ts:40-62`；`K:src/client-canonical-tools.ts:39-50`；`K:docs/SPACE_SDK_SEAMS.md:48,54,58`。
2. **partial 下可见但不可执行的 boundary。** projection 对现有 boundaryId 发放 DTO；storage 还要求完整父链。是否在 Space 中将这种点禁用、显示说明还是让 Host conflict，是消费者交互决策，源码无法替产品决定。现有保守拒绝未违反文档的质量限制。来源：`K:src/client-history.ts:60-62`；`K:packages/repl/src/interactive/storage.ts:656-670,5388-5397`；`K:docs/SPACE_SDK_SEAMS.md:58`。
3. **共享 Host 的 Space 手册安装位置与匹配策略。** hook setter 已存在，但如何在可信 Host integration 生命周期安装、按哪个 Session/产品身份筛选，是 Space/SDK 宿主部署决定；本次 spec 保留该策略归属，没有给出一个可直接复制的完整 Space bootstrap。来源：`K:docs/SPACE_SDK_SEAMS.md:64`；`K:packages/coding/src/agent-runtime/provider-hook.ts:55-82`。

## Spec finding 汇总

Spec：0 项；最严重项：无。没有把文档已经明确声明、本轮未承诺修复的限制当作 diff 引入的实现错误，没有证据支持 scope creep。上述未解问题属于明确标记的语义/消费者决策，不作为缺陷计数。

## 工作树原始字节哈希清单

```text
e5bc1c8889a1aab0aaac92e95dd1744837cb0f323adfb0025c6421cbf2512e62  docs/CLIENT_CONTRACT.md
4d6370e8a17b756892a4c5a6dadee977d3340350e99397c57862a349f20e7bf3  docs/SDK_MIGRATION.md
a6728e46d464dfc8b59fdc3c76292f6655fb9436b24d08ce565034cd5f128998  docs/SPACE_SDK_SEAMS.md
2f5576a6c04f05be9d190e569c099d9fcf961626d414afa41d5af4dd78005931  package.json
1e341daa2629882f12705727d51353a77ebe842c7b6399bb3385f89430a96fa6  packages/coding/src/child-executor.test.ts
1f3d411f9e20dcca5cb84fd8d9711f4fd7faf060dd7e5632fd77f771b2a64153  packages/coding/src/child-executor.ts
146aee5a840200a062fc23154ee33774876b37ff1c7c1b3cbf3dd9e6fda28542  packages/coding/src/client-contract.ts
26cda4dcd6ef8b81f9f0f7a9ec44d8212d9ccb66443e3b6893c16de06d9f6a3f  packages/repl/src/interactive/storage.ts
f4c6f14b03547b51375677e1f2b7cc0b07c4d49a7f4af00d023b34890aad4607  public_docs/sdk/embedder-guide.md
0291bade93a77d31fef4488f810b2872c8b893c87d24499c548c2e9ce651ebe2  src/client-canonical-tools.ts
4d10ae3138e5d4d55afe7ab8812d71ff180651135ad71d6b3d577d6f97ed39a5  src/client-history.ts
2148e8cc3d63456fe211553475e17c180c73e1ddb0b34ff9454d5f57a9727bb4  src/client-host-authorization.ts
58f87ee64a1c3bcfe544fefe51d355bd744da83b23ebe22f417dd43e787ed629  src/client-runtime-adapter.ts
df376da4749c8f87fd876879b35e770bb8f96e65b59b73a7fc0a25bedc8324ea  src/product-execution-authorization.ts
a985e1d5f8cd8d69aa81d2b35c0d2178545e6bd1601c6d60c774218aeac81ebc  src/runtime-daemon/host.test.ts
6af5e1702e042ed4c5ad6cc0345aef04a588ed245fb23d61cd2dda9b566b5b78  src/runtime-daemon/manager.test.ts
2654bc46d144a172483087bf430135213c99031a57ab1ba92af6ef26a8849bed  src/runtime-daemon/schema.ts
b415ecddf3543f04d2804d0c80d5f86f0a27d59fd70e7bb69ffaa449cbc545af  src/runtime-daemon/server.test.ts
f4dd6430678ca60875c780676bcea2cf8e6f95ae29205557c4b7a872064f72d6  src/runtime-daemon/server.ts
9acd442bc14d0fe364bd881f359486bfb8e1c45c7de5c23efe8239798ca4167e  src/runtime-product-commands.ts
7fbe407d6c127a8ea9994e853cce5f1cf7084c58a173851df11ead1ef828faba  src/sdk-client.derive.test.ts
3167ac7f9632eed770ec3a9bc490bc8f9db9b9d879578284f63a23c10dd8ef31  src/sdk-client.history-boundaries.test.ts
85f7b97b43fa6ae4f9e91bb9f95ed05aca4417e9f637eea0ced78254d1acc840  src/sdk-client.host-authorization.test.ts
4079732e5b461a94cdf3ddb3cc353cf431633e19c87db081c79c2ca195c396b6  src/sdk-client.test.ts
5fdaa968f2d955c5dd62b02ce62a9ecd2be64c14cb271ac2b033d3a291727784  src/sdk-client.ts
657852f567a143d7171dd3ea35eecce549278f8a58e90b95ad24a7aeca6b2fb5  src/sdk-runtime.ts
03b49828672d8786a174f8884dcbb7c4d3f1bc4fb9d50642101f9b823e0dc687  src/session-input-queue.ts
52200d1178afb0ea92106c3e0ac667b430a2f95bd01812d644e9ef86196f57d1  tests/fixtures/product-client-types/consumer.ts
```

## Standards

独立 Standards 轴：0 个可行动发现，最严重项无。逐 hunk 检查全部工作树变更及指定未跟踪文件，按 KodaX `AGENTS.md`、`CLAUDE.md`、`CONTRIBUTING.md`、`docs/CLAUDE.md` 与 Fowler 12 条基线评审；未发现本次 diff 引入且具有实际影响的规范违反或 smell。此轴仅做只读静态评审，运行验证由主审计独立记录。

## Spec

独立 Spec 轴：0 个可行动发现，最严重项无。执行授权、异授权队列隔离、canonical Fork/Retry/Rewind、图片引用与 child 工具收窄有源码证据。工具卡片选择点、partial 保守拒绝和共享 Host 手册部署保持为设计澄清；旧完整退出事务 API 缺失是已声明的剩余能力限制，不是本轮 diff 的新实现错误。

Standards：0，最严重项无；Spec：0，最严重项无。没有由两个轴合并产生新的缺陷排名。

## 对 Space 原迁移缺口的状态更新

| 原缺口                                                | 本次工作树状态                                                                         | Space 后续动作                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| G1：Product 执行无法绑定 scoped credential lease      | 核心接缝已补齐；独立构建烟测通过反向桥取得精确 Session/Run/Provider/purpose 凭据       | 在 Main 实现 Session 授权和 Provider allowlist；按连接维护、恢复及撤销 leases                        |
| G2：Product 执行无法绑定 Space Host Tools             | 核心接缝已补齐；独立构建烟测通过 Artifact 示例工具调用                                 | 改造 `space-host-tools.ts` 对 Client callback services 的注册；保持 handler 的 Host 身份核验         |
| G5：历史 boundary/sourceRevision/status/issues 不公开 | 已补齐；公开 Retry-before、Rewind 和 stale boundary 拒绝独立实测通过                   | IPC 原样传递边界；更新 history/store；长文回源后用新 inputId 重试                                    |
| G8：历史附件缺结构化引用                              | canonical 用户/工具结果图片引用已补齐；五文件回归覆盖                                  | 映射已有附件 UI；picker 元信息、字节和 Office/Artifact provenance 不从该 DTO 推断                    |
| G3：手册、Shell、可信策略                             | 已明确既有 Host hook、Runtime Shell CAS 与 owner bootstrap 接缝；完整 Space 集成未验证 | 设计具体 Space Host extension、策略适用范围与安装路径，不能把旧 per-run options 全塞进 Product input |
| G6：完整上下文组成和跨重启统计账本                    | 没有提供等价完整产品 DTO；文档明确较窄范围                                             | 决定保留可信诊断适配或调整正式指标承诺；activity usage 不当累计账本                                  |
| G4：完整退出、退出事务和 crash recovery               | 旧完整退出事务的等价公开 API 仍缺失                                                    | 保持为单独的功能等价问题；不能以本次正常 idle shutdown 测试关闭它                                    |
| 独立 `agents.spawn/followup`                          | 未纳入新授权 callback，仍需低层 host-only 接缝                                         | Space Agent 操作不要套用 root input 的 lease；单独实现和验收                                         |

上述结论来自本文各节源码引用和[独立运行证据](kodax-space-sdk-seams-working-tree-evidence.json)，是消费者迁移状态更新，未实施 Space 生产迁移。核心授权/历史接缝已经足以开始迁移垂直切片；完整功能等价仍受表中限制约束。Space 当前安装的 Registry `0.7.97-alpha.1` 没有新 `authorizeExecution` 和 history-boundary 声明；本轮直接调用的是 KodaX 工作树 `dist`，没有更新 Space manifest/lock 或替换其安装包。
