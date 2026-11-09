# KodaX Space 运行与开发指南

> 2026-11-09 发布准备：版本基线更新为 Space `0.1.47-alpha.5` / npm Registry `@kodax-ai/kodax@0.7.97-beta.4`，四个 workspace 与 lockfile 统一版本。当前公共接口以 [beta.4 适配](releases/kodax-beta4-space-adaptation.md)为准；发布门与验证状态见 [alpha.5 发布记录](releases/v0.1.47-alpha.5-release-readiness.md)。本版为预发布，稳定版仍是 Space v0.1.46 / KodaX 0.7.96；带日期的旧记录保留原语境，本轮不替换公开标签或安装包。

> 2026-11-05 工作树更新：SDK 已锁定正式 Registry `0.7.97-beta.2`，当前实现与验收以 [beta.2 接入记录](releases/kodax-beta2-space-adaptation.md) 为准；下列 alpha.4/beta.1 基线是已发布版本记录，本轮不替换公开标签或安装包。Workflow 作为用户显式单次功能，不再提供保存、修改等管理。

> 更新日期：2026-11-04。版本基线为 Space `0.1.47-alpha.4` / npm Registry `@kodax-ai/kodax@0.7.97-beta.1`。本版为预发布，稳定版仍是 Space v0.1.46 / KodaX 0.7.96；发布门与验证状态见 [alpha.4 发布记录](releases/v0.1.47-alpha.4-release-readiness.md)，SDK 接缝和外部验证限制单独保留。
> 当前公共接口以 [beta.1 接入](releases/kodax-0.7.97-beta.1-integration.md)、[完整验收](releases/kodax-beta1-full-acceptance.md)和[补审修复](releases/kodax-beta1-claude-followup.md)为准。带日期的旧版本设计保留历史语境。

Coder 与 Partner 通过 RuntimeHostAdapter 使用 SDK 公开 Product 输入、observeView、历史分页/搜索、statistics 与 lifecycle 契约。当前 view 与历史窗口独立，Main/Renderer 不从普通正文 delta 或 journal/replay 重建第二份聊天。普通 Coder 草稿在首个有效输入保存后持久化；侧栏使用真实消息时间，历史空记录只读确认后隐藏。Space 手册入口为 `space_manual`，内建 `kodax_manual` 保留 SDK/CLI 机制。

SDK 与 Host 分别校验 `productClient:1`、`sessionDrafts:1`、`sandboxRuntime:11`、`runtimeAutoModeGuardrail:6`、`sharedSessionSettings:2` 和 `effectiveConfig:1` 等所需契约；Host 还校验 `providerCredentialBroker:2`，不能以版本号代替能力检查。Windows native bundle 整体解包并校验 manifest hash，沙箱设置需用户显式触发；保留已有凭据、权限和退出恢复；Partner 经同一共享 Host 使用 Agent 模式、消费时业务绑定和正常 shell/write/子 Agent 能力。可选 Artifact 包尚未发布，不把底层渲染支持当成新增桌面 PPT 能力。

## 1. 环境要求

- Node.js 22.12+（项目通过 `.nvmrc` 固定到 22.23.1，CI 读取同一文件）。
- npm 10+。
- Windows、macOS 或 Linux 桌面环境。
- 安装 native dependencies 所需的系统构建工具；Windows 通常需要 Visual Studio Build Tools。

```bash
git clone https://github.com/icetomoyo/KodaX-Space.git
cd KodaX-Space
npm install --include=dev
```

KodaX Space 是 npm workspace monorepo。不要只在 `apps/desktop` 中安装依赖，否则 workspace package、Electron native module 与根脚本可能不一致。

