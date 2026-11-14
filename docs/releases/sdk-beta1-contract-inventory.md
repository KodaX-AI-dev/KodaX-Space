# beta.1 的全部 SDK 契约变化中，Space 还需要适配哪些？

结论：共享 Host、工作模式、显示/历史、问题、实际执行事实与配置边界大多已有生产接线；但“升级并通过 27 个成品场景”不等于 SDK 所有能力都有 Space UI 或所有迁移组合均已验证。必须区分协议兼容修复、SDK 自动生效的内部修复和可选产品扩展。首次核对发现过时的 Runtime 所有权诊断与旧诊断脚本入口；后续 Claude 报告复核又确认 Workflow 订阅局部故障恢复和 Artifact 扩展加载诊断未接全，见追加节。高级协议创建、独立 LLM 操作和存储维修 UI 是尚未开放的产品范围。证据见下方逐项矩阵，而不是按导出数量宣称完成。

## 核对固定点与权威

- Space 固定点为 `64fcfed3`；依赖精确为 `@kodax-ai/kodax@0.7.97-beta.1`，正式 Registry 的 integrity、实际 Host fingerprint 和成品报告已记录，见 `package.json:59`、`docs/releases/kodax-0.7.97-beta.1-integration.md:5`。
- SDK 源码检查为 `e733e51f98fc5df7538a3dfc2438fed784345b33 chore: release v0.7.97-beta.1`，工作区 clean。2026-11-03 只读对照时，以下四份源码文档与安装包文档在 CRLF→LF 后文本完全相同；本机 `dist/kodax_cli.js` 则不相同，因此安装包与实际 Host 的字节身份始终优先，不能用源码 HEAD 代替已加载产物身份。这也是 SDK 自己要求区分版本、安装及 Host 构建的原因（`node_modules/@kodax-ai/kodax/docs/CLIENT_CONTRACT.md:61`）。
- 下文 `M` = 安装包 `docs/SDK_MIGRATION.md`，`C` = 安装包 `docs/CLIENT_CONTRACT.md`，`S` = 安装包 `docs/SPACE_SDK_SEAMS.md`，`E` = 安装包 `public_docs/sdk/embedder-guide.md`。源码补充文档位于 `C:/Works/GitProj/KodaX-AI/KodaX/docs/`，不会把其历史“未发布”标题当作当前包缺失证明（`M:3`、`M:21`、`M:137`）。
- 原交接覆盖 alpha.11→alpha.12 的 15 大类，以及 beta.1 的默认方法/消费绑定/promotion/原子配置增量。凭证与 Partner 深挖分别见同目录的 `sdk-beta1-credentials-audit.md`、`sdk-beta1-partner-audit.md`；本文件仍将这两类纳入总表，不重复结论。

## 完整契约映射

“已接线”只说明当前实现有真实调用路径；实际回归范围由最后一节限定。

