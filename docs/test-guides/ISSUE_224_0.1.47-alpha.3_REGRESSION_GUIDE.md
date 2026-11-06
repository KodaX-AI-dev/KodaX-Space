# Issue 224 — 启动等待与退出回归

适用：Windows `out/win-unpacked/KodaX Space.exe`，Space 0.1.47-alpha.3 本地维护版。

## 自动验证

```powershell
$env:SPACE_E2E_EXECUTABLE = (Resolve-Path 'out/win-unpacked/KodaX Space.exe').Path
node scripts/e2e-run.mjs tests/e2e/runtime-startup-exit.spec.ts
```

测试使用独立临时数据目录，延迟真实 SDK daemon 就绪，模拟已有会话创建请求正在等待启动。
它检查加载动画、已等待时长和超时提醒，并验证完整退出后窗口及时隐藏、进程自动结束，
不通过“强行关闭”绕过清理。不会修改日常使用的数据档。

## 人工验证

1. 启动打包程序，观察正在启动时的提示条：有转动图标、真实启动阶段、持续更新的等待秒数。
2. 若启动超过 30 秒，应显示“启动耗时超出平常”，提供继续等待或退出重试的说明；
   不显示无法证明的进度百分比或剩余时间。
3. 加载中通过关闭按钮选择“完整退出”，或从菜单/托盘选择完整退出。
   无任务阻挡时，不应再因启动请求占用而在十秒后弹出“暂时无法安全退出”。
4. 托盘可用时，窗口先隐藏，后台完成 Runtime 安全清理；仍在启动的 Runtime 可能需要更久，
   托盘应保持退出进度。无托盘时，窗口保留退出提示，直到清理完成。
5. 若有真实任务阻挡而选择保持开启，确认随后仍可启动助手和使用会话。
   另一个客户端的任务应保持运行，不应被启动取消一并停止。
6. 正常启动完成后，等待提示条消失。切换浅色/深色主题和减少动态效果设置，
   确认文字可读、边界颜色与主题一致、减少动态效果时停止旋转。

一分钟以上的偶发 Runtime 启动延迟仍按 Issue 225 独立追踪；本修复不宣称已经消除该延迟。

## 偶发慢启动的自动诊断（Issue 225）

本地维护包在启动失败或实际启动耗时达到十秒时自动保留阶段耗时和 SDK 等待原因；
正常快速启动不输出这份时间线。无需设置调试环境变量。

Windows 日志位于 `%APPDATA%\KodaX Space\diagnostics\space-main.jsonl`。
按发生时间查找 `runtime-startup` / `stage_timing`；`stepMs` 与 `totalMs` 使用单调时钟，
`launcherProgress` 保留 SDK 阶段、等待原因及其发生时间。需要与 daemon bootstrap 的时间戳一起核对。

自动验收：

```powershell
node scripts/e2e-run.mjs tests/e2e/runtime-startup-diagnostics.spec.ts
```

该用例禁用调试开关，用独立数据目录启动真实 SDK 并延迟就绪，确认仍可自动记录时间线。

## 2026-11-06 本地修复验证补充

本补充对应尚未发布的新修复，保留上面的历史版本记录。

启动前的旧退出验证包含固定 30 秒前台预算，覆盖挂起的 SDK 读取和连续自动重试。
预算耗尽后保持 Runtime 准入关闭，并显示恢复提示。可打开诊断目录、继续验证，或关闭提示。
打开诊断目录后应仍可继续验证。关闭应用可以取消启动等待，迟到的检查结果不能放行启动。
反复点击继续验证时，未完成的 SDK 检查保持单飞。

SDK 返回 host_generation_terminated 只允许进入受锁保护的崩溃恢复。原 cleanup/host 状态
可以仍为 unknown，Space 不能把该结果当作正常退出成功，或据此确认安装更新所需的 Host
已经正常停止。旧版 SDK 无法核实的记录会进入恢复界面，继续保留历史数据和原始回执。

```powershell
node --import tsx --test apps/desktop/electron/test/runtime-exit-recovery.test.ts apps/desktop/electron/test/renderer-startup-gate.test.ts apps/desktop/electron/test/background-runtime-startup.test.ts apps/desktop/electron/kodax/runtime/runtime-client-exit.test.ts
```

回归需覆盖永远待验证和单次查询挂起，确认显示恢复状态且不启动新 Host；验证成功后原地进入
正常启动；恢复提示等待期间关闭应用能取消等待；新 SDK 的崩溃恢复结果不能认证优雅停机。
另以修复后的本地 SDK 包在隔离数据目录联测 Windows 两种启动顺序、异常终止与并发启动。
使用正式发版 SDK 的 Adapter 兼容检查与本地新 SDK 的恢复联测分别记录。
