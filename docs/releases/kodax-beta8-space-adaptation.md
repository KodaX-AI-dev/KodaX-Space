# SDK 0.7.97-beta.8 的 Space 适配

2026-11-13。Root 和 Desktop 精确依赖 `@kodax-ai/kodax@0.7.97-beta.8`，从 Registry 安装，不再使用本地候选包。

| 包              | SHA-512                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| Registry beta.8 | `KCwvT9muZxPpyeFbO8jUj/v4BLO0i8Y3zS8saAuxexiSmNUKtKjisKCpsWDW6qloerdN0d+HuplBvlaJuSptkw==` |

beta.8 = beta.7 + 原生 Windows Job 提交（`586ba53d5`、`72033b51f`，修复 Issues 245–247）+ 若干启动稳健性修复。
[beta.7 记录](kodax-beta7-space-adaptation.md)描述的本地候选包已被它取代。SDK CHANGELOG 声明本版没有 SDK 公共接口变化，
所以 Space 没有代码适配，只更新版本断言、应用内手册和文档。

## SDK 变化与 Space 处理

| beta.8 变化                                                                                                  | Space 处理                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `__daemon-job-identity`：随包原生可执行文件读取命名 Job 成员、kill-on-close 和创建身份，替代 PowerShell 探测 | 无接口变化。Space 的“探测失败”E2E 夹具改为注入对该原生子命令的失败                                                          |
| `__daemon-job-supervise`：原生 Job owner，替代 PowerShell + `Add-Type` 监督器；启动时不再编译任何东西        | 无接口变化。E2E 夹具通过 `KODAX_INTERNAL_WINDOWS_JOB_SUPERVISOR_EXE` 的启动边界注入，原生监督器启动更快，已据此调整清理用例 |
| 同一 slot 的并发 admission 串行化；清理失败时等待清理完成                                                    | 无需改动；Space 的慢速重试仍只由定时器发起，前台调用不会另起尝试                                                            |
| `child_exit` 现在可重试                                                                                      | Space 的启动适配器已把可重试失败交给“3 次快速重试 → 慢速后台重试（30 秒、1、2、4 分钟，之后每 5 分钟）”                     |
| 启动失败消息带 bootstrap 日志里最后一行 `[Error]`                                                            | 手册和排障文档指引用户看 `runtime/daemon/default/bootstrap.log` 与 `daemon.log`，诊断导出已包含两者                         |
| SDK `kodax_manual` 的 `sandbox` 主题新增 beta.8 Job 段落                                                     | Space 没有 `sandbox` 覆盖主题，原样透出 SDK 文本；新增测试断言这一点                                                        |

## Space 侧改动

- `package.json`、`apps/desktop/package.json`、`package-lock.json`：精确依赖 beta.8，lock 指向 Registry tarball，diff 为干净的 10 行。
- `kodax-runtime-compat.test.ts`：期望版本改为 beta.8，Registry tarball 正则同步；`file:` 分支保留给以后的联调。
- 应用内 `space_manual`（`space-manual-topics.ts`）按 beta.5–beta.8 全量更新：
  `runtime-host`（单 Host、Host 固定图片、Agent home 工作流、扩展确认、降级读根、`.unresolved/`、原生 Job 与慢速重试）、
  `troubleshooting`（启动失败的 bootstrap 错误行与 Job 排查，重启前记录进程列表）、`permissions`（扩展 `tool:before` 确认）、
  `workflow`（个人工作流读 Agent home）、`tools`（`visual_*` 归入 `read`）。新增 3 个手册测试。
- SDK 自己的 `kodax_manual` 不被 Space 覆盖：`buildSpaceManual` 只在同 id 主题上叠加 Space 内容。
- 文档：`USER_MANUAL.zh-CN.md`、README、PRD、HLD、DD、USAGE、BUILTIN_SKILLS、能力台账、迁移记录、
  Partner 集成记录、`FEATURE_LIST`、`SDK_PROVIDER_CREDENTIALS`、`KNOWN_ISSUES`、Issue 246 回归指南、`CHANGELOG`。

## 验收

2026-11-13，在 `main`（`3cd3394c` 之上的未提交改动）和 Registry beta.8 上运行。

| 检查                     | 结果                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 完整 `npm test`          | 发布脚本 153、Desktop 4,357、Schema 373 通过；0 失败                                                                                                                                         |
| 类型、lint               | 通过                                                                                                                                                                                         |
| 手册测试                 | `space-manual-topics.test.ts` 15/15（含 3 个新增）                                                                                                                                           |
| 源码 Electron E2E        | 第一轮 17 例中 16 通过，唯一失败见下节（过期渲染进程，非 beta.8）；重建后 `file-attachments` 3/3 通过。其余 5 个规格只在第一轮（旧渲染进程）和成品上跑过，没有在重建后的源码上重跑           |
| Windows 目录包           | `node scripts/pack.mjs --win --dir` 通过（无 `--allow-local-kodax`）：Registry 依赖核验、`smoke-pack` 全部检查通过                                                                           |
| 成品冷启动               | Renderer 5,603 ms 就绪；Runtime 26,965 ms 就绪；122 条历史子进程记录全部保留并移到 `.unresolved/`                                                                                            |
| 成品 E2E（win-unpacked） | 打包内置 `sdk-unified-contract` 7/7；另跑 10/10：启动恢复 3 例（无 Provider 下 none / transient / persistent Job 探测失败）、诊断导出、启动诊断、完整退出、`file-attachments` 3 例（含 GIF） |

### 一次误报：过期的渲染进程构建

第一轮源码 E2E 中 `file-attachments` 的 GIF 用例失败（选取 GIF 后没有出现图片 chip）。原因不是 beta.8：
直接运行 `e2e:run` 不会重建 `apps/desktop/dist`，而 dist 早于合并进来的 GIF 改动（`attachmentFiles.ts`、`BottomBar.tsx`），
旧渲染进程把 GIF 当普通文件引用。`pack.mjs` 同样不重建渲染进程，所以第一个目录包也带着旧渲染进程。
执行 `npm run build:smoke` 后重跑，GIF 用例通过，并重新打包，上表的打包结果都来自重建之后的产物。
之后要跑 E2E 或打包，用 `npm run e2e` 或先跑 `npm run build:smoke`，不要直接用 `e2e:run` 或 `pack.mjs`。

### 未验证

- 没有客户机器上的复测；杀毒或 CPU 负载下的时序没有验证。原因是否确为 PowerShell `Add-Type` 变慢，仍无证据。
- SDK 打包产物里仍有 PowerShell `Add-Type`，用于进程快照、剪贴板和 DPAPI，不在 Job 启动路径上。
- 没有 macOS/Linux 实机验收；未创建标签，也未发布安装包。
