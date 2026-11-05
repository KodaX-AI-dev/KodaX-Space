# Space 接入统一 Host 后，启动、关闭、崩溃恢复和发布升级链路怎样收口？

TL;DR：SDK `f6a010462` 已把公开 Runtime 收口到共享 Host，Space 的主启动及 receipt 退出链可沿用；embedded owner 切换和打包探针仍调用已退休契约，不能只升级依赖。另已通过无 Host 的注入探针复现：`host=protected` 的个人退出会被 Space 标作 Host stop confirmed，从而满足安装器布尔门禁；这是上线前必须修复的下游问题。证据与建议分开，本文是未接受、未实施的调研方案，不是发布批准。[U `src/sdk-runtime.ts:4140-4153,5870-5917`; S `apps/desktop/electron/kodax/runtime-host-adapter.ts:1791-1803,7842-7865`; S `apps/desktop/electron/main.ts:1880-1888,2890-2898`]

## 证据冻结与范围

- **S** = `C:/Works/GitProj/KodaX-AI/KodaX-Space`，固定提交 `7801a8ca099c4ecf47af5b1e361ff6812f8c12b9`。本文引用的源码、脚本、配置和测试均核对为该 HEAD 无差异；原有 `tests/fixtures/file-preview/fixture.txt` 工作区修改未读取、未改动。[本次只读命令：`git rev-parse HEAD`、`git status --short`、针对引用范围的 `git diff --name-only HEAD -- ...`]
- **U** = `C:/Works/GitProj/KodaX-AI/KodaX`，**已接受提交** `f6a010462a477bd1b36dd849a6c9c0dbb0f76808`。U 的源码均用 `git show f6a010462:<path>` / `git grep ... f6a010462 -- ...` 读取，没有把活动工作区当固定契约。[本次只读命令：`git rev-parse f6a010462`]
- **W** = U 在调查时的未提交工作区，包含 `src/sdk-runtime.ts`、`src/sdk-client.ts`、`src/runtime-daemon/{client,protocol,reverse-bridge,schema,server}.ts`、`packages/agent/src/runtime/{managed-child-processes,process-tree}.ts` 和 `scripts/build-bundle.mjs` 等变更；这些**未发布、未作为本文接受结论的依据**。固定提交存在不代表已发布 npm，Space lock 仍指向其锁定的 `0.7.97-alpha.11` tarball。[本次 `git status --short` / `git diff --stat f6a010462 -- ...`; S `package-lock.json:2153-2156`; U `package.json:3`]
- 这是 primary-source 源码审计和一项纯组合逻辑探针；没有 install、build、pack、SDK 全量测试、真实用户 profile 读取、真实 Host/模型/安装器操作，也没有 commit。下文引用的测试文件说明**已有可复用测试意图**，不声称本次执行或通过。

引用格式 `S/U 文件:行` 均按上述固定提交；多行引用表示该范围内的实现。推荐项只表示本次研究建议，尚未作为 ADR、需求或实现接受。

## 1. 启动和配置根：Host 是单写者，profile 不是第二套执行世界

| 现状事实 | 含义 | 固定来源 |
| --- | --- | --- |
| Space 的 `.kodax` 根默认是 `os.homedir()/.kodax`；`KODAX_TEST_ONBOARDING` 优先隔离，绝对 `KODAX_PROFILE_DIR` 是直接数据根；`getKodaxRuntimeDir()` 可跟随绝对 `KODAX_HOME`。 | Space 专有数据根与 SDK 配置根可能因显式 `KODAX_HOME` 不同；不能把 CLI `homeDir` 当直接 `.kodax` 路径传入。 | S `apps/desktop/electron/kodax/data-paths.ts:54-110,133-140` |
| `applySdkHomeEnv()` 在主进程 bootstrap 调用；独立 profile 的 Electron `userData` 也在单实例锁前设置。 | 测试隔离应包括 SDK、Space 和 Chromium；只改 sessionsDir 不足以隔离配置、扩展和身份。 | S `apps/desktop/electron/main.ts:273-281`; S `apps/desktop/electron/kodax/data-paths.ts:106-110,133-140` |
| Adapter 的 `profileRoot` 是直接配置根；可选 `runtimeHomeDir` 是拥有 `.kodax` 的上一级；连接传 `sessionsDir=<profileRoot>/sessions`，自动启动请求 profile `coder`。 | 保留两个参数的语义，避免重复拼 `.kodax`；默认应跟随 SDK 配置根。 | S `apps/desktop/electron/kodax/runtime-host-adapter.ts:1418-1423,2201-2218,2365-2375,8186-8189` |
| U 的 `homeDir` 未给定时，配置根用 `replApi.KODAX_DIR`；给定时固定为 `<homeDir>/.kodax`。 | Space 已设置的 KODAX_HOME 应通过省略 homeDir 保留；直接配置根不应塞给 homeDir。 | U `src/sdk-runtime.ts:622-633` |
| Space 首次连接用 `ensureKodaXRuntime`，断线重连默认用 passive `connectKodaXRuntime`；adapter 自己有 initialize single-flight、startup AbortSignal 和 close 竞态保护。 | 主启动方向已经符合统一 Host；迁移应保留这些 admission/cancel 边界。 | S `apps/desktop/electron/kodax/runtime-host-adapter.ts:1738-1743,2436-2485,2514-2521,2795-2899` |
| U passive connect 拒绝 autoStart 和生命周期修改；ensure 在 Session 存储 realpath 下的 `.product-host/startup.lock` 串行化整个发现/启动/升级/认证流程。 | 不能在 Space 再自造 daemon owner 或把 connect 当隐式启动；多个 launcher 的协调归 SDK。 | U `src/sdk-runtime.ts:5870-5917`; U `src/runtime-daemon/state.ts:846-854` |
| U 先发现相同 sessionsDir 的 owner，允许从请求 profile 跳到实际 owner profile；Session 根有额外 `.product-host/owner.lock` 单写者 fence。 | `coder` 是请求名，不保证为返回身份；多 Client/CLI/Space 共享真实 Session 根时应跟随 SDK actual identity。 | U `src/sdk-runtime.ts:6429-6450,6585-6604`; U `src/runtime-daemon/state.ts:856-918` |
| Space 接入后保存 `runtime.identity.profile`，退出 recovery 也保存 receipt 的实际 profile；但未初始化恢复默认 `coder`，旧 CLI stop fallback仍硬编码 `--profile coder`。 | 大部分正路已支持重定向；fallback、诊断脚本和测试不得假定 default/coder 是实际 owner。 | S `apps/desktop/electron/kodax/runtime-host-adapter.ts:2561-2562,6960-6971,7774-7784,7803-7810`; S `apps/desktop/electron/kodax/runtime-daemon-control.ts:173-193` |

