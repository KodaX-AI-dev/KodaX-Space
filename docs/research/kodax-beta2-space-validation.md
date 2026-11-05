# SDK beta.2 Space 最终验收记录

> 更正：本记录是 `de015cce` 时点的阶段验收，后续已确认历史冲突由 Space 队列投影反馈循环触发，撤回 SDK 根因归属；其中原称 29 项成品界面测试误用了环境变量，实际为第二轮源码测试，不计入成品资格。已启动正确入口补验，当前结论见 [根因复验记录](kodax-beta2-boundary-root-cause.md)。本记录保留当时失败及 CI 结果，不能代替后续更正。

2026-11-05。适配提交 `71ec948d`，源码验收 SHA `c76a09d8a27730be3a6504df6135053fdd5c6752`。变更范围及双轴复审见 [接入说明](../releases/kodax-beta2-space-adaptation.md)。本记录仅补充实测结果，不宣称全部 SDK 根因或客户环境问题已关闭。

## 安装与执行身份

- Root、Desktop 精确锁定正式 Registry 的 `@kodax-ai/kodax@0.7.97-beta.2`，解析至同一份包，没有嵌套 beta.1；其他依赖版本未扩大。
- 四份随包契约与发布提交 `f68a87161` 按换行归一后一致。发布后 SDK 源码提交不算本包功能，没有改写 node_modules。
- 独立实测 Host：`0.7.97-beta.2`、daemon/process，fingerprint `92f8849732eda495c6867371736badb50e411a3459792fa0d779113b61098b27`；确认 `productInputRecovery:1`、`productExecutionModeConstraint:1`、`repoIntelligenceDiagnostics:1`。

## 五组事项的实际状态

| 事项                    | Space 适配及验收                                                                                                      | 仍需区别的边界                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Promotion 视图          | 保持原 Session、正文和身份；已有、新增、第二客户端观察者及 Quick Ask UI 通过                                          | 保留真实旧修订失效规则                                                               |
| 队列恢复与原文回执      | Main 关闭/崩溃后恢复同一 live Host；同身份原输入只执行一次；旧输入没有 Space 材料、撤回丢响应均能取回完整原文         | 共享 withdrawn 状态或 preview 不能代替 owner 的完整回执                              |
| Partner 原子 Agent 准入 | 可信 profile 声明及持久恢复约束，第二客户端改 Coding 后被 Host 原子拒绝；UI 实际使用 Agent，shell/write/子 Agent 保留 | 模式与权限正交，不通过禁用工具落实约束                                               |
| Workflow 显式单次执行   | 生成/启动、进度、暂停/继续/停止和最终回复保留；保存、编辑、重命名、删除、清理、历史重跑入口撤下                       | 旧定义不删除；无 canonical 原项的旧 Host 记录明确只显示摘要/缺失，不冒充完整结果     |
| 观测与历史一致性        | Space 有界公开 API 兼容、冷恢复、Script Stop 不重放、历史回最新均通过                                                 | 原始 SDK 新首读仍捕获 topology resync，不能宣布 SDK 根因关闭；Issue 371 性能独立验收 |

## 本地验证

| 检查                         | 结果                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 正式包真实 Host 协议专项     | 11 组通过：16 位专家真实 system/tool 载荷、Skill、业务绑定、原子模式竞争、多观察者 promotion、无模型调用 inspect/prewarm、幂等原文撤回等 |
| 真实 Main 进程正常关闭/崩溃  | 2/2 通过；不同 Main PID、同一 live Host、7,024 字原文、唯一 canonical 输入/根 Run，无重启 Host 兜底                                      |
| RED→GREEN 及复审定向测试     | 原文/空附件、持久 profile schema、Host 诊断、Workflow 命令退役、结果分页/任务身份/总截止通过；最后补审 9 项及队列枚举 2 项通过           |
| 静态/编译                    | typecheck、lint、build:smoke 通过                                                                                                        |
| 源码 Electron 专项           | 25/25 通过，retries=0、无跳过                                                                                                            |
| Windows 完整打包             | `npm run build` 通过；Registry/native/SDK Worker/Artifact Worker/SQLite/PTY/更新器检查通过，122 条旧子记录保留                           |
| 打包生命周期                 | 6/6 通过，包括真实 SDK Stop、统计/工具/历史、队列、canonical 边界、完整退出及另一客户端保护                                              |
| 第二轮源码界面（原误标成品） | 29/29 通过，retries=0、无跳过；不计入成品资格。原环境变量未被 fixture 识别，实际启动源码 Electron。                                      |
| 成品与源码一致性             | 包内 beta.2，主进程字节匹配，555 个 Renderer 文件字节匹配                                                                                |

