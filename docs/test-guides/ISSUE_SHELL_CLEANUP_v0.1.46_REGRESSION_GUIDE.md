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

`e2e/complete-exit-packaged.mjs` 直接启动打包的 exe 和真实 daemon；在确认测试
进程退出后注入旧 unknown 清理记录，验证恢复后的 Space IPC 终态、连续两次
重启后的状态，以及每次都能真实执行后续 read 工具任务。所有数据、凭据和
进程均归属于隔离测试 profile，不修改用户会话。

打包程序的界面回归沿用同一组测试：

```powershell
$env:SPACE_E2E_EXECUTABLE = (Resolve-Path 'out/win-unpacked/KodaX Space.exe').Path
npx playwright test tests/e2e/queued-message-toast.spec.ts tests/e2e/session-send-retry.spec.ts tests/e2e/renderer-boot.spec.ts
Remove-Item Env:SPACE_E2E_EXECUTABLE
```

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

## 最终包级验收（2026-09-28）

- 产品源码包含 `dffa5ab2`（轮次）及此前的清理、自愈、状态和发送修复；SDK 为正式
  Registry 安装的 `0.7.96-rc.12`。本轮没有再次修改产品运行代码。
- Windows NSIS 与 Portable 产物已生成；ASAR 依赖、跨平台 native 文件哈希、
  Worker 执行、SQLite 和 updater 加载检查通过。
- 打包程序启动检查通过，实际后台版本为 rc.12；122 条历史进程记录保留。
- 扩展后的完整退出测试通过：三次产品退出清理 daemon / Windows Job，历史
  保留，旧 unknown 清理记录恢复为 interrupted，两次重启后仍保持终态，且
  每次都能完成新的 read 工具任务。全部使用隔离 profile。
- 打包 exe 的三项界面测试通过：渲染器启动、发送拒绝后的草稿恢复与重试、
  三种窗口尺寸下通知不遮挡输入区且可关闭并继续提交。通知使用实时几何和
  交互断言；未将隐藏窗口截图或暂停时钟作为通过条件。
- 验收使用 `out/win-unpacked/KodaX Space.exe`；未覆盖用户现有安装、未发布
  GitHub Release，也未进行真实付费模型调用。NSIS 安装向导交互不在本次自动化范围内。

产物 SHA-256：

| 产物                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| KodaX-Space-Setup-0.1.46-rc.6.exe    | `28098e0b7488672bf5651a4ed0ee70f9f033fdbcf7ef28d8cdf2217975e3209b` |
| KodaX-Space-Portable-0.1.46-rc.6.exe | `107d771da130f7607bed35d03e4f28ed3c40f3422b80b4a5704847133a4ce086` |
