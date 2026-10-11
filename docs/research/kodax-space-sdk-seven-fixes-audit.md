# SDK 团队对上一轮七项问题的修复是否落实？

> 发布后复验：本文保留发布前工作树 `a18e95d4…` 的验收记录。修复现已发布为 Registry `0.7.97-alpha.2` 并安装到 Space；七项反例已通过纯公开发布包入口重新复验，见[发布包审计](kodax-0.7.97-alpha.2-published-sdk-audit.md)。下文“npm 未发布、安装包未更新”是当时状态；Space 生产接入迁移仍未实施。

主审计结论：**上一轮 7 项问题均已通过源码核对与独立正向复验，本轮未确认新的契约阻塞。** 三项退出反例重新走真实 detached/socket Host；四项统计反例重新走实际 Provider/工具执行、持久化、RPC 与公共 Product Client，详见[统计专项复验](kodax-space-sdk-seven-fixes-statistics-audit.md)。首轮关键回归出现一次 Windows 临时目录清理失败，退出文件单独重跑通过；这是单列的验证稳定性尾项，不能隐去首轮失败或写成全量回归一次全绿。SDK 源码未修改，npm 未发布，Space 安装包未更新。

## Standards

0 个发现（成文规范违反 0、可行动 smell 0）；轴内最严重：无。独立复核确认 AGENTS.md、CLAUDE.md、CONTRIBUTING.md、docs/CLAUDE.md 四份规范，携带 code-review 的 12 项 Fowler smell 基线；只读审核本轮退出保护、admission、compaction 清理、Actor 归属、工具身份/结果/附件及 wireObservation diff。此轴不借用 Spec 结论。

## Spec

F1、F2、F3 均已在源码关闭：principal 退出保护、after_turn/interrupt 最终 admission，以及 compaction 并行取消、有限等待、unknown 与同请求恢复已有实际控制路径。新增 finding 0 项，轴内最严重：无。独立 Spec 代理没有执行完整 977 项回归；下文保留其原规格、源码与新增断言的核对，主审计实际运行结果单列。

Standards 共 0 项，最严重项无；Spec 共 0 项，最严重项无。统计专项四项修复独立复验通过，新增 finding 0 项，不与两个评审轴混合计数。

## 主审计运行结果

审计于 Asia/Shanghai 2026-10-09 开始、2026-10-10 完成。全部命令、运行状态、日志索引与原始文件身份见[运行证据](kodax-space-sdk-seven-fixes-evidence.json)。

| 独立验证                    | 实际结果                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK 构建                    | build:packages、build:bundle、build:dts 均通过；重建 14 个 SDK 类型入口。未在本轮重建 native OS backend                                      |
| 源码及测试类型检查          | npm run typecheck 通过；strict Product Client consumer（skipLibCheck=false、types=[]）通过                                                   |
| 10 文件关键回归             | 共 214 项，首轮 213 通过、1 失败。失败位于 exit interrupt fence 测试的 finally rm，Windows 返回 ENOTEMPTY，而不是输出一个新的 admission 反例 |
| 退出文件定向复跑            | src/sdk-client.exit.test.ts 的 3 项全部通过；保留首轮及重跑日志，不将重跑冒充原命令全绿                                                      |
| 重建 SDK 的真实 daemon 测试 | 2 项通过：立即断连后保护空闲 peer，以及精确退出/替代 Host 保护                                                                               |
| 独立退出探针                | F1/F2/F3 全部通过，包含 unknown 的恢复与 sourceRevision 不被迟到 compaction 改写                                                             |
| 独立统计探针                | 四项均通过；研究代理运行后，主审计再次独立重跑通过                                                                                           |

独立退出探针：[可重跑脚本](kodax-space-sdk-seven-fixes-lifecycle-probes.mjs)、[原始结果](kodax-space-sdk-seven-fixes-lifecycle-evidence.json)。独立统计探针：[可重跑脚本](kodax-space-sdk-seven-fixes-statistics-probes.mjs)、[原始结果](kodax-space-sdk-seven-fixes-statistics-probe-evidence.json)。所有 Provider 为固定离线 fixture 或 localhost HTTP；仅创建隔离临时 profile，没有真实模型或用户 Session。

