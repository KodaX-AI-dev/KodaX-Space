# Registry alpha.12 升级与验收

2026-11-02。按用户发布通知安装正式 npm 包，延续 [源码准备](kodax-0.7.97-alpha.12-preparation.md)。本记录区分 SDK 已发布、Space 依赖已安装、构建产物及尚未闭环的产品能力。

## 安装与字节

- Root/Desktop 精确依赖及 package-lock 均为 `0.7.97-alpha.12`，来自 `https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.12.tgz`；无 SDK dev-link、file tarball 或嵌套旧版本。
- Registry integrity：`sha512-1LlTrz4SxQh77EMoj9E7ZE/jKWIYSBjZJv8+4i8BAfPjcD3R1wMSgtAL0SFKMYZo3uRBa07q4SQ47J/9dfPNug==`，shasum `11862309611d2557c50b5a955b1985e8eb9b3e5a`。该字节与此前本地候选不同，已重新验证完整安装目录，而非只读版本号。
- 本次 lockfile 仅 SDK 包版本由 alpha.11 升到 alpha.12，并新增其所需的 96 条依赖记录；已有其他包版本未漂移。
- 本线程未修改 SDK 源码工作区；不以其 HEAD 或旧 CI 结果代替本次正式字节验收。

## 实际 Host

隔离 profile、未使用个人会话或在线模型。实测 Host 版本 `0.7.97-alpha.12`，mode `daemon`、profile `coder`，build fingerprint `43cedce678867a869a012d8a6dd7fad38a957b4e4427ece3631d2303a0ac66ef`。已确认 `productExecutionProfile:2`、`providerProbeAuthorization:1`、`providerCredentialConnectionBinding:1`、`actorCheckpointRecovery:1` 等能力，完整 capabilities 保存在验收 JSON。

真实共享 Host 六项验收通过：Space builtin Skill 发现/rehydrate、项目 `.agents/skills` 发现、Partner Agent 准入、Space 交付工具 lease 执行、实际 shell scope 和 persona 保留。实际交付文件逐字节核验，`physicalRequestCount=0`；独占测试 Host owner 核对后关闭，并由 SDK 证明已退出。

## 验证进度

- 正式 Registry 完整字节门禁：通过。
- 正式依赖版本回归：先 RED，再更新版本要求，2 项通过。
- 类型检查与 Renderer/Main 构建：通过。
- 完整工作区：Desktop 4064 项，4051 通过、13 跳过、0 失败；IPC schema 371 项全部通过。
- `npm run test:release`：137 项，130 通过、7 跳过、0 失败；未放宽版本/资源门禁。
- Windows Setup/Portable 已生成（约 205 MiB）。首次打包在旧验收探针处 RED：移除的 `enableKodaXDaemonOwner` 导出；修正后真实 ASAR 完整 smoke 已通过。
- 打包探针改用公开 `ensureKodaXRuntime` 和合法 product surface，不手改 owner policy，不构造 embedded Runtime。独占临时 Host 的 lifecycle 回执与 owner 身份核对后，再用 SDK `waitForRuntimeDaemonShutdown` 证明真实退出；清理未核验时保留目录。
- 探针相关 8 项契约通过，lint 复查通过。完整 Electron/E2E、最终打包流程及启动/退出验收正在执行，最终结果补充。
- 日志与 Host 能力证据位于 `artifacts/diagnostics/alpha12-release/`；保留原候选目录，不覆盖旧证据。

## 正式包仍缺的 SDK 接口

本次按已安装的 `docs/SDK_MIGRATION.md`、`docs/CLIENT_CONTRACT.md`、`docs/SPACE_SDK_SEAMS.md`、`public_docs/sdk/embedder-guide.md` 以及公开 `.d.ts` 核对：

1. `RuntimeExecutionProfileSource` 只有 persona、验证和工具策略；没有可信专家默认 Skill 声明，以及 after-turn 真正消费时读取最新已提交专家/连接器绑定的公开接缝。默认方法和排队/恢复业务绑定未等价迁移，不能拼接 slash、修改原问题或借私有 Run options 假装完成。
2. Product/Runtime Session 服务没有 promotion/tag 更新命令，tag 只在 create 时声明；对已有 ID create 会 conflict。Quick Ask 转正式会话仍事实拒绝，UI 保留回答，只有 Host 明确确认成功才切换；不执行 saveSession 直写。

完整问题、需求和验收要求仍在 [SDK 交接说明](kodax-alpha12-partner-sdk-handoff.md)。该正式包没有关闭这两组能力缺口，不能标记所有专家和 Quick Ask 已完成，也不能将本地验收包当作无剩余问题的产品发布。

历史首次读取性能 Issue 371、Linux/Kylin/macOS/ARM 真机、真实 OAuth/云账户及外部服务权益仍不由本机离线测试代替。

## Electron 回归中补齐的 Space 遗漏

首次完整 Electron 回归发现并保留了两类证据，原运行已暂停，修复后重新执行：

