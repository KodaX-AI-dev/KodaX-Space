# Space 对 KodaX 统一契约的输入与执行授权迁移是否完整？

TL;DR：普通共享 Coder 的 Product 输入、稳定身份、不可变 Main 授权、队列/steer、共享设置与 Shell 合同已经落地；但显式 Workflow、注册 Prompt Command、`/review`、计划审批正文和 Space 自带 Skill 的 Host 注册仍有缺口，不能把整个产品面概括成“完整迁移”。Workflow 限额仍被保留，缺的是执行 owner 与契约的一致性。下文逐条引用实际生产调用及已安装 SDK，不以旧验收报告替代实现。

## 审计基线和证据边界

- Space 工作树基线：`dcd21ef855cebca5c17dd2233b617807264f195f`。安装 SDK 的 `package.json:3` 为 `0.7.97-alpha.7`，公开类型来自该物理包。相邻 KodaX 源码基线为 `b0b446ec84fd20f21529025d086813eb5bcb2bd0`；涉及上游行为时，同时核对已安装包的声明或 bundle。来源：`git rev-parse HEAD`、`git -C ../KodaX rev-parse HEAD`，以及 `node_modules/@kodax-ai/kodax/package.json:3`。
- 本文只审输入、Main 授权、队列/steer、Skill/command/review、Workflow/Actor、设置/Shell、permission/Sandbox。正文输出、canonical history、statistics 详细字段、完整 lifecycle 由同轮主审覆盖。没有修改业务代码、依赖或 tracker；没有调用真实模型。来源：本次只读审计范围。
- 已有测试在本文仅作为“覆盖了什么”的源码证据，本文没有据旧报告重复宣称它们本轮已经执行通过。主审另行记录实跑结果。

## 不能仅凭 `/runtime` 导入判定迁移失败

Space 仍由可信 Main 创建 `ensureKodaXRuntime/connectKodaXRuntime` 连接，这是事实；普通输入随后使用公开的 `RuntimeRunService.acceptInput(ClientSubmitInput & { authorization? })`。已安装 `/client` 的 adapter 本身也把 `inputs.submit` 映射到同一个 Runtime Product seam，并把 Main callback 返回的授权附上。两者具有相同的 Host 输入准入边界，因此这里不是旧 `runs.start` 普通聊天路径的改名，也不能单凭没有调用 `ensureKodaXClient` 就宣布漏迁。来源：`apps/desktop/electron/kodax/runtime-host-adapter.ts:1704-1735,6298-6329`；`node_modules/@kodax-ai/kodax/dist/sdk-runtime.d.ts:2473-2478`；已安装 `dist/chunks/chunk-L4HSHRFD.js:2`；对应可读源码 `../KodaX/src/client-runtime-adapter.ts:12-25,157-165`。

不过，这意味着 Space 自己承担了 `/client` adapter 的职责：构造可信 payload、调用授权、选择正确业务入口和解读回执。Space 的 `authorizeProductExecution` 没有作为 connector 的 `authorizeExecution` 回调安装；它只在 `admitManagedRun` 和 `admitProductInput` 两处显式调用。因此该函数的联合类型包含 `command/review/workflow/agent_spawn`，并不能证明这些生产动作实际经过它。来源：`runtime-host-adapter.ts:6070-6162,6319,6867`；SDK callback kinds：已安装 `dist/types-chunks/runtime-client-info-BBBxdU8V.d.ts:128-167`。

## 已确认的迁移缺漏

### U1：显式 Workflow 仍由 Electron 本地执行，只有读取和部分控制接入 Host

`workflow.start` IPC 总是调用本地 `workflowController.start`，`workflow.rerun` 也总是调用本地 rerun；两者没有共享 Runtime 模式分流。`/workflow create/start` 又直接进入同一个 controller。controller 的生产 `init()` 通过 `/coding` 获取 Electron 进程内默认 manager，再用 `manager.startFromOptions` 执行、自行生成 `wf_*` 身份及 `<Space data>/workflow-runs/<id>` 目录。来源：`apps/desktop/electron/ipc/workflow.ts:155-174,207-231`；`apps/desktop/electron/slash/builtin.ts:2016-2040,2280-2413`；`apps/desktop/electron/kodax/workflow-controller.ts:1093-1126,1395-1452,1856-1886,2416-2428`。

