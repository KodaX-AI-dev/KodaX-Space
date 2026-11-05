# Space 适配统一 Host：上游 SDK 契约、发布边界与阻塞（2026-10-31）

结论摘要：Space 当前安装的是实体 Registry `@kodax-ai/kodax@0.7.97-alpha.11`，不是 dev-link；它仍保留旧 owner API。已提交统一 Host 基线 `f6a010462` 退役公开 inline owner，却仍拒绝 Partner Session；Partner 准入、profile 组合、实际 Run 配置快照依赖后续未提交工作区，且该工作区仍存在 Partner 能力广告与执行准入不一致。迁移应先冻结可发布 SDK 契约，再选择单连接适配，不应把相同版本号或两个连接当成已解决的兼容方案。证据：[I] `package.json:3,29-73`、`dist/sdk-runtime.d.ts:1313-1426,3087`；[U] `src/sdk-runtime.ts:4140-4153,21392-21413`；[W] `src/sdk-client.ts:16-17`、`src/runtime-daemon/server.ts:2677-2678,2796-2800`、`src/sdk-runtime.ts:21444-21457`；dev-link 只读观察见下文。

状态：**调研笔记／迁移提案输入，不是接受设计、发布证明或 Space 已完成迁移的声明。** 本次阅读源码、Git 对象、声明与 manifest，运行纯文件系统检查及 OS 临时目录中的 TypeScript noEmit 声明探针；未安装、build、启动 Host、调用模型、改代码／配置、操作用户会话或提交 Git。

## 1. 来源与版本边界

本笔记的 `文件:行` 必须连同以下来源标签理解，不能把 `[W]` 当成 `[U]`：

| 标签 | 来源根／版本 | 含义 |
| --- | --- | --- |
| `[S]` | `C:/Works/GitProj/KodaX-AI/KodaX-Space`，HEAD `7801a8ca099c4ecf47af5b1e361ff6812f8c12b9` | Space 当前源码；初始状态另有 `tests/fixtures/file-preview/fixture.txt` 未提交修改，未触碰 |
| `[I]` | `[S]/node_modules/@kodax-ai/kodax`，安装 manifest `0.7.97-alpha.11` | 实际安装文件／公开声明；不能从版本反推新源码 |
| `[U]` | `C:/Works/GitProj/KodaX-AI/KodaX` 的 Git commit `f6a010462a477bd1b36dd849a6c9c0dbb0f76808`（`feat(runtime)!: unify public execution on the shared Host`） | 已提交统一 Host 契约；使用 `git show f6a010462:<path>` 读取 |
| `[F]` | `C:/Users/ADMIN/.codex/worktrees/unified-host-final/KodaX`，checkout HEAD `466b874d07699420e2470364c892247577e44580` | 冻结验收工作区；不是名为 f6 的 checkout。下列十个目标文件的工作区 blob 与 `[U]` 相等 |
| `[W]` | `C:/Works/GitProj/KodaX-AI/KodaX`，HEAD 仍为 f6，2026-10-31 读取的未提交工作区 | 后续组合契约与其他任务共存；未经本次运行验证，也未证明已发布 |

`[F]` 与 `[U]` 比较相等的目标：`src/sdk-runtime.ts`、`src/sdk-runtime-public.ts`、`src/sdk-client.ts`、`src/client-host-authorization.ts`、`src/client-runtime-adapter.ts`、`packages/coding/src/work-mode.ts`、`packages/coding/src/client-contract.ts`、`docs/SDK_MIGRATION.md`、`scripts/build-bundle.mjs`、`scripts/build-dts.mjs`。方法是 `git rev-parse f6a010462:<file>` 对比 `git hash-object <F/file>`；这是指定文件内容相等，不代表两个 checkout 的 HEAD 或整个工作区相等。

为避免未提交来源漂移，`[W]` 关键文件在本轮读取的 Git blob 如下：

| 文件 | blob |
| --- | --- |
| `src/execution-profile.ts` | `2dbbdafc3481b638aca935d45c75b2eb8bcc452d` |
| `src/client-host-authorization.ts` | `96e584177ed7889ded171a6cbd38e060fe3b9bb7` |
| `src/client-runtime-adapter.ts` | `2c66677b745431de4c94b83dc55daee1ffeee10f` |
| `src/sdk-runtime.ts` | `56d9ae2f43b94322bf02c3df559cdf86cdfd89b0` |
| `packages/coding/src/execution-profile-contract.ts` | `275243b88b2fad8d4c62a69ec538818355b46151` |
| `packages/coding/src/client-contract.ts` | `ae9e2c4db835446f1763e5ae2343b01d08748cb4` |
| `src/client-settings.ts` | `092e68551c162279630c25df1ecb6d77f7cbf0c5` |
| `src/execution-config.ts` | `714d6f109e5c1e32901909eb58a71572308c3d26` |
| `src/runtime-daemon/server.ts` | `c99a4148777233d01f0e9b20e072593d2755409a` |
| `src/runtime-daemon/client.ts` | `c23ead0a0838363e128507459c47f3aecfb03cb9` |
| `docs/SDK_MIGRATION.md` | `37d94a31ce8f2b4c0d11180662f084987ffafe29` |