**建议（未接受）**：保留 SDK 的 sessionsDir 存储发现和启动协调；Space 对启动、诊断和退出统一使用连接返回的 profile/runtimeId，无法取得时走 SDK 发现/离线 receipt API，避免依据 UI mode 拼装第二个 Host。目录测试至少覆盖默认、KODAX_HOME、KODAX_PROFILE_DIR、两者同时设定、test override 和 Session 根的 realpath 别名。[依据上表；U `src/runtime-daemon/state.ts:205-221,846-918`]

## 2. 模式切换与 legacy owner：这是硬不兼容，不是可保留的回滚按钮

- S 的设置 schema 仍允许 `daemon|embedded`；main 启动把 embedded 映射到 adapter legacy，legacy 初始化调用 `acquireInline({enableRollback:true})`；模式切换还包含 acquire/release inline fence、enableDaemon 和补偿恢复。[S `packages/space-ipc-schema/src/channels/settings.ts:35-36,76,233`; S `apps/desktop/electron/main.ts:2243-2247`; S `apps/desktop/electron/kodax/runtime-host-adapter.ts:2766-2792,7869-8030`]
- U 的公开 bundle 和 DTS 均来自 `sdk-runtime-public.ts`；它保留 ensure/connect、daemon-only create 和只读 getOwnerState，**没有公开** `acquireKodaXInlineOwner`、`enableKodaXDaemonOwner`、`RuntimeInlineOwnerHandle`。S adapter 仍导入/调用这些名字，不能靠动态 import 隐藏不兼容。[U `scripts/build-bundle.mjs:473`; U `scripts/build-dts.mjs:95`; U `src/sdk-runtime-public.ts:1-28,30-220`; S `apps/desktop/electron/kodax/runtime-host-adapter.ts:5-24,1791-1803`]
- U 的 `createKodaXRuntime` 要求显式 `mode:'daemon'`，拒绝 `sharedDaemonHost`、`daemonHostRuntimeId`、`externalAgents` 等 Host 装配输入；未给 mode 的历史 embedded 默认已退休。[U `src/sdk-runtime.ts:888-933,4140-4153`]
- U cutover 在核对 profile/storage owner 及进程身份后写 unified policy；unified 后拒绝 inline owner 和 legacy policy 写回。仍活着、不可核实或模糊的旧 owner 不会被迁移强夺。[U `src/runtime-daemon/state.ts:311-380,383-425`]
- U 有执行历史 owner 源码验证 cutover 后无法恢复 inline 的测试，以及真实历史 alpha.11 tarball 升级测试；它们是上游验收资产，不是 Space embedded 模式仍可使用的证明。[U `tests/runtime-owner-historical.test.mjs:12-34`; U `tests/unified-runtime-release.test.mjs:17`; U `tests/bundled-historical-host-upgrade.test.mjs:13-33`]
- **旧 Space Main 还可能是未进入 Runtime owner fence 的写者**：Partner 的现有路径直接 `sdk.runManagedTask`，从默认 `createSessionManager()` 取 storage 后传给 session；独立 coding/session SDK 仍公开这些 API。因此“旧 daemon 已停、owner-policy已unified”不能证明旧 Space Partner Main/其 managed children 已退出，也不能把这类旧进程等同于被cutover测试覆盖的inline Runtime owner。[S `apps/desktop/electron/kodax/real-session.ts:2435,2645-2646,2671-2694`; S `apps/desktop/electron/kodax/session-store.ts:127-150`; U `src/sdk-coding.ts:28`; U `src/sdk-session.ts:90-112`; U `src/runtime-daemon/state.ts:333-374`]

**建议（未接受）**：迁移 S 历史 `embedded` preference 到统一 Host，撤下对外模式切换和 owner 写入补偿；历史 inline owner 仍活着时明确提示关闭旧实例/完成旧工作后重试，让 SDK 的 cutover 做决定。应用版本回退应是兼容性决策，不应尝试把 unified policy 改回 inline；禁止删除 owner-policy/lock 来“解锁”。需改的生命周期责任文件是 `runtime-host-adapter.ts`、`main.ts`、`ipc/settings.ts`、settings schema/store 及相关模式测试。[依据本节及 S `apps/desktop/electron/ipc/settings.ts:114-123`]

