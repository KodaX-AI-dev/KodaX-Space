# 上一轮 4 项统计问题是否已经修复？

> 发布后复验：本文绑定发布前工作树。四项统计修复现已通过实际 Registry `0.7.97-alpha.2` 的纯公开 SDK 入口再次验收，见[发布包审计](kodax-0.7.97-alpha.2-published-sdk-audit.md)及[发布版统计证据](kodax-0.7.97-alpha.2-statistics-evidence.json)。旧源码/构建包探针保留历史。

结论：**4/4 修复已通过独立正向复验；本次新增确认 finding 为 0。** 实测覆盖普通 ambient 根 Run 的原生子 Actor、实际 child reporter、公共 Product Client 并发重复 toolId、独立结果/恢复附件，以及 operation-only partial 与 native pending 的区分。此次没有重跑旧的 expectViolation 探针，也没有将历史问题继续当作当前 finding。

## 审计身份与运行证据

- HEAD 为 `ba30095a6a2da143a43776402813f24734d8c53a`；对象是当前 `git diff HEAD` 与 14 个 untracked 文件。[本轮 evidence snapshot](./kodax-space-sdk-seven-fixes-evidence.json) 的 `initialContentSha256=a18e95d44864efb4db98f9d50bb30d6f6a6e32a37dd97dbbca9980c7dde122b8`，含 47 tracked + 14 untracked。下列源码行均绑定此快照。
- 规范来自用户提供的 [SPACE_SDK_SEAMS.md:81](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:81)，尤其 [Actor/执行身份:95](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:95) 与 [operation coverage:97](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:97)。已重读 [KodaX AGENTS.md](C:/Works/GitProj/KodaX-AI/KodaX/AGENTS.md)。
- 新增独立正向 fixture：[seven-fixes-statistics-probes.mjs](./kodax-space-sdk-seven-fixes-statistics-probes.mjs)；本次实际运行结果：[statistics-probe-evidence.json](./kodax-space-sdk-seven-fixes-statistics-probe-evidence.json)。它使用当前源码、root 独立重建的 workspace 包、真实本地 daemon 与公共 Product Client；实际 Anthropic/OpenAI SDK 的 fetch 被离线响应替代，不联网、不调用云模型、不访问用户 Session。临时目录递归清理前校验绝对路径属于系统 temp 且具本 probe 的固定前缀。
- 审计于 Asia/Shanghai 2026-10-09 开始、2026-10-10 完成。root 随后独立重跑新 probe 亦通过，并再次确认 SDK 内容 hash 仍为 a18e…；相关验证归档见 [本轮总 evidence](./kodax-space-sdk-seven-fixes-evidence.json)。本报告没有复跑用户所述完整 977 测试套件。
- 重跑命令（KodaX 工作目录）：`node --import ./node_modules/tsx/dist/loader.mjs C:\Works\GitProj\KodaX-AI\KodaX-Space\docs\research\kodax-space-sdk-seven-fixes-statistics-probes.mjs`。全部正向断言通过；输出为普通子 Actor 原生请求 2 条、重复调用实际执行 2 次且 completed 2 条、custom partial、native pending complete。此报告没有构建或修改 KodaX。
- [旧审计](./kodax-space-sdk-statistics-audit.md)、[旧 probe](./kodax-space-sdk-statistics-probes.mjs)、[旧 evidence](./kodax-space-sdk-statistics-probe-evidence.json) 保留为历史，本轮结论以新证据为准。

## 逐项复验

### 1. 普通子 Actor 的请求、工具和预算归属：已修复

**原规范。** 请求须含实际 Run/Actor turn target；各根/子 context 须保留 target 与预算；普通 ambient 子 Actor 观测身份独立于 credential lease。见 [请求/预算:87](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:87)、[独立观测身份:95](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:95)。

**修复接线。** Actor dispatch 包在独立的 request-attribution scope 中，credential wrapper 优先取此执行身份；不再必须依赖 lease 才能观察 Actor。根/子 event wrapper 对显式 child context 保留其 turnId/deliveryId；child prepared/result 转发保留 meta。预算 target 判断同时接受 agentId，避免只有 agentId 的 child snapshot 落回根 Run。源码：[Actor dispatch:186](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/agent-runtime/actor-runtime.ts:186)、[独立 attribution:38](C:/Works/GitProj/KodaX-AI/KodaX/packages/llm/src/provider-request-observation.ts:38)、[credential wrapper:206](C:/Works/GitProj/KodaX-AI/KodaX/packages/llm/src/provider-credential-context.ts:206)、[tool child turn:176](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/agent-runtime/event-emitter.ts:176)、[budget child turn:200](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/agent-runtime/event-emitter.ts:200)、[child prepared meta:2506](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/child-executor.ts:2506)、[targetFromMeta:19210](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:19210)。