| 类别与 SDK 变化                                          | Space 当前实现证据                                                                                                                                                                                                                                               | 分类与下一步                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 唯一共享 Host、旧 embedded/函数型注入退役             | Main 的默认 factory 调 `ensureKodaXRuntime/connectKodaXRuntime` 连接共享 Host，生产 `runtime-host-adapter.ts:1733`；这是文档允许的可信底层接缝（`M:224`、`M:291`），不是新建私有 Runtime。旧配置会经单 Host 升级，`runtime-host-adapter.ts:1468`。               | 协议必需，已有接线；不要为形式上换函数名称而再引入第二个连接/Session writer。SDK 的 owner-policy 迁移、并发启动退避和指纹自检属内部实现，Space 保持原失败/重试入口（`M:238`、`M:347`）。旧诊断脚本另见下节。                           |
| 2. Main identity、profile、operation authorizer          | 当前服务适配传完整 identity、Host 实际工具目录和 executionBindings，`runtime-host-adapter.ts:6455`、`:6657`；独立 Actor 不借用根 profile，`:6607`。SDK 要求见 `M:33`、`:144`、`:180`。                                                                           | 协议必需，Partner 专项须验证每类请求；不能以单个 input 测试替代 command/probe/workflow/recovery/Actor。                                                                                                                                |
| 3. 工作模式 Agent/Coding/Script 与 AMA/SA                | Partner Session 确认 Agent，`runtime-host-adapter.ts:3679`；底栏 Partner 显示 Agent，Coder selector 与 busy 门禁独立，`BottomBar.tsx:553`、`:2047`、`:2900`。实际模式投影保留可选 effectiveConfig，`runtime/coder-daemon-projection.ts:262`。                    | 协议/UI 必需，已有接线。Session 选择、最后 Run 的实际模式、权限与模型分别呈现；不得用当前 Session 值补旧 Run 的缺失事实（`M:196`、`:300`）。                                                                                           |
| 4. 专家默认 Skill、消费时绑定、steer/recovery            | `runtime-host-adapter.ts:6455` 起的 Main authorizer/resolver；不可变业务证明与原授权恢复由 Partner 专项核查。SDK 规则 `M:28`、`:43`、`:59`。                                                                                                                     | beta.1 新必需项，已实现但需要“当前选择变化/撤销/冷恢复/原 principal”组合验收；详见 Partner 专项，不能机械将所有操作套入 root binding。                                                                                                 |
| 5. Quick Ask 同 Session promotion                        | `runtime/session-promotion.ts:1` 稳定操作身份/丢响应查询，`runtime-host-adapter.ts:4163` 提升后重取，`:4560` 对旧 view 标签作公开 load 核验。SDK 规则 `M:83`。                                                                                                   | 必需，成品已覆盖 Coder 提升/重载；SDK view 元数据失效仍是外部根修，见 `docs/releases/kodax-beta1-promotion-view-handoff.md:3`。Partner 目的地、第二客户端与冷 Host 观察者仍应单列证据。                                                |
| 6. 队列身份/阻断/撤回与副作用未知                        | 接收前完整意图保存在 Main 私有恢复区，`runtime/product-input-intents.ts:45`；显式撤回确认后返回原文，`:117`；队列 UI `messages/QueuedInputRecovery.tsx:7`。SDK 要求保留 admissionError/原 inputId，`M:50`。                                                      | 协议/UI 必需，已接线。旧队列及 Host 已撤回而 Main 尚未 durable 确认的组合崩溃窗口仍需 SDK 持久回执，见 `docs/releases/kodax-beta1-queued-intent-handoff.md:3`，不能宣称全部丢响应已解决。                                              |
| 7. 实际 Run 工具/profile/模型请求事实                    | `runtime/coder-daemon-projection.ts:262`、IPC `channels/runtime.ts:344` 保留 toolScope/modelToolScope；`shell/ExecutionFactsIndicator.tsx:13` 对实际主请求 effort 提示独立展示。SDK 事实规则 `M:196`。                                                           | 必需，已有接线；要验证缺字段、未知、无模型请求的显式 tool Run，以及跨 Run 迟到事件不会污染当前 Run。可执行工具不等于已经批准每次调用。                                                                                                 |
| 8. Provider 原生协议、preset、OAuth/cloud 连接范围       | UI 协议枚举已包括 google/bedrock/mistral/pi，`channels/provider.ts:70`；SDK 配置 normalization 接受六类协议，`user-config.ts:1075`。普通自定义表单仅创建 OpenAI/Anthropic，`CustomProviderForm.tsx:28`；其他协议卡片没有普通 Edit，`ProviderCard.tsx:370`。      | 原有配置可用性属于必需；新增所有原生路线的创建/登录/区域向导属于产品扩展。不能宣传“SDK 新增 preset 就等于 Space 完整配置 UI”。当前 UI 只读高级配置时应明确指引 SDK/CLI/config，而非给错误 API-key 操作（认证 UI 细节由凭证专项判定）。 |
| 9. 高级配置编辑保真                                      | `user-config.ts:967` modeled keys 与 `:996` merge 保留 api/auth/headers/oauthRegistration 等未建模字段；同名模型 descriptor 也保留，`:1022`。`ProviderCard.tsx:370` 阻止非 OpenAI/Anthropic 协议进窄表单。                                                       | 已有保护，不应报告已证实的 native 降格 bug。仍应补一组 public IPC fixture，验证 Responses + OAuth/headers/cloud 元数据经名称/model 编辑后保留，连接变更要求重新批准，不能自动换号。                                                    |
| 10. API-key/auth.json v2、OAuth、native cloud 和 broker  | 当前 file backend、CAS/来源固定、迁移和 Runtime 初始化等由凭证专项逐项列证；`runtime-host-adapter.ts:2521` 先初始化 Provider storage 再连接/开放能力。SDK 规则 `M:517`、`:526`、`:535`、`:620`。                                                                 | 兼容必需；不能把 bundle 仍含 keyring 等同所有新 key 必须走 Keychain，也不能把独立旧迁移测试等同无 Keychain 成品启动已验证。                                                                                                            |
| 11. nativeHistory/canonical Fork/Retry/Rewind            | 生产 fork 由 Host 执行，`runtime-host-adapter.ts:4124`；原文与历史 mutation 用源修订定位，`:3944`。未发现由显示文本生成写入 SDK conversation 的新生产路径。SDK 保真要求 `M:774`。                                                                                | 必需，正常 UI 不需要理解 opaque nativeHistory。需补“nativeHistory+有序thinking/tool+图片→Fork/Retry/Rewind/恢复”的字节保真专项，而不是仅断言可见正文相同。                                                                             |
| 12. History/original、任务报告、流式 token 估算          | Main 按 itemId/source/part 读取原文，`runtime-host-adapter.ts:4532`；Renderer `messages/ProductToolOriginal.tsx:48` 只调用 IPC，不直接开 outputPath。taskResult 中性报告 `messages/bubbles.tsx:987`；`shell/productStreaming.ts:1` 消费 estimatedTokenCount。    | 协议/UI 必需，已接线，最终成品专项覆盖。历史初次读取 Issue 371 仍未关闭，不能用 Host ready 代替内容已加载（`M:273`、`S:107`）。                                                                                                        |
| 13. 普通问题/skip/non_interactive/deadline、Plan 权限    | `runtime-host-adapter.ts:8135` 保留两种取消来源并读精确 pending requestId；完整计划 `features/permission/PermissionModal.tsx:258`，Plan 不批量合并 `permissionBatching.ts:40`。SDK 规则 `M:263`、`S:146`。                                                       | 必需，已接线；普通等待无本地默认答案，权限独立超时。需要保留刷新/断连后同 requestId、Host deadline 和真实 Plan UI 的回归，不能以普通 Skip 代替全部交互组合。                                                                           |
| 14. effort 继承与 requested/sent/verified 分离           | 选项 UI `shell/ModelEffortSelector.tsx:164`；实际事实 `ExecutionFactsIndicator.tsx:13`。SDK 内部根/Worker/Actor/workflow 继承修复见 `M:490`。                                                                                                                    | Space 已消费新只读事实；SDK 内部继承不应由 Space 再算。`verified:false` 不当失败；新拒绝可见、cached-rejection 不重复通知。CLI Ctrl+T 两秒反馈不是强制移植 UI。                                                                        |
| 15. 模型图片能力与上下文硬上限                           | `providers/model-images.ts:1` 模型覆盖 Provider，包括显式 none；`:17` 用统一 resolveProvider；`ipc/provider.ts:540` 读有效 window/output/reasoning/capability。SDK 要求 `M:592`。                                                                                | 必需，已有接线与回归。模型硬上限更新不提高用户默认输出预算；未知能力不猜、拒绝图片保留草稿与旧图。                                                                                                                                     |
| 16. 费用 null/nominal、TTL 分区和报价范围                | SDK `M:483`、`:593`，`LLM_INTEGRATION.md:55`。当前公开 Space session statistics 只取 token/request/tool/context facts，`channels/statistics.ts:15`、`:98`；UI 显示 token 而无金额，`ContextWindowIndicator.tsx:650`。                                            | 目前未启用货币费用产品 UI，不能称全部新费用能力已展示，但也没有将 null 金额改成零的现有金额 UI。后续做费用必须端到端保留 null/knownCostSubtotal/nominal/unknown/TTL/maxPricedInputTokens，不能本地按 token 猜账单。                    |
| 17. 目录刷新、WebSocket、显式 Google cache               | SDK `LLM_INTEGRATION.md:61`、`:65`、`:69` 定义可信 scope/owner/no replay；Space 普通模型目录使用安装包 JSON，`providers/catalog.ts:196`，能力按需解析而非额外 generation 探测，`ipc/provider.ts:520`。                                                           | 新操作为可选产品能力；SDK 协议内部默认 SSE 及声明式 cache 直接生效。若开放手动目录刷新/WebSocket/cache管理，应单独产品设计，不在“版本适配”中强行加自动探测、轮询或认证绕过。                                                           |
| 18. 独立 images/classify/deferred/media                  | SDK `/llm` 五个 typed operation 与 `/media` publish 区别见源码 `docs/LLM_OPERATIONS.md:3`、`:54`、`:62`。对 Space `apps/desktop` 和 IPC 搜索未找到五项独立操作调用。                                                                                             | 未接入独立产品入口，不等于升级不兼容。属于可选扩展；如做后台生成，要持久 reference、同 scope 重新授权、远端取消单独表达、usage 去重、完整最终图片才登记产物。                                                                          |
| 19. Skills/.agents/learned skill/MCP/Memory/A2A/workflow | Skill/command Host catalog `runtime-host-adapter.ts:7896`；Memory `memory-service.ts:428` 返回 Host controller；MCP生产分支 `ipc/mcp.ts:43`、`:85` 调 Host；A2A Actor `runtime-host-adapter.ts:7973`、`:8045`；Workflow `:7722`。SDK目录和学习内部补齐 `M:588`。 | 已有核心接线，SDK 内部 discovered/authorized/hook/outcome 规则直接生效。不要把 Root mailbox event 再实现为第二 Actor followup 驱动（`E:6517`）。MCP capability 旧文案需修；Memory/UI诊断标签也要按当前真实路径核对。                   |
| 20. 配置原子性、应用边界、损坏文件                       | 配置复合改名用 SDK lock/read/atomic write，`user-config.ts:390`；Main有效配置 `runtime-host-adapter.ts:7845`；Settings显示四类 application，`SettingsModal.tsx:1088`。SDK typed错误和有限短暂 Windows 重试见 `M:100`。                                           | 必需，beta.1 接线已有。保存成功不当活跃 Run已生效；锁忙可有限重试，损坏读取/未知提交不盲重试，不重置账号。具体错误 UI/Keychain 文案归凭证专项。                                                                                        |
| 21. 统计 v2/partial/投影代次 cursor                      | `runtime-host-adapter.ts:4013` 读 Host statistics，`runtime/execution-facts-page.ts:1` 在只读分页 conflict 后重取首页并返回 reset；IPC保留 coverage/issues，`channels/statistics.ts:98`，UI `ContextWindowIndicator.tsx:780`。                                   | 必需，已接线。SDK lane/旧导入属于内部修复；stats不授权重执行。需覆盖 Host重启/淘汰/并发lane导致 cursor conflict、unknown工具执行与迟到结果隔离。                                                                                       |
| 22. 崩溃恢复、owner、标题、连续失败计数                  | `runtime-host-adapter.ts:7037` 只恢复原 runId，不返回不同 Run；相同主请求/Host身份门禁贯穿；SDK内部修复和不可安全重放要求 `M:670`、`:768`。                                                                                                                      | SDK内部数据修复直接生效，Space必须保留 unknown 与恢复拒绝，不另存空历史。真实客户异常关机、未知外部副作用不能仅靠本机离线测试宣称已解决。                                                                                              |
| 23. doctor/存储维修/锁/工具输出GC                        | 新可信维修入口明确不属于 Renderer/模型/Product Client，`M:752`；Space未发现 inspect/apply/confirmStorageRepair 或全局工具原件GC调用。                                                                                                                            | 管理员维修与容量UI可选；不自动确认外部效果、不按TTL删原件、不按锁年龄清理。旧修复脚本保留版本门禁，避免将历史0.7.82工具当beta.1支持。                                                                                                  |
| 24. 生命周期/完整退出/升级保护                           | Main 使用持久化 client exit settlement，`runtime-host-adapter.ts:8242`；SDK要求 acceptance/cleanup/exact-exit/unknown区分，`C:83`；正式包6项 lifecycle 已留证，`docs/releases/kodax-0.7.97-beta.1-integration.md:33`。                                           | 必需，已有接线。普通断连不等于停Host；更换安装包不能强停其他客户端；NSIS真实覆盖安装和Linux/Kylin/macOS真机仍是验证缺口。                                                                                                              |
| 25. Windows sandbox/无感回退/可信激活                    | `ipc/sandbox.ts:3` 接入SDK控制器；`sandbox-controller.ts:44` 使用doctor/guidance公开接口。普通调用不触发setup，手动可信设置界面接入；SDK策略 `M:584` 与 `S` sandbox章节。                                                                                        | 必需，保留SDK normal-permission-policy自动回退，不新增Node安装gate。Windows真实激活、断电installing恢复、Kylin无Node环境的成品验收须分别留证。                                                                                         |
| 26. 完整dist/worker/schema/native/Artifact               | `scripts/pack.mjs:85` 精确校验Registry依赖；`scripts/smoke-pack.mjs:835` worker、`:857` JSON/schema、`:986` native、`:1574` 精确Host退出、`:2073` Artifact证据。SDK资源规则 `M:94`、`:615`、Artifact规则`:472`。                                                 | 分发必需，当前Windows成品已过门禁。Artifact实际源格式/Word-WPS保真、跨平台renderer以及自然任务视觉质量仍单独验收，ready或PNG哈希不证明质量通过。                                                                                       |
| 27. PowerShell profile变化/启动性能                      | SDK扩展exec改为 NoProfile/NonInteractive，`M:7`；旧history诊断脚本仍默认私有Runtime，`scripts/diagnostics/session-startup-history.mjs:162`。                                                                                                                     | SDK内部执行改动直接生效；需查Space内置扩展/helper是否依赖隐式profile，并迁移诊断脚本后再评估Issue371。不得用前轮CLI512历史性能替代Space首帧/首次历史读取。                                                                             |

