# SDK 0.7.97-beta.9 的 Space 适配

2026-11-14。Root 和 Desktop 精确依赖 `@kodax-ai/kodax@0.7.97-beta.9`，从 Registry 安装，取代 [beta.8](kodax-beta8-space-adaptation.md)。

| 包              | SHA-512                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| Registry beta.9 | `eXjZoG+pjAk0t19MqKWNr8qbt3+1pF9PVxxv2cTXAABQfY8O/FwJGTzmae2rz0W3U9yCVL9r4p62S/XdSRmj4Q==` |

beta.9 = beta.8 + 数据根复制（SDK FEATURE_306，供 Space F148 使用）+ steer 取回 + 两个来自 Space 联调的 Host 修复
（KodaX Issues 409、410）。保留 v0.7.96 稳定版与 alpha.1–beta.8 的全部客户端契约。

## SDK 变化与 Space 处理

| beta.9 变化                                                                                                                                                                                        | Space 处理                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `copyKodaXDataRoot`、`KODAX_DATA_ROOT_COPY_MARKER`、`KodaXDataRootCopyError`（`@kodax-ai/kodax/runtime`）：标记下原位复制、跳过按 Host 的状态、拒绝运行中的 Host、改写 JSON/JSONL 中的旧根绝对路径 | 设置 → 数据位置的复制改为直接调用 SDK（按需 `import`，不进入启动早期）。删除“SDK 不支持复制”的降级：`dataRoot.get` 去掉 `copySupported`，拒绝原因去掉 `copy_unavailable`，中英文案同步删除。进度窗口与结果直接使用 SDK 的 `CopyKodaXDataRootProgress` / `CopyKodaXDataRootResult` 类型。Space 仍排除 `space/runtime-client-identity.json` 与 `space/input-intents` |
| 失败只删除本次写入的内容；带标记的残留目标报 `target_incomplete`；Host 锁不可读按运行中处理                                                                                                        | Space 的候选校验本就拒绝含 `.kodax-copy-incomplete` 的目录（`incomplete_copy`）；`COPY_MARKER` 导出并有测试断言与 SDK 常量相等。复制失败时不写指针（已有测试）                                                                                                                                                                                                     |
| `inputs.withdraw` 可在安全点认领前取回 `steer` 输入，返回完整原文和附件；认领后仍为 `conflict`                                                                                                     | 中断消息气泡已有“取回消息”，走现有 `takeBackProductInput` 回执路径，无需改代码。新增测试：未送达的 steer 取回后回执与原输入一致（含 `targetRunId`），重复取回只调用一次 Host                                                                                                                                                                                       |
| Run 在送达前结束时 steer 读作 `dropped`；客户端退出不再撤回 steer；被 Host 停止打断的撤回不会复活                                                                                                  | `reconcileInputObservationDemands` 已处理 `dropped`，气泡显示“未送达”；已撤回的输入在 Run 结束事件后仍显示“已撤回”。手册说明退出 Space 不会撤回它                                                                                                                                                                                                                  |
| Host 的 `acceptInput` 丢弃空 `inputArtifacts`                                                                                                                                                      | Space 的回执比较已按规范化后的形状进行；测试夹具改为返回规范化回执                                                                                                                                                                                                                                                                                                 |
| 相对 `KODAX_HOME` 被忽略（回退 `~/.kodax`）；新增纯函数 `resolveKodaXHome`                                                                                                                         | Space 的 `getKodaxDir` 早已忽略相对路径并规范化为绝对路径。数据根在 SDK 加载前解析（ADR-011），所以不改用 `resolveKodaXHome`；规范化仍保留，让内置终端里的旧版 CLI 拿到同一个绝对根。只更新注释                                                                                                                                                                    |
| 客户端退出请求停止 Host 时，若另有客户端连接，立即返回 `connected_clients`（Issue 410）                                                                                                            | Space 的 Issue 250 修复已让保留 Host 的退出只请求本客户端退出（`shutdownHost: false`）。beta.9 补上 SDK 一半：强制退出路径遇到对端连接时也会立即被拒绝，不再先跑最长 17 秒的预检                                                                                                                                                                                   |
| Windows 启动失败点名原因：只引用本次尝试写下的 `[Error]` 行；原生监督器记录自身失败；清理失败提示“重试或重启应用即可释放”（Issue 409 后续）                                                        | 无接口变化。应用内手册 `runtime-host` / `troubleshooting` 主题同步说明                                                                                                                                                                                                                                                                                             |
| beta.8 CHANGELOG 更正：Job 身份探针期限为 10 秒（原 PowerShell 探针 5 秒），不是“未放大超时”                                                                                                       | Space 的 CHANGELOG、手册与 Issue 246 回归指南此前沿用“未放大超时”，已更正：Space 没有放大超时，SDK 的探针期限是 10 秒                                                                                                                                                                                                                                              |
| `MessageQueue.requeue`、安全点先认领后写入                                                                                                                                                         | SDK 内部变化，无需适配                                                                                                                                                                                                                                                                                                                                             |