**升级前置（P0 建议，未接受）**：首次启用共享 Session 根的统一 Host 前，必须完成旧 Space Main 的真实退出和本地 Partner/managed-child 工作结算，并迁走新版本的该私有写入路径；不能只 stop 旧 daemon、删 lock 或观察 policy 就宣布迁移完成。验收需保留旧 Partner 运行/排队/工具子进程的对照场景，证明新 Host未与旧无fence writer并存。如何可靠发现/阻止已在别的安装目录运行的旧无fence Space，是仍需上下游接受的迁移边界，不应假设SDK能识别未注册的写者。[依据上段；S `apps/desktop/electron/main.ts:1693-1739,2779-2828`]

## 3. 关窗、托盘重开、多窗口、多 Client

- Windows 托盘仅在 win32 且未禁用时存在；可用托盘下关主窗会实际 close BrowserWindow，但不 dispose adapter；点击/双击托盘重新 show/create 主窗。没有托盘的非 macOS 平台走完整退出，macOS 最后窗口关闭不自动 app.quit，并通过 activate 重建窗口。[S `apps/desktop/electron/main.ts:389-391,690-706,1189-1228,1246-1274,1498-1508,2024-2054,2206-2213,2689-2693`]
- Space 同一 Electron userData 只保留一个 app main：第二实例直接 quit，首实例响应 second-instance 激活已有主窗。Renderer/artifact 窗口数量不能直接当 Host Client 数量；当前 Runtime adapter 是主进程 singleton。[S `apps/desktop/electron/main.ts:2075-2093`; S `apps/desktop/electron/kodax/runtime-host-adapter.ts:8193-8196`]
- Space 的持久身份将 clientId、instanceId 与独立 secret account 分离；accepted exit 后轮换新 instance/secret 并保存上个 requestId/runtimeId/profile 供恢复。托盘关窗不经过这个 exit retirement，主进程重建 Renderer 可以继续原连接。[S `apps/desktop/electron/kodax/runtime/runtime-client-identity.ts:154-205,208-257`; S `apps/desktop/electron/main.ts:1189-1228,1246-1258`; S `apps/desktop/electron/kodax/runtime-host-adapter.ts:7774-7784`]
- U 的新 interactive Host 默认为最后 logical client 断开且 governed work/background work 持续 idle 30 秒后退出；显式 persistent/服务 retention 可保留。关 UI 不等于断开 client；崩溃断开也不等于立即终止还在运行的任务。[U `src/sdk-runtime.ts:905-912,6413-6419`; U `src/runtime-daemon/management.ts:76-120,257-356`]
- U management 在 stop 时重新核对其他 principal 与活动工作，并拒绝 draining 中的新 attach；不是只相信 Space UI 预检快照。[U `src/runtime-daemon/management.ts:92-105,189-198,230-242`]

**建议（未接受）**：保留主进程级一个 product Client 和已有单实例/托盘行为。多 Renderer 的观察订阅独立回收，但不能每个窗口 ensure 一个执行 owner；“关闭窗口”“退出当前 Space”“停止共享 Host”分别验证。普通退出有 peer 时可完成个人 cleanup 并保留 Host，安装器则需要独立、严格的 Host 关闭证据。[依据本节和第 5 节]

## 4. Stop、崩溃和 receipt recovery：已存在可复用正路

- S session Stop 有 Run/Session 身份核对和 receipt 映射；force close 避免对 shared Coder Session 做 Session-wide cancel，改用 SDK 的个人 cleanup；退出时 `disposeAll({detachRuntimeRuns:true})`，防止 detach 误取消其他 Client 的同 Session 工作。[S `apps/desktop/electron/kodax/runtime-host-adapter.ts:6818-6879,6940-6972`; S `apps/desktop/electron/main.ts:1693-1739,2803-2807`]
- S 的真实主退出实现已经是 `lifecycle.requestExit({requestId,shutdownHost:true})`，轮询 `readExit`，传输中断时用 `readKodaXClientExits` 离线读取，并核对 requestId/runtimeId/clientId；`stopForInline` 只残留在 adapter 注释，不能把注释当当前实现。[S `apps/desktop/electron/kodax/runtime/runtime-client-exit.ts:131-211`; S `apps/desktop/electron/kodax/runtime-host-adapter.ts:7713-7735`]
- S 对 accepted receipt 调 `retireInstance` 保留恢复身份；启动时先 resume pending exit，再 reconcile owner policy/准备 SDK。原退出若可验证完成，就结束原 quit；仍 blocked 则阻止 competing startup；relaunch 注册失败时保留可见 fail-closed 窗口。[S `apps/desktop/electron/kodax/runtime-host-adapter.ts:7753-7818`; S `apps/desktop/electron/main.ts:1381-1457,2258-2285,2344-2373`]
- U receipt requestId 带固定 shutdown intent，重放不接受更换 intent；退出 principal 不再 admit 新工作，cleanup 后再请求 management stop；其他 Client/工作冲突会写 `host.state='protected'`。恢复验证区分当前 owner 活着、owner 身份不匹配、shutdown/containment 证据和 replacement owner，旧 receipt 不会驱动替代 owner 的工作。[U `src/runtime-daemon/client-lifecycle.ts:47-81,125-165,181-225`]
- S main 对 app.quit/Cmd+Q/末窗关闭使用统一 before-quit gate，等待 startup settle 后清理；watchdog 区分 force 和安全 stop，未确认时安排 recovery relaunch，安装失败也走恢复，不直接当正常退出成功。[S `apps/desktop/electron/main.ts:2735-2765,2779-2865,2869-2909`]

