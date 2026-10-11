# 新一轮 Space SDK 接缝是否完成退出与独立 Actor 的保护边界？

> 后续复验：本文绑定旧工作树 `5c7c21bb…`，保留当时 7 项缺陷的历史记录。SDK 随后修复了这 7 项；新工作树 `a18e95d4…` 的源码及独立正向复验见[七项修复审计](kodax-space-sdk-seven-fixes-audit.md)。不要把下文旧 finding 当作当前仍未修复的问题。

> 主审计补充：本轮 API 已覆盖新增的 lifecycle、独立 Actor 授权和 statistics 接缝，但仍确认 7 项实现问题。本文保留独立 Spec 轴的 3 项 lifecycle finding（P1 两项、P2 一项）；统计专项 4 项（P1 一项、P2 三项）及正向验证单独见[统计专项审计](kodax-space-sdk-statistics-audit.md)。独立 Standards 轴为 0 个可行动发现，两轴结论分别保留。所有运行范围、工作树身份和日志索引见[本轮独立运行证据](kodax-space-sdk-seams-completion-evidence.json)。

## Standards

0 个可行动发现，最严重项无。本轮 lifecycle、独立 Actor 授权、统计事实、Provider observation 及相关测试和文档 diff，未发现具有实际影响的成文规范违反或 Fowler smell。规范来源为 KodaX 的 AGENTS.md、CLAUDE.md、CONTRIBUTING.md、docs/CLAUDE.md，以及 code-review 的 12 项 smell 基线。只读静态评审，不借用 Spec 轴结论。

## Spec

- P1 F1：[client-lifecycle.ts:106](C:/Works/GitProj/KodaX-AI/KodaX/src/runtime-daemon/client-lifecycle.ts:106) 在退出方断连后误停另一客户端仍连接的空闲 Host。按 principal 只豁免真正的退出调用者，补双客户端真实 Host 回归。
- P1 F2：[server.ts:729](C:/Works/GitProj/KodaX-AI/KodaX/src/runtime-daemon/server.ts:729) 遗漏 run.input.submit；已退出身份仍可创建 continuation Run。纳入 admission fence，并在实际登记前复查。
- P2 F3：[sdk-runtime.ts:5486](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:5486) 无界等待不合作 compaction，拖住其他本客户端取消。并行触发取消、有限等待，保存未确认目标与 unknown。

Spec 共 3 项，最严重为 F1；Standards 共 0 项，最严重项无。需求原文、具体证据和范围详见以下独立 Spec 报告；统计研究结果单独保留。

结论：本轮独立 Spec 轴确认 **3 个可行动问题（P1 两项、P2 一项）**：退出后立即断连可能关闭另一客户端仍连接的空闲 Host；已经完成退出的客户端身份仍可通过 Runtime continuation 接收并完成新 Run；不合作 compaction 阻止本客户端其他工作开始取消。前两项在工作树构建的 SDK 与真实 detached Host 上复现，第三项在源码 SDK 与真实 socket Host 上复现；不能因正常路径回归通过或接缝文档自述“已修复”而视为完成。独立 Actor 授权、客户端工作归属、持久化退出回执和精确 owner 退出验证已有真实代码路径。

## 本轮身份与范围

- KodaX 目录为 `C:/Works/GitProj/KodaX-AI/KodaX`，下文 `K:` 代表该根目录；Space 目录为 `C:/Works/GitProj/KodaX-AI/KodaX-Space`，下文 `S:` 代表该根目录。
- 固定点及审计 HEAD：`ba30095a6a2da143a43776402813f24734d8c53a`，无新增 commit。范围为 `git diff HEAD` 的 43 个文件加 `git ls-files --others --exclude-standard` 的 13 个未跟踪文件，共 56 个文件。
- 本轮工作树清单 SHA-256：`c51db4d2b4976a89796a0d213989aa6cd3582ab8f35f9945c6563f27f19a8161`。算法与前一轮一致：所有 56 个路径排序，逐行 `<原始文件字节SHA256>  <仓库相对路径>`，UTF-8、LF、末尾 LF，再对清单取 SHA-256。**所有 K:文件:行结论绑定此固定点和此工作树身份；未修改依赖代码绑定固定点。** 关键文件的原始字节 hash 见文末。
- 按来源顺序核对：HEAD message 是 Windows Job supervisor 修复，不含接缝需求引用；本轮用户明确给出的 `K:docs/SPACE_SDK_SEAMS.md` 现已更新。同时以用户原始请求校准：完整退出/恢复保护其他客户端，区分 accepted/cleanup/exact-exit/unknown；独立 spawn/followup Main 授权保持 Actor/turn/Provider/purpose/tools 上限；累计统计和 contextBreakdown、物理 retry/fallback/compaction、Sandbox 事实。没有把“可观察性 partial”解释为可以删掉已有 Space 功能。
- 只读 KodaX，不修改 SDK，不调用真实模型，不触碰真实用户 Session。只创建 Space 内报告与隔离复现脚本。前一轮 `kodax-space-sdk-seams-working-tree-audit.md` 保持历史，不改写其当时结论。
- 本代理重点审核 lifecycle、runtime-client-work、独立 Actor 授权及后代收窄；statistics 仅核对公开 contract 接通，细节由主审计的独立 primary-source 研究轴核对。本报告不借用该轴或 Standards 轴的源码结论。