## Space 侧改动

- `package.json`、`apps/desktop/package.json`、`package-lock.json`：精确依赖 beta.9，lock 指向 Registry tarball，diff 为干净的 10 行。
- `data-root-change.ts`：`copyDataRootWithSdk` 直接调用 SDK；`copyRoot` 不再可空。`main.ts`、`ipc/data-root.ts`、IPC schema、`SettingsModal.tsx`、`messages.ts`、`data-root-progress-window.ts` 随之简化。
- 测试：`data-root-change.test.ts` 用真实 beta.9 复制验证排除项、JSON 转义路径改写、标记清除、进度、指针写入与旧根不变，以及带标记目标被拒绝且不写指针；`product-input-intents.test.ts` 新增 steer 取回；`kodax-runtime-compat.test.ts` 期望 beta.9。
- 应用内 `space_manual`：数据位置复制、steer 取回与未送达、启动错误与清理提示、10 秒探针期限；新增手册测试。
- 文档：CHANGELOG、README、PRD/HLD/DD/USAGE/BUILTIN_SKILLS、能力台账、凭据记录、迁移记录、Partner 集成记录、用户手册、`FEATURE_LIST`（F148）、`v0.1.47.md`、ADR-011、F148 测试指南、Issue 246 回归指南、`KNOWN_ISSUES`（Issue 250 的 SDK 一半已随 beta.9 交付）。

## 验收

2026-11-14，在 `main`（`0600e064` 之上的改动）和 Registry beta.9 上运行。

| 检查                  | 结果                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 完整 `npm test`       | 发布脚本 153 通过 / 7 跳过；Desktop 4,405 通过 / 13 条件跳过；Schema 373 通过；0 失败、0 取消                                                                                                                                          |
| 类型、lint            | `npm run -s typecheck`、`npm run lint` 通过                                                                                                                                                                                            |
| 定向单测              | `data-root-change`（含真实 beta.9 复制、标记拒绝、常量一致）、`data-root`、`product-input-intents`（含 steer 取回）、`kodax-runtime-compat`、`space-manual-topics` 16/16、`data-paths` 全部通过                                        |
| `npm run build:smoke` | 通过                                                                                                                                                                                                                                   |
| 源码 Electron E2E     | 重建后 28/28 通过：`settings-modal`、`settings-modal-interactions`、`settings-navigation`、`queued-message-toast`、`runtime-startup-exit`、`runtime-startup-recovery`、`update-safe-exit`（none / peer / active task，真实 Host 停止） |

### 补充自动验证（提交 `97c6e7be` 之后）