**建议（未接受）**：迁移保留 receipt 原件、稳定恢复身份、旧/新 Runtime 身份核对与 visible recovery。删除 legacy owner 迁移分支时不要把主退出退化成 `runtime.close()` 或 kill PID；close 只是连接释放。实际 crash、OS 强制结束、客户端退出与停止 Host 的结果仍须由 SDK receipt/shutdown verifier 区分。[依据本节；U `src/runtime-daemon/client-lifecycle.ts:47-81,140-162`]

## 5. 安装器门禁竞态：已用纯 seam 运行复现逻辑，不启动 Host

### 现有设计和漏洞链

1. Updater 禁止自动下载/quit 自动安装和 downgrade；安装只在明确请求后调用 `requestInstall`，真实 installer 是 `quitAndInstall(true,true)`。[S `apps/desktop/electron/ipc/updater.ts:90-105,230-278`]
2. S main 预检有 peer/active work 时，安装请求不能落入 preserve-runtime/force-exit；这条设计正确，但该预检早于异步退出 settlement。[S `apps/desktop/electron/main.ts:1782-1801,1818-1829`]
3. `projectClientExitReceipt` 为普通退出把 `cleanup=succeeded + host=protected`（包括 recovery=`blocked/host_protected`）投影为 `status='clean'`，并仍保留 receipt 原件。这是**个人退出成功**，不是 Host shutdown 成功。[S `apps/desktop/electron/kodax/runtime/runtime-client-exit.ts:77-114`; U `src/runtime-daemon/client-lifecycle.ts:60-67,155-162`]
4. `stopDaemonWithRuntimeExitSettlement` 只排除 projected `blocked` 后返回 void；main 的 admitted-exit commit 无条件把 `daemonStopConfirmedBeforeQuit=true`，最终 installer gate 只看此 flag 和本地 cleanup/force/recovery flags。因此预检后 peer 加入，使 Host stop 被 protected 时，flag 不再代表其名字声称的事实。[S `apps/desktop/electron/kodax/runtime-host-adapter.ts:7822-7866`; S `apps/desktop/electron/main.ts:1872-1888,2890-2898`]

### 本次运行证据（2026-10-31，exit code 0）

为避免 Electron/真实 profile/Host 副作用，探针用已有 `node --import tsx --input-type=module` 从 stdin 执行：直接 import 两个纯模块；用 TypeScript AST 从固定 S 文件抽取**实际** `stopDaemonWithRuntimeExitSettlement` 方法体、`requestUpdateInstallation` 函数、main admitted commitExit callback、最终 installer if 表达式；在 `node:vm` 中只注入 fake Runtime/receipt/close/app.quit，组合实际 `settleRuntimeClientExit` 与 `runAdmittedCompleteExit`。没有 import main 或 adapter 整模块、没有创建 profile、没有 fake PID kill、没有实际调用 installer。抽取实现和 seam 来源为上节引用源码。

输入：预检 `spaceBlockers=[]/runtimeBlockers=[]`；之后注入的 accepted receipt 为下面结果中的 laterReceipt，cleanup arrays 及 issues 均为空，requestId/clientId/runtimeId 固定为 probe 字符串，owner PID 123 仅作为数据，未查询该进程。断言 projected clean、update request accepted、final installer condition true 均通过。

```json
{
  "probe": "frozen-space-7801-source-pure-seams",
  "realHostStarted": false,
  "profileRead": false,
  "preflightDisposition": "stop-runtime-and-exit",
  "laterReceipt": {
    "cleanup": "succeeded",
    "host": "protected",
    "recovery": "host_protected"
  },
  "projected": "clean",
  "daemonStopConfirmedBeforeQuit": true,
  "requestUpdateInstallationAccepted": true,
  "finalInstallerBoolean": true,
  "actualInstallerRun": false
}
```

边界：该运行证明 **Space 源码的组合逻辑接受 protected receipt**。真实 peer 接入/新 run 的 TOCTOU 时序、真实 installer 的文件替换结果和跨 OS 文件占用尚未运行复现，不能把该探针称为实际安装攻击/全链路 E2E。[本次纯 seam 执行输出；S 实现来源见上节]

现有 `update-safe-exit.spec.ts` 在安装 invoke **之前**建立 peer 或 active task，验证安装阻塞；它未注入“预检后才 protected”的分支。另 adapter 的现有 test 明确让 force personal cleanup 和后续 stopDaemonForCompleteExit 共享一份 protected receipt，说明普通关闭需求与安装需求需要不同验收条件。[S `tests/e2e/update-safe-exit.spec.ts:74-135`; S `apps/desktop/electron/test/runtime-host-adapter.test.ts:5055-5094`; S `apps/desktop/electron/kodax/runtime/runtime-client-exit.test.ts:80-94`]

**建议（P0，未接受）**：让 adapter 返回可核对的 exit receipt/Host 结果。普通退出可接受 personal cleanup succeeded 且 Host protected；安装必须额外确认 SDK 所认定的 Host shutdown 成功/恢复验证完成，不能把 projected `clean/recovered` 或普通窗口关闭当 Host 停止。必须保留 requestId/runtimeId/owner 身份证据，拒绝 protected、not_requested、pending、unknown，新增预检后 peer/工作出现的可注入回归及 packaged E2E。仅加一次 inspect 不足以消除时序窗口，应依赖 SDK mutation/recovery 后的权威结果。[依据本节；S `scripts/smoke-pack.mjs:1565-1584` 已有同时检查 personal cleanup 和 host success 的更严格探针范式]