## 2. 实际安装和发布包：不是 dev-link，也不是最新统一 Host

1. Space root 与 Desktop 精确依赖 alpha.11；npm lock 记录 Registry tarball 和 integrity。pnpm lock 还记录更早 alpha.7，不能用它推断当前 npm 安装事实。证据：[S] `package.json:59`、`apps/desktop/package.json:16`、`package-lock.json:2153-2156`、`pnpm-lock.yaml:518,3445`。
2. 在 `2026-10-31T00:52:10.294Z` 运行 Space 自有纯检查函数 `inspectKodaxDevLink(spaceRoot,sdkDir)`，得到 `{linked:false}`；SDK 根、`dist`、`node_modules`、`scripts` 的 `realpath` 均留在本 SDK 实体路径内，`lstat.isSymbolicLink()` 均 false，`.kodax-space-dev-link` 不存在。检查同时覆盖直接 link 与 staging 子目录 link，不是只看 SDK 根的 PowerShell 属性。证据：本地只读观察；检测算法 [S] `scripts/kodax-dev-link-state.mjs:4,19-28,43-101`，实际布局协议 [S] `scripts/link-kodax.mjs:64-70,111-133`。
3. `[I]` 仍公开 `acquireKodaXInlineOwner/enableKodaXDaemonOwner/setKodaXRuntimeOwnerMode`，且 `CreateKodaXRuntimeOptions` 仍含旧 `mode/sharedDaemonHost/daemonHostRuntimeId/externalAgents`；`/client` 没有 `createExecutionProfile`，授权服务仅 credentials/hostTools，`ClientRunStatus` 没有实际 workMode/effectiveConfig。安装 alpha.11 不能证明具备 `[U]` 或 `[W]`。证据：[I] `dist/sdk-runtime.d.ts:1313-1426,3087`、`dist/sdk-client.d.ts:14-45`、`dist/types-chunks/runtime-client-info-vWqPfxSv.d.ts:116-127,171-174`、`dist/types-chunks/client-contract-CenyRbib.d.ts:1694-1709,1931-1934`。
4. `[U]` manifest 版本仍是 alpha.11，但文档明确 Host 收口未发布；构建把 `/runtime` 的 JS 与 d.ts 都路由到 `sdk-runtime-public.ts`，不是直接导出内部 owner 装配模块。主包 exports 提供 `/client`、`/runtime` 及独立库子路径，未提供 `client-runtime-adapter` 深路径。证据：[U] `package.json:3,29-103`、`docs/SDK_MIGRATION.md:3,7-19`、`scripts/build-bundle.mjs:471-474`、`scripts/build-dts.mjs:95-96`。
5. release 脚本会在发布打包路径设置 `private=false`；本地 root `private:true` 与安装 manifest `private:false` 不矛盾。Space 正式 pack 使用 package-lock，并对 dev-link 恢复实体包；不能以开发 link 产物代替发行验收。证据：[U] `scripts/release.mjs:292`、`package.json:6`；[I] `package.json:6`；[S] `scripts/pack.mjs:14-18,33,165-178`。

6. 父级在 2026-10-31 通过第一方 Registry 元数据执行 `npm view @kodax-ai/kodax dist-tags --json`（exit 0），返回 `latest=0.7.96`、`alpha=0.7.97-alpha.11`、`hotfix=0.7.72-hotfix.0`；没有新的 alpha tag。该事实证明查询时的 dist-tag，不等于核验所有无 tag 版本或远端 tarball 字节。发布候选应分配新的唯一版本并验证产物，不能用“仍是 alpha.11”把本地新源码冒充现有发行内容。来源：父级共享的一手 npm Registry 只读查询结果；本地已安装与锁文件对照见 [I] `package.json:3`、[S] `package-lock.json:2153-2156`；[U] `docs/SDK_MIGRATION.md:3,7-19` 明确未发布边界。

## 3. 公开 API 逐项迁移映射