上述 29 项不包含随后因 CI 波动追加的流式 token 专项，不能用其通过掩盖补验失败：`sdk-alpha11.spec.ts` 的 token 用例在 Linux CI 首次遇到 `SDK did not supply the current Session view.`、重试后通过；Windows 成品三次无重试补验为 2 通过、1 失败，开启日志的下一组在第一项即失败（其余四项未运行）。后两次失败发生于停止 Thinking 请求后的第二次发送：Provider 仅收到首个 Thinking 请求，第二次准备阶段被 `session_data_changed` 拒绝，草稿恢复。不是 token 数值断言失败，也不计作该专项已通过。保留原始冲突和失败截图，没有扩大重试或改写断言。

本地首次全量单测曾有一个固定 beta.1 的旧断言失败（4,659 通过、20 条件跳过、1 失败）；已更新精确版本/Registry URL，并新增禁止嵌套旧包断言。最终全量结果以下述同 SHA CI 为准，不把首轮写成全绿。

全仓格式检查的 507 个旧文件问题仍存在；抽查基线原字节已失败。本轮 56 个变更/新增文件统一格式，不做无关全仓重写。

## GitHub 同 SHA 验证

`c76a09d8a27730be3a6504df6135053fdd5c6752` 的两个 workflow 和所有 job 均为 completed/success：

- [build 41943309045](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/41943309045)：四平台单测/编译及静态检查。
- [ci 41943308994](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/41943308994)：Windows/Linux 各两个 E2E shard。

| 单测平台    | 通过 | 条件跳过 | 失败 |
| ----------- | ---: | -------: | ---: |
| Ubuntu      | 4559 |      108 |    0 |
| Windows     | 4583 |       87 |    0 |
| macOS ARM   | 4631 |       42 |    0 |
| macOS Intel | 4631 |       42 |    0 |

以上合计各平台 root、Desktop、IPC 三段单测，各平台的系统/原生依赖条件不同；没有用本地首轮失败代替最终 CI 结果。

| 全量 Electron E2E 平台 | passed | flaky（重试通过） | skipped | 最终失败 |
| ---------------------- | -----: | ----------------: | ------: | -------: |
| Ubuntu 两个 shard      |    181 |                 1 |       7 |        0 |
| Windows 两个 shard     |    174 |                 1 |      14 |        0 |

Ubuntu 重试项为上述 token 专项的首次 view 缺失；Windows 重试项为语言切换用例等待 Runtime diagnostics 中的 Community 标记超时（只显示版本号），重试后通过。保留两次首次失败及 CI 自带重试结果，不宣称所有用例首次全过。它们也不能覆盖本地追加 Stop/下一条发送专项的失败结论。

## 本地成品

这些文件保留 Space 版本 `0.1.47-alpha.4`，用于本轮 beta.2 验收，尚未上传发布。没有替换线上 alpha.4 的标签和资产。

| 文件                                          |    字节数 | SHA-256                                                            |
| --------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `out/win-unpacked/resources/app.asar`         | 145085242 | `0e7194dd2c7164eec4eb6b00216cea3d1c6d9fe3a3cfe605a84728b119d1be77` |
| `out/KodaX-Space-Setup-0.1.47-alpha.4.exe`    | 214161339 | `81565591ea11e4a79d342f212ef2aaaec8aa9c143682090cc8bff8029668d3ab` |
| `out/KodaX-Space-Portable-0.1.47-alpha.4.exe` | 213951383 | `87c3be8a8654137010afc58c5a71d49bf7535752229835b7c70571b747fddbc1` |

