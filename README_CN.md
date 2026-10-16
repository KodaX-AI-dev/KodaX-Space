<p align="center">
  <img src="resources/icon.png" alt="KodaX Space" width="128">
</p>

<h1 align="center">KodaX Space</h1>

<p align="center">
  <b>Provider 中立、本地优先的 KodaX Coding Agent 桌面工作台。</b><br>
  基于 Electron + React，将项目会话、任务观测、代码评审、Workflow、MCP、Artifact、记忆治理与 KodaX SDK runtime 组织进统一桌面界面。
</p>

<p align="center">
  <a href="https://github.com/KodaX-AI-dev/KodaX-Space/releases/latest"><img alt="release" src="https://img.shields.io/github/v/release/KodaX-AI-dev/KodaX-Space?style=flat-square"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-KAI--FCL-orange?style=flat-square"></a>
  <a href="https://github.com/KodaX-AI-dev/KodaX-Space/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/KodaX-AI-dev/KodaX-Space/ci.yml?style=flat-square&label=ci"></a>
  <img alt="KodaX SDK" src="https://img.shields.io/badge/KodaX_SDK-0.7.97--alpha.6-2ea44f?style=flat-square">
  <img alt="platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-34495e?style=flat-square">
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#为什么使用-kodax-space">为什么使用</a> ·
  <a href="#当前源码基线">当前源码基线</a> ·
  <a href="#开发">开发</a> ·
  <a href="#文档">文档</a> ·
  <a href="README.md">English README</a>
</p>

---

## 快速开始

### 下载安装包