| 旧／现有调用目的 | `[U]` 已提交契约 | `[W]` 后续变化／Space 影响 | 一手证据 |
| --- | --- | --- | --- |
| UI／自动化产品业务 | `/client` 的 `ensureKodaXClient` 启动或正常升级；`connectKodaXClient` 只连接 | 产品合同仍是 KodaXProductClient；不是旧 Runtime 对象改类型名 | [U] `src/sdk-client.ts:18-37,50-74`、`docs/SDK_MIGRATION.md:67-81` |
| 可信 Main 的底层连接／凭据桥／Host Tools／诊断 | `/runtime` 的 ensure/connect 连接同一个共享 Host；被动 connect 拒绝 autoStart:true／daemonLifecycle | 业务适配可暂保留同一低层连接，但须显式遵守产品授权／观察语义 | [U] `src/sdk-runtime.ts:973-1002,5870-5886`；[S] `apps/desktop/electron/kodax/runtime-host-adapter.ts:1713-1743` |
| `createKodaXRuntime()`／`mode:'embedded'` | 公开构造只接受必填 `mode:'daemon'`；旧 JS 调用抛 `RuntimeHostMigrationRequiredError` / `runtime_host_migration_required` | 不能连接失败后创建第二个私有 Runtime | [U] `src/sdk-runtime.ts:510-518,888-925,4140-4153` |
| `mode:'daemon'` 兼容构造 | 薄委托共享启动器，execPolicy/autoReview 只在新 owner bootstrap；attach 不能改管理员策略 | 无需保留 Space 自己的 inline↔daemon 控制职责 | [U] `src/sdk-runtime.ts:949-970,4155-4170` |
| `sharedDaemonHost`／`daemonHostRuntimeId`／构造时 `externalAgents` | 只属于内部 `CreateKodaXHostRuntimeOptions`，公开字段存在即拒绝，即使值 false | 函数型 executor 工厂不能通过序列化迁过去；配置化 A2A 留在 Host，独立 `/agent` 库可继续用 | [U] `src/sdk-runtime.ts:927-934,4148-4153`、`docs/SDK_MIGRATION.md:17-19` |
| acquire/set/enable owner API | 根入口和 `/runtime` 均不再导出；`getKodaXRuntimeOwnerState` 保留只读事实 | Space 仍在调用 acquire/enable，更新包后会直接断编译／运行，不是无害遗留 | [U] `src/sdk-runtime-public.ts:1-28`、`src/index.ts:31-40`、`tests/runtime-public-entry.test.ts:5-16`；[S] `apps/desktop/electron/kodax/runtime-host-adapter.ts:1791-1803,2772,7904` |
| `KodaXRuntimeMode/Isolation` 类型 | 公共类型列表仍包含它们，用于既有身份投影；不恢复私有构造 | 不能仅看到 embedded/inline 字面量还在类型文件就判定 owner 能力未退役 | [U] `src/sdk-runtime.ts:586-587,888-925`、`src/sdk-runtime-public.ts:40-41` |
| Partner `surface/profileId` | f6 共享 Session admission 明确拒绝 Partner | W 才允许 surface:'partner'，并将 opaque profileId 与权限分离；仍有广告矛盾，见阻塞 | [U] `src/sdk-runtime.ts:21392-21413,21519-21527`；[W] `src/sdk-runtime.ts:21444-21457` |
| persona／验证／工具上限 | f6 授权无 profile 载体 | W `/client` 新导出 `createExecutionProfile`，授权新增结构化 profile；不要把它误认为 lease ID／任意 Run options | [U] `src/client-host-authorization.ts:173-200`；[W] `src/sdk-client.ts:16-17`、`src/client-host-authorization.ts:8-22,190-218` |
| 现有 toolVisibilityPolicy 函数 | 不应穿 IPC／daemon 传函数 | W 在可信 Main 根据 Host 实际目录评估，传允许 names+metadata 快照；纯 builder 对有 predicate/excludeTools 的源要求 catalog | [W] `src/execution-profile.ts:9-30`、`src/client-runtime-adapter.ts:20-50` |
| Host Tools 注册／调用 | `register/resume/revoke` 返回／使用 lease；lease.tools 可用于组装 profile | descriptor 的 sideEffect 是 none/idempotent/non_idempotent；profile 元数据转换为 none→readonly+planAllowed，其余→mutates-state+false；不要直接混用两个枚举 | [W] `src/client-host-authorization.ts:127-180`、`src/execution-profile.ts:4-6`；[I] `dist/types-chunks/runtime-client-info-vWqPfxSv.d.ts:71-76` |
| Session 工作模式 | `sessions.updateSettings` workMode agent/coding/script；按 advertised settings keys 拒绝旧 Host | profile 与工作面取交集；独立 SDK 显式旧 profile 需 `workModePolicy:'intersect'` 才沿选定工作面；专用子 Agent 保留声明 | [U] `docs/SDK_MIGRATION.md:83-89`；[W] `packages/coding/src/work-mode.ts:3-18`、`src/runtime-daemon/server.ts:2562-2575`；[S] `apps/desktop/electron/kodax/runtime/work-mode.ts:12-44` |
| 运行的实际工具／模式 | f6 Session 设置不是实际 Run 装配证明 | W `runs.read().workMode/effectiveConfig` 持久化最后实际装配；toolScope 含 deferred/Script 叶工具，modelToolScope 是真实模型 schema，可缺失；旧 Run 缺失应显示未知 | [W] `packages/coding/src/client-contract.ts:832-837`、`packages/coding/src/execution-profile-contract.ts:4-14`、`src/sdk-runtime.ts:18214-18226,18263-18264,18747-18748,20659-20667,23354-23355` |
| 配置已保存 vs 已生效 | f6 `config.read` 与 readEffective 本已分开 | W 新 application 逐字段 immediate/next_run/extension_reload/restart；数值 maxOutputTokens 不是认证 token；不能把保存成功显示为正在运行的配置已更新 | [U] `docs/SDK_MIGRATION.md:208`；[W] `src/client-settings.ts:21-35`、`src/execution-config.ts:16-35`、`src/client-runtime-adapter.ts:274-292`、`packages/coding/src/client-contract.ts:1055-1062` |
| Actor checkpoint 恢复 | f6 内部有恢复语义，但不足以证明代理全部保真 | W 代理保留 resumeCheckpoint，要求 actorCheckpointRecovery v1；独立 Actor admission 拒绝根 profile/workflow policy | [W] `src/runtime-daemon/client.ts:1360-1372`、`src/runtime-daemon/server.ts:2401-2408,2678` |