线上 alpha.4 仍指向原 SHA `14a00abfa0b7b510596b907ad5c9a7d65153fd2f`（SDK beta.1），原 build/ci/release 全部成功，18 个发布资产存在且有校验摘要；稳定版 latest 仍为 `v0.1.46`。这属于原发布验证，不等于 beta.2 已发布为 Space 新版。

## 未关闭的 SDK 边界与证据

Script 部分写入→Stop→冷 Host→Space 历史已可读后，第二个 SDK 客户端的无 cursor 首读仍出现成功与 `resync_required` 混合，load 后可读、再次 observe/close 后又可失效。错误涉及 topology changed/could not be verified，尚不能据此断定内部具体根因。启动过渡冲突与稳定窗口分别保留，真实并发/过期修订仍应正确拒绝。

为排除只等 100ms 的短窗口影响，另做延长静置探针：先静置 5 秒再首读；每次 observe/close 后静置 2 秒，三次重读间隔 2 秒，load 后也静置 2 秒。仍得到 before=false、after=[true,false,false]、load 后=true、再次观察后=false。Space 恢复及不重放断言通过（37.1 秒），原始 SDK 读边界没有因延长静置收敛。此探针仅临时调整测试等待，不改产品；结束后测试文件 Git blob 恢复为 `84da386335fc7e11fb690a88a8adf02bba059184`，与验收 SHA 一致。记录见 `beta2-history-long-probe.log` 与 `beta2/history-long-probe/`。

可转交 SDK 的问题、需求和验收要求见 [独立交接段落](../releases/kodax-beta2-observe-history-handoff.md)。测试将原始 SDK 返回单独附加为 JSON/annotation；Space 恢复、不重放及部分文件保留断言仍必须通过，没有用跳过测试关闭根因。

### 补验发现的相邻准入边界

请 SDK 配合核对 beta.2 的流式 Stop→下一轮准入稳定性：本地隔离 Provider 下，`STREAM_THINKING_ESTIMATE` 已显示 Host token 估算，公开取消并等到 Space liveSnapshot 无 active Run/队列后，立即发送 `STREAM_TOOL_ESTIMATE`，仍可在准备阶段收到 `session_data_changed`，Provider 未收到第二次请求；Space 恢复草稿而没有自动重发。Linux 全量 E2E 同一用例还捕获首次 productSnapshot 无当前 view、重试成功。这里尚未证明错误属于 SDK 内部哪一层；需结合 Space 的观察 bootstrap/退休、持久身份校验与 SDK 的取消收尾、metadata/location 围栏一起定位，避免用普通重试成功代替根因。需求是在无外部修改时，停止后的安全空闲点稳定提供当前 view，并能按原身份准备下一输入；如仍有合法未收敛状态，应有明确公开的可等待状态/元数据边界，不能要求客户端绕过身份校验或反复 load 全历史。验收使用正式包、实际 Host、两种流式进度反复交替 Stop/下一轮发送，完整记录首次结果与全部 Provider 请求；下一条只执行一次，取消的旧请求不重放，真实外部 retag/项目身份变更、并发写入和过期修订仍正确拒绝，草稿/权限/业务绑定不得丢失。

失败日志为 `beta2-token-estimates-followup.log`、`beta2-token-estimates-debug.log`，现场位于 `beta2/token-followup-red/`、`beta2/token-followup-debug-red/`；Linux 首次失败日志、trace 和附件位于 `beta2/e2e-ubuntu-1*`。此项保留为未通过的接缝补验，不作 Space 完整验收已全绿的结论。

原始证据位于忽略的 `artifacts/diagnostics/beta2*`：真实 SDK/进程报告、首次失败与后续回归日志、稳定历史样本、29 项成品截图/JSON、成品摘要、CI API 结果。测试用隔离 profile 和本地确定性 Provider，不访问真实账号；不能据此推断真实模型智能/总体性能提升。macOS 实际通知横幅/声音、麒麟实机、外部账号、覆盖安装及 Issue 371 首次历史性能仍需要各自环境验收。
