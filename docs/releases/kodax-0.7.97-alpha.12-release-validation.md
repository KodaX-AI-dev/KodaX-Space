# Registry alpha.12 升级验收

> 2026-11-03 后续：Space 已锁定正式 SDK beta.1，并适配默认方法/消费绑定、Quick Ask 与配置接口。当前验证、成品和剩余边界见 [beta.1 接入记录](kodax-0.7.97-beta.1-integration.md)。下方保留 alpha 阶段的历史检查点。

2026-11-02。正式 `@kodax-ai/kodax@0.7.97-alpha.12` 已安装，Space 适配及本次可独立完成的修复已提交，Windows Setup/Portable 已重打并验证。仍需 SDK 补齐的产品接口列在下方，当前候选包不能据此宣称所有问题已闭环。

工作区：`C:/Users/ADMIN/.codex/worktrees/sdk-alpha12-preparation/KodaX-Space`，分支 `codex/sdk-alpha12-preparation`。Space 版本保持 `0.1.47-alpha.3`；没有发布 Space Release，也没有改写原 Space 主工作区的 fixture/research 文件。

## 正式安装与实际 Host

- Root/Desktop 精确依赖及 lockfile 均为 alpha.12，完整安装目录与 Registry tarball 字节门禁两次通过；无 dev-link、本地候选 tarball 或嵌套旧 SDK。lockfile 仅原有 SDK 版本变化并新增其所需的 96 条依赖，其他已有包版本未漂移。
- Registry：`https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.12.tgz`；shasum `11862309611d2557c50b5a955b1985e8eb9b3e5a`；integrity `sha512-1LlTrz4SxQh77EMoj9E7ZE/jKWIYSBjZJv8+4i8BAfPjcD3R1wMSgtAL0SFKMYZo3uRBa07q4SQ47J/9dfPNug==`。
- 真实隔离 Host：version alpha.12、mode daemon、profile coder、build fingerprint `43cedce678867a869a012d8a6dd7fad38a957b4e4427ece3631d2303a0ac66ef`。实际确认 productExecutionProfile:2、providerProbeAuthorization:1、providerCredentialConnectionBinding:1、actorCheckpointRecovery:1 等能力，完整 capabilities 在验收 JSON。
- 真实 Host 六项通过：Space builtin Skill rehydrate、项目 `.agents/skills` 发现、Partner Agent 准入、Host lease 执行 Space 交付工具、shell scope 和 persona 保留。实际交付文件按字节核验，physicalRequestCount=0；测试独占 owner 经 SDK 验证退出。
- 本线程未修改或构建 SDK 源码。构建期间 SDK 工作区出现其他线程的后续未发布 promotion/execution-binding 改动，未混入安装包，也不用它们关闭已发布 alpha.12 的接口缺口。

## Space 适配范围

完整契约矩阵见 [源码准备记录](kodax-0.7.97-alpha.12-preparation.md)，其中候选字节/旧版本声明属于历史检查点，本次正式安装以本记录为准。

| 范围                      | 当前处理与验证边界                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共享 Host、Session、Actor | 真实 Coder/Partner 统一使用 Product/Host；不新增 Runtime 或 Session writer。恢复、命令、历史、Fork/Rewind、Workflow 和工具 lease 继续走 Host。                                                                              |
| 工作模式                  | Coder 可在首次输入前选择 Agent/Coding/实验性 Script，安全空闲时通过 Host CAS 修改；Partner 使用 Agent，并保留正常 shell/write/子 Agent 能力。模式与模型、权限独立，旧 Host/冲突不伪造本地状态。SA 隐藏和 AMA 迁移继续保留。 |
| 流式事实、模型、图片      | 消费 Host estimatedTokenCount 和 canonical reasoning 事实；缺事实保持未知。模型级 text-only 优先；修复自定义 Provider 图片检查使用 built-in-only getter 的遗漏，改用统一 resolver。                                         |
| 历史与报告                | 保留 canonical/native 字段、taskResult 多报告/未知状态，按具体工具 ID 分页读取 original。中性通知、长历史 React 185 的同帧通知合并，以及双向浏览后同一个底部按钮回最新的修复继续保留。                                      |
| 交互与凭据                | 普通问题无客户端默认超时，skipped/non_interactive 保持区别；审批独立。文件凭据来源固定、CAS、墓碑、显式共享/采用、OAuth context 和恢复不放宽。真实云账户/订阅权益未由离线测试替代。                                         |
| 配置与生命周期            | 读取 Host application 及其生效时机；Host ready 与历史加载完成分开。手动检查更新、分别确认下载/安装，稳定版过滤预发布；退出保护其他客户端与活跃任务。                                                                        |
| 平台与沙箱                | 保留 SDK 自动回退和正常权限策略，不增加 Node 安装 gate。Linux 自绘窗口按钮继续使用原生窗口控制。Windows 成品已实测；其他平台真机仍待验证。                                                                                  |

