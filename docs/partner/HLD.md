# KodaX Space Partner 高层设计（HLD）

> 本文负责 Partner 产品线内部架构。Space 进程模型、Runtime 所有权、全局 IPC 和安全基线以 [Space HLD](../HLD.md) 为准；Partner Surface 的共享决策以 [ADR-007](../ADR/ADR-007-partner-surface-model.md) 为准。共享契约变化先记录在 [INTEGRATION.md](INTEGRATION.md)，经双方接受后再更新全局文档。

## 1. 目标与非目标

本设计使 Partner 能在 Space 中组合知识工作 Profile、专家、连接器、资料和成果，同时保持清晰的进程、安全和数据所有权。

非目标：

- 不创建第二套 KodaX Runtime 或会话内核。
- 不让 Extension/Renderer 执行可信工具或持有凭据。
- 不复制 Session、Connector、Expert、Artifact 或 IPC 的第二套状态机。
- 不通过 Partner 需求改变 Coder daemon、工具或业务语义。
- 不把源码和运行数据移动到 `docs/partner/`。

## 2. 不可破坏的架构约束

1. Partner 复用同一 KodaX substrate，但由 Electron main 的 embedded inline owner 管理，不进入 Coder daemon。
2. Renderer 与 Extension frame 不运行 OAuth、CLI、Keychain 或真实远端工具。
3. `extensions/partner-library` 是声明式、独立构建的 UI/目录包，不是可信主进程插件。
4. 账号身份、凭据、会话授权、资源范围、策略、写入审核和真实调用只由可信宿主处理。
5. IPC schema、Host API 和 capability handshake 是跨层契约；UI 可见状态不是授权证据。
6. 共享文件的修改必须同时验证 Partner 和 Coder。

## 3. 系统拓扑

```text
Partner Extension
manifest + isolated UI
          │ limited frame messages
          ▼
Partner Renderer UI ── typed preload IPC ──► Electron Main
                                               ├─ Space Extension Host
                                               ├─ Partner Connector Host
                                               │    ├─ OAuth / Keychain
                                               │    ├─ official CLI / remote MCP
                                               │    └─ scope / policy / reviewed write
                                               ├─ PartnerInlineAdapter
                                               │    └─ KodaX embedded Runtime
                                               └─ Partner source/artifact/delivery stores

Coder Renderer ─────────────────────────────► Coder Runtime daemon
                     只共享明确的 Space 契约
```

## 4. 组件与职责

| 组件                 | 主要源码位置                                                                                             | 所有权                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Partner 插件包       | `extensions/partner-library/**`                                                                          | Partner 主维护，非可信扩展             |
| Partner 工作区       | `apps/desktop/renderer/src/features/partner/**`                                                          | Partner 主维护                         |
| 专家/连接器 UI       | `apps/desktop/renderer/src/features/extensions/Partner*`、`partner*`                                     | Partner 主维护，共享 Extension Host    |
| 连接器可信宿主       | `apps/desktop/electron/partner-connectors/**`                                                            | Partner 主维护，安全变化需共同评审     |
| Partner Runtime 适配 | `apps/desktop/electron/kodax/partner-*`                                                                  | Partner 主维护，共享会话接缝需共同评审 |
| 通用扩展宿主         | `apps/desktop/electron/space-extensions/**`                                                              | Space 共享                             |
| IPC 契约             | `packages/space-ipc-schema/**`                                                                           | Space 共享                             |
| Shell/Main/Window    | `apps/desktop/renderer/src/shell/**`、`apps/desktop/electron/main.ts`、`apps/desktop/electron/window/**` | Space 共享                             |

## 5. 专家会话流程

1. Extension 声明专家定义、revision、示例任务和可选 Skill ID。
2. Renderer 展示选择，但不得覆盖草稿或自动发送。
3. Electron host 校验 Extension/专家仍可用，将专家快照绑定到 Partner 会话。
4. 每轮开始时 `PartnerInlineAdapter` 组合基础 Partner Profile、专家快照、动态资料和宿主工具策略。
5. 当前轮使用不可变快照；修改、切换或卸载从下一轮生效。
6. 恢复、fork 和删除通过统一 Session lifecycle 保持或清理对应绑定。

## 6. 连接器与远端操作流程

