# KodaX Space 详细设计

F147（2026-10-16，源码未发布）：Shell 内设置工作面复用全部六分类面板，保留面板 tab ID 与语义控制接口；后台 workspace 保持挂载并隐藏/inert，Portal 详情通过 `FloatingSurfaceHost.suspended` 暂停可见性、焦点与键盘捕获而保留子组件。外观直接共用原 appStore 主题/质量键；正文连续实色、局部 chrome 玻璃。功能映射与回归边界见 [实施清单](design/space-ui-integration.md)。

更新日期：2026-10-15。当前候选为 Space `0.1.47-alpha.2`，精确依赖发布到 npm Registry 的 KodaX `0.7.97-alpha.6`；尚未发布 Space alpha.2。

本文描述当前公共边界。高层结构见 [HLD](HLD.md)，共享输出的决策见 [ADR-010](ADR/ADR-010-sdk-product-output.md)，完整迁移清单见 [SDK 迁移](features/SDK_0.7.97_MIGRATION.md)。

## 输入与执行

Renderer 经 Zod IPC 提交用户输入。可信 Main 捕获稳定 `inputId`、Provider allowlist、凭据和 Host Tool lease、Workflow policy，再由 `RuntimeHostAdapter` 提交 SDK Product 输入。重试、排队和 steer 沿用 SDK 接受的输入身份与原授权；队列接受不虚构未来 `runId`。密钥不经过 Renderer 或普通 IPC。

SDK 决定执行、权限协商、队列交付、工具调用与 canonical 历史写入。Space 不修改 Registry 包，也不为特定模型重写内置工具 schema。alpha.6 已将 `relationship_scan.depth` 定义为整数范围 1–3，保持数字输入。

普通 Coder 创建时明确声明草稿，并要求 SDK 与 Host `sessionDrafts:1`。SDK 在首个有效输入保存时持久化会话；未发送草稿只保留在 Host 内存。Partner 与 Quick Ask 保留各自执行和临时会话边界。

## 当前输出与历史

共享 Coder 的正文入口是 SDK `sessions.observeView` 的完整有序快照。Main 将公开显示项投影为 IPC 数据，Renderer 按 opaque item ID 和 SDK 顺序显示正文、思考、工具、用户图片与 Artifact；不从普通 delta 或私有 journal 重建正文。

初始读取、实时 observer 帧及终态刷新共用有序写入队列。长正文补读校验 item 身份、revision、offset、长度与期限，过期结果不能覆盖更新快照。

历史浏览窗口使用 `readHistory`，正文与搜索使用 SDK 公共读取接口。它与当前 view 分开选择，不拼成第二份聊天。Fork/Retry/Rewind 使用 SDK 提供的 `entryId/sourceRevision` 边界；不得将显示项 ID 猜成历史 entry ID，也不得按内容去重。

## 会话列表

SDK 提供真实用户/助手消息时间 `lastMessageAt`；Main 转为 IPC 毫秒值。设置、名称、Actor 与元数据保存不能覆盖它。Fork 保留来源消息时间，Renderer 单独保留新发送输入的本地活动时间，兼容缺失该事实的旧记录。

旧的无标题、零消息记录只有在完整 SDK 历史确认没有可恢复内容后才隐藏；原文件不删除。有旧分支、通知、错误、Artifact、扩展或恢复状态的记录继续显示。过滤后再应用侧栏数量限制，空标题显示本地化名称。

## 产品手册与宿主工具

共享 Coder 通过只读 Host Tool `space_manual` 获取 Space UI、Provider、Settings、Workflow 和快捷键说明。`buildSpaceManual` 保留安装 SDK 的原始机制主题、aliases 和 sources，再合成 Space 操作说明。

SDK 内建 `kodax_manual` 保持 SDK/CLI 机制职责；共享 Host 不覆盖该工具。Partner/Embedded inline owner 可将同一组合主题注入自己的手册入口。Artifact 和其他 Host Tools 继续使用按 Run 绑定的 lease 与权限作用域。

## 失败、统计与退出

Space 保留 SDK 的结构化失败分类、原显示项身份与重试信息；仅有 failed Run 事实时补诊断通知，不伪造助手正文或成功终态。Provider 空流缺少完成标记仍是错误，不放宽流完整性校验。

上下文压力与累计 Session Token 是两个独立事实，均消费 SDK statistics/execution facts。启动进度只表示本地连接阶段，SDK ready 不等于 Space 当前会话就绪。实时 Sidecar Verifier 和 `/verifier-log` 已移除；Stall logging 与旧历史保留，结果检查通过工具证据和 `visual-review` 完成。

客户端退出沿用同一 requestId 的 SDK lifecycle 回执与持久恢复身份，只取消本客户端工作并保护其他在线客户端。接受、工作清理和精确退出分别处理；unknown 不当作成功，不按缓存 PID/PGID 强杀进程。

## 发布边界

根目录、Desktop、共享 IPC 和 UI 包统一版本，root/Desktop/lockfile 与安装包必须包含相同 Registry SDK。依赖门校验 tarball integrity、公开能力及完整 native bundle，安装包 smoke 校验解包字节并启动真实应用。

当前候选的验证和待完成门见 [alpha.2 发布准备](releases/v0.1.47-alpha.2-release-readiness.md)。历史 release/research 记录保留原版本和文件指纹；局部测试或 Windows 构建不代表跨平台、外部账号或完整 F121/F141 人工验收完成。
