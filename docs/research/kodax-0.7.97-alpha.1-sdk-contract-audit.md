# KodaX 0.7.97-alpha.1 的 SDK 契约是否足够承接 Space？

> 后续复核：本报告只针对 Registry alpha.1 字节。接缝修复已发布为 alpha.2 并安装到 Space；七项反例通过真实发布包复验，见[最新发布包审计](kodax-0.7.97-alpha.2-published-sdk-audit.md)。以下删除项和缺口记录属于 alpha.1 历史，不能直接当作 alpha.2 的 SDK 现状；旧 Runtime 接入迁移仍需由 Space 完成。

结论：这是有真实删除项和语义变化的 SDK breaking release，不能只修 TypeScript。统一 `/client` 足以承接共享会话、输入、显示、历史、交互及领域控制，但当前不允许绑定 Space 的 scoped credential lease 或 Host Tool lease；Space 的凭据、Artifact / Space Control 工具、存储位置及完整 owner 生命周期仍需要明确的可信宿主接缝。该结论来自实际 Registry 包的类型及 Host 实现，而非只读发布说明。[P97 `dist/sdk-client.d.ts:10-29`、`dist/sdk-runtime.d.ts:1523-1565`；K97 `src/sdk-runtime.ts:12216-12258`、`src/client-runtime-adapter.ts:150-161`]

## 证据范围与记号

核对日期：2026-10-09（Asia/Shanghai）。本审计只下载/解压公开 npm 包、读取本地第一方源码/标签及发布文档；没有运行真实用户会话、调用云模型或更改 KodaX 源仓库。

