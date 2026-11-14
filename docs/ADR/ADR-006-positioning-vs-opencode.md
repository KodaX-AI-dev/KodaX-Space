# ADR-006: 相对 opencode 的定位 + 能力对标 backlog

- **Status**: Accepted (planning / research)
- **Date**: 2026-05-29
- **Companion**: [PRD](../PRD.md) · [HLD](../HLD.md) · [FEATURE_LIST](../FEATURE_LIST.md) · [ADR-001](ADR-001-shell-electron.md) · [ADR-003](ADR-003-kodax-integration-in-process.md) · [ADR-004](ADR-004-panel-model.md)
- **Source**: 对 `sst/opencode` monorepo 1.15.12（本地 checkout `c:/Works/PubGItProj/opencode`）做的 20-agent 并行能力挖掘 + gap 分析 + 对抗式批判 + 综合规划；方法论与统计见文末附录。

## Decision

将 opencode（`sst/opencode`）作为同类工具的**主要竞争对手参考点**，沿 5 个 gap cluster（桌面健壮性 / 流式 UX / provider 智能 / 可观测 / UI 基础设施）做能力补齐。**拒绝** opencode 走过的 HTTP sidecar / ACP 架构路径 —— 留在 ADR-003 钦定的 in-process SDK import。

明确把 **"极简且智能"** 作为复核新增 feature 的设计 lens：用户面前要少配置、少决策；后台用 SDK 智能去补全。具体准则见 §7。

OC-01 ~ OC-50 是发现的 backlog，**不是立即承诺**；§3 路线图标记了优先级。最紧急的两个是：

- **OC-01（单实例锁）** —— 数据正确性 bug，两个 Space 进程能同时写 `~/.kodax/`，5 行修复
- **OC-26（i18n）** —— PRD §6.1 硬要求中/英；越晚做回填上百个硬编码字符串代价越大

## Context

下文保留原始研究全文（§0 总体判断 ~ §7 极简且智能 lens + 附录方法论），作为本 ADR 决策的事实底座 + 后续 feature 抽取来源。

---

## 0. 总体判断

KodaX Space 在架构上与 opencode 已经良好区隔，而且 **opencode 自身的演进史反向验证了 KodaX 的关键决策**：

> 🎯 opencode 是**从 HTTP sidecar 架构迁移到 in-process Electron** 的——它在代码里直接承认 sidecar 不稳定。这正是 KodaX [ADR-003](../ADR/ADR-003-kodax-integration-in-process.md) 第一天就选的 in-process SDK import。KodaX 绕过了 opencode 踩过的整整一类坑（sidecar/HTTP/ACP 协议层、监听端口、协议协商）。

**KodaX 已领先的维度**（不在本次新增范围）：in-process 架构、12+ provider 中立（F004）、session fork/rewind 持久化（F033/F038）、subagent tree（F037）、permission canonical 3-mode + typed-CONFIRM（F029/ADR-005）、typed Zod IPC 契约。

**5 大 gap 集群**（全部可在不违反 shell-not-engine 的前提下补齐）：

1. **桌面健壮性** — 单实例锁、崩溃恢复、优雅退出超时、系统 CA/代理（企业）
2. **流式 UX 质量** — 虚拟化消息列表、markdown LRU 记忆化、工具分组区分、压缩分隔线
3. **provider/model 智能** — 能力矩阵、成本元数据、key 来源枚举、model 名规范化
4. **会话导出与可观测** — 结构化 JSON/HTML 导出、每轮文件变更、分页会话列表
5. **UI 基础设施** — React i18n（中/英，PRD §6.1 硬要求）、CSS token 主题层、命令面板、设置弹窗

