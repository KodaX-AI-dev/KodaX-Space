# PF008 — 会话专家持续绑定验收

日期：2026-09-07。设计见 [PF008](v0.1.0.md#feature-pf008)。本轮以 `241a6de` 加已有工作区为基线，保留先前 116 项改动；审查仅覆盖本轮增量。

## 实现

- 专家作为同一 Partner Agent 的会话配置。岗位、任务共用持续绑定规则，任务结束不会自动移除专家；沿用已有每轮捕获、Skill 加载、会话持久化和排队执行。
- 宿主 profile 明确沿用本会话事实与决策，按当前问题裁剪方法和交付检查，简短追问不强制重新走完整报告流程。规则集中维护，所有专家复用。
- 输入框显示“本会话持续使用”；恢复配置时显示加载状态，不可用时保留身份和错误提示。详情说明后续持续使用、恢复配置及显式 Skill 的单轮替换。旧详情使用“选择后”说明，避免冒充当前绑定。
- [专家开发方法](EXPERT_BUILDER.md) 记录上述约定与实际验证接缝，`space-expert-builder` 继续引用此文档。

## 自动验证

证据目录：`/Users/samharadelijiang/Documents/kodax Space/audits/expert-session-binding-20260907`。

- `red-contract.log`、`red-chip.log`：先确认持续会话规则、详情说明和恢复加载提示的缺口；对应 green 日志通过。
- `runtime-lifecycle.log`：18 项通过。实际安装专家库、注册随包方法，经真实 IPC handler、Host 存盘/恢复和 `RealKodaXSession.send` 进入 SDK；模型提供方使用受控记录器。
- 两个实际样板（产品管理、深度研究）各自连续任务、关闭默认方法后恢复、重新启用、显式 Skill 单轮替换、下一轮恢复默认方法、再次 Host 恢复均通过；记录器收到正确角色、方法与原对话上下文。
- 切换专家、移除后恢复、第二会话隔离均通过。原始对话在实际 SDK history 中保留；既有运行中/排队与写入提交边界回归继续通过。
- `green-chip.log`：真实 React Provider/Chip 浏览器交互验证两个实际定义的加载、选择、切换会话、不可用、移除和运行提示；草稿保留，没有调用发送或新建会话。
- `core-coverage.log`：18 项通过，profile 与 binding 总行覆盖率 96.62%，分支 82.02%。类型、lint、应用及插件构建通过。
- `full-tests.log`：4,027 PASS / 4 既有平台跳过；无失败。详情不可用文案修复后，另执行 `final-ui-regression.log` 的 22 项回归及最终 typecheck、lint、renderer 构建，全部通过。

## Standards

独立规范评审发现 1 项 P2：当前绑定不可用时，详情仍承诺持续使用。已独立传递可用状态、增加中英文暂不可用说明及渲染断言；`red-unavailable-details.log` 保留失败复现，22 项相关回归通过。评审者复核通过，未处理发现 0。见审计目录 `standards-review.md`。

## Spec

独立需求评审逐文件对照 PF008，发现 0；没有新增独立 Agent 引擎或扩大连接器权限。补查修复和本验收记录后仍为 0。见审计目录 `spec-review.md`。

## 桌面与产物

`electron-smoke.mts` / `electron-smoke.log` 在新打包的 macOS arm64 应用、隔离 profile 与真实 IPC 上通过：两个样板的持续标签和详情、默认 Skill 开关、Renderer 重新加载后恢复专家和关闭状态、第二会话独立、移除后重新加载不再挂载。已查看原始桌面截图，新增文案和输入框无重叠。桌面采用 Mock 模型；进程内 Host 卸载/恢复后的真实 SDK 行为由上面的 runtime 用例验证，不将 Renderer 重载冒充完整应用重启。

初次桌面脚本在宿主已经保存、React 尚未完成渲染时立即断言 checkbox，产生时序失败；截图已显示随后正确的关闭状态。脚本增加对可见 checkbox 状态的等待，复跑通过，保留 `electron-initial.log`。没有为此改产品逻辑。

- 应用：`out/expert-session-binding-20260907/mac-arm64/KodaX Space.app`。
- 插件：`out/extensions/kodax.partner-library-0.1.0.space-extension`；插件定义和专家 revision 未改，持续会话规则统一由兼容宿主提供。
- 本地状态 `Completed / Local`；未提交、推送、发布或合入 Space。临时测试 profile 已清理，原用户应用未替换；构建生成的图标差异已恢复，Node SQLite 原生模块恢复记录见 `node-native-restore.log`。

## 证据边界

SDK 测试的模型是受控记录器，用于验证收到的角色、方法、历史上下文与执行边界。它不证明真实模型会在每次回答中正确遵循方法，也不等于专家专业产出质量已完成真人验收。连接器复用原有授权和交付路径，本轮没有新增真实第三方账号验收。

## 人工复核

1. 在 Partner 会话选择产品管理，确认输入框提示持续使用；给出资料与需求，再连续追问取舍、修改验收，检查回答承接前文且不会每次重新要求全部背景。
2. 在详情关闭默认 Skill，离开并重新打开会话，确认专家和开关保留；重新启用，再显式选择另一 Skill 执行一轮，确认下一轮使用默认方法且角色持续。
3. 切换深度研究，连续完成两个研究任务，检查不会自动退出；另一会话应保持自己的配置。
4. 在运行中切换或移除专家，当前运行保留已捕获配置，后续运行使用新配置；移除后重新打开会话，历史消息和资料仍可查看。
5. 禁用专家包，确认身份保留且状态为不可用，恢复启用或明确移除后再继续。
