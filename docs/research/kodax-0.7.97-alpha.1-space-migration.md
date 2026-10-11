# Space 如何适配 KodaX 0.7.97-alpha.1

> 后续复核：本报告仅记录 Registry alpha.1 的历史。修复已发布为 alpha.2，Space 依赖已升级，七项反例经真实发布包重新验收，见[最新发布包审计](kodax-0.7.97-alpha.2-published-sdk-audit.md)。Space 旧接入代码的 96 个类型错误仍待迁移；以下 alpha.1 原始实测保持历史记录。

结论：依赖已更新，但当前 Space 尚不兼容。Coder 的业务接入层需要迁移到统一 Product Client；现有界面可以大部分复用。凭据、Space 工具、宿主策略、退出恢复和历史操作存在需要先解决的契约接缝，不能靠删除类型报错或旧 capability gate 完成升级。

日期：2026-10-09，Asia/Shanghai。Space 基线 commit：`118c0e1a6d6b13039c08591969547b6037c990d8`。本次请求范围是安装新版、验证兼容性和形成迁移分析，尚未实施完整产品迁移。

## 1. 已完成的更新与证据边界

- 根项目和 Desktop 都从 `0.7.96` 精确更新为 `@kodax-ai/kodax@0.7.97-alpha.1`，同步 `package-lock.json`。`npm ls` 显示同一实体、Desktop deduped；未使用本地 link 或 SDK 修改包。依据：根/Desktop manifests、lockfile 和本次[实测记录](kodax-0.7.97-alpha.1-space-migration-evidence.json)。
- 已运行仓库现有 `assertKodaxReleaseDependencyState`：manifest、lock、安装版本、Registry URL/SRI，以及安装文件与 Registry tarball 字节一致性检查通过。依据：[门禁实现](../../scripts/kodax-runtime-release-gate.mjs)，函数从第 230 行开始；[实测记录](kodax-0.7.97-alpha.1-space-migration-evidence.json)。
- SRI：`sha512-n970k70WT6dJtaFiq/21D2JPyk7427Xi/jkhSL/BkLacJUAcebcLQZzYXWDHpf8sW6QA/wLEb36hVIHXCk/9Ag==`。一手来源：[Registry 精确版本元数据](https://registry.npmjs.org/@kodax-ai%2Fkodax/0.7.97-alpha.1)。
- 源码核对使用同级 KodaX 仓库的 `v0.7.97-alpha.1` / `ba30095a6a2da143a43776402813f24734d8c53a`，同时读取实际发布包的 exports、声明和执行行为。Registry 没有提供 `gitHead`，因此不把本地源码标签当作所有发布字节的证明；导出与行为以安装包为准。具体 SDK 对照见[独立 SDK 审计](kodax-0.7.97-alpha.1-sdk-contract-audit.md)。
- 没有重写真实 Session，没有访问真实模型，没有覆盖打包应用，也没有把依赖升级描述为“Space 兼容完成”。本次生产代码没有修改。依据：[执行范围记录](kodax-0.7.97-alpha.1-space-migration-evidence.json)。

这里要区分三个完成条件：**新版包安装成功**、**Space 当前源码能够使用新版包**、**Space 完成统一契约迁移且保持现有功能**。现在只完成了第一个，并验证了新 Client 的基础能力。

## 2. 实测结果：安装成功，现有接入失败

| 检查                             | 结果                                | 可支持的结论                                                                |
| -------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| Registry 发布字节 / 精确依赖门禁 | 通过                                | 已安装用户指定的真实发布包                                                  |
| `npm run typecheck`              | 失败：96 条 diagnostics，11 个文件  | SDK 存在实际破坏性变化；43 条位于生产代码，53 条位于测试                    |
| 6 个发布包接入测试文件           | 17 项，14 通过、3 失败              | 新包仍支持多模态与部分持久化/取消机制，但旧启动与部分 inline fixture 不兼容 |
| 5 个 Desktop 接入测试文件        | 325 项，321 通过、4 失败            | 实包兼容性和手册基线失败；大量旧 mock 通过不证明实包可运行                  |
| 旧 `0.7.96` 对照                 | 相同发布测试中的 5 文件，16/16 通过 | alpha 的 2 项 inline 差异可复现；daemon 启动差异另以实包验证                |
| 新 Product Client 隔离烟测       | 8 组行为通过，Host 退出验证成功     | 新入口不是空壳，基础共享 Session/执行/观察可实际运行                        |

所有数字和命令范围见[原始结构化实测记录](kodax-0.7.97-alpha.1-space-migration-evidence.json)。没有执行全量 `npm test`、打包或跨平台 E2E，不能引用旧版的全量通过记录作为 alpha 验收。旧包对照通过临时模块解析 hook 加载独立 Registry 包并复用现有 transitive dependencies，不等同于完整旧版 `npm ci`。

生产报错集中在以下四个文件，其余 7 个文件是测试：

| 文件                                                             | diagnostics | 主要问题                                                                                   |
| ---------------------------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------ |
| `apps/desktop/electron/kodax/runtime-host-adapter.ts`            |          21 | exit/rollback 类型删除，operation 字段删除，cursor/replay 删除，旧要求和 rollback 方法删除 |
| `apps/desktop/electron/kodax/runtime/coder-daemon-projection.ts` |           9 | `origin.operationId` 和 observation cursor 不存在                                          |
| `apps/desktop/electron/kodax/runtime/interrupted-history.ts`     |           7 | 仍依赖 events.replay 和持久 cursor                                                         |
| `apps/desktop/electron/kodax/runtime/runtime-tool-history.ts`    |           6 | 仍依赖 events.replay 和持久 cursor                                                         |

依据：[typecheck diagnostics 逐条记录](kodax-0.7.97-alpha.1-space-migration-evidence.json)。这些只是编译器可见的变化；没有报错的 `real-session.ts`、Renderer store、workflow controller 等也需要语义迁移。

### 2.1 Coder 当前至少有三道启动阻断

1. Space 的真实 capability gate 要求 `runtimeExitSettlement:2` 和 `sessionEventJournal:1`，新版实际 `KODAX_RUNTIME_SDK_CAPABILITIES` 不再包含二者，门禁直接拒绝。不是需要等待 Registry。依据：`runtime-host-adapter.ts:1722–1767`，以及实测记录的 `currentSpaceGate`。
2. 即便移除这道门禁，Space 仍调用 `connectKodaXRuntime({autoStart:true})`。新版 connect 是被动连接，明确抛错，启动应改用 ensure。依据：Space `runtime-host-adapter.ts:1719,2322–2326`；[新版实现](https://github.com/icetomoyo/KodaX/blob/v0.7.97-alpha.1/src/sdk-runtime.ts#L5680)；daemon control 实包测试失败。
3. Space 启动/完整退出流程调用 `settleKodaXRuntimeExit`，新版实际导出为 `undefined`。旧的启动恢复、退出结算和 daemon→inline rollback 不能继续假定存在。依据：Space `runtime-host-adapter.ts:1450–1463,7055–7091`、`main.ts:2214–2222`；实际包探针及新版 `/runtime` 声明。

修改 connect 为 ensure 只解决第二项。给旧接口补 ambient 类型、强制 cast 或移除门禁并不能恢复已删除的行为。

### 2.2 三项发布测试失败应分别解释

- **daemon 启动**：`kodax-daemon-control.test.mjs:30–38` 使用 connect+autoStart，新版明确拒绝。这是确定的调用迁移。
- **managed durability host=false**：fixture 显式设置 `persistedByHost:false`，但 `storage.load` 初始返回 null。新版把 false 解释为 Host 已拥有身份，保存前必须确认 Session 存在。旧版 fixture 通过，新版提前拒绝。Space 生产 inline Session 当前没有设置这个字段，不能据此直接宣称 Partner 生产持久化回归。依据：fixture `kodax-managed-output-durability.test.mjs:57–82`；Space `real-session.ts:2714–2721`；[新版保存边界](https://github.com/icetomoyo/KodaX/blob/v0.7.97-alpha.1/packages/coding/src/agent-runtime/middleware/session-snapshot.ts#L294)。
- **extension command 不活跃**：fixture 先全局 `setActiveExtensionRuntime`，然后通过独立 Runtime 启动显式命令。新版返回 Tool not active，说明全局 active 不足以证明该 Runtime 的执行贡献快照含有它。应迁移为 Host 自身的 extension/config/command 路径，并单独验证 inline Partner 的实际运行上下文；不能用扩大全局注册范围来修。依据：fixture `kodax-runtime-control.test.mjs:103–145`；[独立 SDK 审计](kodax-0.7.97-alpha.1-sdk-contract-audit.md)。

### 2.3 新 Client 实际可运行的部分

隔离 home、隔离 workspace、两个 Client，显式设置 Session `provider:'anthropic'` 和 Full Access 后，验证了：ensure/connect、首个完整 view、共享 settings、无模型的 write 工具 Run 与 await、共享规范历史、Host notice/goal、fork、断开一个 Client 后另一个仍可读。关闭多余连接后，请求 Host shutdown，再用保留的底层 shutdown verifier 确认 `succeeded`。工具终态明确返回 `effectOutcome:'known'`。依据：[productProbe](kodax-0.7.97-alpha.1-space-migration-evidence.json)。

首次空 home 只设置权限模式、未选择 Provider 时，startTool 会报缺少 Provider。已通过 Session 设置解决并复测，因此这属于初始化/引导要求，**不是必须修改 SDK 的硬缺口**。正常 idle shutdown 通过，也**不能证明**崩溃恢复、强制退出或 Windows ACL 残留的旧 exit-settlement 产品承诺已经被等价替代。

## 3. 真正需要替换的层

新版一手迁移指南明确要求产品消费者使用 `/client`，保留 `/runtime` 作为可信 Host 启动、凭据、Host Tools、诊断和嵌入接缝。指南同时明确删除通用 operation envelope、持久 event replay、旧 exit/rollback 和 Worker-hosted embedded Runtime。依据：[SDK_MIGRATION §1、§7](https://github.com/icetomoyo/KodaX/blob/v0.7.97-alpha.1/docs/SDK_MIGRATION.md)。

因此建议把 **Coder 业务适配、状态投影和输入恢复**作为迁移中心；窗口、聊天气泡、卡片、布局、文件预览、终端渲染、Artifact UI、更新器和平台 UI 可以继续复用。已有组件仍需要绑定新事实；“界面可以复用”不等于 `appStore` 和 IPC 不用改。依据：新版 [Client contract](https://github.com/icetomoyo/KodaX/blob/v0.7.97-alpha.1/packages/coding/src/client-contract.ts) 与 Space `real-session.ts:1363–1465`、`coder-daemon-projection.ts:1045–1090`、`renderer/src/store/appStore.ts:4760–5180`。

| Space 接入域 / 主要文件                                                           | 现状                                                               | 新契约方向                                                                         | 迁移判断                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Host 启动、能力、连接、身份：`runtime-host-adapter.ts`, `main.ts`                 | connect autoStart；大量旧 capability；owner fence/exit recovery    | ensure/connect 分离；业务采用 Product Client，特权启动留明确 Host adapter          | P0；重做启动契约，不能盲删门禁                     |
| Coder 发送：`real-session.ts:1363–1465`                                           | 组装 Runtime options/context/selfManual/policy；直接 runs.start    | settings 归 Host；`inputs.submit` 或 `runs.startTool`；Skill/command 在 Host 准备  | P0；当前业务执行适配需要替换                       |
| 输入身份：`real-session.ts`, `session.ts`, `appStore.ts`                          | operationId → originOperationId → UI optimistic message            | 保存原始 inputId/text/artifacts；acceptance、Run outcome、canonical input 分别处理 | P0；跨 main/IPC/store 修改                         |
| 队列：`ipc/queue.ts`, `session-queue-guard.ts`                                    | 本地 after-turn 队列、SDK MessageQueue、daemon inputs 多条路径     | Host queue + `inputs.read/withdraw`；撤回完整输入                                  | P0；Coder 队列归 Host，不能同时保留本地执行队列    |
| Stop/steer/redirect：`real-session.ts:823–917,1260–1299`                          | stop frontier 已有；旧 interrupt/envelope 恢复                     | `sessions.cancel(expectedRunId,requestId)`；`steer/redirect` 精确 targetRunId      | P0；保留领域身份，重新定义重试和队列行为           |
| 实时显示：`coder-daemon-projection.ts`, `appStore.ts`, `composeMessages.ts`       | raw events + journal cursor + 累积 snapshot reducer                | `sessions.observe` 首个完整 view 与之后的替换；按 item.id 呈现                     | P0；替换 Coder reducer 和因果屏障                  |
| 历史：`runtime-tool-history.ts`, `interrupted-history.ts`, `ipc/session.ts`       | replay 恢复、canonical projection、turn 边界、sourceRevision       | readHistory/readHistoryEntry/searchHistory；需补历史边界和质量 DTO                 | P0；移除 replay 重建职责，保留长文/分页 UI         |
| 存储与会话 mutation：`session-store.ts`, `host.ts`                                | 混合 Host 和直接 SessionStorage 操作                               | Coder 的 create/fork/rewind/delete/notice/archive 等经 Host                        | P0；存储读取不能作为业务执行事实替代               |
| 权限/问答/Plan：`runtime-host-adapter.ts`, permission/ask-user UI                 | 两套事件投影；daemon Coder 还排除 exit_plan_mode                   | typed `interactions`、grantSuggestions、完整 plan、first-answer wins               | P1；组件复用，移除旧排除逻辑前做 Plan 回归         |
| Skills/slash/extension：`skill/registry.ts`, `ipc/skill.ts`, `runtime-command.ts` | 客户端 expand/invoke、dynamic context、显式 extension tool mapping | catalog + commands/Host preparation；保存原 slash text                             | P1；不在客户端执行动态内容，也不提前展开队列 Skill |
| Workflow：`workflow-controller.ts:1396–1465`                                      | main 加载可执行模块并本地 manager 启动                             | `workflows.start` declarative source；Host 解析、注册、执行、控制                  | P1；不仅替换 list/subscribe，启动所有权也要迁移    |
| MCP：`mcp/manager.ts`, `ipc/mcp.ts`, `sdk-extensions.ts`                          | UI 有自身连接 owner；Partner 又有受控 connector runtime            | Coder catalog/config 经 Client，连接由 Host 持有；Partner 保独立边界               | P1；安装包管理和 UI 不等于连接执行 owner           |
| Memory/Learning/Agents                                                            | 本地 memory controller 与部分 Runtime 领域服务并存                 | `memory.forProject`, learning, registrations, agents；保留各领域 CAS               | P1；依次迁，不增加通用 operation 层                |
| Provider/config/统计/诊断                                                         | Space keychain、custom provider、请求级统计、日志投影              | catalog/config/settings 经 Client；凭据与诊断属特权 Host seam                      | P0/P1；公开 Client 目前不是全部功能的等价替代      |
| Partner / 显式 inline rollback                                                    | 独立 profile、工具白名单、来源/证据、connector scopes              | Partner 暂保 inline；Coder rollback 必须按新生命周期重定契约                       | 分开验收；Partner 不应直接换成普通 Coder Client    |
| ESM、打包、手册、dev link                                                         | CJS main 的动态 import、固定 facade/worker 清单、旧手册            | 新增 `/client` 发布/导入检查；删除旧 Worker 假设；更新真实已验收手册               | 最后验收；不要先用文档宣称兼容                     |

表内源码路径均相对本仓库根；新版方法/数据来自实际安装的 `dist/sdk-client.d.ts`、`types-chunks/client-contract-DYkkBxuz.d.ts`、`sdk-runtime.d.ts`。方法逐项与删改项的证据另见[SDK 审计](kodax-0.7.97-alpha.1-sdk-contract-audit.md)。

## 4. 必须特别处理的语义变化

### 4.1 operationId 不能机械改名成 inputId

旧 operation envelope 覆盖了发送、compact、退出、凭据请求等，已被删除。新 inputId 只表达一份输入的领域身份；同一 inputId 换正文或附件应冲突；多份输入可能合批成一个 Run。命令、compact、memory 等响应丢失不能透明重放。Host 重启后查不到旧输入，也不能推断从未执行。依据：[SDK_MIGRATION §3、§7](https://github.com/icetomoyo/KodaX/blob/v0.7.97-alpha.1/docs/SDK_MIGRATION.md)；新版 `ClientSubmitInput/ClientInputAcceptance`；Space `runtime-host-adapter.ts:5792–5809,6325–6345`。

建议迁移：客户端草稿保留原 inputId 和完整 intent；提交结果未知时只查原输入，已知 Run 时只查/等待原 Run；区分 `submitted/queued/withdrawn/dropped`。不可自动生成新 ID 重发。queued 的 display preview 不适合取回编辑器，必须使用 `withdraw` 返回的完整内容。UI 的待发送泡泡用输入接受事实与 Host 显示身份协调，不再根据 origin.operationId 退休。合批时不能要求一个 canonical user item 对应一个 inputId；逐份查询 input acceptance，再使用 Host 给出的 Run/显示关系，避免遗漏合批的其他待发送泡泡。

### 4.2 after_turn 与 Stop 不再等价于“任务结束后发送并清空队列”

新 `after_turn` 可以在当前 Run 下一次模型请求前消费，并不保证等整个任务终态。`steer` 和 `redirect` 必须给出目标 Run；输入还未消费不代表它能按旧队列方式撤回。Session Stop 保留固定 Run frontier，但尚未消费的产品输入不能当作排队 Run 擅自删除。依据：[Client contract：输入与 Session Stop](https://github.com/icetomoyo/KodaX/blob/v0.7.97-alpha.1/docs/CLIENT_CONTRACT.md#显式工具执行与-session-stopfeature_299-合入)，[迁移指南 §3](https://github.com/icetomoyo/KodaX/blob/v0.7.97-alpha.1/docs/SDK_MIGRATION.md)。

这是用户可感知的产品行为差异。建议明确更新 Space 的队列按钮含义；不要保留“等待整个任务结束”的旧标签却调用新 after_turn。如果 Space 必须保留严格任务后发送，需要先让 Host 明确支持该语义，不能再由 main 的本地执行队列偷偷补齐。

新版 Product queue 当前上限 5 项、显示预览 72 字符，而 Space 本地队列上限是 10；pending input facts 在 Host 内存中，不承诺持久恢复所有未消费队列。队列容量、全文取回和重启后的未知状态都要更新 UI 与验收，不能从删除旧 event journal 推导出“队列也有 durable exactly-once”。依据：Space `ipc/queue.ts:73–74`；新版 `src/session-input-queue.ts:28–40,178–207`，迁移指南 §3；独立 SDK 审计 §4。

### 4.3 view 是完整替换，不是可以反复转成 delta 的新事件流

新 `observe` 先给完整当前 view，再给 replacement；`view.items` 有界，较早正文由 history/full-content API 回源。`item.id` 是显示项身份，`outputId` 是生成消息身份，不能当作唯一 block ID；正文、draft→committed、replacement revision 都有明确事实。依据：新版 `ClientSessionView/ClientViewItem/ClientItemContent`；[SDK_MIGRATION §4](https://github.com/icetomoyo/KodaX/blob/v0.7.97-alpha.1/docs/SDK_MIGRATION.md)。

建议 Coder store 直接接收当前 view 与独立 history window，再转换为既有气泡/卡片 render model。不要每次 view 刷新都生成一串 text_delta/tool_start 再塞入旧永久事件缓存，这会重新制造重复、排序和退休问题。异步 callback 以 Session + 本地 connection generation 拦迟到结果；本地 UI 版本只用于 IPC 顺序，不能冒充 SDK journalEpoch 或跨重启游标。

### 4.4 terminal 与 transport failure 必须分开

`runs.stop` accepted 只证明 durable Stop 请求建立；真正终态由 Run terminal/outcome 提供，`effectOutcome` 可为 unknown。健康连接也可能返回 Run `phase:'unknown'`。观察 `interrupted/closed` 是连接/订阅事实，不等于任务失败或完成。依据：新版 `ClientRunStopReceipt/ClientRunTerminal/ClientRunOutcome/ClientObservationStatus`，实测 `productProbe.terminal`。

建议保留“运行结果未知”的呈现和恢复入口；不得因 socket 重连、stop accepted 或最后已出现回答文本而强制显示 complete/idle。多个 Client 的独立观察不能互相覆盖，也不能因本地没有启动记录而忽略另一个 Client 的活跃任务。

## 5. 新 SDK 对 Space 的接缝缺口

以下“缺口”指当前公开契约无法等价承接 Space 现有行为，**不等于 KodaX 内核没有该能力**。应先补可信 Host 接缝，再迁产品入口；不要在 UI 私读 Session 文件或扩大全局权限来填洞。

### G1. Space keychain → Product action 的凭据绑定：P0，已确认

Space 现在给 Run/compact/queued input 注册 scoped credential lease，精确验证 Session、Provider、操作/Run 与使用目的。低层 `credentials.registerScoped/resumeScoped` 仍存在，但 `/client` 的 `inputs.submit`、`runs.startTool`、commands/review/workflow 不公开相应 credential binding。`inputs.submit` 直接进入 acceptInput，lease 注册并不会自动绑定给这个 Product action。依据：Space `runtime-host-adapter.ts:5924–6029`、`providers/runtime-credential-broker.ts:16–34`；新版 `client-runtime-adapter.ts:134–145`；[SDK 审计](kodax-0.7.97-alpha.1-sdk-contract-audit.md)。

建议上游提供可信 principal/Session 到 prepared action 的凭据授权接缝，覆盖 primary、fallback、classifier、sidecar、compaction、workflow，以及队列消费和派生 Actor。复用现有 broker 领域，不把 secret 放入 Renderer、明文 config 或普通输入 DTO。

**仅再连一个 `/runtime` 并注册 lease 不能解决这件事。**若短期过渡使用低层 start，必须明确尚未完成业务迁移，且修改旧 operation 授权；目前 `target.operationId` 已不再存在，原 broker 可能拒绝本来合法的请求。

### G2. Space Artifact / Office / space_control 工具绑定：P0，已确认

Space 通过 Host Tool lease 把 UI 主进程实现绑定给具体 Run，防止 Partner 或其他客户端越界。新版低层 register/resume 保留，但 Product submit DTO 没有 hostTools binding；当前 Space 在 runs.start 上附加 lease 的路径无法机械搬到 inputs.submit。依据：Space `runtime/space-host-tools.ts:97–157`、`runtime-host-adapter.ts:5808–5811`；新版 `ClientSubmitInput`、`client-runtime-adapter.ts:134–145`；[SDK 审计](kodax-0.7.97-alpha.1-sdk-contract-audit.md)。

建议沿 G1 同一 prepared-action 可信绑定边界传递现有 Host Tool lease，验证 reconnect、队列、child/workflow 继承、Space 断连和 non-idempotent 工具未知结果。不要把 Space 工具全局暴露给所有共享 Client，也不要另建 private Coder execution owner。

### G3. Space 的可信运行策略和上下文注入：P0/P1，已确认接入面不足

Coder 当前传入 Shell/profile PATH、selfManual、workflowHostPolicy、workflow storage/policy、promptOverlay、skillsPrompt 和明确 Skill invocation；Partner 还具有 sources、evidence overlay、白名单和 connector scopes。Product input 只带 text/artifacts/delivery/identity，Session settings/config 是有限字段集合，不能承接任意现有 options/context。依据：Space `real-session.ts:1388–1420,2514–2557,2644–2730`；新版 `ClientSubmitInput/ClientSessionSettings/ClientConfig/ClientWorkflowStartInput`。

建议逐项归属：Skill/command expansion 交给 Host；普通用户输入保持原文；手册、Shell、license/工具策略、工作流策略等可信宿主输入进入明确 Host profile/bootstrap/extension 接缝。只补 Space 确有需求的字段或接口，不开放泛化任意 options override。Partner 单独接入和验证，不通过 surface 字符串推断策略已成立。

### G4. 完整退出、崩溃恢复和 inline rollback：P0，删除已确认，替代等价性未证实

旧 `settleKodaXRuntimeExit`、rollback 协议和 Worker-hosted embedded 路径已移除；普通 Client 只有 `host.shutdown()` 和 disconnect。低层 owner fence、daemon.inspect、shutdown verifier 仍保留，属于可复用材料，尚不能证明旧 Windows durable exit/ACL recovery/强制退出体验可直接恢复。依据：Space `main.ts:1593–1868,2214–2222`、`runtime-host-adapter.ts:6842–7091`；新版 `RuntimeDaemonManagementService`；[SDK_MIGRATION §7](https://github.com/icetomoyo/KodaX/blob/v0.7.97-alpha.1/docs/SDK_MIGRATION.md)。

建议与上游先确定新的退出承诺：Space 普通退出是否只 disconnect；用户选择完整关闭时怎样识别本客户端工作、保留其他客户端、验证精确 owner 退出、恢复崩溃后的副作用状态。已有 tray/Ask/Force close UI 可以保留，但不能继续显示由已删除协议支撑的成功保证。idle smoke 的 shutdown succeeded 只覆盖正常路径。

### G5. 历史 turn 边界、fork/retry/rewind 和 partial 提示：P0，已确认

底层 history 有 `sourceRevision/status/issues/entries`；`projectConversationHistoryPage` 返回的 Product DTO 只有 `items/revision/nextCursor/oversized`，显示 ID 也没有公开 canonical mutation boundary。`forkSession` 却仍接受 `{entryId,sourceRevision}`。`readLineage` 可以支持明确 lineage selector，但不能普遍解决压缩/managed 历史中用户选定 turn 的 canonical 边界。依据：Space `ipc/session.ts:344–405,1948–1996`、`runtime-host-adapter.ts:3700–3715`；新版 [client-history.ts:59](https://github.com/icetomoyo/KodaX/blob/v0.7.97-alpha.1/src/client-history.ts#L59)、[ClientSessionForkInput](https://github.com/icetomoyo/KodaX/blob/v0.7.97-alpha.1/packages/coding/src/client-contract.ts#L432)。

建议 Host 返回可直接消费的历史质量事实，以及可用于 fork/rewind 的 opaque turn boundary，或提供接受公开 item identity 的原子边界解析/操作。复用已有 canonical authority。Space 不解析内部 item ID、不把 page.revision 当 sourceRevision、不根据文本/时间推断 turn 结束。原 partial/compaction_history_truncated 提示必须保留，不能在新 DTO 中变成“完整历史”。

### G6. 上下文组成、请求级统计、累计 Session usage：P1，已确认 DTO 缩减

Space 的底栏分别展示根上下文压力、六分组成和累计 Session token，物理请求统计还去重 retry/fallback/child/compaction 等。Product Client 有 capacity/trigger、parentContextTokens 和 activity.usage，但没有等价的 tokenBreakdown、request identity ledger 和 Session 累计事实。依据：Space `space-ipc-schema/src/channels/session.ts:938–960,1260–1310`、`runtime-host-adapter.ts:1106–1240`；新版 `ClientContextBudget/ClientSessionActivity`；[SDK 审计](kodax-0.7.97-alpha.1-sdk-contract-audit.md)。

可以让单独的可信诊断 adapter 暂时消费保留的 Runtime 事件；若作为跨 Client 的正式产品指标，应由 Host 输出稳定公开统计 DTO。不能把一个 activity.usage 当累计账本，不能由 UI char count 重新估算并冒充 Provider usage。丰富 failure/retry/effort 诊断也要做字段级保真核对，不能只保留一段错误字符串。

### G7. 周边管理能力不是一对一映射：P1，需逐项定界

Product catalog/config 不等于旧 SDK 的全部 custom provider CRUD、MCP 生命周期、Skill 安装/编辑、workflows 保存/导出/保留策略和 Session promotion。例如临时 Session 支持 `temporary:true`，但 Space Quick Ask promote 现依赖 retag；新版 create 可给 tag，不代表现有 Session 任意 metadata mutation 都有公开入口。Session title 当前是 Space 自己的 title store，迁移时应明确仍为本地显示别名，还是需要 Host rename 的跨客户端承诺。依据：Space `host.ts:765,904–917`、`session-store.ts:792–803`、`ipc/provider.ts:351–484`、`workflow-controller.ts`；新版 `KodaXProductClient` 全部方法表。

建议将“产品业务修改”和“Space 本地 UI 管理”分别列验收项，能合法保留的本地管理保留；涉及共享 Session/执行配置的 mutation 必须有 Host authority。不要据“SDK 里还能找到函数”就认为 UI 可绕过 Client 执行它。

### G8. 历史附件与逐工具 Sandbox 事实：P1，已确认 DTO 覆盖不足

Space 历史 user item 有结构化 attachments，聊天气泡恢复后仍显示图片。Product input 支持 artifacts，但 `ClientViewItem/ClientItemContent/ClientHistoryPage` 没有等价的结构化附件或 Artifact provenance 字段，不能仅凭支持输入附件就宣称历史恢复也完整。依据：Space `space-ipc-schema/src/channels/session.ts:700–707`、`ipc/session.ts:2216–2257`、`renderer/src/features/session/messages/bubbles.tsx:392–419`；新版 Client DTO；独立 SDK 审计 §8.3。

同样，Product tool DTO 有 status/input/progress/time，却没有原 Runtime `tool.sandbox` 的 backend/fallback/policy observations。若保持这些工具卡片事实，应补窄公开数据或由可信诊断层消费现有事件；不能用 permissionMode 代替执行隔离证明。依据：新版 Client tool DTO、保留的 Runtime `tool.sandbox` event；独立 SDK 审计 §5、§6。以上是公开数据覆盖检查，尚未实测所有真实历史附件丢失或 sandbox UI 回归。

## 6. 建议的迁移架构与顺序

目标结构（建议，不是已实现）：

```text
Renderer / 既有 UI
  → Electron IPC + 小型呈现适配
    → KodaXProductClient：Session / Input / Run / Interaction / History / 领域管理
      → 单一共享 Coder Host：准备动作、执行、规范持久化、权威视图

Electron 可信 Host adapter
  → /runtime：启动、身份、凭据 broker、Host Tools、退出验证、必要诊断
  → 通过明确的可信绑定接缝作用于同一个 Coder Host

Partner
  → 保留独立 inline namespace、工具/来源/证据策略；单独完成新版 SDK 回归
```

这与上游产品/Host 接缝区分一致。**架构分层不自动补齐 G1/G2/G3/G5；不能把双连接当作缺口已经解决。**建议使用最少的聚焦函数实现新适配，逐域替换旧逻辑；不在 7,500 行旧 adapter 上继续堆大量版本分支，也不先造通用万能 SDK facade。依据：上游迁移指南 §1、Space 当前 adapter 与上述实测。

### 阶段 0：先关闭阻塞性的契约决策

1. 上游明确并实现 Product prepared action 的可信 credential/Host Tool binding，涵盖 queued/steer/redirect/command/Skill/review/workflow/compaction。
2. 明确 Space host profile 的必要 policy/context 注入；明确旧完整退出功能的新承诺。
3. 给 history 补质量状态与公开 mutation boundary，并明确结构化附件回源；确认 Quick Ask promotion、跨 Client rename 等是否属于本次迁移范围。
4. 将所有“缺口”和“设计上明确删除、需改变 UI 承诺”的能力区分开，形成最小契约清单。

完成标准：不用任意 cast、私读 Session 文件或重启后自动重发，就能实现上述操作。若需要临时低层 start + Client view 过渡，只把它视为过渡验证，不能标记纯 Product Client 迁移完成。

### 阶段 1：建立真实新包的最小 Coder 垂直切片

先测试再实现：ensure/connect + profile/data-root/identity → 创建或读取 Session → settings → 完整 view → 单条输入或显式工具 → acceptance/outcome → typed interaction → disconnect。用真实 Registry 包、离线 Provider/显式工具和隔离数据；先让这条切片通过，再接 UI。复用本次烟测确认的行为，不能以旧 mocks 作为发布门禁。

完成标准：两个 Client 同时观察；断开其一不停止另一方；迟到 callback 不影响新 Session；启动/连接失败有可见状态；输入/终态/副作用事实彼此独立。

### 阶段 2：迁移 Coder 输入、队列、Stop、Skill 和 command

以稳定 inputId 替换 generic operation 工作流；把 Coder 本地执行队列和客户端 expansion 交回 Host；通过输入事实恢复 pending bubble；使用精确 Stop request 与 Run target。普通输入、显式 `!command`、Skill、extension command、review 和 workflow 应走同一 Host authority。

完成标准：同文不同 ID 不合并；同 ID 不同 intent 冲突；合批多个输入正确显示；withdraw 完整回填；掉线后查询原身份；steer/redirect 目标过期明确失败；Stop 不误取消 successor；剩余 queue 显示与 Host 一致。

### 阶段 3：迁移 view/history/store/IPC

增加纯数据 view 呈现入口，保留独立 history window；依次替换 Coder raw-event/journal reducer、replay 恢复、基于 operation origin 的 retirement 和旧 causal cursor。完整正文按 Host offset/revision 读取；turn fork/rewind/retry 使用阶段 0 提供的边界；保留 interrupted/draft evidence 和 partial 提示。

完成标准：replacement 不重复；draft→committed 不丢消息；相同正文不同输入均可见；150-item 窗口之外可回源；超长 text/thinking/tool input/result 全文可读；跨 compact 分页变化触发 resync；Session 切换与断连恢复不串台。

### 阶段 4：迁移领域管理与宿主专有能力

Workflow start 改为 Host declarative start；MCP Coder 连接由 Host 持有；Memory/Learning/Agent 管理保留领域 CAS；Provider CRUD/credential/effort/统计分别验收；Space Artifact/Office/control 工具验证 lease recovery；完整退出按新承诺实现。Partner 保独立，不混入 Coder 的改写。

完成标准：各 UI 能力达到明确的等价标准，或产品决定的差异已写入实际 UI/手册；不存在 Coder 第二套存储 writer/执行 owner/权限决策者。

### 阶段 5：发布级资格验证

恢复 `typecheck`、必要 lint、真实包 release/adapter tests，然后全量 test、coverage、build、package、packaged smoke 和 Windows/macOS/Linux 生命周期回归。更新 `scripts/build-main.mjs` 的 `/client` 动态 ESM 外置检查、dev-link export 清单和 packaged facade 校验；重审 `runtime-worker.js` 打包要求，因为旧 Worker Runtime 已被删除，其他 handler/semantic Worker 仍不能误删。

最后同步 README、内置 manual、HLD/DD 和新的 ADR/feature 设计；历史 release 记录保持历史属性。当前 ADR-003 的 in-process 默认是早期决策，不能直接作为新 Product Client 架构说明。依据：Space `scripts/build-main.mjs:77–95`、`scripts/link-kodax.mjs`、`scripts/smoke-pack.mjs:86–100,847–859`、`docs/ADR/ADR-003-kodax-integration-in-process.md`。

## 7. 验收必须覆盖的具体风险

| 情况                           | 必须验证的事实                                                              |
| ------------------------------ | --------------------------------------------------------------------------- |
| submit 成功但响应丢失          | 原 inputId 查回；不能自动新 ID 重发                                         |
| Host 在接收后崩溃              | unknown 与未接收分开；不承诺跨 Host exactly-once                            |
| 多 Client 改 settings/审批     | revision CAS / first-valid-answer；临时覆盖不覆盖他人新设置                 |
| Stop 同自然结束竞争            | accepted 与 terminal 分开；effectOutcome 不伪造                             |
| queue 多输入合批、撤回         | 每份 intent 可查询；原全文/附件不丢；同 Run 多 input 正确展示               |
| 跨窗口、超长内容、分页失效     | 全文 chunk/offset/revision 校验；旧页不拼到新 revision                      |
| interrupted assistant/tool     | Host 恢复 evidence 可见；不写成已完成 canonical 结果                        |
| credential/Host Tool 断连      | 精确 lease 与 Session/Run/Provider 授权；未知非幂等效果不重跑               |
| workflow/MCP/Skill热更新       | 在途 Run 保留贡献快照，新 Run 使用新配置                                    |
| 正常退出、强制退出、crash重启  | 保护其他 Client；精确 owner/cleanup 证据；无旧协议假成功                    |
| Partner sources/connector/权限 | 相同用户动作不获得 Coder Shell/Tools；inline persistence/extension 独立验证 |
| 实包/Node/Electron/ASAR        | ESM 正确；构造工具/semantic worker、native artifacts 仍可加载               |

此表是基于现有产品能力与新版公开契约制定的迁移验收建议，不是声称这些场景已全部通过。

## 8. 未证实与未解问题

- 不能从本次正常 Client smoke 推断真实模型、长会话、Host crash、Windows sandbox 强制退出、macOS/Linux 行为全部正常；这些尚未运行。
- 不能从两个 fixture 失败推断 Partner 生产持久化或所有 extension command 已损坏；当前只确认旧 fixture 与新 scoped/identity 契约不一致。
- KodaX 会选择怎样的可信 Product action binding、怎样替代旧完整退出承诺，需要上游契约决策；现有类型本身没有回答。
- Space 是否保留“整个任务结束后才发送”、Quick Ask promote、每 turn fork/retry、跨 Client shared title、六分上下文组成等原体验，需要明确产品决定。建议默认以保留现有行为为迁移验收目标，不静默降级。
- Coder inline rollback 是继续支持、改为受信 embedded owner，还是退出产品设置，需要明确；新版删除 Worker Runtime 不等于删除所有 inline 能力。
- Registry 文档仍有“包基线 0.7.96 / 开发树不表示已发布”措辞；CHANGELOG 的“Every v0.7.96 stable contract is retained”也不能解释为所有旧 SDK API 保持源兼容。实际包导出、迁移指南与实测共同证明删改。建议上游统一这些文档表述，避免其他消费者误判。

本报告的迁移架构、优先级和阶段是根据一手证据作出的工程建议；确定事实、推断和未验证场景已分别标明。后续开发应以这里的阻塞契约先行定界，再形成具体 spec/tickets，而不是直接开始全仓接口替换。