## 确认的小缺口与最小修改建议

1. **Runtime MCP 所有权文案错误，P2。** `runtime-host-adapter.ts:1912` 仍称“Space owns server processes and logs”；但当前运行路径 `ipc/mcp.ts:43`、`:85` 与 adapter `:7874` 已明确使用 Host。建议只更正诊断能力owner/status/detail，顺带核查 memory/session/catalog 的历史措辞；不因此重写正常MCP执行链。验收：Runtime选择时诊断与Host实际路径一致，MCP stop仍不伪装本地可停共享服务，旧fixture分支仍明确标为legacy。
2. **历史性能诊断脚本不兼容当前SDK，P2。** `scripts/diagnostics/session-startup-history.mjs:162` 使用无 mode 的 createKodaXRuntime+inline，按 `M:229` 会报 runtime_host_migration_required；这使该工具不能作为beta.1恢复性能证明。建议改成隔离home/storage的共享Host测试，改用公开边界可观察指标；如原猴补fs只能观察进程内读取，应明确保留为历史基准，另建Host外部计时，不能强求跨进程沿用原计数。验收：当前正式包可运行、精确关闭独占测试Host、无用户数据触碰，并分别记录Host ready与history/UI ready。
3. **0.7.82 repair脚本是历史工具而非本版可用能力，P2文档。** `scripts/repair-kodax-session-history.mjs:245` 的版本门禁先于任何修复，当前beta.1会安全拒绝，不能描述为已经在beta.1中执行了embedded修改。建议保留拒绝并明确标注历史用途；需要新版维修时另接 `M:752` 的可信inspect/apply/confirm流程，不机械去掉版本门禁。验收：beta.1 dry-run/apply都在写前拒绝，帮助说明准确；若另做新版，原件/备份/fence/unknown边界必须完整。