## 4. `[W]` profile 组合的必须保留语义

- `RuntimeExecutionProfile` 是 agentProfile/taskVerification/tools/toolMetadata 的可 structuredClone 数据；`RuntimeExecutionProfileSource` 才含本地 predicate/excludeTools。profile 不等于 lease，lease 引用仍独立在 `authorization.credential/hostTools`。证据：[W] `src/client-host-authorization.ts:8-22,190-200`、`src/execution-profile.ts:19-23`。
- 可信 helper 使用 **该 Session 的 Host 实际目录**，加本次 lease 工具；拒绝同名碰撞，再在 Main 评估 predicate。不能用 Electron 本地 coding registry 代替 Host catalog。Host 新 RPC 是 `tool.catalog`，Runtime catalog 的 executionTools 为可选能力，缺少时明确失败。证据：[W] `src/client-runtime-adapter.ts:25-43`、`src/sdk-runtime.ts:1330,5580-5592`、`src/runtime-daemon/protocol.ts:139,499`、`src/runtime-daemon/client.ts:1187`。
- persona-only profile 不制造工具白名单；显式 tools（包括独立 authorization.tools）与 profile、workMode、Host 既有限制取交集，空数组拒绝全部。profile 判定还核对 name、sideEffect、planModeAllowed，不能新工具出现后自动放宽已准入 Run。证据：[W] `src/execution-profile.ts:14-30`、`src/runtime-daemon/server.ts:2421-2438,2513-2514,2566-2574`。
- Host 对根 profile 绑定 `workModePolicy:'intersect'`，并在 lease 表和目标调用路径重检；独立 `agent_spawn/agent_followup` 不带根 persona profile，专用子 Agent 继续自己的声明，派生限制不能凭桥接绕过。证据：[W] `src/runtime-daemon/server.ts:2401-2408,2513-2514,2566-2575`；`packages/coding/src/work-mode.ts:12-18`；原生/MCP/Actor 组合回归目标见 `[W] tests/sdk-profile-contract.e2e.test.ts:57,118-209`，仅说明测试意图，本次未运行。
- `productExecutionProfile.version===2` 是实际 Host 门禁；`createExecutionProfile` helper 和返回含 profile/tools 的授权都检查它并抛 `daemon_upgrade_required`。静态 KODAX_RUNTIME_SDK_CAPABILITIES 的既有清单或 `productClient v1` 不证明该契约；本 snapshot 的 RuntimeCapabilityRequirements 未新增 productExecutionProfile 字段。证据：[W] `src/client-runtime-adapter.ts:25-48`、`src/sdk-runtime.ts:1007-1092,4315-4316`、`src/runtime-daemon/server.ts:2662-2678`。
- Product/IPC 输入不能自己携带授权：W adapter 在调用可信授权函数前清除 authorization、credentials、profile、agentProfile、workModePolicy、toolVisibilityPolicy、tools 等字段。Space 若保留手动 adapter，需保持同等来源约束。证据：[W] `src/client-runtime-adapter.ts:20-24`；[S] `apps/desktop/electron/kodax/runtime-host-adapter.ts:6234-6326`。