这与已安装 SDK 的声明式 `ClientWorkflowStartInput` 和 Host 管理 runDir 的契约不一致；当前 adapter 对 Workflow 只有 `list/get/control`，没有 Product start。UI 将 daemon 与 local runs 合并，正好说明两套 owner 同时存在，不能因面板看起来完整就推断统一。来源：已安装 `dist/types-chunks/client-contract-CRm9ZpL2.d.ts:1922-1965`；已安装 `docs/SPACE_SDK_SEAMS.md:79-83`；`runtime-host-adapter.ts:6942-6959`；`ipc/workflow.ts:49-70`。

**实际影响**：显式 Workflow 不经过 `authorizeProductExecution(kind: 'workflow')`，不由共享 Host 的 Session settings、授权绑定、统计和 lifecycle 统管。它仍有自己的本地凭据包装与 Space 清理，不应误称“完全没有凭据或退出清理”。这里确认的是统一契约 owner 的缺口；没有执行实际模型来断言某个具体平台命令已绕过权限。来源：`workflow-controller.ts:1098-1099,1438-1449,1803-1840`；`apps/desktop/electron/main.ts:1722,2749`。

**限额没有丢失**：普通 Product Run 的 Main 授权仍捕获 `maxAgents/tokenBudget`，并以 Host config 同步 `maxConcurrency`；本地显式 Workflow 的 `launchOptions` 仍传 `buildWorkflowHostPolicy(policy)` 和 `workflow.maxConcurrency`。`0 = unlimited` 也仍保留。修复时应迁移 owner 并保留这些现有上限，不要删除或重复添加另一套并发配置。来源：`runtime-host-adapter.ts:6151-6160,6222-6237`；`workflow-controller.ts:1803-1840`；`workflow-policy.ts:11-17,32-39,68-87`；SDK `SPACE_SDK_SEAMS.md:60-83`。

**建议验收**：从现有 `/workflow`、高级面板、rerun、create/revise 入口分别启动，证明 Host 的 `workflows.list/get` 有同一个 runId、runDir 来自 Host、Main 绑定与当前 Session 设置生效、跨客户端控制和 SDK lifecycle 可见。本地历史的读取/保存等能力另作兼容，不要求丢弃旧 run 文件。依据：上述实际路由与 SDK `ClientWorkflowStartInput`。

### U2：Host 列出的注册 Prompt Command 没有接入执行入口

`slash.discover` 合并 Host catalog 的命令，但 `slash.exec` 只执行 Space 注册的 builtin；未命中时返回 `unknownCommand`。Renderer 因此继续将原始 `/name ...` 送入普通 `session.send`。Main 的 Runtime command resolver 只把 `source === 'extension'` 转成显式工具；Prompt Command 不进入该分支。随后 `RealKodaXSession` 只按本地 SkillRegistry 判断开头 slash，不在 Skill registry 时返回 `skill_not_found`。来源：`apps/desktop/electron/ipc/slash.ts:40-47,64-93`；`apps/desktop/renderer/src/shell/BottomBar.tsx:1231-1234`；`apps/desktop/electron/kodax/runtime-command.ts:13-21`；`apps/desktop/electron/kodax/real-session.ts:566-605,796-810`。

SDK 的 `acceptInput` 只解析 Skill 引用；Prompt Command 的准备、`allowedTools/model/hooks/context` 等由独立 `invocations.executeCommand` / Product `commands.execute` 负责。Space 没有调用该入口。因此一个存在于 `.kodax/commands`、不与 Skill 同名的注册命令可以被展示，却不能按命令契约执行；即使与 Skill 同名，也会选择 Skill 语义。来源：已安装 `dist/sdk-runtime.d.ts:143-154`；已安装 `dist/types-chunks/client-contract-CRm9ZpL2.d.ts:730-760`；已安装 `dist/chunks/chunk-BYRPTXH4.js:4`；可读 SDK 源码 `../KodaX/src/runtime-product-commands.ts:56-88`、`../KodaX/src/sdk-runtime.ts:12163-12221,12660-12674,12726-12738`。

已存在的 `runtime-command-send.test.ts` 只证明 extension command 和 `!git status` 走 tool Run；没有覆盖注册 Prompt Command 的上述分支。这不是这些测试失败，而是覆盖面不足以证明“commands 完整迁移”。来源：`apps/desktop/electron/kodax/runtime-command-send.test.ts:22-93`。

**建议验收**：隔离项目中加入只读 Prompt Command，并让它和另一 Skill 拥有相同名称各测一次，验证 command/Skill 的明确分流、稳定 inputId、Host 准备一次、工具上限及 hooks 生效、丢失响应不重放。依据：SDK `RuntimeProductCommandService` 以及上述失败路由。

