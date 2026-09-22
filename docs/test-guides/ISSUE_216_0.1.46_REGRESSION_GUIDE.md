# ISSUE 216 — Windows 凭据、Shell 与诊断回归

状态：Space 源码修复，尚未发布。2026-09-22 已接入官方 Registry 发布的
`@kodax-ai/kodax@0.7.96-rc.9`，包含 SDK 诊断及后续单独授权的 daemon 状态写入修复。
本轮本地集成验证已完成，客户原机验收待完成；下方 rc.8 验证记录保持为历史证据。

## 修复边界

- Windows 优先使用 Electron safeStorage/DPAPI，复用 `provider-credentials.v1.json`
  的版本 1 格式；无需加载 native keyring 即可恢复已有 vault 和保存新凭据。
- 旧凭据按已知 Provider 账号迁移。单条异常不让所有账号降级；迁移中的旧读取不能
  覆盖更新后的凭据或取消删除。删除 tombstone 阻止旧记录重新导入。
- 已有 schema 3 Runtime 身份的 secret 缺失/解密失败时明确失败，不重建 secret。
  首次创建必须持久化并读回 secret 后才发布身份。保留 macOS 取消授权后的抑制行为。
- Windows Auto 使用无 profile 启动探针选择可启动 Shell，Agent 合同与终端使用共同
  解析结果。显式选择及仅 profile 失败的语义保持不变。
- updater 增加根生产依赖并修正 CommonJS 默认导出的 getter 访问。
- 最初批准的 SDK 工作仅增加既有探测诊断，不修改探测超时、缓存、返回/异常、
  Job 生命周期、认证或压缩。父进程事件写入 Space 结构化日志，daemon 初次/后续
  探测事件写入原 daemon.log。
- 后续真实 Windows 读写竞争复现后，另行授权修复 SDK daemon 状态文件原子 rename
  的瞬时占用失败；该修复与诊断一起进入 rc.9。不能把整个 rc.9 描述为仅诊断改动。

## 已实现的批准项 1 / 2 / 4 / 5

以下为 Space 源码落点；实现完成不等于本轮 rc.9 集成或客户原机验收通过。

| 批准项 | 已实现行为 | 主要文件 |
| --- | --- | --- |
| 1 | Windows 复用 DPAPI v1 vault，按账号迁移旧凭据并保护更新/删除竞争 | [keychain.ts](../../apps/desktop/electron/providers/keychain.ts)、[encrypted-credential-vault.ts](../../apps/desktop/electron/providers/encrypted-credential-vault.ts) |
| 2 | 保留已有 Runtime 身份，持久化错误不生成替代 secret | [runtime-client-identity.ts](../../apps/desktop/electron/kodax/runtime/runtime-client-identity.ts) |
| 4 | Auto 探测 Shell 可用性，合同、环境和 PTY 采用一致选择 | [shell.ts](../../apps/desktop/electron/terminal/shell.ts)、[shell-execution.ts](../../apps/desktop/electron/kodax/shell-execution.ts)、[shell-env-hydrate.ts](../../apps/desktop/electron/kodax/shell-env-hydrate.ts)、[ptyHost.ts](../../apps/desktop/electron/terminal/ptyHost.ts) |
| 5 | updater 根生产依赖、CJS 加载及包内保护；结构化错误脱敏、SDK 日志桥接 | [package.json](../../package.json)、[updater.ts](../../apps/desktop/electron/ipc/updater.ts)、[smoke-pack.mjs](../../scripts/smoke-pack.mjs)、[redaction.ts](../../apps/desktop/electron/diagnostics/redaction.ts)、[sdk-bridge.ts](../../apps/desktop/electron/diagnostics/sdk-bridge.ts)、[main.ts](../../apps/desktop/electron/main.ts) |

## 自动化验证

1. `node --import tsx --test apps/desktop/electron/test/windows-credential-migration.test.ts`
   覆盖 native keyring 缺失、重启恢复、现场 v1 格式、Provider 逐账号发现、删除、
   解密/写入/可用性错误、损坏文件保护、Runtime 首次创建与重连、macOS 授权取消。