## 确认 findings

### [P1] F1：断连后误把唯一外部客户端当成退出调用者

**需求原文**：“`host.state: protected`：其他客户端或受管工作仍占用 Host，退出请求被保护策略拒绝”；“断连后清理继续”。来源：`K:docs/SPACE_SDK_SEAMS.md:68,75`；用户要求“完整客户端退出/恢复保护其它客户端”。

**触发与影响**：两个不同身份的客户端 A/B 连接同一个 Host，B 已创建 Session 且保持连接、当前没有执行任务。A 提交 `requestExit({shutdownHost:true})` 后立即 disconnect。新的异步 exit driver 不具有连接调用者豁免语义，直接调用既有 `management.stop()`；既有 management 只在逻辑连接数大于 1 时阻止退出，隐含假设“唯一连接就是退出调用者”。A 断开后剩下的 1 个连接实际是 B，Host 被关闭，B 后续业务调用报 transport closed。A 的回执却返回 host.succeeded，掩盖了误停其他客户端。**这是新增 lifecycle 对旧 stop 语义的错误使用，不是在范围外挑既有 management 实现。** 来源：新增 `K:src/runtime-daemon/client-lifecycle.ts:104-113,144-148`；既有 `K:src/runtime-daemon/management.ts:311-323`。

**实测证据**：主审计用真实 built SDK/detached Host 首轮复现。A 退出并立即断连，800ms 后其离线 receipt 显示 cleanup=succeeded/host=succeeded；B 再创建 Session 失败，错误为 `Runtime daemon transport closed.`。来源：`S:scratch/kodax-exit-peer-probe.mjs:18-34`；`S:.tmp-kodax-seams-exit-peer-probe.log:6-11`。

**最小建议**：给完整客户端退出增加按 principal/连接身份的保护检查，只能豁免退出请求所属客户端仍存在的连接；当调用者已经 disconnect，任何剩余其他客户端都应返回 protected。该检查必须与 stop admission/draining 共享原子边界，避免检查后新客户端 attach。保留普通 `host.shutdown` 的既有语义，补“两客户端 + A requestExit 后立即 disconnect”的真实 Host 回归。

### [P1] F2：退出 admission 的名单遗漏 Runtime continuation

**需求原文**：“已接受退出的身份不能在同一 Host 再接收新工作”。来源：`K:docs/SPACE_SDK_SEAMS.md:60`；用户要求完整退出/恢复的工作保护。

**触发与影响**：A 已 requestExit(shutdownHost:false)，cleanup.state=succeeded，随后断连。同一 instanceId/instanceSecret 通过公开 `/runtime` 重连，对 B 的仍活动 Run 调用 `runs.submitInput({delivery:'after_turn'})`。新增 ownedAdmission 名单没有 `run.input.submit`，该 dispatch case 也不调用 lifecycle.assertAdmission；它仍附 A 的 origin，最终创建新 continuation Run。A 的“退出已完成”回执不变，但新 Run 正常完成，客户端 exit admission 已被绕过。不能用“产品入口已拒绝”替代 Host principal 级退出边界。来源：新增名单 `K:src/runtime-daemon/server.ts:729-733`；绕过入口 `K:src/runtime-daemon/server.ts:1930-2003`；Runtime 承接 `K:src/sdk-runtime.ts:12421-12478`；仅有 Product execution 时的最终 admission 检查 `K:src/sdk-runtime.ts:11630`。

