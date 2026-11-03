# Registry beta.1 接入验收

2026-11-03。Space 保持 `0.1.47-alpha.3`，Root/Desktop/lockfile 精确锁定正式 Registry `@kodax-ai/kodax@0.7.97-beta.1`。本轮不修改 SDK 源码，不发布 Space Release。

## 依赖与 Host

- Registry integrity：`sha512-rQWEvPm8EnoGqgB4aCBtAUGcOaPsnZwqWq5TGgu6jgGWnKIgBbUU2GJSATTlnW+KSUxWduYsJhLkU314553qBA==`。lockfile 只有 SDK 的版本、URL、integrity 变化，其他依赖版本未漂移。
- 独立真实 Host：`beta.1`、daemon/process、profile coder；build fingerprint `f086f7a197e346b8a3ceded90706b51ae10715d6c96bb9a1cc62e3cd11869c90`。实际确认 `productExecutionBinding:1`、`sessionPromotion:1`、`productExecutionProfile:2`、`sharedSessionSettings:2`（含 workMode）等能力。
- `sandboxRuntime:11` 保留 `permissionFallback:normal-permission-policy`，不增加 Node 安装 gate 或客户端禁止回退策略。完整 Host/依赖报告位于 `artifacts/diagnostics/beta1-release/real-sdk-host-report.json`。

## 适配矩阵

| 契约                 | Space 实现与边界                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 专家默认方法         | 可信 Main 声明 `profile.defaultSkill`，Host 准备 Skill/hooks/policy；Main 不展开、不拼 slash。角色、原问题和普通 Partner 的 shell/write/子 Agent 能力保留；显式 Skill 只覆盖一轮。                                                                                                                                                                                                                            |
| 消费时绑定           | Partner input/recovery 使用注册的 binding resolver；真实准入时读取最后成功提交的专家和连接器，使用该 Session 的 scoped services/catalog 构造 profile。命令、工具、Workflow、compaction/probe 和独立 Actor 保持各自授权。                                                                                                                                                                                      |
| 恢复与 steer         | Main 私有不可变业务快照以 hash 引用，Host 快照不塞入大段专家/连接器资料。恢复读取原范围、原 persona 并重建当前 lease，不采用当前新专家；没有原证明的旧 checkpoint 明确拒绝。同 Host steer 复用目标 Run 原声明。已准入后可选 Main 审计保存失败不伪装为“未发送”。                                                                                                                                               |
| 队列失败             | 透传 `admissionError`，保留 queued 状态、inputId 与原问题，不自动删除或重试。UI 明示阻断，可显式取回；新输入在 Main 私有区保存完整意图，Host/Main/Renderer 丢响应后可按原身份确认 withdrawn 并重复返回全文和附件预览。旧队列无完整恢复记录时保留原队列，不能以预览冒充全文，见下方限制。                                                                                                                      |
| Quick Ask            | Host `sessions.promote/readPromotion`，持久保存原 requestId/expectedRevision/tag。确认原 Session 提升后才更新 ephemeral/侧栏和页面；忙碌、冲突与断连不直写 Session 或新建替代。提交后重取 historyBoundary/cursor；beta.1 的 view 可能仍含旧临时标签，正式显示请求会以公开 load 核验同一 Session 的正式元数据后消费原 SDK items，不伪改标签或正文。元数据修订引起历史 item ID 变化是正常失效，不代表正文改写。 |
| 核心配置             | 使用公开 `readCoreConfig`；有限重试只针对 SDK 配置锁忙。保留 typed code/data、坏文件与原凭证；Provider 改名复合提交在 SDK 同锁内使用 `writeCoreConfigAtomically`，保留原 CAS 和账号绑定，不嵌套调用 SDK mutation。                                                                                                                                                                                            |
| 打包资源             | 保留完整 SDK dist，新增 `runtime-daemon-schema.json` 的 ASAR 必需资源门禁。                                                                                                                                                                                                                                                                                                                                   |
| 工作模式             | 既有 Agent/Coding/实验性 Script 选择、首次发送前确认与安全空闲 CAS 继续使用 Host 状态；Partner 固定 Agent。模型、权限与 AMA 独立，SA 入口继续隐藏。                                                                                                                                                                                                                                                           |
| 进度、历史与报告     | 沿用 Host estimatedTokenCount、原文按具体工具项分页、多 taskResult/未知状态、canonical/native 字段、历史分页与滚动跟随；不把 Host ready 当作历史已加载。                                                                                                                                                                                                                                                      |
| 问题、凭证与生命周期 | 普通问题无客户端默认超时，保留 skipped/non_interactive；审批独立。凭证来源、CAS/墓碑/OAuth 撤销与原账号边界保留；手动检查更新、稳定版过滤预发布、退出保护其他客户端与活跃工作继续适用。                                                                                                                                                                                                                       |

## 验证记录

