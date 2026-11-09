# 连续保存历史与提问强调回归

基线 `a26a73d2`，Registry SDK `0.7.97-beta.4`。原始参考为 `ca64e3f3` 的历史与视觉部分；不沿用该旧提交已经冲突的 Issue 编号。设计依据为 [当前历史设计](../design/session-history-browsing-and-actions.md) 与 [ADR-010](../ADR/ADR-010-sdk-product-output.md)。

## 通过条件

1. 打开超过 150 条记录的共享 Coder 会话。首屏仅加载最近窗口，显式打开保存记录后连续上翻两页；已读较新消息仍保留，顺序正确，同文不同 ID 均保留。
2. 滚轮、键盘、触摸、原生滚动条可读未读的相邻页面；跨页后反向读已有内容不重新请求，不切到实时来源。按住滚动条跨两页，短视口、快速与稳定恢复、反向拖动和取消均可用。
3. 搜索会话定位旧问题或工具；前后页接入定位窗口，返回恢复原集合、查询、选中项、焦点及阅读位置。程序搜索滚动不触发额外取页。
4. 实时输出推进时，保存窗口不变；点击已有底部箭头才回到实时末尾。跨来源只有唯一 SDK 身份映射才自动衔接，无法证明时使用明确入口并可返回原处。
5. 修订、来源或失效 epoch 改变时保留全部已读项并显示重新定位；网络失败可重试，迟到响应和会话 A→B→A 不覆盖当前来源。重叠页按 opaque ID 去重，完整正文不退化成预览。
6. 前插保留可见项与相对位置；上方内容延迟变高后锚点漂移 ≤2px。较新追加不跳回页首。
7. 中英文用户消息始终有发送者标签；浅色与深色下保留浅色底、强调边及可读正文。长提问展开/折叠、复制全文、图片与 Fork/回退入口均保持。标签不进入复制文本。

## 自动化入口

- `apps/desktop/electron/test/session-history-paging.test.ts`：公开分页生命周期，含同修订双向扩展、两端游标、正文缓存、变更冻结及迟到响应。
- `apps/desktop/renderer/src/shell/conversationHistoryNavigation.browser.test.ts`：真实 ConversationStreamV2，覆盖搜索、手势、原生鼠标拖动、来源选择与布局锚点。
- `apps/desktop/renderer/src/features/session/messages/userBubble.test.tsx`：真实气泡与本地化标签、既有操作入口。
- `tests/e2e/sdk-history-navigation.spec.ts`：真实发布 SDK 的 260 轮混合记录、搜索定位、原生拖动和底部返回。
- `tests/e2e/user-query-collapse.spec.ts`：真实界面主题、折叠、标签及全文复制。
- `tests/e2e/sdk-unified-contract.spec.ts`：完整轮 Fork/回退等公开契约保护。

最终执行结果与平台边界记入本轮研究验收记录；本指南列出要求，不代替执行结果。