| 检查                                | 结果                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 设置 → 数据位置“复制并保存重启” E2E | 新增 `tests/e2e/data-root-change.spec.ts`，连续 3/3 通过。非测试模式启动，`-r` 预加载把 appData/userData 指到临时目录并拒绝加载 OS keyring，`KODAX_HOME` 指向临时旧根。覆盖：经验证的 Host 停止、指针、排除项、无标记、JSON 中旧根绝对路径改写、旧根不变、`data_root_changed`（含 `rebasedFiles`）、重启请求；再次启动读取新位置，来源“在此处设置”并提示环境变量；OS keyring 加载 0 次。真实凭据（133 + 20 条）与真实指针未变 |
| steer 在真实 Run 中取回             | 新增 `tests/e2e/steer-take-back.spec.ts`：本地模型挂起首个请求，Enter 发送的插话显示“等待安全点”，点“取回消息”后为“已撤回”；放行后 Run 正常完成，模型从未收到该文本，Run 结束后仍为“已撤回”。对照：不点取回时，同一文本作为下一次模型请求送达                                                                                                                                                                                 |
| Windows 目录包与成品冒烟            | `node scripts/pack.mjs --win --dir` 用 Registry beta.9 打出 `out/win-unpacked`：依赖冒烟通过（asar 内为精确 beta.9、依赖闭包 323 个包）；成品冷启动通过（隔离配置，渲染器 5.8 秒就绪，Runtime 在确定性延迟后 26.9 秒就绪，122 条历史子进程记录保留）；成品 `sdk-unified-contract` 7/7 通过（源码 Electron 同样 7/7）                                                                                                          |

### 验证中发现

- Host 尚未启动完成（或启动失败）时点“保存并重启”，没有可验证停止的 Host，Space 拒绝更改并按“需要恢复重启”处理：应用重启，数据位置不变。E2E 先等待 Host 就绪再保存。这与安装更新共用同一安全门（ADR-011）；Host 无法启动时用户也无法通过设置换位置。是否放宽待决定。
- 成品 `sdk-unified-contract` 首次 6/7：“完整退出保护另一已连接客户端”仍期望回执 `host.state` 为 `protected`。Issue 250 之后保留 Host 的退出只请求本客户端退出，回执为 `requested: false`、`not_requested`；断言已更新，对端仍能读取历史的检查保留。
- F148 测试指南 C.5 原写日志在 `space/logs`，实际在 Electron userData 的 `diagnostics/space-main.jsonl`，已更正。

### 未验证

- 没有 macOS/Linux 实机验收；Windows 安装版与便携版的安装、升级流程未执行（只验证目录包）；F148 测试指南中需要真实机器的场景（另一盘符、盘符根目录、MCPB 扩展启动、便携版重启）未执行。
- 未创建标签，也未发布安装包。

## SDK 能力全面复核（2026-11-14）

对照 beta.9 的公开出口、`CLIENT_CONTRACT.md`、`SPACE_SDK_SEAMS.md`、`SDK_MIGRATION.md` 与 0.7.96 → beta.9 changelog，逐域检查 Space 的使用（Runtime/Product client、llm/Provider、Skill/MCP/沙箱/媒体、Artifact/A2A/Memory/Partner）。

### 已修复

| 问题                                                                                                                                                                                                                         | 修复与验证                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| beta.7 给图片附件加了 `observationId/width/height/sha256`，Product view 复用判断按整个附件比较，每次视图更新都重新签发预览 URL                                                                                               | 只比较 schema 保留的 `kind/path/mediaType`；`product-view-projection` 新增回归                                                                                                      |
| Gemini CLI / Codex CLI 只有一个 Space 写死的旧模型（`gemini-3.0-pro`、`gpt-5.3-codex`），`/model` 拒绝 SDK 支持的模型，也忽略本地 CLI 配置的默认模型                                                                         | 启动后用 SDK `getProviderModels` 取 CLI bridge 模型列表（本地 CLI 配置的默认在首位）；兜底值对齐 SDK（`auto-gemini-3`、`gpt-5.4`）；`provider-catalog` 新增注入与真实 SDK 两条测试  |
| 首启自动激活只凭 `OPENAI_API_KEY` 就选 codex-cli（`GEMINI_API_KEY` 同理选 gemini-cli），而 CLI bridge 用自己的 CLI 登录，未装 CLI 时首轮失败                                                                                 | CLI bridge 不参与自动激活，与 `provider-storage` 的环境凭据判断一致；`auto-activate` 新增回归                                                                                       |
| 渲染进程上下文窗口兜底表停在 0.7.96-beta.6：`qwen3.5-plus` 过报为 1M（SDK 256k），Claude 5.5 / 4.6、gpt-5.4、Kimi k3.1、Qwen 3.6–3.8 低报为 200k/400k                                                                        | 按 beta.9 订正；同一模型在多个 Provider 上窗口不同时取最小值。新测试逐条对照 SDK 全部内置模型，任何过报即失败                                                                       |
| CLI 启动的共享 Host（Issue 405 后 Space 会直接使用它）用真实 Node 加载 `space-artifacts.mjs`：真实 Node 读不了 `app.asar`，解析会走出安装目录去父级 `node_modules` 找 SDK，安装版则 `MODULE_NOT_FOUND`，健康页误报“模块缺失” | 打包布局下若 `app.asar` 内不可读，明确报错“此 Host 不是 KodaX Space 启动的”，不再越出 Space 自带副本解析；健康页给出对应说明。Artifact 工具在这种 Host 里仍不可用，见下方“需要决定” |
| steer 在安全点认领后、Run 结束 `dropped` 后或 Host 重启后取回，SDK 返回 `conflict`，界面直接显示英文原始错误                                                                                                                 | `session.withdrawInput` 输出增加 `{ conflict: true }`，界面显示“这条消息已无法取回：它已送达，或所属任务已结束。”；schema 新增测试                                                  |