2. `runtime-client-identity.test.ts` 保留身份不变、旧 schema 迁移、并发首次启动、
   symlink/hardlink 防护、缺失 secret 不轮换、读取失败后重试和持久化失败不发布身份。
3. `terminal-shell`、`shell-execution`、`shell-env-hydrate`、`pty-host` 覆盖 Auto
   回退、显式偏好、全部失败、探针缓存恢复、profile 失败区分及合同/PTY 一致性。
4. `ipc/updater.test.ts` 和 `scripts/test/smoke-pack-updater.test.mjs` 检查 CJS
   getter、真实模块加载和包内路径边界；烟测不调用更新 getter、不发起下载。
5. `diagnostics/sdk-bridge.test.ts`、`diagnostic-redaction.test.ts` 检查结构化
   cause、SDK detail、白名单、脱敏、循环/长度边界与日志失败不影响业务。
6. 完整桌面套件包含历史发送、手动/自动压缩投影、credential broker、退出恢复、
   startup/shutdown 协调、Provider 自定义账号和 OpenAI/Codex 共享策略的既有回归。
7. `node scripts/smoke-windows-credential-vault.mjs` 使用三个无窗口 Electron
   进程和临时 profile 验证同步密文→异步读取、新密文跨进程恢复、没有明文落盘。
   测试仅使用虚构 secret；不会读取客户或开发者真实凭据。

KodaX 仓库的诊断用例还断言：sink 或日志 IO 抛错时业务返回不变，缓存失败后不增加
探测次数，临时 sink 恢复原 sink。使用最终构建的 SDK 执行 Provider credentials 和
daemon 手动/managed compaction 集成测试。具体批次结果见该仓库 KNOWN_ISSUES。

## 本地验证记录（2026-09-21）

- Space：TypeScript、全仓 ESLint、renderer/main 构建通过。
- 最终冻结源码后的完整桌面套件：3,772 通过、0 失败、13 项因平台/权限条件跳过。
- Windows 独立 unpacked 验证包位于 `out/issue216-validation/win-unpacked`；仍使用
  Registry 完整性校验通过的 SDK rc.8，未发布且未替换 SDK 依赖。
- 该包真实 updater 加载通过；启动烟测 renderer 6,134 ms，Runtime 29,005 ms
  （含人为设置的 20 秒测试延迟），122 条历史子进程记录完整保留。
- 该包两次完整退出和 Session 历史恢复通过。
- 真实 Electron 42.5.0 的三进程 DPAPI 烟测通过，native keyring 确认不可解析。
- SDK：诊断/退出/能力相关 155 项通过、3 项平台跳过；host/manager 66 项通过；
  历史/凭据/压缩/退出 58 项通过；sandbox 93 项通过、40 项平台跳过。
  各批次存在交集，不累加。最终 SDK 构建产物的凭据及 daemon manual/managed
  compaction 集成验证 15 项通过；源码/测试类型检查和构建通过。

### Standards

两个仓库的固定点分别为 Space `52f94c1`、KodaX `6b71837`；评审未提交 diff。
未发现遗留的可行动硬违反或确定回归；核对凭据并发、身份、Shell、更新器和诊断异常隔离。
本轴遗留 finding：0。

### Spec

macOS 取消授权记忆和 native loader cause 入口已补回归并修正；最终无遗留 finding。
额外复核严格读取的并发合并、失败后清除 pending promise、取消记忆及显式保存恢复。
本轴遗留 finding：0。客户原机验收和 SDK 正式集成仍是验证边界。

## 本轮集成验证（2026-09-22）

- 依赖接入：Space 源码已锁定发布的 SDK rc.9；未发布新的 Space 版本。
- Registry 安装内容、tarball integrity、根/桌面 manifest 与 lockfile 一致性校验通过；
  安装的是实体发布包，没有使用 sibling KodaX 开发链接或修改 SDK 文件。
- 发布检查：85 通过、0 失败、7 条件跳过；IPC schema：362 通过、0 失败。
  首轮发布检查暴露诊断桥接测试的静态 ESM 导入，改用动态导入后复测通过。
