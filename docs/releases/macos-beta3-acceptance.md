# macOS beta.3 双架构专项验收

2026-11-08。状态：第五轮双架构 macOS 成品专项全部首次通过，完整源码 build / CI 门禁全部成功。

## 冻结范围

- Space `0.1.47-alpha.4`，Registry SDK `@kodax-ai/kodax@0.7.97-beta.3`，Node `22.23.1`、Electron `42.5.0`。
- 最新冻结在 `0d34eb08db26ab8ee4d81a4eb3908ec08734842b`，包含外部 SDK 连接探针、
  历史浏览单测、启动/重载观测和 Workflow 首次历史读取夹具修正。各轮安装包产品代码相同。
- 本轮从 `3342eb9f` 起只修改验收工作流、测试和文档，没有修改 Space 产品运行时代码。
  不使用本地 SDK 源码替换 Registry 包，不发布 tag 或替换公开 Release。
- [执行指南](../test-guides/FEATURE_010_v0.1.47-alpha.4_TEST_GUIDE.md)记录可复跑命令和原生桌面验收边界。

## 最终 macOS 结果

[第五轮](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42461374638)在同一提交 `0d34eb08` 完成：

| 架构          | 实际系统              | Node 专项       | 成品 E2E            | Playwright 重试 / 跳过 |
| ------------- | --------------------- | --------------- | ------------------- | ---------------------- |
| Apple Silicon | macOS 15.8.2 / 24H232 | 73 通过，0 失败 | 55 首次通过，0 失败 | 0 / 0                  |
| Intel         | macOS 15.7.9 / 24G830 | 73 通过，0 失败 | 55 首次通过，0 失败 | 0 / 0                  |

已逐项核对 110 个成品结果均只有一次成功执行，均为 `app.isPackaged:true`、Space `0.1.47-alpha.4`、
Electron `42.5.0`，SDK 安装包和运行中 Host 均为 `0.7.97-beta.3`。
两侧真实 `.app`、DMG、ZIP 均构建成功，`codesign --verify --deep --strict` 通过，签名分别为
Mach-O thin arm64/x86_64、ad-hoc；不是 Developer ID 或公证。没有修改产品运行时代码或 SDK。

最终原始证据：ARM [13610043918](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42461374638/artifacts/13610043918)、
Intel [13610825241](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42461374638/artifacts/13610825241)。
验收 DMG：ARM [13610123496](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42461374638/artifacts/13610123496)、
Intel [13610815251](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42461374638/artifacts/13610815251)，保留 14 天。
逐项结果、各轮失败、Host 能力、系统版本和 DMG/ZIP SHA-256 存于[机器证据](macos-beta3-acceptance.json)。

同一提交的 [build](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42461363796) 7/7 成功，
[CI](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42461363894) 6/6 成功。
完整 E2E：Windows 186 首次通过、14 条件跳过；Linux 193 首次通过、7 条件跳过，均无失败或重试。
两种 macOS 的完整源码 Node 报告各为 4721 项（4686 通过、35 条件跳过、0 失败），均明确包含
凭据无 OS vault 依赖及历史双向滚动用例通过。不与有重叠的 73 项专项叠加。

## GitHub 原始结果

[首轮](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42450419287)两种架构均为
73 项 Node 测试通过、52 个成品场景中 49 通过、3 失败；无重试或跳过。失败记录保留，不能算绿。

[修正后专项](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42451905135)增加原子 token
撤销快捷键和窗口节流检查，共 55 个成品场景，仍关闭自动重试。

| 架构          | 实际系统              | Node 专项       | 成品 E2E            | 重试 / 跳过 |
| ------------- | --------------------- | --------------- | ------------------- | ----------- |
| Apple Silicon | macOS 15.8.2 / 24H232 | 73 通过，0 失败 | 55 首次通过，0 失败 | 0 / 0       |
| Intel         | macOS 15.7.9 / 24G830 | 73 通过，0 失败 | 54 首次通过，1 失败 | 0 / 0       |