稳定版安装包见[最新正式发布](https://github.com/KodaX-AI-dev/KodaX-Space/releases/latest)，当前为 `v0.1.46`。已发布的最新预发布版为 [`v0.1.47-alpha.2`](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.47-alpha.2)。预发布版不替代默认稳定下载。

| 平台    | 安装包                                            |
| ------- | ------------------------------------------------- |
| Windows | NSIS `Setup.exe`、`Portable.exe`，以及 zip 备用包 |
| macOS   | Intel / Apple Silicon `.dmg`                      |
| Linux   | `AppImage` 和 `.deb`                              |

当前公开构建未做系统级公开签名。首次启动时，Windows SmartScreen 或 macOS Gatekeeper 可能需要手动确认。请只从可信的 KodaX-AI 分发渠道获取安装包。

### 从源码启动

```bash
git clone https://github.com/KodaX-AI-dev/KodaX-Space.git
cd KodaX-Space
npm install --include=dev
npm run dev
```

`npm run dev` 会同时启动 Vite renderer、Electron main 进程，以及桌面客户端所用的 KodaX runtime 集成。

---

## 为什么使用 KodaX Space

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>本地优先的桌面壳</h3>
      Project、Session、偏好、MCP 配置、Skills、Artifact 与 KodaX 生态状态围绕用户本机组织，不强制进入云端工作流。
    </td>
    <td width="33%" valign="top">
      <h3>Provider 中立</h3>
      Space 消费 KodaX provider aliases 和自定义 OpenAI/Anthropic-compatible provider，不把桌面体验绑定到单一模型厂商。
    </td>
    <td width="33%" valign="top">
      <h3>任务导向 UI</h3>
      Environment Hub、Task Dock、Review Workspace、Artifact Workspace、Terminal 与 Floating Surface Policy 将状态、证据、评审和决策分层。
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h3>KodaX SDK 一等桌面面</h3>
      Space 在 Electron main 进程中 in-process import KodaX SDK，和 KodaX CLI/REPL 共享 session、workflow、skill、MCP 与 runtime event 语义。
    </td>
    <td valign="top">
      <h3>受治理的自动化</h3>
      Permission mode、对话流内联提问卡、系统 Keychain、可信 IPC schema 与本地 license gate，让 agent 工作可见、可审、可控。
    </td>
    <td valign="top">
      <h3>丰富的项目上下文</h3>
      内置多 tab 终端、PDF/docx/xlsx 预览、图片输入、Workflow 面板、Memory Governance、Scoped Markdown Agents，帮助长会话保持可检查。
    </td>
  </tr>
</table>

## 当前源码基线

**当前源码为 Issue 222 本地恢复候选 `0.1.47-alpha.2.issue222.3`，依赖 SDK `0.7.97-alpha.6.issue222.3`。** 根目录、Desktop、共享 IPC 与 UI 包统一版本；SDK 使用 `vendor/issue-222/` 下完整性锁定的公共包 tarball，详见[恢复验证记录](docs/releases/issue-222-recovery-verification.md)。已发布基线仍为 Space `v0.1.47-alpha.2` / Registry SDK `0.7.97-alpha.6`，本地候选尚未对外发布。

- 共享 Coder 输入、当前聊天、历史分页/搜索、统计和退出均使用 SDK 公共契约。当前 view 与历史窗口分开，保留图片、长正文、工具和 Artifact 身份，刷新不重复拼接对话。
- 普通 Coder 新会话在首个有效输入保存后才落盘；旧空记录仅在完整历史确认后隐藏，不删除原文件。侧栏使用真实消息时间，设置与元数据不会把旧会话顶到最前。
- SDK 包与 Host 分别验证能力，包含 `productClient:1`、`sessionDrafts:1`、`sandboxRuntime:11`、`runtimeAutoModeGuardrail:6`、`sharedSessionSettings:2` 和 `effectiveConfig:1`；Host 还要求 `providerCredentialBroker:2`。不以版本号代替能力协商。
- Space 产品问题使用 `space_manual`；`kodax_manual` 保留 SDK/CLI 机制手册。SDK 内置 `relationship_scan.depth` 已使用整数范围，Gemini 兼容请求不需要客户端 schema 补丁。
- 实时 Sidecar Verifier 与 `/verifier-log` 已移除；保留 Stall logging 和历史记录，结果检查使用工具证据与 `visual-review`。可选 `@kodax-ai/artifacts` 尚未发布，不宣称新增 PPT 工具。

Windows、macOS、Linux 沿用现有沙箱、凭据和退出边界；macOS 未签名构建仍需手动下载 DMG 更新。Partner 保留自己的 inline owner、现有内置库与外部账号验收边界。

见[本次发布准备](docs/releases/v0.1.47-alpha.2-release-readiness.md)、[版本设计](docs/features/v0.1.47.md)、[用户手册](docs/USER_MANUAL.zh-CN.md)和[能力台账](docs/KODAX_CAPABILITY_LEDGER.md)。

## 当前正式版本

最新稳定版为 [`v0.1.46`](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.46)（2026-10-06），精确依赖稳定 KodaX `0.7.96`。已发布的最新预发布版为 [`v0.1.47-alpha.2`](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.47-alpha.2)，使用 SDK `0.7.97-alpha.6`。

先前 Partner beta.3 的 Release 已撤回，tag 和原验收记录保留为历史；后续稳定版与本候选继续包含现有 Partner 集成。完整版本变化见 [CHANGELOG](CHANGELOG.md)。

## 历史发布

**v0.1.35 - Durable Managed Runs and Session History Integrity**

[`v0.1.35`](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.35) 已于 2026-08-05 发布，package 版本为 `0.1.35`，精确对齐 KodaX 0.7.80。Space 通过 `managedRunDurability:1` 保护 canonical Run 边界，以 `runId`/`turnId` 保持实时与历史对应。

**v0.1.34 - Runtime Safety and Desktop Lifecycle Hardening**

[`v0.1.34`](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.34) 已于 2026-07-30 正式发布，package 版本为 `0.1.34`，精确对齐 npm 正式发布的 KodaX 0.7.78。必需的 `main`、四平台预检和 tag release workflow 已全部通过；完整证据与公开产物摘要记录在发布就绪文档中。

| 领域         | 摘要                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Runtime 安全 | 显式能力协商新增 orphan exit、集成韧性、Auto v4、Skill learning-loop 与有界 sandbox observation，不使用仅 SemVer 的在线门禁。 |
| 集成健康     | MCP/A2A/Extension 保留 last-known-good，投影 watcher/revision/reload 诊断，并对 Space MCP manager 做事务切换。                |
| 桌面生命周期 | Windows/macOS/Linux 真正退出会停止 Runtime 或恢复 Space；仅 Space 自动拉起的 daemon 获得 30 秒空闲孤儿回收。                  |
| 正式包执行   | ASRT/sandbox helper 从物理 resources 解析；界面区分 sandbox 成功、普通权限 fallback 和未使用 sandbox。                        |
| 启动与历史   | main-owned overlay 消除重复 loading 闪烁，位置化 replay 保证 interrupt 回复仍位于下一条用户 query 之前。                      |
| 验证         | 本地与 GitHub 证据写入版本化 readiness 文档；Issue 133 与 F138 的未完成边界继续明确保留。                                     |

完整说明见 [CHANGELOG.md](CHANGELOG.md)、[v0.1.34 设计](docs/features/v0.1.34.md)和[v0.1.34 发布记录](docs/releases/v0.1.34-release-readiness.md)。

## 历史正式版本

**v0.1.32 - Shared Coder and Usable Partner Knowledge**

正式发布：2026-07-25，精确对齐 KodaX 0.7.76。该版本把 Coder 迁到共享 profile daemon，交付 F122-F124 Partner 知识/引用 grounding、受审 builtin、精确历史体验和 Windows 可控托盘 owner。详见 [v0.1.32 设计](docs/features/v0.1.32.md)与[发布记录](docs/releases/v0.1.32-release-readiness.md)。

**v0.1.31 - Runtime Contract Alignment and Semantic Control**

正式发布：2026-07-12，tag 为 `v0.1.31`。F116、F055、F069、F120 在精确 KodaX 0.7.68 基线上一并交付。详见 [v0.1.31 设计](docs/features/v0.1.31.md)和[F116 实施记录](docs/features/v0.1.31-implementation-plan.md)。

**v0.1.30 - External Agent Orchestration Gateway Foundation**

正式发布：2026-07-12，tag 为 `v0.1.30`。

本版本对齐 `@kodax-ai/kodax@0.7.67`，并把协议中立的 External Agent Executor Plane 接入 Space 现有实时会话和 Workflow Host。

| 领域               | 摘要                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 统一调度           | Worker 与显式 Workflow 共用一个 `agentExecutorPlane`、策略过滤目录、不透明 `agent_id` 路由和持久任务账本。                             |
| Main 进程治理      | 注册写入、策略、凭据代理、Artifact 边界和持久化均留在 main；renderer 只接收脱敏摘要。                                                  |
| Reference 产品界面 | Runtime 设置页管理和预检注册；Workflow 启动器选择实时默认子 Agent；Task Dock 展示生命周期、审计事件、输入、取消与对账操作。            |
| 双语验收           | 完整 Reference Agent 界面已适配英文和简体中文，并由 Electron E2E 覆盖。                                                                |
| 能力真实性         | Runtime 配置的 A2A 在 KodaX 0.7.77 Coder daemon 能力协商通过后可用；MCP Tasks 与受治理 HTTP 在各自适配器交付并通过合规验证前保持隐藏。 |
| KodaX 0.7.67       | 兼容测试覆盖 Runtime Worker hard-dispose，以及外部 Agent 注册、发现、启动和终态结果闭环。                                              |

完整版本说明见 [CHANGELOG.md](CHANGELOG.md)、[docs/features/v0.1.30.md](docs/features/v0.1.30.md) 与 [F115 External Agent 设计](docs/features/v0.1.30-external-agents.md)。

## 产品界面

| 界面               | 用途                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coder workspace    | 主 AI Coding Session 界面，底层由 KodaX SDK runtime 驱动；当前源码把有效上下文与累计会话 Token 分为两个状态入口。                                                                                               |
| Environment Hub    | 紧凑的项目、会话、环境路由器，承载 location、branch、changes、sources、mode context。                                                                                                                           |
| Task Dock          | 右侧常驻任务面，显示 run 状态、plan、agents、workflow、changes、sources、artifacts、context。                                                                                                                   |
| Review workspace   | 用于查看 diff 和文件评审。                                                                                                                                                                                      |
| Artifact workspace | 用于预览、检查、导出生成产物。                                                                                                                                                                                  |
| Terminal workspace | 作用域绑定到当前项目的真实 PTY 多 tab 终端。                                                                                                                                                                    |
| MCP 和 Skills      | KodaX MCP servers 与 skills 的桌面管理和展示入口，并随包提供经审查的 `frontend-slides` 与 `huashu-design` builtin。                                                                                             |
| Memory Governance  | 评审、批准、拒绝、检查 memory proposals 和 approved references。                                                                                                                                                |
| Partner surface    | 已启用 workspace-first 知识工作界面，提供 Sources、KB、Outputs、checkpoint 写入、Office/PDF 便利生成与本地 policy/audit。                                                                                       |
| External Agents    | KodaX 0.7.89 Runtime 配置的 Coder Agent 使用独占 Actor owner、durable managed Run 和统一 Actor/Turn 任务；Space Reference Agent 保留主窗口管理和 durable Task Dock 干预路径。MCP Tasks 与受治理 HTTP 继续门控。 |

## 配置模型

本集成分支将 Partner 插件库随 Space 一起打包。首次启动后进入 **Partner → 插件**，即可选择专家及默认方法；使用外部服务时，仍需连接自己的账号并授权资料范围。用户停用、卸载及已有手动安装包的选择会保留。验证和发布状态见[集成与交付记录](docs/partner/releases/space-bundled-integration.md)；Coder 共用能力另行推进。

KodaX Space 会尽量复用 KodaX 生态状态；桌面 UI 特有状态则由 Space 自己管理。

| 状态                                     | 行为                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `~/.kodax/config.json`                   | CLI/SDK/Space 共享的 provider/model/effort/permission/custom provider/compaction 等核心配置；不再新写 MCP/A2A/Extension。 |
| `~/.kodax/integrations/mcp.json`         | 版本化的用户 MCP server 声明；Settings 可迁移只读回退的旧 `config.json#mcpServers`，且默认保留旧字段。                    |
| `~/.kodax/integrations/extensions.json`  | 版本化的可信 filesystem Extension 路径；Space 默认只发现，设置 `KODAX_SPACE_ENABLE_SDK_EXTENSIONS=1` 后才加载。           |
| `~/.kodax/integrations/a2a.json`         | 版本化、由 Runtime 持有的 A2A registration 配置。                                                                         |
| `<project>/.kodax/integrations/mcp.json` | Space 项目 MCP 兼容层；同名项目 server 覆盖全局声明。                                                                     |
| `~/.kodax/sessions/`                     | 与 KodaX CLI/REPL 共享 session 历史。                                                                                     |
| `~/.kodax/handoffs/`                     | 桌面 handoff inbox，用于 session continuity。                                                                             |
| `~/.kodax/skills/` 和项目 skills         | 由 KodaX skills runtime 发现。                                                                                            |
| API keys                                 | 优先进入系统 Keychain；仍支持环境变量。                                                                                   |
| `~/.kodax/space/`                        | Space 自有偏好、项目、UI 状态和桌面元数据。                                                                               |
| `<profile-root>/runtime/`                | Shared Runtime daemon 状态与 run/event journal；默认 profile 下实际为 `~/.kodax/runtime/`。                               |

## 架构

KodaX Space 是 npm workspace monorepo，包含 Electron main、沙箱化 React renderer，以及共享 IPC/UI 包。

```text
KodaX-Space/
├── apps/
│   └── desktop/
│       ├── electron/          # Electron main、preload、IPC handlers、KodaX host integration
│       └── renderer/          # React UI、shell、features、stores、visual surfaces
├── packages/
│   ├── space-ipc-schema/      # renderer <-> main IPC 的 zod schema
│   └── space-ui-kit/          # 共享 UI primitives
├── docs/                      # PRD、HLD、ADR、feature notes、manuals、ledgers
├── e2e/ and tests/            # Playwright 与集成覆盖
├── scripts/                   # dev、build、packaging、smoke helpers
└── resources/                 # app icon 与 license policy resources
```

关键技术选择：

| 层              | 选择                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell           | Electron 42                                                                                                                                                         |
| Renderer        | React 19、Vite、TypeScript、Zustand                                                                                                                                 |
| UI/runtime 分离 | Renderer 不直接执行 LLM/tool；特权工作留在 Electron main。                                                                                                          |
| KodaX 集成      | Electron main 使用公开 owner 契约；Coder 默认连接 profile daemon，也可使用 Settings 选择的 Embedded 回退；Partner 与明确的 host-provider 服务保持 embedded inline。 |
| IPC             | 来自 `@kodax-space/space-ipc-schema` 的 zod-validated contracts。                                                                                                   |
| Terminal        | xterm.js + node-pty。                                                                                                                                               |
| Preview         | Monaco、pdfjs、mammoth/docx、SheetJS/xlsx。                                                                                                                         |
| Tests           | Node test runner、Playwright、typecheck、packaging smoke checks。                                                                                                   |

## 开发

请使用 Node.js 22.12 或更高版本。仓库在 `.nvmrc` 中固定 Node 22.23.1，CI 读取同一文件。

```bash
# 安装依赖
npm install --include=dev

# 启动 Vite + Electron 开发模式
npm run dev

# 类型检查 Electron main、renderer 和 workspace packages
npm run typecheck

# 运行 workspace 单元测试
npm test

# 构建 renderer + main + workspace packages，不打安装包
npm run build:smoke

# 打包安装包
npm run build:win
npm run build:mac
npm run build:linux

# 校验打包结果
npm run smoke:pack
```

常用定向命令：

```bash
npm test -w @kodax-space/desktop
npm test -w @kodax-space/space-ipc-schema
npm run e2e
npm run e2e:headed
```

## 文档

| 文档                                                                                                             | 用途                                                                       |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [README.md](README.md)                                                                                           | 英文 README。                                                              |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                                                               | 贡献边界、验证要求和文档同步规则。                                         |
| [docs/README.md](docs/README.md)                                                                                 | 文档中心，以及当前文档/历史文档索引。                                      |
| [docs/USER_MANUAL.zh-CN.md](docs/USER_MANUAL.zh-CN.md)                                                           | 面向 v0.1.45 发布基线的图解中文手册。                                      |
| [docs/USAGE.md](docs/USAGE.md)                                                                                   | 源码启动、profile、Runtime Host、测试、打包与排障。                        |
| [docs/BUILTIN_SKILLS.md](docs/BUILTIN_SKILLS.md)                                                                 | builtin skill 的来源、许可、更新、补丁和打包完整性流程。                   |
| [docs/releases/v0.1.34-release-readiness.md](docs/releases/v0.1.34-release-readiness.md)                         | v0.1.34 的发布门禁、产物摘要、已知风险与发布证据。                         |
| [docs/releases/v0.1.37-release-readiness.md](docs/releases/v0.1.37-release-readiness.md)                         | v0.1.37 的 KodaX 0.7.83 合约、门禁与发布证据。                             |
| [docs/features/v0.1.45.md](docs/features/v0.1.45.md)                                                             | v0.1.45 内联提问卡与 KodaX 0.7.95 边界。                                   |
| [docs/releases/v0.1.45-release-readiness.md](docs/releases/v0.1.45-release-readiness.md)                         | v0.1.45 门禁、精确 KodaX 0.7.95 合约与发布证据。                           |
| [docs/test-guides/ISSUE_193_v0.1.45_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_193_v0.1.45_REGRESSION_GUIDE.md) | v0.1.45 对话因果顺序及 Sidecar/Interrupt 刷新恢复覆盖。                    |
| [docs/test-guides/ISSUE_196_v0.1.45_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_196_v0.1.45_REGRESSION_GUIDE.md) | v0.1.45 Session 历史、queue、状态、加载与压缩反馈覆盖。                    |
| [docs/test-guides/ISSUE_197_v0.1.45_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_197_v0.1.45_REGRESSION_GUIDE.md) | v0.1.45 构建代理与退出恢复覆盖。                                           |
| [docs/features/v0.1.44.md](docs/features/v0.1.44.md)                                                             | 历史 v0.1.44 原生提醒、后台退出结算与 KodaX 0.7.93 边界。                  |
| [docs/releases/v0.1.44-release-readiness.md](docs/releases/v0.1.44-release-readiness.md)                         | 历史 v0.1.44 门禁、精确 KodaX 0.7.93 合约与发布证据。                      |
| [docs/test-guides/FEATURE_145_v0.1.44_TEST_GUIDE.md](docs/test-guides/FEATURE_145_v0.1.44_TEST_GUIDE.md)         | 历史 v0.1.44 原生数字角标验收覆盖。                                        |
| [docs/test-guides/ISSUE_189_v0.1.44_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_189_v0.1.44_REGRESSION_GUIDE.md) | 历史 v0.1.44 后台完整退出结算覆盖。                                        |
| [docs/test-guides/ISSUE_190_v0.1.44_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_190_v0.1.44_REGRESSION_GUIDE.md) | 历史 v0.1.44 previous-boot Windows ACL 恢复覆盖。                          |
| [docs/test-guides/ISSUE_191_v0.1.44_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_191_v0.1.44_REGRESSION_GUIDE.md) | 历史 v0.1.44 外部任务空态与重试态覆盖。                                    |
| [docs/test-guides/ISSUE_192_v0.1.44_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_192_v0.1.44_REGRESSION_GUIDE.md) | 历史 v0.1.44 安静安全退出通知覆盖。                                        |
| [docs/features/v0.1.43.md](docs/features/v0.1.43.md)                                                             | v0.1.43 Runtime 退出、KodaX 0.7.92、sandbox v4 与发布边界。                |
| [docs/releases/v0.1.43-release-readiness.md](docs/releases/v0.1.43-release-readiness.md)                         | v0.1.43 门禁、精确 KodaX 0.7.92 合约与发布证据。                           |
| [docs/test-guides/ISSUE_188_v0.1.43_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_188_v0.1.43_REGRESSION_GUIDE.md) | v0.1.43 完整退出结算与恢复覆盖。                                           |
| [docs/test-guides/ISSUE_256_v0.1.43_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_256_v0.1.43_REGRESSION_GUIDE.md) | v0.1.43 sandbox v4 / crash-outcome v2 覆盖。                               |
| [docs/features/v0.1.42.md](docs/features/v0.1.42.md)                                                             | 历史 v0.1.42 causal transcript, latest KodaX 0.7.89, and release boundary. |
| [docs/releases/v0.1.42-release-readiness.md](docs/releases/v0.1.42-release-readiness.md)                         | 历史 v0.1.42 gates, exact KodaX 0.7.89 contract, and release evidence.     |
| [docs/test-guides/ISSUE_182_v0.1.42_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_182_v0.1.42_REGRESSION_GUIDE.md) | v0.1.42 canonical/live ordering regression coverage.                       |
| [docs/test-guides/ISSUE_183_v0.1.42_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_183_v0.1.42_REGRESSION_GUIDE.md) | v0.1.42 terminal owner reconciliation coverage.                            |
| [docs/test-guides/ISSUE_184_v0.1.42_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_184_v0.1.42_REGRESSION_GUIDE.md) | v0.1.42 continued-Run projection coverage.                                 |
| [docs/test-guides/ISSUE_185_v0.1.42_REGRESSION_GUIDE.md](docs/test-guides/ISSUE_185_v0.1.42_REGRESSION_GUIDE.md) | v0.1.42 completion notification and Actor v2 coverage.                     |
| [docs/features/v0.1.40.md](docs/features/v0.1.40.md)                                                             | v0.1.40 维护范围与 KodaX 0.7.86 sandbox 边界。                             |
| [docs/releases/v0.1.40-release-readiness.md](docs/releases/v0.1.40-release-readiness.md)                         | v0.1.40 门禁、KodaX 0.7.86 合约与发布证据。                                |
| [docs/features/v0.1.39.md](docs/features/v0.1.39.md)                                                             | 历史 v0.1.39 维护范围与 KodaX 0.7.85 边界。                                |
| [docs/releases/v0.1.39-release-readiness.md](docs/releases/v0.1.39-release-readiness.md)                         | 历史 v0.1.39 门禁、KodaX 0.7.85 合约与发布证据。                           |
| [docs/features/v0.1.38.md](docs/features/v0.1.38.md)                                                             | 历史 v0.1.38 维护范围与 KodaX 0.7.84 边界。                                |
| [docs/releases/v0.1.38-release-readiness.md](docs/releases/v0.1.38-release-readiness.md)                         | 历史 v0.1.38 门禁、KodaX 0.7.84 合约与发布证据。                           |
| [docs/CODING_AGENT_BEGINNER_BEST_PRACTICES.zh-CN.md](docs/CODING_AGENT_BEGINNER_BEST_PRACTICES.zh-CN.md)         | Coding Agent 初学者最佳实践教程，覆盖软件研发和微服务场景。                |
| [docs/PRD.md](docs/PRD.md)                                                                                       | 产品需求和产品定位。                                                       |
| [docs/HLD.md](docs/HLD.md)                                                                                       | 高层架构与系统设计。                                                       |
| [docs/ADR/](docs/ADR/)                                                                                           | 架构决策记录。                                                             |
| [docs/FEATURE_LIST.md](docs/FEATURE_LIST.md)                                                                     | Feature ledger、roadmap 和 release planning 状态。                         |
| [docs/FEATURES_ARCHIVED.md](docs/FEATURES_ARCHIVED.md)                                                           | 已归档版本索引、reviewed-out 决策和 reopen gates。                         |
| [docs/KODAX_CAPABILITY_LEDGER.md](docs/KODAX_CAPABILITY_LEDGER.md)                                               | KodaX SDK 能力消费和降级说明。                                             |
| [CHANGELOG.md](CHANGELOG.md)                                                                                     | 版本历史。                                                                 |

## 路线图

近期计划以 [docs/FEATURE_LIST.md](docs/FEATURE_LIST.md) 为准。当前重点：

| 版本线                       | 重点                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `v0.1.32`                    | 已发布 Shared-daemon Coder、Partner 项目知识/引用、受审 builtin、精确历史体验、Windows 图标/托盘与发布加固。                      |
| `v0.1.33`                    | 修正后的 KodaX 0.7.77 正式版：Daemon/Embedded 安全选择、会话文件操作、附件/上下文修复与打包 Runtime 门禁。                        |
| `v0.1.34`                    | KodaX 0.7.78 Runtime 安全、集成韧性、可见彻底退出、sandbox helper 打包、启动 UX 和历史回放加固。                                  |
| `v0.1.35`                    | npm 正式 KodaX 0.7.80、durable managed Run 协商、会话历史完整性、Auto timeout 默认值与对应手册/测试。                             |
| `v0.1.35`                    | 基于已发布 Runtime 学习闭环的最小 learned Skill 安全控制面，不建设第二套存储或多 carrier Learning Center。                        |
| `v0.1.36`                    | KodaX 0.7.82、活动 Session 输入准入、history/live 对齐、跨 Session 恢复隔离与发布文档收口。                                       |
| `v0.1.37`                    | KodaX 0.7.83、多 Session 恢复、安全退出重启、语义启动背景和发布文档对齐。                                                         |
| `v0.1.44`                    | 精确 KodaX 0.7.93、F145 原生提醒、后台完整退出、Task Dock/Repointel/历史对齐与外部任务恢复态。                                    |
| `v0.1.45`                    | 精确 KodaX 0.7.95、内联 ask_user/guardrail 提问卡、conversationHistory v2、sandbox v5、已准入 Run 重连恢复与幂等发送单气泡。      |
| `v0.1.43`                    | 精确 KodaX 0.7.92、SDK-owned 完整退出、sandboxRuntime v4、crashOutcomeModel v2 与有效 live-output segment。                       |
| `v0.1.42`                    | 精确 KodaX 0.7.89、Actor settlement v2 与 Session/Run/Turn 因果 transcript 对齐。                                                 |
| `v0.1.40`                    | KodaX 0.7.86、sandboxRuntime v3、Issue 128 打包 Shell、stale owner 恢复、可重试 owner 清理与完整发布文档同步。                    |
| `v0.1.39`                    | KodaX 0.7.85、Actor settlement convergence、Session journal epoch 隔离、unknown Run 输入、精确 Stop、输入去重与完整发布文档同步。 |
| `v0.1.38`                    | KodaX 0.7.84、Agent progress/Stop 收敛、Session 重新激活恢复、图标打包与完整发布文档同步。                                        |
| `v0.1.61`                    | Space 独立实现的中文优先 DOCX/PDF/XLSX/PPTX builtin 与语义 UI 精修，并提供有界执行和真实验证回执。                                |
| `v0.1.64`、`v0.1.66-v0.1.68` | Partner Skill workspace、knowledge quality/curation、Presentation Project 与 SDK-gated Memory Agent host。                        |
| `v0.1.72`                    | 本地化完成、beta diagnostics、release channel、updater/distribution trust。                                                       |
| `v0.2.x`                     | Governed Browser 与 Partner packs、只读 Connector snapshots、本地 Automations、可刷新 Artifacts。                                 |

Remote runner、Notebook、Knowledge Graph、桌面 screen automation 和未发布 External Agent adapter 都是带 reopen gate 的 watchlist，不是已承诺版本 feature。

## License

[KodaX-AI Fair Core License (KAI-FCL)](LICENSE) - Copyright 2026 icetomoyo。

KAI-FCL 是 source-available / fair-core 协议，不是 OSI open source。商业、企业、托管部署或客户再分发用途，需要 KodaX-AI 授权，并在需要时具备有效 entitlement。

KodaX-AI 当前官方许可政策：KodaX Space 0.1.27 及之后版本，在由 KodaX-AI 带有该 notice 分发时，适用 KAI-FCL 或配套 KodaX-AI 客户条款。此前已带 Apache-2.0 notice 分发的历史 tag、source archive、installer 或其他副本，仍只对那些特定副本保留 Apache-2.0。
