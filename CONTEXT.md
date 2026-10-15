# 输出面词汇

- **SDK 最近消息时间（lastMessageAt）**：SDK 提供的真实用户/助手消息时间；保留复制来源的时间，元数据、设置、Actor 保存和历史压缩不能推进它。Space 透传该事实并用于历史排序；缺失时保留旧记录的创建时间与 Runtime 活动兼容路径。

- **未发送会话草稿**：SDK 接受草稿创建后持有的内存会话，可设置和观察；首个有效用户输入进入 canonical 历史时才持久化。已有消息数为零的会话不一定是草稿，可能包含可恢复的旧分支、通知或其他状态。

- **SDK 当前 view**：Host 提供的有序显示项快照；每次回调完整替换前一份当前窗口。
- **SDK 显示项（item）**：SDK 给定 opaque item ID 的正文、思考、工具或提示项；Space 不解析其 ID，不按正文去重。
- **历史浏览窗口**：SDK readHistory 给出的单一修订分页窗口；与当前 view 分开选择显示，不把两者正文拼接。
- **历史边界（historyBoundary）**：SDK 给定 entryId 与 sourceRevision 的变更锚点，用于 Fork/Retry/Rewind，不是显示项身份。
- **输入身份（inputId）**：Host 接受的一次输入意图；可用来结束 Space 的发送占位，相同正文的不同输入仍是不同意图。
- **输出身份（outputId）**：一个 assistant 消息的 Host 身份；同一消息的正文与思考可有多个独立显示项。
- **Space 界面通知**：Space 命令回显、工作流提示等本地产品消息；不包含从 Runtime delta 重建的 assistant/thinking/tool 正文。