## 必须补的验证，不据静态接线宣称完成

- **发布包升级组合**：真实旧版安装→新成品、无Keychain机器、旧存储选择/密钥迁移/墓碑、旧Host忙碌与安全空闲升级、重启后的原账号；凭证具体方案由专项记录列出。当前成品记录明确没有操作NSIS向导或替换真实用户安装（`docs/releases/kodax-0.7.97-beta.1-integration.md:48`）。
- **高级历史保真**：在隔离fixture里携带nativeHistory、不同顺序thinking/tool、附件和原文文件，走公开Fork/Retry/Rewind/冷恢复，对canonical/native字段和原文分页进行断言；现有可见文本/工具名回归不足以独立证明全部opaque片段保留（`M:774`、Space `runtime-host-adapter.ts:4124`）。
- **完整授权组合**：同Session after-turn/steer/redirect，显式Skill卸载、普通redirect默认变化、Host换代恢复原专家/连接器/账号/工具上限、command/tool/probe/workflow/独立Actor隔离。SDK补审曾证明这些相邻分支能各自漏测（`M:59`、`S:49`），不能由16专家首轮默认方法遍历替代。
- **边界状态**：缺失Run实际字段、unknown任务报告、stats partial+issues、cursor conflict reset、配置提交后释放锁失败导致未知结果、权限Plan完整正文与普通问题刷新后pending，分别断言UI不补造完成/应用/成功（`M:114`、`:196`、`:768`，Space `ContextWindowIndicator.tsx:780`）。
- **平台与服务**：Kylin/Linux无Node、窗口按钮和沙箱回退、Windows sandbox安装中断/ACL/精确退出，macOS/ARM打包native+Artifact；实际OAuth/云账号/订阅模型权益/缓存命中/账单需对应环境，不用离线fixture替代（SDK源码 `docs/LLM_INTEGRATION.md:73`，本轮成品验收限制 `docs/releases/kodax-0.7.97-beta.1-integration.md:56`）。