- builder 只复制 profile/verification/工具上限，不是整个旧 context 的序列化器。Space 旧 context 还包含 promptOverlay、skillsPrompt、skillInvocation、外部 executor binding、shell/context 等；这些需分别迁到 Host 对应机制，不能假定调用 createExecutionProfile(existingContext) 会保留。证据：[W] `src/execution-profile.ts:19-23`、`src/client-host-authorization.ts:17-22`；[S] `apps/desktop/electron/kodax/real-session.ts:2546-2578`。

## 5. 单连接 ownership：可行方案与不存在的入口

### 5.1 API 事实

- `toKodaXProductClient(runtime,authorize)` 存在于内部源码，但 f6 及 W 的 `/client` 都未公开重导出；package exports 没有其深路径。`ensure/connectKodaXClient` 总是自己建立连接，公开 options 没有 runtime 或 transport 参数。因此不能发明公开 `toClient(existingRuntime)`。证据：[U] `src/client-runtime-adapter.ts:12-15`、`src/sdk-client.ts:13-37,50-74`、`package.json:29-103`；[W] `src/sdk-client.ts:13-39`。
- ProductClient 没有公开 Runtime 的 identity/capabilities/connection/raw event service；其 observe、workflow/learning subscription、disconnect 有自己边界。底层 Runtime 诊断的 `captureRuntimeSessionDiagnostics` 仍要求 KodaXRuntime。证据：[U] `packages/coding/src/client-contract.ts:117-287`、`src/client-runtime-adapter.ts:57-71,356`、`src/sdk-runtime.ts:3512-3520`。W 授权 services 可取得 identity.runtimeId，但不是通用 Runtime 暴露。证据：[W] `src/client-host-authorization.ts:213-218`。
- **不能用同一 instanceId+instanceSecret 同时维持 Product 和 Runtime 两条连接。** Host 用 principal+secret 的 stable key 维护 reverse bridge，后 attach 会替换前 transport 并触发旧 RPC close/disconnect；是重连接管设计。证据：[U] `src/runtime-daemon/reverse-bridge.ts:855-894`、`src/runtime-daemon/server.ts:768-788`；回归定义 `[U] src/runtime-daemon/server.test.ts:194-218`。
- 换成不同身份虽可避免接管，却会成为额外连接／principal。preflight 计 clients.length，多个连接产生 connected_clients；退出专用 stop 仅排除相同 principal 的连接，其他身份会保护 Host。租约也归各自 reverse bridge／principal，不能默认跨连接复用。证据：[U] `src/runtime-daemon/management.ts:92-98,230-240,386-398`、`src/runtime-daemon/reverse-bridge.ts:832-842,855-878`。即使 same principal 的退出排除规则存在，也不能抵消同 stable identity 的互踢。

### 5.2 最小保守落地提案（需主方案接受，不是现有接受设计）

**方案 A：保留单 Runtime transport 和现有 RuntimeHostAdapter，使用 W 公开纯 builder 组合 profile。** 这是当前公开 API 下可以增量实施的方案，不要求新建公开 facade 或双连接：

1. 沿现有 ensure/connectKodaXRuntime 建立一个稳定 Main 连接，保留 lease/event/exit ownership。现有 Space 已这样连接，业务手动调用 runs.acceptInput/start/recover。证据：[S] `apps/desktop/electron/kodax/runtime-host-adapter.ts:1713-1743,2365-2432,6484-6494,6588-6602,7075-7082`。
2. 在可信授权边界显式检查 productExecutionProfile v2；读取 `runtime.catalog.executionTools(sessionId)`，合并已注册 lease.tools（使用上述元数据转换），对同名碰撞拒绝，再调用 `/client` 的公开同步 `createExecutionProfile(context,catalog)`。该提案复刻 W helper 的负载条件，不能只把 `runtime` 传成 services 后调用不存在的 `services.createExecutionProfile`。证据：[W] `src/sdk-client.ts:16-17`、`src/execution-profile.ts:4-23`、`src/client-runtime-adapter.ts:25-48`。
3. 将 resulting authorization.profile 作为原授权快照的一部分，进入 input capture、steer 原授权、Host 身份变更后的 lease 重绑及 checkpoint 恢复；独立 Actor 返回自己的授权。证据：[S] `apps/desktop/electron/kodax/runtime-host-adapter.ts:6245-6275,6318-6326,6362-6384,6588-6602`；[W] `src/runtime-daemon/server.ts:2401-2408,2421-2446`。
4. 继续一个业务输入来源、一个 Session 观察者／投影来源，不为 profile 增加第二份 SessionStorage／结果日志；把 product API 行为映射列为明确适配验收。证据：[U] `docs/SDK_MIGRATION.md:169-186,238-246`；[S] 当前单连接提交与观察需求绑定 `apps/desktop/electron/kodax/runtime-host-adapter.ts:7075-7095`。