| 上一轮问题                    | 本轮独立观察                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 误停空闲 peer              | A 退出后立即 disconnect；离线回执 host=protected，B 仍能新建 Session                                                                                 |
| F2 已退出身份 continuation    | 相同身份重连 /runtime；after_turn 与 interrupt 均 conflict，foreign Run 仍正常完成                                                                   |
| F3 不合作 compaction 串行阻塞 | Own Run 被取消；receipt 为 unknown 且带 operationIds；释放 compaction 后历史 sourceRevision 未变，原 requestId 重试变 succeeded 并保留原 operationId |
| S1 普通 Actor 归属            | 真实普通 ambient 根 Run 的 native child，两次物理请求、工具与预算都指向实际 actorPath/turnId/parentRunId                                             |
| S2 child Sandbox 丢失         | 实际 reporter 的 not_selected、fallback 按原顺序到达同一子工具 fact                                                                                  |
| S3 并发重复来源 id            | 两次 handler 实际执行；两个独立 id 都 completed/succeeded，result-one/result-two 与 one-output/two-output 分别对应                                   |
| S4 运行中 custom coverage     | Operation-only 尚未完成时 partial/unavailable；native fetch 前为 pending，首 fetch 同 id 细化 observed，内部 retry 后 complete 未被永久污染          |

Windows 测试清理尾项：建议 SDK 团队给[该测试 finally:147](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-client.exit.test.ts:147) 的临时目录删除加与其他退出用例一致的 maxRetries/retryDelay，或等待明确的临时写入结算。此处没有修改 SDK，也没有将一次 ENOTEMPTY 直接推断为新的生产退出错误。该测试单独 3/3 重跑通过。

主审计前后内容 hash 都为 `a18e95d44864efb4db98f9d50bb30d6f6a6e32a37dd97dbbca9980c7dde122b8`。作者的完整 977 项关联回归与 scoped coverage 没有独立全量重跑；Space 的消费者迁移、发布包安装和打包验收尚未执行。

## 固定点、来源与工作树身份

- SDK 根目录：`C:/Works/GitProj/KodaX-AI/KodaX`，下文 `K:` 代表此目录。报告保存于 Space，SDK 只读，不发布、不调用真实模型、不读取真实用户 Session。
- 固定点与检查时 HEAD：`ba30095a6a2da143a43776402813f24734d8c53a`；无新增 commit。范围为 `git -c core.safecrlf=false diff HEAD` 的 47 个 tracked 文件，以及全部 14 个 untracked 文件，共 61 个文件。未修改的依赖源码仅用于追踪新控制路径。
- Spec 来源按序：HEAD message 是 Windows Job supervisor 修复，没有接缝 spec 引用；采用用户本轮明确指定的 `K:docs/SPACE_SDK_SEAMS.md`，并回到上一轮真实触发条件核对。文档“最终复核无残余”不作为实现证据。
- 根代理保存的完整内容身份：`a18e95d44864efb4db98f9d50bb30d6f6a6e32a37dd97dbbca9980c7dde122b8`；算法为 raw `git diff --binary HEAD` 字节，加排序后的 untracked 相对路径/NUL/原始字节。完整 61 文件 SHA-256 清单见 [本轮快照与运行证据](kodax-space-sdk-seven-fixes-evidence.json) 的 `fileHashes`。
- 本代理另直接对排序后的 `<原始文件字节SHA256>  <相对路径>` 清单取 SHA-256（UTF-8、LF、末尾 LF）：`f57dfc32502a0326f0c70d0fe1a678ba8d9d02eda3d5dbc0b45232aa321b5a36`。两种算法不同，不应要求两个 hash 相等。**以下每条 K:文件:行结论均绑定上述 HEAD 与本轮工作树身份**；关键源码字节 hash 列在文末。
- 保持历史报告 `kodax-space-sdk-seams-completion-audit.md` 和更早审计原样；本文件仅记录新的修复版本。

## Spec：F1 已关闭——退出后立即断连不再误停空闲 peer

**规格原文**：“其他客户端或受管工作仍占用 Host，退出请求被保护策略拒绝”；新增约束：“退出保护在 Host 的 draining 边界内按 principal 判断，只豁免退出方自己的连接；A 断连后仍在线的空闲 B 也会阻止 Host 退出”。来源：`K:docs/SPACE_SDK_SEAMS.md:68,77`。

**实际路径**：lifecycle driver 改为 `management.stop({principalId: current.clientId})`。management 先进入 draining，再进行 preflight；完整客户端退出额外检查任何 remaining logical client 的 principal 是否不同于退出方，存在则加入 connected_clients blocker。A 断开后只剩 B 也会 conflict，而不再依赖“连接数大于 1”的普通 shutdown 假设。draining 期间 attachClient 拒绝新连接，因此没有检查以后再 attach 的逃逸窗口。普通 stop 不传 principal 时保持原 blockers，不把完整客户端退出的新豁免扩大为通用 shutdown 行为。来源：`K:src/runtime-daemon/client-lifecycle.ts:106-115`；`K:src/runtime-daemon/management.ts:71-81,150-159,169-195`。

