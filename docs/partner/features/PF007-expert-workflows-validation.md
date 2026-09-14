# PF007 — 专家组合能力与共享连接器引导验收

日期：2026-09-07。范围与设计见 [PF007](v0.1.0.md#feature-pf007)。本轮基于 `241a6de` 加已有工作区改动，审计基线保留此前 91 个改动文件；未提交、推送、发布或合入 Space。

## 实现结果

- 专家目录保留岗位、任务两个入口，共用定义和执行链路。内置 4 个岗位、5 个任务专家可发现；旧飞书平台专家保留原定义并退役，不再提供新选择。历史会话快照、方法开关和用户副本继续可用。
- 产品管理、深度研究升级到 revision 3，各有专业提示词、资料要求、交付物、检查标准和可选连接器需求。它们分别使用 `partner-product-management`、`partner-deep-research` 方法 Skill。其他专家仍保留原有内容，本轮没有将其全部升级为完整方法样板。
- 工作标准进入实际模型上下文和现有 verification 契约。专家详情与用户副本编辑器可查看、修改和清空这些字段；旧编辑器省略 workflow 时保留原值。
- 共享服务操作引导按当前会话连接器和已实现操作生成，在输入框上方及连接器详情提供。可用连接器即使没有选专家也可使用；点击仅插入可编辑草稿。读取资料、提案、原生成果及网页沿用同一个右栏。
- 新包显式要求 `partnerExpertWorkflowsV1`，沿用 host API v4；旧宿主拒绝不认识的能力。没有新安装器、专家执行器或额外权限通道。
- [专家开发方法](EXPERT_BUILDER.md) 保存定义、代码接缝、方法打包、兼容和验证流程；Codex 的 `space-expert-builder` Skill 引用该文档，后续开发可直接复用。

## 自动化与评审证据

审计目录：`/Users/samharadelijiang/Documents/kodax Space/audits/expert-workflows-20260907/`。

- `baseline.json`、`baseline/`、`current.patch` 和 `current-changes.json` 区分本轮增量与先前工作，不用整个 dirty diff 代替本次评审。
- 先写失败用例，再接入 schema、目录、共享引导和实际 profile。原始失败及通过记录保留在 `t1-*.log`、`t2-*.log`、`t3-*.log`；新增工作标准不能接受任意命令、未知操作或账号凭据。
- 目录测试覆盖退役升级、已有绑定、用户副本、旧编辑器保留、显式修改/清空、版本不匹配；能力握手测试拒绝未声明新能力和旧 host API 的包。
- `t4-sdk.log`：5 个 SDK 测试通过。其中两个内置方法 × 飞书/腾讯文档共 4 组运行，经过实际 `RealKodaXSession` 与 SDK 调度，模型收到方法及检查标准，先读资料再创建文档，回执包含对应平台 URL。模型和远端 service 是受控替身；这证明接线和交付路径，不代表真实模型专业质量或真实账号连通性。
- `full-tests.log`：全量 **4,022 PASS / 4 平台跳过 / 0 FAIL**（release 66、desktop 3,595、schema 361）。评审后的操作标签改动通过 `review-fixes-green.log` 中 10 项定向回归；覆盖两种专家详情、当前服务草稿、跨会话重置和历史自定义入口。
- `coverage.log`：5 个本轮核心文件综合行覆盖 **98.22%**、分支 **96.89%**、函数 **95.45%**。此报告测量 schema、catalog、profile 和操作投影，不将其当成整个 UI 的覆盖率。
- `typecheck-final.log`、`typecheck-renderer-final.log`、`lint-final.log`、`build.log`、`build-renderer-final.log`、`plugin-build.log`：最终类型、lint、主应用与插件构建。初次类型错误来自新增测试缺少 starterTasks，修正后通过。
- `skill-validation.log`：两个运行方法和 Codex 开发 Skill 均通过 skill-creator 校验。`skills:check` 验证快照与锁定文件一致，既有三份内置 Skill 未被更换。

## Standards

独立审查全部本次代码，原始报告 `standards-review.md`。发现 2 项：详情缺少连接器操作名称（P2）、PF007 索引脱离表格（P3）。已复用共享操作标签、增加渲染断言并修正表格，未修改连接器权限机制。

## Spec

独立对照已批准设计，原始报告 `spec-review.md`。发现 1 项 P2，与 Standards 的操作名称问题相同，已修复。其余分类调整、历史兼容、方法选择、共享右栏和开发方法符合范围。最终未处理发现：Standards 0、Spec 0。

## 桌面与本地产物

`electron-smoke.mts` / `electron-smoke.log` 已在新打包的 macOS arm64 应用、隔离 profile 与真实 IPC 上通过。实际确认：4 个岗位和 5 个任务预设；旧飞书预设拒绝新选择；两个方法可从打包资源发现且开关可保存；用户副本保留 Skill 并修改交付物，保存不会自动改变当前会话专家；飞书、腾讯文档已保存资料均从同一右栏打开网页。已查看原始桌面截图，字段和详情无重叠。

首次 harness 对异步受控 checkbox 使用同步 uncheck 断言；第二次未排除右栏保留的隐藏 tab，均是验收定位问题。改成点击后等待真实 IPC 状态、只定位可见详情后完整通过，未为测试改动产品状态逻辑。失败证据分别保存在 `first-native-toggle-timing/` 与 `second-native-visible-tab/`。全程未提交真实凭据、未发送会话任务、未调用连接器远端服务；网页 DNS 被隔离阻断，仅验证导航。

- macOS arm64 桌面：`out/expert-workflows-20260907/mac-arm64/KodaX Space.app`。
- 插件：`out/extensions/kodax.partner-library-0.1.0.space-extension`。
- 首次隔离打包遗漏目标平台环境变量，`pack-initial.log` 保留失败；按现有 Feishu 构建计划设置 darwin 并校验组件后重新打包成功。没有修改发布配置或替换用户正在使用的应用。生成阶段造成的旧 Skill 文件权限和图标差异已恢复，记录在 `pack-side-effects-restored.json`。Node SQLite ABI 已恢复，测试 profile 已清理，原运行应用未关闭。

- 截图：`electron-role-experts.png`、`electron-task-experts.png`、`electron-product-management.png`、`electron-deep-research.png`、`electron-expert-editor.png` 与两个服务的 `electron-*-source.png` / `electron-*-web-sidebar.png`。
- 目录型 `.app` 由实际启动验收，不把要求 DMG/ZIP 安装器的 `smoke-pack` 脚本当成此次检查；其初次输出保留在 `packaged-dependency-smoke.log`，未记为通过。

## 后续真实使用验收

1. 在本地新构建中安装或更新 Partner Library。打开专家目录，应有岗位和任务两类，飞书平台预设不再出现；已有飞书专家会话及用户副本仍可打开。
2. 选择产品管理，给出一个真实问题和资料，检查输出是否形成“证据 → 问题 → 需求 → 验收”，是否清楚标注假设与待决事项；关闭默认 Skill 后确认开关保留。
3. 选择深度研究，提供问题、范围和资料，核对关键事实的来源、日期、相反证据、事实/推断区分及局限。不要只检查是否生成了长报告。
4. 在已获授权的飞书或腾讯文档会话中选择真实资源和交付目标，验证读取、原生文档回执及右栏页面；无法读取或缺少目标能力时，应解释缺口并保留用户指定目的地。
5. 清除专家选择后，已有连接器仍应提供对应操作草稿；只读服务不显示写入操作，邮件提供搜索/读取。切换会话后检查服务和账号随之变化，原有草稿可编辑且不会自动发送。
6. 修改样板副本的资料要求、交付物、检查标准及必需/可选操作，保存后重新选择；旧会话保持原快照。

本轮没有新增真实账号操作或真实模型质量评测。此前用户确认实际使用过飞书，不能据此把本轮四组受控测试写成飞书/腾讯文档全部实测。`Completed / Local` 只表示约定范围的代码与本地验收完成。