代价：Space 继续维护 W `/client` adapter 已实现的输入清洗、能力门禁、授权投影及业务域映射，还需对齐官方恢复策略；此方案不是“已直接使用 KodaXProductClient”。公开 pure builder 能避免复制 predicate 求值本体，却不能自动带来 `/client` 全套恢复胶水。证据：[W] `src/client-runtime-adapter.ts:17-50`；[U] `src/sdk-client.ts:51-55`、`src/recovering-runtime-client.ts:121`。

**方案 B：业务完全改为唯一 ProductClient 连接。** 应通过 authorizeExecution 提供的 credentials/hostTools/profile 服务注册并绑定租约，观察使用 Product observe；不维持同身份 passive Runtime。需要另行盘点必须保留的底层诊断、启动参数和 raw event 功能，缺少的公开接缝作为上游需求。`/client` options 没有 sessionsDir、daemonLifecycle、requirements、transport，不能把 Runtime 的整组启动参数强行传入并声称已受支持。证据：[U] `src/sdk-client.ts:18-37,50-74`、`src/sdk-runtime.ts:973-1002`、`packages/coding/src/client-contract.ts:117-287`；[S] 现有 sessionsDir 与 interactive 生命周期 `apps/desktop/electron/kodax/runtime-host-adapter.ts:2370-2374`。

**方案 C：新增公开“同 transport 生成 Product facade／单连接双视图”契约。** 仅是后续上游设计选项；当前不能依赖。它可能减少 Space 自有产品投影代码，同时保留诊断，但必须设计关闭、恢复、lease、事件订阅唯一 ownership；不能把内部函数 deep import 当成发布合同。依据是 5.1 所列公开缺口，不是当前 SDK 承诺。

## 6. 阻塞与验收门槛

| 阻塞／风险 | 当前证据 | 迁移前门槛 |
| --- | --- | --- |
| SDK 产物基线未冻结 | `[I]`、`[U]`、`[W]` 同版本字符串却有不同 API；W 混有多项任务未提交改动 | 选定 commit/构建指纹和 tarball；核对 JS+d.ts+manifest+真实 Host 握手，不以版本号替代 |
| f6 不支持共享 Partner | [U] `src/sdk-runtime.ts:21402-21413` | Partner 迁移需后续准入合同；不能只合 f6 后删 inline 例外就认为完成 |
| W Partner 广告与实际准入冲突 | [W] `src/sdk-runtime.ts:21452-21456` 允许 partner；`src/runtime-daemon/server.ts:152-161,2796-2800` 仍广告 CODER surfaces、partnerDenied:true | 上游修正并用独立 Host 进程验收 create/list/read/observe/execute/recover 与握手一致；Space 不能无视 partnerDenied 硬接通 |
| profile 桥未接入 Space 原授权链 | [S] `runtime-host-adapter.ts:6318-6326` 仅 credential/hostTools/workflowHostPolicy；[W] profile 服务是新增 | 快照进入 capture/steer/recovery；旧 Host 明确升级错误；原生/MCP/子任务限制一致 |
| Host tool 实现仍硬拒绝 Partner | [S] `apps/desktop/electron/kodax/runtime/space-host-tools.ts:134-150` | 将 Partner 的注册、实现、产物路径、身份、权限语义一起迁移；仅把 descriptor 挂 lease 不够 |
| owner API 仍在 Space 主路径 | [S] `runtime-host-adapter.ts:1791-1803,2772,7904` | 删除旧 inline/daemon 切换责任并验收旧 owner-policy 的迁移结果；保留状态读取不等于保留切换 |
| 单连接与产品边界选择未决 | 5.1 的公开 API／接管逻辑 | 在 A/B/C 中明确选择；禁止隐式双连接或 deep import；确认退出保护不误判本应用第二连接 |
| UI 把所选模式当实际执行事实 | [S] `runtime/work-mode.ts:23-29` 读 Session 选择；[W] 新 ClientRunStatus 有实际字段 | 保留 desired vs actual vs unknown，重连／重启后从 Host Run 读实际快照；不凭 Session 值补造 |
| 配置生效边界扩展 | [W] `src/client-settings.ts:30-35`、`src/client-runtime-adapter.ts:274-292` | 保存反馈与实际生效分开；旧 Host application 缺失保持未知；新 Run 捕获／活跃 Run不变需回归 |