### U3：`/review` 仍是本地 HEAD diff 模板，声明的参数与 Host review 契约未对齐

Space `/review` 在 builtin 中声明 `[--workflow] [base | sha <hash>]`，但 handler 不接收/使用 `ctx.args`，只向 Renderer 发 `insert-review-template`。Renderer 总是读取当前项目默认 git diff，把最多 64KB 的文本放进输入框，不调用 Product `review.start`。因此 `/review --workflow` 或 `/review sha <hash>` 不会按这些参数执行；编辑草稿仍是现有 Space 行为，但不能据此宣称 review 准备已转交 Host。来源：`apps/desktop/electron/slash/builtin.ts:2651-2661`；`apps/desktop/renderer/src/shell/BottomBar.tsx:1489-1530`。

已安装 SDK 已有 `ClientReviewInput.args`、Host `startReview`，能够返回无改动、错误、普通 prepared invocation 或 Workflow 分支。这里并非 SDK 不提供现有产品接缝。来源：已安装 `dist/types-chunks/client-contract-CRm9ZpL2.d.ts:745-751`、`dist/sdk-runtime.d.ts:145-150`；已安装 `dist/chunks/chunk-BYRPTXH4.js:4`；可读源码 `../KodaX/src/runtime-product-commands.ts:42-48`。

**建议处理**：明确保留“插入可编辑 review 草稿”这一 UI 行为，还是执行 Host review；可编辑草稿与真正执行应有明确入口。若维持当前产品选择，应至少修正参数和“已完整迁移 review”的文档声明；若迁移执行，需覆盖 base/SHA/`--workflow` 与空改动，不能把现有模板 silently 换成已执行操作。依据：实际 builtin 的可见参数和 SDK 的不同执行结果类型。

### U4：Host 计划审批的完整 `plan` 在 IPC 投影前被丢弃

已安装 SDK 的 `RuntimePermissionRequest.plan` 明确是 `exit_plan_mode` 的完整 finalized plan；Client 契约要求显示完整 `options.plan`，不要从截断 inputPreview 恢复。Space 的 `permissionInteraction` 只解析 `request.inputPreview`，构造 IPC permission request 时没有传 `request.plan`；IPC permission schema 和 Renderer modal 也没有完整计划展示入口。来源：已安装 `dist/sdk-runtime.d.ts:2743-2745`；已安装 `docs/CLIENT_CONTRACT.md:460`；`apps/desktop/electron/kodax/runtime/coder-daemon-projection.ts:497-554`；`packages/space-ipc-schema/src/channels/permission.ts`；`apps/desktop/renderer/src/features/permission/PermissionModal.tsx:126-167,294-313`。

Host 的 `exit_plan_mode` 请求只附 `toolName` 和 `plan`，不附一份可供这里恢复的 inputPreview，所以这是实际信息丢失：用户会面对通用 permission 对话框，无法在那里读到将被批准的完整计划。Host 首个有效回答与运行/模式检查仍有效，本文没有发现 Space 自己提前升级权限；问题是知情审批正文缺失。来源：可读 SDK `../KodaX/src/sdk-runtime.ts:20183-20197`；Space 响应仍绑定当前请求和 runId：`runtime-host-adapter.ts:6907-6929`。

**建议验收**：使用长于 preview 上限的 plan、Stop 后迟到批准、另一个客户端先响应三个形状，验证显示完整 plan、只回原 requestId、拒绝/取消不改变模式。依据：已安装 `CLIENT_CONTRACT.md:460`。

### U5：Space 自带 Skill 只在 Electron 注册，未注册到真正执行的 daemon

Space 启动时注册自带 Skill 根目录；实现只是调用 SDK `registerPluginSkillPath`。上游该 API 只向当前模块的 `Set<string>` 加路径，默认配置从这个进程内 Set 读取。生产 Runtime 连接/Host Tool 注册没有传递或安装这个 Skill 根目录。来源：`apps/desktop/electron/main.ts:2183-2204`；`apps/desktop/electron/skill/space-builtins.ts:62-83`；`../KodaX/packages/agent/src/capabilities/skills/plugin-paths.ts:3-27`；`../KodaX/packages/agent/src/capabilities/skills/types.ts:355-375`；`runtime-host-adapter.ts:2354-2422`。