## 可选产品能力，不能夹在兼容升级中默认为需求

1. 更多协议、preset、OAuth/cloud连接创建/登录向导；当前可读取/执行外部配置不等于有完整向导。最小第一步是明确展示实际adapter/API、认证类型和可编辑范围，保留未知高级字段，见 `ProviderCard.tsx:370`、`user-config.ts:996`。
2. 金额/名义费用与TTL报价展示；当前Space仅token统计，没有必须补的旧金额错误，但若立项必须尊重nullable/nominal/partial，见 `M:487`、`channels/statistics.ts:98`。
3. 手动远端模型目录刷新、显式Google cache管理、WebSocket高级选项；需要可信scope与owner生命周期，不默认自动探测，见源码 `docs/LLM_INTEGRATION.md:61`。
4. 生图、分类和后台Responses任务；需要独立operation UI、durable reference与真正远端取消，不复用普通聊天pending工具执行，见源码 `docs/LLM_OPERATIONS.md:3`、`:62`。
5. 本机管理员存储诊断/维修；可以先只读导出诊断，不向Renderer/model开放“已核对副作用”的自动confirm，见 `M:752`。

## 2026-11-03 Claude 报告追加复核

本节仅用源码/随包契约核对该外部报告的断言，没有运行新复现、测试或 build。原报告本身不是事实依据；SDK 的内部服务故障、transport 断连、Run 终态及可选 Artifact 能力状态分别处理。

