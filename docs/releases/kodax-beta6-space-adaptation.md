# Registry SDK 0.7.97-beta.6 的 Space 适配

2026-11-11。Root 和 Desktop 精确依赖 `@kodax-ai/kodax@0.7.97-beta.6`。
lockfile 使用 npm Registry URL，SHA-512 为
`4SZmAXEgEjwp+p+ILjFs3uMKtMQjvx07p9zuguPosFSJsaqPuitEfVjPLva+ggFlgsLUPSWenwAmch2T0Mt8zA==`。
本次从 beta.4 直接升级，同时覆盖 beta.5 与 beta.6 的变化。上一版接入见 [beta.4 记录](kodax-beta4-space-adaptation.md)。

## SDK 变化与 Space 处理

| SDK 变化                                                                                                            | Space 处理                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| beta.6 移除 Host 位置 `profile`，每个 `KODAX_HOME` 一个 Host（ADR-075，FEATURE_305）                                | Space 不再传 `profile: 'coder'`，按数据根连接、读取 owner 状态和结算退出；旧退出记录中的 profile 读取后忽略。冒烟和 E2E 改读 `runtime/daemon/default`，手册只对 CLI 0.7.97-beta.5 及更早保留 `--profile coder` |
| beta.6 旧 Space 以 `coder` 启动的 Host 经存储 owner 重定向找到，按 profile 拆分的 Session 状态合并一次（Issue 407） | 无需改动。合并时丢弃旧 Host 中批准的全局授权，用户需重新批准                                                                                                                                                   |
| beta.6 不同安装的 Space 与 CLI 共用一个兼容 Host；CLI 可连接 Space 的 Host 并保留凭据（Issues 405–406）             | 无需改动。启动门禁继续按能力要求连接                                                                                                                                                                           |
| beta.6 Session 设置在创建时快照用户默认值，全局配置只影响以后的 Session                                             | 无需改动。Space 设置页已注明默认值作用于新会话                                                                                                                                                                 |
| beta.5 所有输入图片固定到 `<sessions>/.media/<owner>/<sha256>`，规范输入为每张图追加一行模型可见的观测标签          | **修复回归**：用户消息显示标签行，已发送图片显示为“不支持”。投影时去除标签；预览只额外放行本 Session 的 Host 媒体目录，经 `sessionVisualMediaDirectory` 计算并做 realpath 包含校验                             |
| beta.5 `read` 结果图片同样固定到 `.media`                                                                           | 工具图片本就经 Host 读取，无需改动。打包前的 PNG 证据测试改为接受 `.media` 中的固定路径                                                                                                                        |
| beta.5 个人 workflow 从 `KODAX_HOME/workflows` 读取（Issue 384）                                                    | **修复**：Space 原先列出并放行 `~/.kodax/workflows`，设置 `KODAX_HOME` 时会显示和运行 SDK 看不到的文件。现改用 Agent home                                                                                      |
| beta.5 用户 Skill 从 Agent home 读取（Issue 382）                                                                   | Space 安装与展示已使用 Agent home，无需改动                                                                                                                                                                    |
| beta.5 `ClientSessionView.sandbox`；Windows 观测可带 `degradedReadRoots`，新增回退原因                              | **修复**：严格 schema 拒收这些字段，活动栏丢失沙箱状态。现接受并显示“沙箱降级”警告，列出不可读目录并提示 `kodax sandbox setup`，并说明 `session_reset_pending`、`acl_transition_pending`                       |
| beta.5 冷启动把已失效的 Run 子进程记录原样移到 `.unresolved/`（Issue 398）                                          | 成品启动冒烟接受记录留在原处或移到 `.unresolved/`，并记录移动数量                                                                                                                                              |
| beta.5 扩展 `tool:before` 可返回 `ask`，只能允许一次或拒绝（FEATURE_304）                                           | daemon 审批路径已支持 allow_once/reject，无需改动                                                                                                                                                              |
| beta.5 视觉工具 `visual_history`、`visual_inspect`、`visual_read_pixels`                                            | 以只读副作用注册，权限自动放行；界面按通用工具显示                                                                                                                                                             |

## 观察到的 SDK 边界

以下事项待反馈给 SDK，Space 本次不处理：

- view 的用户消息正文包含模型可见的观测标签，CLI 同样显示。Space 在投影层按标签格式去除。
- `readItem` 的 `part:'attachment'` 只支持 PNG；Space 的 JPEG/WebP 用户图片继续读取本地文件。
- `resolveToolCapability` 的能力表没有视觉工具。
- 扩展 `ask` 与 Space 风险评估同时命中危险时，审批卡显示 Space 的原因，不显示扩展原因。

## 未改动项

- beta.5 的 Managed Run Context 追加、工具契约按需出现、子 Agent 用量计入根目标、`web_fetch` 与 Agent home 写入保护、`daemon.log` 轮转与过期状态清理都属于 SDK 内部，Space 不读取这些文件。
- `session_history_search` 的 `entryRevision` 未被 Space 使用。
- beta.6 的 Linux glibc 2.17 与原生文本插件修复不影响 Windows/macOS 成品。
- 交接目录 `~/.kodax/handoffs` 为 Space 自有数据；MCPB 中的 home 路径仅用于脱敏。

## 验收

2026-11-11，分支 `feat/f305-one-host-space`，基线 `origin/main` `6e927a1e`。

| 检查              | 结果                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 完整 `npm test`   | 发布脚本 153 通过 / 7 跳过；Desktop 4,337 通过 / 13 跳过（4,350）；Schema 373/373；0 失败。升级后首轮发现的 3 个失败（沙箱 schema、PNG 固定路径、workflow 目录）均已修复 |
| 类型、lint        | `npm run typecheck`、`npm run lint` 通过                                                                                                                                 |
| 真实 Runtime 重建 | Main 重建测试经真实 Host 发送带 PNG 的用户输入，历史中正文不含观测标签、图片预览可用；工具 PNG 证据在 `.media` 中保留                                                    |
| Windows 目录包    | `node scripts/pack.mjs --win --dir` 通过：Registry tarball 与已安装 SDK 内容核验、`smoke-pack` 全部检查通过                                                              |
| 成品冷启动        | Renderer 6,817 ms 就绪；Runtime 在确定性延迟后 28,647 ms 就绪；122 条历史子进程记录全部保留并移到 `.unresolved/`                                                         |
| 成品完整退出      | 7/7 通过，含真实 SDK Stop、排队输入、规范边界拒绝过期变更及 Runtime Partner 回退与 Fork                                                                                  |

本轮未运行源码 Electron E2E 全集，也未进行 macOS/Linux 实机验收，未创建标签或发布安装包。日志在 `%TEMP%/kodax-f305/` 的 `b6-pack.log`、`b6-test.log`、`b6-typecheck.log`、`b6-lint.log`。