**仍需上游决定的安装窗口**：确认原 Host退出不等于安装目录在随后替换期间没有新Host。f6 ensure的storage startup gate在认证完成后finally释放，Host close在清理后释放owner；离线receipt可把“原owner已退出、replacement running”视为原退出恢复成功。因此安装器还须明确“旧owner退出后、文件替换前，禁止/协调peer启动同安装的replacement”的契约；不能直接把一个历史receipt的host succeeded视作所有共享执行都已终止。本次只据源码识别该边界，未复现真实replacement/安装竞争；不建议下游私自长期持有SDK私有lock或恢复inline owner来代替接受的安装协议。[U `src/sdk-runtime.ts:5897-5917`; U `src/runtime-daemon/host.ts:239-251`; U `src/runtime-daemon/state.ts:934-954`; U `src/runtime-daemon/client-lifecycle.ts:69-81`]

## 6. SDK build 替换、旧构建和 rollback

- U identity 包含 `build.origin/fingerprint`；fingerprint 按实际 runtime 代码/资产内容哈希，排除测试、文档、声明和 build reports；模块加载时冻结本构建身份，后续重新读盘可发现 installation 已被替换。[U `src/runtime-build-identity.ts:11-27,58-102`; U `src/sdk-runtime.ts:819-827`]
- ensure 可以升级可证明较旧的 Host；相同 SemVer、相同 installation origin、不同 fingerprint 也可 refresh。另一路 installation、缺 build identity、未知版本顺序不能悄悄替换；较新 Host 不被旧客户端 downgrade。旧 launcher 自己磁盘已被替换时会失败，要求重启调用进程。[U `src/sdk-runtime.ts:6090-6145,6234-6275,6640-6666`]
- refresh 先 authenticated management.inspect，确认 `canStop` 和 exact owner pid/start identity/storage fence，再请求正常 runtime.shutdown，等待旧 owner 退出后重试；busy Host保留工作且返回阻塞。inspect 被 peer 打断可重试，模糊 shutdown 不盲目重放。[U `src/sdk-runtime.ts:6216-6302,6684-6700`; U `src/sdk-runtime-daemon-upgrade.test.ts:556-572,859-900,928-954,1076-1089`（测试来源，未本次执行）]
- S pack/lock 当前要求精确 SDK 版本和 tarball integrity；root/desktop/lock/installed 必须一致，安装内容逐项与 tarball 比对且拒绝未知新增条目。正式发布拒绝本地 tarball，只有显式 test flag 允许。[S `scripts/kodax-runtime-release-gate.mjs:125-164,230-335`; S `scripts/pack.mjs:82-95,120-133`]
- 当前 root/desktop 均 pin `0.7.97-alpha.11`，lock integrity 是固定历史 tarball；U f6 package version 同样写 alpha.11，**仅版本字符串相同不足以证明已安装统一 Host 字节或 npm 已发布**。[S `package.json:59`; S `apps/desktop/package.json:16`; S `package-lock.json:2153-2156`; U `package.json:3`; U `tests/bundled-historical-host-upgrade.test.mjs:13-26`]
- 父级在2026-10-31执行一手 Registry 只读查询 `npm view @kodax-ai/kodax dist-tags --json`（exit 0），返回 `latest=0.7.96`、`alpha=0.7.97-alpha.11`、`hotfix=0.7.72-hotfix.0`；这是查询时tag元数据，未下载全版本/远端tarball字节。f6迁移文档也明确统一Host是未发布变更，不能把本地相同alpha.11版本字符串当新发布产物。[父级共享的一手npm Registry查询结果；U `docs/SDK_MIGRATION.md:3-19`; 交叉记录 S `docs/research/unified-host-sdk-upstream-contract-2026-10-31.md:45`]

**建议（未接受）**：上游先冻结接受的统一 Host + 所需后续修复、给出新可追溯 artifact 版本/integrity；下游同步两个 manifests 和 lock 后做独立 tarball 验证。测试同版本 rebuild、旧 launcher 在盘上被替换、不同安装来源、旧 Host 忙/闲、较新 Host、缺 build identity。回退包不能自动恢复 inline；需要明确哪些旧版本仍能 passive attach，哪些只给兼容性阻塞。[依据本节和第 2 节]

## 7. Electron fork、ASAR、原生和扩展