同时，Coder 的 `skill.discover` 故意将本地 Space builtin 合入 daemon catalog；`send()` 在本地 registry 看见它后接受原始 `/skill`，实际准备已交回 daemon。daemon 却只在自己的 registry 中 `loadRuntimeSkill`，找不到时将原始 slash 当普通文本；不会自动读 Electron 的 plugin Set。新安装环境且用户未另装同名 Skill 时，存在“选择器可见、Host 无对应定义”的断层；其后执行会退回普通文本是源码推断。来源：`apps/desktop/electron/ipc/skill.ts:68-87`；`real-session.ts:800-810,909-924`；`../KodaX/src/runtime-invocations.ts:167-170`；`../KodaX/src/sdk-runtime.ts:12166-12183,12726-12738`；已安装 SDK `dist/builtin` 仅有 `code-review/git-workflow/skill-creator/tdd/visual-review`。

同轮主审已运行无模型的 Registry Host catalog 对照：注册同一资源根后，父进程 local 可见 18 个 Space 自带名字，真实 Host 缺少其中 16 个，包括 `copywriting/customer-research/draft-response/knowledge-synthesis/process-doc/status-report`。`frontend-slides/huashu-design` 在该机器 Host 中存在，是当前用户全局安装的同名 Skill，不能证明 Space 发布资源根已交接。该实验仅证明 catalog 不一致，没有向 Provider 提交 Skill 执行；精确 Host cleanup/exit 均为 succeeded。原始第一方实验结果：[`kodax-space-builtin-skill-host-evidence-2026-10-18.json`](kodax-space-builtin-skill-host-evidence-2026-10-18.json)。

修复应在可信 Host 的现有 extension/Skill 配置边界注册可验证的资源根，避免恢复客户端执行准备或把解析后的大段文本冒充原始 Skill 输入；执行时失效、错误归类和最终模型行为仍需专门验证。依据：SDK `SPACE_SDK_SEAMS.md:19-58,150-156` 和上述生产链路。

## 完整核对矩阵

