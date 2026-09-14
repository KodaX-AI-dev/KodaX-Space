# F146 P4/P5：飞书文档连接器

用户于 2026-08-31 指定首个连接器使用飞书 CLI。本切片不升级 Space 0.1.45 / SDK 0.7.95，不改 Skill，也不把通用 MCP 设置变成会话授权。

## 固定契约

- 首版只支持官方 `@larksuite/cli@1.0.92`，命令 `lark-cli`。来源：[官方版本](https://github.com/larksuite/cli/releases/tag/v1.0.92)。该 CLI 不是 MCP server；宿主用受限原生适配，保留原 MCP 通道。
- 包内声明 `adapter: feishu-cli`，不能声明命令、脚本、token。库 frame 只展示目录和请求可信宿主打开配置，不获得账号凭据、任意 IPC 或审批能力。
- P4/P5 初版由用户在官方 CLI 完成安装、应用配置和登录，Space 验证已有 profile。后续用户批准的 [首次连接向导](f146-feishu-onboarding.md) 将安装确认与官方网页授权接入可信宿主；仍不复制 token、自动授权或替换现有账号。
- `auth status --json --verify` 必须验证用户而非仅机器人；业务命令固定 `--profile` 与 `--as user`。清除继承的 CLI 账号 / 配置覆写环境。每次执行前重验账号和权限；分开的 CLI 进程不是跨进程原子账号锁，不宣称该保证。
- 账号连接与会话范围分离。最多 8 个连接，每个最多 32 个明确的 `https://租户.feishu.cn/docx/ID` 文档，分别授权读取 / 追加；新建文档只允许一个明确飞书文件夹 URL。不支持任意域、Wiki URL、覆盖、删除、图片 / 附件上传。
- 运行时只向选中连接器的 Partner 会话提供 run-scoped read/propose，不注册全局 SDK 工具。每次调用重新检查包启用状态、账号版本、会话范围和既有管理员策略；标签移除可撤销本会话的后续调用。
- 读取快照保留文档身份、URL、版本、读取时间和正文 hash。远端资料、提案和成果用专用类型，不把 URL 填入本地文件路径。

## 写入状态与审批

- 模型只能生成本地提案；写入由可信宿主详情页展示完整目标和正文后，用户确认 `proposalId + expectedContentHash`。模型与插件 frame 没有 apply 权限。
- 支持新建纯文本文档和向已有文档追加纯文本。宿主将文本转义成仅 title / p / br 的 XML，正文经 stdin 传入，不执行任意 Markdown / XML 的文件上传指令。
- 复用现有管理员 `connectors.allow/deny/writesAllowed`；新安装默认开启对话内的连接器写入，已有用户显式保存的策略继续保留。计划模式不能提出或执行写入，逐提案审批仍必需；可信界面仍可修改全局写入开关。
- 提案固定账号版本、会话、包、目标、正文 hash、范围 hash；追加记录读取时的版本和正文 hash，提交前重读比较，并传入 CLI `--revision-id`。官方未承诺 CAS，首版不提供全文覆盖和原子冲突锁保证。
- 持久化 `pending → submitting → succeeded / partial / unknown / failed`；拒绝为 rejected，基础文档变化为 conflict。提交前落盘 submitting；仅完整可验证回执产生“成果”。重复 apply 不重复执行。
- 超时、进程中断、无法解析回执或部分成功均不可自动重试。重启发现已退出写入进程的 submitting 记录改为 unknown，提示用户去飞书核对。
- 断开 / 停用 / 卸载先阻止新调用并等待已开始的提交结算。已发出的远端写入不能保证撤回，不能将关闭界面声称为取消成功。

## 验证边界

自动化使用注入 CLI 适配和受控 subprocess，不登录真实账号、不创建第三方文档。需覆盖范围与会话隔离、真实 SDK run-scoped 可见性、重复 / 并发提交、撤权、冲突、部分结果、超时、重启恢复、无 CLI 状态、包启停 / 卸载，以及原专家 / Skill / Coder 回归。

真实飞书授权与端到端读写仍需用户提供已配置 profile 并明确选定测试文档；不得将 fixture 通过写成真实第三方验收通过。
