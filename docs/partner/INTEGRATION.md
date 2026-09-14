# Partner 与 Space/Coder 集成契约

## 1. 文档职责与权威来源

本文记录 Partner 与 Space/Coder 的共享接缝、Feature 映射、上游差异和集成证据。

- Partner 开发与集成状态：[Partner Feature List](FEATURE_LIST.md)
- Space 正式功能状态：[Space Feature List](../FEATURE_LIST.md)
- Space 共享架构：[Space HLD](../HLD.md)
- Partner 内部架构：[Partner HLD](HLD.md)
- 上游同步和验证流程：[Development](DEVELOPMENT.md)

本文不复制完整产品需求，也不以本地 `Completed` 冒充 Space `Integrated`。

## 2. 产品线所有权

| 范围                                                | 主要维护   | 评审规则                                    |
| --------------------------------------------------- | ---------- | ------------------------------------------- |
| `docs/partner/**`、Partner 插件包与专属 UI          | Partner    | 影响共享契约时增加 Space 评审               |
| Connector host 与 Partner Runtime adapter           | Partner    | 安全、凭据、远端写入和 Session 接缝共同评审 |
| IPC schema、Space Extension host、Shell/Main/Window | Space 共享 | Partner 与 Coder 双向回归                   |
| Space 总 PRD/HLD/Feature List/发布记录              | Space 共享 | 只有融合被接受后更新                        |

## 3. Shared Seams

| 接缝                       | 主要位置                                           | 不变量                            |
| -------------------------- | -------------------------------------------------- | --------------------------------- |
| Surface Runtime owner      | `host.ts`、`session-adapter.ts`、`real-session.ts` | Partner 不改变 Coder daemon owner |
| Session 与 Expert snapshot | session schema、runtime store                      | 恢复、切换和 fork 保持精确版本    |
| IPC/preload                | IPC schema、handler、preload allowlist             | 先定义 typed contract，再接 UI    |
| Extension Host             | `space-extensions/**`                              | 通用能力需要共同评审              |
| Connector Host             | `partner-connectors/**`                            | Partner 主维护，主进程作最终授权  |
| Shell/布局                 | `Shell.tsx`、`BottomBar.tsx`、`LeftSidebar.tsx`    | `code` surface 行为保持不变       |
| Browser 安全               | CSP、navigation guard、frame policy                | 平台接入不得放宽全局策略          |
| Build/Packaging            | manifests、scripts、builder config                 | 主应用和独立 Extension 都要验证   |

## 4. Coder 非回归约束

- `surface === 'code'` 的工具、布局、会话、daemon 和快捷入口保持原行为。
- Partner channel/tool 不暴露给 Coder，Coder 不依赖 Partner 插件是否安装。
- Partner Extension 不通过修改 Coder 业务逻辑获得权限。
- Partner Extension 缺失、禁用或不兼容时，Space 和 Coder 仍能启动。
- 共享文件即使自动合并，也必须执行 Coder 回归；文本无冲突不等于行为兼容。

## 5. Partner → Space Feature 映射

```text
Partner 开发：Planned -> InProgress -> Completed
Partner 融合：Local -> Ready -> Proposed -> Integrated
```