两侧构建真实 `.app`、DMG、ZIP，并以 `codesign --verify --deep --strict` 验签。
Apple Silicon 签名记录为 Mach-O thin arm64、ad-hoc；不是 Developer ID 或公证。
`macos-acceptance-<arch>-1` artifact 保留 TAP、完整 Playwright JSON、截图/trace、系统/版本、签名及哈希。
`macos-installer-<arch>-1` 保留对应已验签 DMG（14 天），供后续桌面验收使用。

第二轮 Intel 的唯一失败为下述启动观测夹具问题。
[第三轮专项](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42454527124)两种架构全部通过，
安装包、SDK 包和运行中 Host 版本均已核对。

| 架构          | 实际系统              | Node 专项       | 成品 E2E            | 重试 / 跳过 |
| ------------- | --------------------- | --------------- | ------------------- | ----------- |
| Apple Silicon | macOS 15.8.2 / 24H232 | 73 通过，0 失败 | 55 首次通过，0 失败 | 0 / 0       |
| Intel         | macOS 15.7.9 / 24G830 | 73 通过，0 失败 | 55 首次通过，0 失败 | 0 / 0       |

成品核验：两种架构均为 `app.isPackaged:true`、Electron `42.5.0`，运行中的 Host 版本
`0.7.97-beta.3`；签名分别为 Mach-O thin arm64/x86_64、ad-hoc。
第三轮证据：ARM [13607129802](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42454527124/artifacts/13607129802)、
Intel [13608126670](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42454527124/artifacts/13608126670)。
验收 DMG：ARM [13607114802](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42454527124/artifacts/13607114802)、
Intel [13608266192](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42454527124/artifacts/13608266192)。

第三轮 `500b5bcd` 的 [build](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42454526433)
7/7 成功，[CI](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42454526439)6/6 成功，
但 Linux startup-overlay 的 reload 段首次失败、一次重试通过；不将其算首次通过。

[第四轮](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42457808906)为 ARM 73/55 全部首次通过，
Intel 73 项 Node 通过、54/55 成品首次通过，1 项失败；均无重试或跳过。Intel 的 Workflow/Memory
失败证据为 [13609234754](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42457808906/artifacts/13609234754)。

第四轮配套源码门禁：[build](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42457808635)
7/7 成功、[CI](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42457808638)6/6 成功，提交 `37019ca3`。
Linux E2E 为 193 首次通过、7 条件跳过，无重试；Windows 为 185 首次通过、1 重试通过、14 条件跳过。
两平台 startup-overlay 均首次通过，先前 Linux reload 观测问题已回归通过。Windows 的另一项重试见下文。
第五轮：[macOS 专项](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42461374638)、
[build](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42461363796)、
[CI](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42461363894)，提交 `0d34eb08`。
专项和源码门禁均已全绿；两平台完整 E2E 无重试，条件跳过数见最终结果。
被新测试提交替代的旧来源运行已取消；其中首轮 Intel 浏览器单测失败日志已保留。

## 发现与修正

### 外部 SDK 检查进程使用了错误的 endpoint

两个架构的 Script 重启历史、Partner 模式锁定和 beta.3 Host 能力核验都在 Node 检查进程中
报 `connect ENOENT /private/var/folders/.../kodax-runtime-...sock`。失败前应用内操作已完成；
Script 的 Host 重启记录显示新 runtimeId 已 ready。

Space 的既有 `withDarwinRuntimeDaemonTmpdir` 为避免 Darwin 104-byte Unix socket 路径限制，
在 `/tmp` 计算并启动 Host。检查进程却按自己的 TMPDIR 推导地址。`2d3eb9fe` 增加共享检查
helper：读取隔离目录 descriptor，验证 profile/configHome，再以实际 endpoint 和本地 daemon token
调用 SDK passive connect。原模式 CAS/锁定、Script 停止与重启不重放、能力断言全部保留，超时不变。
同步修正了一个使用相同方式连接的历史诊断探针。没有新增 Runtime 或 Session 写入者。

三项先在未修改的 Windows 成品上 3/3 通过；Apple Silicon 修正后全组 55/55 首次通过。
Intel 第二轮这三项也全部通过，外部连接问题已在两个架构得到验证。