| 现状及约束 | 责任/验收含义 | 固定来源 |
| --- | --- | --- |
| Space main/preload bundle 是 CJS；SDK ESM-only subpaths external，注释要求动态 import；显式 external 清单有 runtime 等但未逐项列 client。 | 审核新 product Client import 是否仍为 runtime 动态 ESM import，检查真实 bundle/metafile 与 packaged import，不依据源码 import 类型推断。是否需新增 client external 必须由构建输出证明。 | S `scripts/build-main.mjs:36-43,54-95` |
| U detached Host 由 `process.execPath` 启动 CLI，args 包含 daemon serve/profile/home/config-home/session-dir；公开 dist 必须外置且 CLI entry 物理可解析。 | 不能把整个 SDK 内联进 main 改坏其相对 dist/worker 发现；打包必须保留 kodax_cli 和 chunks/resources。 | U `src/runtime-daemon/process.ts:834-868,871-919,1026-1034`; U `src/runtime-build-identity.ts:11-21`; S `scripts/smoke-pack.mjs:850-860` |
| U 内部 Electron child launch 在 OS exec 时设置 ELECTRON_RUN_AS_NODE，并加 --import scrub；应用代码加载前移除此变量。daemon env 先清除继承值，hardening 永远消费该 bootstrap switch。 | RunAsNode fuse 必须保留；不能把变量常驻传给工具或启动其他 Electron app。真实 Electron 子进程路径要验证，普通 node 通过不等于 packaged 通过。 | U `packages/agent/src/runtime/process-hardening.ts:30-42,69-99`; U `src/runtime-daemon/process.ts:803-813,877-887,1037-1056` |
| U Windows Host 由 Job supervisor containment 启动，非 Windows 用 detached process；U manager 在 Windows 验证 containment，拒绝未核实 Host 发布。 | Windows 需要 exact process identity/Job/崩溃/receipt recovery；macOS/Linux 要单独验证进程退出与后台保留，不复制 Windows PID kill 方案。 | U `src/runtime-daemon/process.ts:898-937`; U `src/runtime-daemon/manager.ts:72-88`; U `src/runtime-daemon/windows-job-supervisor.ts:365-434,512-554` |
| Space 将 SDK dist/native 整体 asarUnpack；afterPack 还修复非 Windows 平台被裁剪的 Windows exe/dll，保持完整 manifest 对应资产。 | 统一 Host 不能把 `.node`、manifest、sandbox exe 分散到不一致路径；目标平台和架构应逐一检查 hash/执行。 | S `electron-builder.yml:201-223`; S `scripts/after-pack.cjs:1-13,57-108`; S `scripts/smoke-pack.mjs:108-113,384-411` |
| ASRT 被排除出 app.asar，作为完整物理 extraResources 链部署；artifact workers、SDK package scope 和依赖也解包；node-pty 使用目标平台物理资源。 | 仅能 import 不足以证明 Host shell/worker/Artifact/terminal可执行；必须运行有物理路径要求的脚本和 native probe。 | S `electron-builder.yml:49-54,133-199,201-220`; S `scripts/smoke-pack.mjs:488-507,1252-1292` |
| Space builtin skills 和 artifact 扩展按真实安装路径注册到 SDK split-config CAS，随后从 Host catalog 验证激活；Space builtins 在 extraResources，避免 shell/Python/Node 脚本落入 ASAR。 | 更新/不同安装路径可能留下旧绝对路径，需验证新 Host 实际 catalog 来自新安装；不能只检查文件被复制。 | S `apps/desktop/electron/skill/space-builtins.ts:23-76,116`; S `electron-builder.yml:126-132` |

**建议（未接受）**：保持 SDK-owned spawn/RunAsNode scrub/Job authority 和现有物理资源布局。新增统一 Host 验收按“Electron app → SDK dist → Host → shell/native/worker/扩展”实跑，每层记录 executable、SDK version/build、实际 profile、receipt owner。扩展路径随升级变化的旧 entry 清理/停用策略尚需决策；不要在本次研究中直接改用户扩展配置。[依据本节]

## 8. Pack、dev-link 和 release gate 的直接阻塞

- `link-kodax.mjs` 创建 Space staging，package exports优先借用 SDK manifest，dist/node_modules/scripts 指向相邻 SDK；dev-link 可以反映本地重建，但不是 release artifact。pack 识别 root link 和 staging 的子 link，临时恢复精确 lock 包，再恢复开发链。[S `scripts/link-kodax.mjs:72-133`; S `scripts/kodax-dev-link-state.mjs:20-30,66-101`; S `scripts/pack.mjs:131-195`]
- pack 的烟测会运行 `smoke-pack.mjs`；Windows还运行 boot/complete-exit packaged smoke。该脚本目前 generated probe 静态 import `enableKodaXDaemonOwner`，并 `createKodaXRuntime({homeDir,sessionsDir,...})` 不给 mode，最终要求 `mode=embedded/isolation=inline`；统一 Host 下分别会遇到未导出符号和明确迁移错误/旧断言。[S `scripts/pack.mjs:98-103`; S `scripts/smoke-pack.mjs:1275-1281,1603-1607,1707-1711,1943-1946`; U `src/sdk-runtime-public.ts:1-28`; U `src/sdk-runtime.ts:4140-4153`]
- release unit/warmup 也有旧 private owner fixtures：fresh-session不传mode；interactions、permission-authority、session-admission传sharedDaemonHost；Windows native warmup在本进程 register provider 后 private create。这些不是换一个 mode 字符串就能保证等价，Host进程需要可重现的配置/本地HTTP provider，清理也需要 receipt。[S `scripts/test/kodax-fresh-session.test.mjs:10-24`; S `scripts/test/kodax-interactions.test.mjs:22-30`; S `scripts/test/kodax-permission-authority.test.mjs:52-57`; S `scripts/test/kodax-session-admission.test.mjs:84-87`; S `scripts/test/warm-kodax-native-artifacts.mjs:17-19,39-77`; U `src/sdk-runtime.ts:4148-4153`]
- npm test:release会先 warmup再跑script测试；typecheck和正常build也在正式发布链，不能只让 renderer运行。release CI 有 win/mac-x64/mac-arm64/linux build、同candidate checksum归档/acceptance/发布核对；packaged acceptance列出的spec没有 `update-safe-exit.spec.ts`，独立真实NSIS升级脚本存在但不是该枚举的组成部分。[S `package.json:38-50`; S `.github/workflows/release.yml:68-90,153-171,200-216,232-269,287-334`; S `e2e/auto-update-packaged.mjs:191-216,253-300`]
- shared-host E2E fixture支持在 packaged SDK路径或指定SDK目录上启动客户端，但 cleanup旧写死default profile，update-safe-exit的daemon路径写死coder。统一Host跨profile重定向时这些fixture必须以实际owner身份清理和断言。[S `tests/e2e/shared-host-fixture.ts:84-117,151-170`; S `tests/e2e/update-safe-exit.spec.ts:86-96`; U `src/sdk-runtime.ts:6429-6444`]

