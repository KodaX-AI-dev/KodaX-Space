# ADR-010: 共享 Coder 的聊天正文由 SDK 输出面统一负责

- **Status**: Accepted
- **Date**: 2026-10-14
- **Companion**: [迁移验收标准](../features/SDK_0.7.97_MIGRATION.md)、[输出面词汇](../../CONTEXT.md)

## Context

Session `20261014_140626_nub2876ee9a86e` 在落盘与 SDK view 中只有一份首个输入和回答。Space 同时重建实时 delta 与 canonical history，输入缺 turnId、附件补充文本不同，使整轮显示重复；刷新只读历史后正常。统一输入契约并没有自动迁移显示权威。

## Decision

共享 Coder 的普通聊天只显示 SDK `sessions.observeView` 的有序 items，整份替换；历史浏览与搜索使用 `readHistory/readHistoryEntry/searchHistory`。Renderer 保留 item ID 与 SDK 顺序，只负责布局、折叠和安全图片预览。长正文补读按 SDK 项身份、版本和偏移校验；历史 opaque 引用不与 view ID 混用。

当前窗口与较早历史窗口分开选择显示，不能拼成第二份会话。inputId 仅用来确认发送占位；inputId/outputId 可连接 SDK 提供的 action boundary 元数据，不能合并正文或折叠同一 outputId 下的多个块。历史变更仍由 Host 校验 entryId/sourceRevision。

可信 Main Runtime 连接继续承接授权、凭据、工具和非正文诊断；Space 自己的命令/工作流通知可以显示。Mock、Partner 和临时 Quick Ask 保留独立执行范围。这一决策替代 ADR-009 在共享 Coder 正文上的客户端结算认证，ADR-009 的其他既有路径继续适用。

快照读取和 observer 帧的替换共用同一写入队列，终态采用同一入口，避免旧快照以更高 Space revision 覆盖新帧。失败诊断优先附着 SDK error item；SDK 只提供 failed Run 事实而没有 error item 时，显示单独的诊断通知，不生成第二份 assistant 正文。

## 被否决方案

- 给缺失输入补 turnId，再按正文或时间拼接：只能修一个数据形状，仍让 Space 承担 SDK 已负责的身份与收敛。
- 同时显示 live 与 history 后按 outputId 去重：同一 outputId 可以含独立思考、正文、工具块，且 history/view item ID 属于不同引用范围。
- 在 Renderer 恢复 SDK 私有日志：重连和历史失效语义应由 SDK 公共输出面负责。

## 后果与重审条件

当前 view 是 SDK 有界窗口；较早内容通过历史页浏览、全历史通过 SDK 搜索访问。冻结历史页期间当前 view 可以推进，但不覆盖用户正在读的窗口。变更后需要通过真实发布 SDK 的流式、刷新、队列、长正文、Artifact 和历史边界回归。

若 SDK 不再提供上述公开替换语义或安全分页引用，先以公开契约反例推动 SDK 修复，再重审此决策，不恢复客户端正文拼接。