根、desktop manifest 与 lockfile 记录一个精确的 KodaX 版本。常规 Release/CI 使用
Registry 包；预发布测试可在 lockfile 中解析到仓库内带版本号的 vendor tgz，并固定其
sha512 完整性，通过 `npm run build:test-kodax` 显式构建。开发联调可用
`npm run link:kodax` 连接同级源码；打包沿用既有依赖一致性检查，
要求两个 manifest、lockfile 与安装包解析同一个版本和完整性，不再增加
“KodaX 必须 ≥0.7.78”或包元数据生命周期门禁。Runtime 连接按实际能力协商：
Space 管理的 daemon 必须返回 `daemonOrphanExit:1`，并继续要求
`permission:grant-admin`、`interruptInput:1`、`actorControlPlane:1`、
`contextCompaction:3`、`transcriptPaging:1`、`transcriptSearch:1`、
`skillLearningLoop:1`、`integrationConfigResilience:1` 和
`runtimeAutoModeGuardrail:6`、`actorSettlementConvergence:2`。`@kodax-ai/kodax/sandbox` 通过独立 facade probe
验证，不能用版本号冒充 backend readiness。不得伪造 lockfile URL/SRI；本地测试包必须
使用 `kodax-ai-kodax-<version>.tgz` 命名、随 checkout 提供，并由 lockfile SRI 锁定内容。
普通 `npm run build` 和正式发布入口始终拒绝本地 tgz。

## 2. 启动方式

### 2.1 开发模式

```bash
npm run dev
```

该命令协调 Vite renderer、Electron main watch、native dependency ABI 和桌面进程。需要调试界面时优先使用它，不要分别手工启动多个子进程。

### 2.2 正式安装包

