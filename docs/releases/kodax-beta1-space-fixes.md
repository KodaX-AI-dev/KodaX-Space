# beta.1 Space 修复执行记录

后续全面界面验收、追加修复及新增 SDK 反例见 [全面验收记录](kodax-beta1-full-acceptance.md)；本文件保留该轮交付时点。

2026-11-03；实施基线 `64fcfed3`。Space 保持 `0.1.47-alpha.3`，Root、Desktop 与 lockfile 继续精确使用 Registry `@kodax-ai/kodax@0.7.97-beta.1`，未修改或发布 SDK，也未发布 Space Release。本记录对应 [完整方案](kodax-beta1-space-adaptation-plan.md)，不能用前一轮的 27 项验收代替本轮结果。

## 已实施的生产路径

| 切片               | Space 改动                                                                                                                                                          | 当前证据与边界                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 来源            | 沿用 SDK AtomicFile 批量 CAS，把私有 selection 升为 v2：file/env/legacy，env 只存变量名；外部删除不会切到后来出现的 env；歧义 v1 拒绝猜账号                         | 实际 Main 外部撤销 RED/GREEN；原 env 消失、显式选择、rename/目标 CLI 值、并发 revision、原账号墓碑由文件和 Main 公共接口验证                                                                                           |
| A2 UI/说明         | Settings、卡片、表单、doctor、README/PRD/HLD/当前手册显示权限保护的明文 auth.json；未知来源不推为 Keychain；移除模型 Provider 的旧 memory 告警                      | 成品 UI 验证另记；历史 Keychain 事实和剩余连接器领域政策保留                                                                                                                                                           |
| A3 旧用户恢复      | 显式使用现有 env、重试原凭证、保存新 Key、采用共享值；按显示状态 CAS，重试沿用 pin 后 revision，不删除旧备份                                                        | unavailable→恢复和 Main pending→retry RED/GREEN；Linux/libsecret 与 macOS 真实系统对话框仍需对应平台专项                                                                                                               |
| B1 材料事实        | 取回不依赖 admissionError；所有 queued 输入独立检查自有完整材料，显示 restoring/ready/unavailable/blocked，缺原文禁用取回                                           | 无 error、有 error、其他 principal、缺材料、长文/附件、取回幂等；不用预览重建输入                                                                                                                                      |
| B2 冷重绑          | 后台按原稳定身份/inputId/完整意图重绑；提交前重读 Host queued/runId；业务拒绝不自动重试；观察器替换时旧工作不能吞掉新恢复                                           | fake Runtime 的观察器失效竞态 RED/GREEN；真实冷 Host 的 7024 字输入仅产生一份 canonical 用户输入和根 Run；**live Host 重绑仍受 SDK 缺口限制**                                                                          |
| C1 冷身份          | 先验证持久化/Host surface 和 workspace，再缓存；command/workflow 从实际 Session 解析产品面，不用 code 默认覆盖旧 Partner                                            | 错误冷请求不污染后续 Partner、初次 workflow、不创建替代 Session 的公共接口 RED/GREEN                                                                                                                                   |
| C2 Agent 与事实 UI | Space 的 Partner setter 拒绝 Coding/Script/null，命令/workflow/冷队列执行前用版本化 Host 状态准备 Agent；指示器显示 Host 实际模式，按 Session/Runtime/revision 隔离 | 其他客户端修改的成品专项另记；**锁内实际消费模式保证仍待 SDK**；正常 shell/write/子 Agent 不受身份禁用                                                                                                                 |
| C3 实际注入        | 保留 Main profile/defaultSkill/AMA、权限及沙箱职责                                                                                                                  | 正式 SDK 的全部 16 位专家实际 system 提示、toolScope/modelToolScope 和 Provider 工具 schema 验证；显式方法覆盖后复原、专家变更/禁用、原文取回、promotion；真实冷 Host 后 Partner fork/model switch 保留 Agent 和源历史 |
| D 诊断             | `/extensions` 改读当前共享 Host SDK 扩展目录，`/mcp` 保持 MCP；更正 MCP owner；现用性能诊断改隔离共享 Host 并完整退出                                               | 合成记录 Host-ready 1801ms、历史首读 14ms、建新会话并观察 360ms；仅该次合成样本，**不关闭 Issue 371**，旧 repair 版本门禁保留                                                                                          |
| E Workflow         | 局部 subscription.error 单独恢复，ready 后 list/get；首连/全重连后台同步快照；事件与读取有代次守卫，有界退避、退出取消                                              | 局部 error、初次 attachment 快照、关闭取消 RED/GREEN；恢复快照使用独立 observation 通道，不伪造 started/finished，不重启 workflow                                                                                      |
| F 扩展健康         | 公开当前 loaded/tools、内置 Skill/Artifact 能力和历史失败；安全原因分类，去 URL 参数/路径及常见秘密；设置手动刷新，迟到响应隔离                                     | 缺 Artifact 与正常 Skill 并存、Node/module/permission 原因、过去失败与当前可用并存、敏感 target RED/GREEN；不把配置有效当能力已加载，不加全局 Node gate                                                                |
| G 连接器保存       | 新秘密用抛错的持久存储 setter，写后核验；临时 memory 不再被生产组合当成授权完成；UI 按连接器区分 Space 存储与钉钉外部凭证                                           | 丢弃写入的公共 credential store RED/GREEN、连接器现有授权/撤销专项；Win/mac OS vault、Linux libsecret 和真实服务登录各需环境，**并未迁移所有连接器到 auth.json**                                                       |