广告冲突的排除过程：initialize 与 runtime.capabilities 都调用同一个 `runtimeDaemonCapabilities`，productExecutionProfile v2 是独立字段，不会覆盖 sessionAdmission。最后的 safeOverrides 允许显式 dispatcher override，但本轮普通 Host 源码未发现传入修正的 Partner admission 值；`sessionAdmission` 没有另一份 v2 广告。证据：[W] `src/runtime-daemon/server.ts:1024-1036,1099-1110,2630-2678,2796-2800,2950`；`rg 'sessionAdmission:|partnerDenied' src --glob '!*.test.ts'` 仅发现该广告与内部 admission 依赖。

## 7. 父方案需要统筹的全链条接口点

1. **运行入口与持久化身份：** Space facade 可保留，但确定唯一 Host 连接和 profile/home/sessionsRoot；稳定 Main client identity、退出回执、原授权 capture 不能各自切换到不同数据根。证据：[S] `runtime-host-adapter.ts:2203-2218,2365-2381`；[U] `src/sdk-client.ts:39-47`、`src/sdk-runtime.ts:5899-5906`。
2. **Partner context → 可信 profile → Host 执行：** 现有 persona/verification/显式策略由 Main 解析，不能由 Renderer 提交；授权包含 credential lease、HostTool lease 和 profile 快照。证据：[S] `apps/desktop/electron/kodax/partner-profile.ts:3-9,138-139`、`runtime-host-adapter.ts:6234-6326`；[W] `src/client-runtime-adapter.ts:20-50`。
3. **HostTools → 实际产物交付：** Space host descriptor、handler 运行上下文、artifact store/通知、Partner 工具实施路径要一起检查；当前通用 Space lease handler 显式排除 Partner，不能只验证模型看到了 schema。证据：[S] `runtime/space-host-tools.ts:49-67,95-103,129-151,160-164`。
4. **输入／steer／recovery → 授权快照复用：** 不丢 inputId、不自动重提，不把根 profile 注入独立 Actor；新 Host identity 后重新注册 lease，保留同一 intent。证据：[S] `runtime-host-adapter.ts:6245-6275,6484-6496,6588-6604`；[W] `src/client-host-authorization.ts:202-218`、`src/runtime-daemon/server.ts:2401-2408`。
5. **实际 Run配置 → IPC → UI → 重启后回读：** workMode/effectiveConfig 是新可选事实，模型 schema 工具与可执行叶工具分开；旧记录保持未知；config.application 是默认配置应用边界，不能和每 Run effectiveConfig 混为一项。证据：[W] `packages/coding/src/client-contract.ts:832-837,1055-1062`、`packages/coding/src/execution-profile-contract.ts:4-14`。
6. **发布与兼容门禁：** SDK 声明、Space runtime sdk probe、Host 实际 capabilities、工作模式 keys、Partner admission 广告及实际行为都须同一构建。SDK 的 protocol version 仍为 1，wire v1 不证明业务能力同版；build origin/fingerprint 另有启动校验。证据：[U] `src/runtime-daemon/protocol.ts:1-2`、`src/runtime-build-identity.ts:7-8,97-98`、`src/sdk-runtime.ts:6124-6145`；[S] `runtime-host-adapter.ts:1510-1585,1746-1787,2387-2432`。

## 8. 声明边界 noEmit 探针（已实际执行）

2026-10-31 用 Space 已安装 TypeScript `5.9.3` 的 `createProgram` 运行 `strict/noEmit/skipLibCheck/NodeNext`，同一组 9 个最小消费代码分别把 `/runtime` 解析到 `[I] dist/sdk-runtime.d.ts` 和 `[F] dist/sdk-runtime.d.ts`；脚本、临时 `.mts` 及 JSON 都只写 OS temp。没有 import 执行 SDK JS、没有启动 Host、没有全量 Space typecheck，也没有改动构建产物。没有 fixture 外的 TypeScript 诊断。原始结果留在 `C:/Users/ADMIN/AppData/Local/Temp/kodax-space-sdk-contract-20261031-cf8b9ab5fc194941b51035a7ea4a7242/results.json`。