## 此轮补齐的遗漏

1. 首次凭据多路读取产生来源固定 CAS 竞争。Main 共用初始化；仅 SDK CredentialUpdateConflictError 可在原连接指纹和原 scope 下自动重读一次。显式编辑、删除、共享的修订校验不变，不缓存旧 Key、不换号、不重放请求。
2. 模型选择器读取 canonical view 的 activity.reasoning；真实 Session 缺整个 view 或 reasoning 时保持未知，旧事件兼容只限明确 Mock。浏览器 RED/GREEN 覆盖缺失事实、异 Provider、fallback、verified:false 和用户选择值保留。
3. Provider 配置异步读取可能观察到 SDK 持锁截断写的中间 JSON。跨进程受控回归先 RED；现在使用公开 SDK 同一锁同步读取，仅锁忙短暂重试四次，坏 JSON/IO 仍拒绝且不输出原文。原 Electron 两次失败没有保留底层错误，受控复现不等于逐次溯源。
4. 自定义 Provider 发图片前错误调用 getProvider。真实 SDK 注册连接回归先 RED；改 resolveProvider 后，自定义视觉模型、模型级 none、未知 Provider 和 Mock 的专项通过。最终包实际图片发送、缩略图、原图和 reload 验证通过，错误时草稿保留。
5. 打包探针迁移到 ensureKodaXRuntime、合法 product surface 和 SDK 的精确 owner 退出证据。退出夹具改从 auth.json 的保留客户端绑定读取密钥；topology data_changed 仅对指定 Session 做有界只读重读；旧历史 fixture 的 seed 移到 Host 启动前。未通过放宽运行断言或增加 writer 消除失败。

## 验证结果

| 检查点                               | 实际结果                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正式版本/完整 Registry 字节          | 通过；依赖版本要求先 RED 后 GREEN，2 项通过。                                                                                                                             |
| 工作区完整回归（配置 reader 修复后） | Desktop 4069 项：4056 通过、13 跳过、0 失败；IPC schema 371 全通过。830.7s。                                                                                              |
| 随后图片小修复                       | 两项真实 SDK RED/GREEN，最新 typecheck、lint 和 Main 构建通过；没有冒称整库又跑一遍。Renderer 无后续生产改动，已有最终构建通过。                                          |
| release 与探针契约                   | test:release 137 项：130 通过、7 跳过；打包探针相关 8 项通过。                                                                                                            |
| 凭据/配置专项                        | 21 项通过；两文件合计行覆盖率 87.57%、分支 81.52%、函数 90.00%。file-credentials 行 91.77%，provider-storage 行 84.12%。此前 27 项较宽集合的旧覆盖数字不合并。            |
| 源码定向 Electron                    | 8 项通过：工作面四项、凭据 IPC/重启、Coder builtin Skill、问题 Skip。                                                                                                     |
| 扩展包内回归                         | 99 项：93 通过、3 跳过、3 失败、0 flaky，1631.8s。三个失败分别为 snapshot topology 旧夹具、Host 后 seed 旧夹具、自定义 Provider 图片 getter，证据保留。不能写成一次全绿。 |
| 最新 Windows 完整打包流程            | build:pack -- --win --x64 返回 0；Runtime/资源/Worker/SQLite/Artifact 完整 smoke 通过，最终 Product 生命周期 6 项全通过。                                                 |
| 最新包失败项复验                     | 4 项全通过、0 跳过/失败/重试，68.5s：流式估算、用户图片及两项空记录/侧栏历史。对应前轮三个失败均已复验。                                                                  |
| 代码复核                             | 各生产/夹具增量分别经独立 Standards/Spec 双轴复核。测试职责分离、去掉固定持锁窗口两项 finding 已修复，最终无未解决发现。                                                  |