**实测证据**：本代理从 Space 目录导入真实 dist；B 的 Provider 请求只进入本地 HTTP fixture。A 的退出 cleanup=succeeded 后，同一身份 Runtime reconnect 的 continuation 返回 accepted=true，释放 fixture 后新 Run phase=completed。来源：`S:scratch/kodax-exited-client-continuation-probe.mjs:48-65`；`S:.tmp-kodax-seams-continuation-probe.log:4-14`。没有真实模型请求或用户数据。

**最小建议**：将 `run.input.submit` 纳入同一客户端 admission fence，并在可能经过异步准备的 continuation 真正登记前重新校验 principal；interrupt 也不得允许已经退出的身份注入新意图。补同身份 Runtime reconnect 的 after_turn/interrupt 回归，并确认已登记、被取消的旧 continuation 仍可读取结果。

### [P2] F3：不合作 compaction 阻塞本客户端其他工作的取消

**需求原文**：“取消只作用于本客户端的排队输入、Run、独立 Actor 子树、显式 compaction 与 SDK 托管的 Memory 后台工作”；“cleanup.state: unknown/failed：executor 或清理证据未确认……保留 issues 与目标身份，不推断成功”。来源：`K:docs/SPACE_SDK_SEAMS.md:67,73`。可观察性 partial 不构成取消其他已知本客户端工作的豁免。

**触发与影响**：同一客户端有一个可响应 abort 的 busy Run，同时另一 Session 的显式 compaction 进入不响应 signal 的 custom Provider。退出清理先 abort compaction，然后无界等待所有 compaction `control.settled`；直到这一步结束，才会撤队列和启动 Run/Actor cleanup。不合作的一个 Provider 因此使可正常取消的其他工作继续执行，回执长期 pending 且没有保存已捕获的 operationIds/目标列表。这里只应让“不合作 compaction 自身的终态”保持 unknown，不应阻塞其他确定取消。来源：新增 `K:src/sdk-runtime.ts:5476-5490`；control settled 由 compaction 结束才 resolve（`K:src/sdk-runtime.ts:9101-9105,9205-9208`）；Provider wrapper 仅传递 signal 后直接 await（`K:packages/llm/src/provider-credential-context.ts:194-207,216,255-257`；`K:packages/llm/src/provider-request-observation.ts:104-105`）。

**实测证据**：主审计以源码 SDK/真实 socket Host、两个离线 custom Provider fixture 行为复现。退出 1.5 秒后 receipt.cleanup=pending、runIds/operationIds 为空，正确监听 abort 的 own Run 仍 running；手动释放不合作 compaction 后，Run 才被取消，回执才带 operationId/runId 并变 succeeded。来源：`S:scratch/kodax-compaction-exit-probe.mjs:21-27,48-63`；`S:.tmp-kodax-seams-compaction-exit-probe.log:18-24,36-59,67-77`。

**最小建议**：先同时触发本客户端所有已知工作取消，再独立有限等待各类 settlement；及时持久化 operationIds/runIds/Actor targets。未确认 compaction 保持 unknown 和 issues，并允许后续按同 requestId 重试，不能用该单一 promise 堵住其他取消。补“不响应 abort 的 compaction + 可响应 abort 的 own Run/Actor”的回归。

## 已补齐的真实路径

