# Space / SDK alpha.3 E2E 验收（2026-10-11）

Windows x64 本地验收完成：源码 **99 个不同 E2E 用例通过，0 失败、0 跳过、0 重试**，包括现有桌面套件 93 项和新增真实发布 SDK 套件 6 项。打包目录应用 `out/win-unpacked` 的同一真实 SDK 套件 **6/6 通过**。重复专项执行不计入 99 的总数。安装和打包均为 Registry `@kodax-ai/kodax@0.7.97-alpha.3`，没有链接 SDK 工作树。

逐项标题、状态、耗时及执行时间见 [机器证据](kodax-0.7.97-alpha.3-space-e2e-evidence.json)。

## 已执行范围

| 范围 | 验证 |
| --- | --- |
| 启动与窗口 | 生产 Renderer/preload、启动 overlay、后台节流、托盘、关闭设置、首启隔离 |
| 输入与会话 | 发送/取消/队列、失败重试、模式与模型、附件、清空、历史检索、删除及恢复输入框 |
| 真实 SDK | Main 凭据授权，write/read/space_manual 实际执行，物理请求与累计用量，canonical 历史，重载与 Fork |
| 真实队列/停止 | after-turn 跨重载恢复且仅执行一次，Stop 后新输入与输出及时进入界面 |
| 真实历史边界 | 旧 sourceRevision 拒绝且不改变历史，UI Rewind，回退后新输入 |
| 真实完整退出 | 零退出码；公开离线回执匹配 requestId/runtimeId、cleanup succeeded；最后 Host succeeded 且 PID 消失；在线 peer 时 Host protected 且 peer 历史可读 |
| 文件/Artifact | PDF/GIF/PNG/文本/DOCX/XLSX/PPTX/WAV/WebM；PDF 翻页，视频可解码；HTML 模块、assets、fetch、storage、worker、真实 iframe 点击/播放与版本刷新 |
| 界面与设置 | 控件遍历、弹层关闭、滚动稳定、窄宽布局、侧栏、语言、Provider 增删/密钥/默认状态及失败恢复 |
| Partner/Workflow | 内置 Partner、Experts/Connectors、材料/来源/详情和会话切换；外部 Agent 管理/Task Dock；Workflow 创建、事件推进和落盘恢复 |

文件样本全部为仓库内生成的数据，默认无需私人 Downloads。最后启动与九类文件预览专项 2/2 通过，包含视频元数据/尺寸断言。

现有 93 项包含 Mock adapter、注入 IPC 和 push 事件；它们验证真实 Electron UI、产品处理和持久化，不能证明每一项都执行了真实 SDK。新增 6 项使用真实发布包、真实 daemon、公共 IPC、隔离 profile 和本地确定性 HTTP Provider。执行/统计断言在 fixture 强制清理之前完成；退出先证明产品正常退出与公开回执，随后才做测试清理。

## 修复与测试隔离

Stop 后再次发送时，Actor/live snapshot 读取可能把静止的 Session 观察订阅提前退役：Host 已执行新任务，Renderer 停在 Sending。现在 Space 在授权和 admission ACK 期间持有订阅，成功后交给 active Run，失败则释放。单元反例 RED→GREEN；adapter 250/250 回归，真实 SDK Stop/队列在源码及打包应用均通过。

旧打包 smoke 要求已删除的 journal/exit 契约，并改写 SDK 私有 Run 状态制造恢复情景。本轮改为 canonical/public snapshot 和 lifecycle 回执验收；packaged UI 使用同一真实 SDK E2E。unknown、ACK 丢失、Main 重建仍由 `runtime-sdk-migration.test.ts` 的公开 SDK 集成回归证明，不能写成已完成 packaged UI E2E。

Windows `npm run e2e:run` 创建独立 Win32 Desktop，让测试进程继承它；不调用 SwitchDesktop，不改产品的 show/focus/alwaysOnTop。启动动画和主窗口保持正常行为，真实 Playwright 输入继续工作，只存在于测试桌面。`e2e:headed` 用于明确需要观察当前桌面窗口的调试。

启动器先挂起子进程，绑定 KILL_ON_JOB_CLOSE Job，再恢复执行，同时监控 Node owner。正常完成、硬终止 launcher、硬终止 Node owner 的无 GUI 反例均确认子树收敛和 Desktop 回收。测试意外 native confirmation 自动取消，失败保持失败，不把强制关闭当正常成功。清理仅操作隔离 profile 引用的 test-service 凭据，包括轮换后的旧账号。

实现依据：Microsoft [CreateDesktopW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-createdesktopw)、[STARTUPINFO desktop](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/ns-processthreadsapi-startupinfoa)、[Job 生命周期限制](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information)。本机行为以运行证据为准。

## 其他验证与限制

- 打包 gate 全部通过：exact Registry SDK、ASAR 依赖/native binding、ASRT/Sandbox doctor/命令、Bash、Host 重启、精确退出、constructed-handler Worker、image decoder、SQLite、updater。新隔离 Job 下重跑 packaged smoke 也通过。
- 打包启动保留 122 条历史 child 记录；Renderer 7,387ms 就绪，Runtime 在测试用 20 秒延迟后于 31,013ms 就绪。
- 凭据清理回归 3/3、打包 gate 辅助回归 8/8、typecheck、E2E fixture strict typecheck、lint 通过。
- 最终 Standards 0 项残留、Spec 0 项残留。评审发现的取消子树归属和退出回执断言缺口已修复并复验。

未执行 macOS/Linux UI、付费线上 Provider、真实外部 Agent/Feishu 账号、实际更新服务器/安装向导或模型生成质量验收。相关 Mock/本地情景不能替代外部验收。未发布新的 Space 版本或安装器；本次产生本地打包目录应用。