### 历史浏览单测绕过了 UI 导航 owner

首轮完整来源构建在 Intel 的 `conversationHistoryNavigation.browser.test.ts` 出现一次
工具回执按钮点击超时：自动滚动后元素被替换。单独原样重放通过；对最后交互降速并记录请求，
可见直接注入 middle 页后自动进入 newest 页，干扰本应验证“同页回执复用”的断言。

`c9afcdc2` 让这一段通过真实的 View saved conversation 入口进入历史，保留前半段双向分页、
最新消息、失效回复和搜索返回测试；保留回执展开状态与焦点断言，并检查页面仍为选定的最新历史页。
末段加入 6 倍 CPU 降速，本地连续 6 次通过。探索时曾对整个长用例降速，在更早的搜索返回
位置超时；不将该探索运行算通过，也不声称整个用例在 6 倍降速下通过。最终仅对本次失败的
末段施加降速。`500b5bcd` 两种架构的完整来源构建日志均明确报告此用例和不依赖 OS vault 的
凭据用例通过。Mac 每侧原始 Node 报告为 156 + 4193 + 372 = 4721 项，4686 通过、35 条件跳过、0 失败；
不与有重叠的 73 项专项叠加为新的测试总数。

### 启动观测钩子运行得太晚

第二轮 Intel 为 54/55 通过，唯一失败是在最初隐藏窗口阶段观测到窗口已显示。夹具的
onLaunched 虽声明在 Electron 连接后立即执行，实际却位于 firstWindow 和 Main inspector
稳定检查之后，慢环境会耗尽 5 秒的初始 paint hold。

在原代码中加入 6 秒初始化延迟，本地未修改的 Windows 成品复现了同一失败；将 onLaunched
提前至 firstWindow 等待前，同样延迟下通过。移除诊断延迟后又连续两次通过。
`500b5bcd` 只调整夹具顺序和注释，没有修改产品启动代码、保持时间、断言或超时。
唯一使用该早期钩子的启动测试自己轮询并处理暂态上下文错误；普通 Main 初始化仍等待 firstWindow。
第三轮两种架构该用例明确通过（ARM 30.5 秒、Intel 32.4 秒，包含测试特意设置的保持时间，不是产品启动基准）。

### 重载后的观测依赖 load 返回时机

核对第三轮的常规 Linux CI 逐项日志，发现同一启动测试在 reload 后即时读取遮罩状态时
得到 overlays:0/throttling:true，一次重试通过。Mac 原生两侧本用例均首次通过，分别记录。
旧代码 reload 后延迟 11 秒再读取，本地复现同一失败；新观测方式同样延迟下通过，移除诊断延迟
后连续两次通过。

`37019ca3` 在本次主文档导航后记录真正的 boot.rendererReady 时刻、产品处理信号前的原生状态。
Shell 在两帧绘制且有可见尺寸后发送该信号；观察者只读，按 sender 过滤，捕获或销毁时清理。
保留“覆盖已绘制 Shell”和最终移除/节流恢复断言，保持时间、超时、产品处理均未修改。
不以常规 CI 的绿色总状态掩盖这次重试；修正后 Linux 和 Windows 该用例均首次通过。

### Workflow 完成后首次读取遇到预期的稳定边界冲突

第四轮 Intel 的 trace 显示：Workflow completed，single-use rerun 正确拒绝，随后 peer 首次
`sessions.readHistory` 抛 `Session location topology could not be verified for [same session]`。
已发布 beta.3 的 `dist/chunks/chunk-BSCSKJNC.js` 确认该分支抛 `data_changed`；读取期间拓扑
无法保持稳定时，SDK 拒绝混合数据。trace 没有确定具体并发写入者，不把它断定为某一个报告写入。

Space 产品 `RuntimeHostAdapter.readProductHistory` 已把该码映射为 `data_changed`，交由历史 UI
重同步；测试却在直接 peer 读取的 `expect.poll` 回调中抛异常，立即退出，未继续等待稳定的报告。
`0d34eb08` 仅让该无 cursor 只读轮询识别精确码和当前 Session 的精确文案、逐次保存冲突证据。
保留原 deadline、最终恰好 1 条报告的断言；其他错误原样抛出，不重放 Workflow 或输入。

