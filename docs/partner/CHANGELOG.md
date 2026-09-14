# Partner Changelog

本文件只记录 Partner 产品线的可交付变化。Space 主应用版本、共享 Runtime 和正式 Space 发布仍以根目录 [`CHANGELOG.md`](../../CHANGELOG.md) 为准。

## [Unreleased]

---

## [0.1.0] - 2026-09-08

> 当前目标：Partner 产品 `0.1.0`、Partner 插件库 `0.1.0`；兼容 Space `0.1.46-alpha.5`、KodaX `0.7.96-beta.1`、Partner Host API 4 和 `partnerNativeDocumentDeliveryV1`。
>
> 当前准备 GitHub 预发布，目标 tag 为 `partner-v0.1.0`；不使用 Space 的 `v*` 命名空间。2026-09-08 用户确认已获作者允许公开发布本修改版；该确认记录于本次开发会话。

### Added

- PF004–PF006：共享连接器能力、腾讯文档、网易邮箱、QQ邮箱、Slack、Zoom与GitHub接入；目录共13个连接器。各服务功能与真实验证程度以对应验收文档为准。
- PF007–PF010、PF013：岗位与任务专家使用真实方法Skill，持续绑定当前会话，支持开关、切换和重启恢复；目录现有16位专家（7岗位、9任务）。新增销售拜访、招聘面试、员工入职及HTML演示。
- PF011–PF012：16枚专家头像、卡片与详情、引用头像、冷启动首页，以及关联实际专家和方法的六个任务入口。

- PF001：提供可独立构建、安装、显式启用、停用和卸载的 Partner Extension，以及预置专家、用户专家、可选单个 Skill、会话绑定和不可变专家快照。
- PF002（Preview）：提供由 Electron 可信宿主管理的账号连接、会话范围、读取和受审写入边界，并提供飞书办公套件平台专家与能力引导。
- PF003：提供 receipt-first 原生资源交付，把资源创建状态与内容校验状态分开，并在 Partner 统一详情工作区汇集资料、协作、产物、专家、Skill、连接器和受控网页。
- 飞书 Preview 支持会话选定文档读取、受控新建文档与 Base，以及审核后追加既有文档；成功结果必须包含宿主验证的远端资源身份与 canonical URL。

### Changed

- 连接器操作显示在输入框上方；首页增加连接器入口；去掉交付格式下拉框，按对话中的要求决定格式。
- 任务侧栏直接展开资料、协作和产物；插件入口使用组合方块图标，与Skill拼图区分。
- Partner发行配置独立指向本仓库的更新源，保留Space宿主兼容版本。

- 将既有 Partner P1–P9 记录重整为三个可独立验收的 PF：P1–P3 对应 PF001，P4–P7 对应 PF002，P8–P9 对应 PF003；三者共同映射 Space `F146`。
- 将 Partner 产品版本与 Space 主应用版本分开管理：Partner 从 `0.1.0` 建立自己的版本线，Space 根版本继续保持 `0.1.46-alpha.5`。
- 将 Partner 插件库的首个候选版本统一为 `0.1.0`；Extension ID 保持 `kodax.partner-library`，宿主兼容性继续由 Host API 和 capability 协商决定，而不是由显示版本号决定。
- 将企业微信、钉钉、腾讯会议、Notion、Airtable 与 Atlassian 明确标为 Preview：现阶段只有适配器、fixture 或契约证据，不声明真实企业/租户端到端已通过。
- Slack和Zoom已实现凭据接入；缺少配置时保持未连接，不宣称已完成真实企业账号验证。
- 将删除、覆盖、共享权限变更、批量通知和审批决定保留在当前远程操作范围之外；修改既有资源继续走明确审核路径。

### Fixed

- 飞书文档新建拒绝能引用本地资源的 Markdown / HTML 语法；每次 CLI 调用使用独立空目录，并在进程退出后清理。
- 修复断开账号与连接验证同时结束时的等待死锁，取消后的连接不会重新提交。
- 修复 Base 创建在准备阶段中断后永久停留的问题：未提交任务恢复为失败，已提交但结果不明的任务保留为未知，不自动重试。
- 飞书账号记录达到上限时可回收同连接器已断开的本地记录；保留历史操作记录，新连接使用新 ID，不继承旧会话授权。
- 连接器范围尚未加载或加载失败时禁止保存，刷新可恢复；保存当前账号范围时保留其他账号和文件夹范围。
- 将待审核的飞书追加提案接入任务协作卡和统一详情工作区，可查看完整正文后逐项批准或拒绝。
- 稳定飞书 receipt-first 回归测试：仍要求可信创建回执在内容回读被阻塞时先返回，但不再把单个 event-loop tick 当成产品时限；测试结束前同时等待相关后台内容校验收敛，避免临时目录清理竞态。

### Documentation

- 增加 Partner `0.1.0` 发布就绪记录，固定 `partner-v0.1.0` tag 命名、Core/Preview 边界、技术与真实服务门槛、许可证门槛和回滚条件。
- 增加面向 PF001–PF003 的 `0.1.0` 人工与发布验收指南，区分自动化 fixture、真实 Electron、人类观察、真实第三方服务和打包平台证据。

### Known limitations

- 当前没有最终 Git tag、远端 CI 或 GitHub Release；本地自动化、类型检查、lint 和 smoke build 已通过，但完整人工、真实服务、标准 Node 22.23.1、远端 CI 仍待最终提交验证；作者发布许可已由用户确认。
- 必须使用提供 Partner Host API 4 与 `partnerNativeDocumentDeliveryV1` 的兼容 Space 宿主；旧宿主应拒绝启用，不能通过降级绕过。
- 真实第三方账号、企业策略、多平台、同 ID 版本替换与回滚仍需按 release-readiness 单独记录；fixture、Mock 或目录展示不能证明真实服务可用。
- Extension HTML 的 SHA-256 只提供内容完整性检查，不构成发布者身份认证。
- 对外分发受仓库 [`LICENSE`](../../LICENSE) 约束；在取得适用书面授权前，不发布公开安装包或 Partner 分发物。

Partner 功能摘要同步至集成前的 Partner HEAD `0d1667d4c4b48abb05962ceeef4e4154309d14a7`。当前集成提交只吸收 Space `0.1.46-alpha.5`，不扩张上述 Partner 功能边界。

<!-- last-sync: 0d1667d4c4b48abb05962ceeef4e4154309d14a7 -->
