# 产品说明一致性审查（2026-10-22）

## 需求与边界

用户要求：“整体检查一下，设置页面、帮助和其他面板里还有没有类似没及时更新的信息，保证这些说明跟当前实际功能一致。完成后提交并推送。”

检查当前设置六类、帮助/命令提示、环境菜单、Memory/Learned Skills、工作流、MCP/扩展、Partner 面板及应用内 space_manual、当前用户手册。以实际代码、公开 IPC 和已安装 SDK 为依据；历史发布记录及继承的 SDK 手册保留。当前 Space/SDK 版本从应用 manifest 读取，不用旧版本号充当功能说明。不删除功能，不改变权限、执行、记忆、Token 计算或发布状态。

## 已确认的差异

| 区域             | 差异                                                                                          | 当前事实来源                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Runtime / Memory | 0.7.78、0.7.62 和 F138 规划编号混入日常提示                                                   | SettingsModal、memory-service、sandbox IPC                           |
| Runtime 切换     | 只提示 Space 任务限制，漏掉共享客户端安全门                                                   | coder-runtime-mode-switch、对应测试                                  |
| 帮助 / Slash     | `/fork` 提示会话右键菜单，fork/rewind 参数写 entry-id/label；cost 承诺估价                    | BottomBar、slash/builtin、HelpOverlay                                |
| 环境 / 会话菜单  | 禁用操作仍挂 v0.1.x 或“即将支持”                                                              | EnvironmentHub、SessionMenu、ChipBar                                 |
| 产品自说明       | overview 仍把旧 runtimeExitSettlement 当现行流程；设置被列为浮层；队列说明依赖旧 journal 事件 | Product lifecycle、Product view、Settings 工作面                     |
| 学习 / Partner   | 手册把已提供的 Learned Skills 管理和授权连接组件写成未交付                                    | LearningSafetySection、learning IPC/policy、ConnectorComponentsPanel |
| 诊断 / 更新      | 用户手册把诊断导出和所有更新渠道写成计划中                                                    | diagnostics IPC、updater IPC、pack 配置                              |

## 验证方案

使用既有公开手册查询 seam 验证当前说明及 SDK 原文继承；使用 Electron E2E 检查中英文设置、帮助和相关面板，并保存截图审查。运行适用的类型、lint、单元和打包 smoke。仅提交本轮拥有的文件，保留工作区已有未提交改动，普通推送 main。

## 核对范围与保留项

- 静态字符串 AST 扫描覆盖 renderer 和 Main slash 目录，另核对六类设置、命令帮助及两份产品手册。会话分组与外部应用入口仍禁用，提示明确当前限制；分支占位不再伪称当前分支为 main。Preview/Diff/Terminal 的快捷键由 CommandToolbar 处理，说明补充工作面可交互和非编辑焦点的条件，同时保留菜单入口；新增模型选择器 Ctrl+I 的说明。
- Plan、Tasks、Diff、Preview、Terminal、Agents、MCP、Workflow、权限/Auto 诊断、Partner Sources/Outputs/连接组件以现有控制和公开 IPC 核对。未发现需要更改其执行行为的证据。手动 Memory curate/pack 仍受 Host 能力限制，Learned Skills 按记录及策略提供动作。
- Memory policy `f275-v0.7.77.1`、sandboxRuntime v11、wire 10/setup 11 是实际策略/协议版本，不能替换成 SDK 包版本。AMAW 退役提示与旧 verifier 历史标签有明确历史语义，保留。Issue 133 的跨平台验收缺口仍在已知问题中，未擅自宣称已解决。
- 旧发布说明移到明确标记的历史区；继承的 SDK 原文、用户自定义名称/描述及已有日志不重写。诊断导出、自动更新的现有功能与平台限制分别说明，不将本地候选写成已发布版本。

## Standards

首轮发现 1 项 P3：新增 E2E 回调过长。已按 Runtime 文案、设置遍历、帮助检查拆为短函数。v4 独立复核新增 0 项、残留 0 项；无待处理严重项。

## Spec

首轮 0 项发现。Memory、Product lifecycle、Learned Skills、Partner 授权连接及更新平台边界与实际契约一致。v2 复核指出面板快捷键误判 1 项 P2，已按 CommandToolbar 恢复真实快捷键并补充生效条件，随后通过实际按键验证。v4 独立复核新增 0 项、残留 0 项；无待处理严重项。

## 验证结果

- `npm run typecheck`、`npm run lint`、`npm run build:smoke` 通过；最终帮助换行补丁另通过 lint、格式检查和 renderer 构建。
- `npm test`：4434 项，4414 通过、20 项既有跳过、0 失败。公开手册与 Slash 定向 63 项通过，最终手册 11 项另行通过；SDK 原文继承保持不变。
- 从原 `out/win-unpacked/KodaX Space.exe` 运行设置、语言和诊断回归共 15 项通过；最终新增可读性断言后，中英文设置六类、帮助、三个面板快捷键复验 2 项通过。检查了深浅主题截图、说明换行和底部命令滚动。截图时等待语言通知消失及扩展组件加载完成。
- 实际截图发现帮助长标签省略；可读性断言在修复前失败，移除 `truncate`、保留 `min-w-0` 后通过。未新增动画、依赖或轮询。
- `node scripts/pack.mjs --win --dir` 最终通过：包内容 smoke、启动 smoke、6 项真实 SDK/Host 实包契约用例通过。主程序、renderer JS/CSS 共 3 个包内文件与最新构建字节一致。
- 证据保存在本地 `artifacts/content-audit-2026-10-22/`：unit/typecheck/lint/build/pack 日志、红绿 E2E 日志、`ui-final/` 截图及 `packaged-bytes.json`。v4 评审补丁 SHA-256：`8130f1bb7909756c5db29b275753da15fe876cf6fe27c54c097b282894934d4d`。
- 本轮实际页面/实包验收平台为 Windows；未声称完成新的 macOS/Linux 进程级验收。原有未提交文件按基线哈希保留，未纳入提交。
