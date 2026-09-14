# Partner Feature List

## Authority

本文件是 Partner 产品线内部 Feature、开发状态和 Space 集成状态的权威来源。

- Space 正式 Feature、目标版本和发布状态以 [`docs/FEATURE_LIST.md`](../FEATURE_LIST.md) 为准。
- Partner 的 `Completed` 只表示本地产品线实现与验收完成，不等于已经进入 Space。
- 只有目标提交已进入 Space 主线并具有可核验证据时，才能标记 `Integrated`。
- Partner Feature 使用 `PF###`；Space Feature 使用 `F###`。新 Space ID 只能由全局 Feature 流程分配。

## Version Info

- Current Partner Release: `0.1.0` (Pre-release)
- Planned Partner Version: `v0.1.0`
- Partner Library Target: `0.1.0`
- Space Baseline: KodaX Space `v0.1.46-alpha.5` / KodaX `0.7.96-beta.1`（来源：`package-lock.json`）
- Active Branch: `integration/partner-upstream-20260904-v0.1.0`
- Current Git Snapshot: `241a6de` + 本地未提交改动（2026-09-07）
- Last Updated: 2026-09-08

## Feature Index

| ID    | Title                                                | Category    | Priority | Partner Target | Dev Status | Integration | Space Feature | Design                                           |
| ----- | ---------------------------------------------------- | ----------- | -------- | -------------- | ---------- | ----------- | ------------- | ------------------------------------------------ |
| PF001 | Partner Extension & Expert Library                   | New         | High     | `v0.1.0`       | InProgress | Local       | F146          | [PF001 design](features/v0.1.0.md#feature-pf001) |
| PF002 | Governed Connector Previews & Feishu Platform Expert | New         | High     | `v0.1.0`       | InProgress | Local       | F146          | [PF002 design](features/v0.1.0.md#feature-pf002) |
| PF003 | Receipt-First Delivery & Unified Workspace           | Enhancement | High     | `v0.1.0`       | InProgress | Local       | F146          | [PF003 design](features/v0.1.0.md#feature-pf003) |
| PF004 | Shared Connector Capabilities & Builder Methodology  | Enhancement | High     | `v0.1.0`       | Completed  | Local       | —             | [PF004 design](features/v0.1.0.md#feature-pf004) |
| PF005 | Tencent Docs & Personal Mail Connectors              | New         | High     | `v0.1.0`       | Completed  | Local       | —             | [PF005 design](features/v0.1.0.md#feature-pf005) |
| PF006 | Slack, Zoom & GitHub Read Connectors                 | New         | High     | `v0.1.0`       | Completed  | Local       | —             | [PF006 design](features/v0.1.0.md#feature-pf006) |
| PF007 | Composable Experts & Shared Connector Guidance       | Enhancement | High     | `v0.1.0`       | Completed  | Local       | —             | [PF007 design](features/v0.1.0.md#feature-pf007) |
| PF008 | Persistent Expert Conversations                      | Enhancement | High     | `v0.1.0`       | Completed  | Local       | —             | [PF008 design](features/v0.1.0.md#feature-pf008) |
| PF009 | Reusable Expert Catalog Expansion | Enhancement | High | `v0.1.0` | Completed | Local | — | [PF009 design](features/v0.1.0.md#feature-pf009) |

| PF010 | Office Expert Research & Reuse | Enhancement | High | `v0.1.0` | Completed | Local | — | [PF010 design](features/v0.1.0.md#feature-pf010) |

| PF011 | Expert Portraits & Browsable Profiles | Enhancement | High | `v0.1.0` | Completed | Local | — | [PF011 design](features/v0.1.0.md#feature-pf011) |

| PF012 | Partner Cold-start Home | Enhancement | Medium | `v0.1.0` | Completed | Local | — | [PF012 design](features/v0.1.0.md#feature-pf012) |

| PF013 | Sales, Hiring, Onboarding & Presentations | Enhancement | Medium | `v0.1.0` | Completed | Local | — | [PF013 design](features/v0.1.0.md#feature-pf013) |

## Feature Details

<a id="pf001--partner-plugin-library-extension"></a>

### PF001 — Partner Extension & Expert Library

- Description: 交付可独立安装和停用的 Partner Extension，以及预置与用户专家、可选 Skill、会话绑定和不可变专家快照；对应既有 P1–P3。
- Category: New
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: InProgress
- Integration Status: Local
- Space Feature: F146
- Design: [PF001 version design](features/v0.1.0.md#feature-pf001)
- Created: 2026-08-31
- Updated: 2026-09-04
- Evidence: [P1–P3 实施记录](features/v0.1.61-partner-plugin-library.md)、[P1–P3 评审](features/F146-plugin-library-review.md)、[人工测试指南 TC-001–TC-009](test-guides/FEATURE_146_v0.1.61_TEST_GUIDE.md)

### PF002 — Governed Connector Previews & Feishu Platform Expert

- Description: 交付受可信宿主管理的连接器预览、账号与会话范围、读取和受审写入，并以飞书办公套件专家及受控 Base 创建形成首个平台切片；对应既有 P4–P7。
- Category: New
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: InProgress
- Integration Status: Local
- Space Feature: F146
- Design: [PF002 version design](features/v0.1.0.md#feature-pf002)
- Created: 2026-09-04
- Updated: 2026-09-04
- Evidence: [P4–P7 实施记录](features/v0.1.61-partner-plugin-library.md)、[飞书契约](features/f146-p4-p5-feishu.md)、[P4/P5 评审](features/F146-p4-p5-review.md)、[首次连接记录](features/f146-feishu-onboarding.md)、[多连接器设计](features/f146-multi-connectors.md)、[多连接器评审](features/F146-multi-connectors-review.md)、[人工测试指南 TC-010–TC-038](test-guides/FEATURE_146_v0.1.61_TEST_GUIDE.md)

### PF003 — Receipt-First Delivery & Unified Workspace

- Description: 以可信创建回执优先交付平台原生资源，把资源创建状态与内容校验状态分开，并将网页、文件、Artifact、Skill 和专家汇入统一详情工作区；对应既有 P8–P9。
- Category: Enhancement
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: InProgress
- Integration Status: Local
- Space Feature: F146
- Design: [PF003 version design](features/v0.1.0.md#feature-pf003)
- Created: 2026-09-04
- Updated: 2026-09-04
- Evidence: [P8–P9 实施与自动验证记录](features/v0.1.61-partner-plugin-library.md)、[P8 人工测试素材 TC-039–TC-045](test-guides/FEATURE_146_v0.1.61_TEST_GUIDE.md)

### PF004 — Shared Connector Capabilities & Builder Methodology

- Description: 将连接器的资源身份、已实现操作和右侧资料/网页打开机制收敛到共享宿主契约；更新 Codex 连接器开发 Skill，供后续服务复用账号、会话、审核与成果链路。
- Category: Enhancement
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: Completed
- Integration Status: Local
- Space Feature: —（共享连接器与工作区接缝，进入 Space 前确定映射）
- Design: [PF004 version design](features/v0.1.0.md#feature-pf004)
- Created: 2026-09-07
- Updated: 2026-09-07
- Evidence: [PF004 验收记录](features/PF004-shared-connector-validation.md)：完整基线 3,918 PASS / 4 跳过，最终定向 54 PASS，类型/lint/构建、独立 Skill 试用和隔离 macOS Electron 验证通过。其他 provider 的 fixture 不代表真实账号验收。

### PF005 — Tencent Docs & Personal Mail Connectors

- Description: 新增腾讯文档、网易 163 和 QQ 个人邮箱；共享可信输入、会话范围、搜索与资料详情、平台文档回执，邮件回复沿用本地 Artifact。
- Category: New
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: Completed
- Integration Status: Local
- Space Feature: —（集成时确定映射）
- Design: [PF005 version design](features/v0.1.0.md#feature-pf005)
- Created: 2026-09-07
- Updated: 2026-09-07
- Evidence: [PF005 验收记录](features/PF005-tencent-mail-validation.md)，首批本地开发验收完成：全量回归 3,991 PASS / 4 平台跳过，最终域名修正定向 UI 40/40、归档 3/3 和打包 Electron 复验通过；真实账号未验收。

`F146 <- PF001, PF002, PF003`。三个 PF 分别维护 Partner 内部验收边界，但共同承接一个 Space 可交付 Feature；F096、F122–F124、F130 等仍是 Space 既有基线或依赖，不在 Partner 台账重复登记。

### PF006 — Slack, Zoom & GitHub Read Connectors

- Description: 替换 Slack、Zoom 占位，并新增 GitHub。自有应用凭据经可信宿主验证，按选定资源读取并进入共享资料与网页右栏。
- Category: New
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: Completed
- Integration Status: Local
- Space Feature: —（集成时确定映射）
- Design: [PF006 version design](features/v0.1.0.md#feature-pf006)
- Created: 2026-09-07
- Updated: 2026-09-07
- Evidence: [PF006 验收记录](features/PF006-slack-zoom-github-validation.md)：全量 4,011 PASS / 4 平台跳过，类型/lint/构建及隔离 macOS Electron 通过，独立复测 10/10；三家真实账号未验证。

### PF007 — Composable Experts & Shared Connector Guidance

- Description: 取消平台专家分类，将操作引导迁入共享连接器入口；完善专家方法与交付标准，建设产品管理和深度研究样板，并沉淀专家开发规范。
- Category: Enhancement
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: Completed
- Integration Status: Local
- Space Feature: —（集成时确定映射）
- Design: [PF007 version design](features/v0.1.0.md#feature-pf007)
- Created: 2026-09-07
- Updated: 2026-09-07
- Evidence: [PF007 验收记录](features/PF007-expert-workflows-validation.md)：4,022 PASS / 4 跳过，核心行覆盖 98.22%，类型/lint/构建与隔离 Electron 通过；双轴评审无未处理发现。真实模型质量和新增账号操作未验收。

### PF008 — Persistent Expert Conversations

- Description: 落实专家持续绑定当前会话的语义；完善持续生效提示与模型约束，验证两个样板的连续任务、恢复、切换/移除及 Skill 选择。
- Category: Enhancement
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: Completed
- Integration Status: Local
- Space Feature: —（集成时确定映射）
- Design: [PF008 version design](features/v0.1.0.md#feature-pf008)
- Created: 2026-09-07
- Updated: 2026-09-07
- Evidence: [PF008 验收记录](features/PF008-persistent-expert-validation.md)；全量 4,027 PASS / 4 平台跳过，修复后 22 项 UI 回归通过；双轴评审无未处理发现，macOS arm64 隔离桌面通过，未发布。

### PF009 — Reusable Expert Catalog Expansion

- Description: 调研并建设更多可用专家，优先复用 WorkBuddy、豆包工作及其开放来源的方法 Skill，补齐输入、交付标准与 Space 适配。
- Category: Enhancement
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: Completed
- Integration Status: Local
- Space Feature: —
- Design: [PF009 version design](features/v0.1.0.md#feature-pf009)
- Created: 2026-09-07
- Updated: 2026-09-07

- Evidence: [PF009 验收记录](features/PF009-expert-expansion-validation.md)：61 项独立定向/打包测试通过，最后复用方法另复验 2 项；8 专家真实桌面通过。真实模型基本样板完成，复杂排期与非推理模式存在已记录限制。

### PF010 — Office Expert Research & Reuse

- Description: 梳理 WorkBuddy 与豆包工作的办公专家，优先寻找原始提示词和 Skill，建设适合 Space 的专家。
- Category: Enhancement
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: Completed
- Integration Status: Local
- Space Feature: —
- Design: [PF010 design](features/v0.1.0.md#feature-pf010)
- Created: 2026-09-08
- Updated: 2026-09-08
- Evidence: [PF010 调研与复用](features/PF010-office-expert-research.md)、[PF010 验收](features/PF010-office-expert-validation.md)：65项独立定向测试、最终修正复测、四个真实模型样板及12专家隔离Electron流程完成；已安装新插件，用户桌面启动被系统锁屏阻止。

### PF011 — Expert Portraits & Browsable Profiles

- Description: 参考连接器与用户提供的 WorkBuddy 截图，简化专家卡片，设计16枚头像并完善专家详情说明。
- Category: Enhancement
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: Completed
- Integration Status: Local
- Space Feature: —
- Design: [PF011 design](features/v0.1.0.md#feature-pf011)
- Created: 2026-09-08
- Updated: 2026-09-08
- Evidence: [PF011 验收与素材](features/PF011-expert-presentation-validation.md)：16原创头像，22项定向测试与12专家隔离Electron流程通过；本机插件已更新。

### PF012 — Partner Cold-start Home

- Description: 参考 WorkBuddy 设计默认冷启动首页，以任务输入、办公示例、专家和资料入口帮助用户开始。
- Category: Enhancement
- Priority: Medium
- Partner Target: `v0.1.0`
- Dev Status: Completed
- Integration Status: Local
- Space Feature: —
- Design: [PF012 design](features/v0.1.0.md#feature-pf012)
- Created: 2026-09-08
- Updated: 2026-09-08
- Evidence: [PF012 设计与验收](features/PF012-home-validation.md)：六示例、草稿保留、专家头像、首发会话和窄窗口在隔离Electron通过；类型/lint通过；既有SSR失败另列。

### PF013 — Sales, Hiring, Onboarding & Presentations

- Description: 扩充办公专家，新增销售拜访、招聘面试、入职和HTML演示，复用成熟方法与现有头像。
- Category: Enhancement
- Priority: Medium
- Partner Target: `v0.1.0`
- Dev Status: Completed
- Integration Status: Local
- Space Feature: —
- Design: [PF013 design](features/v0.1.0.md#feature-pf013)
- Created: 2026-09-08
- Updated: 2026-09-08
- Evidence: [PF013验收与样板](features/PF013-expert-expansion-validation.md)。

## Summary

- Total: 13
- Planned: 0
- InProgress: 3
- Completed: 10
- Local: 13
- Ready: 0
- Proposed: 0
- Integrated: 0
- Next PF ID: PF014