```text
插件声明能力
  → 用户连接账号
  → 当前会话选择连接
  → 授权明确资源范围
  → run-scoped 工具物化
  → 宿主派发前重新校验
  → provider adapter 执行
  → receipt / read-back / provenance
  → Partner 任务详情或受审修改
```

- 读取只返回当前授权资源的带来源快照。
- 符合既定契约的低风险新建可直接执行；既有内容修改继续先审后提交。
- 删除、覆盖、权限、群发和后台同步默认不开放。
- `failed`、`unknown`、`partial` 不得显示为成功，也不得自动重试可能已经派发的操作。
- 远端 canonical URL 只能由 provider adapter 校验后交给 Partner 右侧隔离网页会话。

## 7. Extension 安装与隔离

- 安装包保持 `manifest.json + ui/index.html` 归档形态。
- Extension 声明 `requiredHostCapabilities`；宿主按能力而不是显示文案或版本猜测决定是否加载。
- iframe/webview 使用受限协议与 CSP，不获得 Node、任意 IPC 或宿主文件系统。
- 禁用、卸载或不兼容必须停止新能力，同时保留可安全读取的历史会话和审计记录。

## 8. 数据与状态所有权

运行数据位于 Space data directory，不在 Git 仓库，也不属于文档迁移：

```text
extensions/registry.json
extensions/packages/**
extension-data/<extensionId>/experts.json
partner-connectors/records.json
partner-sources.json
partner-kb.json
partner-file-proposals.json
partner-deliveries.json
partner-checkpoints*
```

凭据继续由官方 CLI profile、系统 Keychain 或受控 OAuth owner 保存。不得写入仓库、Extension 包、模型上下文、Artifact 或普通日志。

## 9. 安全边界

- Extension/Renderer 提供意图和展示，Electron main 作最终准入。
- 每次真实操作都重新校验 surface、session、connection ID/revision、scope、capability 和策略。
- 模型参数不能携带或选择 token、connection identity、任意 CLI argv 或未授权 URL。
- 外部资源身份、回执与内容核验分开记录；无法确认的结果失败关闭。
- Browser 登录 Cookie 与连接器 OAuth 身份独立，二者不能相互冒充。

## 10. 版本、身份与兼容性

以下身份必须稳定：

- Extension ID：`kodax.partner-library`
- connector ID
- expert ID 与 revision
- `hostApiVersion`
- `requiredHostCapabilities`
- 归档入口 `manifest.json` 与 `ui/index.html`

Space 应用版本、Partner library SemVer 和 Host API/capability 分别管理。源码目录整理不能顺便改变产品身份、持久化 key 或授权含义。

当前 `v0.1.0` 候选采用以下兼容边界：

- Partner 产品目标为 `v0.1.0`，首个 Partner Library 归档与之对齐为 `0.1.0`。
- Space 宿主保持上游兼容基线 `v0.1.46-alpha.5`，KodaX 依赖保持 `0.7.96-beta.1`；整理 Partner 版本不得修改 Space 根版本。
- Host API 与 capability 继续独立协商；当前能力依赖以 manifest 和 typed contract 为准，而不是从 `0.1.0` 版本字符串推断。
- Partner 发布标签使用 `partner-vX.Y.Z` 命名空间，避免与 Space 的 `vX.Y.Z` 标签混淆。

## 11. 失败、恢复与回滚

- Extension action 和单个 connector 可以独立禁用。
- 进程中断后，只有能证明未派发的任务才能安全重试；派发状态不明时收敛为 `unknown`。
- 旧持久化记录保持单向迁移和向前可读；不承诺新格式写入后可由旧二进制安全降级。
- Partner Extension 缺失或禁用时，Space/Coder 和核心 Partner 对话仍可启动。

## 12. 架构决策

跨 Space/Coder 的决策继续写入全局 ADR。Partner 内部决策放在 [`ADR/`](ADR/)；何时建立新 ADR 见 [Partner ADR 索引](ADR/README.md)。当前版本的具体接口分别见 [PF001](features/v0.1.0.md#feature-pf001)、[PF002](features/v0.1.0.md#feature-pf002)和[PF003](features/v0.1.0.md#feature-pf003)；原 P1–P9 的详细过程保留在[历史开发计划](features/v0.1.61-partner-plugin-library.md)中。