### Workflow 订阅：缺少局部错误恢复，P2 确认

1. Space 在 `runtime-host-adapter.ts:2644` 使用 `workflows.subscribe({}, listener)`，随后只等待 `ready`。这个 `ready` 能把初始注册失败传给初始化 catch，但已成功注册后的故障不能再次改变已结算的 Promise；当前没有 `onError`，只会得到 SDK 自身日志。SDK 已发布契约明确要求报告观察错误，重订阅→等待 ready→再读 snapshot/list/get（随包 `CLIENT_CONTRACT.md:200-206`）。
2. 并非所有故障都被连接重建覆盖。SDK `src/runtime-daemon/client.ts:2383-2414` 的 `subscription.error` 分支只关闭该订阅、释放其远端注册并调用 `onError`/诊断；它不主动断开 transport。Space 的 `connection.subscribe` 仅对 `state:'disconnected'` 调用 `handleConnectionLoss`（`runtime-host-adapter.ts:2630`），所以一个仍 connected 的 Host 内部订阅失败不会触发已有重连。SDK 实现用 `reportErrors` 协议通知而不是虚构 Run 失败（随包 `CLIENT_CONTRACT.md:206`）。
3. 真实 transport 断开时，Space 确实会关闭旧 workflow 订阅并在新初始化时重建，不能说完全没有恢复（adapter `:2852-2862`、`:2642`）；但仍缺 `ready` 后的快照重同步。当前 App 仅在主 effect 初始时 `workflow.list` 播种，依赖项没有 Runtime ready revision（`renderer/src/App.tsx:904`、`:975`）；管理页只在项目变化/用户刷新时重读（`WorkflowManagementPanel.tsx:146-163`）。这不是对“故障期间已完成且之后没有新事件”的等价补偿。
4. 手动 `workflow.list/get` 仍可读取真实状态（adapter `:7754-7766`），并非工作流停止执行或持久结果丢失。IPC `workflow.ts:49-88` 还会在 Host 读取失败时返回本地旧 run 集合，因此修复观察状态时需要保留可见的 stale/unavailable 原因，不能把 fallback 列表当作 Host 已同步事实。