这些生产变更没有增加模型探测、逐 token 文件读取或恢复轮询。队列材料只在队列状态变化/观察器重建时读取，恢复不阻塞首次绘制；Workflow 和扩展诊断不建立第二个 Runtime/Session writer。自动沙箱回退、问题无限等待、权限独立策略、手动更新、原文分页和历史滚动沿用既有合同并进入回归。

## 验证记录

- 真实 SDK/Host：`0.7.97-beta.1`，daemon/process，build fingerprint `f086f7a197e346b8a3ceded90706b51ae10715d6c96bb9a1cc62e3cd11869c90`；确认 `productExecutionBinding:1`、`productExecutionProfile:2`、`sharedSessionSettings:2` 等实际能力。
- `e2e/beta1-sdk-acceptance.mjs`：16 位专家实际载荷、正常工具 schema、默认方法、消费时绑定、专家停用、完整取回和 promotion 等 7 组通过；110 秒，本地 HTTP Provider，无真实账号。
- `e2e/beta1-cold-queue-acceptance.mjs`：冷恢复及 SDK live Host 缺口的专项，报告分别记录 live Host 和更换 Host 的事实，不将整体测试通过解释为两种恢复均已修复。
- 定向回归 `review-regression.log`：463 通过，包含 adapter、队列/渲染投影、manifest、消息组合和连接器页面。
- 完整 `npm test`：4582 通过、20 条件跳过、0 失败。随后补充历史 v1 private 空记录和诊断边界用例；最终来源/Main/健康公共接口 22 项通过，来源文件行 93.32%、分支 84.21%，健康文件行 100%、分支 95.65%。`typecheck`、`lint`、`build:smoke` 与最终 Main 构建通过。
- 真正的独立 Node Main 权限进程：正常关闭与强制终止后均由不同 PID 接续；真实 Host 重启后 7024 字输入、唯一根 Run、Partner 分叉及模型切换通过。分别见 `cold-main-close-host-report.json`、`cold-main-crash-host-report.json`。这不是 Electron 整机断电验收；两组 live Host 未恢复事实仍独立保留。
- Windows 成品的 23 个界面场景均有最终通过结果：首批 22 通过，新增模式专项因 Playwright Electron evaluate 不支持动态 import 而失败；改为独立 SDK 客户端连接同一隔离 Host 后重跑通过，未改产品代码。这条专项实际确认其他客户端把 Partner 改成 Coding 后，UI 显示真实状态，下一轮再恢复 Agent。其余覆盖凭证来源 UI/桌面重启、提问等待/Skip、长任务报告、Skill、Script、MCP 原文、历史双向翻页与回最新、手动更新和权限独立切换。
- 打包自动运行的 6 个真实 SDK 生命周期场景通过（Stop、reload/fork、排队、完整退出、Rewind、保护第二客户端）；包体 smoke 确认 SDK/SQLite/PTY/Artifact Worker、沙箱事实及原文资源。`package-manifest.json` 记录安装版、便携版、ASAR 和 Main 的 SHA-256，包内 Main 与当前构建字节相同，实际加载 SDK 为 beta.1。
- 成品：`out/KodaX-Space-Setup-0.1.47-alpha.3.exe`、`out/KodaX-Space-Portable-0.1.47-alpha.3.exe`、`out/win-unpacked/KodaX Space.exe`。未对外发布，也未验证 NSIS 覆盖旧安装。
- 最终日志、截图与 JSON 在 `artifacts/diagnostics/beta1-fixes/`，中间红灯、测试工具失败及修正后的通过结果分别保留。合成账号值不用于真实服务。

## Standards

最终只读评审：硬违反 0，判断题 0。已确认生命周期、URL 参数脱敏、长度边界和模式事实隔离；长扩展名直接通过实际 IPC schema 校验。

## Spec

最终只读评审：剩余 finding 0。历史 v1 private 无 Key 要求明确选择，v2 legacy 保持原路径；队列材料分类、Agent 入口与真实事实、扩展安全原因、Workflow 恢复及真实进程证据已复核。SDK 接缝和未验证环境不记为已关闭。

## 尚未由 Space 闭环的 SDK 与环境边界

1. [promotion view](kodax-beta1-promotion-view-handoff.md)：继续保留公开 load 的窄兼容，尚未得到新 SDK 的根修复。
2. [队列原文、durable 撤回回执和 live Host 重绑](kodax-beta1-queued-intent-handoff.md)：新版 Space 对新完整材料可恢复；旧材料/组合崩溃回执与仍存活 Host 的失效 binding 需要 SDK 在原权限和锁内处理。Space 不通过自动重启 Host、撤回再重发或私读队列规避。
3. [实际准入 Agent 模式约束](kodax-beta1-partner-mode-admission-handoff.md)：入口 CAS/guard 不能替代 Host 消费/装配边界的锁内验证，旧 Host 无此能力时不能宣称原子保证已完成。

银河麒麟/Linux 无 Node 与无 libsecret、Linux 窗口按钮、真实 Windows 断电恢复、真实 OAuth/cloud/连接器账号、NSIS 覆盖升级以及客户原大会话的 Issue 371 延迟，仍需对应环境。离线 Win64 成品和假服务验证不替代这些验收。
