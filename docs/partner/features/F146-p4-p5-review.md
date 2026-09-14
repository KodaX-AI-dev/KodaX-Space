# F146 P4/P5 评审记录

固定点：`c452994`，评审该提交之后的工作区修改与新增文件。排除原有用户修改的 ChipBar、shellChromeProjection 及其测试、resources/icon.png；不重评已交付 P1–P3。来源：[飞书切片契约](f146-p4-p5-feishu.md)和[插件库计划](v0.1.61-partner-plugin-library.md)。本轮按 code-review 双轴分别复核；以下是各自结论，不合并排序。

## Standards

独立规范轴发现两项 P2，均已修复复核：

1. `electron/ipc/admin.ts`：仅在策略写入前变更 epoch，可能在缓存还是旧允许值时接纳新的写入。现在整个策略持久化均处于连接器停用门内，前后双失效，阻止新授权并等已发出的写入结算。真实延迟 AdminPolicyAuditStore 测试通过。
2. `electron/ipc/partner-connectors.ts`：首个历史记录请求可能先于会话恢复，导致重启后空卡片且不自动重试。现在先复用宿主 single-flight tryResume，再检查 Partner / 项目归属；真实磁盘历史、错误项目、Coder、缺失会话测试通过。

主代理另独立检查 CLI、运行时会话接入及前端：补上 Windows 官方 CLI 定位用户目录所需的 USERPROFILE 环境；缺失 / 空白姓名回退为 profile 而非私有 openId。两项先失败后通过。保留白名单环境、无 shell、固定参数和 stdin 正文，未引入全局 SDK 工具或共享 Skill 变更。React 状态 / 异步 / 上下文隔离检查覆盖本轮 TSX 变更。

当前开放项：0。类型检查、lint 和相关回归通过；跨平台真实 CLI 未据此宣称验证完成。

## Spec

独立需求轴发现五项并修复复核：

1. 提交落盘 await 之后发生撤权仍可派发：在同事务检查账号版本，增加紧贴 subprocess 的同步 live guard；区分已领取提交与真正派发。移除 scope / plan / 账号 / 策略变化均重新约束。
2. 较早的慢账号验证覆盖较新的断开：连接开始捕获撤销 epoch / 账号 revision，保存时 CAS，旧请求不能复活账号。
3. 读取存储 await 后交付已撤权正文：返回 / 发布前再次同步验证，失败丢弃本次新快照；提案同样不交付已撤权结果。
4. 多个失效连接不能逐个移除：纯删减保留剩余完全不变快照，不重新认证；新增、身份 / 版本 / 范围变化仍强制验证。
5. 背景刷新覆盖未保存范围：表单按账号 / 上下文 / 已存范围内容识别更新，不因状态对象刷新丢掉 URL、追加权限和文件夹输入。

复核覆盖独立扩展包、受限 frame 消息、账号与会话范围分离、持久化 / fork、Partner-only run-scoped 工具、资料 / 提案 / 成果专用远端类型、完整正文 + exact-hash 审批，以及 unknown / partial 不重试。独立组合 44 项和真实 headless 组件检查通过；后续小修已由各作者及主代理定向验证。

当前开放项：0。CLI 作者不自评其 CLI 实现；其正式规范检查由主代理完成。

汇总：Standards 2 项 P2 已关闭（另主代理修复 CLI 2 项），Spec 5 项已关闭，当前两轴均 0 开放项。此报告不代替真实飞书账号授权或远端读写验收，F146 整体仍 InProgress，P6 待真实服务验证。