**新增回归的覆盖意图**：bundle test 创建不同身份 A/B，B 创建 idle Session，A requestExit(shutdownHost:true) 后立即 disconnect，离线等待并断言 A host.state=protected，随后断言 B 仍能创建 Session。它直接覆盖上一轮真实误停条件，且走真实构建产物；测试源码存在不代表 Spec 代理已经执行。来源：`K:tests/bundled-product-exit.test.mjs:21-46`。主审计实际运行已列于上方验证区。

**判断**：F1 源码已关闭；没有用作者自述或单客户端正常退出测试替代 idle-peer 条件。来源：上述 implementation 与 regression 源码。

## Spec：F2 已关闭——Runtime continuation 也受退出 fence 约束

**规格原文**：“已接受退出的身份不能在同一 Host 再接收新工作”；“after_turn 的新 Run 登记和 interrupt 的实际入队都需再次校验”。来源：`K:docs/SPACE_SDK_SEAMS.md:60,77`。

**入口补齐**：`run.input.submit` 纳入 lifecycle.ownedAdmission，与 Product input/run/workflow/Actor 一起登记和拒绝退出身份；dispatch case 在异步读取目标前检查，再向 after_turn/interrupt 的可信输入附 Host closure `assertAdmission`。closure 是 Host 构造的，不从 wire payload 取得。来源：`K:src/runtime-daemon/server.ts:728-733,1930-1936,1975-2002`。

**异步后的最终补齐**：Runtime.submitInput 在访问检查前调用 closure。after_turn 继续把同一 closure 传给 trusted start input；真正创建 record 前，在所有准备及 guardrail.prepare 之后再次调用。该低层 continuation 没有 Product canonical input save，最终检查与 Run 登记之间没有新增异步准备。interrupt 则在异步 access 之后、实际 enqueueWithArtifacts 之前再次检查。不能靠只在最外层检查一次来放行退出期间尚未登记的意图。来源：`K:src/sdk-runtime.ts:12423-12435,12455-12483,11629-11639,11923-11949`。

**新增回归的覆盖意图**：真实 Host 的退出场景以同 instanceId/instanceSecret 创建 `/runtime` 连接，分别对 foreign active Run 提交 after_turn 和 interrupt，两者都断言 conflict；原 foreign Run 仍能完成。另一个 test 在第一次可信 fence 检查后用微任务撤销许可，要求 interrupt 在入队前第二次检查且被拒绝，检查次数=2。来源：`K:src/sdk-client.exit.test.ts:97-105,113-147`。after_turn 最终检查的静态路径已核对，本代理没有单独执行其所有 prepare/race 矩阵。

**判断**：F2 源码已关闭；原同身份 Runtime reconnect 绕过和 interrupt 异步边界都已有实际控制点。来源：上述 implementation 与 regression 源码。

## Spec：F3 已关闭——不合作 compaction 不再阻塞其他取消

**规格原文**：“取消只作用于本客户端的排队输入、Run、独立 Actor 子树、显式 compaction 与 SDK 托管的 Memory 后台工作”；“有限结算等待后保留 operationIds 和 unknown，之后可重查、重试”；“未证明 executor 结束时不填成功，也不强迫任意进程内 custom adapter 退出”。来源：`K:docs/SPACE_SDK_SEAMS.md:67,73,77`。

**并发启动和有限等待**：Runtime cleanup 先向自己的 Memory 与 compaction controllers 发 abort，再用 Promise.all 同时启动 runService.cleanupClientWork 和 bounded settlement。`settleClientWork` 对 pending promises 最多等待 1 秒并使用 Promise.allSettled 观察结果，不会因 custom Provider 永不返回而阻塞其他 Run 开始取消。Memory/compaction 实际未结算时，保留 operationIds 并返回 unknown/issues。来源：`K:src/sdk-runtime.ts:5478-5490`；`K:src/runtime-client-work.ts:12-19`。

**Run 与 admission 的对应边界**：本客户端 active Run 的取消改为并发启动，并有限等待 run.result；不合作执行器记录 executor remains unconfirmed。Actor 和 Shell 的既有保守证据继续参与最终 unknown。lifecycle 在首轮 cleanup 后，也用 bounded wait 等待已接受 admissions，再执行最终 cleanup；若仍有未完成 admitted operation，不填 succeeded。它合并旧/首轮/最终的 operationIds、runIds、actorTurns，因此按同 requestId 重新提交时不会丢失先前捕获的身份。来源：`K:src/sdk-runtime.ts:12711-12763`；`K:src/runtime-daemon/client-lifecycle.ts:92-103`；idempotent 重试 `K:src/runtime-daemon/client-lifecycle.ts:132-150`。