**实际结果。** 新 fixture 通过未配置 `authorizeExecution` 的公共 Client 提交普通 AMA 根输入，让真实模型执行通路调用 `spawn_agent`。子 Actor 的两条 OpenAI SDK 物理请求均归属 tree 读出的实际 actorPath/turnId，并带正确 parentRunId；子工具为同 target 的 completed/succeeded；预算同样保留实际 child turn 与 target。原始 child callbacks 经过根 wrapper 后也保持 child-turn。证据 JSON：`publicClient.ordinaryAmbientChild`、`rawChild`。因此上一轮无 lease 请求落根、工具 turn 被根覆盖、child budget target 落根三条路径均已复验。

首层独立 Actor 上一轮本来就通过，未列为旧问题；此次没有据旧 raw callback 的省略行为重新宣称其拆行。旧正向事实见 [历史 evidence 的 publicClientChildTools](./kodax-space-sdk-statistics-probe-evidence.json)。

### 2. 子工具实际 Sandbox observation：已修复

**原规范。** 保留实际 Sandbox observation 序列与真实原因/策略；空序列只表示 adapter 未报告。见 [工具与 Sandbox:90](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:90)、[按序转发:95](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:95)。

**修复接线。** `buildChildEvents` 新增 Sandbox callback，使用实际 child tool meta 向父转发；per-call reporter 的 observation 与该 invocation 的 executionId 一起流向 collector。源码：[child forwarding:2535](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/child-executor.ts:2535)、[per-call reporter:348](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/agent-runtime/tool-dispatch.ts:348)、[facts collector:19466](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:19466)。

**实际结果。** 新 fixture 的真实 `buildToolExecutionContext → executeToolCall` handler 确认 reporter 存在，实际调用它报告 `not_selected` 后报告带 reason/execution 的 `fallback`；raw parent 收到两条且顺序、child turn 正确。真实普通子 Actor 经 daemon/RPC 后，公共 `statistics.readTools` 读到完整同序列。证据 JSON：`rawChild.reporterPresent`、`rawChild.sandbox`、`publicClient.ordinaryAmbientChild.tools`。验证的是传递实际 adapter 事实，不从 permissionMode 推断 backend。

### 3. 并发重复 Provider toolId 的执行、结果与恢复附件：已修复

**原规范。** Provider toolId 是来源身份，每次 invocation 使用自己的 Host id；重复 id 不合并调用，executionId 贯穿 prepared/执行/结果/观察，结果与恢复附件分别关联。见 [工具事实:90](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:90)、[invocation identity:95](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:95)。

**修复接线。** dispatch 给 prepared call 和原 block 关联独立 executionId；同 batch 来源 id 重复时，result map 使用独立 resultKey。start/end/result/observation meta 带 executionId，Host collector 优先使用它。post-processing 的结果读取、guardrail 对应和恢复 outputPath 都按相同 resultKey；不再按重复 Provider id 再查“当前调用”。源码：[execution identity:721](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/agent-runtime/tool-dispatch.ts:721)、[tool meta:195](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/agent-runtime/tool-dispatch.ts:195)、[artifact remap:357](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/agent-runtime/tool-dispatch.ts:357)、[per-result lookup:860](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/agent-runtime/tool-dispatch.ts:860)、[artifact lookup:891](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/agent-runtime/tool-dispatch.ts:891)、[result event identity:970](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/agent-runtime/tool-dispatch.ts:970)、[Host identity:19218](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:19218)。

**实际结果。** 真实原生 SDK 在同 batch 返回两条同 `reused-provider-id` 的调用；两个 handler 分别实际执行 one/two，生成不同 outputPath，报告不同 Sandbox observation。公共 `readTools` 为两条不同 Host id，均 completed/succeeded；第一条仅 not_selected，第二条仅 fallback。公共 Run await 的 canonical tool_result 分别为 `result-one` / `result-two`，恢复路径分别为 `one-output.txt` / `two-output.txt`。不再出现第一条永久 prepared，也没有结果或恢复路径串线。证据 JSON：`publicClient.duplicates.executions`、`.facts`、`.canonicalResults`；公共 history 另保存于 `.history`。