> ⚠️ **最紧急**：[OC-01](#oc-01--单实例锁--二次启动聚焦) 单实例锁是一个**数据正确性 bug**——当前两个 Space 进程能同时写 `~/.kodax/`，违反 HLD §10.3「No-duplicate-session-truth」。5 行修复，应优先做。
> i18n（[OC-26](#oc-26--react-i18n-中英)）必须早做，否则上百个硬编码字符串后期回填代价巨大。

> 📐 **本文档经「极简且智能」哲学复核**（用户 2026-05-29 钦定，见 [[minimal-intelligent-philosophy]]）：§2 是原始对标设计；经复核后的 feature 瘦身/重塑、8 条设计准则、9 个新增智能 feature（`KX-I-*`）与反复杂度规则见 **§7 极简且智能 lens**。§3 路线图已反映复核结果。一句话：**opencode 用"配置"回答能力，KodaX-Space 用"智能"回答——对用户极简，对内很智能。**

---

## 1. 能力对标表

| 维度 | opencode | KodaX Space | 判定 |
|---|---|---|---|
| in-process 架构（无 sidecar/ACP/HTTP server） | 从 HTTP sidecar 迁移而来 | ADR-003 第一天即 in-process，全 TS 端到端 | ✅ KodaX 领先 |
| session 连续性（fork/rewind/持久化/lineage） | 接后端，无逐轮 fork 选择器 | F033+F038 完成（in-memory + 持久化） | ✅ KodaX 领先（缺逐轮 fork 选择器） |
| provider/model 管理（12+ provider/能力矩阵/成本） | 锁定 Anthropic；部分 models.dev 元数据 | 12+ provider 完成（F004）；缺能力矩阵/成本/来源枚举 | ✅ KodaX 领先（缺元数据层） |
| permission（3-mode/always-allow/danger 确认） | ask/allow/deny + session/project/config 分层 | F007+F029+ADR-005 完整 + typed-CONFIRM | ✅ KodaX 领先 |
| subagent/多 agent 可视化 | 后台 job 队列 + task spawn UI | F037 subagent tree 完成 | ✅ KodaX 领先（缺后台 job 队列 + 计时/取消） |
| 桌面健壮性（崩溃恢复/优雅退出/单实例） | 三者齐全 | **三者全缺**（仅 before-quit + disposeAll） | 🔴 gap |
| 自动更新（后台下载/装前确认/回滚） | electron-updater，autoDownload=false | 已规划 F022（v0.1.3） | 🟡 把 opencode 细节并入 F022 |
| 代码签名 & notarize（hardened runtime/entitlements） | hardenedRuntime + JIT/dyld entitlements + per-channel signtool | 已规划 F027（v0.1.5） | 🟡 entitlements 细节并入 F027 |
| 会话分享/导出 | 云 share URL（DO+R2）+ public viewer + live sync | PRD §5.1.9 要求本地 JSON/MD 导出，未建 | 🟡 gap（本地化适配） |
| 流式 UX（markdown 渲染/auto-scroll/虚拟化） | virtua 虚拟化 + markAuto 守卫 + per-block LRU + morphdom | `Array.map()` 无虚拟化；auto-scroll 缺 markAuto 守卫；无 LRU | 🔴 gap |
| 工具卡渲染（分组/可扩展注册表/context vs action） | ToolRegistry.register + context/action 分组 + rAF 批量 | 单体 ToolCallCard switch；全归"Ran N commands" | 🔴 gap |
| 会话 diff 审阅（多文件/逐轮/批量批准） | 完整 SessionReview + per-file 手风琴 + ± 角标 | 单文件 DiffPanel（F009） | 🟡 gap |
| i18n/本地化（中/英） | 16+ locale + 自动检测 + 持久化覆盖 | 字符串硬编码（中英混排） | 🔴 gap（PRD §6.1 要求） |
| 主题系统（CSS token/命名调色板） | OKLCH 算法 token + 30+ 主题 + 零闪烁 CSS var | 3-mode 开关已建（ThemeToggle.tsx），无 token 层 | 🟡 gap（= F019 补全） |
| 企业网络（系统 CA/HTTP 代理转发） | tls.getCACertificates + http.setGlobalProxyFromEnv（Node 24） | 两者皆无 | 🟡 gap（企业 P1/P3） |
| 命令面板 + keybind 编辑器 | 全局 Mod+Shift+P + 命令注册表 + 可编辑 keybind | 仅 session 内 SlashCommandPopover + 静态 HelpOverlay | 🟡 gap |
| MCP 管理（启停/log/tool catalog/OAuth） | 完整 MCP 生命周期 + OAuth device flow | F036 完成（read-only）；F039 规划（v0.1.7，等 SDK） | 🟡 gap（已规划） |
| 会话可观测导出（JSON/MD/HTML） | 云 share URL（不兼容本地优先）；无本地文件导出 | PRD §5.1.9 要求本地导出；HTML 自包含导出为新增高价值 | 🔴 gap |
| CI/打包（多渠道 dev/beta/prod + Nix 可复现） | OPENCODE_CHANNEL + per-channel appId/icon/feed + Nix flake | 单渠道（unsigned dev）；F027 规划签名；多渠道/Nix 未规划 | 🟡 gap |
| 日志（结构化 per-run 文件/轮转/crash reporter） | per-run 日志目录 + 7 天轮转 + Crashpad + Sentry source map | 仅 `console.*`；HLD §14 规划全部三项但未实现 | 🔴 gap |
| 云会话分享 / 云 sandbox VM 执行 | 有 | — | ⛔ KodaX 明确不做（见 §4） |

---

## 2. 推荐 feature 清单（OC-01 ~ OC-50）

> 每项格式：**类别 · 价值 · 工作量 · SDK 依赖 · 落地版本**，后接「做什么&为什么 / opencode 参考 / KodaX fit / 设计要点」。
> 详细的逐步实现设计在 feature 被 `/start-next-feature` 选中时按本仓库标准 design-doc 格式展开。

### 2.1 桌面健壮性 & 可靠性

#### OC-01 · 单实例锁 + 二次启动聚焦
**桌面健壮性** · 价值 **高** · 工作量 **S** · SDK **否** · 落地 **v0.1.2**
- **做什么&为什么**：`app.requestSingleInstanceLock()` + `second-instance` 事件聚焦已有窗口。当前两个 Space 进程可同时写 `~/.kodax/`，**会损坏 session 数据**——违反 HLD §10.3「No-duplicate-session-truth」，这是正确性 bug 不是增强。
- **opencode 参考**：`apps/desktop/electron/main.ts` requestSingleInstanceLock
- **KodaX fit**：直接落实 HLD §10.3 并发写安全。5 行修复、收益极高。
- **设计要点**：`main.ts` 在 `app.whenReady()` 后立即 lock，false 则 `app.quit()`；`second-instance` handler 调 `mainWindow.show()+focus()`。无 renderer 改动。

#### OC-02 · 渲染进程崩溃恢复弹窗
**桌面健壮性** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.3**
- **做什么&为什么**：监听 `render-process-gone` / `did-fail-load`，弹「重启 / 退出」对话框。否则 renderer 崩溃后用户对着白屏。
- **opencode 参考**：`apps/desktop/electron/main.ts` render-process-gone / did-fail-load handlers
- **KodaX fit**：HLD §4.3 崩溃恢复；与 OC-04 Crashpad 配套。
- **设计要点**：`dialog.showMessageBox` →「Relaunch」(`app.relaunch+exit`) /「Quit」。无 renderer 改动。

#### OC-03 · 优雅退出强制超时
**桌面健壮性** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.2**
- **做什么&为什么**：现有 before-quit 调 `disposeAll()` + `finally(app.exit(0))` 但无超时；若 LLM stream 卡住则挂起。加 6s `Promise.race`。
- **opencode 参考**：`apps/desktop/electron/main.ts` before-quit kill-fallback race
- **KodaX fit**：补全 `main.ts:290-299` 现有模式，防退出挂死。
- **设计要点**：`Promise.race([disposeAll(), timeout(6000)])`，`.finally(app.exit(0))` 照常触发。

#### OC-04 · Crashpad 集成 + per-run 日志轮转
**桌面健壮性** · 价值 **高** · 工作量 **M** · SDK **否** · 落地 **v0.1.5**
- **做什么&为什么**：`crashReporter.start({uploadToServer:false, compress:true})` → `~/.kodax/space/Crashpad/`；`console.*` 换 electron-log，per-run 子目录 + 7 天轮转。HLD §14 规划但未实现。
- **opencode 参考**：`apps/desktop/electron/main.ts` crashReporter.start；`packages/opencode/src/session/retry.ts` 日志模式
- **KodaX fit**：HLD §14 明确规划 M0/M1；与 F027 签名配套；per-run 目录支撑 OC-05。
- **设计要点**：electron-log `transports.file` → `~/.kodax/space/logs/<ISO>/main.log`，`maxFiles:7`。

#### OC-05 · 一键 debug 日志 ZIP 导出
**桌面健壮性** · 价值 **中** · 工作量 **M** · SDK **否** · 落地 **v0.1.5**
- **做什么&为什么**：Help 菜单项打包 `~/.kodax/space/logs/`（24h 窗 + 50MB/文件上限）+ Crashpad dump 成 ZIP（带 manifest.json）。Beta 后用户支持必备。
- **opencode 参考**：opencode debug-log-export（`@zip.js/zip.js` + 递归遍历）
- **KodaX fit**：PRD §7.1「API key 永不进日志」；与 OC-04 配套。
- **设计要点**：IPC `debug.exportLogs`，内存构建 ZIP → save dialog。

#### OC-06 · renderer 致命错误 IPC 通道
**桌面健壮性** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.3**
- **做什么&为什么**：`renderer.fatalError` 通道，从 React ErrorBoundary 调用，把结构化字段（message/url/version/platform）写进主进程日志。当前 renderer 崩溃无日志路径。
- **opencode 参考**：`apps/desktop/electron/preload.ts` FatalRendererError 通道
- **KodaX fit**：HLD §14 声明的机制目前缺失；与 OC-04 配套。
- **设计要点**：space-ipc-schema 加通道；`App.tsx` 顶层 ErrorBoundary `componentDidCatch` 上报。

#### OC-07 · macOS Dock 启动 working directory 修复
**桌面健壮性** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.2**
- **做什么&为什么**：从 Dock/Finder 启动时 `process.cwd()==='/'`，macOS 下 `process.chdir(os.homedir())`，防 shell-env 注入与 SDK cwd fallback 的隐性 bug。
- **opencode 参考**：`apps/desktop/electron/main.ts` cwd-fix-macos
- **KodaX fit**：直接影响 `shell-env-hydrate.ts` SDK spawn；3 行修复、dev 难复现（dev 总从终端启动）。
- **设计要点**：`main.ts` 顶部 `if (process.platform==='darwin') { try{process.chdir(os.homedir())}catch{} }`。

#### OC-41 · 会话删除 ACK 后延迟 dispose
**会话生命周期** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.3**
- **做什么&为什么**：`session.delete` 立即返回 ACK，`dispose()` 放 `setImmediate` 延迟执行，避免慢清理（文件句柄/MCP 关闭）拖延 renderer 确认。
- **opencode 参考**：`apps/desktop/electron/ipc/session.ts` deferred-instance-disposal
- **KodaX fit**：HLD §4.3；多 session 工作流即时反馈。
- **设计要点**：pending Map 防双重 dispose。

### 2.2 安全 & 可靠性

#### OC-09 · IPC schema 校验错误截断
**安全/可靠性** · 价值 **高** · 工作量 **S** · SDK **否** · 落地 **v0.1.2**
- **做什么&为什么**：`registerChannel()` / `pushToRenderer()` 把 Zod 错误信息截到 1024 字符。当前 renderer 提交的大粘贴（至 MAX_PROMPT_BYTES=1MB）校验失败会产生 1MB+ 错误串入日志，**泄露代码/误粘 API key**。
- **opencode 参考**：`apps/desktop/electron/ipc/register.ts` 校验错误截断
- **KodaX fit**：PRD §7.1「API key 永不进日志」；零依赖纯逻辑，最高置信度可迁移模式。
- **设计要点**：`packages/space-ipc-schema/src/utils.ts` 加 `truncateZodError(err, 1024)`，在 register.ts / push.ts 引用。

#### OC-10 · 主进程日志 secret 脱敏工具
**安全/可靠性** · 价值 **高** · 工作量 **S** · SDK **否** · 落地 **v0.1.3**
- **做什么&为什么**：中央 `redactApiKeys(str)`，写日志/IPC 错误前擦除已知 API key env 值。PRD §10.4 指标「API key 泄露=0」。
- **opencode 参考**：`apps/desktop/electron/providers/test-connection.ts`（已部分）+ opencode 完整脱敏
- **KodaX fit**：PRD §7.1 硬要求；test-connection.ts 已 strip HTTP body，缺的是 SDK 错误信息与 env 值路径。
- **设计要点**：`electron/kodax/secret-redact.ts`，从 `providers/catalog.ts` 收集 key env 名 → 读 `process.env` 值 → 替换为 `[REDACTED]`；挂 electron-log beforeLogging hook + OC-11。

#### OC-11 · `wrapSdkError` 人类可读会话错误
**安全/可靠性** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.3**
- **做什么&为什么**：从 SDK 错误的 `data.message|message|name` 抽取信息、原始挂 `.cause`，再 emit `session_error`，避免裸 SDK 错误对象到达 renderer。
- **opencode 参考**：`apps/desktop/electron/kodax/real-session.ts` sdk-error-interceptor
- **KodaX fit**：HLD §4.3；与 OC-10 配套（抽出的 message 过脱敏）。
- **设计要点**：`electron/kodax/sdk-error.ts` 新建，在 real-session.ts / session-store.ts catch 块应用。

### 2.3 企业网络

#### OC-08 · 系统 CA 证书 + HTTP 代理转发
**企业网络** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.5**
- **做什么&为什么**：启动时把系统 CA 注入 Node TLS，并把 `HTTP(S)_PROXY` 转发到 Node 全局 agent。企业 P1/P3 自托管 provider/公司代理用户否则 TLS 失败。
- **opencode 参考**：`apps/desktop/electron/main.ts` system-ca-certificates + env-proxy-forwarding
- **KodaX fit**：PRD §8 企业差异化（自托管 provider）；6-10 行。
- **设计要点**：`tls.getCACertificates('system')` + `tls.setDefaultCACertificates`（try/catch 兼容 Node 版本）；代理用 `global-agent`/`proxy-from-env`。

### 2.4 测试基础设施

#### OC-12 · E2E 测试隔离（KODAX_TEST_ONBOARDING）
**测试基建** · 价值 **高** · 工作量 **S** · SDK **否** · 落地 **v0.1.2**
- **做什么&为什么**：env var 把所有 `~/.kodax/space/` 路径重定向到 UUID 临时目录，使首次运行 provider 配置可被 E2E 测试而不污染真实数据。HLD §16 Playwright E2E 必需。
- **opencode 参考**：`apps/desktop/electron/main.ts` ephemeral onboarding test mode
- **KodaX fit**：HLD §16 要求 S1-S7 首启流程 E2E；CI 正确性要求。
- **设计要点**：`electron/kodax/data-paths.ts` `getSpaceDataDir()`；settings/projects/keychain/log 全走它。

#### OC-43 · 模块级 process.env 改惰性读
**测试基建** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.2**
- **做什么&为什么**：把 main 端 module-level `process.env` 读改成函数作用域惰性读，防测试 stale-config（`jest.resetModules` 不会重算顶层 const）与热重载问题。
- **opencode 参考**：`packages/core/src/flag/flag.ts` 集中惰性 Flag 注册表
- **KodaX fit**：补 OC-12；`host.ts` KODAX_FORCE_MOCK / real-session.ts 当前 module load 读 env。
- **设计要点**：`electron/kodax/flags.ts` get-accessor，测试改 stub 而非 env。

#### OC-44 · Playwright mock-server E2E 框架
**测试基建** · 价值 **高** · 工作量 **M** · SDK **否** · 落地 **v0.1.5**
- **做什么&为什么**：拦截所有 IPC 事件、返回可配置静态+流式响应（含 streamed session 事件），使 CI 离线 E2E 不需跑 KodaX SDK。
- **opencode 参考**：`packages/app/e2e/utils/mock-server.ts` + session-timeline.fixture.ts
- **KodaX fit**：HLD §16；当前 MockKodaXSession 较低保真；mock 框架可测复杂流式/权限流。
- **设计要点**：`apps/desktop/electron/test/e2e/mock-ipc.ts` `MockIpcHarness`；与 OC-12 配套。

### 2.5 桌面 UX

#### OC-13 · 窗口状态持久化
**桌面 UX** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.3**
- **做什么&为什么**：`electron-window-state` 持久化位置/大小/最大化到 `preferences.json`，下次恢复。当前每次固定 1280×800。
- **opencode 参考**：`apps/desktop/electron/main.ts` window-state-persistence
- **KodaX fit**：HLD §12 明确规划；PRD §5.2「macOS Stage Manager 友好」；2 行。
- **设计要点**：`windowStateKeeper` + `windowState.manage(mainWindow)`。

#### OC-14 · 原生右键菜单
**桌面 UX** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.3**
- **做什么&为什么**：`electron-context-menu` 提供标准剪切/复制/粘贴/存图。当前右键空白菜单，显得未完成。
- **opencode 参考**：`apps/desktop/electron/main.ts` native-context-menu
- **KodaX fit**：基础桌面质感；一行修复、第一印象收益大。
- **设计要点**：`app.whenReady()` 调 `contextMenu({...})`。

#### OC-15 · macOS 原生菜单栏扩展（声明式）
**桌面 UX** · 价值 **中** · 工作量 **M** · SDK **否** · 落地 **v0.1.5**
- **做什么&为什么**：把 main.ts 最小菜单重构为声明式 `KODAX_MENU`，macOS 原生菜单与 Win/Linux 应用内菜单共享，加 Help/About/Check for Updates(F022)/Export Logs(OC-05)。
- **opencode 参考**：`apps/desktop/electron/main.ts` 声明式 DESKTOP_MENU
- **KodaX fit**：macOS Beta 需正经菜单栏；声明式避免双端重复。
- **设计要点**：`electron/menu/kodax-menu.ts` discriminated 条目 + buildMac/buildWindows helper。

### 2.6 打包 / 分发 / CI

#### OC-16 · 多渠道构建（dev/beta/prod）
**打包/分发** · 价值 **中** · 工作量 **M** · SDK **否** · 落地 **v0.1.5**
- **做什么&为什么**：`KODAX_CHANNEL` 驱动独立 appId（kodax-space.dev/beta/prod）/productName/图标/更新源。Beta 前必需，使 dev 构建不覆盖用户安装。
- **opencode 参考**：`electron-builder.config.ts` OPENCODE_CHANNEL；copy-icons 脚本
- **KodaX fit**：HLD §13.4 stable/beta 渠道；支持 dev+beta+prod 并存安装。
- **设计要点**：electron-builder.yml channel 条件段；`app.dock.setIcon()` 运行时图标。⚠️ 见开放问题 #3（证书）。

#### OC-47 · 分层 CI Docker 镜像
**CI/构建** · 价值 **中** · 工作量 **M** · SDK **否** · 落地 **v0.1.5**
- **做什么&为什么**：base→bun-node→rust→electron-linux 分层，Bun 版本从 `package.json` packageManager 钉。削减 Electron+NAPI 构建 CI 时间、防 Bun 漂移。
- **opencode 参考**：`.github/workflows/docker/` 分层镜像
- **KodaX fit**：HLD §15；NAPI crate（F014/F025/F026）需 Rust+Node 矩阵。纯 DevOps。

#### OC-48 · Sentry source map 上传 + 上传后删除
**CI/构建** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.5**
- **做什么&为什么**：`@sentry/vite-plugin` 条件于 `SENTRY_AUTH_TOKEN`（本地构建不失败）；CI 上传 source map 后 `filesToDeleteAfterUpload` 删 `.map` 不随包发布。HLD §14 规划 M1。
- **opencode 参考**：`vite.config.ts` sentry-source-maps
- **KodaX fit**：HLD §14「M1 自托管 Sentry（无任务内容）」；PRD §7.1 opt-in 遥测、错误报告无任务内容。

#### OC-50 · NAPI 二进制平台选择构建插件
**CI/构建** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.1（回填）**
- **做什么&为什么**：构建期选择平台对应预编译 `.node`，收窄 asar。配合 F014/F025/F026 NAPI crate（否则 asar 塞全平台二进制）。
- **opencode 参考**：`packages/opencode/src/vite-node-pty-narrower.ts` node-pty-narrower
- **KodaX fit**：F014/F025/F026 会发 x64/arm64/win/mac/linux 预编译；构建期裁剪。随 F014 落地。

### 2.7 流式 UX

#### OC-17 · 虚拟化消息时间线（react-virtua）
**流式 UX** · 价值 **高** · 工作量 **M** · SDK **否** · 落地 **v0.1.4**
- **做什么&为什么**：`ConversationStreamV2.tsx` 的 `Array.map()` 换 react-virtua Virtualizer，长会话（数百条消息+工具调用）平滑滚动、防 DOM 无界增长卡顿。
- **opencode 参考**：`packages/app/src/pages/session/timeline.tsx` virtua/solid VList
- **KodaX fit**：PRD §10.2 性能目标；KodaX 目标场景（长会话多工具调用）正是虚拟化关键场景；react-virtua 是 opencode 所用 virtua 的 React 变体。
- **设计要点**：`<Virtualizer overscan={5}>`；适配现有 wasAtBottomRef 自动滚动到 scrollToIndex；先做 OC-18 markAuto 守卫。

#### OC-18 · auto-scroll markAuto() 守卫 + data-scrollable 嵌套区
**流式 UX** · 价值 **高** · 工作量 **S** · SDK **否** · 落地 **v0.1.4**
- **做什么&为什么**：markAuto() 时间戳区分程序滚动 vs 用户滚动（防程序 `scrollTo()` 被误判为用户上滚而停止自动跟随）；为工具结果里的嵌套代码块加 data-scrollable。
- **opencode 参考**：`packages/app/src/context/scroll.ts` markAuto() + data-scrollable
- **KodaX fit**：修 ConversationStreamV2.tsx 现有 auto-scroll 的常见 bug；应先于虚拟化（OC-17）。
- **设计要点**：`lastProgrammaticScroll` ref，<100ms 内跳过用户中断检测；滚动监听检查 event.target 是否有 scrollable 祖先。

#### OC-19 · 流式 markdown LRU 记忆化
**流式 UX** · 价值 **高** · 工作量 **S** · SDK **否** · 落地 **v0.1.4**
- **做什么&为什么**：Markdown 组件按内容 hash 做 LRU 记忆化，跳过高频 text_delta 时对未变文本的重复解析。当前每个 text_delta 重解析整条消息。
- **opencode 参考**：`packages/app/src/pages/session/messages/markdown.tsx` LRU block cache
- **KodaX fit**：PRD §10.2 首工具调用渲染 <200ms；按内容 hash 的 useMemo 防长流式回复指数级重解析。无需 morphdom（React diff 处理 DOM）。
- **设计要点**：模块级 `LRU Map<contentHash, ReactElement>`（上限 500）。

#### OC-20 · context/action 工具分组
**流式 UX** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.4**
- **做什么&为什么**：把现有「Ran N commands」拆成「Explored N files/searches」(read/glob/grep/list) vs 「Ran N commands」(bash/write/edit/patch)，给用户更清晰信号，对齐 Claude Code TUI。
- **opencode 参考**：`packages/app/src/pages/session/messages/groups.ts` CONTEXT/ACTION_GROUP_TOOLS
- **KodaX fit**：扩展 FEATURE_LIST alpha.1 已建的 `groupTools()`；改善 PRD §5.1.1 折叠卡可读性。
- **设计要点**：`groupTools()` 加 `groupKind:'context'|'action'`；ToolGroupMessage type 加字段。

#### OC-21 · 可扩展工具渲染注册表（ToolRegistry）
**流式 UX** · 价值 **中** · 工作量 **M** · SDK **否** · 落地 **v0.1.8**
- **做什么&为什么**：`ToolRegistry.register()` 模式，per-tool 渲染组件 + rAF 批量挂载，替代单体 ToolCallCard switch，使 Skills/MCP 自注册渲染器。
- **opencode 参考**：`packages/app/src/context/tool-registry.ts`；BasicTool rAF deferred mount
- **KodaX fit**：PRD §5.1.1；随 MCP 工具（F039）任意名 + Skills（F035）扩张，注册表免去逐 case 改码。
- **设计要点**：`features/tools/registry.ts` 单例；默认渲染器 module init 注册；ToolCallCard 用 lookup + rAF 延迟挂载。

#### OC-22 · 上下文压缩分隔线
**流式 UX** · 价值 **中** · 工作量 **S** · SDK **是** · 落地 **v0.1.7**
- **做什么&为什么**：SDK emit 压缩事件时，在时间线渲染「Context compacted here (N→M tokens)」横线。否则用户看不到历史在哪被截断、对 agent 记忆困惑。
- **opencode 参考**：`packages/app/src/pages/session/timeline.tsx` compaction-divider
- **KodaX fit**：PRD §4.1「Oversight by design」透明度；compaction 事件已在 real-session.ts 接线但无视觉表现；`/compact` 也部分接线（F031）。
- **设计要点**：确认 compact_stats 事件带 tokensBefore/After；composeMessages 插入 CompactionDivider。**SDK ask**：emit `context_compacted` 事件。

#### OC-23 · 限流重试倒计时显示
**流式 UX** · 价值 **高** · 工作量 **S** · SDK **是** · 落地 **v0.1.4**
- **做什么&为什么**：SDK emit rate-limit retry 时显示「retrying in Xs — attempt #N, provider: Zhipu」。否则限流等待期 UI 像冻结。
- **opencode 参考**：`packages/opencode/src/session/retry.ts` retry-after 解析 + upsell action
- **KodaX fit**：12+ provider 使其比单 provider 工具更重要（各家限流差异大）。
- **设计要点**：space-ipc-schema 加 `session_retry {attempt, nextTimestamp, providerName}`；real-session.ts 映射 onRetry。**SDK ask**：emit onRetry 事件。

#### OC-24 · 运行中工具卡 shimmer 动画
**流式 UX** · 价值 **低** · 工作量 **S** · SDK **否** · 落地 **v0.1.4**
- **做什么&为什么**：工具运行时标题 CSS shimmer，完成后 220ms 淡出。提供执行反馈、避免状态突变。
- **opencode 参考**：`packages/ui/src/components/text-shimmer.tsx`
- **KodaX fit**：工具卡是 KodaX 编码 agent 动作主界面；改善 PRD §3.2 S3 长任务监控。
- **设计要点**：space-ui-kit 加 `TextShimmer`，data-run 触发、data-active=false 淡出。

#### OC-25 · 代码块复制按钮
**流式 UX** · 价值 **高** · 工作量 **S** · SDK **否** · 落地 **v0.1.4**
- **做什么&为什么**：Markdown 代码块加复制按钮（pre override + 2s「Copied!」）。per-message 复制已有（MessageFooter），缺 per-code-block。
- **opencode 参考**：`packages/app/src/pages/session/messages/code-block.tsx`
- **KodaX fit**：开发者工具 table-stakes；KodaX 工具结果/回复含大量代码。
- **设计要点**：Markdown.tsx `pre` override 包 CopyButton（`navigator.clipboard.writeText`）。

#### OC-30 · 共享 useFuzzyFilteredList hook
**UI 基建** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.4**
- **做什么&为什么**：通用 hook 包 fuzzysort + Up/Down/Enter 键盘导航。SlashCommandPopover / ModelEffortSelector / 命令面板 当前各自重复过滤+键导逻辑。
- **opencode 参考**：`packages/app/src/utils/fuzzy-list.ts` useFilteredList
- **KodaX fit**：小工作量高复用；为命令面板（OC-28）打底。
- **设计要点**：`hooks/useFuzzyFilteredList.ts` 返回 `{filteredItems, query, setQuery, selectedIndex, onKeyDown}`。

#### OC-42 · 两层事件架构（全局 session bus）
**会话生命周期** · 价值 **高** · 工作量 **M** · SDK **否** · 落地 **v0.1.8**
- **做什么&为什么**：`session.globalEvent` push 通道扇出所有 per-session 事件（带 `{sessionId, projectRoot}`），让侧栏与通知系统单订阅观察所有并发 session，而非 per-session 订阅。
- **opencode 参考**：`packages/opencode/src/bus.ts` global-and-instance-event-separation
- **KodaX fit**：PRD §3.2 S1 多 session 并行；侧栏需监控全部 session 做未读角标（F020）/标题更新。
- **设计要点**：push.ts 加 `pushToRendererGlobal`；App.tsx 顶层单订阅；per-session stream 仍走 session-scoped 通道。⚠️ 见开放问题 #5（IPC 流量）。

### 2.8 i18n

#### OC-26 · React i18n（中/英）
**i18n** · 价值 **高** · 工作量 **M** · SDK **否** · 落地 **v0.1.9**
- **做什么&为什么**：React i18n context（I18nProvider + `t()` hook + 扁平 en/zh-CN locale 对象），覆盖全部桌面 UI 字符串，首启向导选语言、持久化到 `preferences.json`。PRD §6.1 明确要求。**必须早做**，否则上百字符串后期回填代价巨大。
- **opencode 参考**：`packages/console/app/src/context/i18n.tsx` 零依赖 React i18n context
- **KodaX fit**：PRD §6.1 首启选语言；中文开发者是主市场（zhipu/kimi/tongyi/doubao 全面向中文用户）；opencode console 模式（createContext + t(key,params) + 扁平 TS locale）可直接移植到 React/Zustand。
- **设计要点**：新建 `packages/space-i18n`；App.tsx wrap `<I18nProvider>`；首启加语言选择步骤；Shell/BottomBar/WelcomeDashboard 等硬编码串抽到 locale 文件。⚠️ 见开放问题 #1（一次抽 vs 分两版）。

### 2.9 主题

#### OC-27 · CSS token 主题层（= F019 补全）
**主题** · 价值 **中** · 工作量 **M** · SDK **否** · 落地 **v0.1.3**
- **做什么&为什么**：把组件里硬编码 Tailwind zinc 色串换成 CSS 自定义属性语义 token（--bg-surface / --fg-primary / --border-default…），支持 3-5 命名主题（dark-zinc/light/high-contrast）而不动组件代码。保留现有 3-mode 开关（ThemeToggle.tsx）。
- **opencode 参考**：`packages/ui/src/styles/tokens.css` OKLCH CSS 自定义属性
- **KodaX fit**：PRD §5.2 Should-have「主题(明/暗/跟随)」= F019；3-mode 开关已建，这是使 F019 完整的 CSS token 重构。OKLCH 算术是 nice-to-have，CSS-var 间接层才是承重部分。**本项即 F019 完成项。**
- **设计要点**：`space-ui-kit/themes/` tokens.css + 各主题 `:root` override；ThemeToggle 加命名主题选择。

### 2.10 UI 基础设施

#### OC-28 · 命令面板（Mod+Shift+P）+ 可编辑 keybind
**UI 基建** · 价值 **中** · 工作量 **M** · SDK **否** · 落地 **v0.1.9**
- **做什么&为什么**：全局命令面板（Mod+Shift+P）模糊搜索全部 app 命令，用户可编辑 keybind 持久化到 `preferences.json`，平台感知 Cmd/Ctrl。改善可发现性与效率。
- **opencode 参考**：`packages/app/src/context/command-palette.tsx` 命令注册表 + 模糊搜索
- **KodaX fit**：PRD §5.1.2 全局热键；Claude Desktop 对齐隐含；slash popover 仅 session 内，缺 app 级命令；为 keybind 编辑器（OC-29）打底。
- **设计要点**：`features/command-palette/` CommandRegistry 单例；App.tsx wire Mod+Shift+P；preferences.json 加 keybinds 字段。

#### OC-29 · 统一分 tab 设置弹窗
**UI 基建** · 价值 **中** · 工作量 **M** · SDK **否** · 落地 **v0.1.9**
- **做什么&为什么**：替代散落的设置 popover，统一竖 tab 设置弹窗：General(locale/workspace) / Providers(复用 ProviderSettings) / Appearance(主题/字体, OC-27) / Keybinds(OC-28)。
- **opencode 参考**：`packages/app/src/pages/settings/` 分 tab 设置弹窗
- **KodaX fit**：PRD §5.2；当前设置散落；整合使 i18n 选语言、自动更新控制(F022)、keybind 编辑集中可发现。
- **设计要点**：`features/settings/SettingsDialog.tsx`（shadcn Tabs）；wire Cmd+, / Ctrl+,。

#### OC-31 · 输入框增强（历史导航 + 图片粘贴 + @file 提及）
**UI 基建** · 价值 **高** · 工作量 **M** · SDK **否** · 落地 **v0.1.9**
- **做什么&为什么**：BottomBar 输入框三子功能：(1) Up/Down 提示历史（appStore.inputHistoryBySession 已有数据模型但未接键）；(2) Ctrl+V 剪贴板图片粘贴（Electron clipboard IPC）；(3) `@` file 模糊 popover 快速注入文件。
- **opencode 参考**：`packages/app/src/pages/session/input/input-box.tsx` rich input
- **KodaX fit**：PRD §5.1.1 文件附加；图片粘贴对「这是 bug 截图」工作流关键；历史导航已建模未接线；@file 直接改善本地文件 context 注入（KodaX 关键差异化）。
- **设计要点**：InputBox.tsx onKeyDown(ArrowUp/Down 空框时)；onPaste 读 image → IPC `files.readClipboardImage`(`clipboard.readImage().toPNG()`)；@ 触发 `files.list` + OC-30 fuzzy popover。仅新增一个 clipboard image IPC handler。

### 2.11 Provider / Model UX

#### OC-32 · provider key 来源枚举（keychain vs env-var）
**Provider/Model** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.9**
- **做什么&为什么**：`provider.list` 的 configured 字段从 boolean 升级为 `{via:'keychain'} | {via:'env', envVar} | false`，provider 卡显示「来自环境变量」vs「来自 keychain」。PRD §6.1 onboarding 要求。
- **opencode 参考**：`packages/app/src/context/providers.tsx` provider-enabled-via-enum
- **KodaX fit**：PRD §6.1「env var 检测：已设 provider 自动亮起」；shell-env-hydrate.ts 启动已检测 env key，本项把区别 surface 到 UI。
- **设计要点**：channels/provider.ts configured 改 union；ProviderCard 渲染角标。

#### OC-33 · model 能力矩阵（vision/reasoning/tool-use/上下文窗）
**Provider/Model** · 价值 **高** · 工作量 **M** · SDK **是** · 落地 **v0.1.4**
- **做什么&为什么**：provider model IPC 返回 per-model `{contextWindow, reasoning, vision, toolUse}` 能力字段，provider 卡与 ModelEffortSelector 显示能力矩阵。PRD §5.1.4 明确要求。
- **opencode 参考**：`packages/opencode/src/provider/catalog.ts` model capability 字段
- **KodaX fit**：PRD §5.1.4 直接要求；防用户给文本任务选 vision-only model 或给复杂任务选非 reasoning model。
- **设计要点**：扩展 channel 为 capabilities；catalog.ts 已知值；sdk-providers.ts 读 SDK snapshot；卡渲染能力角标。**SDK ask**：per-model 结构化能力字段。

#### OC-34 · 按 model 过滤 reasoning effort 档位
**Provider/Model** · 价值 **中** · 工作量 **S** · SDK **是** · 落地 **v0.1.4**
- **做什么&为什么**：reasoning mode 下拉仅显示当前 model 支持的档（如 OpenAI o-系列只 low/high，Anthropic 全 5 档）。当前不分 provider 全显 5 档。
- **opencode 参考**：`packages/opencode/src/provider/catalog.ts` reasoning variant map
- **KodaX fit**：PRD §4.2 provider 中立「任何 model 相关功能须对 ≥2 provider 验证」；防显示不支持的档。
- **设计要点**：catalog.ts 加 `supportedReasoningModes?`；ModelEffortSelector 过滤（缺字段 fallback 全 5 档）。**SDK ask**：snapshot 暴露支持的 reasoning 变体。

#### OC-35 · model 名规范化工具
**Provider/Model** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.9**
- **做什么&为什么**：`normalizeModelId()` + `modelDisplayName()` + `MODEL_AUTHOR_RULES`，覆盖 12+ provider 的 model ID 约定，防 WelcomeDashboard/分析显示裸 ID（如 `glm-4-plus-0111`）。
- **opencode 参考**：`packages/opencode/src/provider/models.ts` MODEL_AUTHOR_RULES + normalizeModel()
- **KodaX fit**：PRD §8 provider 中立显示；改善 WelcomeDashboard「常用 model」/ChipBar/会话导出(OC-38)。纯 TS、零云依赖。
- **设计要点**：新建 `packages/space-model-utils`；覆盖 zhipu/kimi/deepseek/tongyi/doubao/ark 模式。

#### OC-36 · OpenAI-兼容 provider 预填 profile
**Provider/Model** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.9**
- **做什么&为什么**：`KNOWN_OPENAI_COMPATIBLE_PROFILES` 给 Groq/Together/Fireworks/Cerebras/Perplexity 等一键预填「Add Custom Provider」。
- **opencode 参考**：`packages/opencode/src/provider/openai-compatible.ts` 兼容 provider profile 注册表
- **KodaX fit**：PRD §5.1.4「自定义 provider（OpenAI/Anthropic 兼容）图形表单」Must-have；降低「Groq 的 base URL 是什么」摩擦。
- **设计要点**：catalog.ts 加 profile map；CustomProviderForm 顶部「已知 provider」下拉填 baseUrl。

#### OC-37 · 结构化会话错误分类
**Provider/Model** · 价值 **中** · 工作量 **S** · SDK **是** · 落地 **v0.1.4**
- **做什么&为什么**：`session_error` 加 `errorKind`(auth_failed|rate_limited|quota_exceeded|provider_error)，聊天界面显示可操作指引（「API key 无效——打开 provider 设置」）而非裸错误串。
- **opencode 参考**：`packages/opencode/src/provider/error.ts` typed LLM error taxonomy
- **KodaX fit**：PRD §4.3「UI 面向用户友好错误」；与 OC-11 配套。
- **设计要点**：SessionEvent 加 errorKind；real-session.ts 分类；ConversationStreamV2 渲染 kind-specific CTA。⚠️ 见开放问题 #5（先启发式 vs 等 SDK）。**SDK ask**：结构化错误原因。

### 2.12 会话导出 / 可观测

#### OC-38 · 会话导出 JSON 快照 + 自包含 HTML
**会话导出** · 价值 **高** · 工作量 **M** · SDK **是** · 落地 **v0.1.5**
- **做什么&为什么**：(1) `session.exportSnapshot` 导出结构化 JSON（全轮次/工具调用/token）到用户选定文件；(2)「Export as HTML」导出自包含 HTML（语法高亮代码 + diff + token/成本摘要）。PRD §5.1.9 明确要求「导出 JSON/MD 报告（粘 PR/Issue）」。
- **opencode 参考**：`packages/app/src/pages/session/share/` Share.tsx + ContentCode/Diff/Markdown（**改为本地文件输出、无云上传**）
- **KodaX fit**：PRD §5.1.9 Must-have M0-M1；支撑 P1 团队开发者「PR/Issue 分享 context」且零云依赖；HTML 复用现有 ConversationStreamV2 渲染逻辑。
- **设计要点**：ipc/session.ts 加 exportSnapshot/exportHtml handler。⚠️ 见开放问题 #2（renderToStaticMarkup vs 独立序列化器）。**SDK ask**：`getSessionSnapshot(id)`。

#### OC-39 · 多文件会话 diff 面板（批量批准）
**会话导出** · 价值 **高** · 工作量 **M** · SDK **是** · 落地 **v0.1.4**
- **做什么&为什么**：单文件 DiffPanel 升级为多文件会话审阅面板，per-file 手风琴 + ± 角标 + 500 行截断守卫 +「View full diff」。落实 PRD §3.2 S4「Diff 审查 + 一次 approve」。
- **opencode 参考**：`packages/app/src/context/session-review.tsx` SessionReview（**用 diff2html/react-diff-view 替代专有 @pierre/diffs**）
- **KodaX fit**：PRD §3.2 S4 明确场景；当前 DiffPanel 只显示全局最后改的文件；多文件审阅是 KodaX Space 对 Claude Desktop TUI 的核心差异化。
- **设计要点**：`shell/popouts/SessionDiffPanel.tsx`；Approve/Reject all 触发 IPC。**SDK ask**：`getSessionDiff(id)→FileDiff[]`。

#### OC-40 · session 列表游标分页
**会话导出** · 价值 **中** · 工作量 **M** · SDK **是** · 落地 **v0.1.5**
- **做什么&为什么**：`session.list` 加游标分页（cursor 编码 projectRoot+排序+filter），防侧栏在大历史时全量扫描阻塞。
- **opencode 参考**：`packages/app/src/context/global-sync/v2-api-paginated.ts` filter-embedding cursor
- **KodaX fit**：PRD S1 多仓多 session + F016 lineage 图都需高效大列表；侧栏已从 F038 FileSessionStorage 加载，分页使其可扩展。
- **设计要点**：channel 加 `{cursor?, limit?}`/`{nextCursor?}`；LeftSidebar 无限滚动。**SDK ask**：`listSessions(cursor, limit)`。

#### OC-49 · WelcomeDashboard 统计增强
**可观测** · 价值 **中** · 工作量 **S** · SDK **否** · 落地 **v0.1.8**
- **做什么&为什么**：命名时间窗（7d/30d/90d/All）+ 等宽时间桶活动图 + per-session 估算成本（整数 microcent 算术，待 SDK 暴露 token 成本档）。
- **opencode 参考**：`packages/app/src/pages/home/stats.ts` createBuckets() + getWindow() + microcent
- **KodaX fit**：PRD §8 差异化「model 成本控制——成本可见」；WelcomeDashboard 已有聚合框架，本项是质量提升；microcent 整数存储防浮点成本误差。
- **设计要点**：timeWindow state + tab；createBuckets 纯函数；成本档来自 OC-33 SDK ask。

### 2.13 扩展性（为 M2 铺路）

#### OC-45 · React SlotRegistry UI 扩展点
**扩展性** · 价值 **中** · 工作量 **M** · SDK **否** · 落地 **v0.1.8**
- **做什么&为什么**：命名 React 注入槽（sidebar_content / popout_extra / chip_bar_right / session_header）via SlotRegistry。使 Partner 面板（M2）与 Connector UI 自注册组件而不在 shell 布局硬编码。
- **opencode 参考**：`packages/ui/src/components/slot.tsx`（TUI slot 适配为 React Context portal）
- **KodaX fit**：PRD §5.2 Partner M2 + Connector 市场 M3；先把 MCP/Tasks/Plan panel 实现为自注册 FeatureModule 验证扩展契约；M2 Partner 面板插入的前置。
- **设计要点**：`features/slot/SlotRegistry.tsx` Context + portal；Partner stub 注册为「Coming (M2)」。⚠️ 见开放问题 #4（重构时机）。

#### OC-46 · ProviderAuthDefinition 接口（OAuth connector）
**扩展性** · 价值 **中** · 工作量 **M** · SDK **否** · 落地 **v0.1.5**
- **做什么&为什么**：space-ipc-schema 定义 `ProviderAuthDefinition`，允许自定义 provider 与 OAuth connector 声明 auth prompt 与回调流。替代 catalog.ts 硬编码、使能 M2 Connector OAuth（GitHub/Slack）。
- **opencode 参考**：`packages/app/src/context/provider-auth.tsx` ProviderAuth.Service
- **KodaX fit**：PRD §5.2 Connector M2 Must-have；KodaX 已存 per-provider API key 但无 OAuth 流结构；本接口使能而不要求现在实现完整 OAuth（实际流 M2）。
- **设计要点**：`provider-auth.ts` type `{providerId, authType:'apiKey'|'oauth', prompts, authorize?, callbackPath?}`；OAuth 触发 HLD §6.3 loopback server。⚠️ 见开放问题 #6（现在定契约 vs M2）。

---

## 3. 版本路线图（OC + KX-I 叠加，已含 §7 lens 复核）

> 原则：**正确性/安全/发布硬化** 进入公开 Beta（v0.2.0）前的现有版本；**净新增能力大集群**开新小版本 v0.1.8 / v0.1.9。OC 项穿插进对应版本现有 F-feature 之间，不重复已建/已规划。`KX-I-*` = 经「极简且智能」复核新增的智能 feature（见 §7.3）。

| 版本 | 主题 | 现有 F | 新增 OC | 新增 KX-I（智能） |
|---|---|---|---|---|
| **v0.1.1**（回填） | NAPI 构建基建 | F011, F014 | OC-50 | — |
| **v0.1.2** | 正确性 & CI 地基 + 零配置启动 | F015-018 | **OC-01**, OC-03, OC-07, **OC-09**, **OC-12**, OC-43 | **KX-I-01** 零配置 provider 激活 |
| **v0.1.3** | UX polish + 健壮性 + 安全 | F019-022 | OC-02, OC-06, **OC-10**, OC-11, OC-13, OC-14, **OC-27**, OC-41 | — |
| **v0.1.4** | Power + 流式 UX + 智能呈现 | F023-026 | **OC-17/18/19**, OC-20, OC-23, OC-24, **OC-25**, OC-30, **OC-33**, OC-34, OC-37, **OC-39** | **KX-I-02** 智能 popout 导播 · **KX-I-03** 会话自动命名 · **KX-I-08** provider 健康点 |
| **v0.1.5** | 发布硬化 + 主动智能 | F027-028 | **OC-04**, OC-05, OC-08, OC-15, OC-16, **OC-38**, OC-40, **OC-44**, OC-47, OC-48 | **KX-I-06** Repointel 自动 warm · **KX-I-07** 完成智能通知 |
| **v0.1.7** | MCP 完整 + 可观测 | F039 | OC-22 | — |
| **v0.1.8（新）** | 工具渲染 + 事件架构 + 智能 | — | OC-21, OC-42, OC-49 | **KX-I-05** 智能权限批处理 · **KX-I-09** Quick Ask 智能升级 |
| **v0.1.9（新）** | Provider/Model 智能 + i18n + UI 基建 | — | **OC-26**, OC-28†, OC-29†, **OC-31**, OC-32, OC-35, OC-36 | **KX-I-04** 任务感知 model 路由 |
| **M2** | Partner + Connector OAuth | (PRD M2) | OC-45‡, OC-46‡ | — |

> † 经 lens 瘦身：OC-28 砍掉用户可编辑 keybind（保留命令面板）；OC-29 仅 2 tab（General + Providers，砍 Appearance/Keybinds）。
> ‡ 经 lens 推迟到 M2：OC-45 SlotRegistry / OC-46 ProviderAuthDefinition——等首个真实消费者出现再定契约，避免投机抽象。
> **快赢 batch（建议本周，高价值/S/零 SDK）**：OC-01、OC-09、OC-12、OC-18、OC-19、OC-25、**KX-I-01**。
> **加粗** = 高价值或集群锚点项。

---

## 4. 明确不采纳（守住 scope）

对抗式 critic 挡掉的「看着诱人但违反非目标」能力。**保留这份清单与 adopt 清单同等重要——它保护精心设计的 scope。**

### 4.1 云 / 网络端口类（违反 local-first / HLD §13.3 无监听端口）
- 云会话分享（share URL / Durable Objects / R2 / live sync）
- session share link / live sync / WebSocket viewer
- 实时 loopback WebSocket session viewer（浏览器观察器）
- mDNS/Bonjour LAN 服务发现（作为默认功能）
- 云用量统计管线（Kinesis/Athena/MySQL）
- GitHub Action 云端调度执行（M3 Automations 用本地 launchd/Task Scheduler/systemd）
- GitHub Actions OIDC token 交换（Cloudflare Worker）
- 社交 OG/Twitter card 生成

### 4.2 LLM 代理类（违反 PRD §11 非目标 3「不做转发代理」+ provider 中立）
- Cloudflare AI Gateway 双认证
- 多 workspace 透明代理路由
- AWS Bedrock SigV4 签名（属 SDK provider 层）
- Google Vertex ADC fetch 注入（单 provider + fetch monkey-patch 违反 HLD §3）

### 4.3 shell-not-engine 越界（属 KodaX SDK 职责）
- Space 内自建工具集 / 工具注册执行（违反 HLD「No-tool-execution-in-renderer」）
- 代码格式化调用（SDK 在 write/edit 后处理）
- per-model system prompt 选择（应走 AGENTS.md 注入）
- 运行时 npm 动态装 plugin/provider（供应链攻击面；签名 app 中禁止；走 SDK installExtension）
- Effect-based PluginV2 core plugin 系统 / TUI Plugin API（@opentui）

### 4.4 架构不符 / 已被 KodaX 更优方案覆盖
- HTTP/SSE server / ACP server over stdio（ADR-003 硬边界；ACP 服务第三方 host，属 KodaX core）
- TanStack Query + SSE 全局同步层（为 HTTP 缓存设计；Zustand + appendEvent 是正解）
- **main 进程跑 markdown**（每 token 增 IPC 往返，**直接害 PRD §10.2 <200ms** 目标）
- 打字机/节奏化流式（PRD §7.5「不假进度」；KodaX 流真实 token，延迟显示=欺骗用户）
- Effect-TS 编排 main 启动（XL 工作量的外来范式孤岛；底层 race/defer 模式可单独抽工具）
- 通用 k-v store IPC（electron-store 风；HLD §12 用 typed 数据模型）
- Vite virtual module server bundle 嵌入（仅 sidecar 模型需要）

### 4.5 形态越界（ADR-004 anti-pattern）
- 常驻文件树侧栏（VS Code 克隆症状）
- 独立 Chat 面板（PRD §1.1/§4 硬非目标；Quick Ask 覆盖临时问答）

### 4.6 无关
- Tauri→Electron 迁移（KodaX native Electron，无 Tauri 史）
- Zed editor extension（接 KodaX ACP server，属 KodaX core 仓库）
- Feishu→Discord 支持桥（opencode 内部团队运维工具）

---

## 5. KodaX SDK 需求清单（30 项）

> 这些是 feature 落地依赖的 SDK 导出/API。**应并入 [SDK gap 清单](../../../../Users/user/.claude/projects/c--Works-GitWorks-KodaX-author-KodaX-Space/memory/kodax_sdk_export_gaps.md) 发给 KodaX 团队。** 标注触发它的 OC feature。

### 5.1 Session（OC-38/39/40/22/49）
- `getSessionSnapshot(id): SessionSnapshotJSON` — 全轮次/工具调用/token 结构化 dump（区别于裸 JSONL）
- `getSessionDiff(id): FileDiff[]` — 用 bare-git snapshot 返回 (path, additions, deletions, patch)
- `forkSession` 接受 messageIndex/selector，可在任意消息边界 fork（非仅最新）
- `listSessions(cursor, limit)` 稳定分页 + 在 summary 上暴露成本聚合（totalInput/Output/Cost）
- `revertFilesAfterMessage(id, messageIndex)` — git snapshot 回退某消息后的文件编辑

### 5.2 事件流（OC-22/23/37/42）
- emit `context_compacted` 事件（tokensBefore/After）+ 把被压缩丢弃的旧 tool result 标 `pruned`
- emit `onRetry` 事件 `{nextTimestamp, attempt, providerName, providerMessage?}`（限流时）
- 结构化错误原因（authentication / rate_limit + retryAfterMs / quota_exceeded / content_policy / provider_internal）替代裸串
- emit per-iteration file change 事件（或 `getIterationChanges(iterationId)`）
- emit `background_job_status` 事件（区别于 managed_task_status，给 fire-and-forget subagent）
- token 用量按类别分（system prompt / messages / tool results）在 iteration_end 暴露

### 5.3 Provider / Model（OC-33/34/49）
- per-model 成本档（input/output/cache_read/cache_write per 1M token）
- per-model 结构化能力字段（tool_call / modalities / reasoning / context_window / maxOutputTokens）
- per-model 支持的 reasoning effort 变体

### 5.4 MCP（OC-22 / F039）
- `McpManager.start/stop/getLogs/getToolCatalog` + Connector OAuth 回调 + per-server 健康态（running/needs_auth/failed）

### 5.5 Agent / Command / Hook（M2）
- `listAgents()` + `setAgent(sessionId, agentName)`（类比 /provider 切换）；send 时路由到具名子 agent
- 公开 re-export `loadCommands()`（如 `/commands` 子路径）发现 `~/.kodax/commands/*.md`
- Hook 配置 schema + `validateHook(config)`（M2 Hooks 编辑器）

### 5.6 其它（OC-17 teleport / sandbox / 权限 / LSP）
- `--teleport-to-desktop` flag 写 handoff 描述符 + 信号运行中 Space 的命名管道（F017）
- `worktree_create/remove/list` + 启动命令支持（M2 agent sandbox）
- bash 工具 `beforeToolExecute` 带 `affected_paths[]`（Tree-sitter AST，权限弹窗预告）
- `session.create()` 接受显式权限策略数组（headless M3 Automation）
- `queryLsp(sessionId, operation, params)`（goToDefinition/hover/documentSymbol，Monaco diff M2+）
- project-context 生命周期 API（init/reuse/dispose per 目录，跨 session 共享 AGENTS.md/Repointel warm）

---

## 6. 开放问题（需团队拍板）

1. **i18n 时机（OC-26）**：v0.1.9 一次性全量抽字符串，还是更早上基础设施 stub + 后续抽？越晚越贵——倾向尽早上 I18nProvider 骨架，新字符串一律走 `t()`，存量分批抽。
2. **会话 HTML 导出（OC-38）**：复用 React `renderToStaticMarkup`（快、但耦合 React runtime）还是独立轻量序列化器（可维护）?
3. **多渠道签名证书（OC-16）**：dev/beta/prod 独立 appId 意味独立 keychain service 名 + 独立更新源 URL。团队 dev vs prod 是否分开证书，还是共用一张？
4. **F039 占位 UI**：MCP 健康角标在 v0.1.5 先占位（等 SDK API 落地即就绪），还是严格留 v0.1.7 避免 dead UI？
5. **OC-37 错误分类**：现在先做启发式 pattern-match + 报 SDK 需求，还是死等 SDK 结构化错误？（real-session.ts 当前 untyped catch，pattern-match 脆弱但能先用）
6. **两层事件架构（OC-42）**：globalEvent 广播 IPC 流量随并发 session 线性增长。是否有 session 并行上限（如 max 5）界定开销，或全局通道加事件类型过滤降噪？
7. **Playwright mock（OC-44）**：mock 打在 IPC 边界（拦 `window.kodaxSpace.on/invoke`，易但测不到 main 逻辑）还是 main 进程 IPC handler（需注入 mock SDK）？
8. **成本显示（OC-49/33）**：LLM 定价频繁变。catalog.ts 硬编静态定价快照（接受陈旧）还是仅在 SDK 有 live 数据时显示？
9. **SlotRegistry（OC-45）重构时机**：在 MCP/Tasks/Plan panel feature-complete 之前还是之后重构为自注册，避免重复触碰在建代码？
10. **ProviderAuthDefinition（OC-46）**：v0.1.5 定稳定契约阻止未来 breaking，还是完全推迟到 M2 首个 OAuth connector 实现时？

---

## 7. 极简且智能 lens

> **产品哲学复核**（用户 2026-05-29 钦定，见 [[minimal-intelligent-philosophy]]）。
> 用三视角（极简守卫 / 智能放大器 / Claude Desktop 克制基准）复核了全部 50 个 OC feature。
>
> **核心洞见**：「极简且智能」不是风格偏好，而是 KodaX-Space 的核心竞争定位，必须在**路线图层面**捍卫，而非只在设计评审里。三视角一致 flag 的配置面（keybind 编辑器、主题 gallery、Appearance tab、能力矩阵）**无情砍掉**；三视角一致认可的智能（自动检测、主动呈现、智能默认）**提升为一等 feature**。
> 这正是与 opencode 的分野：**opencode 用配置回答能力；KodaX-Space 用智能回答**。

### 7.1 设计准则（8 条 doctrine）

| # | 准则 | UI 落点（含示例） |
|---|---|---|
| 1 | **智能吸收配置**：任何运行时可探测/可推断的决策都自动完成——暴露结果，不暴露旋钮 | BottomBar model chip 显示当前 provider+model 无需设置步骤；粘贴图片时 vision model 自动浮顶（OC-33），而非让用户查矩阵表 |
| 2 | **一意图一表面**：对话流是主表面；每个 popout 必须先论证"按需存在"的正当性，且绝不常驻 | SessionDiffPanel（OC-39）在 session_complete 有文件改动时自动浮出，绝不是常驻分栏；Tasks 同理 |
| 3 | **复杂度预算是零和**：新增一个用户可见设置区/tab/常驻 UI，必须退役一个现有的 | OC-29 设置弹窗恰好 2 tab（General + Providers）；Appearance tab 砍掉（主题跟随系统），Keybinds tab 砍掉（OC-28 固定快捷键） |
| 4 | **隐形健壮性**：基础设施（崩溃恢复/单实例/日志/优雅退出/代理）正常时**零 UI** | OC-01~04/07/08/09/10 全是 main 进程管线，正常运行不产生任何设置/状态/菜单项；OC-02 仅崩溃时弹一个对话框后消失 |
| 5 | **情境化 CTA 而非模态分类学**：出错/触限时在失败点给**一个**明确的内联动作——不做分类错误面板、不做错误历史 | OC-37 auth_failed 渲染内联 chip「API key 无效——打开 provider 设置」直接跳到出错 provider 的 key 字段 |
| 6 | **智能默认即 UX**：对已配好环境的用户，正确的 provider/model/reasoning/语言/滚动行为**直接生效**，零向导步骤 | OC-26 读 OS locale 立即应用，不弹语言选择器（除非 locale 含糊）；OC-32 key 来源自动检测显示为只读角标，绝非可切换 toggle |
| 7 | **渐进披露而非前置选择**：先给最小态；仅当用户显式手势/导航时才揭示深度 | OC-33 model 能力 = model 行旁 2-3 个小图标（👁/🧠），从不展示完整能力对比表；OC-34 reasoning 下拉仅显示当前 model 支持的档 |
| 8 | **扩展脚手架滞后于真实需求**：registry/slot/auth 接口在**第一个真实消费者**出现时才建，绝不投机预建 | OC-45 SlotRegistry / OC-46 ProviderAuthDefinition 推迟到 M2 Partner 面板 + 首个 OAuth connector（GitHub）真正动工时，对真实实现定契约 |

### 7.2 受 lens 影响的 feature 瘦身 / 重塑（21 项）

| ID | 裁决 | 调整 |
|---|---|---|
| OC-02 | reshape | 崩溃对话框检测是否在活跃 session 崩溃；是则显示「恢复上次 session / 退出」，Restore 经 launch arg 重开到正确 session——把恢复与导航合并为一个动作 |
| OC-05 | minimize | 仅 Help 菜单一个「Export Debug Logs」项，无工具栏按钮/无独立屏；50MB 上限/manifest 是实现细节非配置项；并自动把 24h 日志附到崩溃对话框（OC-02）一键分享 |
| OC-10 | reshape | redact 须覆盖 env 来源 **+ GUI 输入的 key**（keychain）；维护运行时敏感值注册表，捕获 ProviderSettings 表单提交的串，启动后新加的 key 也擦 |
| OC-15 | minimize | 菜单严格限：About / Check for Updates(F022) / Export Logs(OC-05) / Quit；OC-29 前不加 Preferences 项；不加 View toggle/窗口管理/Help 子菜单；按 session 状态条件启用 |
| OC-17 | reshape | 除 DOM 虚拟化外加**智能滚动锚定**：用户上滚读历史而 agent 仍在流式时，冻结视口在阅读位，仅当用户显式滚到底或 session 完成才恢复跟随（KodaX 长 session 主场景） |
| OC-20 | reshape | context/action `groupKind` 不只改标签**还驱动行为**：action-group(bash/write/edit) 自动浮 Tasks popout；context-group(read/glob/grep) 保持折叠静默——成为 KX-I-02 的触发信号 |
| OC-22 | reshape | 压缩分隔线除 token 数外加一键「从此处开新 session」CTA（压缩=agent 丢了早期上下文，用户可能想干净 fork），调 forkSession |
| OC-24 | minimize | **砍掉运行中 shimmer 动画**，只保留完成时 220ms 淡出；Tasks 面板活动指示已表达"在干活"，每张卡加 shimmer 是噪音；自动尊重 prefers-reduced-motion 无 toggle |
| OC-26 | reshape | 从 OS locale 自动检测立即应用，**无首启语言选择器**；在 OC-29 General tab 显示为可改默认；运行后 UI chrome 任何时候都不放语言选择器 |
| OC-27 | reshape | 恰好 3 模式：跟随系统/亮/暗（ThemeToggle 已实现）；CSS token 层是**内部重构**使能这 3 模式，**绝不**变成带 swatch/命名调色板/字体控制的主题选择器；OC-29 Appearance 段整个砍掉 |
| OC-28 | reshape | 命令面板 + Mod+Shift+P + 固定平台感知快捷键；**整个砍掉用户可编辑 keybind**——preferences.json 无 keybinds 字段、OC-29 无 Keybinds tab、任何层级无 keybind 管理面。冲突在代码里修。面板本身已提供 80% 可发现性价值 |
| OC-29 | minimize | 收敛为单弹窗恰好 2 tab：General(语言覆盖 + workspace 默认) + Providers(现有 ProviderSettings 升级)；Cmd/Ctrl+,；砍 Appearance(主题跟随系统)、砍 Keybinds(固定绑定) |
| OC-31 | reshape | 三子功能全为零配置、仅手势激活；加一个智能升级：粘贴纯文件路径串自动转 @-mention；@file popover 严格临时（选中/Esc 即关），绝不变文件浏览器面板；无粘贴/附件设置 |
| OC-32 | minimize | key 来源指示**仅**在 provider 配置屏（ProviderCard/CustomProviderForm）显示，不在 ModelEffortSelector 每个 provider 条目显示；只读信息角标，非切换控件 |
| OC-33 | reshape | 能力 = model 行 2-3 小图标（👁 vision / 🧠 reasoning / 上下文窗 chip）且**驱动智能行为**：粘图则仅列 vision model、深 reasoning 则 reasoning model 排顶；model 与任务不匹配时显示内联警告 chip；**绝不建能力矩阵表** |
| OC-36 | minimize | 「已知 provider」快选放 CustomProviderForm 顶部，预填 6-8 个 OpenAI 兼容 provider(Groq/Together/Fireworks/Cerebras/Perplexity/DeepSeek/SiliconFlow) 的 baseUrl+名；**不做** marketplace/分页目录/logo gallery；一个下拉、仅名字 |
| OC-37 | reshape | auth_failed 自动打开 provider 设置并滚到出错 provider 的 key 字段（内联 chip 即导航）；rate_limited 显示 OC-23 倒计时 + 「切换 provider」快捷动作（若有其它 provider）；无错误分类学展示、无错误历史 |
| OC-38 | minimize | 一个「Export session」菜单项（session 卡右键 + session 菜单）+ save dialog 内 JSON/HTML 格式选择；session_complete 有文件改动后底部浮主动 CTA chip「导出 session 报告」恰好在相关时机被发现；格式固定无配置 |
| OC-39 | reshape | session_complete 且改动文件数>0 时自动浮 SessionDiffPanel 右 popout（主触发，非仅流式 write 期）；diff 批准也作为对话流底部下一轮 chip「N 个文件改动——审查」；popout 仍按需、绝不常驻分栏 |
| OC-45 | **defer→M2** | 在 M2 Partner 面板动工时建；先把 MCP/Tasks/Plan popout 做到 feature-complete 的具体代码，再从真实用法抽注册模式——预建抽象往往得到错的契约 |
| OC-46 | **defer→M2** | 在首个 OAuth connector(GitHub) 具体实现时定义；真实 OAuth loopback 流会暴露 v0.1.5 投机定义会漏的接口要求 |
| OC-49 | reshape | token 数总显示(精确)；成本仅在 SDK 给 live 定价时显示并标"估算"，不硬编会过期的价表；时间窗默认 30d 无持久设置；加主动智能：用量周环比涨 3x 时浮一个洞见 chip「本周 Anthropic 用量涨 3x——Zhipu 处理同类任务更省」(nudge 非 dashboard) |

### 7.3 新增智能 feature（KX-I-01 ~ KX-I-09）

> 这些是 opencode **没有**的、体现「极简且智能」的差异化弹药。全部尊重 shell-not-engine（需新 agent 行为的标 SDK ask）。

#### KX-I-01 · 零配置 provider 自动激活
**价值 高 · 工作量 S · SDK 否 · v0.1.2** — 首启扫描所有已知 provider env var（ANTHROPIC/ZHIPUAI/DEEPSEEK/MOONSHOT/OPENAI/ARK/DASHSCOPE/DOUBAO_API_KEY…），自动激活已有 key 的全部 provider，显示「从环境发现 N 个 provider——确认继续」一个按钮。检测到 ≥1 个即跳过 provider 选择步骤。`shell-env-hydrate.ts` 已检测 env key——本项把它升为**主 onboarding 路径**而非次要提示。⚠️ 见开放问题 #6（key 格式校验）。

#### KX-I-02 · 智能 popout 导播（Smart Popout Conductor）
**价值 高 · 工作量 M · SDK 否 · v0.1.4** — 按 session 状态自动浮正确的 popout，把 ADR-004 的"按需"实现为"相关时自动、而非用户记得点"：managed_task_status + work budget 升 H1+ → 开 Tasks；session_complete 有文件改动 → 开 Diff；SDK emit todo-list 有 pending → 开 Plan；状态解决则关或显未读角标。源自 OC-20 的 groupKind 驱动行为。opencode 无对应（静态面板布局）。

#### KX-I-03 · 会话自动命名（小模型）
**价值 高 · 工作量 S · SDK 否 · v0.1.4** — `BottomBar.tsx:39-54` 的 `deriveTitle()` 截断替换为异步 fire-and-forget 小模型(Haiku-4.5 等)调用，首条 AI 回复后生成 4-6 词语义标题；非阻塞——侧栏先显截断标题，<500ms 后原地静默更新；失败/无 provider/限流则 fallback 截断。代码注释（BottomBar.tsx:39-41）已预期此升级。消灭 "Untitled" session，Recents 可扫。⚠️ 见开放问题 #1（用哪个 utility model）。

#### KX-I-04 · 任务感知 model 自动路由
**价值 高 · 工作量 M · SDK 否 · v0.1.9** — session 创建前用本地关键词/模式分类(无外呼)分析 prompt：图片路径/粘贴→vision model；"design/refactor entire/analyze architecture"→reasoning model + 高 effort；<50 字短问→快/便宜 model。从已配 provider 预选最优 model+effort，显示可关闭 chip「用 GLM-4——检测到 reasoning 任务」，一键覆盖。消灭最常见摩擦（每次 session 前 provider→model→effort 导航）。路由词表来自 OC-33 能力数据。

#### KX-I-05 · 智能权限批处理
**价值 高 · 工作量 M · SDK 是 · v0.1.8** — agent 将执行一串同类工具调用时（从 SDK plan/todo 或快速连续同族权限请求探测），显示**一个**合并批准框替代 N 个 PermissionModal：「本 session 计划跑 ~N 个 npm install、2 个 git 操作、读 8 个文件。全允许 / 逐个审查 / 拒绝此类」，按工具名+风险分组。一个决策代替 N 个。⚠️ 见开放问题 #2（弱启发式版 vs 等 SDK plan-emit）。**SDK ask**：执行前 emit plan/todo。

#### KX-I-06 · Repointel 情境感知自动 warm
**价值 高 · 工作量 S · SDK 否 · v0.1.5** — 用户切项目目录（ProjectPicker / CLI teleport）时，若是 git repo 且上次 warm >30min，后台自动触发 Repointel warm；进度显示为现有 Repointel 状态 chip 上的细进度条（非阻塞 modal）。用户敲第一条消息时 Repointel 已就绪。F015 把 warm 设为手动——本项使其在切项目时自动，是 KodaX Repointel 差异化变成**零努力能力**的最直接体现。

#### KX-I-07 · 会话完成智能通知
**价值 中 · 工作量 S · SDK 否 · v0.1.5** — 长 session（耗时 >60s）到 session_complete 时触发原生桌面通知，含标题、改动文件数、一个「审查改动」按钮（聚焦窗口 + 激活 SessionDiffPanel）；<60s 不通知（短任务不打扰）。落实 PRD §5.2「桌面通知」并做成**时长感知 + 内嵌主动作**。

#### KX-I-08 · 环境化 provider 健康点
**价值 中 · 工作量 S · SDK 否 · v0.1.4** — ModelEffortSelector 底栏 provider chip 上一个彩点：绿(上次延迟<2s)/黄(2-8s 或重试中)/红(失败/限流)；session 空闲时无点。点击显示单行 tooltip「限流——6s 后重试」。无独立健康 dashboard/历史图/状态面板——在用户需要处(发下条消息时)就地显示。数据来自 OC-23 倒计时。

#### KX-I-09 · Diff 感知的 Quick Ask 升级
**价值 中 · 工作量 S · SDK 否 · v0.1.8** — Quick Ask 开着且输入含文件路径/错误栈/diff 片段且匹配当前项目内容时，自动提供「在 Coder 面板带完整上下文分析」CTA；点击则预填新 Coder session（文件引用+问题已填）。ADR-004 的「Continue in Coder」按钮当前总显示——本版**仅当内容分析提示需要工具访问时**才显示更智能的升级 CTA，区分"只是问问"与"这需要 agent 动手"。

### 7.4 反复杂度规则（纳入产品原则，守护未来 feature）

1. **无退役不加 tab**：加任何新设置 tab/区/常驻面板前，必须退役或合并一个现有的
2. **用户可选枚举不过 3**：任何用户可见选择器 >3 项（主题/effort/locale）即红旗——要么减到 3，要么改成自动检测
3. **配置旋钮否决权**：任何新 boolean 偏好/toggle 进 preferences.json 须书面论证"为何系统不能检测/推断正确值"——无论证则改自动检测
4. **常驻面板禁令**：任何常驻可见 UI 区须匹配现有 ADR-004 表面(LeftSidebar/BottomBar/Breadcrumb/对话流)；加新常驻区需 ADR 修订
5. **错误 CTA 预算**：任何错误态恰好一个动作按钮——多个 CTA 说明系统没决定哪个对、把决策甩给了用户
6. **智能优先排序**：任何新 feature 实现顺序恒为 ① 自动检测并静默执行 ② 显示可关闭确认 chip ③ 允许经显式设置覆盖——绝不从 ③ 起步
7. **用户界面无矩阵表**：能力对比/model 特性网格/权限列表/成本对比表，一律换成内联图标 + 情境警告 + 自动过滤；真需对比则属文档非产品
8. **测试隔离零 UI**：任何为测试/CI/调试加的 feature 在生产构建零用户可见面（test flag/debug 导出/mock 框架对终端用户不可见）

### 7.5 lens 开放问题（需团队拍板）

1. **KX-I-03 自动命名用哪个 model**：只配了 Zhipu(无 Anthropic) 时用最便宜的已配 model？全部限流时静默 fallback 截断？是否要显式"utility model"偏好字段，还是总用当前 session provider？
2. **KX-I-05 权限批处理**：依赖 SDK 执行前 emit plan/todo。无该事件只能按工具类型分组快速连续请求(弱信号)。v0.1.8 先发弱启发式版，还是等 SDK plan-emit？
3. **OC-26 语言检测**：OS locale 为 `C`/`POSIX`（Docker/CI 常见）时——静默 fallback 英文，还是仅对含糊 locale 显示一次性选择器？
4. **OC-29 设置弹窗范围**：现有 SettingsPopover 锚在底栏。OC-29 完全替换它（popover 变全弹窗），还是 popover 保留快速访问 + OC-29 加更深弹窗？（两个设置表面违反复杂度预算规则）
5. **OC-38 + OC-39 交互**：session_complete 有文件改动时，导出 CTA chip(OC-38) 与 Diff 自动浮(OC-39 经 KX-I-02) 会同时触发。谁优先？建议：Diff 先开(先审后导)，导出 CTA 作为 Diff 面板内审查后的次级 chip。
6. **KX-I-01 自动激活安全**：扫 env 找 key 对标准 key 正确，但用户可能有半设/畸形 key(占位串)。激活前校验格式(长度+前缀)，还是激活后让首次 API 调用经 OC-37 结构化错误处理失败？

---

## 附录 A：方法论 & 统计

- **工具**：20-agent 后台 workflow（`opencode-benchmark-kodax`）+ 4-agent lens workflow（`kodax-minimal-intelligent-lens`）
- **流程**：8 能力区域并行挖掘 → 逐区域 gap 分析（对照 KodaX 实际已建 F001-F038 + PRD 约束）→ 3 对抗式 critic（非目标守卫 / 冗余审计 / 完整性 critic）→ 综合规划
- **统计**：挖掘 **229** 项 opencode 能力 → **164** 候选进入批判 → **75** critic flag → 收敛为 **50** 推荐 feature + **35** 项明确拒绝 + **30** SDK 需求；lens 复核（3 视角）→ **21** 项 feature 瘦身/重塑 + **9** 个新增智能 feature（KX-I-*）+ **8** 条设计准则 + **8** 条反复杂度规则
- **消耗**：基准 2.18M tokens / 982 tool calls / ~31 min；lens 0.28M tokens / 44 tool calls / ~7 min
- **opencode 版本**：1.15.12（`c:/Works/PubGItProj/opencode`，sst monorepo）

## 附录 B：为什么 opencode 值得对标

opencode 与 KodaX Space 形态高度可比（都是 Electron + 复用同一 UI 给桌面/web），但商业模式相反（opencode 重云分享/企业 SaaS；KodaX 重 local-first/provider 中立/自托管）。这种「同形态、反模式」使它成为**理想的对标对象**：

- 桌面壳工程（崩溃恢复/更新/签名/i18n/代理）是与商业模式无关的纯工程财富，直接可借
- 它从 sidecar 迁到 in-process 的历史，是 KodaX ADR-003 的外部实证（已记在 [ADR-001](../ADR/ADR-001-shell-electron.md)）
- 它的云能力恰好划出 KodaX 的「不做」边界（§4），帮助守 scope
