# Issues 246 / 247 — 启动、自愈与离线回归

适用：当前源码与已发布的 Registry SDK `0.7.97-beta.9`（含 beta.8 的原生 Job 修复）；不是客户已安装版本的修复声明。

## 自动回归

- SDK `process-admission.test.ts`：并发准入串行；排队超时/取消及时返回且不能稍后启动；预取消没有后台未处理拒绝；已接管的启动取消必须等清理完成；readiness 与清理同时失败保留精确 supervisor 句柄，清理收敛前不能再启动。
- SDK `process.owner-exit.test.ts`：旧 owner 停止后继续启动，不因串行队列递归而死锁。
- SDK `process.test.ts` / `process.cleanup.test.ts` / `windows-job-supervisor.test.ts`：失败、取消、清理重试及 committed owner 保护；Job owner 现为内置原生可执行文件（`__daemon-job-supervise`），不再启动 PowerShell/`Add-Type`，测试覆盖暂停启动→入 Job→就绪文件、Job 清空后才退出、原生 supervisor 无法启动时回收临时文件。
- SDK `windows-job-identity.test.ts` / `.integration.test.ts`：原生 Job 查询；身份格式与原 SDK 一致；拒绝 Job 外进程、无效元数据、异常退出和不完整身份。
- Space adapter、taskDockAvailability、RuntimeStartupStatus：三次失败后进入“失败”状态并显示重试按钮，同时转入慢速后台重试（30 s、1 min、2 min、4 min，之后每 5 min）；显式重试清零并立即重来；所有不可用状态优先于空闲“就绪”。
- `tests/e2e/runtime-startup-recovery.spec.ts`：真实 Electron + Windows Job + SDK，禁止公网、空 Provider/扩展配置、全新 native cache；覆盖正常冷启动、首次失败恢复、连续失败后按钮恢复、启动及清理双失败；故障未恢复时从设置导出诊断，恢复后添加本地 HTTP 模型并实际发送消息。

测试通过测试预加载文件注入进程边界故障；生产代码没有跳过 Job 验证或强制成功的开关。Space 没有放大任何超时；SDK beta.8 把 Job 身份探针期限从 5 秒调到 10 秒（beta.8 CHANGELOG 原写“未放大超时”，beta.9 已更正）。

离线自动化在 Electron/Node 传输边界拒绝公网连接、仅允许 loopback，并清空 Provider 凭据、配置和 native cache；不是操作系统防火墙或物理隔离网络认证。客户内网环境仍按下方步骤验收。

## SDK 联调边界

当前 Space 精确依赖 Registry `@kodax-ai/kodax@0.7.97-beta.9`，它包含 beta.8 引入的原生 Job 验证与监督（SDK Issue 409）；beta.9 起启动错误只引用本次尝试的 `[Error]` 行，原生监督器记录自身失败，清理失败的提示说明重试或重启应用即可释放，lockfile 校验 Registry 字节。此前使用的本地 `kodax-ai-kodax-0.7.97-beta.7.tgz` 候选包已被取代；发布入口不再需要 `--allow-local-kodax`。

beta.7 的公开 API 改为同一 home 一个 Host，删除 launcher/owner-control 的 `profile` 参数；测试与工具脚本同步迁移为独立 home，凭据绑定的 profile 和历史诊断日志不变。官方 beta.7 不含本次 SDK 修复，因此依赖必须是 beta.8 或更高版本。

用户图片也改由 Host 保存不可变副本。Space 的当前视图与历史预览统一使用授权 item reader，不按 Host 路径读取本地文件；PNG/JPEG/WebP 校验实际内容及 MIME，保留分块摘要、尺寸与撤销访问检查。测试覆盖惰性读取，图片 I/O 不阻止输入投影或 observation 结束。

打包使用 `node scripts/pack.mjs --win --dir`，无需本地候选包开关。

## 验证记录（2026-11-12，Windows x64）

原始命令输出保存在工作区 `artifacts/diagnostics/startup-recovery-20261112/`，该目录不随产品发布。