| Partner Feature | Space Feature | Target   | Development | Integration | Evidence                                         | Updated    |
| --------------- | ------------- | -------- | ----------- | ----------- | ------------------------------------------------ | ---------- |
| PF001           | F146          | `v0.1.0` | InProgress  | Local       | [PF001 design](features/v0.1.0.md#feature-pf001) | 2026-09-04 |
| PF002           | F146          | `v0.1.0` | InProgress  | Local       | [PF002 design](features/v0.1.0.md#feature-pf002) | 2026-09-04 |
| PF003           | F146          | `v0.1.0` | InProgress  | Local       | [PF003 design](features/v0.1.0.md#feature-pf003) | 2026-09-04 |
| PF004           | —             | `v0.1.0` | Completed   | Local       | [PF004 design](features/v0.1.0.md#feature-pf004) | 2026-09-07 |
| PF008 | — | `v0.1.0` | Completed | Local | [PF008 design](features/v0.1.0.md#feature-pf008) | 2026-09-07 |

| PF005 | — | `v0.1.0` | Completed | Local | [PF005 design](features/v0.1.0.md#feature-pf005) | 2026-09-07 |

```text
F146 <- PF001, PF002, PF003
```

规则：

- 不在本表复制 PF 的完整描述。
- 没有现存 F-ID 时不得猜测或抢占编号。
- 进入 `Ready`、`Proposed`、`Integrated` 时记录目标分支、PR/提交和验证证据。
- 一个 Space F-ID 可以承接多个 PF；映射不改变两边各自的状态权威。

## 6. 当前集成快照

| 项目                   | 当前证据                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| Partner branch         | `integration/partner-upstream-20260904-v0.1.0@ea7d61c`（本次文档重整前） |
| Space baseline         | `package-lock.json`：Space `0.1.46-alpha.5` / KodaX `0.7.96-beta.1`      |
| Partner release target | `v0.1.0`                                                                 |
| Partner library target | `0.1.0`                                                                  |
| Partner Features       | PF001、PF002、PF003 / F146，均为 `InProgress / Local`                    |

该表是带日期的集成快照，不替代 Git。每次同步后应更新提交证据和验证结果；Partner library 的目标版本只有在 manifest 与打包产物同步后才成为发布事实。

2026-09-07 增量：PF004 共享连接器能力与 Codex 开发方法已完成本地验收。基于 `241a6de` 加本地工作区修复；状态为 `Completed / Local`，证据见 [PF004 验收记录](features/PF004-shared-connector-validation.md)，上游映射待集成时确认。旧表保留为 2026-09-04 快照。

## 7. 待协调的上游差异

- Space F130 与 PF003 对 Partner 统一详情工作区、任务卡和右侧资源打开的产品描述需要在集成时统一。
- PF004 触及 IPC schema、聊天链接与 Shell/详情共享接缝；必须验证 Coder 链接行为与浏览器策略，不能据此自动宣告 F096 或 F146 完成。
- Space F096 仍管理通用 Connector foundation；PF002 的连接器预览、可信宿主和平台切片不能自动把 F096 标记完成。
- PF001–PF003 都是 F146 的 Partner 内部切片；在上游接受前不复制成三个 Space Feature。
- Partner `v0.1.0` 与 library `0.1.0` 是独立版本轴，不覆盖 Space `v0.1.46-alpha.5` 或 KodaX `0.7.96-beta.1`。

## 8. 上游同步与合并门槛

1. 从干净的 F146 创建 `integration/partner-upstream-YYYYMMDD`。
2. 合入最新 `upstream/main`，解决共享代码和文档冲突。
3. 验证 Partner Extension、Partner/Coder desktop、IPC、类型、lint 和打包。
4. 记录真实服务人工项与自动 fixture 的差异。
5. 验证通过后再合回 F146；准备进入 Space 时使用明确 PR/目标分支。
6. 只有目标提交进入 Space 主线后才将 PF 标记 `Integrated`。

详细命令见 [Development](DEVELOPMENT.md)。

## 9. 兼容性来源

不要在多份文档手抄易漂移版本，检查以下权威文件：

| 项目                    | 权威来源                                        |
| ----------------------- | ----------------------------------------------- |
| Space version           | `package.json`                                  |
| Desktop version         | `apps/desktop/package.json`                     |
| KodaX version/integrity | `package-lock.json`                             |
| Partner Library version | `extensions/partner-library/manifest.json`      |
| Host API                | Partner manifest + IPC schema                   |
| Host capabilities       | Partner manifest + Electron host implementation |

## 10. 回滚与总文档更新

- 优先关闭单个 Extension action 或 connector，不回滚整个 Space Runtime。
- 保留历史记录不表示旧动作仍可执行；授权撤销和安全策略始终优先。
- Partner 详细文档只在 `docs/partner/**` 维护。
- Space README/PRD/HLD 只保留 Partner 定位和共享契约；接受融合后才更新相关句子与链接。
- Space `FEATURE_LIST.md` 保留 F146 的总体状态和 Partner PF 链接，不复制 P1–P9 细节。

2026-09-07 增量：PF005 腾讯文档与个人邮箱首批能力已完成本地开发验收，状态 `Completed / Local`；新增三家真实账号均未验收。详见 [PF005 验收记录](features/PF005-tencent-mail-validation.md)，未发布或合并 Space。

2026-09-07 增量：PF006 Slack、Zoom 与 GitHub 首版读取能力完成本地开发验收，`Completed / Local`；全量 4,011 PASS / 4 平台跳过，独立加载时序复测 10/10，macOS arm64 隔离打包窗口验证通过。与 PF004/PF005 共享资源和右栏接缝；真实账号未验收，未发布或合入 Space。见 [PF006 验收记录](features/PF006-slack-zoom-github-validation.md)。

2026-09-07 增量：PF007 专家组合能力与共享连接器引导完成本地验收，`Completed / Local`。岗位/任务共用机制，飞书平台预设退役兼容历史会话；产品管理与深度研究具备独立方法 Skill 及交付标准。全量 4,022 PASS / 4 跳过，实际 macOS arm64 隔离应用验证通过，双轴评审无未处理发现。未发布或合入 Space，Space F-ID 待集成时确认。见 [PF007 验收记录](features/PF007-expert-workflows-validation.md)。

2026-09-07 增量：PF008 会话专家持续绑定完成本地验收，`Completed / Local`。专家复用同一 Partner Agent、上下文、每轮方法加载和连接器权限；输入框与详情明确持续使用及不可用状态。两个实际样板的多轮、Host/SDK 恢复、切换/移除和会话隔离通过；全量 4,027 PASS / 4 跳过，评审修复后 22 项 UI 回归及 macOS arm64 隔离桌面通过。未发布或合入 Space。见 [PF008 验收记录](features/PF008-persistent-expert-validation.md)。