| 消费代码 | 已安装 alpha.11 声明 | 冻结工作区现有公开声明 | 对应源码／声明 |
| --- | --- | --- | --- |
| import 三个 owner 函数 | GREEN | RED，TS2305/2724 | [I] `dist/sdk-runtime.d.ts:3087`；[U] `src/sdk-runtime-public.ts:1-28` |
| import type RuntimeInlineOwnerHandle | GREEN | RED，TS2305 | [I] `dist/sdk-runtime.d.ts:1313-1325`；[U] `src/sdk-runtime-public.ts:30-312` 的公开类型清单不含此 handle |
| createKodaXRuntime() | GREEN | RED，TS2554 必填参数 | [I] `dist/sdk-runtime.d.ts:3082`；[F] `dist/types-chunks/sdk-runtime-Dg6VsMnk.d.ts:2210`；[U] `src/sdk-runtime.ts:4140-4142` |
| options={mode:'embedded'} | GREEN | RED，TS2322 | [I] `dist/sdk-runtime.d.ts:1391-1392`；[F] `dist/types-chunks/sdk-runtime-Dg6VsMnk.d.ts:525-529`；[U] `src/sdk-runtime.ts:888-892` |
| daemon options 含 sharedDaemonHost | GREEN | RED，TS2353 | [I] `dist/sdk-runtime.d.ts:1404`；[U] `src/sdk-runtime.ts:888-925,4148-4153` |
| daemon options 含 daemonHostRuntimeId | GREEN | RED，TS2353 | [I] `dist/sdk-runtime.d.ts:1406`；[U] `src/sdk-runtime.ts:888-925,4148-4153` |
| daemon options 含 externalAgents:undefined | GREEN | RED，TS2353 字段已移除 | [I] `dist/sdk-runtime.d.ts:1425-1426`；[U] `src/sdk-runtime.ts:888-925,4148-4153`；此例只检查字段存在，不证明任何工厂有效 |
| 合法 daemon options={mode:'daemon'} | GREEN | GREEN | [I] `dist/sdk-runtime.d.ts:1392`；[U] `src/sdk-runtime.ts:891-892` |
| 历史类型 KodaXRuntimeMode='embedded' / KodaXRuntimeIsolation='inline' | GREEN | GREEN | [U] `src/sdk-runtime.ts:586-587`、`src/sdk-runtime-public.ts:40-41`；说明类型标签仍在，不能据此恢复 owner 构造 |

边界：这里的 `[F]` 是冻结工作区**现有** dist 声明，未在本次重新构建；相应公开源码与 `[U]` 的 blob 相等检查见第 1 节，不能把声明探针升级为整包、runtime JS 或真实升级流程验收。首轮试验把 isolation 填进 CreateKodaXRuntimeOptions，两套声明都拒绝：安装包中的 isolation 来自 Runtime identity 等投影，旧 Create options 也不接受它。表内正式差异例已去掉该无关字段。证据：[I] `dist/sdk-runtime.d.ts:1345-1351,1388-1431`；[U] `src/sdk-runtime.ts:888-925`。

## 9. 未证实

- 第一方 dist-tags 查询见第 2 节；未下载／比较远端 tarball 字节，也未查询全部无 tag 版本。
- 未运行 W 新增组合回归、独立 Host E2E、发布 tarball smoke；源码中存在测试不等于测试本轮通过，更不等于 Space 已完成迁移。可供后续执行的第一方目标：[W] `src/sdk-contract-regressions.test.ts:18,43,118,142,163,217,224`、`tests/sdk-client-contract.e2e.test.ts:58,213`、`tests/sdk-profile-contract.e2e.test.ts:57`。
- 未验证 Windows 清理并行改动、真实模型专家质量、连接器服务、副作用操作、跨平台发行归档。此处不据 SDK profile 合同推断这些均已验收。
- 未证明不同身份的第二条短期诊断连接能满足全部实时 UI 需求；它仍改变 client inventory，需专项生命周期验证。只读 owner-state 文件查询与真正 RPC 连接不是同一操作。

## 10. 未解问题

1. 上游将以哪个 commit／版本发布统一 Host 加组合契约？Partner 广告矛盾在何处修复并验收？
2. Space 本轮选择单 Runtime 适配 A，还是唯一 ProductClient B？若 B，哪些现有启动参数／底层诊断确为产品所需，应由上游补哪个最小公开接缝？
3. Partner 当前明确的工具限制属于用户接受的产品要求，还是历史 inline 技术边界？SDK 的“persona 默认不限制通用 Agent”不能自动撤销 Space 已声明的显式限制。证据：[W] `docs/SDK_MIGRATION.md:11-18` 与 [S] `apps/desktop/electron/kodax/partner-profile.ts:58,119-123`；需业务决策，不由调研替代。
4. 若保留 A，谁负责持续对齐 /client 的授权清洗、能力门禁、恢复与业务投影，并用哪些 shared contract 测试防止漂移？
5. 实际 Run 快照与配置生效信息在 Space 哪些 IPC schema、保存记录和 UI 状态层保留，可否端到端证明重启后仍区分 selected／actual／unknown？此项由父级 UI/持久化调研联合回答。