| 范围                                                                    | 结果                                                        | 日志                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| 最终 Space 启动、重试、状态、诊断、手册、图片与退出 fixture 单元回归    | 350 通过，无取消                                            | `space-final-regression-green.log`                                |
| SDK 启动/containment 回归组                                             | 147 通过、1 跳过                                            | `sdk-regression.log`                                              |
| SDK state/manager/handoff 回归组（与前组可能重叠）                      | 106 通过                                                    | `sdk-state-regression.log`                                        |
| SDK 最终准入、原生诊断、全量失败相关用例                                | 33 通过，其余 345 条未选中                                  | `sdk-final-failures-rerun.log`                                    |
| 原生 Job 探针模块覆盖率                                                 | 语句/函数/行 100%，分支 87.87%                              | `native-probe-coverage-final.log`                                 |
| SDK native Windows 构建、bundle、自包含声明、tarball 审计               | 通过                                                        | `sdk-bundle-final.log`、`sdk-dts-final.log`、`sdk-pack-final.log` |
| 精确本地依赖验包、真实 Workers、122 条历史记录冷启动、多客户端退出/恢复 | 通过；退出/恢复 E2E 7 条通过                                | `pack-verified-final.log`                                         |
| 最终候选包：诊断导出、启动中退出、四种离线恢复、输出/图片/history       | 13 条 E2E 全部通过                                          | `packaged-recovery-final.log`                                     |
| 最终候选包额外两轮独立冷启动（含 122 条历史记录）                       | 均通过；Runtime 约 27 秒，包含固定 20 秒测试 hold           | `packaged-boot-repeat-1.log`、`packaged-boot-repeat-2.log`        |
| 包内 main 与最终构建 SHA-256                                            | 一致                                                        | `package-source-integrity.json`                                   |
| Space 类型检查、lint                                                    | 通过；lint 仅排除已有 `.tmp-issue222-legacy-wqaPWD/` 临时包 | `typecheck-final.log`、`lint-final.log`                           |

完整 SDK 跑次得到 20,556 通过、6 失败、93 跳过；它跨越本次修改过程，不是最终源码全量全绿的证明。六个失败项均纳入上述最终 33 条定向复测，全部通过；没有放大原测试或生产超时。完整 Space 早期跑次 desktop 为 4,333 通过、7 失败、13 跳过；失败的 SDK 接口、版本文字及图片路径假设已修正并单独复测，未再次重跑整轮。最终 350 条回归还更新了旧图片文件 I/O 挂起 fixture，验证 Host 惰性预览下的相同输入投影/退休契约。

一个中间包的 boot smoke 曾在 Space 日志建立前以 code 1 退出（`pack-final.log`）。该次未采集 stdout/stderr，无法确认原因；不能归因于网络或客户配置。boot smoke 已补充有界进程输出捕获。最终重新构建且 main 摘要一致的候选包通过启动、上述 20 条打包 E2E 和额外两轮独立冷启动；不把中间失败删除或写成全量全绿。

## Standards

独立静态复核未发现任意路径访问放宽：图片仍经 session 授权 reader、itemId、附件索引读取，读取后再次检查 token 是否撤销。增量复核发现实际 MIME 的 GIF 白名单可绕过投影的三种格式限制（P2），已删除并补拒绝测试；SDK 队列取消、独立 home 与历史证据保留的复核无新增问题。未解决 findings：0。

## Spec

独立需求复核曾发现预取消产生未处理拒绝，以及取消在清理结束前返回；两项均先复现再修复。最终复核确认排队超时/取消不提前释放串行准入、不在后台继续启动；接管后取消遵循内部清理完成边界。未解决 findings：0。

## 客户环境验收

1. 在独立测试数据目录安装包含修复 SDK 的 Space 候选包；断开公网，保留内网。不要操作客户原有 runtime、owner 或恢复记录。
2. 未配置 Provider、没有 extensions 目录时，确认窗口可用、本地服务最终就绪；进入设置不需要模型。
3. 配置私有模型的 Base URL、协议、模型名和必要凭据，发送消息；确认不会依赖公共 Provider。
4. 故障期间摘要不得同时显示“就绪”；持续故障应显示本地服务受影响的功能、错误详情和“重试启动”。修复环境后原窗口重试可用。
5. 故障状态导出 ZIP，检查 manifest 中安装 SDK 版本与日志来源，bootstrap、daemon 和 Space 主日志能串联同次失败；核对凭据已脱敏。
6. 关闭/退出并重开；确认旧 Host/其他客户端仍受保护，没有重复后台 Host。

客户原始两次日志证明 PowerShell Job membership 探针约 5 秒超时；尚不能证明其慢因是断网、杀毒、策略或系统负载。没有 Provider/扩展不是本地服务失败的合理前置条件。