| 接缝                                 | 状态                                    | 实际实现与证据                                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共享 Coder 普通输入                  | 已实现                                  | `real-session.ts:823-938,1348-1427` → `runtime-host-adapter.ts:6267-6350` → `acceptInput`；不走 inline SDK 的第二套聊天执行。                                                                                                             |
| 稳定 inputId                         | 已实现                                  | Renderer `BottomBar.tsx:2180-2222` 传 operationId；Main `ipc/session.ts:130-156,1074-1076,1147-1151` 同请求复用；adapter `6291,6313,6851-6856` 作为 Product inputId。                                                                     |
| 未知 admission 不透明重放            | 已实现                                  | `real-session.ts:852-862,1392-1408` 仅对有明确未准入事实的 `data_changed` 做有限重试；adapter `6353-6380` 按原 runId 恢复等待。                                                                                                           |
| Main Provider allowlist              | 已实现                                  | `runtime-host-adapter.ts:6112-6147` 从 Host 有效 Provider + 可信 resolver 选 lease；`providers/runtime-credential-broker.ts:16-32` 校验 lease/session/provider/purpose 后才读秘密。                                                       |
| 非秘密授权在 RPC 前捕获              | 已实现                                  | `runtime-host-adapter.ts:6153-6161,6184-6189,6319-6329`。不把秘密放进 Renderer/IPC 输入。                                                                                                                                                 |
| 不可变授权与隔离键                   | 已实现                                  | `runtime/runtime-input-authorization-store.ts:30-40,55-117` 以 runtime/client/session/input 四维身份持久化，重复捕获内容不同即拒绝，读取返回 clone。                                                                                      |
| queued 不虚构 runId                  | 已实现                                  | `runtime-host-adapter.ts:6874-6896` 仅返回 SDK 实有 runId；真实 SDK 回归源码 `runtime-sdk-migration.test.ts:197-215` 明确验证 queued runId 为 undefined。                                                                                 |
| 队列 owner / 消费边界                | 已实现主干                              | `admitProductInput:6852-6874` 映射 `after_turn`；SDK 自己保留执行授权并消费。Space 队列投影由 `updateProductQueue:6053-6067` 替换，不执行第二套 Coder 队列。                                                                              |
| steer 原授权                         | 已实现                                  | `authorizeProductExecution:6087-6110` 找目标 Run 的原授权，缺失即拒绝；`admitProductInput:6858-6859` 映射为 SDK `steer/targetRunId`。                                                                                                     |
| redirect                             | 未形成 Space 产品入口                   | adapter 当前 queueMode 仅 interrupt/after-turn；SDK 的 redirect 能力存在，不代表 Space 已暴露或必须新增按钮。来源：`real-session.ts:784,875-890`；SDK `SDK_MIGRATION.md:输入、队列与结果恢复`。                                           |
| 同 Host Main 重建恢复                | 已实现主干，见下节边界                  | `runtime-host-adapter.ts:5080-5099,6192-6219` 按 Product Run 的原 inputId 恢复 lease；SDK 集成测试 `runtime-sdk-migration.test.ts:217-239` 覆盖重复输入和 steer。                                                                         |
| Skill Host 准备一次                  | 已实现共享目录 Skill；自带 Skill 有 U5  | Coder 在 `real-session.ts:909-924` 不调用 `prepareExplicitSkillExecution`；准备函数只在非 daemon 分支 `964-977` 使用。Host 展开见 `../KodaX/src/sdk-runtime.ts:12186-12221`。                                                             |
| extension command / `!shell`         | 已实现受限子集                          | `runtime-command.ts:10-21` → tool Run；`runtime-host-adapter.ts:6297-6329` 带 inputId 与 Main binding。配置类 extension 命令缺少 managed tool 时明确拒绝 `7093-7102`。                                                                    |
| 注册 Prompt Command                  | 缺漏 U2                                 | 没有 `invocations.executeCommand`；本地 Skill 预检会拒绝或误选同名 Skill。                                                                                                                                                                |
| review / agents lean                 | review 有 U3；没有 agents lean 产品入口 | `/review` 仍模板；未检出 `startAgentsLean` 调用。不应把未提供的 UI 能力记作已迁移。来源：`slash/builtin.ts:2651-2661`、adapter 生产调用。                                                                                                 |
| AMA 自然 Workflow                    | 已实现 Host policy 主干                 | 普通 Run authorization 携带 maxAgents/tokenBudget，Host config 承接并发。来源：`runtime-host-adapter.ts:6151-6160,6222-6237`；SDK `SPACE_SDK_SEAMS.md:81-83`。                                                                            |
| 显式 Workflow / generated / rerun    | 缺漏 U1                                 | controller 仍本地 manager + runDir；限额继续保留。                                                                                                                                                                                        |
| 独立外部 Actor                       | 故意保留外部 executor 契约              | `runtime-host-adapter.ts:7194-7237` 通过 Host preflight + `agents.spawn(kind:'external')`；SDK 明确外部 Actor 不绑定 native Provider/tool lease，见 `SPACE_SDK_SEAMS.md:56-58`。                                                          |
| 独立 native Actor                    | 无现有 UI 生产入口                      | 已有 Main callback 类型分支不是调用证明；当前显式 Actor 只创建 external。模型创建的原生后代仍属于 SDK Run 执行域。来源：同上和 `authorizeProductExecution:6078,6156`。                                                                    |
| 手动 compaction                      | 已实现独立授权                          | `compactSession:3919-3950`；`registerCompactionCredentialLease:6436-6474` 限定 operation `session.compact` 与 purpose，finally revoke，不借用 tool lease。                                                                                |
| fallback/classifier/child credential | 已实现 broker 边界                      | `isAuthorizedRunCredentialPurpose:1369-1381` 按 target/purpose 校验；`providers/runtime-credential-broker.ts:16-32` 每次真实请求精确读 Provider。没有从 purpose 推断 child 一定非 Workflow。                                              |
| 共享 settings / CAS                  | 已实现主干                              | `updateSessionSettings:4073-4143` 串行、versioned CAS、无变化不写；`syncSpaceSessionSettings:5314-5376` 有 runtime/revision 栅栏。                                                                                                        |
| Shell execution 合同                 | 已实现可信 Main 特例                    | `real-session.ts:516-548` 将规范 shellExecution 写 Session；`shell-execution.ts:35-86,177-230` 建契约、探 profile、明确降级；SDK `SPACE_SDK_SEAMS.md:150-156` 允许可信 `/runtime` 设置 Shell。                                            |
| permission request/response          | 已实现普通请求；plan 有 U4              | `coder-daemon-projection.ts:497-554`；`runtime-host-adapter.ts:6907-6939` 只回复 Host pending ID，persistent grant 原 suggestionId，revocation 保留 revision。                                                                            |
| Sandbox 能力/设置                    | 已实现既有边界                          | `kodax-sdk-probe.ts:105-177` 检查 v11/host-transaction/native-token-job-v2；`sandbox-controller.ts:323-350` 将 doctor/显式 setup 分开。逐工具实际 containment 由主审核对，不从 permissionMode 推断。                                      |
| Partner / Mock / 显式 legacy         | 故意保留独立执行                        | `real-session.ts:940-1002,1487-1502,2670-2687`；Partner 限制在 `workflow-controller.ts:1385-1392` 有权威门，不能以统一 Coder 迁移删除。                                                                                                   |
| Quick Ask                            | 不能一概当成 inline 豁免                | 当前 `surface==='code' && runtimeSelected` 不排除 ephemeral，`ensureSession:3544-3545` 给临时 tag；临时/转正属于其独立产品生命周期，而非普通输入绕开 Host 的证据。来源：`real-session.ts:823,1487`；`runtime-host-adapter.ts:3534-3545`。 |