最小方案：

- 在现有 workflow 订阅接入 `onError`，保持一份按当前 Runtime/订阅 generation 栅栏约束的恢复任务。初始 `ready` 拒绝保留现有初始化裁决；已就绪后的局部观察错误只影响 workflow 观察健康，不把其他 Session/Run 标成 Provider/Runtime 失败，也不为此先断开整个共享连接。
- 同一 generation 的重复错误合并；先关闭旧订阅，再建立唯一新订阅，等待新 `ready` 后通过 Host `list/get` 重建快照。读取期间新通知只标记受影响 run 为待刷新；用 generation/读取 token 及再读机制避免旧快照覆盖较新事件，不编造 SDK 没有提供的 revision。
- 快照恢复走状态同步通道或显式 invalidation→read，不伪发 `workflow_started/workflow_finished` 来填洞，防止会话通知、交付或 Artifact 桥接重复。已有 runId/sessionId/surface/projectRoot 归属保持；有界 list 未返回的记录不能直接当成已删除/已完成。
- 复用已有有界退避思路，局部重试不重放 start/pause/resume/stop 等 mutation；关闭窗口、完整退出开始、Runtime 替换/断连、回滚门禁时取消恢复 timer/task，关闭迟到握手的订阅并丢弃退役 generation 结果。不要留无界永久定时器，也不要让 workflow 故障占据会话历史/普通输入的恢复队列。

验收：在仍 connected 的真/假 Host 注入握手前失败、ready 后 `subscription.error`、连续重复错误；分别检查仅一个活跃订阅、一个恢复任务、错误可见、重新 ready 后 list/get 必须发生。故障窗口内完成的工作流在没有后续 event 时仍恢复终态；快照读取期间的并发进度不回滚。再测 transport 重连/Host 换代、退出中取消、旧订阅迟到成功、另一个 Session 持续正常输入、其他客户端工作不受影响，且不存在重复模型请求、重复start/stop、重复通知/产物登记。

### Artifact 扩展：局部加载失败诊断未展示，P2 确认但缩窄原断言

1. `skill/space-builtins.ts:33-37` 刻意把 Skill entry 与 Artifact entry 分开，避免没有可用 Node worker 时让 Skills/input/history 一起失败。安装后的检查只核验 Skill entry 被加载（`:58`）；catch 仅日志并允许后续请求重试（`:66-75`）。因此不能把“Artifact extension失败”改为整个 SDK/Runtime 启动失败。
2. Host 确实保存可查询的加载错误：`catalog.extensions()` 返回 `diagnostics`（SDK `src/sdk-runtime.ts:14062-14074`），其中 `failures` 包含 stage/target/message/occurredAt/source（SDK `packages/coding/src/extensions/types.ts:141-156`）。Extension loader 在失败时记录该事实（`extensions/runtime.ts:456-465`）。Space 的现有 `catalog.extensions()` 调用只用 loaded paths 或 tools 判定注册/命令可用，未消费 `failures`（Space `space-builtins.ts:58`、adapter `:7906-7922`）。
3. “没有任何UI可见诊断”的表述过宽：当前 Settings 已显示集成 domain.diagnostic（`SettingsModal.tsx:1116-1190`），Main也按周期读取 daemon integration health（adapter `:3386-3455`）。但这个状态不是所有扩展加载错误的等价投影：SDK 热更新回调调用 `reconcileExtensions`（`src/integration-hot-reload.ts:92-104`），后者对单个扩展失败 catch 并累计 retained，不向配置 controller 抛错（`extensions/runtime.ts:555-579`）。因此有效 extensions.json 仍可能 healthy，而某个 Artifact entry/tool 缺失。
4. Space 扩展包设置页展示安装包 registry 自身状态，不等于 SDK Host extension catalog（`features/extensions/extensionCatalog.ts:19-37`）；当前底栏 `/extensions` 分支甚至读取 `mcp.discover` 展示 MCP 服务（`BottomBar.tsx:1676-1711`）。这些入口均不能据名称当作已展示 SDK load failures。

