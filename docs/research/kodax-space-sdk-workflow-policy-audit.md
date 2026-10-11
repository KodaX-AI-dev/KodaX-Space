# SDK Workflow 策略补齐复核（2026-10-10）

结论：当前 SDK 工作树补齐符合已收窄的统一契约需求，未发现需要继续补接口的明确残余。可信 Main 只提供 maxAgents/tokenBudget；Product Host 负责执行、目录、输入身份与队列归属，并发复用已有配置。本次未修改 SDK 源码、发布 npm 或替换 Space 安装包。

## 固定点与范围

- SDK 基线 HEAD：`3f10b34a618999a6218d56a7e42ea48616bf88a2`（alpha.2）。审查该基线的 16 个已跟踪文件改动及新增 `src/sdk-client.workflow-policy.test.ts`。
- 工作树 patch SHA-256：`dc92d564d91ea57bf518b0d7f6e099be0f26b7a3c4aa1376138643b7081e122f`；新增测试 SHA-256：`b479bb86a36dc68d507d2c5a1338b0a9e503114d655496aabacb9068727f9019`。
- 需求依据：[SDK 接缝文档](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:48)、FEATURE_298 单一 Host 的执行/配置权威，以及用户确认的收窄范围。未要求恢复通用 Run options、旧 operation/journal 或客户端执行 owner。

## 接入结果

1. `RuntimeExecutionAuthorization.workflowHostPolicy` 只有 maxAgents/tokenBudget，两项均由 Main 回调返回。产品输入不能提交此策略；SDK 先清除伪造字段。Main 可只返回策略，Host 不要求凭空建立 credential/tool lease。
2. 策略进入 Host 执行上下文的身份比较，随队列捕获；不同策略/principal 隔离，同 inputId 不同策略冲突，steer 不替换已有 Run 权威。Skill/command/review 走同一 Host 准备路径，未新增第二份输入历史。
3. Product AMA 的既有显式 Workflow 意图能取得 run_workflow。目录由 Host profile/project 路径派生，Space 消费公开 runDir。普通输入不自动启动 Workflow；SA 采用显式 workflows.start。
4. Agent 名额在异步 spawn 前预留，创建成功后才计入 lifetime 数量，失败释放预留。已知零 output 保留为 0；SA 多响应与 repair 不完整用量不冒充完整 output，保留 totalTokens 兜底。预算耗尽拒绝新增工作，在途响应不承诺精确截断。
5. 新 authorizer 连接要求 `productExecutionAuthorization:2`。Space 安装的 Registry alpha.2 仍是旧 capability，后续接入应在发布并更新包后使用 v2，不能只改应用握手或强转类型。

## 本次独立验证

| 验证 | 结果 |
| --- | --- |
| Workflow policy、Main authorization、client、Workflow runtime、adapter、SA accounting 六个回归文件 | 136/136 通过 |
| `npm run typecheck` | 源码和测试通过 |
| `npm run build` | packages、native、bundle、声明通过；Product Client 消费者无需 Node ambient types |
| 新构建公开 dist 入口，真实 IPC Host，离线 Provider | 六个场景通过：Main 上限抵抗 Renderer 伪造、预算耗尽、零 output、并行名额、Host 并发配置、AMA Workflow/目录/canonical inputId |
| `tests/bundled-product-exit.test.mjs` | 两个真实 detached-daemon 测试通过 |

公开构建探针见 [probe](./kodax-space-sdk-workflow-policy-probe.mjs)，结构化固定点和验证结果见 [evidence](./kodax-space-sdk-workflow-policy-audit-evidence.json)。源码回归通过 Vitest source aliases；公开构建探针直接导入重新构建的 SDK dist 入口，两者不是同一验证范围。

## Standards

未发现明确成文规范违反或值得报告的基线 smell。窄类型和新增状态服务当前需求，包层独立保持。没有把既有超长函数或两处握手同步更新机械计为新增问题。0 项 finding。

## Spec

未发现明确缺失、半实现、范围扩张或实现错误。策略覆盖普通输入、队列、Skill/command/review 和显式 Workflow，独立 Actor 不接受该字段。一次并发配置候选因原反例不成立已撤回，没有据此要求 SDK 添加额外机制。0 项 finding。

Standards：0 项；Spec：0 项。SDK 团队报告的 1,349 项及另 171 项未在本次全部重跑，不用本次 136 项替代其全量声明。源码包仍标 alpha.2，工作树构建不是新的 Registry 发行包；Space 业务迁移仍在进行中。