1. **退出 API、身份和幂等回执。** `/client` 导出 lifecycle.requestExit/readExit/listPendingExits 与离线 readKodaXClientExits，连接要求 productExitControl:1；离线函数只读 profile 的 receipts 和 verifier，不连接或启动 Host。principal 由 instanceId/instanceSecret 哈希生成，receipt directory 再按 principal 哈希隔离；requestId 同意图重试，异意图 conflict，accepted 在异步清理前先落盘。来源：`K:src/sdk-client.ts:35-50,64-67`；`K:src/runtime-daemon/client-lifecycle.ts:13-36,130-150`；`K:src/runtime-daemon/schema.ts:97-99`；`K:packages/coding/src/client-contract.ts:395-398,447-473`；规范 `K:docs/SPACE_SDK_SEAMS.md:50-75`。F1/F2 使这条路径还不能整体宣称已完成。
2. **本客户端工作归属。** Product 即使没有 credential binding，也建立带 principalId 的 execution context；队列的批次与活动消费比较 principalId，退出只遍历自己的 queued fact、own Run origin 和独立 Actor turn owner。Memory work 按 origin 注册 abortController；显式 compaction 保存 principal/operationId/controller/settled。来源：`K:src/runtime-daemon/server.ts:2374-2400`；`K:src/session-input-queue.ts:145-153,171-175,210-221`；`K:src/sdk-runtime.ts:4799-4820,5476-5490,9101-9105,12707-12759`；规范 `K:docs/SPACE_SDK_SEAMS.md:73`。
3. **Actor interrupted 与执行器结束分开。** CodingActorSession 跟踪实际 executingTurns settled promise；quiesceClient 保留其他 owner 的 turns，先调用 controller.quiesce 持久化 interrupted，再有限等待自己的 executors，未结束 turnIds 回报 unsettled。根 Run 的 Actor cancellation 显式排除独立客户端 turn，避免停止根 Run 时把独立子树误停。来源：`K:packages/coding/src/agent-runtime/actor-runtime.ts:185-188,336-367`；既有 controller `K:packages/agent/src/actors/controller.ts:662-720`；`K:src/sdk-runtime.ts:9754-9787,12715-12721`；规范 `K:docs/SPACE_SDK_SEAMS.md:46,73`。
4. **真实 Shell 清理证据保留。** 独立 Actor 创建持久化 Run record；managed Shell identity 登记到 record，deferred 不删除该 identity，retry 验证后才 release。退出也检查终态 own Run 的 shellCleanups/effectDrain，以及旧持久化、由本客户端拥有的 Shell references；未确认时 cleanup.state=unknown，而不是把 Actor interrupted 当作进程结束。来源：`K:src/sdk-runtime.ts:5383-5387,5412-5435,12739-12759`；规范 `K:docs/SPACE_SDK_SEAMS.md:66-67,73`。
5. **原 owner 退出验证与替代 Host 保护。** lifecycle 旧 runtimeId 请求不调用新 owner 的 cleanup/management.stop；read 把失去 owner 的 pending cleanup 转为 unknown，并调用已有 exact shutdown verifier。verifier 要求原 owner durable succeeded outcome、原 PID generation 不活跃、Windows Job supervisor 不活跃；新 owner 存在时返回 replacement_running。新 hostCleanup 在 Host transport/runtime/ownership 清理后记录结果，EOF 本身不会成为 succeeded。来源：`K:src/runtime-daemon/client-lifecycle.ts:38-65,87-114,166-174`；`K:src/runtime-daemon/host.ts:195-273`；既有 `K:src/runtime-daemon/shutdown-verifier.ts:100-138,152-159`；规范 `K:docs/SPACE_SDK_SEAMS.md:69-75`。这证明退出结果的证据分类已接通，不抵消 F1 的退出对象选择错误。
6. **独立 Actor Main 授权与实际环境。** adapter 的 spawn/followup 各调用独立 Main callback；wire 携带 authorization，Host 为 Actor/turn credential 建 target。Runtime 用 Session settings/extension/Shell/admin execPolicy/autoReview 创建独立 Run 与环境，最终登记前再次 assertAdmission；不是借父 Run 的 options/credential。来源：`K:src/client-runtime-adapter.ts:215-227`；`K:src/runtime-daemon/client.ts:1313-1325,1339-1352`；`K:src/runtime-daemon/server.ts:1422-1451,1475-1504,3326-3355`；`K:src/sdk-runtime.ts:5374-5469`；规范 `K:docs/SPACE_SDK_SEAMS.md:44-46`。
7. **Provider 与 tools 后代上限。** scoped lease allowlist 与 admitted Actor Provider authority 都校验；native executor 显式 scope 或派生 scope 按 Actor providers 收窄。环境 tools 与 Actor tools 求交，实际 beforeTool hook 拒绝 toolCeiling 以外的工具，parent excludeTools 包含注册与 Run scoped tool；Host Tool runtime 自身也过滤 tools。后代继承已收窄环境，已有 child-executor 对 Run scoped definitions 的上限/只读/digest/repair 排除仍适用。来源：`K:src/runtime-daemon/server.ts:3326-3355,2404-2415`；`K:packages/coding/src/agent-runtime/actor-runtime.ts:129-147,163-183`；`K:src/sdk-runtime.ts:5406-5408,5448-5462,19880-19881`；`K:src/runtime-daemon/reverse-bridge.ts:687-696`；`K:packages/coding/src/child-executor.ts:440-477,941,1099,1165-1169`；规范 `K:docs/SPACE_SDK_SEAMS.md:44`。
8. **followup 与 External 限制。** 新 native followup 要新 scoped binding，已有活动 turn 的 credential 不能被替换；external 不能接 native credential、Host Tool runtime 或 tools ceiling，仍走既有 executor/credentialRef。来源：`K:packages/coding/src/agent-runtime/actor-runtime.ts:289-322`；`K:src/runtime-daemon/server.ts:1426-1432,3359-3378`；`K:src/sdk-runtime.ts:14524-14540`；规范 `K:docs/SPACE_SDK_SEAMS.md:46`。
9. **统计 contract 已接通但不自证统计正确性。** Product 暴露 statistics.read/readRequests/readTools，wire/Host 转至 executionFacts service 并保留 Session admission。类型有累计 usage、physicalRequestCount/operationCount、contexts tokenBreakdown 继承字段、request target/revision、tool sandbox sequence。细粒度持久化/去重/物理 retry 的正确性由独立统计轴核对，不能由 DTO 存在推断。来源：`K:packages/coding/src/client-contract.ts:400-445`；`K:src/runtime-daemon/client.ts:479-484`；`K:src/runtime-daemon/server.ts:1041-1051`；`K:src/sdk-runtime.ts:5327-5331`；规范 `K:docs/SPACE_SDK_SEAMS.md:79-91`。

