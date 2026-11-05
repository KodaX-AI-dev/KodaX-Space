# KodaX beta.2 Space 接入与验收

2026-11-05。基线 Space `3d9ee715` / SDK `0.7.97-beta.1`；目标为正式 Registry `0.7.97-beta.2`。本轮升级不移动已发布的 Space alpha.4 标签，不代替下一次 Space 发版。

## 实施范围与公开边界

用户要求闭环 promotion 视图、队列恢复与原文回执、Partner 原子模式准入、Workflow 单次调用、观测与历史一致性。以正式包的四份契约、声明和实际 Host 为准；SDK 本地发布后提交不视为包内能力。测试沿用公开 SDK、Space Runtime adapter、IPC 和 Renderer/Electron 界面边界，使用独立 profile、本地 HTTP Provider，不访问真实账号。

1. Root、Desktop、lockfile 精确升级 beta.2，验证运行 Host 的 `productInputRecovery:1`、`productExecutionModeConstraint:1`，旧 Host 按现有安全升级机制拒绝或切换，保留其他客户端工作。
2. Partner 可信 profile 声明 `requiredWorkMode:'agent'`，正常/排队/静态命令/Workflow/恢复保持约束；恢复保留原要求，独立 Actor 仍独立授权。透传 `execution_mode_mismatch`，保留 shell/write/子 Agent、权限与沙箱自动回退。
3. 显式取回以 Host 幂等 withdraw 的完整回执为权威，支持没有旧 Space 恢复记录的输入；丢响应可原身份重试，不以 preview 或单独 withdrawn 状态冒充完整原文。已有完整私有材料继续支持原身份自动重绑。
4. 实际 Session 的 Repo-intelligence inspect/prewarm 走执行 Host，展示 initialized/warnings 与代次，检查不初始化、不发模型请求；预热保持按需、有界且不干扰输入。
5. Workflow 为显式单次功能：保留生成/启动、进度、暂停/继续/停止和 Session 最终结果；去掉保存/修改/重命名/删除/清理/历史重跑的产品管理入口。已有保存定义不删除，旧历史不改写，不由 Space 清理 Host 目录。Host 结果从公开 Session 项读取，不能把裁剪摘要标成完整结果。
6. 用正式包真实 Host 验证 promotion 多观察者、Main 关闭/崩溃后 live Host 队列重绑、durable 撤回、模式竞争、Script 部分执行 Stop/冷恢复及 observe 后历史首读、Workflow 终态结果。保留真实并发/过期 cursor 冲突，Issue 371 首读性能独立记录。

## 验证与结论

实际安装的 Root/Desktop 均解析到一份 `0.7.97-beta.2`，lockfile SHA-512 与 Registry 一致；没有嵌套旧 beta.1，也没有扩大其他依赖版本范围。四份随包契约按换行归一后与发布提交 `f68a87161` 一致。SDK 本地仓库发布后的 `43538d573`（极深结构化投影的容量回退）及其构建预算后续提交不在本包范围，不通过改写 node_modules 代入。

独立共享 Host 实际为 `0.7.97-beta.2` / daemon / process，fingerprint `92f8849732eda495c6867371736badb50e411a3459792fa0d779113b61098b27`；实测确认 `productInputRecovery:1`、`productExecutionModeConstraint:1`、`repoIntelligenceDiagnostics:1`，关闭时核对精确 owner 和真实退出。