## 未证实与需要进一步实测的边界

### 排队后授权恢复与撤回体验

可确认两点：Main 重建时 `resumeSnapshotBindings` 只遍历 `snapshot.runs`，并不遍历 Product `view.queue`；`resumeProductCredentialLeases` 只遍历内存 map。已持久化的 input authorization 又只在重试同一 inputId、steer 目标或已存在 Product Run 恢复时读取。来源：`runtime-host-adapter.ts:5080-5099,6080-6110,6240-6248`。

SDK 明确允许“排队授权失效，消费失败，尚未创建 Run 的输入仍 queued”，客户端应给出撤回/重新提交路径；Space 当前没有调用 `runs.withdrawInput` 的生产路由，其 queued bubble 也只展示等待或失败提示。SDK 消费失败诊断属于 `runtime.input-queue`，不是已失败 Run。来源：SDK `SPACE_SDK_SEAMS.md:54`；SDK `../KodaX/src/sdk-runtime.ts:9846-9849`；Space `runtime-host-adapter.ts:6784-6818`；`apps/desktop/renderer/src/features/session/messages/bubbles.tsx:541-558`；`apps/desktop/electron/ipc/queue.ts:registerQueueChannels` 只有读取。

**尚未证实的具体结果**：若运行中的 Run 用 Provider A，而 after-turn input 已捕获 Provider B 的不同 lease，Main 在消费前重建且队列尚无 Run，是否能自动恢复 B 的 lease，以及最终是否永久显示等待。现有真实 SDK 集成回归只在同一 Session 的活跃 Run/重复输入上恢复，再继续 steer，没有隔离验证 queued-only、不同 lease 和授权消费失败。来源：`runtime-sdk-migration.test.ts:181-242`。这是一项明确的恢复/UX 测试缺口，目前不把未执行的时序反例写成已经复现的缺陷。

### 设置竞争与新增可选字段

Space 有 serial CAS 和 revision 回填；`syncRuntimeSessionSettings` 仍在每次执行边界提交本地 provider/model/effort 等完整快照，并在 CAS 冲突后重读再应用。本文没有构造“另一个客户端在本地快照形成后修改同一字段”的真实竞争，因此不宣称跨客户端最后意图完全无丢失。来源：`real-session.ts:516-548`；`runtime-host-adapter.ts:4118-4143,5314-5376`。

SDK 新的 `planModeEffort` 是可选共享设置键；Space 当前使用自身显式 effort UI，没有读写这个键的独立 UI。缺少该 UI 不是强制新增功能，但不可声称 Space 已展示 SDK 所有设置；若将来写此键，要按 Host `sharedSessionSettings.keys` 能力失败，不能静默降级。来源：已安装 `dist/sdk-runtime.d.ts:1972,1995`；已安装 `docs/CLIENT_CONTRACT.md:129`；Space `real-session.ts:524-537`。

## 未解问题

1. U5 的真实 daemon catalog 正反差已确认；仍需验证 submitted Skill invocation metadata、执行时失效/错误归类。用户已有同名 Skill 的环境可能掩盖路径缺失。该验证可以用本地 Provider fixture，不需要线上模型费用。来源：上述 catalog 原始证据 JSON。
2. U1 要保留的本地历史、saved export/rename/prune 是否全部能用既有 Host API 等价承接，应逐项定界；不能以管理 API 不完全一对一为由继续让普通显式启动留在本地 owner。依据：SDK `SDK_MIGRATION.md:1、7` 与 `ClientWorkflowStartInput`。
3. `/review` 的可编辑草稿是产品选择还是遗漏执行，需要在统一迁移承诺中明确；当前可见参数被忽略是已经确认的实现事实。依据：U3 的 production routing。
4. queued-only 不同 lease 的 Main 重建反例和过期授权撤回/重提体验，尚需专门的真实 SDK 离线回归。依据：上节的实现与覆盖边界。
