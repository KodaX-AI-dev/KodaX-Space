# alpha.12 候选：Partner 专家接缝待补齐

核对 SDK `f24a922c117e0ece5d26224a133a69973b313ab6` 的公开 Product input 与 RuntimeExecutionAuthorization。persona/验证/工具元数据和通用 Agent 能力已经可接，但还不能等价迁移 Space 的专家默认方法与排队时点。

可直接转交 SDK 的说明：

Space 正在把 Partner 从旧进程内执行迁入统一共享 Host，并使用 Session workMode=agent；Partner 仍应具备通用 shell、写文件和子 Agent 能力，仅受正常权限、审批、沙箱、工作区及显式业务策略约束，不能按 surface 加禁用名单。当前公开 Product 输入与 RuntimeExecutionAuthorization.profile 只支持 persona、验证及工具上限，缺少可信 Main 声明“本轮专家默认 Skill”的接缝，也缺少在 after-turn 队列真正消费时读取最新已提交专家/连接器业务绑定的机制：若只在提交时授权，排队后切换或禁用专家会继续使用旧配置；若 Space 先展开 Skill、拼接 slash 或调用私有 Run options，则会改写原始用户输入、重复执行动态上下文/hooks，或绕开单 Host writer。请在既有 Product/Main 授权契约中提供受能力协商保护的公开接缝：由可信 Main 提供专家身份、默认 Skill 引用及相关业务绑定，在真实准入/队列消费边界获取并固定，Host 负责按自己的 registry/config root 一次性准备 Skill、执行 hooks 和 runtime policy；用户显式 Skill 仅覆盖本轮默认方法，persona 保持，下一轮恢复默认。恢复应保留原准入快照并重新绑定当前 lease/工具上限，不重放未知输入或放宽权限，独立 Actor 不借用根专家授权。验收覆盖普通 Partner 与所有现有专家：首次/连续输入默认 Skill 生效、原始问题不变、动态上下文只执行一次；排队后切换/移除专家采用消费前最后成功提交的配置，禁用/卸载包则在模型调用前事实拒绝；写入未确认时仍用旧已提交配置；显式 slash 优先一轮、后续恢复默认；重连/冷 Host 恢复、权限收紧、连接器撤销及 Actor 隔离均保持正确，并通过公开 Product 入口和真实独立 Host 测试。请更新 SDK_MIGRATION/CLIENT_CONTRACT/SPACE_SDK_SEAMS，提供能力版本与失败码，不能用提示词约定替代协议。

Space 候选代码可运行普通 Partner/prompt-only 专家；默认方法缺失时明确拒绝，避免静默丢失方法。该候选不能据此标记所有专家迁移已完成，也不能用原独立 `/coding` 库的旧测试替代共享 Host 产品验收。正式升级前需 SDK 补齐并完成对应适配。