最小方案：从当前 Host 的公开 catalog 读取当前 loaded entry/tools 与有界脱敏 `diagnostics.failures`，在现有 Runtime/扩展诊断位置分别显示 Space builtin Skills 与 Artifact 的 ready/degraded/unavailable。保留已加载的 last-known-good；历史失败记录不自动把已恢复能力永久判为失败。对于缺前置条件或加载错误提供事实原因和可信修复入口，在安全空闲时重读/重载或重启 Host 后再核验实际工具，不在 Renderer 自行回退渲染或自动安装 Node。只报告受影响的能力，正常输入、Skills、会话历史、其他扩展及其他 Session 继续可用；真正资源缺失/篡改的打包门禁仍失败，不被“可选”掩盖。

验收：有效配置+Artifact entry语法/导入失败、缺 worker/真实Node、Skill entry独立成功、一个失败一个成功、last-known-good reload失败后继续可用、修复后状态回正、Host换代/迟到错误不污染当前实例；UI不显示误导的整体Provider错误。通过真实公开 `catalog.extensions` 校验错误与当前工具，再验证UI，而不是仅断言写了日志。此处新增的是局部可观测性与恢复，不把Artifact质量/Word-WPS保真或无Node渲染能力视作已完成。

### 凭证存储文案补充清单

以下引用确有旧用语，实施由凭证切片统一处理；应区分模型 Provider 的 file 主路径、旧读取迁移与仍使用平台后端的连接器，不能全仓机械替换 Keychain：

- `README.md:82,203`、`README_CN.md:82,190` 仍将模型Key概括为优先OS keychain；`docs/HLD.md:50,63,128,441,634,695` 的架构/威胁缓解需按实际 file+legacy+connector 分开更新。
- `BottomBar.tsx:1619` doctor 文本写 `keychain = ...`，即使新接口返回 `file`；`ProviderCard.tsx:50` 在缺少configuredSource且configured=true时兜底keychain，`:491` 的旧source分支应保留旧协议兼容但不能据未知来源宣称当前用Keychain。
- `SettingsModal.tsx:2823-2830` 对非memory统一显示Keychain，`:2973` 存储说明同样旧；`:2878` 的“新Key仅内存、重启丢失”警告在当前 `provider-storage.ts:282` 永远返回file的成功路径不可到达，存储初始化失败则IPC报错，不会返回memory。应展示实际file错误，不能继续以旧警告作为新存储故障说明。
- `renderer/src/App.tsx:736`、`electron/main.ts:2630`、`electron/settings/store.ts:11` 的旧注释误称当前所有模型Key均从keychain注入；它们影响维护者理解，不是独立运行时缺陷。IPC兼容字段名 `keychainBackend` 可以暂留，不必为修文案强制改所有调用者。

## 未证实

- 未发现普通UI当前会把高级 native 协议直接降格为OpenAI的证据：已有协议编辑guard，未建模字段merge保留。不能将“表单只有两个选项”直接写成数据损坏bug。Responses等同属OpenAI协议的高级字段仍需公开IPC专项验证，静态保留代码不是实际全链路证明（`ProviderCard.tsx:370`、`user-config.ts:996`）。
- 本次仅做只读源码/声明/既有证据分析，没有运行新测试、真实账号、安装向导或跨平台机器。原27项成品证据仅属于其明确覆盖的路径（`docs/releases/kodax-0.7.97-beta.1-integration.md:27`）。

## 未解问题

- 本轮产品方案是否扩展更多Provider连接向导、金额、独立LLM操作和只读维修诊断，应分别决定优先级；不是协议事实缺失，不应挡住已必要的兼容修复。
- Issue371真实客户会话首帧/首历史延迟和真实异常关机后的恢复仍需隔离客户样本及对应环境的量测；已知SDK view缓存与旧队列 durable receipt两项需SDK后续发布根修，不能以Space保护宣布关闭（本轮两个SDK交接文件）。
