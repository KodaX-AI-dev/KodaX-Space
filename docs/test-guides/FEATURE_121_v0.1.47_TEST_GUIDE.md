# F121 v0.1.47：SDK 聊天输出迁移回归

使用真实 Provider 的 Coder 会话，核对 [ADR-010](../ADR/ADR-010-sdk-product-output.md)。自动回归用已安装 SDK 与隔离的本地 HTTP Provider，不使用个人历史或外部模型账号。

2026-10-14 的 16 项自动 E2E 是本地补丁 SDK 的历史验证。2026-10-15 已安装真实 Registry `0.7.97-alpha.6`，包含 accepted-user 图片恢复和草稿修复，开发链接已撤下。SDK 接入时的回归及包体记录见 [alpha.6 接入记录](../releases/kodax-0.7.97-alpha.6-integration.md)，当前 Space `0.1.47-alpha.2` 候选的新构建与验证见 [alpha.2 发布准备](../releases/v0.1.47-alpha.2-release-readiness.md)。本地构建通过不等于 Space 安装包已对外发布。

1. 发送包含本地文件附件的提示。输入、思考、正文、工具和 Artifact 各出现一次；回答结束后等待后台刷新，再 Ctrl+R，数量和内容一致。
2. 再发送完全相同的提示。必须保留两次输入与两次回答，不能按正文去重。
3. 在回答流式输出时 Ctrl+R，重新选择会话。保留已有部分，继续到完整回答，不能追加第二份同轮输出。
4. 生成超过当前 SDK 预览上限的正文。首段和末段均可读；刷新后仍能补读全文。
5. 发送图片，点击用户气泡的缩略图打开完整预览，刷新后重复操作。缺失图片显示不可用状态；图片访问通过 Space 安全预览协议。
6. 在运行中追加队列输入、刷新、Stop，再发送新提示。队列只交付一次，结束的旧输入不重新冒出。
7. 浏览较早历史页，然后切换窗口焦点或等待后台刷新。保留正在读的旧页；点击返回最新后再显示当前 view。外部输入或 Rewind 使旧游标失效时重新取最新页，不拼接不同修订。
8. 使用 Ctrl+F 搜索当前窗口以外的历史，打开命中正文；校验长正文补读。Fork/Retry/Rewind 保留 SDK 边界，过期边界应拒绝并提示重载。
9. 制造 Provider 认证失败或可重试错误。SDK 错误只显示一次，保留 Provider 设置/重试及诊断信息。执行 Space 命令和工作流时，本地通知仍可见。
10. 删除会话或切换大量会话，确认对应输出缓存回收。Mock、Partner、Quick Ask 分别按各自执行范围回归。
11. 新建普通 Coder 会话但不发送，再切换会话或重启：不新增空历史。首条有效输入发送后应持久化；仅修改名称或设置不能提升其消息排序，旧空记录隐藏后原文件仍保留。
12. 在共享 Coder 查询 Space 使用方法，核对 `space_manual` 的草稿、排序、独立历史与退出说明。`kodax_manual` 仍提供 SDK/CLI 机制；退出说明使用当前 Product lifecycle，旧接口明确标为历史。
13. 在配置好的 Gemini 路由发送简短文本并允许 SDK 提供完整工具表。不得再出现 `relationship_scan.depth` 数字枚举的 TYPE_STRING 错误；该字段继续接受整数 1–3，不在 Space 改写工具 schema。此项真实 Provider 验收与隔离 HTTP E2E 分别记录。

自动化入口：`sdk-product-output.spec.ts`、`sdk-unified-contract.spec.ts`；Mock 图片兼容与启动分别见 `file-attachments.spec.ts`、`renderer-boot.spec.ts`。单元回归涵盖输入缺 turnId、附件正文不同、同 outputId 多块、历史冻结、缓存删除、旧游标失效、正文读取超时、错误诊断连接，以及快照捕获后到达的新 observer 帧不能被旧快照覆盖。
