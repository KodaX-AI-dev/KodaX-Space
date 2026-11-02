# Registry alpha.12 升级与验收

2026-11-02。按用户发布通知安装正式 npm 包，延续 [源码准备](kodax-0.7.97-alpha.12-preparation.md)。本记录区分 SDK 已发布、Space 依赖已安装、构建产物及尚未闭环的产品能力。

## 安装与字节

- Root/Desktop 精确依赖及 package-lock 均为 `0.7.97-alpha.12`，来自 `https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.12.tgz`；无 SDK dev-link、file tarball 或嵌套旧版本。
- Registry integrity：`sha512-1LlTrz4SxQh77EMoj9E7ZE/jKWIYSBjZJv8+4i8BAfPjcD3R1wMSgtAL0SFKMYZo3uRBa07q4SQ47J/9dfPNug==`，shasum `11862309611d2557c50b5a955b1985e8eb9b3e5a`。该字节与此前本地候选不同，已重新验证完整安装目录，而非只读版本号。
- 本次 lockfile 仅 SDK 包版本由 alpha.11 升到 alpha.12，并新增其所需的 96 条依赖记录；已有其他包版本未漂移。
- SDK 源码工作区未修改；不以其 HEAD 或旧 CI 结果代替本次正式字节验收。

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
