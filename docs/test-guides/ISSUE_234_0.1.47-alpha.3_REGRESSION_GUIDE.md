# Issues 234/235 — 报告展示与历史导航

目标版本：Space 0.1.47-alpha.3（源码修复，尚未发布），Registry SDK 0.7.97-alpha.11。

1. 打开含子任务报告的历史会话。普通信息使用中性颜色；旧版完整 `<agent-completed>` 报告经 SDK 按来源识别后显示“任务报告”，默认折叠。展开后标题、列表、代码及引号正常，复制得到可读报告。未知或不完整封装保留原文，不能丢消息。
2. 真正的 Provider 错误仍显示错误样式、诊断和原有操作按钮。Space 按 SDK 的 `taskResult` 显示 completed/failed/cancelled/unknown；缺失 taskId 不造假补齐，子任务失败不变成主 Run 的 Provider 错误。字面代码 `&quot;` 不二次解码。
3. 首次打开已保存会话后，首次上翻的游标应可用；继续向上跨过至少两页历史，再向下滚动到页底，应依次进入相邻较新页，从页首继续阅读。滚轮、PageDown/End、触摸和滚动条应遵循同一方向。程序恢复旧页底部不应自动弹回新页。
4. 全程仅有一个向下箭头，即使当前已在旧页底部也可见；点击后加载真实最新窗口，提交后滚到最新消息。不得再出现独立“返回最新消息”按钮。
5. 旧页读取尚未完成时点击箭头，再释放旧请求，仍停留最新窗口。切换会话后旧请求不得移动新会话视口；读取失败保留原页，可重试。当前 SDK view 的新输出不能打断旧页阅读，回到最新后须可见。
6. 重测原 Session 冷启动首次加载，确认没有 React 185。检查完整正文、图片、工具和 Artifact，以及原有错误诊断入口。

自动化：colocated Product 投影、SystemNotice、history paging、真实浏览器 `conversationHistoryNavigation.browser.test.ts`；打包后运行 `sdk-history-navigation.spec.ts`、`sdk-product-output.spec.ts`、`sdk-restored-history.spec.ts`。原会话回放仅使用独立数据档，不能修改客户文件。

验证包、哈希及实际结果见 [排查与验证记录](../research/renderer-185-agent-notices-and-history-navigation-2026-10-28.md)。

## alpha.11 升级补充

后续遗漏补齐：新建 Coder 会话，首条输入前选择 Agent 或 Script，保存期间不能发送；输入 `/work-mode` 须看到查询回显，`/work-mode agent` 同步下拉框且不访问模型。切换项目/会话时迟到的创建或保存不得改写新会话；旧 Host 与版本冲突保留原设置并明确提示。

新增 `sdk-work-mode.spec.ts` 和 `sdk-alpha11-lifecycle.spec.ts` 覆盖真实 Script 拒绝/Stop/重启、MCP 原文生成与重启后读取、模型自动调用 Skill 的策略/hook/模型偏好/重发现，以及多份长报告顺序与完整 UI 正文。步骤与新包实际结果见 [补齐记录](../releases/kodax-0.7.97-alpha.11-completion.md)。

7. 会话空闲时工作模式默认 Coding，可改 Agent 或实验性 Script；刷新后重新选中会话仍保留 Host 状态。模型、权限、AMA 不随切换改变。运行中不可切换；另一客户端改写后的过期 revision 必须冲突，不能自动覆盖；旧 Host 不支持时禁用并提示升级。
8. 思考和工具参数流只在 Host 提供 estimatedTokenCount 时显示 `~… tokens`。无估算、无 view、错误 runId 或无工具 callId 时不得按字符数补数。折叠思考摘要仅标识状态；账单 usage 与历史文本分页偏移不变。
9. 展开有保存原文的工具项，点“读取完整原始结果”，大于 65536 UTF-16 单元的中文/emoji 原文应完整分页读取。刷新后仍可读；原文文件缺失应明确失败，不能拿截断预览冒充。Renderer 不访问 outputPath。
10. 普通问题长时间等待不自动提交；Skip、Stop、Host deadline 和 non_interactive 各自保留语义。权限审批仍独立。
11. 回归 `/draft-response` 等 Space builtin 在独立 Coder Host 中运行；检查 settings 中手动检查/下载/安装更新，不允许稳定版自动升 alpha；Linux 顶栏按钮在真实麒麟机器补验。

升级新增自动化：`tests/e2e/sdk-alpha11.spec.ts`（真实已安装 SDK / daemon / Electron），以及本轮 work-mode、productStreaming、productItemContent、ActivitySpinner、IPC schema 和 AskUser 测试。具体执行结果、Host 能力与新包路径以 [alpha.11 接入记录](../releases/kodax-0.7.97-alpha.11-integration.md) 为准。SDK Issue 371 首次历史读取延迟仍未关闭，不能只凭 Host ready 判定历史已加载。