**建议（未接受）**：先改可运行性 gate，再做依赖升级和发布。将 private fixtures迁移到 isolated config/session根 + public ensure Client/Runtime + local provider/toolInvocation + receipt cleanup；删除embedded/owner写回探针，替换为single Host/双Client/实际profile与历史cutover断言。dev-link冒烟、local tarball预发布和Registry正式包分别记证据，不混称“已发布集成”。[依据本节]

## 9. 必须先做的责任切片（方案，未接受）

| 优先级/归属 | 具体责任文件 | 应完成的最小结果 | 依据 |
| --- | --- | --- | --- |
| P0 下游：安装证据 | S `runtime/runtime-client-exit.ts`、`runtime-host-adapter.ts`、`main.ts`、`ipc/updater.ts` | 分离个人退出成功与Host shutdown成功；安装器使用mutation后权威receipt；加入protected-after-preflight回归。 | 第5节已复现纯组合逻辑 |
| P0 下游：退休模式 | S settings schema/store、`ipc/settings.ts`、`main.ts`、`runtime-host-adapter.ts` | 历史embedded preference兼容迁移；删除inline owner写入/获取及回滚UI入口；SDK处理旧owner cutover。 | 第2节固定不兼容 |
| P0 上下游：旧Main迁移前置 | S `real-session.ts`、`session-store.ts`、`main.ts`与Partner迁移；U legacy迁移验收 | 旧Space Main/Partner/managed children结算退出；新版本不再直接私有写同Session根；不能只停止daemon后迁移。 | 第2节旧无fence写者路径 |
| P0 上游：固定可发布契约 | U `package.json`、`sdk-runtime-public.ts`、`sdk-client.ts`、build/dts/发布契约测试 | 冻结接受提交和实际tarball，明确W中哪些后续变更成为新接受基线；提供public入口/identity/exit/升级测试证据。不是要求重新开放inline API。 | 第1/2/6节；W非接受契约 |
| P0 上下游：安装维护窗口 | U startup/lifecycle公开契约与S installer gate | 明确原Host退出后到文件替换期间peer重新ensure的协调边界；replacement-running的旧receipt恢复成功不能直接授权覆盖其仍在使用的安装目录。 | 第5节源码边界，真实竞态未验证 |
| P0 下游：真实artifact依赖 | S 两个package.json、package-lock、`kodax-runtime-release-gate.mjs` | 新版本/integrity/physical包一致；禁止带dev staging发布；不可用same semver字符串代替字节证据。 | 第6/8节 |
| P0 下游：解除旧测试阻塞 | S `smoke-pack.mjs`、`scripts/test/kodax-*.test.mjs`、`warm-kodax-native-artifacts.mjs` | 使用public统一Host，确保shutdown receipt清理，移除embedded/owner-restoration断言。 | 第8节 |
| P1 下游：actual identity | S `runtime-daemon-control.ts`、`runtime-host-adapter.ts`恢复fallback、`shared-host-fixture.ts`、update/exit测试 | 诊断、停止、恢复按返回profile/runtimeId/receipt身份；不猜coder/default。 | 第1/8节 |
| P1 上下游：packaged环境 | U process-hardening/process/Job tests；S builder/after-pack/smoke | Windows/macOS双arch/Linux逐层验证Host spawn、RunAsNode scrub、native/worker/扩展路径与crash recovery。 | 第7节 |
| P1 下游：发布覆盖 | S `.github/workflows/release.yml`、packaged update/exit tests | 把安全升级/TOCTOU与真实candidate关联；checksum通过不替代生命周期语义。 | 第5/8节 |

这不是重做现有 Host 的理由：S 的 initialize single-flight、startup/shutdown协调、真实receipt恢复、普通peer-preserving退出、锁定包字节检查和候选checksum链可复用；需要移除的是退休owner契约及将个人退出误当Host停止的路径。[S `runtime-host-adapter.ts:2436-2459,7753-7866`; S `main.ts:2779-2785`; S `scripts/kodax-runtime-release-gate.mjs:125-164,230-335`; S `.github/workflows/release.yml:153-171,325-334`（本段两个短文件名仍指 `apps/desktop/electron/kodax/runtime-host-adapter.ts` / `apps/desktop/electron/main.ts`）]

## 10. 建议回归矩阵（本次除纯探针外未运行）

