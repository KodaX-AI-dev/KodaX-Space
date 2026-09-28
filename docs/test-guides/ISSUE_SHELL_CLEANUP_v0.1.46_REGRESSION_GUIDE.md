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

## 重启自愈

SDK 确认旧执行进程已退出后，自动将旧 Run 收尾为 interrupted，结束其等待中的
interrupt 输入，并将尚未确认的进程清理转为不占用会话的记录。再次重启也不会
把该终态恢复为活动任务；仍然存活的执行进程不会被误判为崩溃。

Space 的自愈回归覆盖 live/profile 两路快照的两种到达顺序：旧 unknown 和旧
Runtime 的活动事件不能盖过同一 Run 的 interrupted 终态；旧 Runtime 的较大
序号也不能让转圈重新出现。下一条新 Run 仍能正常显示活动状态。

本轮补充的是现有恢复逻辑的进程级与界面状态回归，没有增加轮询配置或要求
用户手工清锁。安装包必须集成修复后的 SDK；仅修改 Space 界面不能修复旧后台。

## 自动回归

### SDK 0.7.96-rc.12 配套验证

Space 的运行面板、Agent 侧栏和独立任务面板统一采用 Runtime 的最新终态。
旧的进行中计划、预算提示和根 Agent 快照不能覆盖已中断状态；新任务启动时
不继承上一轮终态。这里仅改变显示，Stop 仍使用活动 Run 的身份。

`runtime-cleanup-recovery.test.ts` 使用实际安装的 SDK 和隔离目录，构造磁盘上
遗留的 unknown/停止未确认记录，验证连续两次重启均投影为 interrupted、
发送入口可用、旧计划不再显示运行中，随后真实执行一个 read 工具任务成功。
测试不访问用户会话，也不调用模型服务。

`queued-message-toast.spec.ts` 在 Electron 中验证 1920×1152、1024×768、480×640
窗口的排队通知位于输入区上方、可关闭，且仍可输入和提交后续消息。

```powershell
npm run typecheck
node --import tsx --test apps/desktop/electron/test/composer-invoke.test.ts apps/desktop/electron/test/agent-status-projection.test.ts apps/desktop/electron/test/task-dock-projection.test.ts apps/desktop/electron/test/activitySpinner.test.ts apps/desktop/renderer/src/shell/ActivitySpinner.test.ts
node --import tsx --test apps/desktop/electron/test/runtime-cleanup-recovery.test.ts
npm run build:smoke
npx playwright test tests/e2e/queued-message-toast.spec.ts tests/e2e/session-send-retry.spec.ts
```

## 人工检查

1. 用包含 SDK 修复的测试包启动隔离会话，注入清理持续 unknown。
2. Shell 超时后 LLM 得到命令、PID、退出观察和部分输出，继续回答或调用工具。
3. 清理期间发送中途消息，工具返回后由 LLM 处理。
4. 主动 Stop 后模型停止；收尾期间仍能发送下一条消息，随后正常执行。
5. 下一轮开始后遗留清理记录仍保留，不误显示全部进程已确认终止。
6. 在 1920×1152、1024×768、480×640 窗口检查通知不挡 Stop / Send，且可关闭。