- 完整桌面回归：3,771 通过、1 失败、13 条件跳过。唯一失败是手册测试仍断言
  rc.8；更新为当前源码 rc.9 后，该文件 7 项复测全部通过。此后未重跑整个桌面套件，
  不将分批结果表述为一次全量零失败运行。
- TypeScript、全仓 ESLint、内置 skills 检查及 renderer/main 构建通过。
- 真实 Electron 42.5.0 三进程 DPAPI 验证通过：native keyring 不可解析时，同步旧密文
  可读、异步新密文可跨进程恢复，vault 中未出现测试 secret 明文。
- 标准 `scripts/pack.mjs --win` 链路完成：发布 SDK 完整性、包内依赖、native bundle
  哈希、updater CJS 加载、SQLite、真实 rc.9 Runtime/Worker 全部通过。
  本地验证产物在 `out/`：Setup 173.12 MB、Portable 172.92 MB；版本号未变，未发布。
- 原始 packaged boot 烟测通过：renderer 7,436 ms、Runtime 30,768 ms（包含人为的
  20 秒 daemon hold），保留全部 122 条历史子进程记录。两次产品完整退出及 Session
  历史恢复通过。
- 使用保留原始断言的临时 complete-exit 观察脚本再次通过两次退出和历史恢复，并确认
  真实日志链路：Space 的 `boot-identity` 4 条、`process-start-identity` 2 条；daemon
  的 `job-membership` 8 条。只保留 source/stage/level 计数，不导出凭据或业务载荷。
  最初额外 boot 观察错误地要求启动阶段父日志非零；健康新 profile 没有缺失能力或
  待恢复退出状态时不必产生这些父事件。核验改在完整退出之后，未增加生产探针。
- Standards / Spec 独立评审均无遗留 finding。
- 客户原机验收：待完成。

## 客户原机验收

必须在客户原 Windows 账号下运行；复制到其他机器的 DPAPI 密文不能代替此验收。
保留现场 profile，不删除身份、vault、daemon 权属或会话文件来“绕过”报错。

| 场景 | 预期 |
| --- | --- |
| 使用现场临时版留下的 vault/identity 启动 | 恢复同一 clientId、instanceId、secretAccount；不产生替代 secret |
| 只有旧 Credential Manager 记录 | 内置、Space 自定义、SDK 自定义 Provider 被发现并迁移；重启后仍可用 |
| native keyring 加载失败，但已有 vault | 正常读取凭据并进入 Runtime 连接；不依赖 keyring 初始化 |
| Provider 更换 Key、删除 Key、重启 | 使用新 Key；已删除旧 Key 不复活；其他账号不受影响 |
| PowerShell 无 profile 启动失败，CMD 可用，选择 Auto | Agent Shell 与新终端可选 CMD，不重跑失败的用户命令 |
| PowerShell 仅 profile 出错 | 保留原无 profile 降级，不直接推定整个 PowerShell 不可用 |
| 普通对话、手动压缩、自动压缩 | 完成调用并保持历史顺序；无重复消息、凭据租约残留或身份漂移 |
| 重启重连、安全退出后重启 | 会话可恢复；原有退出与权属检查仍执行 |
| 更新器初始化 | 无缺包或 autoDownload undefined；不强制下载更新 |

若仍报 Runtime capability/退出校验错误，检查原日志中的 `runtime:windows`：
`boot-identity`、`job-membership`、`process-start-identity`、`exit-owner-validation`，
以及 `runtime.daemon.capabilities` 的缺失能力。记录错误码、耗时、缓存结果和缺失字段。
不要导出/打印 Key、Runtime secret、完整命令、stdout/stderr 或环境变量。

此方案没有移除 SDK supervisor/Job/CIM 的 PowerShell 依赖。因此“PowerShell 全面被禁用”
的机器可能仍无法启动 Runtime；新增日志用于定位该情况，不能把 Shell Auto 回退当作
整个 Runtime 已支持这类机器的证明。