| 专项                      | 证据与结果                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 真正的 Main 进程关闭/崩溃 | `node --test --test-force-exit --import tsx e2e/beta1-cold-queue-acceptance.mjs`：2/2 通过。不同 Main PID、同一存活 Host、7,024 字原文、唯一 canonical 输入/根 Run、Partner fork/model switch 均确认。旧探针注入 runtimeFactory 时漏配持久授权存储导致活跃 Run 凭证失败；已按生产配置补齐，旧失败保留，不以重启 Host 绕过。 |
| 正式包实际载荷与协议      | `node --test --test-force-exit --import tsx e2e/beta1-sdk-acceptance.mjs`：11 组通过，包括 16 位专家的真实 system/tool 载荷、默认/显式 Skill、消费绑定、禁用专家、第二客户端在授权后改 Coding 的原子拒绝、多观察者 promotion、无模型调用的 inspect/prewarm、没有 Space 材料的旧输入丢响应撤回恢复。                         |
| 关键 RED→GREEN            | 原文取回/空附件规范化、Partner profile 与持久 schema、Host inspect、Workflow 命令退役、结果分页/同父 Run 子任务误选/挂起读取均先复现再修复；补审定向 9 项通过。                                                                                                                                                             |
| 类型与静态检查            | typecheck、lint、build:smoke 已通过；最终修改后的复核及界面/成品记录继续追加。                                                                                                                                                                                                                                              |

源码 Electron 界面：本轮 8 个专项文件共 25 项通过，retries=0、无跳过，含模式选择、长期问题等待/Skip、历史回最新、工具原文/图片、promotion、队列取回、Workflow 单次启动/结果/退役入口和设置。Script 原始 SDK 读边界的限制单独 annotation 记录；Space 恢复和不重放断言仍必须通过。

全量单测首轮共 4,680 项：4,659 通过、20 条件跳过、1 个旧断言仍固定 beta.1 而失败。已将其更新为 beta.2 精确版本/Registry URL、禁止嵌套旧包，并通过本轮 9 项补审回归及 2 项队列失败分类专项；最终全量结论以随后同 SHA CI 为准，不把首轮写成全绿。

本轮 56 个变更/新增文件格式已统一。全仓 `format:check` 仍发现 507 个旧文件不符当前格式；抽查基线 `3d9ee715` 原字节也失败，未做无关全仓格式重写。CI 的静态门为 lint，不将本轮局部格式通过冒充全仓格式通过。

详细未裁剪日志和 JSON 保存在忽略的 `artifacts/diagnostics/beta2*`。这套测试使用本地确定性 HTTP Provider，证明契约、权限、执行路径和恢复行为，不证明真实模型智能或总体效率提升。

## Standards

独立规范轴复审：硬违反 0、判断项 0。已删除退役 Workflow 的不可达管理分支，读取有总截止，手册与单次调用一致，预热不轮询且按 Session/Host 隔离。

## Spec

独立需求轴复审：Space 剩余 finding 0。Workflow 按任务身份读取、不把子报告当根结果；Host workspaceRoot 为项目诊断权威，旧代次 trace 和预热迟到响应隔离。SDK 历史接缝补验作为独立上游边界记录，不通过降低 Space 恢复/不重放断言关闭。

## 兼容与验收边界

- Workflow 新执行的最终回复来自 Host canonical Session taskResult；没有这个原项的旧 Host 完成记录只显示明确标记的摘要/原项缺失。升级不凭空恢复旧完整 result.json，也不私读 Host 运行目录。
- SDK Issue 371 的历史首次读取延迟仍独立验收；Host ready 不等于历史已加载。普通问题保持无本地默认超时，沙箱按 SDK 原设计自动回退，稳定版不会自动升级到预发布。
- 第五组不能仅凭升级宣布 SDK 根因关闭：Script Stop/冷重启后的 Space 兼容读取与不重放已通过，但独立 SDK observe/历史新首读仍捕获混合成功与 topology resync，见 [beta.2 补验及交接段落](kodax-beta2-observe-history-handoff.md)。启动过渡冲突与稳定窗口的证据分开保留；不把 annotation 或兼容成功冒充 SDK 直读通过。
- 实际 macOS 通知权限/横幅/声音、麒麟实机、真实外部账号和覆盖安装属于对应环境验收。本轮不替换已发布 alpha.4 的 tag/资产，也不把 SDK 源码后续补丁当成当前发布包功能。