文档：能力台账第 19 行仍写“本地 beta.7 候选包”、多行写“current alpha.7/alpha.9”、Memory 策略写 `f260-v0.7.68.2`（beta.9 为 `f275-v0.7.77.1`），已订正；KNOWN_ISSUES 083 注明修复早在 0.7.77 发布、beta.9 补上 `dropped`，剩余为成品回归；225 注明 beta.5 Issue 398 已实现建议的第 3 项，待安装 beta.9 后的冷启动数据；Partner 文档 PF014 索引状态、源码基线与“还有 SDK 缺口”的旧表述已订正。

### 需要决定

- **CLI 启动的 Host 里的 Artifact 工具**：SDK 扩展 API 不提供 `executeManagedProcess`，Space 自带的 `coding` 出口在 ASAR 内，真实 Node 无法加载。可选：Space 遇到非自己启动的 Host 时提示用户（现状）；或改用该 Host 自身安装的 SDK 注册 Artifact（需确认 Host 入口路径，并放宽“只用 Space 自带 SDK”的信任边界）；或请 SDK 在扩展 API 中提供受管执行。
- **能力版本严格相等**：`sessionCancellation`、`toolInvocation` 等启动检查用 `!== 1`，SDK `supportsRuntimeCapability` 用 `>=`。共享 Host 来自更新的 CLI 且该能力升到 v2 时，Space 会拒绝启动。若 SDK 承诺升版向后兼容，应改为最低版本检查；若升版可能改变语义，保持严格（现状）。
- **代理**：beta.5（FEATURE_303）起 OpenAI Responses WebSocket 只在 Node 22.21+/24.5+ 且设置 `NODE_USE_ENV_PROXY=1` 时遵循 `HTTPS_PROXY`/`NO_PROXY`。Space 启动的 Host 是否设置该变量、Electron 内置 Node 是否满足版本，尚无决定或用户文档（`USAGE.md` 只说明打包下载的代理）。
- 保存并重启（数据位置）在 Host 未就绪时走恢复重启且位置不变（见“验证中发现”）。

### 记录、不改

- `catalog.ts` 读取包内 `dist/provider-capabilities.json`（不在 `exports` 中）。目前 14 个 HTTP Provider 的默认模型与列表与 SDK getter 一致；若 SDK 移动或改形，Space 落到手写兜底表。
- 数据位置复制没有取消：SDK `copyKodaXDataRoot` 支持 `signal`，Space 未传。
- 未发现 Space 使用已弃用出口；沙箱 v11、Skill 注册表、媒体、凭据租约、Partner 执行绑定、Memory 与 A2A 的调用签名与 beta.9 一致。

### 上游 SDK

- beta.9 改变了 steer 取回的客户端可见行为（新增可取回窗口、`dropped`），未提升能力版本，与 `CLIENT_CONTRACT` “客户端可见行为变化须提升能力版本”不一致。
- `SPACE_SDK_SEAMS.md` 仍示例 `profile`；`ARTIFACT_SDK.md` 与 `SPACE_SDK_SEAMS.md` 仍称 Artifact 子路径未发布。
- Artifact 的 Space 集成说明只考虑 Space 启动的 Host，未覆盖 Issue 405 之后由 CLI 启动、Space 共用的 Host。