- 首次会话创建会触发多路凭证读取，自动来源固定拿到相同旧修订后竞争写入；存储初始化也可能产生多个实例。现在 Main 共用一次初始化，初始化失败可重试；只对 SDK 明确的 `CredentialUpdateConflictError` 自动重读一次，并携带原连接指纹及原来源 scope。显式 set/remove/share 的用户可见修订校验不变，不缓存或复用旧 Key，不换到另一个来源，不重放生成请求。新增并发 12 读、迟到读取收敛、并发显式改来源时拒绝跟随三个回归，先 RED 再 GREEN；相关凭证用例 26 项通过，CLI 不同账号和 env 消失不回退均受保护。
- 模型选择器原来只读旧 `reasoning_resolved` 事件，现在优先读 SDK 当前 view 的 `activity.reasoning`，仍按所选 provider/model/intent 过滤；缺事实保持未知，不以旧事件补造 canonical 结果。浏览器 RED/GREEN 验证实际发送值、fallback 原因、`verified:false`、异 Provider 及缺失事实，并保持用户选择值。
- 旧 E2E 夹具补齐 `provider.setKey.expected`；权限测试检查新的 work-mode 控件，四种权限轮换不改变工作模式。Mock 界面操作与 SDK wire 事实分在合适的用例边界，不再向首个 BrowserWindow 注入不属于它的假运行事件。

最终源码的完整工作区测试、类型检查、lint、Renderer/Main 与 172 项 Electron 用例会重新核对。之前基线数字保留为各自检查点，最终结果在此续记。当前已生成的首轮安装包仍需重打，不能当成这些后续源码修复的交付物。

## 最终源码检查点（d4d5ac6e）

- 完整工作区：Desktop 4068 项，4055 通过、13 跳过、0 失败；IPC schema 371 项全部通过。
- 类型检查、lint、Renderer/Main 构建再次通过。
- 凭据专项 27 项通过，相关两文件合计行覆盖率 88.89%、分支 83.21%、函数 91.04%；文件凭据模块行覆盖率 95.47%，Main storage 模块 83.15%。
- 独立 Standards/Spec 审查覆盖正式安装、打包探针和启动凭据/推理事实修复。Spec 的 canonical view 缺失时错误回退旧事件一项 P2 已修复并以浏览器 RED/GREEN 验证；最终两个审查轴均无未解决发现。
- 172 项 Electron 全量正在执行。已发现的重启凭据用例业务断言全部通过、两次退出清理超过单例默认 30 秒，已将该用例预算显式设为 60 秒；另一配置读取失败待复核，不按超时解释或忽略。

配置读取失败在另一真实 SDK 用例再次出现后，保留 trace 并中断首段。新增跨进程持锁截断回归稳定 RED；Space reader 现使用 SDK 公开配置锁同步读取，只对明确锁忙做四次短暂重试。20 项相关凭据/配置用例通过；补充验证锁持续忙时有限等待后明确拒绝、释放后可读，损坏 JSON/目录 IO 拒绝且不暴露原文。未对解析错误做重试或空配置降级。SDK 部分 writer 仍截断重写，另有 [原子性需求和验收交接](kodax-alpha12-config-atomicity-handoff.md)；原 Electron 失败未保留底层错误，受控复现不能代替逐次溯源。Electron 剩余用例及原失败相关场景分段继续执行。

配置 reader 修复提交 ba921570：相关 20 项通过；另补锁持续忙超限与释放恢复通过，typecheck/lint/Main 构建通过。独立 Spec 轴 0 项发现。源码定向 8 项全部通过（2.6 分钟），包含 integrated-workspace 全部四项、两个实际凭据 IPC/重启用例、Coder 内置 Skill 和普通问题 Skip。第一轮两处配置失败相关场景在旧 reader 加分类后重复三轮共 6 项也通过，说明原问题为间歇性；该结果不替代持锁截断的 RED/GREEN 证据。最终 Windows 包正在重打，剩余全量条目将使用该包继续回归。

Standards 两项测试发现已在 3c61dba3 修复：把配置一致性用例从首次凭据并发读取用例独立出来；用显式释放文件信号替代固定 400ms 持锁窗口。拆分后两项通过，新增生产代码未变；最终 Standards/Spec 两轴均为 0 项未解决发现。

构建期间观察到 SDK 工作区出现其他线程的后续未发布改动，包括 session-promotion 和 execution-binding 文件。本次继续以已安装 Registry alpha.12 的公开契约及字节验收，不构建、不安装或修改那些工作区改动，也不以它们关闭正式包接口缺口。

## 最终包的执行证据

Windows Setup / Portable 已重新生成，ASAR Runtime smoke 全通过。实际 daemon/process 为 alpha.12，Worker constructed handler 在非主线程，session round-trip、历史边界和分页 cursor 有效；integration health=healthy，首次和重启后 exit settlement 均 clean。Windows 沙箱 shell 实际执行，backend=windows-restricted-user；保留 SDK 正常权限回退策略。原始 JSON：`out/kodax-runtime-smoke.json`。

冷启动 smoke 通过：Renderer 8062ms、Runtime 30429ms（含确定性的 20000ms Host test hold），122 条历史 child 记录保留。这里的 Host ready 不代表历史首次读取完成或 Issue 371 已关闭。

打包 wrapper 在最后的 Product 退出验收中暴露旧夹具遗漏：两项读取 accepted exit receipt 仍找 Keychain，实际客户端密钥已经迁入 auth.json 保留绑定。4 项其他验收通过，但该轮 wrapper 因夹具返回 exit 1。现已将独立 receipt reader 改为 SDK 文件凭据接口读取同一客户端绑定，不把密钥打印/返回给 Renderer，并保留退出与回执断言。随后以同一最终包继续执行验收；夹具修改不改变 ASAR 产品代码。完整工作区也因新增生产 config reader 重新验证，不复用之前的 4055 数字作为最终结论。