| 场景 | 必须断言的产品结果 | 层级/复用来源 |
| --- | --- | --- |
| 默认目录、独立KODAX_HOME/profile/test override及Session realpath别名 | config/session/identity/Chromium隔离正确；同真实Session根只有一个writer。 | unit + isolated双进程；S data-paths；U state:846-918 |
| Space/CLI两个ensure并发，requested coder vs existing default | 返回同Host runtimeId和实际profile；一方升级不抢占另一方工作；取消受原deadline约束。 | U sdk-runtime-daemon-upgrade.test:284-556；S shared-host fixture |
| 历史embedded设置、旧inline活着/崩溃/不可核实 | 自动迁移偏好但不偷活owner；SDK阻塞/重试清晰；unified不再inline写回。 | U state.cutover.test:126-167、runtime-owner-historical；S模式测试 |
| 旧Space Partner Main及其managed children仍活着，旧daemon已退出 | 新Host不与旧私有Session writer并存；需要真实Main/children结算前置，不能以owner lock为空作为充分条件。 | S real-session:2435,2645-2694、session-store:127-150；第2节迁移边界 |
| Windows关窗到托盘后重开，macOS关窗activate，Linux无tray | Host连接/工作不因窗口detach误cancel；需完整退出时有可达控制面；重开显示重新观察的当前状态。 | S main/window policy tests；各平台packaged |
| 同profile第二Space实例、多个Renderer、不同Client同Session | 单main不重复启动；观察释放不终止peer run；Client统计基于SDK逻辑身份。 | S main:2075-2093；U management；S shared-host-history-recovery |
| Host/Renderer/main各自崩溃，startup时立即退出 | 不发布close后的ready；不因断线重复输入；恢复旧receipt前不启动竞争Host；保留真实outcome。 | S adapter:2514-2521,2795-2899；S startup boundary；U client lifecycle |
| Session Stop、个人force exit、peer active run/queued input/permission/actor/workflow | Stop receipt按目标身份；个人退出只清本Client；peer任务保留；pending/unknown不能伪装确认。 | S adapter exact Stop；S runtime-client-exit tests；U sdk-client.exit tests |
| 普通退出peer present | personal cleanup succeeded即可退出，host protected仍诚实保留原receipt。 | S runtime-client-exit.test:80-94；S adapter test:5055-5094 |
| 安装前peer/active task；**预检后peer/active work才出现** | updater不运行installer；当前Space保持/恢复可达；personal clean不能置Host stop confirmed。 | 本次纯seam复现；扩展S update-safe-exit.spec:74-135 |
| 原Host退出后、installer开始前peer ensure同安装replacement | 安装维护窗口有明确协调/阻塞结果；不能用原Host成功receipt覆盖仍在使用的同安装文件。 | 第5节源码边界；需要新接受契约和集成测试 |
| Host已停但cleanup unknown、receipt丢失/身份变、replacement running | 由SDK新鲜recovery assessment决定；旧receipt不作用于新owner；安装只在严格证据满足时运行。 | U client-lifecycle:47-81,140-162；S receipt projector tests |
| 磁盘同版本rebuild、不同origin、旧launcher、较新/忙/无build Host | 重启/兼容阻塞明确；不静默downgrade/kill/bypass；旧工作与历史保留。 | U runtime-build-identity tests、sdk-runtime-daemon-upgrade tests、historical host tarball |
| Win NSIS/portable、mac x64/arm64 DMG+ZIP、Linux AppImage/deb | 实际packaged Host/worker/native/shell/扩展可运行；RunAsNode不泄漏；退出无孤儿；安装先验证Host shutdown。 | S electron-builder、smoke-pack、release matrix；真实升级单独隔离安装 |
| dev staging→local tarball→Registry包→candidate→自动更新→兼容回退 | 每阶段版本/integrity/fingerprint/candidate一致；不得使用旧out产物或dev-link冒充；回退尊重unified fence。 | S pack/release gate/release-candidate；U state/build identity |

## 未证实与未解问题

- **未证实**：全部无tag npm版本与远端tarball字节，以及四个平台的本次CI/安装器/真实Host运行结果。本agent未单独查Registry；父级已用第一方 `npm view ... dist-tags --json` 确认当前tag元数据（见第6节），未下载/比对全版本与tarball，不能扩大为所有远端版本字节的发布证明；本次未build或全测试。[证据边界见开头、第6节；S `package-lock.json:2153-2156`]
- **未证实**：第5节竞态在真实NSIS/macOS/Linux installer下的发生概率、文件占用和最终替换行为。已复现的是源码实际函数体组合逻辑接受protected结果，不能扩大成已真实安装替换。[第5节探针边界]
- **未证实**：新SDK Client动态import是否被当前esbuild配置完整external；应由新artifact build输出与ASAR实跑确认，本文只列源码清单，不断言当前一定会打包进main。[S `scripts/build-main.mjs:75-95`]
- **未解**：统一Host跨安装来源时，Space希望何时passive attach、何时要求退出旧安装；SDK已提供拒绝隐式替换和被动连接边界，但产品提示/升级引导仍需接受决策。[U `src/sdk-runtime.ts:5870-5879,6124-6145`]
- **未解**：Windows托盘保留、macOS无窗口保留、明确persistent/A2A Host的产品生命周期文案与设置怎样呈现；不能用删除embedded选项顺便改掉这些已存在行为。[S main生命周期引用；U management:76-120]
- **未解**：Space安装目录改变后，已写入用户extensions integration的旧builtin绝对路径如何保留、替换或停用；必须避免误删用户手工扩展。[S `apps/desktop/electron/skill/space-builtins.ts:31-53`]
- **未解**：原Host shutdown完成到installer覆盖文件之间，SDK/Space如何协调其他launcher重新ensure同安装Host；f6的startup gate只覆盖ensure，receipt recovery也允许replacement running，不提供本文可确认的安装事务保证。[U `src/sdk-runtime.ts:5897-5917`; U `src/runtime-daemon/client-lifecycle.ts:69-81`]
- **未解**：上游W的执行profile/Windows cleanup等后续改动最终哪些接受并发布；须在新冻结提交上重新核对，不把本笔记的f6接受边界扩展到W。[本次git status/diff范围]
- **未解**：如何在跨安装目录/版本的旧Space Main未注册Runtime fence时保证迁移前不存在Partner私有写者；当前owner-policy/daemon receipt只证明其管理范围，未覆盖任意仍可使用独立SDK的旧进程。[S `real-session.ts:2671-2694`、`session-store.ts:127-150`（均在 `apps/desktop/electron/kodax/`）；U `src/runtime-daemon/state.ts:333-374`]

