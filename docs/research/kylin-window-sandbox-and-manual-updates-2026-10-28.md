# 麒麟窗口 沙箱与手动更新

2026-10-28，Space `0.1.47-alpha.3` 工作区 / Registry SDK `0.7.97-alpha.10`。本轮未发布新 Space 版本。附件仅作为客户证据读取，没有执行其中的安装或系统修改命令。

## 窗口按钮

客户报告在银河麒麟安装 Space 0.1.46 后，右上角缺少最小化、最大化和关闭按钮。源码确认主窗口在非 macOS 平台使用隐藏标题栏，但 Shell 只为 `platform-win32` 渲染自绘按钮；Linux 被直接排除，并非缺少窗口控制 IPC。

保留既有自绘控件和控制动作，抽出可独立验证的 `WindowControls`，让 Linux 和 Windows 都显示三个按钮；macOS 继续使用原生按钮。Linux 渲染测试修复前稳定失败，修复后 Linux/Windows/macOS 三项通过。实际 UKUI 桌面验收仍需客户或 Linux 机器执行，不把 Windows 上的平台渲染测试说成麒麟实机验收。

## 沙箱报告的边界

客户报告明确记录 `kodax sandbox setup/doctor` 的 CLI 输出：安装 socat/ripgrep 后仍因 JavaScript Skill 解释器找不到 Node 而不就绪，宿主机终端补装 Node 后恢复。`seccomp not available` 是 ASRT 缺少对应辅助程序的 warning，表示额外 Unix socket 限制不可用；不能据此宣称内核没有 seccomp，也不应将其说成阻止 ready 的原因。

当前 SDK 源码和发布包均保留：Electron 宿主优先使用自身 `process.execPath`，内部 Node 启动环境由 SDK 准备。只读探针在真实 Electron 42.5.0 / Node 24.17.0 下将 PATH 指向空目录，未设置解释器覆盖，调用公开 `doctorKodaXSandbox`：没有出现解释器不可用诊断。该探针在 Windows 执行，不证明麒麟整体沙箱已经就绪；也不修改沙箱权限或跳过就绪校验。

独立 CLI 的引导仍有真实缺陷：对包含“Node 解释器不可用”的 Linux doctor 调用已安装 SDK 的公开 `getKodaXSandboxSetupGuidance`，返回值仍只建议 bubblewrap/socat/ripgrep，没有 Node 引导。探针结果保存于本地 `artifacts/diagnostics/kylin-20261028/`。

### 用户确认的自动回退设计

2026-10-28 补充：沙箱优先、不可用时按原权限流程自动回退，是 KodaX 的既有产品设计；Space 必须沿用，不能把 doctor 未就绪变成普通任务必须停止或要求用户先装环境。先前将 Agent Bash 直接视为“被沙箱就绪门阻断”的推断撤回：附件的 doctor 结果不能证明普通 Bash 的回退失败。

源码对照确认，SDK 的 `toolBash` 在沙箱准备失败、未选中或后端确认目标尚未启动时，进入 `authorizeShellHostExecution` 后继续原命令。Runtime 与独立 CLI 都有该授权入口；Auto 在此由原 LLM reviewer 决策，不额外要求用户设置沙箱，Full Access 沿其原规则执行，Edits/Plan 保留 KodaX 自身的权限语义。Space 共享 Coder 使用 SDK Product/Runtime 的这条链路，没有额外按 doctor.ready 拒绝任务的门。底层显式隔离 API `runKodaXSandboxed` 的 structured-no-execution 与普通 Bash 自动回退是两个不同契约，不能混作“Space 所有命令都不能执行”。

直接针对物理安装的 alpha.10 公共 `toolBash` 新增五项消费方回归：上述三类情况获准后自动执行、磁盘见证只写一次；原权限拒绝和 Stop 均不执行。另只读运行 SDK 当前源码的两项定向回归，覆盖 Runtime 与独立 CLI 的 Auto reviewer 在宿主执行边界自动介入。五项加两项均通过，没有让用户参与修复或安装依赖；这仍不是麒麟实机复现。目前确认的 SDK 缺口是诊断/引导遗漏 Node，未确认现有普通 Bash 自动回退在客户机器上失效。

### 给 SDK 线程的问题 需求与验收

