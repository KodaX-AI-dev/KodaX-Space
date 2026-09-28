# Shell 清理未确认与 Stop 回归

## 已确认需求

源自 session `20260928_160252_occb6cfe737bfa` 的卡住、队列不消费、根 Agent
误报空闲、Stop 状态未知及通知遮挡问题。本修复配合 SDK 的 Shell 清理耗尽修复。

- 当前 Runtime Run 是根 Agent 活动状态的依据；控制 Actor 没有 Turn 不代表空闲。
- `unknown` 优先于过期的流式状态和进行中的 todo，明确展示“运行状态未确认”。
- 状态未确认时保留草稿和附件，阻止发送请求，说明原因并提示重试 Stop。
- 清理确认后，正常发送和运行状态恢复；普通运行中的队列发送保持可用。
- 通知位于标题栏下方，不能遮挡输入区 Stop / Send，窄窗口可滚动且可关闭。

不能通过把 unknown 强制改为 completed 或删除清理记录来恢复发送。
SDK 和 Space 都需要部署；仅修改源码不会更新当前已运行的安装包。

## 自动回归

```powershell
npm run typecheck
node --import tsx --test apps/desktop/electron/test/composer-invoke.test.ts apps/desktop/electron/test/agent-status-projection.test.ts apps/desktop/electron/test/task-dock-projection.test.ts apps/desktop/electron/test/activitySpinner.test.ts apps/desktop/renderer/src/shell/ActivitySpinner.test.ts
```

## 人工检查

1. 以包含 SDK 修复的本地测试包启动隔离的测试会话，注入清理检查返回 unknown。
2. Shell 超时且有界清理重试结束后，任务栏显示状态未确认，根 Agent 不显示空闲。
3. 输入文字并附加文件，尝试按钮发送和快捷键发送；无新请求、草稿和附件保留。
4. 重试 Stop；清理仍未知时保留提示，确认清理后恢复可发送。
5. 普通运行时验证 interrupt / after-turn 两种排队输入仍正常。
6. 在 1920×1152、1024×768、480×640 窗口检查通知不挡 Stop / Send，关闭按钮可用。

已通过真实 ToastContainer、项目 Tailwind 样式和 Playwright 的三尺寸布局检查。
该检查验证通知位置，不等同于对旧版安装包中的历史 Run 完成了清理。
