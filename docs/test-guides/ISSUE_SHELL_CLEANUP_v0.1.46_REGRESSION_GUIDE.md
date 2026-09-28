# Shell 清理异常后的可用性回归

## 用户明确修正的要求

源自 session `20260928_160252_occb6cfe737bfa`。第一版把清理未确认扩大为会话
阻塞，用户明确否定。工具异常应交还 LLM 处理，清理状态不应锁死会话。

- SDK 超时返回诊断和部分输出，让 LLM 继续；只有用户 Stop 才取消模型执行。
- 保留遗留清理记录，但后续任务与发送消息不等待它清零。
- Stop 收尾期间仍可发送 after-turn 消息，SDK 接收后于执行结束时处理。
- Space 不因 unknown 禁用 Send 或拦截快捷键；文案明确仍可发送。
- 根 Agent 按真实标识定位，并采用当前 Run 状态；不误改排序在前的子 Agent。
- live/profile 快照错序按同一 Run 的阶段时间仲裁，不误报空闲。
- 通知放在标题栏下，不遮挡 Stop / Send，窄窗口可滚动且可关闭。

不把清理未确认伪装成进程已全部终止。SDK 与 Space 都需要重新部署。

## 自动回归

```powershell
npm run typecheck
node --import tsx --test apps/desktop/electron/test/composer-invoke.test.ts apps/desktop/electron/test/agent-status-projection.test.ts apps/desktop/electron/test/task-dock-projection.test.ts apps/desktop/electron/test/activitySpinner.test.ts apps/desktop/renderer/src/shell/ActivitySpinner.test.ts
```

## 人工检查

1. 用包含 SDK 修复的测试包启动隔离会话，注入清理持续 unknown。
2. Shell 超时后 LLM 得到命令、PID、退出观察和部分输出，继续回答或调用工具。
3. 清理期间发送中途消息，工具返回后由 LLM 处理。
4. 主动 Stop 后模型停止；收尾期间仍能发送下一条消息，随后正常执行。
5. 下一轮开始后遗留清理记录仍保留，不误显示全部进程已确认终止。
6. 在 1920×1152、1024×768、480×640 窗口检查通知不挡 Stop / Send，且可关闭。