银河麒麟 V10 SP1 amd64 报告中，独立 CLI 的 sandbox doctor 因找不到 Node 返回 `ready:false/setupRequired:true`，而当前 SDK 的设置指引只列 bubblewrap/socat/ripgrep，遗漏解释器原因。请以 KodaX 现有“沙箱优先、不可用时沿当前权限策略自动回退并继续任务”为设计基准修复，确保 CLI 与 Space 共享 Runtime 一致：普通工具不能仅因 doctor 未就绪而失败、反复重试同一个沙箱或要求用户先装 Node/执行 sudo；可用时优先复用 Electron 自身或已提供的解释器，普通执行通过现有 SDK 回退链路完成，保留原 Auto/Edits/Plan/Full Access 及 Exec Policy 决策。修复设置指引时准确区分 Node 缺失、沙箱后端缺失和 seccomp-helper warning；指引用于可选环境修复，不能成为任务继续的前置条件。回退状态和原因留在有界诊断中，不误报 Provider error，不把回退执行标成已隔离。验收覆盖 Linux/Kylin 缺 Node/依赖、沙箱准备或启动失败，以及 Electron 的 PATH 无 Node：符合原权限策略的任务无需新增用户操作即可完成，CLI 与 Space 行为一致；确认未启动才回退，命令只执行一次，原拒绝、Stop 与执行结果未知的情况不被自动重放。SDK 现有普通 Bash 回退已通过已发布 alpha.10 的定向验证，请补齐上述缺失引导和真实环境回归，而不是另造或取消回退机制。客户 CLI 具体版本/来源仍待补，尚不能认定该机器已发生普通执行回退失败。

## 手动更新

源码复现：启动 `initAutoUpdater` 直接检查更新，`autoDownload=true`；原来的 `autoInstallOnAppQuit=false` 只保护安装，没有取消启动检查与下载。更新服务对返回版本的 SemVer 比较本身不等于安装通道校验。

改为启动仅初始化本地状态；设置中的 `getState` 只读，不加载网络 updater。用户手动检查后，分别确认下载和重启安装；每次携带确认的版本，主进程拒绝过期版本、未授权的缓存完成事件和重复请求。`autoDownload` 与 `autoInstallOnAppQuit` 均关闭。移除全局更新 Banner，更新进度与操作留在设置中。未签名 macOS 的既有限制保留。

正式安装只接受正式候选；预发布安装只接受同通道或正式候选。显式固定通道并关闭降级，还在候选、下载和安装边界复核，防止错误 feed 或缓存把 alpha 交给正式版。

安装回调接入既有的完全退出流程。有活动任务或其他连接的客户端时会阻止安装；Runtime 的停止获得确认、本地资源清理及诊断刷新完成后才调用安装器。`electron-updater` 的 `quitAndInstall` 会先启动安装器，再触发退出，因此只依赖 `before-quit` 拦截不足以保护正在运行的资源。本次回归覆盖该顺序；超时、强制退出或恢复流程均不会启动安装器。

本次只读查询 GitHub `/releases/latest` 返回 `v0.1.46/prerelease:false`。这说明查询时的线上 latest 为正式版，不能复原客户升级时的 feed 或断言某次发布必然标错；需要客户当时的版本与 updater 日志才能进一步归因。受污染 feed 的跨通道回归已在隔离主进程测试中覆盖，不以当前服务端状态代替客户端防护。

## 验证记录

- 完整 Node 测试：4,441 通过，20 个条件/平台跳过，无失败；安装前安全退出补充修改后，更新、退出策略、启动清理协调、窗口关闭及按钮共 37 项通过，其中 updater 八项包含先失败后修复的安全安装 barrier 两例。
- `npm run typecheck`、`npm run lint`、`npm run build:smoke` 通过。安全退出修改后再次完成类型、lint、构建与上述定向回归。
- 源码 UI：设置、下载/安装分别确认、原生窗口操作共 11 项通过；新增真实 Runtime 的三项安装准入测试通过：闲置时安装回调看到 daemon 已停止且公开退出清理回执成功；连接其他客户端或活动任务时没有启动安装回调，Space 和任务/对等客户端仍可用。
- Windows 新包：Registry 字节、原生依赖、Worker、真实启动烟测通过；六项真实 SDK 回归，以及设置/窗口/冷启动退出/安全安装共 15 项包内回归全部通过，零重试。安装器仅构建，未发布：`out/KodaX-Space-Setup-0.1.47-alpha.3.exe`，SHA-256 `232cbeefaca7e5d7999d0d709241620cb9b7c714f40b9cb1507caaeca7bc1442`。alpha.10 接入记录中较早的 hash 对应本轮更新前的构建。
- 真实安装器替换会修改本机安装，未执行。Runtime 回归只替换 updater 的网络传输和最终安装器，保留生产 IPC、Runtime 与 Main 退出链路；不伪造已做 NSIS 安装或麒麟实机验收。
- 用户确认自动回退后补充：`kodax-sandbox-fallback.test.ts` 对已发布 SDK 的五项真实命令回归通过；SDK 的两项 Auto reviewer 定向测试通过。此轮只补测试及修订诊断结论/需求，没有修改 Space 执行引擎、SDK 源码或已构建安装器字节。

## Standards

0 项：没有新增可报告的规范违反或坏味道；复核范围以本轮开始的工作区快照为固定点，保留此前 SDK 集成及 Skill 工作。评审只读，执行验证见上。

## Spec

0 项：先启动安装器再退出的 P1 已修复；手动确认、通道隔离、占用阻断和安全退出顺序均已复核。CLI 引导仍是独立的 SDK 待办，未将其标记为已修复。

Standards：0，最高严重度无；Spec：0，最高严重度无。