## 限制与未证实

主审计独立执行了 7 个关键测试文件，**71 项全部通过**；真实 built SDK/detached Host 的正常退出与替代 Host 保护测试 **1 项通过**；源码/测试 typecheck 和 strict Product Client consumer typecheck 通过。命令与日志见[运行证据](kodax-space-sdk-seams-completion-evidence.json)。另行补测的 F1/F2/F3 都仍复现，正常回归通过不覆盖这些反例。没有独立重跑作者声明的完整 942 项测试与覆盖率，也没有在本轮重新执行全量 SDK build。

主审计的二进制 diff 加未跟踪文件内容 hash 在验证前后均为 `5c7c21bb01efb866188ebe8c842f2354f9f923c8a1714e863666e23f9c86b76b`，SDK 源码未变。此算法不同于本文 Spec 代理使用的逐文件清单 hash；两者都绑定同一个 HEAD 和工作树内容，详见运行证据。Space manifest/lock 也没有在本轮再更新，当前安装仍是最初 Registry alpha.1；本轮审计调用工作树源码或其现有 dist，尚未实施消费者迁移。

- 当前仍是工作树构建。规范“93 文件/942 测试”、scoped coverage 和全构建是作者声明，本代理没有独立复跑全套；主审计负责关键测试、typecheck 与正常 bundle exit 的实测。通过这些回归仍不覆盖上面的断连/idle-peer、Runtime continuation 和不合作 compaction 反例。来源：`K:docs/SPACE_SDK_SEAMS.md:131-133`；正常退出测试意图 `K:src/sdk-client.exit.test.ts:65-97`、`K:tests/bundled-product-exit.test.mjs:23-53`。
- inline Host、缺少精确 containment/PID identity 的平台，只承诺可观察清理事实，不承诺实际进程退出；不把 unknown 当成功。来源：`K:docs/SPACE_SDK_SEAMS.md:75`；`K:src/runtime-daemon/shutdown-verifier.ts:120-121,152-159`；`K:src/runtime-daemon/client-lifecycle.ts:62-65`。
- Space 的窗口、IPC、Office/Artifact 等自有资源退出由 Space 集成完成；本轮 SDK 审计没有实现或验收 Space 产品迁移。custom/CLI 内部 wire 不可观察可被明确标记 partial，但这不是取消旧 Space 统计、退出或恢复功能的授权。来源：`K:docs/SPACE_SDK_SEAMS.md:75,91`；本轮用户范围要求。
- 授权闭包不持久化，Host 重启后的执行必须重新授权；旧 Actor/Provider/Host Tool unknown effects 不自动重放。本文确认代码没有为旧 lifecycle 请求去停止替代 Host，但未遍历全部 crash/hardware/platform 矩阵。来源：`K:docs/SPACE_SDK_SEAMS.md:46,75`；`K:src/runtime-daemon/client-lifecycle.ts:87-114`。
- 本轮未查询 npm Registry，不据作者“未发布”自述作独立发布状态结论。来源：`K:docs/SPACE_SDK_SEAMS.md:3,129,133`。