普通用户从 [GitHub Releases](https://github.com/KodaX-AI-dev/KodaX-Space/releases/latest) 获取安装包：

| 平台    | 产物                        |
| ------- | --------------------------- |
| Windows | NSIS Setup、Portable、zip   |
| macOS   | universal dmg，或按架构构建 |
| Linux   | AppImage、deb               |

当前公开构建未经过面向公众的系统签名渠道，首次启动可能需要在 SmartScreen 或 Gatekeeper 中确认可信来源。

## 3. 配置与数据目录

```mermaid
flowchart TD
    Root["profile root<br/>默认 ~/.kodax"] --> Core["config.json<br/>核心运行时配置"]
    Root --> Integrations["integrations/<br/>mcp.json / extensions.json / a2a.json"]
    Root --> Shared["KodaX 共享状态<br/>sessions / skills / handoffs"]
    Root --> Space["space/<br/>UI 状态、项目、日志"]
    Root --> Runtime["runtime/<br/>Runtime daemon run/event journal"]
```

| 路径或变量                               | 作用                                        | 说明                                                                                                               |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `~/.kodax/config.json`                   | Provider、permission、compaction 等核心配置 | CLI/SDK/Space 共用；旧 Auto engine/timing 与 `sandbox.envPass` 输入已失效；不再把 MCP/A2A/Extension 当作新写入字段 |
| `~/.kodax/integrations/mcp.json`         | 用户 MCP server 声明                        | 严格 `version: 1` + `servers`；CLI/SDK/Space 共用                                                                  |
| `~/.kodax/integrations/extensions.json`  | 受管理 Extension 路径                       | 严格 `version: 1` + `paths`；Space 加载仍需 `KODAX_SPACE_ENABLE_SDK_EXTENSIONS=1`                                  |
| `~/.kodax/integrations/a2a.json`         | Runtime A2A registration                    | 由 KodaX Runtime 持有                                                                                              |
| `<project>/.kodax/integrations/mcp.json` | 项目 MCP 覆盖                               | Space 项目兼容层；同名项目 server 优先                                                                             |
| `~/.kodax/sessions/`                     | 会话历史                                    | CLI/SDK/Space 共用                                                                                                 |
| `~/.kodax/skills/`                       | 用户 Skills                                 | 项目也可有项目级 Skills                                                                                            |
| `~/.kodax/handoffs/`                     | 桌面 handoff inbox                          | 用于上下文连续性                                                                                                   |
| `~/.kodax/space/`                        | Space UI 和桌面专属状态                     | 包含 logs、state 等                                                                                                |
| `~/.kodax/space/settings.json`           | Space versioned preferences                 | version 3 保存 `coderRuntimeMode`；不属于 KodaX 核心配置或 integrations                                            |
| `<profile-root>/runtime/`                | Shared Runtime state/journal                | Coder daemon runs；默认实际为 `~/.kodax/runtime/`                                                                  |
| `KODAX_HOME=<abs>`                       | 改变 SDK 共享数据根                         | 必须在应用启动前设置                                                                                               |
| `KODAX_PROFILE_DIR=<abs>`                | 让 Space 和 SDK 使用一个独立 profile        | 该绝对路径本身就是 profile 根，不再追加 `.kodax`                                                                   |
| `KODAX_TEST_ONBOARDING=1\|<safe-id>`     | 测试隔离 profile                            | 强制写入系统临时目录，禁止指向真实用户数据                                                                         |

若同时使用 `KODAX_PROFILE_DIR`，Space 会在首次加载 SDK 前将 `KODAX_HOME` 对齐到该 profile。相对路径会被忽略；测试模式优先级最高。

KodaX 0.7.96 的命令沙箱默认继承宿主环境，同时继续阻止固定的 KodaX/Electron 执行控制
变量。旧 `config.json#sandbox.envPass` 输入已经失效；Space 不再编辑、写入或向任何 Run
投影该字段。读取旧配置时只把它当迁移遗留，不恢复旧的环境 allow-list 语义。

沙箱诊断必须从 Settings → Runtime 的宿主控制面直接执行，或在宿主终端运行
`kodax sandbox doctor`；不要让模型通过 Bash 工具嵌套执行 doctor。Windows 受限账号按设计
不能读取宿主持有的 ASRT 状态，嵌套 doctor 因此不能代表机器级 readiness，也不应通过放宽
控制状态权限来“修复”。Space 启动、后台检查和普通工具调用不会自动请求 UAC；只有用户
显式确认 Setup 时才调用 SDK activation，完成后再以真实 target-start probe 验证结果。

从旧版升级时，`config.json#mcpServers` 与 `config.json#extensions` 仍可只读回退，但不应继续作为新配置位置。Settings → Runtime 会调用当前 KodaX SDK 的 `planLegacyIntegrationMigration()` 展示迁移计划，并通过 `migrateLegacyIntegrationConfig()` 提供“迁移集成配置”按钮；它只创建缺失文件，不覆盖已有目标，也不删除旧字段，成功后会重载 MCP。命令行也可先运行 `kodax integrations migrate` 查看计划，再运行 `kodax integrations migrate --apply` 创建独立文件；确认独立文件有效后，才使用 `kodax integrations migrate --apply --cleanup-legacy` 显式清理旧字段。A2A 没有旧 `config.json` 迁移源，始终以 `integrations/a2a.json` 为权威配置。

KodaX daemon watcher 对无效集成更新保留 last-known-good。Space 以有界周期读取
daemon management health，仅在健康指纹变化时刷新投影；损坏一个可选 integration
文件不会让 Coder 断线，修复文件后 Settings 通常会在数秒内自动恢复 healthy。轮询错误
只保留上一份健康状态并记录一次有界警告，不会把核心 Runtime 标记为不可用。

## 4. 共享 Runtime Host

SDK beta.1 接入后，Coder 与 Partner 共同使用 SDK 共享 Host，Space 通过公开 Product/Runtime 契约接入。原 Embedded 切换入口已撤下，旧偏好由 SDK 的单向迁移处理；不能删除 owner-policy、锁或建立私有 Runtime 来接管会话。连接失败时保留任务与原始身份，按界面诊断修复后重试，活动任务、其他客户端或所有权未知时保持保护。

Coder 可在安全空闲时切换 Agent、Coding 和实验性 Script；Partner 默认 Agent，保留通用 shell、写文件和子 Agent，实际操作仍受权限、审批、沙箱和业务绑定约束。选择值与实际 Run 装配结果分开显示。配置“已保存”不表示活跃任务已生效，Settings 展示 Host 报告的 immediate/next_run/extension_reload/restart；缺失保持未知。

专家默认 Skill 与排队消费时点还有公开 SDK 接缝待补，见 [候选交接](releases/kodax-alpha12-partner-sdk-handoff.md)。当前源码准备不代表 SDK 已发布或全部专家已启用；正式依赖锁与安装包验收在发布通知后完成。现有凭证迁移固定原账号来源，迁移失败不切换账号。

### Windows 后台托盘与跨平台退出

Windows 默认启用后台托盘。F140 让主窗口关闭行为可在 Settings → Preferences 中设为
每次询问、最小化到托盘并保留 Runtime，或请求彻底退出；首次关闭默认询问，
并可记住选择。最小化到托盘会销毁 BrowserWindow/renderer，但保留轻量 Electron
main、托盘和 Runtime 客户端连接。托盘可重建窗口、只关闭界面，或请求安全的彻底退出；
不再提供会让 Space 自动拉起的 daemon 失去可见控制面的“仅退出 Space”动作。

Windows 彻底退出、macOS `Cmd+Q` 和 Linux 最后窗口退出使用同一生命周期：先关闭
Coder admission 并检查 blocker，再尝试 Runtime 的安全停止。active/queued/pending 工作
或其他客户端阻止安全停止时，对话框提供“保持 Space 开启”和“强行关闭”；关闭对话框
等同保持开启。强行关闭会取消当前 Space 所属的 Session Run、Agent Turn、Workflow、
外部 Agent、交互与排队输入，然后完全退出 Electron；其他客户端的任务及其 Runtime
不会被停止。共享 Runtime 的取消依据已认证的 Space principal、精确 Run/Agent ID 和
Workflow source Run，不把 Session ID 当作客户端所有权。安全准备失败时也会提供相同
的两个选项；取消、daemon 停止或最终清理即使未在有界等待内确认，也不会再次弹窗或
重新拉起 Space。自动化 fixture 可设置
`SPACE_DISABLE_TRAY=1` 获得确定性的关闭即退出行为；这不是 renderer 可写的产品偏好。
若托盘初始化失败，应用仍走相同的 complete-exit gate。

`daemonOrphanExit:1` 仅对 Space 新拉起的 daemon 启用 30 秒 orphan idle-exit。
最后一个客户端异常断开后，daemon 在没有其他客户端且任务空闲时自停；仍有任务则等到终态后重试。
旧版残留优先执行 `kodax daemon stop --profile coder --timeout-ms 10000 --json`。CLI
不可用时从 `${KODAX_HOME:-~/.kodax}/runtime/daemon/coder/daemon.json` 读取 PID，
用 `ps` 核验 `daemon serve --profile coder` 后发送 `kill -TERM <PID>`；不要按共享
进程名执行 `killall`。

Settings → Preferences 的 Terminal Shell 选择会同时作用于 Space PTY 与 Coder
命令工具。Electron main 从选中 shell 的登录环境解析 `PATH`，剥离常见密钥变量后再
建立执行环境；若 shell 不可用则显示明确诊断，不静默切到不同的执行语义。

## 5. 常用开发命令

| 目标                        | 命令                                        |
| --------------------------- | ------------------------------------------- |
| 启动开发环境                | `npm run dev`                               |
| 类型检查                    | `npm run typecheck`                         |
| Lint                        | `npm run lint`                              |
| 全量单元/集成测试           | `npm test`                                  |
| Desktop 单元测试            | `npm test -w @kodax-space/desktop`          |
| IPC schema 测试             | `npm test -w @kodax-space/space-ipc-schema` |
| 构建 renderer/main/packages | `npm run build:smoke`                       |
| Playwright E2E              | `npm run e2e`                               |
| 有界面 E2E                  | `npm run e2e:headed`                        |
| 校验 builtin skill 来源锁   | `npm run skills:check`                      |
| 从审定上游更新 builtin      | `npm run skills:update`                     |
| 打包产物检查                | `npm run smoke:pack`                        |
| packaged boot smoke         | `npm run smoke:boot`                        |

建议提交前按下面顺序执行：

```bash
npm run typecheck
npm run lint
npm test
npm run e2e
npm run build:smoke
```

高风险的 main/IPC/session/runtime 改动还应执行对应人工测试指导，例如 [v0.1.31 测试指导](test-guides/FEATURE_116_v0.1.31_TEST_GUIDE.md)。

Space 自有 builtin skill 的来源、许可证、补丁和逐文件哈希由
`resources/builtin-skills.sources.json`、`resources/builtin-skill-patches/` 与
`resources/builtin-skills.lock.json` 共同固定。正常更新必须使用 `npm run skills:update`，
审阅完整 diff 后再执行 `npm run skills:check`；不要直接修改生成的
`resources/builtin-skills/`。完整流程见 [builtin skill 维护说明](BUILTIN_SKILLS.md)。

## 6. Native module ABI

Desktop 单元测试需要 Node ABI，Electron 启动与 E2E 需要 Electron ABI。项目脚本会自动调用：

```bash
node scripts/ensure-sqlite-native.mjs node
node scripts/ensure-sqlite-native.mjs electron
```

不要并行运行会把同一个 native module 重建成不同 ABI 的测试/构建任务。典型症状是 `better-sqlite3` 或其他 native addon 报 `NODE_MODULE_VERSION` 不匹配。出现时，停止并行进程，再通过目标命令让脚本重建到正确 ABI。

`.npmrc` 启用 `engine-strict`，因此低于 Node 22.12 的安装会直接失败。Electron 与
electron-builder 二进制下载使用项目配置的镜像；若组织网络要求自建镜像，请在受控 CI
环境中覆盖对应 npm 配置，不要提交临时开发机路径。

## 7. 构建与打包

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

跨平台产物最好在对应系统或 CI runner 上生成。发布前至少确认：

1. 根/desktop `package.json`、两份 lock 视图、已安装 KodaX、应用 Version IPC、CHANGELOG 和 feature doc 版本一致，且 SDK 解析为带 Registry URL/SRI 的同一个精确正式版本；
2. `npm run build:smoke` 通过；
3. pack 自动导入所有 KodaX public facade，按 Node ancestor 规则验证完整传递依赖，确认
   `app.asar.unpacked` 中的 native SQLite，并实际加载 `better-sqlite3`；
4. `npm run skills:check` 通过，打包后的 Space builtin 文件集/字节与 lock 完全一致，Huashu 三个有序补丁及大小写不敏感的推广签名禁词门禁有效，SDK builtin Markdown 也仍在 `app.asar`；
5. Provider、创建会话、发送消息、后台 Session 权限/AskUser、session restore、fork/rewind/compact 完成人工冒烟；
6. Windows 本地产物由 pack 自动运行真实 `win-unpacked/KodaX Space.exe` boot smoke，
   CI 的 Windows/macOS/Linux 产物均通过对应 package/boot smoke；
7. Windows 人工验证主/Artifact 窗口图标、托盘关闭/重开/两种退出语义，以及重复查询时不出现瞬时 console 窗口；KodaX 0.7.77 保留非交互子进程隐藏，任何重现都按回归处理；
8. 正式发布后再把文档中的“开发基线”改成“公开正式版”。

当前源码使用 `electron-builder@26.15.3` 和 `node-gyp@12.2.0`，Windows CI 可运行在
`windows-latest` 的 Visual Studio 2026 工具链上。`afterPack` 通过固定的
`resedit@1.7.2` 直接修改 PE icon/version resources，不再扫描或启动缓存中的
`rcedit.exe`。相关依赖和资源门禁失败必须让安装/打包失败，不能用 `|| true` 吞掉。

正式 `build:pack` 会下载 lockfile 锁定的 KodaX Registry tarball 并校验 URL、SRI 与安装
字节。当前源码通过 `EnvHttpProxyAgent` 读取标准代理环境；代理凭据不会写入日志。下载和
dispatcher teardown 都有界，超时或非法 URL 会明确失败并结束进程。如果构建停在
`scripts/pack.mjs`，先核对 `HTTPS_PROXY`/`NO_PROXY` 和 Registry 连通性，再运行
`npm run test:release`；不要用扩大超时或跳过完整性校验掩盖网络问题。

[alpha.2 发布准备](releases/v0.1.47-alpha.2-release-readiness.md)记录当前候选；历史
[v0.1.44 发布记录](releases/v0.1.44-release-readiness.md)与
[v0.1.34 发布记录](releases/v0.1.34-release-readiness.md)等继续保留当时事实。v0.1.45 已通过
精确 Registry 依赖一致性、`conversationHistory:2`/`runtimeExitSettlement:2`/`sandboxRuntime:5` 契约、完整依赖闭包、
native SQLite load、物理 sandbox helper/doctor、真实 packaged boot 和 GitHub CI 门禁后
发布。

## 8. 排障

| 现象                          | 首先检查                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 没有 Provider / API key       | Settings → Providers，检查已选来源、auth.json 权限和迁移状态；需要时明确选择环境变量或重试原凭证，不会自动换账号         |
| 会话或配置出现在错误 profile  | 启动前的 `KODAX_HOME`、`KODAX_PROFILE_DIR`；不要在 SDK import 后修改                                                     |
| Runtime run 失败              | 版本信息、runId、`~/.kodax/space/logs`、Runtime status/capability snapshot                                               |
| Packaged daemon 启动即退出    | `~/.kodax/space/logs`；必要时把 `scripts/diagnose-packaged-daemon.cmd` 复制到 extracted app 目录前台复现                 |
| MCP 工具不可见                | MCP panel 的 Refresh/Reload、server diagnostics；MCP 子进程由 Space 管理                                                 |
| ASRT 显示需要设置或不可用     | Settings → Runtime → 命令沙箱（ASRT）先刷新 doctor；Windows 按显式确认完成一次性设置，macOS/Linux 按指引安装依赖后再刷新 |
| E2E 启动失败且提到 native ABI | 结束并行测试，运行 `node scripts/ensure-sqlite-native.mjs electron`                                                      |
| Node 单测提到 native ABI      | 运行 `node scripts/ensure-sqlite-native.mjs node`                                                                        |
| UI 状态损坏                   | 先备份 `~/.kodax/space/`，检查日志；最后手段才重置 `state.json`                                                          |

提交问题时请包含版本、操作系统、复现步骤、是否使用独立 profile、相关日志和脱敏截图。已知问题见 [KNOWN_ISSUES.md](KNOWN_ISSUES.md)。

`scripts/diagnose-packaged-daemon.cmd` 不创建私有执行 owner，会按当前
`KODAX_PROFILE_DIR`/`KODAX_HOME` 前台启动与正式包相同的 Electron→Node→KodaX CLI
链路，并在应用目录生成 `kodax-daemon-bootstrap-diagnostic.log`。该日志可能含本机路径、
profile 位置和 Runtime 错误；分享前必须人工脱敏。

## 9. 文档入口

- [文档中心](README.md)
- [用户使用手册](USER_MANUAL.zh-CN.md)
- [产品需求文档](PRD.md)
- [高层设计](HLD.md)
- [KodaX 能力台账](KODAX_CAPABILITY_LEDGER.md)
- [Feature 路线图](FEATURE_LIST.md)
- [Builtin skill 维护说明](BUILTIN_SKILLS.md)
- [v0.1.34 发布就绪清单](releases/v0.1.34-release-readiness.md)
- [v0.1.33 发布就绪清单](releases/v0.1.33-release-readiness.md)
- [v0.1.33 F141 人工测试指导](test-guides/FEATURE_141_v0.1.33_TEST_GUIDE.md)
- [v0.1.33 F142 人工测试指导](test-guides/FEATURE_142_v0.1.33_TEST_GUIDE.md)
- [贡献指南](../CONTRIBUTING.md)
