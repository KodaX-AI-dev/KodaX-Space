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

### 未验证

- 没有 E2E 覆盖设置 → 数据位置的完整“复制并重启”流程（会重启进程）；复制本身由真实 beta.9 的单测覆盖，按 [F148 测试指南](../test-guides/FEATURE_148_v0.1.47_TEST_GUIDE.md) C 节人工验收。
- steer 取回只在单测与既有组件层验证，没有在真实模型运行中手动点“取回消息”卡住安全点前的时机。
- 未打目录包、未做成品冷启动；没有 macOS/Linux 实机验收；未创建标签，也未发布安装包。