**不误停其他客户端与恢复**：所有 snapshot 仍按 origin principal 过滤；queue withdrawal、Actor turn preservation、foreign queue drain 保持既有客户端归属。compaction 在 finalization 才删除 control/resolve，unknown 时 operation identity 仍可保留；迟到 Provider 结果经过 abort 检查，不提交新的 compaction。原 owner 不匹配时，exit driver 只记录旧请求 unknown，不调用替代 Host cleanup/stop。来源：`K:src/sdk-runtime.ts:5481,12713-12717,12750-12763,9203-9208`；`K:packages/repl/src/session/compact-session.ts:126,142`；`K:src/runtime-daemon/client-lifecycle.ts:87-91`。这些限制不意味着可以把 unknown 替换为 success。

**新增回归的覆盖意图**：离线 custom Provider 对 compaction 不响应 abort，对普通 own Run 响应 abort；退出后要求 own Run 不再 running，receipt 在有限时间内为 unknown、带 1 个 operationId，并列入 listPendingExits。释放 compaction 后验证 sourceRevision 未变化，再用原 requestId 重试并等待 succeeded。这覆盖了上一轮“先卡 compaction，其他工作尚未取消”的反例及后续恢复。来源：`K:src/sdk-client.exit.test.ts:150-205`。

**判断**：F3 源码已关闭；没有用强行完成不合作 custom Provider 的假成功替代独立取消和 unknown 恢复。来源：上述 implementation 与 regression 源码。

## 限制与未证实

- Spec 代理没有运行真实模型、用户 Session 或全部测试。作者所述 97 文件/977 测试和 scoped coverage 没有由主审计独立全量复跑；不能由 spec 自证。主审计已完成上方所列三个独立 probe、关键回归、SDK 构建、类型消费者和 bundle daemon exit。来源：`K:docs/SPACE_SDK_SEAMS.md:135-139`；[本轮证据](kodax-space-sdk-seven-fixes-evidence.json) 的 verification 字段。
- 新增测试只读确认了断言与触发条件；根代理运行日志应另列实际结果。尤其 after_turn 的全部异步 prepare/race、Shell/external executor 的平台矩阵，并未由本代理独立逐一复跑。静态 closure 检查证据见 F2/F3。
- 主动 custom/CLI adapter 若不响应 abort，其物理终态仍可 unknown；这符合规格边界，不构成允许其他本客户端已知工作继续执行或允许填造 succeeded。来源：`K:docs/SPACE_SDK_SEAMS.md:67,77,93`；`K:src/runtime-client-work.ts:12-19`。
- Space 自有窗口、IPC、Office/Artifact 等资源退出与旧用户流程映射仍需消费者迁移验收；本轮没有变更安装包或发布 SDK。SDK receipt 的细分状态不能代替 Space 对自有资源的责任。来源：`K:docs/SPACE_SDK_SEAMS.md:75,139`；用户本轮范围要求。
- 本轴没有对七项之外重新扩大全仓评审，也没有将统计轴或 Standards 轴的结论混入 Spec finding 数量。

## 未解问题

原 F1/F2/F3 的主审计实测已在上方补齐，均通过；四项统计正向复验亦通过。本轮七项修复范围内没有新增契约未解问题。测试临时目录清理稳定性尾项与 Space 消费者迁移分别保留，未执行的任意场景不推定为缺陷。

## Spec 汇总

F1：源码已关闭；F2：源码已关闭；F3：源码已关闭。**Spec 新 finding：0 项；最严重项：无。** “七项整体完成”和实际发布/安装状态应由主审计汇总其他独立轴与运行证据后判定。

## 关键源码字节 hash

```text
db17b3fb6e630e115f7d8caa6d55fe00fd208737b1168270d68e1c107032be94  docs/SPACE_SDK_SEAMS.md
a788b3e2cad9cbc8ce056d4f6769fbd6daa545fe9bfabaf648bea952872be02e  src/runtime-client-work.ts
63509da8048fedda09c622715d21fc76890119444e23a95478bd88507824eb13  src/runtime-daemon/client-lifecycle.ts
3e6e47f8fe9b97cada9b16dec3d7bd513020ab16b182d695d537c1cfe2da918c  src/runtime-daemon/management.ts
306b08b6b5d89221d652c8086a281e3400e6122a348d6c26f5c371753fff487c  src/runtime-daemon/server.ts
d4cf48bffa326e8440c322b9a3be8f4994ae229247d200571e15d714da7a47b8  src/sdk-client.exit.test.ts
64fe8521d9aa8fd48f24804c94e150b19165b0ff7e757eb2dbce7c099ebedf05  src/sdk-runtime.ts
1abf3b30bf8df7f0e8e6e85f61830db66f10a505597cea09fa73f3aafcfb021d  tests/bundled-product-exit.test.mjs
```