| 记号 | 可复核来源                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P97  | Registry 实际发布的 [`@kodax-ai/kodax@0.7.97-alpha.1` tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.1.tgz)，SHA-1 `56b9e4e61363bbf3cb9e59e31b42eed0c518a918`，SHA-512 `n970k70WT6dJtaFiq/21D2JPyk7427Xi/jkhSL/BkLacJUAcebcLQZzYXWDHpf8sW6QA/wLEb36hVIHXCk/9Ag==` |
| P96  | Registry 实际发布的 [`@kodax-ai/kodax@0.7.96` tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.96.tgz)，SHA-1 `3335a8824aab7eeb8ba5ba7796623ca7a4779676`                                                                                                                     |
| K97  | 第一方 [`v0.7.97-alpha.1`](https://github.com/icetomoyo/KodaX/tree/ba30095a6a2da143a43776402813f24734d8c53a)，commit `ba30095a6a2da143a43776402813f24734d8c53a`；本地 KodaX HEAD 与该 tag 相同，工作区干净                                                                                  |
| K96  | 第一方 [`v0.7.96`](https://github.com/icetomoyo/KodaX/tree/c2c8fdc41f4e0b50fa1c2d0b24142586f155777c)，commit `c2c8fdc41f4e0b50fa1c2d0b24142586f155777c`                                                                                                                                     |
| S    | 本次审计时的 Space 工作树；涉及它的行号是本次读取位置，后续修改可能使行号移动                                                                                                                                                                                                               |

后文 `[K97 文件:行]` 均限定在上述不可变 commit；`[P97 文件:行]` 限定实际 npm 包里的文件。`docs/CLIENT_CONTRACT.md`、`docs/SDK_MIGRATION.md`、`public_docs/sdk/embedder-guide.md`、`CHANGELOG.md` 的发布字节与 K97 工作树在 CRLF/LF 规范化后相同；不能把本地工作树任意其他文件默认当作已发布文件。实际 tarball 独立解压在 `%TEMP%/kodax-sdk-0797-audit/{0.7.96,0.7.97-alpha.1}/package`，没有覆盖安装目录。

有两处第一方文字必须校正理解：发布说明称“Every v0.7.96 stable contract is retained”，但实际公开 d.ts 删除了多个 v0.7.96 exports；迁移文档还写“当前开发树/不表示 npm 已发布”，但这些文档和 `/client` 已随 P97 发布。涉及存在性时，以 P96/P97 的 exports、类型和实际代码为准，不能以这两句概括否定删除项。[K97 `CHANGELOG.md:11-17`、`docs/SDK_MIGRATION.md:3`、`docs/CLIENT_CONTRACT.md:9`；P96 `dist/sdk-runtime.d.ts:2888-2900`；P97 `dist/sdk-runtime.d.ts:3084-3093`]

## 1. public subpath 与明确删除项

所有旧 package subpaths 仍存在：根入口、`/agent`、`/llm`、`/coding`、`/media`、`/repl`、`/skills`、`/mcp`、`/session`、`/runtime`、`/sandbox`、`/a2a`、`/experimental-memory`、`/package.json`。新增的是 `/client`。subpath 保留不等于其中每个 named export 保留。[P96/P97 `package.json:23-85`]

| 入口               | 实际差异与迁移含义                                                                                                                                                                                                                                                                                                        | 证据                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/client`          | 新增 `ensureKodaXClient`、`connectKodaXClient`、`KodaXProductClient` 和纯数据类型；它是 Node connector，类型可以 `import type` 给 renderer；不是旧 `KodaXClient` 的重命名                                                                                                                                                 | P97 `dist/sdk-client.d.ts:1-29`；K97 `docs/SDK_MIGRATION.md:7-18`                                                                                                                                                                                                                            |
| `/runtime`         | 新增 `ensureKodaXRuntime`、统一 Interaction、Invocation、Memory、Workflow start/recover 类型；旧运行时宿主接缝继续存在                                                                                                                                                                                                    | P97 `dist/sdk-runtime.d.ts:1523-1565,3084-3093`                                                                                                                                                                                                                                              |
| `/runtime`         | 删除 `RuntimeOperationOptions/Receipt/Service/State`、`RuntimeEventReplayFilter`、`RuntimeSessionCursor`、`RuntimeExitSettlement*`、`RuntimeDaemonRollbackInput/Result`、`RuntimeWorkerOptions/ResourceLimits`、`RuntimeDiagnosticFilter/DiagnosticsService`，以及 `getKodaXRuntimeOwnerPolicy`、`settleKodaXRuntimeExit` | P96 `dist/sdk-runtime.d.ts:2900` 对比 P97 `dist/sdk-runtime.d.ts:3092-3093`；K97 `public_docs/sdk/embedder-guide.md:6865-6873`                                                                                                                                                               |
| 根入口和 `/coding` | 删除 `KodaXInterruptedRunJournal`，改为 checkpoint 的 `KodaXInterruptedRunEvidence`；删除 speculative race/window 和 filesystem-effect lease helpers；根入口同时失去 runtime rollback/exit/replay/operation exports                                                                                                       | P96 `dist/index.d.ts:2-28,260-261`、`dist/sdk-coding.d.ts:5499-5500`；P97 `dist/index.d.ts:1-28,291-292`、`dist/sdk-coding.d.ts:5086-5087`；K97 `packages/coding/src/types.ts:1918-1980`                                                                                                     |
| `/repl`            | 删除 `InkRuntimeRunner*`、`ReplRuntimeRunner*`；增加 client plane/显示适配类型和函数；Space 不应为业务迁移依赖终端 UI 内部适配器                                                                                                                                                                                          | P96 `dist/sdk-repl.d.ts:2369-2370`；P97 `dist/sdk-repl.d.ts:2614-2615`；K97 `docs/SDK_MIGRATION.md:7-18`                                                                                                                                                                                     |
| 其他入口           | `/agent` 增加 MCP call-context helpers；本次 named-export 对比未发现 `/llm`、`/media`、`/skills`、`/mcp`、`/session`、`/sandbox`、`/a2a`、`/experimental-memory` 的删除项；这不证明每种内部行为完全不变                                                                                                                   | P96→P97 export 声明：`dist/sdk-agent.d.ts:3475-3476→3482-3483`，`sdk-llm.d.ts:530-531`，`sdk-media.d.ts:164-165→166-167`，`sdk-skills.d.ts:1-2`，`sdk-mcp.d.ts:19`，`sdk-session.d.ts:1-4`，`sdk-sandbox.d.ts:121-122`，`sdk-a2a.d.ts:574-575→587-588`，`sdk-experimental-memory.d.ts:22→21` |

`KodaXRuntimeIsolation` 从 `inline | worker | process` 变为 `inline | process`。`createKodaXRuntime` 不再提供 `isolation` / `worker` options；`requirements.hardDispose` 和 runtime-worker sidecar 也删除。构造 handler worker、语义 worker、daemon 并未全部删除。[P96 `dist/sdk-runtime.d.ts:1050,1176-1182`；P97 `dist/sdk-runtime.d.ts:1247,1356`；K97 `public_docs/sdk/embedder-guide.md:6869`、`docs/SDK_MIGRATION.md:105-107`]

## 2. create / connect / ensure 不是简单更名

| 调用                                    | P97 真实行为                                                                                                                                         | Space 调整                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `connectKodaXRuntime`                   | 被动连接；`autoStart: true` 在联网/启动前立即拒绝                                                                                                    | 当前 Space `createPublishedRuntime` 使用 connect 且初始化 options 为 true，必须拆为 ensure 启动和 connect 重连 |
| `ensureKodaXRuntime`                    | 本机启动或正常更新可验证的空闲 Host，再连接；底层 options 仍支持 `sessionsDir`、orphan idle-exit、capabilities/requirements、startup cancellation 等 | 可作为受信任 Space bootstrap 的候选接缝，但不能直接称其为产品 Client                                           |
| `ensureKodaXClient`                     | 只透传公开 product options，并强制 `requirements: {productClient:1}`，返回内部 product projection                                                    | 纯产品路径简单；不接收 Space 当前所有宿主定制                                                                  |
| `connectKodaXClient`                    | 把 `token` 映射到 `daemonToken`，`autoStart:false`，要求 productClient v1                                                                            | 用于被动 attach；endpoint 是本地 socket/pipe，不能当 HTTP/WebSocket URL                                        |
| `createKodaXRuntime({mode:'embedded'})` | 仍是显式 inline 库/可信宿主执行对象                                                                                                                  | 不能在产品连接失败时私自 fallback 到另一个会话 owner                                                           |

证据：[K97 `src/sdk-runtime.ts:5680-5694`、`src/sdk-client.ts:10-44`、`docs/CLIENT_CONTRACT.md:15-33`；S `apps/desktop/electron/kodax/runtime-host-adapter.ts:1696-1719,2320-2337`]

产品 options 只有 `homeDir`、`profile`、`clientInfo`，被动 connect 另外支持 `endpoint`/`token`，ensure 另外支持 `daemonStartupTimeoutMs`。`clientInfo` 可传 `instanceId`/`instanceSecret`，因此现有稳定 Space 身份凭据**不是**迁移阻碍；没有导出 Runtime identity/scopes/connection/management 并不等于认证身份被删除。[K97 `src/sdk-client.ts:10-23,34-42`、`src/runtime-client-info.ts:1-19`、`packages/coding/src/client-contract.ts:86-270`]

`homeDir` 表示包含 `.kodax` 的基础目录；`sessionsDir` 缺省推导为 `<homeDir>/.kodax/sessions`。它不是任意“原 sessionsDir 的别名”。当前 Space 使用 `sessionsDir: <profileRoot>/sessions`，应先核对实际目录/owner endpoint 推导，而非把 profileRoot 无条件传作 homeDir；product profile 是连接/配置身份，不能作为同一存储的第二写入者。[K97 `src/sdk-runtime.ts:17177-17188`、`docs/CLIENT_CONTRACT.md:24-35`；S `apps/desktop/electron/kodax/runtime-host-adapter.ts:2326-2328`]

启动器还核对运行构建的 origin/fingerprint，并在替换旧 Host 前要求真实空闲、正确进程身份、正常 shutdown、原进程确已退出；不能强杀忙碌 Host，SDK 进程在依赖升级后应重新加载。相同版本号不保证相同运行字节；较新兼容 Host 可被动连接，较新不兼容 Host 不应被降级。[K97 `docs/CLIENT_CONTRACT.md:35-49`；`src/sdk-runtime.ts:5990-6043`]

Electron 作为 Node executable 的启动处理仍在 KodaX 内部：daemon spawn 使用 `prepareInternalNodeLaunch`，Electron 执行边界设置一次性 Node mode 并加入 scrub import，实际子进程先清除开关，Windows 仍走 job-contained launch。缺少 product option 的“自定义 daemon Node env”不能直接判作 Electron 不可运行；需要测实际 packaged Electron 和 Space 的 macOS TMPDIR 路径，保留包 dist/assets external 的要求。[K97 `src/runtime-daemon/process.ts:816-866,981-999`、`packages/agent/src/runtime/process-hardening.ts:90-103`；S `apps/desktop/electron/kodax/runtime-host-adapter.ts:1719`]

## 3. 统一业务契约的完整覆盖

下表列出当前 product domains，供 Space 按业务职责迁移，而不是把低层 Runtime 对象强制断言为 Product Client。[K97 `packages/coding/src/client-contract.ts:86-270`、`src/client-runtime-adapter.ts:11-351`]

| 领域                 | product 方法                                                                                                         | Host 权威与关键约束                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Session              | create/list/read/delete/archive/unarchive；get/updateSettings、versioned CAS；getAutoModeStats                       | Host 存储/有效设置；CAS 返回 revision/value；原覆盖与有效设置分离                                             |
| 显示与历史           | observe/readItem/readHistory/readHistoryEntry/searchHistory                                                          | observe 是当前 view 全量替换；正文/历史分别回源，不把 display window 当完整 canonical transcript              |
| Goal/notice          | read/create/pause/resume/clearGoal；appendNotice                                                                     | 目标持久化；通知 client-only，不进入模型正文；不能靠 renderer append 维护                                     |
| Lineage              | readLineage/labelEntry/selectBranch/rewindSession/forkSession/recoverSession                                         | rewind 要 expectedHead，空闲准入；fork history boundary 要 sourceRevision；recover 是确定性新会话，不调用 LLM |
| Input                | submit/read/withdraw                                                                                                 | sessionId + inputId 是同 Host 意图身份；正文/附件/delivery/target 都参与去重                                  |
| Run                  | startTool/read/stop/await；Session cancel                                                                            | 接收与终态分离；Session Stop 用持久 frontier；unknown 不是完成/取消                                           |
| Interaction/grant    | list/respond；listGrants/revokeGrant                                                                                 | Host 创建精确请求、首个有效答案生效；grant 撤销使用领域 revision                                              |
| Workflow             | start/list/get/subscribe/pause/resume/stop                                                                           | source 是 name/request/inline serializable source，由 Host 解析；不传可执行 prepared module                   |
| Agent registry/Actor | registrations.list/upsert/setEnabled/remove；agents.tree/detail/spawn/send/followup/interrupt/output/wait/reviewLean | 保留领域身份/ownership/revision；不会用通用 operation envelope 替代                                           |
| Config/catalog       | read/readEffective/patch/reload；providers/models/reasoningEfforts/probe/forget/commands/skills/extensions           | Host 解析默认值和注册来源；probe 是显式 Provider 请求，不能连接时偷偷探测                                     |
| MCP                  | status/listServers/get/validate/upsert/delete/reload/listTools                                                       | Host 持有连接；status 不唤醒 lazy server；reload/forceRefresh 才显式重建/刷新                                 |
| Invocation           | commands.execute/readPrompt；review.start；agents.reviewLean                                                         | Host 可信准备 Skill/hook/model/tool/fork 元数据；readPrompt 只是纯文本                                        |
| Memory/Learning      | memory.forProject 的 refs/proposal/inbox/rebuild/open target；Learning query/notification/governance                 | 精确 ref/指纹/revision；订阅故障独立于执行终态；本客户端通知状态与共享治理分离                                |
| lifecycle            | observation.close/client.disconnect/host.shutdown                                                                    | 前两者只释放观察/连接；正常关闭空闲 Host 是另一个动作                                                         |

方法参数和返回值不是一对一兼容；上述覆盖应结合后续各域约束验收。[K97 `docs/SDK_MIGRATION.md:22-44`]

## 4. 输入、队列、interrupt、Stop 的变化

1. product `inputs.submit` 是用户意图，必须预生成并保留 inputId、原文和附件；回执 submitted 只表示进入上下文，不证明 Provider 收到了，也不代表执行完成。回复丢失先 `inputs.read` 查询同一 Host 原 ID，不能生成新 ID 自动重发。[K97 `packages/coding/src/client-contract.ts:626-653`、`docs/CLIENT_CONTRACT.md:150-161`]
2. product delivery 是 `immediate | after_turn | steer | redirect`；steer/redirect 必须指定目标 Run。旧低层 `RuntimeSubmitInput` 仍是 `after_turn | interrupt` 且有 afterRunId，这是两个不同接缝；不能只把 interrupt 改字符串。[K97 `packages/coding/src/client-contract.ts:626-640`、`src/sdk-runtime.ts:1964-2010`、`docs/SDK_MIGRATION.md:29,54`]
3. product after_turn 可在当前 Run 下一次模型请求前的安全点消费，不必等整个长任务结束；普通排队可合批，多个 inputId 可能对应同一 Run/user display item，应逐 inputId 查询。旧低层 after_turn 仍有 predecessor settlement 语义；Space 队列目前设计必须按选定接缝重新验证。[K97 `docs/CLIENT_CONTRACT.md:156-168`、`public_docs/sdk/embedder-guide.md:5378`；`src/session-input-queue.ts:131-176`]
4. product 队列最多 5 项，预览最多 72 字符；撤回在同一 Session operation lock 内，成功返回完整原文/附件。steer 不在可撤回 queue，目标结算前未交付变 dropped；Stop/失败不会无条件清空 pending product inputs。[K97 `src/session-input-queue.ts:28-29,61-77,96-113,178-197`、`src/sdk-runtime.ts:12272-12276`、`docs/CLIENT_CONTRACT.md:162-168`]
5. 当前 product queue/facts 是内存 MessageQueue/Map，close 清空。已提交 Run 的 product identity 可从 Run status 找回，但不应因此宣称跨 Host 所有输入/草稿身份 durable 或恰好一次。Host 重启后查不到输入不能证明没有副作用。[K97 `src/session-input-queue.ts:38-40,204-207`、`src/sdk-runtime.ts:12226-12233,12264-12268`、`docs/SDK_MIGRATION.md:56`]
6. 单 Run Stop 是 `runs.stop`；整个 Session Stop 应用 `sessions.cancel({sessionId,expectedRunId,requestId})`，Host 固定 frontier，排队 Run 与活动 Run 顺序处理，边界后新 Run 不受旧点击影响；不使用 UI list/abort 循环替代。receipt accepted 不证明清理完成，natural completion 可赢竞态；原请求字段应保持以修复部分交付失败。[K97 `docs/CLIENT_CONTRACT.md:425-427`、`src/sdk-runtime.ts:12280-12326`、`packages/coding/src/client-contract.ts:696-716`]

## 5. event / history / output 的变化

### 保留的 API，也可能失去旧保证

| 旧表面                                   | P97 行为                                                                                                           | 必须去除的 Space 假设                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `runtime.events.subscribe`、RuntimeEvent | 方法存在，filter 必须含 sessionId；seq 是同 Session 当前进程排序提示，cursor/journalEpoch 删除；没有 events.replay | 不能持久化旧 cursor 并跨 Host 恢复；不能单 runId 全局订阅；断连补当前 snapshot/history |
| `runtime.sessions.observe`               | 低层 snapshot + live event 接缝仍存在；snapshot seq high-water，后续大于该值；不再是持久 journal boundary          | 可用于过渡，但旧 journal replay/recovery算法应删或换；不把数字 seq 跨 runtimeId 比较   |
| product `sessions.observe`               | 首帧完整 view，其后完整 replacement；有 live/interrupted/closed status                                             | 不逐帧 append history，不按 text 去重，不推断 onComplete/工具成功就是 Run 成功         |
| `sessions.transcript/conversation/...`   | 低层完整历史/分页仍存在；product 提供 readHistory/readHistoryEntry/searchHistory                                   | 显示 ID 与 canonical history/search ID 各有读取域；UI 不解析 opaque ID 格式            |
| interrupted-run recovery                 | 从已落盘 canonical/lineage/Run status/ui checkpoint 推导有限 evidence                                              | 未落盘 token 不保证硬崩溃恢复；没有 journal 就不能以 event 推成功或完整工具副作用      |

证据：[P96 `dist/sdk-runtime.d.ts:2481-2537`；P97 `dist/sdk-runtime.d.ts:2067-2089,2640-2681`；K97 `docs/CLIENT_CONTRACT.md:5,291-329`、`public_docs/sdk/embedder-guide.md:6867`]

### 统一 DTO 对 Space 显示的意义

`ClientSessionView` 包含 session/settings/items/queue/interactions/runs，可选 contextBudget/parentContextTokens/activity；`runs` 是非终态加最近 Run，既非完整 Run 日志也非物理 Provider 请求回执。有效 settings 由 Host profile + Session 覆盖解析；原始覆盖走 getSettings。[K97 `packages/coding/src/client-contract.ts:473-497`；`docs/CLIENT_CONTRACT.md:185-199`]

Host 已经处理 output replacement：view item 的 id 是展示身份，outputId 是生成消息关联，draft/committed 和 textRevision 描述状态；同一 outputId 可以映射多个正文/Thinking/tool 块，所以不能单凭 outputId 去重。Host 在 `onOutputSegmentStart` 中删除/替换被废弃请求，并生成 checkpoint；Space 迁 product 后应消费新 view，不重复执行一套 segment authority reducer。[K97 `packages/coding/src/client-contract.ts:577-623`、`src/session-view.ts:92-129,159-192`、`docs/CLIENT_CONTRACT.md:305-311`]

显示 window 最多 150 项，文本可能是有界 suffix；readItem 用 UTF-16 offset/nextOffset/totalLength 并核验 textRevision/outputState。history 最新页先、页内旧到新、nextCursor 指向更旧；同一组合必须同 revision，oversized 项回 readHistoryEntry，search hit 的 entryIndex 不是 fork entryId。客户端冻结浏览捕获自身身份/长度，但 product 没有任意过去时点的不可变 snapshot lease。[K97 `src/session-view.ts:623`、`packages/coding/src/client-contract.ts:361-385,463-471,577-592`、`docs/CLIENT_CONTRACT.md:297-317`]

Activity 已覆盖 worker/parent contextBudget、token来源/usage、todo、children、managed task breadcrumbs/budget/fanout、workflow snapshot、costReport、Thinking/tool-input streaming。它是最近 Run 的显示事实，可在终态后保留；children DTO 是有界可显示摘要，不是完整 Worker raw events/log；token估计与实际账单/Provider adoption 区分。产品没有原 diagnostic getter 的完整替代：readEffective 只投影 verifierLog/stallLog/fallbackProviders，不能拿它补所有 provenance/cache/tool-exposure 数据。[K97 `packages/coding/src/client-contract.ts:499-575,861-872`、`src/client-runtime-adapter.ts:228-247`、`docs/CLIENT_CONTRACT.md:226-271,431-435`]

Tool DTO 包含 callId/name/status/inputText/progress/time 及 executionBegan/resultRecorded；实际 sandbox backend/fallback/policy observation 不在 product tool DTO。低层 `tool.sandbox` event 仍保留。因此 Space 如果要求显示逐调用 Sandbox 策略/效果，product 本身存在数据覆盖缺口；不应把 permissionMode 或一个 UI 开关推成已隔离执行。[K97 `packages/coding/src/client-contract.ts:610-623`、`src/sdk-runtime.ts:2466-2470`；P97 `dist/sdk-runtime.d.ts:2679-2681`]

### 历史操作和 Context 详情的可确认缺口

底层 `RuntimeConversationHistorySlice` 同时有 `revision`、`sourceRevision`、`status`、`issues` 和带 canonical entry 的 entries；product `projectConversationHistoryPage` 只返回 items/revision/nextCursor/oversized，而且 item投影丢掉canonical entryId。product `forkSession` 虽然接受 `{historyBoundary:{entryId,sourceRevision}}`，公开history API并没有生产这两个字段的入口；readLineage允许使用已知lineage selector，但不能普遍把所有压缩历史/managed历史的展示项映到精确source边界。因此 Space每个历史turn的“从此fork/retry”不是仅更换method即可完成；不能自解析opaque itemId、把page.revision当sourceRevision、按同文本匹配entry。[K97 `src/sdk-runtime.ts:1336-1343,8646-8656`、`src/client-history.ts:26-65,197-227`、`packages/coding/src/client-contract.ts:371-385,431-439`、`docs/CLIENT_CONTRACT.md:303`]

同一投影明确丢掉底层status/issues，ClientHistoryPage没有partial/history-truncation报告字段，Space已有partial/compaction_history_truncated诊断不能保留原保真度。product rewind只有selector/expectedHead，没有低层historyBoundary选择；若需求是精确canonical历史边界，须增加正式boundary DTO/operation或明确用可信低层接缝。[K97 `src/client-history.ts:59-65`、`src/sdk-runtime.ts:1580-1585,8937-8952`、`packages/coding/src/client-contract.ts:149-151,371-385`]

Context详情也缩减：低层RuntimeContextBudgetSnapshot有systemPrompt/toolSchemas/skillCatalog/mcpCatalog/transcript/pendingInput/recentToolResults/reservedResponse等tokenBreakdown，以及profile/pressure/usedTokens/ratio/recommendations和session/run/turn/context归属；ClientContextBudget只保留capacity/reserves/trigger/contextId等。activity.usage是聚合值，未提供providerRequestId账单去重身份或完整Session cumulative usage ledger。Space六分组成/按物理请求累计usage不能从product聚合值重新计算可靠事实；如保留该产品能力，应请求窄只读DTO，而不是迁移已删除的diagnostics.latest\* getter。[K97 `packages/coding/src/agent-runtime/context-budget.ts:17-60`、`packages/coding/src/client-contract.ts:499-512,557-561`、`src/session-view.ts:579-607`；P97 `dist/sdk-runtime.d.ts:3093`]

## 6. approval / sandbox / settings

`ClientInteraction` 的 kind 是 question/question_multi/question_input/permission，输入有 requestId/sessionId/runId/时间和 kind-specific options。cancel 取消一个问题，并非 Stop。权限只提交 allow_once/allow_session/allow_always/reject；扩展授权必须使用当前 request 返回的 opaque suggestionId。Plan 审批使用完整 options.plan，不用 inputPreview 拼计划，首个有效答复后由 Host 校验当前 Run/Plan 状态并改变模式。[K97 `packages/coding/src/client-contract.ts:747-798`、`docs/CLIENT_CONTRACT.md:170,437`]

旧 `runtime.permissions`/`userInputs` facades 仍存在但改走 `interaction.list/respond`；`runtime.permissions.request` 在 daemon facade 中明确拒绝 client 自建请求。旧 permission._ / user_input._ RPC 被标 retired 并返回 client_upgrade_required，不能以 retained TypeScript 方法名推断 wire aliases 仍可用。[K97 `src/runtime-daemon/client.ts:786-858`、`src/runtime-daemon/protocol.ts:179-186`、`src/runtime-daemon/server.ts:556-566`]

product 未设 permissionMode 的有效默认是 accept-edits；低层 Runtime 未声明权限的调用不自动获得这一 product 默认。workflow product adapter 显式传 settingsDefaults:'product'，不是授权凭据。planModeEffort 只在 plan 且无 effort override 时采用；patch null 清除覆盖。Space 不能靠启动时在本地补写所谓默认值修复新旧端差异。[K97 `docs/CLIENT_CONTRACT.md:94-100`、`src/client-runtime-adapter.ts:268`]

product 不暴露 `executionCwd`/`shellExecution` 设置 mutation，也没有 `/sandbox` 管理服务；底层 RuntimeSessionSettings/patch 仍有这两字段，产品 projection 主动去掉它们。它们属于 Host shell/sandbox contract，若 Space 提供这些控制，应保留显式可信宿主操作或请上游增加对应窄 intent/DTO，不能通过类型断言给 product 偷加字段。[K97 `src/client-settings.ts:3-19`、`src/sdk-runtime.ts:1541-1542,1565-1566`、`packages/coding/src/client-contract.ts:801-823`]

## 7. Skill / extension / MCP / context / domain persistence

Skill 以原始用户输入经 inputs.submit 到 Host。入队只保存正文/身份/边界，不执行动态上下文/hooks；消费时由 Host registry 再解析可信定义。注册 command 优先按 catalog 的 name/aliases 匹配，不能因为 UI 没有本地 extension runtime 就说未知；readPrompt 是纯读取、编辑后 submit 不继承原命令权限。[K97 `docs/CLIENT_CONTRACT.md:112-127,168`；`src/sdk-runtime.ts:12239-12258`]

commands.execute/review.start/agents.reviewLean 都需要 sessionId/inputId，可能返回 completed.success/message 或 started.runId；未标 execution:configuration 的 extension handler 在正常工具 Run 内执行，与后续模型 invocation 同 Run、共享原 inputId/历史。started 只是已启动，命令回复丢失不能透明重放，因为副作用可能已执行且甚至没有 Run 身份回到客户端。[K97 `packages/coding/src/client-domains.ts:84-112`、`docs/CLIENT_CONTRACT.md:108-123`]

Host 保留 Run 的 extension contribution snapshot，热更新只影响之后的 Run；Host-only command/Skill 描述符不能经低层 daemon 输入注入。product Catalog 返回纯数据 diagnostics；不返回 handler、Node runtime/controller。旧 coding 独立库仍能扩展，但不能把 renderer/Space 自建 extension runtime 当共享 Host 已加载。[K97 `packages/coding/src/extensions/runtime.ts:1890-1906`、`docs/CLIENT_CONTRACT.md:110,423`、`src/client-runtime-adapter.ts:304-330`]

MCP per-session config 已进入 create input，Host 实际保存在 runtimeDir/session-mcp。product MCP 不是旧 McpManager 的完整 start/stop/resources/prompts/authorization UI API；现有方法只明确承诺 config、status、tools、reload。MCP form/URL 最终映入 question_input，在纯 product DTO 中没有专门 form/url schema；复杂交互兼容性要实测。[K97 `packages/coding/src/client-contract.ts:252-265,626-640,774-778`、`src/sdk-runtime.ts:4920`、`docs/SDK_MIGRATION.md:44`、`docs/CLIENT_CONTRACT.md:409,423`]

Memory proposal 要使用读取时 revision/fingerprint；忘记 ref 要使用已读 body fingerprint，Host 重新检查 exact ref，路径不构成写权限。Learning acknowledge/snooze 是当前认证客户端通知状态，其他治理动作对共享 Host 可见。Workflow/Learning subscription 的 ready 仅代表注册完成，订阅前需 Host subscriptionLifecycle 支持；故障应重新注册、await ready、再读 snapshot，不 replay mutation。[K97 `packages/coding/src/client-domains.ts:21-81`、`docs/CLIENT_CONTRACT.md:88-92,125`、`src/runtime-daemon/client.ts:229-280,1083-1087`]

会话读取、设置读取、lineage/fork/recover 等先等待同 Host 正在保存的 view checkpoint，失败会传播；Run 终态不等于显示 checkpoint 已全部落盘。Host 崩溃只从成功保存的有限 evidence 恢复说明；shell deferred cleanup 与 effectOutcome:unknown 是独立事实，UI 不能合并成成功/已停止。[K97 `docs/CLIENT_CONTRACT.md:5-7,172-174`、`src/session-view.ts:318-333,429-430`]

## 8. 对 Space 迁移的硬缺口与可保留宿主边界

### 8.1 Scoped credentials / Host Tools：当前纯 product 路径无法承接

Space 当前在 Runtime 上 registerScoped/resumeScoped lease，并在每次 runs.start/submitInput 附 `credential` 和 `hostTools:{leaseId}`。Artifact、Office Artifact 和 Space Control handlers 通过这个 run-bound lease 才进入工具表。[S `apps/desktop/electron/kodax/runtime-host-adapter.ts:5801-5811,5949-5964,6320-6346`、`apps/desktop/electron/kodax/runtime/space-host-tools.ts:58-67,73-127`]

P97 底层 `/runtime` 继续保留 credentials.register/resume/registerScoped/resumeScoped/revoke 和 hostTools.register/resume/getInvocation/revoke，底层 start input 也有 credential/hostTools。这不是删除了宿主能力。[K97 `src/sdk-runtime.ts:1929-1945,3256-3279,3323-3340`]

但 `/client` 没有这些服务，ClientSubmitInput 没有 binding 字段；adapter submit 只是转 runtime.runs.acceptInput，server 的 input.submit 和 runtime acceptInput 都显式重新构造 productInput，只选 sessionId/inputId/text/delivery/target/artifacts。生成 startRun 时没有 credential 或 Host Tool binding。故**另外开一条 Runtime 连接去注册 lease，并不能自动让 product Run 得到此 lease**；额外字段也会在 server/Host 选择式构造时丢失，不能通过绕过 TypeScript解决。[K97 `packages/coding/src/client-contract.ts:626-640`、`src/client-runtime-adapter.ts:150-154`、`src/runtime-daemon/server.ts:1823-1841`、`src/sdk-runtime.ts:12216-12222,12247-12258`]

应提交给 KodaX 的最小上游需求是：在 Host 的同一 prepared product action 中解析受信任的认证客户端/Session 授权 binding，覆盖 immediate/after_turn/redirect/Skill/command/review/workflow/compact，不暴露 secret，不把 UI 任意 leaseId 当通用授权。先确认已有Host hook是否可用；本审计在公开 product options/services 与 acceptInput 实现中没有找到该接缝。此段是迁移设计建议，依据上述明确缺口，不表示这些 API 已实现。

### 8.2 存储、bootstrap、owner 生命周期：属于可信宿主职责，但 product 未提供全部承诺

| Space 必要职责                                                                          | P97 覆盖                                                                                                                               | 判定/下一步                                                                                                        |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 稳定 principal/secret                                                                   | product clientInfo 可透传                                                                                                              | 可迁，继续 safe-storage 与身份恢复；不要复制 secret 到 renderer                                                    |
| 自定义 sessionsDir/orphan idle-exit/startup cancel/capabilities/required host functions | ensureKodaXRuntime 支持，ensureKodaXClient 不暴露                                                                                      | bootstrap 可以保留底层；确认连接同一个 Host、同一存储及有效 orphan 政策                                            |
| lease reverse bridge callbacks                                                          | Runtime 仍支持，但 product action 无 binding                                                                                           | 阻碍纯 product 执行；需要上游可信 binding 接缝或明确阶段性保留底层 start                                           |
| Space withSessionRunContext / ALS 的本进程工具上下文                                    | RPC 不传函数/ALS，product 不传任意 context                                                                                             | 对真实 callback 用 Host invocation 的 sessionId/runId 和 trusted Session read 建上下文；不得把UI缓存当执行目录事实 |
| 用户 Run options/custom guardrails/system prompt/extension controller                   | product 只允许意图和共享设置；低层独立库仍支持部分 options                                                                             | 逐项找Host可配置/注册等价项；不能统统塞 Session defaults；Partner 单独审计                                         |
| 完整退出/owner transition/进程 containment/日志/管理 preflight                          | product 只有 host.shutdown accepted；低层 inspect/preflight/shutdown/owner state/verification 保留，combined exit ticket/rollback 删除 | 设计明确 detach vs stop owned work vs idle shutdown vs owner transition；不把 accepted 当完成，不模拟旧 ticket     |
| Activity/child/workflow/context/readItem                                                | product 已投影                                                                                                                         | 大多可迁；若要求 detailed worker events、sandbox observations、cache diagnostics，则单列数据缺口                   |

证据：[K97 `src/sdk-client.ts:10-44`、`src/sdk-runtime.ts:870-895,994-1026,3179-3340`、`src/client-runtime-adapter.ts:21-26,351`、`docs/CLIENT_CONTRACT.md:51,407-415`、`public_docs/sdk/embedder-guide.md:6866,6874-6882`；S `apps/desktop/electron/kodax/session-run-context.ts:1-25`、`apps/desktop/electron/kodax/runtime/space-host-tools.ts:89-115`]

### 8.3 纯 product 数据覆盖还需逐项核对

- ClientViewItem/readItem/history/search 只提供文本和工具显示字段，没有独立图片/视频/文件/Artifact ledger DTO；输入 artifacts 支持不代表历史附件结构可完整重建。若 Space 必须展示图片缩略图/可点击附件/生成 Artifact provenance，应要求正式数据契约，而不能从路径正文猜完整ledger。[K97 `packages/coding/src/client-contract.ts:463-471,577-640`]
- product 没有完整 Session raw transcript/export、confirmed identity alias mutation、permission matcher、Runtime identity/grantedScopes/client inventory、完整 config provenance、Host Tool invocation status；这些低层能力部分保留，但没有自动成为 product 承诺。Space 的依赖使用处需逐个决定是业务需求、宿主诊断还是旧权威重复。[K97 `packages/coding/src/client-contract.ts:86-270`、`src/sdk-runtime.ts:994-1026,1796-1836,3099-3124,3323-3340`、`docs/SDK_MIGRATION.md:44`]
- Client error 暂无统一穷尽联合；以 unknown 收窄、保留原始 message/cause，必要时识别 code。phase/state/outcome 使用 string 是 forward-compatible设计，不能把未知字符串默认显示成功；传输 reject、Run phase unknown、effectOutcome unknown 分开。[K97 `packages/coding/src/client-contract.ts:664-740`、`docs/CLIENT_CONTRACT.md:318-329`]

## 9. 可执行迁移顺序与验收

以下是分析建议，未在本文件中修改生产实现；各步骤依据以上证据：

1. **先完成真实兼容启动**：升级后的 Electron 重新加载 SDK；bootstrap connect(autoStart:true) 改为 ensure；被动重连保留 connect。删除已移除 capabilities/requirements，并改 lifecycle 调用；用空临时 home/session + mock provider 完成启动、双client、disconnect、idle shutdown、busy拒绝测试。依据：§1/§2。
2. **先定 KodaX 的宿主缺口处理**：凭据来源、Host Tools binding、存储目录/orphan政策、sandbox数据、附件历史必须明确，才可承诺完整 product迁移。没有上游接缝时，阶段性保留底层受信任执行是事实限制，不能称为已统一；禁止连失败时双owner fallback。依据：§8。
3. **会话元数据/设置/交互先迁共享服务**：getSettings原覆盖、observe有效值、CAS版本、Plan完整批准、grant suggestion ID、requestId first-answer，去除UI创建请求/本地配置/MCP执行owner。依据：§3/§6/§7。
4. **按 inputId 迁 execution/queue/Stop**：进入提交前保留完整意图；同ID查询恢复；after_turn合批安全点、steer drop、withdraw全文、redirect固定目标、Session cancel固定frontier逐项测试。依据：§4。
5. **用 Host view 取代事件拼接显示权威**：renderer保留UI折叠/滚动/草稿，业务projection改为replacement；旧event cursor/journalEpoch/replay/recovery删除；history/body reader按身份/revision/UTF-16 offset改接。依据：§5。
6. **Invocation/Workflow/Memory/Learning最后按域接通**：原始Skill交Host，command完成/启动联合单独显示；订阅ready后snapshot和故障恢复；危险mutation回复丢失禁止自动重跑。依据：§7。
7. **编译通过之后仍必须验证语义**：两个客户端共享设置/Run/批准，一端disconnect不中断；Host重启不重复输入；live/unknown/failed/interrupted/cleanup unknown正确区分；多工具长文/同文异ID/输出replace/压缩/分页失效/附件/子代理/Workflow UI仍完整。依据：K97 `docs/SDK_MIGRATION.md:111-121`及§4/§5/§8。

## 10. 已知未证实 / 未解问题

1. 公开 product API 缺少可信 credential/Host Tool binding；上游是否愿意扩展prepared action、或要求它们移至 Host plugin/bootstrap，是架构决策，源码不能替团队决定。参考§8.1。
2. Space 与 CLI共享还是隔离 profile/storage/进程生命周期必须由产品要求确定。单独 profile不会绕过实际存储owner锁；目录迁移还要实测历史/身份保存兼容。参考§2/§8.2。
3. 纯 product history 能否满足 Space 附件/Artifact展现，及 sandbox controls如何以窄可信入口承接，要从具体Space功能逐项验证；这里仅确认 DTO缺字段，不宣称任何完整附件丢失已被实测。参考§8.3。
4. bundled Electron/ASAR/external assets、macOS TMPDIR、Windows native backend、daemon process containment 的端到端安装验收未在本审计执行。第一方代码保留支持，不等于所有 Space distribution已通过。参考§2。
5. `persistedByHost:false` 的新 snapshot身份门禁与公开类型注释存在语义歧义，见下节；需要上游明确独立库兼容性，不能直接把离线 fixture失败当整个product Host回归。
6. 所有现有Space消费点及Partner私有extension/上下文需求由主审计继续追踪；本文件不是完整生产迁移实现或覆盖率证明。

## 11. 独立 coding 库的两条失败追踪

本节为父审计提供静态归因，实测新旧结果由父审计记录，不能混成已经验证的修复：

- `Session … was removed before its snapshot could be saved.` 定位为 P97 新门禁：`hostOwnsIdentity = options.session.persistedByHost === false`，随后 storage.load必须找到已有Session，再保留其gitRoot/runtimeInfo；Host-owned正常snapshot保存失败现在传播。P96没有这段 load/exists guard。fixture如果明确false但未预创建Session会失败；公开 KodaXSessionOptions 注释只解释true为Host外部写、unset为runner唯一写，没有解释false获得“Hostownsidentity”的新语义，因此要把此差异列为低层SDK兼容性问题并请上游明确，不能只修改fixture消灭红灯。[K97 `packages/coding/src/agent-runtime/middleware/session-snapshot.ts:294-323,342-350`、`packages/coding/src/types.ts:935-955`；K96对应`session-snapshot.ts:292-323`]
- `Tool is not active in the current runtime.` 的 dispatch activeToolNames guard在两版不变。P97变的是run-scoped extension snapshot/context，新增同runId scope复用；因此仅报错字符串不足以判定工具删除或SDK回归，应检查fixture创建/初始化/激活了哪个KodaXExtensionRuntime，执行options是否带extensionRuntime，贡献snapshot在注册前后何时pin。模型callname若不属于所选runtime的activeTools会按既有规则拒绝。[K97 `packages/coding/src/agent-runtime/tool-dispatch.ts:231-232`、`packages/coding/src/extensions/runtime.ts:1890-1906`；K96对应`tool-dispatch.ts:230-231`]

这两条具体Space fixture分别是 `scripts/test/kodax-managed-output-durability.test.mjs:10-96`（storage.load initially null，显式persistedByHost:false）和 `scripts/test/kodax-runtime-control.test.mjs:103-145`（在createKodaXRuntime之后global setActiveExtensionRuntime，而runs.start options没有给该Runtime装extension）。后者的归因现在可以确认：P97 startRun显式选择 `deps.extensionRuntime(sessionId)` 默认，并以options override合成执行runtime；P96原行只使用input.options，global active runtime得以生效。可以通过可信Host加载extension/commands.execute路径或显式独立embedded执行options移植fixture；不应把旧global injection当daemon产品正式注册机制。[K97 `src/sdk-runtime.ts:11398`，与K96该行diff；S上述fixtures]

另一个实际引导边界是首次 `client.runs.startTool`：工具Run虽不调用模型仍要求provider选择；无Session provider、config provider或bootstrap defaultProvider时，startRun报“requires input.options.provider or runtime defaultProvider”。ClientToolInvocationInput不携带provider，但**不需要只能修改bootstrap**：startRun先读取有效共享设置，再由buildEffectiveRuntimeOptions将settings.provider写入options.provider。因此产品可通过 `sessions.updateSettings(sessionId,{provider:...})` 或 `config.patch({provider:...})` 建立明确默认，再执行startTool；初始化时应显示/处理未配置选择，而不是将失败误标为模型调用失败。[K97 `src/client-runtime-adapter.ts:157-161`、`src/sdk-runtime.ts:11393-11401,11434-11438,20166-20195`]