## 未解问题

1. **与 Space 旧退出/恢复流程的完整映射。** 新 receipt 精确区分 accepted、cleanup、host 接受与 exact process outcome；Space 是否保存正确身份、重试 unknown/protected、对其自有 resources 保留同等保护，仍需下一步消费者迁移验收。SDK 文档的边界说明不能直接证明旧 Space 用户功能全部保留。来源：`K:docs/SPACE_SDK_SEAMS.md:60-75`；公开 DTO `K:packages/coding/src/client-contract.ts:447-473`；用户原始需求。
2. **不合作执行器的最终物理终态。** F3 已证明取消编排会阻塞其他工作，但不表示能够强迫任意 custom/CLI Provider 在进程内结束。修复应保留其 unknown、精确身份和后续恢复证据；没有证据时不能填 succeeded。来源：`K:docs/SPACE_SDK_SEAMS.md:67,71,75,91`；F3 的源码与 fixture 记录。

## Spec 汇总

Spec：**3 项（P1 两项、P2 一项）**。最严重项：F1 退出后立即断连误停其他客户端的 Host。F2 退出后的 Runtime continuation admission 绕过和 F3 compaction 串行阻塞均为确定缺陷。未解问题和平台可观察性限制未混入 finding 数量。

## 关键源码字节身份

以下文件 hash 为本轮 `c51db4d2...` 清单的一部分；完整清单覆盖 56 个改动/未跟踪文件。未修改的 management/shutdown-verifier/Actor controller 从固定点读取。

```text
6854237db0f4c8101d298900eb5d2be27c98ac9c322f04029c03943f78771b4a  docs/SPACE_SDK_SEAMS.md
b95419febcec3cde3f4b86497f65b7c35bb63adab12fa64ac07ea39e01099377  packages/coding/src/agent-runtime/actor-runtime.ts
15af2a6ddfb857293c68129c4e76f4a2c047d67d9f8d06d22b7bddf0b094b9c5  packages/coding/src/client-contract.ts
d79808cd4fd21ba2ec8d758a28fb7ac64118fb76a53eebb1ac65f070c4032358  packages/llm/src/provider-credential-context.ts
048ae64d881ebd9150fb65b5a74fddde13a0bb2d70ebafa72e43e7dd5f317f01  packages/llm/src/provider-request-observation.ts
36699d9a04f04e9e817f07491f04ad0b960c9b9ef7f632b405c62e235c9ae255  src/client-host-authorization.ts
518a1e81fb9d5bbbeac14c878a6a18874f9a39b121ecb31cfa72c6ad56a1e614  src/client-runtime-adapter.ts
47350df3f32b55072328f581f7d1cf7d5b2251e16c757169977c2b903aecaaea  src/product-execution-authorization.ts
fabb1d2dc5cc05264f07d7e4d4bc758971420aa19311b5e5cba26429bfd2c9ae  src/runtime-client-work.ts
f1bb36905425b5238698287f091f1c7e501466e57e732643ce1c407626db6f9a  src/runtime-daemon/client-lifecycle.ts
52340dacabee5fae8250c5b945beb8b9863381339d7393bb7b1006c05f664c7b  src/runtime-daemon/client.ts
342869e88c04e4ec0994e044365cc6c8393341dea83a2a88438439c7811b4696  src/runtime-daemon/host.ts
3f862a9aff11efea6931f68c2246d18173f06164320a348933a70ed3aec610ec  src/runtime-daemon/reverse-bridge.ts
4b2bf8a74953049aa449a82b5e9116eb5618ad26be94140a37860e9bda4ebe76  src/runtime-daemon/schema.ts
fba2c27382b228f04d5844cc04a5575d2f7eccedd6f4bbf70de6a5e8b73ec0d8  src/runtime-daemon/server.ts
0ea704ce6244df9dfba8a6f6b0d6aa4a623055c195952f37cbb435c332b9c6b1  src/sdk-client.ts
d9526d47dd2e99cd534c747b386df6b3d788de54559282b93fff2467c504ac10  src/sdk-runtime.ts
0f3342120971ffc85328356a0499d2c3cb641ef4abdd3d000686d2547206e343  src/session-input-queue.ts
```