- 真实正式包的 Space 适配器离线 Host 验收：7 组通过，实际遍历全部 16 位当前专家。覆盖默认方法/角色/原问题/shell、消费时切换、显式覆盖、禁用阻断、完整原输入取回和同 Session Quick Ask 提升/幂等重试。测试只调用本机假 Provider，不使用真实账号。独占 Host 经 SDK 核验退出。
- 首轮 fixture 的 Coder surface 写成 `coder` 而非 Space 的 `code`，随后又误把 promotion 前后 revision-bound history item ID 视为恒定；均保留失败日志并修正独立断言。另一次隔离 Home 与 config root 不匹配，已改为同一隔离 Home 下的 `.kodax`。最终真实 Host 结果单独记录，未把失败轮算作通过。
- 专项红绿：默认方法、不可变原业务快照、配置错误类别、队列阻断投影、promotion 丢响应、长输入/附件取回丢响应。旧无业务快照恢复拒绝及准入后审计失败也有回归。
- 全量 `npm test`：4,568 通过、20 条条件跳过、0 失败（release 130/7，Desktop 4,067/13，IPC 371/0）。此轮全量之后补了输入可选字段 JSON 规范化和 promotion view 兼容，分别追加 3 条红绿回归、379 条相关回归，以及最新代码的真实 Host 7 组验收，全部通过；没有将此前全量结果冒称为这两次修改后的再次全量。
- 新增三个恢复模块的专项覆盖率：行 95.85%、分支 82.22%、函数 100%。这是三个模块的覆盖率，不是全仓库覆盖率；采集后可选字段规范化另有 3 条回归通过。
- `typecheck`、零警告 lint、`build:smoke` 通过。最终 Main 重新构建并打包；ASAR 内 Main 字节与最后的 `dist-electron/main.js` 一致，SDK 为 beta.1，必需 schema 完整。
- Windows x64 成品：完整打包资源/原生模块/Artifact worker/SDK daemon 检查、启动与退出检查通过；6 项真实 Host 生命周期成品测试通过。最新成品新增 UI 3 项全部通过：Partner Agent/default Skill/shell、队列阻断及重载后完整取回、Quick Ask 同 Session 提升及重载后正文。后者首轮曾发现真实 SDK view 缓存缺口，加入权威读取兼容后通过，未隐藏失败记录。
- 追加既有能力成品回归 18 项全部通过、无跳过/重试：Agent/Coding/Script 与 CAS/忙碌拒绝/首次输入前选择、Host token 估算、Skill 发现和策略 hooks、问题长期等待与显式跳过、长任务报告/未知状态、Script Plan/Stop、MCP 原文及真实 Host 重启、历史分页/未完成工具尾部/单一下箭头回最新、通知关闭、四种权限、手动更新确认、凭证来源/CAS/应用重启。与上面 6+3 合计 27 个不同成品场景；报告分别为 `compatibility-results.json`、`new-ui-final-results.json`，6 项生命周期在最终打包日志中。不将重复执行计作额外场景。
- 编码规范轴和需求轴分别独立评审，当前 Space 改动均无剩余可执行问题；两处外部 SDK 接缝仍按下节保留。见 [评审记录](kodax-beta1-code-review.md)。原始日志位于 `artifacts/diagnostics/sdk-post-alpha12-review/`，成品证据位于 `artifacts/diagnostics/beta1-release/`。

## Windows 成品

Space 版本仍为 `0.1.47-alpha.3`，未发布。以下文件为最终加入 view 兼容后的同一次打包，测试运行它们的 `win-unpacked` 内容。

| 文件                                          |        字节 | SHA-256                                                            |
| --------------------------------------------- | ----------: | ------------------------------------------------------------------ |
| `out/KodaX-Space-Setup-0.1.47-alpha.3.exe`    | 214,613,213 | `b9ce6f438d55be02e48126f649c36e7c9684bd000b8c07aaebdf671ee0b84b27` |
| `out/KodaX-Space-Portable-0.1.47-alpha.3.exe` | 214,403,259 | `3154b0b826fb25fde0098319d19fcf0ba7bb5496f83e6b45a18eff5dbd7eb997` |
| `out/win-unpacked/resources/app.asar`         | 144,976,289 | `c6b819cb779226b6dc04229895912901a1e7b2bfa05278788a494687a0787ebe` |

启动测试 Renderer ready 4.600 秒；Runtime ready 25.857 秒包含刻意设置的 20 秒阻塞，不能用作实际历史加载性能结论。保留了 122 条历史子进程记录；没有为获得通过而清除它们。此轮未操作 NSIS 安装向导，也未覆盖现有用户安装。

## 尚有限制

- SDK promotion 的 view 元数据缓存仍需根修：真实公开 API probe 确认回执/load 为正式标签，而已有及新观察者仍是旧临时标签。Space 已对正式显示请求做上述权威读取兼容；根因、要求及验收见 [SDK view 交接](kodax-beta1-promotion-view-handoff.md)。前轮 SDK 检查覆盖了提升回执和历史，未覆盖此 observeView 元数据分支；本轮成品验证补出了该遗漏。

- 旧版已排队输入可能只在 SDK Host 保存全文，而 Space 没有完整私有恢复记录；当前公开 getInput/view 只有裁剪预览，withdraw 成功响应丢失后不能重新取回全文。Space 对这种输入拒绝执行不可恢复的取回，保留原队列。SDK 需求/验收见 [交接段落](kodax-beta1-queued-intent-handoff.md)。新输入在 Main 确认撤回后持久保存回执，常规丢响应与之后的 Host 换代可恢复；若 Host 已撤回、Main 尚未保存确认便崩溃且 Host 又丢失事实，仍只能保留全文并报告结果未知，需上述 SDK durable 回执接缝。
- 老 Run 缺业务快照或快照文件损坏/丢失时不猜测原专家、连接器、账号；明确拒绝自动恢复，不重放未知副作用。不能降级到旧 SDK 来绕过新 checkpoint 协议。
- Issue 371 首次历史读取性能仍未关闭。Linux/Kylin/macOS/ARM 真机、真实 OAuth/云 principal/外部平台权益与服务端实际推理采用情况不由本机离线假 Provider 测试替代。