本地诊断注入一次相同冲突：旧回调 RED，新回调 GREEN；同文案改为 `permission_denied` 仍立即
RED。移除诊断后，未修改的 Windows 成品连续 2 次通过。对应日志为
`space-e2e-80680-1794124882851.log`、`space-e2e-53520-1794124922005.log`、
`space-e2e-66524-1794124959783.log`、`space-e2e-4828-1794124995976.log`。
没有改 SDK 或产品代码；第五轮两侧成品均首次通过，均未出现该只读冲突。

### 常规 Windows 源码门禁中的独立观察

`37019ca3` 的 Windows shard 2/2 有 1 个非 macOS 重试：扩展诊断用例在 `launchSpace`
等待根 DOM 时超过 30 秒，尚未执行到业务断言；一次重试通过。
[原始证据](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42457808638/artifacts/13608832459)
保留首次失败、重试结果及 trace。失败 trace 只有测试调用，没有 renderer 快照或 Main console，
不足以判断是页面、绘制调度、测试夹具或运行器问题，不能直接归因于 SDK。

本地使用同一用例、关闭重试，在 Windows 成品和源码分别连续 2 次通过，未复现。
日志分别为 `space-e2e-84324-1794123937355.log`、`space-e2e-78816-1794124000508.log`
（本地忽略的 `artifacts/diagnostics/e2e/`）。不提高超时、绕过启动或猜测性修改产品。
此项作为独立 Windows 启动待定位记录保留，不声称已修复；两种 macOS 成品中的同一业务用例
均首次通过。macOS 专项结论与常规 Windows 的这条观察分别陈述。
第五轮 Windows 同一用例首次通过、所在分片无重试；这也不等同于已经确认或修复既往超时的根因。

## 凭据与能力证据

新凭据专项在实际 OS/架构上启动两个独立 Node 进程，不设置 onboarding 测试开关。
禁止加载 Electron/Keyring/keytar，任何加载尝试即留痕并使断言失败；测试 API key 和稳定
Runtime 身份能够保存、重开且身份不变，Unix auth.json 没有 group/other 权限。
这证明生产存储模块不依赖这些 OS vault 后端，不等同于整台桌面上所有连接器都不访问钥匙串。

Apple Silicon 成品记录 `app.isPackaged:true`。实际 Host 包括 productHistoryLocation:1、
productHistoryTurnResolution:1、productInputRecovery:1、productExecutionModeConstraint:1、
repoIntelligenceDiagnostics:1、providerCredentialBroker:2、contextCompaction:3，
sandboxRuntime:11 / macos-seatbelt；Session 设置返回 workModeLocked:true。

## Standards

独立逐文件评审：代码硬违反 0、可行动 smell 0。另有 1 条低优先级提交记录问题：
初始 `a477598f` 只有 subject，缺少 CONTRIBUTING.md 要求的正文。该提交已共享到 main，
不改写共享历史；本记录补记其目的（双架构独立验收）、隔离边界、命令、结果及仍待桌面验收项。
后续修正提交均包含背景和验证正文。

## Spec

独立需求评审 0 项：符合用户的 Intel/Apple Silicon GitHub 专项验收与发现失败后修复回归要求，
没有新增产品执行政策或缩减原有业务断言。

规范轴：代码 0，提交记录 1（已补记，未改写原提交）；需求轴：0。

## 仍需独立验收

GitHub 镜像预装 Git/Xcode；缺少 CLT 的“不弹安装窗口”仍为模拟故障边界。
旧 Keychain 首次迁移的真实允许/拒绝弹窗、通知中心实际展示及 Dock 外观、Finder 启动、
Gatekeeper 与客户实际 OS/第三方连接器或外部 CLI 需要桌面专项。通知 E2E 模拟 show/failed 系统回执。
本地 Provider 协议夹具不能证明线上订阅权限或模型质量；本轮没有修改模型或智能执行策略。
