# beta.1 的 Partner 是否完整采用 Agent 注入

Partner 的正常输入已通过共享 Host 使用 Agent 工作模式、AMA 协作、可信 persona 和默认 Skill；尚未消费的队列在 Main/Host 换代后的原身份重绑仍缺实现，工作模式的 Main mutation 入口也没有完整收口，不能据现有通过测试宣称所有 Partner 适配完成。[模式注入](../../apps/desktop/electron/kodax/real-session.ts#L526)、[消费绑定](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L6455)、[恢复现状](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L5390)。

## 核对边界

- Space 固定点 `64fcfed3`；实际安装 `@kodax-ai/kodax@0.7.97-beta.1`。SDK 源码固定点 `e733e51f98fc5df7538a3dfc2438fed784345b33`，提交为 beta.1 release。本次只读源码、契约、测试与已有证据，不运行测试或构建，不读用户凭证、不修改 SDK/产品代码。[Space 依赖](../../package.json#L61)、[上轮验收](kodax-0.7.97-beta.1-integration.md)。
- SDK 公开要求：Session `workMode:'agent'`，与 AMA/权限独立；可信 Main 的 profile/defaultSkill 由 Host 准备，原问题保留；排队消费使用最后成功提交的业务配置，冷 Host 重新注册 lease 并以原身份重绑输入。[已安装 SDK：`docs/SDK_MIGRATION.md:28-62`、`docs/SPACE_SDK_SEAMS.md:10-28`、`docs/CLIENT_CONTRACT.md:215-217`]。
- 编译包 `dist/kodax_cli.js` 已核对包含 `workModePolicy:"intersect"`、`partnerInstructions:...agentProfile?.instructions` 和模式兼容判断；下面引用同 release 源码便于检查，未把其他候选源码当作已安装能力。源码位置：`KodaX/src/runtime-daemon/server.ts:2645-2653`、`packages/coding/src/task-engine/runner-driven.ts:1952`。

## 已接入的生产链路

| 项目                             | 事实与证据                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 实际 Agent 设置                  | `createSession` 对 Partner 创建 `surface:'partner'`、`profileId:'kodax-space.partner'`，再通过 Host versioned CAS 设置 `workMode:'agent'`。普通发送与活跃 Run 的后续输入在执行边界再次同步 Agent/AMA；并非只修改 UI 标签。`runtime-host-adapter.ts:3653-3684`；`real-session.ts:518-541,829-853,1359-1364`。                                                                     |
| Agent 与 AMA                     | Space 保留 `agentMode:'ama'`，Partner 额外设置 `workMode:'agent'`，两者不同。SDK Host 对可信 profile 设置 `workModePolicy:'intersect'`，避免自带 persona 触发旧 profile 的 Coding 兼容默认。`real-session.ts:539-540`；SDK `src/runtime-daemon/server.ts:2645-2653`、`packages/coding/src/work-mode.ts:4-20`。                                                                   |
| Persona/知识工作指引             | Partner 指令、专家 prompt、持续会话语义和质量检查组成 `agentProfile`。选择的 sources 和本轮 KB evidence 附加到 profile.instructions，由 Main 调 `services.createExecutionProfile(context,lease.tools)`。不是 Renderer 提交一份工具名单或往用户问题拼造 slash。`partner-profile.ts:22-40,143-197`；`runtime/partner-host-tools.ts:166-199`；`runtime-host-adapter.ts:6636-6644`。 |
| 模型真正接收指令                 | SDK AMA 把 profile.instructions 传到 Worker，位于 managed-task scaffolding 前；不是另开独立 `/agent` Runtime。SDK `packages/coding/src/task-engine/runner-driven.ts:1949-1965`、`task-engine/_internal/managed-task/role-prompts.ts:131-143`。普通 Partner 可继续使用共享 Host/AMA 的协作及结算。                                                                                |
| 普通 Partner/prompt-only         | 无专家时仍创建基础 Partner profile；`useSkill:false` 仅去掉默认方法，保留专家角色。生产 profile 不设置通用 `excludeTools`。`partner-profile.ts:149-173`；`runtime/partner-host-tools.ts:172-197`；`runtime/partner-host-tools.test.ts:10-43`。                                                                                                                                   |
| 默认与显式方法                   | Main 只声明 `defaultSkill:{name}`；命令/工具不附默认方法，显式用户 Skill 由 Host 识别并单轮覆盖。后续普通输入恢复保存的默认。`runtime/partner-host-tools.ts:190-191`；`runtime-host-adapter.ts:6612-6614`；SDK `docs/SDK_MIGRATION.md:28-31`；真实 Host 脚本 `e2e/beta1-sdk-acceptance.mjs:210-222`。                                                                            |
| 普通工具权限                     | Partner 指引明确允许 shell、write、child agents，仍受权限/审批/工作区/沙箱/连接器/管理员约束。业务工具是额外 Host lease，不是通用 Agent 的替代白名单。`partner-profile.ts:28,116-119`；`runtime/partner-host-tools.ts:36-82,241-245`；实际 Host 检查 `e2e/beta1-sdk-acceptance.mjs:165-168`。                                                                                    |
| 消费时读取业务                   | input/recovery 返回 binding lease；真实 admission 回调重新读取本 Session 最后提交的专家和连接器，并使用回调传入的 scoped services。专家/连接器 mutation 在持久成功后才更新内存。`runtime-host-adapter.ts:6455-6497`；`runtime/partner-host-tools.ts:95-120`；`host.ts:403-456`。                                                                                                 |
| 禁用/撤销                        | 专家可用性准入检查；连接器调用前再比较原选中与当前绑定，变更/撤销拒绝。队列阻断保留 inputId 与原问题。`runtime/partner-host-tools.ts:171,223-234`；`partner-connector-runtime.ts:291-302`；`runtime/coder-daemon-projection.ts` 中 queued admissionError 投影；真实案例 `e2e/beta1-sdk-acceptance.mjs:223-256`。                                                                 |
| 原 Run 恢复                      | 业务快照以 hash 引用持久化并核对 Session/workspace；恢复沿原快照和 persona 重建 lease，不采用当前新专家。没有原业务证明的旧 checkpoint 明确拒绝。`runtime/partner-business-binding.ts:26-77`；`runtime/partner-host-tools.ts:213-239`；`runtime-host-adapter.ts:6559-6565,6615-6627,6780-6835`。                                                                                 |
| steer 与独立 Actor               | steer 寻找原目标 Run 的 Main authority 并复用，没有则拒绝；独立 Actor 不借根输入 business binding/persona。`runtime-host-adapter.ts:6527-6557,6607-6610`。SDK 子任务可按自身声明运行，不要求把每个 specialist 的内部工作模式都强行改成 Agent。SDK `packages/coding/src/work-mode.ts:13-19`。                                                                                     |
| 命令、Workflow、probe/compaction | 继续原有独立授权，不把 input binding 套给这些操作；provider_probe 先收窄并检查实际 runtimeId/profile。`runtime-host-adapter.ts:6463-6464,6508-6515,6636-6647,7664-7742`。                                                                                                                                                                                                        |
| UI 与老 Host                     | Partner 底栏固定 Agent，并另有 Host 实际执行事实；Coder 才有模式选择。旧 Host 缺 Partner admission/profile v2 或新 binding 能力会 `daemon_upgrade_required`，不回落私有 Runtime。`renderer/src/shell/BottomBar.tsx:2900-2911`；`runtime-host-adapter.ts:3760-3780,6467-6469`。                                                                                                   |
| Promotion                        | SDK promotion 能提升 code/partner，Host 确认后才移除 ephemeral；当前 Quick Ask 产品入口只提供 Continue in Coder，没有“转 Partner”按钮。这是未开放的可选产品流，不是现有 Partner 注入失败。`host.ts:769-781`；`renderer/src/features/quick-ask/QuickAskPopover.tsx:304-318,472`。                                                                                                 |

## 必须补的实现与专项验证

### P1：未消费队列在 Main/Host 换代后的新 binding 重绑

当前 Partner after-turn 接受前只保存完整 input intent，外层 authorization 返回临时 binding lease；未消费时没有 Run，`captureResolvedRunAuthorization` 不执行。重连只尝试恢复同 RuntimeId 下已捕获的 credential/tool authority，没有重新注册 resolver 并按原 inputId 重绑 pending input 的调用链。`runtime-host-adapter.ts:7539-7609`，尤其 `7568-7580,7591-7601`；恢复循环 `5396-5406`；`restoreProductAuthorization:6780-6835`；原授权按 RuntimeId 读取 `6752-6763`。

SDK binding lease 不能像 credential lease 一样 resume：公开服务只有 `register/revoke`；注册产生随机新 ID，旧 Main 关闭清空 resolver。SDK pending queue 的 `rebind` 明确要求原 principal 用同 inputId、同原意图重新提交。SDK `src/client-host-authorization.ts:52-55`、`src/execution-binding-client.ts:19-30,54-57`、`src/runtime-daemon/execution-bindings.ts:7,20-32`、`src/session-input-queue.ts:158-182`。这是缺失调用链的静态确认，本次未另跑真实断线复现；不能宣称已出现重复执行。

最小方案：观察到 Host 明确报告原 principal 的 input 仍为 queued/尚无 Run 时，从 Main 私有记录读取原全文、附件、delivery/target；注册当前连接的新 resolver，向 Host 用同 Session/inputId/原意图提交新 authority，完成重绑。只读取这类 Host 已确认 pending 的条目，不能扫描私有 intent 后把所有记录都重新发送；unknown、已提交、派发过、完成或撤回的输入不重提，命令/工具和其他 principal 不参与。新 resolver 消费时仍读最后成功提交的业务配置，业务拒绝保留阻断而不是无限重试。原文恢复记录见 `runtime/product-input-intents.ts:48-124`；SDK 原身份契约见 `src/session-input-queue.ts:161-181`。

验收必须拆开以下场景，实际启动发布 SDK Host，并记录原 inputId、principal、Run 数和 Provider 请求：

1. Main 断连重连同 Host；Main 重启同 Host；Host 冷换代但 Main 存活；Main 与 Host 都重启。每种均有真实 queued 输入，重绑后只消费一次。
2. 排队期间切换专家、移除专家、关闭默认 Skill、变更连接器：消费时只用最后成功提交的选择；未成功写入的草稿不得生效。
3. 禁用/卸载专家与撤销连接器仍在模型/副作用前阻断；原问题和附件保留；有明确用户改选或撤回路径。
4. 超过 4,096 字符、图片/文件引用、after_turn/target 完整；不从 SDK preview 重建，不产生第二条 user input 或第二次副作用。
5. 原 input 已有 Run、已交付/已完成、接收结果未知、principal 不匹配和恢复记录损坏：不自动提交。accept/rebind 响应丢失后查询同操作事实，不换新 inputId。
6. alpha.12 遗留队列无完整原文：继续保留阻断并明确无法安全重绑，等待 [SDK 原文/回执接缝](kodax-beta1-queued-intent-handoff.md)，不能冒充完成。

上面是验收要求，不是已通过结果。现有真实 Host 脚本只覆盖同进程消费切换/禁用/取回，未制造这些 Main/Host 换代场景。`e2e/beta1-sdk-acceptance.mjs:183-257`。

### P2：工作模式 mutation 的 Main 边界收口

底栏隐藏 Partner 选择器，slash `/work-mode` 也明确仅 Coder；但 `session.setWorkMode` IPC 直接调用 adapter，adapter/service 只有 Session 权属、能力、CAS/Host 空闲校验，没有 Partner surface 判断，因此仍存在将 Partner 设置为 Coding/Script 的公开 Main mutation 路径。下次普通 send 会纠正，但界面静态 Agent 和 Host 状态可暂时分离；旧 Partner 首次直接 command/workflow 的设置同步也应专项验证。`slash/builtin.ts:1600-1603`；`ipc/session.ts:1467-1469`；`runtime-host-adapter.ts:4518-4529,7664-7696,7722-7742`；`runtime/work-mode.ts:31-55`；`real-session.ts:526-540`。

最小方案：在 Main 统一 mutation 入口按 Host/可信 Session surface 拒绝 Partner 的非 Agent 选择，保留 Coder 全模式与原 CAS/空闲语义；对旧 Partner/缺失 workMode 的第一次实际执行，通过同一安全空闲 Host 边界确认 Agent，再执行命令或普通输入。不能在活跃 Run 中强改，也不能为实现固定 Agent 而收紧 shell/write/child。验收：正常 UI、直接 IPC、slash、旧 Partner 首次普通输入/命令、另一客户端改值、忙碌冲突；Host 返回事实和 UI 意图分别展示。[同上源码]。

### P1/P2：把“Agent 注入完备”验收到真正的模型与恢复路径

16 专家的真实 Host 检查目前断言 `Run.workMode`、profile.name、bash、defaultSkill 和 canonical user；成品首轮检查 Session workMode、profile.name、bash 和原问题。它们没有逐位断言 `effectiveConfig.workMode/modelToolScope`，也没有检验真实 Provider 请求内完整 Partner/专家指令、验证条件和 Skill 目录；profile.name 正确不能单独替代完整注入证明。`e2e/beta1-sdk-acceptance.mjs:158-175`；`tests/e2e/sdk-beta1-adaptation.spec.ts:31-47`。

补充方案：在既有 loopback Provider 中断言普通 Partner、prompt-only、全部当前专家、useSkill=false、显式覆盖/后续恢复默认的实际 system/tool 载荷，并对 Host effectiveConfig 的实际 Agent 工作模式、persona/verification、可执行工具上限与模型菜单分别断言。再覆盖原专家 A 的 checkpoint，改选 B、换 Main/Host、当前 A/连接器撤销和原快照损坏；验证恢复保留原 persona/方法/账号范围，旧副作用和 hooks 不重放，独立 Actor 不继承根 binding。现有部分 fake/unit 证明在 `runtime/partner-host-tools.test.ts:103-147`、`test/runtime-host-adapter.test.ts:10613-10853`，不能算新协议真实冷恢复已验收。

## 旧 inline 代码的可达性

`real-session.ts` 仍有 Main 展开 Skill、Partner 禁动态 shell、旧 `/coding.runManagedTask` 的历史测试驱动。它们在当前正式生产入口不可作为“Partner 仍用旧 Coding”证据：环境选择无论值都归 runtime（`runtime-host-adapter.ts:1467-1470`）；Main 启动强制 runtime（`main.ts:2248`）；设置读写只允许 daemon（`settings/store.ts:90-92,362-365`，`ipc/settings.ts:113-115`）；默认 acquireInline 明确拒绝（`runtime-host-adapter.ts:1811-1813`）。`real-session.ts:1495-1507` 在生产先 return daemon，`1058` 限定旧方法准备只在非 Runtime，`2676-2685` 防止途中回落。只有显式注入测试 owner/constructor mode 等夹具才能运行旧驱动。

后续可清理“Partner is shell-free”“embedded / Partner”之类过时注释，避免继续误导维护；这属于可选可读性整理，不应以删掉测试驱动冒称完成产品迁移。`real-session.ts:2656-2660`、`ipc/session.ts:1457`。

## 外部 SDK 依赖与产品可选项

- promotion view 元数据旧缓存和旧队列完整原文/durable 撤回回执，是既有两项 SDK 接缝；Space 已有窄兼容及事实拒绝边界，仍应等正式 SDK 根修包闭环。[promotion 交接](kodax-beta1-promotion-view-handoff.md)、[队列交接](kodax-beta1-queued-intent-handoff.md)。
- Quick Ask 转 Partner、新专家工作台策略 UI、真实外部平台登录及内容送达，是独立产品范围；SDK 能力存在不代表当前 UI 已开放，不能为“适配全部导出”自动增造功能。当前仅 Continue in Coder 的事实在 `QuickAskPopover.tsx:472`，远端登录/权益未验证边界在 [beta.1 验收](kodax-0.7.97-beta.1-integration.md)。

## 未证实

- 尚未运行针对本节新发现的实际 Main/Host 换代重绑复现；P1 来自完整静态调用链及明确 SDK 重绑契约，需在实现前先以新增专项回归锁定。
- 尚无真实外部 connector/云 principal/在线模型的完整验收；现有本机假 Provider、静态检查和历史独立库测试不能证明这些环境成功。验收限制已记录于 [beta.1 验收](kodax-0.7.97-beta.1-integration.md)。

## 未解问题

1. 需要 SDK 公开完整旧队列原文及持久撤回回执，才能无损覆盖缺 Space 私有意图的遗留输入；当前公开 preview 不够。[SDK 队列交接](kodax-beta1-queued-intent-handoff.md)。
2. Quick Ask 是否新增“转 Partner”属于后续产品选择，本次现有产品适配无需以此阻断；当前只有转 Coder。`QuickAskPopover.tsx:472`。

## Claude 补审线索的重新核对

本节来自用户补充审查中的线索，再按固定点 `64fcfed3` / SDK release `e733e51f9` 核对源码。没有运行新增复现或测试；下列“确认”均指静态调用链确认，不是已经观察到客户环境结果。

### 补充 1：冷队列等待不一定有 admissionError，取回按钮也可能缺失

结论成立且需补进切片 B。SDK 冷启动调用 `productQueue.restore(pending,true)`；restore 为原输入设置内部 `awaitingBinding:true`，仅在旧记录已有 admissionError 时复制它，不会为纯“需要重绑”新造 error。`batch()` 遇到队首 awaitingBinding 直接返回空，因此后续队列也按原顺序等待，不能跳过前项擅自执行。SDK `src/sdk-runtime.ts:9900-9909`、`src/session-input-queue.ts:122-139,309-316`。

SDK 公开 `getInput` / view queue 不含 awaitingBinding，只有 queued/submitted 等 state 和可选 admissionError；Space 投影也只复制 admissionError。当前 bubble 仅在该 error 存在时显示 `QueuedInputRecovery`，所以纯冷恢复等待会继续显示普通等待文案，且没有取回入口。SDK `src/session-input-queue.ts:151-155,247-253`、`packages/coding/src/client-contract.ts:830-855`；Space `runtime/coder-daemon-projection.ts:1276-1300`、`renderer/src/features/session/messages/bubbles.tsx:532-540,575-579`。

最小 Space 修法：不要把显式取回入口绑定在 admissionError 上。对 Host 已确认仍 queued、原 Main 有完整恢复材料的输入允许用户取回；执行时仍让 Host 做原身份/状态判定，失败保留消息和错误，不自动撤回队首或旁路队列顺序。Main 自己正在连接/重绑的进度可如实显示为客户端恢复状态，不伪造 SDK admissionError。原文不全的旧队列继续明确保留，不能以预览重建全文。已有调用边界：`runtime/product-input-intents.ts:117-143`、`runtime-host-adapter.ts:4142-4160`。

如果产品需要准确区分“Host 等待重绑”“普通等上一轮结束”“另一 principal 的等待”，现有公开事实不足。需要 SDK 为 queue/getInput 提供只读 binding/admission 状态或已有标准 reason 的等价投影；不是 Space 按等候时长或 Host restart 猜测错误。该需求可补到既有队列原文/回执交接，显示通用取回按钮本身不必等待新增 SDK 字段。[上述 SDK 公开类型和队列实现]

新增验收：恢复后首项没有 admissionError、后项有有效 authority，UI 仍有事实一致的等待/恢复说明和可用取回入口；重绑或用户撤回首项后按顺序推进；正常等候队列可显式取消；无完整原文、外 principal、已交付或结果未知均不错误移除，不产生新 input 或第二次副作用。

### 补充 2：缺缓存的历史 Partner 首次命令/Workflow 可污染 surface 缓存

缺陷调用链成立，但不能写成“所有重启后未打开的 Partner 首次 slash 必现”。正常初始化 `refreshProfileSnapshot` 会给 status.sessions 中的 Session 填正确 surface；这个 profile 有界，较旧 Session 可以不在其中。正常 slash 的 SDK prompt/review 还先 `commitRuntimeMutation`，Host 已 ready 且是真实 Session 时会把正确的 `session.surface` 作为 identity 调用 `updateSessionSettings → ensureSession`。Space `runtime-host-adapter.ts:3203-3208,3610-3615`；`ipc/slash.ts:60-63`；`host.ts:503-529`；`runtime-host-adapter.ts:4311-4315`。

在确实没有 surface 缓存的旧 Partner、初始化竞态或直接 command/Workflow 入口中，`executeProductCommand/startWorkflow` 缺省 surface 为 code，`ensureSession` 在任何持久身份校验前就把这个推断写入 map。之后 `assertPersistedSessionIdentity` 优先取 map 的 code，再发现持久 Partner 不符并拒绝；异常路径不回滚错误 map。Workflow 的 Main launchSession 已知真实 surface，并把它放在 hostMetadata，但 adapter 没有将其作为可信 identity 使用。`runtime-host-adapter.ts:7671-7676,7726-7731,3699-3708,3507-3530`；`workflow-controller.ts:1094-1114`。

污染会阻碍同进程恢复：普通 Partner send 的 `ensureSession(partner)` 在 knownSurface=code 时直接拒绝；后续 profile 刷新仅在 map 缺项时填值，不纠正它；`getSessionSettingsVersioned/readWorkMode → assertHostSession` 也会再次遇到同一持久身份冲突。`runtime-host-adapter.ts:3699-3701,3203-3208,4296-4299,4512-4515,3578-3593`。这是拒绝执行的故障，没有把 Partner 磁盘 tag 改成 code，也未证明发生跨面执行。

最小修法：已存在 Session 的 command/Workflow 在进入 ensure 前，从可信 Main 的已加载 Session 或权威 Host/持久元数据确定 surface，不能把缺缓存等同 code。验证成功后才提交新缓存；失败请求不得留下候选 surface，更不得覆盖已验证的身份。保持真实外部 retag/project mismatch 的拒绝策略，不为修缓存而自动放开身份冲突。不要把 Renderer 提交的 arbitrary metadata 当权威。

新增验收：历史 Partner 不在有界 profile、无缓存，首次 Workflow / SDK prompt command / review；Host 已 ready 的正常 slash guard；Host 初始化竞态；错误 surface 请求失败后同进程正常 Partner send/getSettings 可继续；Coder/另 Session 不受影响；真实外部 retag 仍拒绝。新增测试应先锁定失败，不把全部“未打开”一概当作可复现前置条件。

### 补充 4：Agent 需要覆盖非普通输入及消费边界，外层 CAS 不是全部原子保证

commands/Workflow 不走 `real-session.syncRuntimeSessionSettings`，Host mutation 的完整 patch 也没有 workMode。因此旧 Partner 的 Host 设置仍为 Coding、或另一已授权客户端改为 Coding 时，已有静态 profile/工具授权不能单独把其变回 Agent；底栏写死 Agent 不是实际执行证明。`runtime-host-adapter.ts:7664-7742`；`host.ts:511-522`；对比 `real-session.ts:526-541`。SDK workMode mutation 只检查 active Run owner，并不把纯 awaitingBinding 队列算 active，所以等待重绑期间的改值也必须纳入测试。SDK `src/sdk-runtime.ts:9366-9390,25771-25787`。

当前公开 binding request/scoped services 没有本次 admission 的 workMode 快照，`createExecutionProfile` 的 Source/Profile 也不能声明 required/expected workMode。SDK `src/client-host-authorization.ts:8-24,41-55,249-261`。外层安全空闲 CAS 只保证当时的设置准备，不阻止另一客户端在排队消费前改变设置。

SDK immediate input 和 dequeue 的确在同一 Session operation 中解析 binding 并开始 Run；settings mutation 也通过该 operation 排队。若 Host 在这个锁内把本次将使用的 workMode/设置修订作为只读 admission context 交给 Main，Main 可原子拒绝错误模式。SDK `src/sdk-runtime.ts:13154-13202,12578-12639,8259-8274`。但 Space 现有 callback 读的是 `observeView`：`SessionViewOwner.refresh` 若已有 loading 会复用旧读，所以不能把 view.settings 当成严格的 admission 快照，即便它适合界面展示。Space `runtime-host-adapter.ts:6563`；SDK `src/session-view.ts:394-400,492-499,548-550`。

完整方案应分两层：Space 在可信入口统一确认身份并做安全空闲 Agent/CAS 准备；SDK 在真实准入锁内校验可信 profile 的 required/expected workMode，或提供等价只读 admission 模式上下文和拒绝机制。静态 command/Workflow 没有 input resolver，因此要覆盖它们的同等原子约束，单补 input callback 的字段还不够。约束应针对 Partner 根执行，独立 Actor/Workflow 子任务保留其自身声明，不机械把每个 specialist 都强改 Agent。建议字段名只是设计选择，不是已存在 API。

不在 binding callback 中嵌套 settings mutation，不使用截图/缓存推断安全事实，不因为模式不符强停活跃 Run。公开 getSettingsVersioned 的当前实现没有直接重进 Session operation，但仍包含 display flush/Session load 等链路；本轮没有证明其回调重入安全和所有冻结时序，不把它作为免 SDK 接缝的已验收方案。SDK `src/sdk-runtime.ts:9336-9340`。

新增验收：旧/缺失 workMode Partner 的首条 command/tool/Workflow；另一客户端在外层 CAS 后、队列消费前、binding 回调期间修改模式；该请求必须实际 Agent 或在模型/工具前明确拒绝，不能“UI Agent、执行 Coding”。回调不死锁、忙碌不强改、原输入/原 inputId 保留；恢复中既有 Run 保持原模式/原快照。

### “没有测试”的准确范围

不能写成全仓库没有 Partner fork/compact 或实际 prompt 测试。已有 Partner 专家 fork 独立快照、连接器 fork 独立范围、code/partner 的 Host compact 委托测试；旧 inline fixture 还记录并检查实际模型 system prompt。`kodax/host-partner-expert.test.ts:85-101`、`kodax/host-partner-connectors.test.ts:51-75`、`test/host.test.ts:148-186`、`kodax/partner-expert-runtime.test.ts:158,443-498,703-768`。旧 fixture 显式令 `isRuntimeSelected=()=>false`（`:54-59`），不能替代 beta.1 共享 Host 的新协议证明。

全仓也有通用发送 retry、model picker、原生 Host fork，以及 Actor 所有权/游标测试：`tests/e2e/session-send-retry.spec.ts`、`tests/e2e/model-picker.spec.ts:70`、`tests/e2e/sdk-unified-contract.spec.ts:51`、`test/runtime-host-adapter.test.ts:14317,14700`。缺口应准确写成：尚未找到 beta.1 Partner 业务 binding + fork/retry/compact/model switch/独立 Actor 隔离的完整真实 Host/成品组合证明；新共享 Host 验收脚本未检查全部 system/tool payload。不能把旧覆盖抹掉，也不能用这些旧/通用测试宣布新组合已通过。`e2e/beta1-sdk-acceptance.mjs:158-175,210-222`；`tests/e2e/sdk-beta1-adaptation.spec.ts:31-47`。