172 项 Electron 用例分段执行，早段源码回归、扩展成品及定向复验分别留证；没有宣称最新成品一次执行整套 172 项全绿。Node 与成品 Electron 并行期间使用独立 SQLite 二进制，前后 hash/inode 不变；其余切换 ABI 的构建/源码阶段串行进行。

最新 Runtime smoke：alpha.12 daemon/process，constructed handler 不在主线程，Session round-trip、history boundaries/cursor 有效，integration health=healthy；首次和重启后 exit settlement 均 clean。Windows 沙箱实际执行，backend=windows-restricted-user，保留 SDK 的 normal-permission-policy 回退策略。原始 JSON：`out/kodax-runtime-smoke.json`。

最新冷启动：Renderer 7370ms，Runtime 29666ms，含确定性的 20000ms Host test hold，122 条历史 child 记录保留。不能把它解释为历史首次读取完成或 Issue 371 关闭。

## 最终产物

均在当前工作区 `out/`；Main 已与 ASAR 逐字节比较，SDK client/runtime/llm 入口与正式安装目录逐字节相同。

- Setup：`KodaX-Space-Setup-0.1.47-alpha.3.exe`，214607200 bytes，SHA-256 `9490607a20737c0b9874c80ecad8995583d2d654d048df33be8dfdebd1ba6c06`。
- Portable：`KodaX-Space-Portable-0.1.47-alpha.3.exe`，214397283 bytes，SHA-256 `63b5b48f47cc3bbcd68eccaa1a3598d187bbdbb99a4077328edb85261386ca93`。
- 成品程序：`out/win-unpacked/KodaX Space.exe`。Main SHA-256 `189b71cda9d4f352c8de1c4669d5bc05ce0fc9c415039ca56419f97b50b30f23`。
- 原始日志、Registry/Host/成品 manifest、截图和失败 trace：`artifacts/diagnostics/alpha12-release/`。原候选 alpha12 目录和首轮失败证据保留，未覆盖。

## 仍未闭环

1. 正式 alpha.12 缺可信专家默认 Skill 声明及 after-turn 真消费时的最新已提交专家/连接器绑定；普通 Partner/prompt-only 可用，带默认方法的专家不能静默丢方法。恢复需保留原业务绑定，不能借同名工具冒充。
2. 正式 alpha.12 缺 Quick Ask 的 Host promotion/tag 更新命令；Space 保留同一会话和回答，只有确认 promoted 才 handoff，不 saveSession 直写。
3. SDK 部分配置 writer 仍截断重写，损坏读取的空对象降级也需上游修正。Space reader 的同锁保护不能代替 writer 的原子替换。

前两组完整需求/验收见 [Partner 与 Session 交接](kodax-alpha12-partner-sdk-handoff.md)，第三组见 [配置原子性交接](kodax-alpha12-config-atomicity-handoff.md)。后续 SDK 源码支持、正式发布和 Space 实际启用仍分别确认。

Issue 371 历史首次读取性能、Linux/Kylin/macOS/ARM 真机、真实 OAuth/云 principal 和外部服务权益仍未在本机离线验收。当前安装包用于本轮验证，不能据此标记所有专家/Quick Ask 或全部跨平台问题已完成。
