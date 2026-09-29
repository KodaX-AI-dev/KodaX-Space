# Runner 轮次显示与触顶回归（rc.6）

## 前置条件

根目录及桌面子包均使用已发布的 `@kodax-ai/kodax@0.7.96-rc.13`，锁文件同步更新。
构建并安装 rc.6 后重启 SDK daemon，避免旧进程继续提供旧版遥测。
本修复不改变阈值策略：managed Root 默认 500，native Actor 子 Agent 默认 200。
它们表示单次 Runner 执行的保护阈值，不是整个会话的总轮数或任务预算。

## 人工检查

1. 启动 Root 并派生至少两个子 Agent，检查底部活动行、顶部任务摘要、右侧 Agent 卡片及任务弹窗：各自显示实时轮次和实际阈值，例如 Root 17/500、child 4/200。
2. 子 Agent 只思考、尚未调用工具时，轮次也应更新。工具活动不能覆盖轮次，子 Agent 事件不能改写 Root 的数字。
3. 切换会话再返回、关闭观察面板再打开，快照应恢复当前数字。新的 Runner 执行从 1 重新计数，不继承之前的计数。
4. 测试夹具传入 max=0，确认只显示当前轮次；没有遥测的旧 daemon 不应凭空补 200 或 500。
5. 使用 SDK 自动化夹具将子任务上限设为 2，连续执行至触顶：卡片显示“达到轮次上限”，状态为 failed，输出查询保留部分内容及产物，Root 收到失败通知。
6. 第 2 轮正常完成应为 completed；follow-up 启动的新执行不继承 iteration_limit。
7. 整体工作预算不能因为 17/500 或 max=0 的轮次事件跳涨。

## 自动化入口

- SDK：actors/controller、coding/child-executor、agent-runtime/actor-runtime、sdk-runtime 的轮次及快照回归。
- Space：activitySpinner、agent-status-projection、coder-daemon-projection、runtime-agent-projection、runtime-iteration、runtime-projection-state、task-dock-projection、live-task-progress，以及 ActivitySpinner SSR。
- `runtime-iteration.test.ts` 直接导入安装的 SDK：运行中轮次 → IPC → UI、触顶失败及部分结果保留、follow-up 重新计数、最后一轮正常完成。
- `activitySpinner.test.ts` 覆盖旧 journalEpoch 的事件不能覆盖重连后的轮次快照。
- Space 类型检查、IPC schema 测试、主进程和渲染器构建；不使用本地 SDK 链接或临时 import loader。

## 本次验证结果（2026-09-28）

- 根目录及 desktop 的实际 Node 依赖解析均为发布包 rc.12，无本地 SDK 开发链接。
- 10 个相关测试文件共 404 项通过，包含发布 SDK → Space IPC → UI 集成测试及 SSR。
- IPC schema 362 项通过；类型检查、改动文件 ESLint、内置技能检查通过。
- 发布脚本测试 88 项通过，7 项因平台或符号链接权限跳过；渲染器及主进程构建通过。
- 后续已生成 Windows rc.6 安装版与便携版，并完成打包 exe 的后台启动、退出、
  恢复与界面验收，详见 [Shell 清理包级验收](ISSUE_SHELL_CLEANUP_v0.1.46_REGRESSION_GUIDE.md)。
  未覆盖用户现有安装；NSIS 向导及真实模型的人工轮次场景不属于此次自动化验收。