### 4. operation-only 执行中的 partial 与 native pending：已修复

**原规范。** 不可观察内部 wire 的 custom/CLI 应明确 provider_operation/unknown 与 partial；原生 HTTP 暂态 pending 同 id 细化为 observed，不永久污染 coverage。见 [弱边界:93](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:93)、[质量区分:97](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:97)。

**修复接线。** Provider observation 公开 `wireObservation`；native compat 声明 physical boundary，进入实际 attempt 时将 provisional observation 标 pending，首 fetch 同 requestId 更新为 observed。statistics 对 started、provider_operation、非 pending 的记录计算 partial 与 issue，暂态质量不永久写坏原 complete。源码：[wire quality type:8](C:/Works/GitProj/KodaX-AI/KodaX/packages/llm/src/provider-request-observation.ts:8)、[native pending:59](C:/Works/GitProj/KodaX-AI/KodaX/packages/llm/src/provider-request-observation.ts:59)、[first fetch refinement:94](C:/Works/GitProj/KodaX-AI/KodaX/packages/llm/src/provider-request-observation.ts:94)、[operation unavailable:115](C:/Works/GitProj/KodaX-AI/KodaX/packages/llm/src/provider-request-observation.ts:115)、[Base attempt:933](C:/Works/GitProj/KodaX-AI/KodaX/packages/llm/src/providers/base.ts:933)、[OpenAI native:301](C:/Works/GitProj/KodaX-AI/KodaX/packages/llm/src/providers/openai.ts:301)、[Anthropic native:194](C:/Works/GitProj/KodaX-AI/KodaX/packages/llm/src/providers/anthropic.ts:194)、[live coverage:93](C:/Works/GitProj/KodaX-AI/KodaX/src/execution-facts.ts:93)。

**实际结果。** 用真实 Provider observer 包装一个仅等待 Promise 的 operation-only adapter，未完成时 read 已是 partial、operationCount=1、physicalRequestCount=0、issues 非空且 wireObservation=unavailable。实际原生 OpenAI compat adapter 在 buildClient 等待时尚无 fetch，读到 pending 与 complete；释放后真实 SDK 内部 503→200 retry 为两条独立 physical_attempt/observed，首条 ID 保持，终态 coverage 仍 complete、issues=[]，累计成功 usage total=12。真实 Anthropic SDK 的相同内部 retry 亦通过。证据 JSON：`adapterCoverage.customStarted`、`.customCompleted`、`.nativePending`、`sdkRetries`。不是用手填 native pending fact 替代实际 adapter 生命周期。

## 采集链与确认数量

公共 fixture 实际走过 Provider/工具执行 → facts 文件 → Runtime admission → `session.facts.*` RPC → Product Client `statistics` → 消费方断言，而非仅检查接口声明。权威读入口见 [Runtime statistics:5330](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:5330)、[daemon client:479](C:/Works/GitProj/KodaX-AI/KodaX/src/runtime-daemon/client.ts:479)、[Product projection:27](C:/Works/GitProj/KodaX-AI/KodaX/src/client-runtime-adapter.ts:27) 与 [typed tool DTO:417](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/client-contract.ts:417)。这些结论也绑定上述 [a18e snapshot](./kodax-space-sdk-seven-fixes-evidence.json)。

本轮 4 项状态均为已修复；残留确认 finding 0，新确认 finding 0，因此没有需要列出的新严重性或最小修复建议。该结论只覆盖此任务的四项统计修复，不代替父审计对其余三项退出/生命周期修复的结果。

## 未证实

- 没有对真正 ASRT/OS containment backend 跑隔离实验；证明的是实际 per-call reporter 与公共 facts 的传递、顺序和身份，不宣称任何 backend 的隔离成败。
- 新 fixture 验证恢复 outputPath 的独立关联，没有扩展为所有图片、Office/Artifact 字节内容与任意附件格式的检查。
- 没有重新模拟所有 SDK 异常流、cancel 后 late usage、Host 硬崩溃跨进程恢复或多层独立 Actor 后代组合；不能从这些未做的场景推断新 finding。
- 没有用用户的“7 项已修复”自述、旧 942 tests 或覆盖率数字代替上述运行证据。

## 未解问题

此次四项修复的验收范围内无新增未解问题。`contextRevision` 的进程内语义已由 [当前契约:95](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:95) 明确；异常/取消后仅保存 adapter 实际返回的归一化 usage、缺失值不猜算的边界已由 [契约:97](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:97) 明确，不据此提出额外需求。
